import type {
  ProjectFileKind,
  ProjectFileVersion,
  ProjectFileVersionPromptSource,
  ProjectFileVersionSource,
} from '@open-design/contracts';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { isSafeId, kindFor, mimeFor, resolveProjectDir, validateProjectPath } from './projects.js';

const VERSION_ROOT = '.file-versions';
const VERSION_MANIFEST = 'manifest.json';
const VERSION_ID_RE = /^[A-Za-z0-9_-]+$/u;

type VersionPromptSource = ProjectFileVersionPromptSource;
type VersionSource = ProjectFileVersionSource;

interface VersionEntry {
  id: string;
  fileName: string;
  version: number;
  label: string;
  createdAt: number;
  source: VersionSource;
  prompt: string | null;
  promptSource?: VersionPromptSource;
  restoreFromVersionId?: string;
  size: number;
  mime: string;
  kind: ProjectFileKind;
  contentPath: string;
}

interface CreateProjectFileVersionOptions {
  prompt?: string | null;
  promptSource?: VersionPromptSource;
  source?: VersionSource;
  label?: string | null;
  restoreFromVersionId?: string;
}

function codedError(message: string, code: string): Error & { code: string } {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

function errorCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err
    ? String((err as { code?: unknown }).code)
    : undefined;
}

function fileVersionKey(fileName: string): string {
  return createHash('sha256').update(fileName).digest('hex').slice(0, 24);
}

function versionRootFor(projectsRoot: string, projectId: string, fileName: string): string {
  if (!isSafeId(projectId)) throw new Error('invalid project id');
  return path.join(projectsRoot, projectId, VERSION_ROOT, fileVersionKey(fileName));
}

function normalizePrompt(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeContentPath(value: unknown, id: string): string {
  if (typeof value === 'string' && /^[A-Za-z0-9._-]+\.html$/u.test(value) && !value.includes('..')) {
    return value;
  }
  return `${id}.html`;
}

function normalizeVersionNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePromptSource(value: unknown): VersionPromptSource | undefined {
  return value === 'message' || value === 'project' || value === 'manual' || value === 'restore'
    ? value
    : undefined;
}

function normalizeVersionSource(value: unknown): VersionSource | undefined {
  return value === 'ai' || value === 'manual' || value === 'restore' ? value : undefined;
}

function inferVersionSource(
  value: unknown,
  promptSource?: VersionPromptSource,
  restoreFromVersionId?: string,
): VersionSource {
  const normalized = normalizeVersionSource(value);
  if (normalized) return normalized;
  if (restoreFromVersionId || promptSource === 'restore') return 'restore';
  if (promptSource === 'manual') return 'manual';
  return 'ai';
}

function normalizeManifestEntry(raw: Record<string, unknown>, fileName: string, index: number): VersionEntry | null {
  const id = raw.id;
  if (typeof id !== 'string' || !VERSION_ID_RE.test(id)) return null;
  const version = normalizeVersionNumber(raw.version, index + 1);
  const promptSource = normalizePromptSource(raw.promptSource);
  const restoreFromVersionId =
    typeof raw.restoreFromVersionId === 'string' && VERSION_ID_RE.test(raw.restoreFromVersionId)
      ? raw.restoreFromVersionId
      : undefined;
  const entry: VersionEntry = {
    id,
    fileName,
    version,
    label: typeof raw.label === 'string' && raw.label.trim() ? raw.label : `Version ${version}`,
    createdAt: normalizeVersionNumber(raw.createdAt, Date.now()),
    source: inferVersionSource(raw.source, promptSource, restoreFromVersionId),
    prompt: normalizePrompt(raw.prompt),
    size: normalizeVersionNumber(raw.size, 0),
    mime: typeof raw.mime === 'string' ? raw.mime : mimeFor(fileName),
    kind: (typeof raw.kind === 'string' ? raw.kind : kindFor(fileName)) as ProjectFileKind,
    contentPath: normalizeContentPath(raw.contentPath, id),
  };
  if (promptSource) entry.promptSource = promptSource;
  if (restoreFromVersionId) {
    entry.restoreFromVersionId = restoreFromVersionId;
  }
  return entry;
}

function normalizeManifest(raw: unknown, fileName: string): VersionEntry[] {
  if (!raw || typeof raw !== 'object') return [];
  const entries = Array.isArray((raw as { entries?: unknown }).entries)
    ? (raw as { entries: unknown[] }).entries
    : [];
  return entries.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return [];
    const normalized = normalizeManifestEntry(entry as Record<string, unknown>, fileName, index);
    return normalized ? [normalized] : [];
  });
}

function assertProjectAvailable(projectsRoot: string, projectId: string, metadata?: unknown): void {
  resolveProjectDir(projectsRoot, projectId, metadata);
}

async function readVersionManifest(projectsRoot: string, projectId: string, fileName: string): Promise<VersionEntry[]> {
  try {
    const raw = await readFile(path.join(versionRootFor(projectsRoot, projectId, fileName), VERSION_MANIFEST), 'utf8');
    return normalizeManifest(JSON.parse(raw) as unknown, fileName);
  } catch (err) {
    if (errorCode(err) === 'ENOENT') return [];
    throw err;
  }
}

async function writeVersionManifest(projectsRoot: string, projectId: string, fileName: string, entries: VersionEntry[]): Promise<void> {
  const root = versionRootFor(projectsRoot, projectId, fileName);
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, VERSION_MANIFEST), JSON.stringify({
    schemaVersion: 1,
    fileName,
    entries,
  }, null, 2));
}

function publicVersion(entry: VersionEntry, currentId: string | null): ProjectFileVersion {
  const version: ProjectFileVersion = {
    id: entry.id,
    fileName: entry.fileName,
    version: entry.version,
    label: entry.label,
    createdAt: entry.createdAt,
    source: entry.source,
    prompt: entry.prompt,
    size: entry.size,
    mime: entry.mime,
    kind: entry.kind,
    current: currentId === entry.id,
  };
  if (entry.promptSource) version.promptSource = entry.promptSource;
  if (entry.restoreFromVersionId) version.restoreFromVersionId = entry.restoreFromVersionId;
  return version;
}

function currentVersionId(entries: VersionEntry[]): string | null {
  return entries.at(-1)?.id ?? null;
}

function nextLabel(version: number, restoredFrom?: VersionEntry | null): string {
  if (!restoredFrom) return `Version ${version}`;
  return Number.isFinite(restoredFrom.version)
    ? `Version ${version} · restored from v${restoredFrom.version}`
    : `Version ${version}`;
}

function validateUserFileName(fileName: string): string {
  const safeName = validateProjectPath(fileName);
  if (isProjectFileVersionPath(safeName)) {
    throw codedError('file not found', 'ENOENT');
  }
  return safeName;
}

export function isProjectFileVersionPath(raw: unknown): boolean {
  const value = String(raw ?? '').replace(/\\/g, '/');
  return value.split('/').filter(Boolean).includes(VERSION_ROOT);
}

export async function listProjectFileVersions(
  projectsRoot: string,
  projectId: string,
  fileName: string,
  metadata?: unknown,
): Promise<ProjectFileVersion[]> {
  const safeName = validateUserFileName(fileName);
  assertProjectAvailable(projectsRoot, projectId, metadata);
  const entries = await readVersionManifest(projectsRoot, projectId, safeName);
  const currentId = currentVersionId(entries);
  return entries.map((entry) => publicVersion(entry, currentId));
}

export async function readProjectFileVersion(
  projectsRoot: string,
  projectId: string,
  fileName: string,
  versionId: string,
  metadata?: unknown,
): Promise<{ version: ProjectFileVersion; content: string }> {
  const safeName = validateUserFileName(fileName);
  const safeVersionId = String(versionId || '').trim();
  if (!safeVersionId || !VERSION_ID_RE.test(safeVersionId)) {
    throw codedError('version id required', 'EINVAL');
  }
  assertProjectAvailable(projectsRoot, projectId, metadata);
  const entries = await readVersionManifest(projectsRoot, projectId, safeName);
  const currentId = currentVersionId(entries);
  const entry = entries.find((item) => item.id === safeVersionId);
  if (!entry) {
    throw codedError('version not found', 'ENOENT');
  }
  const content = await readFile(path.join(versionRootFor(projectsRoot, projectId, safeName), entry.contentPath), 'utf8');
  return {
    version: publicVersion(entry, currentId),
    content,
  };
}

export async function createProjectFileVersion(
  projectsRoot: string,
  projectId: string,
  fileName: string,
  content: string,
  options: CreateProjectFileVersionOptions = {},
  metadata?: unknown,
): Promise<ProjectFileVersion> {
  const safeName = validateUserFileName(fileName);
  assertProjectAvailable(projectsRoot, projectId, metadata);
  const root = versionRootFor(projectsRoot, projectId, safeName);
  await mkdir(root, { recursive: true });
  const entries = await readVersionManifest(projectsRoot, projectId, safeName);
  const restoredFrom = typeof options.restoreFromVersionId === 'string'
    ? entries.find((entry) => entry.id === options.restoreFromVersionId) ?? null
    : null;
  const now = Date.now();
  const version = entries.reduce((max, entry) => Math.max(max, Number(entry.version) || 0), 0) + 1;
  const id = randomUUID();
  const contentPath = `${String(version).padStart(4, '0')}-${id}.html`;
  const text = String(content ?? '');
  const entry: VersionEntry = {
    id,
    fileName: safeName,
    version,
    label: typeof options.label === 'string' && options.label.trim()
      ? options.label.trim()
      : nextLabel(version, restoredFrom),
    createdAt: now,
    source: inferVersionSource(options.source, options.promptSource, options.restoreFromVersionId),
    prompt: normalizePrompt(options.prompt),
    size: Buffer.byteLength(text),
    mime: mimeFor(safeName),
    kind: kindFor(safeName) as ProjectFileKind,
    contentPath,
  };
  if (options.promptSource) entry.promptSource = options.promptSource;
  if (typeof options.restoreFromVersionId === 'string' && VERSION_ID_RE.test(options.restoreFromVersionId)) {
    entry.restoreFromVersionId = options.restoreFromVersionId;
  }
  await writeFile(path.join(root, contentPath), text);
  const nextEntries = [...entries, entry];
  await writeVersionManifest(projectsRoot, projectId, safeName, nextEntries);
  return publicVersion(entry, id);
}

export async function ensureCurrentProjectFileVersion(
  projectsRoot: string,
  projectId: string,
  fileName: string,
  content: string,
  options: CreateProjectFileVersionOptions = {},
  metadata?: unknown,
): Promise<ProjectFileVersion | null> {
  const safeName = validateUserFileName(fileName);
  if (!/\.html?$/i.test(safeName)) return null;
  assertProjectAvailable(projectsRoot, projectId, metadata);
  const entries = await readVersionManifest(projectsRoot, projectId, safeName);
  const text = String(content ?? '');
  const latest = entries.at(-1);
  if (latest?.contentPath) {
    try {
      const prior = await readFile(path.join(versionRootFor(projectsRoot, projectId, safeName), latest.contentPath), 'utf8');
      if (prior === text) return publicVersion(latest, latest.id);
    } catch (err) {
      if (errorCode(err) !== 'ENOENT') throw err;
    }
  }
  return createProjectFileVersion(projectsRoot, projectId, safeName, text, options, metadata);
}

export async function getProjectFileVersionRootStats(
  projectsRoot: string,
  projectId: string,
  fileName: string,
  metadata?: unknown,
): Promise<{ root: string; entries: string[]; mtime: number }> {
  const safeName = validateUserFileName(fileName);
  assertProjectAvailable(projectsRoot, projectId, metadata);
  const root = versionRootFor(projectsRoot, projectId, safeName);
  const entries = await readdir(root).catch(() => []);
  const st = await stat(root).catch(() => null);
  return { root, entries, mtime: st?.mtimeMs ?? 0 };
}
