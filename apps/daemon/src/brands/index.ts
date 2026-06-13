// Brand engine — public API consumed by brand-routes.ts.
//
// A "brand" = brand metadata (brand.json + meta.json under
// `<brandsRoot>/<id>/`) PLUS a generated user design system. Extraction is now
// AGENT-DRIVEN, not an in-place deterministic pipeline:
//
//   1. startBrandExtraction — reserve the brand record, create a backing
//      `brand` project with the target site open in an in-app browser tab, and
//      seed a pending prompt that walks an agent through the full extraction
//      chain (measure → synthesize → build the design system). The web/CLI
//      caller navigates in and auto-sends, so the agent runs the extraction
//      live in front of the user (who can clear anti-bot walls by hand).
//   2. finalizeBrand — once the agent has written `brand.json` (+ BRAND.md,
//      logos, fonts) into the project, validate the kit, derive tokens +
//      brand-system artifacts, and register the `user:<id>` design system so
//      selecting the brand in the composer reuses the EXISTING designSystemId
//      apply flow (no parallel brandId path).

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import type {
  Brand,
  BrandDetailResponse,
  BrandFinalizeResponse,
  BrandMeta,
  BrandSummary,
  ProjectMetadata,
} from '@open-design/contracts';

import {
  createUserDesignSystem,
  deleteUserDesignSystem,
  linkUserDesignSystemProject,
} from '../design-systems.js';
import {
  getProject,
  insertConversation,
  insertProject,
  setTabs,
  updateProject,
} from '../db.js';
import { readProjectFile, resolveProjectDir, writeProjectFile } from '../projects.js';
import { brandGuideMd, brandToDesignMd } from './design-md.js';
import { brandSystemDir, rebuildSystem } from './system.js';
import { extractJsonBlock, validateBrand } from './validate.js';
import { BRAND_KIT_FILE, writeBrandKitPreview } from './kit-render.js';
import {
  createBrandDir,
  deleteBrandDir,
  listBrandIds,
  newBrandId,
  patchMeta,
  readBrand,
  readBrandGuide,
  readMeta,
  resolveBrandFile,
  writeBrand,
  writeBrandGuide,
} from './store.js';

/** The in-app browser tab id the extraction project opens to the target site.
 *  Matches the web `FileWorkspace` BROWSER_TAB_PREFIX numbering. */
const BRAND_BROWSER_TAB_ID = '__browser__:1';

export type {
  ColorCandidate,
  FontCandidate,
  LogoCandidate,
  PrefetchResult,
} from './prefetch.js';
export { brandFromMaterial } from './provisional.js';
export { brandToDesignMd, brandGuideMd } from './design-md.js';
export { extractJsonBlock, validateBrand } from './validate.js';

export interface StartBrandExtractionOptions {
  url: string;
  brandsRoot: string;
  projectsRoot: string;
  /** Skills root so the seeded `brand.html` can be rendered from the bundled
   *  brand-extract template. */
  skillsRoot: string;
  db: Parameters<typeof insertProject>[0];
  randomId?: () => string;
}

export interface StartBrandExtractionResult {
  id: string;
  projectId: string;
  conversationId: string;
  sourceUrl: string;
}

/** Normalize a user-typed URL: prepend https:// when no scheme is present;
 *  reject anything that isn't http(s). Returns null when unusable. */
function normalizeUrl(raw: string): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return parsed.href;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
}

/**
 * Reserve a brand and stand up the agent-driven extraction project. Throws on
 * an invalid URL (the route maps that to a 400). The caller navigates into the
 * returned project and auto-sends the seeded prompt to start the agent.
 */
export async function startBrandExtraction(
  opts: StartBrandExtractionOptions,
): Promise<StartBrandExtractionResult> {
  const url = normalizeUrl(opts.url);
  if (!url) throw new Error('Enter a valid http(s) website URL.');

  const { brandsRoot, projectsRoot, skillsRoot, db, randomId = randomUUID } = opts;
  const id = newBrandId(url);
  const projectId = brandProjectId(id);
  const host = hostnameOf(url);
  const now = Date.now();

  const meta: BrandMeta = {
    id,
    sourceUrl: url,
    createdAt: now,
    updatedAt: now,
    status: 'extracting',
    projectId,
  };
  createBrandDir(brandsRoot, id, meta);

  const metadata: ProjectMetadata = {
    kind: 'brand',
    importedFrom: 'brand-extraction',
    sourceFileName: host,
    nameSource: 'generated',
    skipDiscoveryBrief: true,
    brandId: id,
    brandSourceUrl: url,
  };
  const name = `${host} Brand Kit`;
  const pendingPrompt = brandExtractionPrompt({ url, brandId: id, host });
  insertProject(db, {
    id: projectId,
    name,
    skillId: null,
    designSystemId: null,
    pendingPrompt,
    metadata,
    customInstructions: null,
    createdAt: now,
    updatedAt: now,
  });
  const conversationId = randomId();
  insertConversation(db, {
    id: conversationId,
    projectId,
    title: null,
    sessionMode: 'design',
    createdAt: now,
    updatedAt: now,
  });

  // Seed the brand-kit page immediately so the user sees a real, on-brand
  // scaffold the moment the project opens — not just a scrolling chat. It
  // starts as skeletons + "Extracting…" and fills in as the agent writes
  // brand.json and re-runs `od brand preview`.
  await writeBrandKitPreview({
    skillsRoot,
    projectsRoot,
    projectId,
    brand: { name: host, sourceUrl: url, colors: [], typography: {} },
    status: 'extracting',
    host,
    metadata,
  });

  // brand.html is the star of the workspace (active tab). The target site stays
  // available as a secondary in-app browser tab so the user can glance at it /
  // clear an anti-bot wall by hand when the agent asks.
  setTabs(db, projectId, {
    tabs: [BRAND_KIT_FILE],
    active: BRAND_KIT_FILE,
    browserTabs: [{ id: BRAND_BROWSER_TAB_ID, label: 'Browser', url, title: host }],
  });

  return { id, projectId, conversationId, sourceUrl: url };
}

export interface FinalizeBrandOptions {
  id: string;
  brandsRoot: string;
  userDesignSystemsRoot: string;
  projectsRoot: string;
  /** Skills root so the final `brand.html` re-render can read the template. */
  skillsRoot: string;
  db: Parameters<typeof insertProject>[0];
  /** Overrides the brand's recorded backing project. */
  projectId?: string;
  randomId?: () => string;
}

/**
 * Finalize an agent-extracted brand: read `brand.json` (+ optional BRAND.md,
 * logos, fonts) the agent wrote into the backing project, validate it, derive
 * the deterministic brand-system artifacts, and register the `user:<id>`
 * design system. Marks the brand `ready`. Throws with a precise message when
 * the agent output is missing or invalid.
 */
export async function finalizeBrand(
  opts: FinalizeBrandOptions,
): Promise<BrandFinalizeResponse> {
  const { id, brandsRoot, userDesignSystemsRoot, projectsRoot, db } = opts;
  const meta = readMeta(brandsRoot, id);
  if (!meta) throw new Error(`brand not found: ${id}`);
  const projectId = opts.projectId ?? meta.projectId ?? brandProjectId(id);

  const brandJsonRaw = await readProjectTextOrNull(projectsRoot, projectId, 'brand.json');
  if (brandJsonRaw === null) {
    throw new Error(
      'brand.json not found in the extraction project — the agent has not written the brand kit yet.',
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(brandJsonRaw);
  } catch {
    const block = extractJsonBlock(brandJsonRaw);
    if (block === null) throw new Error('brand.json is not valid JSON.');
    parsed = block;
  }
  let brand: Brand;
  try {
    brand = validateBrand(parsed, meta.sourceUrl);
  } catch (err) {
    throw new Error(`brand.json failed validation: ${errorMessage(err)}`);
  }

  // Pull the agent's brand.json + downloaded assets into the brand workspace so
  // the deterministic builder and the design system see them.
  writeBrand(brandsRoot, id, brand);
  const guideMd =
    (await readProjectTextOrNull(projectsRoot, projectId, 'BRAND.md')) ?? brandGuideMd(brand);
  writeBrandGuide(brandsRoot, id, guideMd);
  copyProjectDirToBrand(projectsRoot, projectId, brandsRoot, id, 'logos');
  copyProjectDirToBrand(projectsRoot, projectId, brandsRoot, id, 'fonts');

  const systemBuild = await rebuildSystem(brandsRoot, id);

  const body = brandToDesignMd(brand);
  const summary = await createUserDesignSystem(userDesignSystemsRoot, {
    title: brand.name,
    category: 'Brands',
    surface: 'web',
    status: 'published',
    artifactMode: 'agent-managed',
    body,
    provenance: {
      ...(brand.description ? { companyBlurb: brand.description } : {}),
      sourceNotes: `Extracted from ${meta.sourceUrl}`,
    },
  });
  const designSystemId = summary.id;
  syncBrandSystemToUserDesignSystem(userDesignSystemsRoot, designSystemId, brandsRoot, id, body);

  const finalizeMetadata: ProjectMetadata = {
    kind: 'brand',
    importedFrom: 'brand-extraction',
    entryFile: 'system/index.html',
    sourceFileName: brand.name,
    nameSource: 'generated',
    skipDiscoveryBrief: true,
    brandId: id,
    brandSourceUrl: meta.sourceUrl,
    brandDesignSystemId: designSystemId,
  };
  await syncBrandFilesToProject({
    brandsRoot,
    projectsRoot,
    brandId: id,
    projectId,
    brand,
    metadata: finalizeMetadata,
  });

  // Re-render the kit page now that the brand is complete and the six system
  // artifacts exist in the project, so the Brand Assets tiles light up with
  // live previews and the status flips to "Brand ready".
  await writeBrandKitPreview({
    skillsRoot: opts.skillsRoot,
    projectsRoot,
    projectId,
    brand: brand as unknown as Record<string, unknown>,
    status: 'ready',
    metadata: finalizeMetadata,
  });

  await linkUserDesignSystemProject(userDesignSystemsRoot, designSystemId, projectId);

  const existing = getProject(db, projectId);
  if (existing) {
    updateProject(db, projectId, {
      name: `${brand.name || meta.sourceUrl} Brand Kit`,
      skillId: existing.skillId ?? null,
      designSystemId,
      pendingPrompt: existing.pendingPrompt ?? null,
      metadata: { ...(existing.metadata ?? {}), ...finalizeMetadata },
      customInstructions: existing.customInstructions ?? null,
      updatedAt: Date.now(),
    });
  }

  patchMeta(brandsRoot, id, {
    status: 'ready',
    designSystemId,
    systemFiles: systemBuild.files,
    projectId,
  });

  return { id, brand, designSystemId, projectId, files: systemBuild.files };
}

export interface RenderBrandPreviewOptions {
  id: string;
  brandsRoot: string;
  skillsRoot: string;
  projectsRoot: string;
  /** Overrides the brand's recorded backing project. */
  projectId?: string;
}

export interface RenderBrandPreviewResult {
  id: string;
  projectId: string;
  file: string;
  /** True when a brand.json was found and rendered; false means an empty
   *  scaffold was (re)written so the page still shows progress. */
  rendered: boolean;
}

/**
 * Re-render `brand.html` from whatever the agent has written into the project's
 * `brand.json` so far. Lenient by design — partial / in-progress brand data
 * renders with skeletons for the missing modules, which is exactly the live
 * "filling in" experience. Called after each measurement pass via
 * `POST /api/brands/:id/preview` (`od brand preview`).
 */
export async function renderBrandPreviewIntoProject(
  opts: RenderBrandPreviewOptions,
): Promise<RenderBrandPreviewResult> {
  const { id, brandsRoot, skillsRoot, projectsRoot } = opts;
  const meta = readMeta(brandsRoot, id);
  if (!meta) throw new Error(`brand not found: ${id}`);
  const projectId = opts.projectId ?? meta.projectId ?? brandProjectId(id);
  const status: 'extracting' | 'ready' = meta.status === 'ready' ? 'ready' : 'extracting';

  const raw = await readProjectTextOrNull(projectsRoot, projectId, 'brand.json');
  let brand: Record<string, unknown> = { sourceUrl: meta.sourceUrl, colors: [], typography: {} };
  let rendered = false;
  if (raw !== null) {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = extractJsonBlock(raw);
    }
    if (parsed && typeof parsed === 'object') {
      brand = parsed as Record<string, unknown>;
      if (typeof brand.sourceUrl !== 'string' || !brand.sourceUrl) brand.sourceUrl = meta.sourceUrl;
      rendered = true;
    }
  }

  await writeBrandKitPreview({
    skillsRoot,
    projectsRoot,
    projectId,
    brand,
    status,
    metadata: { kind: 'brand', brandId: id, brandSourceUrl: meta.sourceUrl },
  });
  return { id, projectId, file: BRAND_KIT_FILE, rendered };
}

/** The first prompt the extraction agent auto-runs. Self-sufficient (does not
 *  rely on the brand-extract skill auto-loading) but names it so a runtime that
 *  surfaces skills can pull in the longer methodology + craft guides. */
function brandExtractionPrompt(input: { url: string; brandId: string; host: string }): string {
  return [
    `This is a live BRAND EXTRACTION task for ${input.host}.`,
    `Source URL: ${input.url}`,
    `Brand id: ${input.brandId}`,
    '',
    'A live brand-kit page (`brand.html`) is ALREADY open as the active tab — right now it shows skeletons and "Extracting…". Your job is to make it fill in with the real brand as fast as possible. The target site is also open in a secondary in-app Browser tab. Use the `brand-extract` skill and the `agent-browser` tool to drive and observe the site. Do not guess — measure.',
    '',
    'Work the branding-agent chain, optimizing for FAST first paint:',
    '',
    '1. MEASURE — drive the site with agent-browser. Snapshot it, then harvest the real design language: frequency-ranked color literals (background / surface / foreground / muted / border / accent / accent-secondary), the @font-face + font-family declarations, the logo candidates (inline header SVG, apple-touch-icon, favicon, og:image), and representative headings + copy for voice. Save logo files under `logos/` and any self-hosted webfonts under `fonts/` in this project.',
    '   - ANTI-BOT WALL: if the page is a Cloudflare / DataDome / "Just a moment…" / "Verify you are human" interstitial instead of the real site, STOP and emit a `<question-form>` asking the user to complete the verification in the browser, then Continue. Do NOT try to bypass it yourself. When the user submits the form, re-snapshot and resume.',
    '',
    '2. SYNTHESIZE INCREMENTALLY — write `brand.json` into this project AS SOON AS you have the name, a couple of colors, and a logo candidate (do not wait for everything). It must parse as JSON and use exactly the seven color roles (background, surface, foreground, muted, border, accent, accent-secondary), each with `hex` (#rrggbb), `oklch`, `name`, `usage`; plus `name`, `tagline`, `description`, `sourceUrl`, `logo` ({ primary, alternates, notes } with `logos/<file>` paths), `typography` ({ display, body, mono? } each { family, fallbacks[], weights[], googleFontsUrl? }), `voice`, `imagery`, and `layout`. Never invent colors from memory — pick them from what you measured.',
    '   - After that FIRST write, run `od brand preview ' + input.brandId + '` to render the kit page, and tell the user it is filling in. Then keep measuring, update `brand.json`, and re-run `od brand preview ' + input.brandId + '` after each pass so they watch it complete. Also write `BRAND.md`, a prose brand guide an autonomous design agent can follow.',
    '',
    '3. BUILD & REGISTER — when `brand.json` is complete, run `od brand finalize ' + input.brandId + '` (add `--json` for machine output). That validates it, derives the light/dark/compact design tokens and the six brand-system artifacts (landing, deck, poster, email, newsletter, form), registers the reusable design system, and lights up the Brand Assets tiles on the kit page. Fix `brand.json` and re-run if it reports a validation error.',
    '',
    'Finish by pointing the user at the completed brand.html (logo, palette, typography, voice) and the Brand Assets they can now preview, and confirm the brand was registered.',
  ].join('\n');
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function brandProjectId(brandId: string): string {
  return `brand-${brandId}`;
}

/** Read a UTF-8 project file, returning null when it is absent. */
async function readProjectTextOrNull(
  projectsRoot: string,
  projectId: string,
  name: string,
): Promise<string | null> {
  try {
    const file = await readProjectFile(projectsRoot, projectId, name);
    const buf = file?.buffer;
    if (buf === null || buf === undefined) return null;
    return Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf);
  } catch {
    return null;
  }
}

/** Copy a top-level project subdirectory (logos / fonts) into the brand dir. */
function copyProjectDirToBrand(
  projectsRoot: string,
  projectId: string,
  brandsRoot: string,
  brandId: string,
  dirName: string,
): void {
  let projectDir: string;
  try {
    projectDir = resolveProjectDir(projectsRoot, projectId);
  } catch {
    return;
  }
  const source = path.join(projectDir, dirName);
  if (!isDirectory(source)) return;
  const target = resolveBrandFile(brandsRoot, brandId, [dirName]);
  if (!target) return;
  copyDirectorySync(source, target);
}

async function syncBrandFilesToProject(input: {
  brandsRoot: string;
  projectsRoot: string;
  brandId: string;
  projectId: string;
  brand: Brand;
  metadata: ProjectMetadata;
}): Promise<void> {
  const brandRoot = resolveBrandFile(input.brandsRoot, input.brandId, []);
  if (!brandRoot) throw new Error(`invalid brand id: ${input.brandId}`);
  const write = async (name: string, body: string | Buffer) => {
    await writeProjectFile(input.projectsRoot, input.projectId, name, body, { overwrite: true }, input.metadata);
  };
  await write('brand.json', JSON.stringify(input.brand, null, 2));
  await write('DESIGN.md', brandToDesignMd(input.brand));
  await writeOptionalFileToProject(input.projectsRoot, input.projectId, input.metadata, brandRoot, 'guide.md');
  await copyDirectoryToProject(input.projectsRoot, input.projectId, input.metadata, brandSystemDir(input.brandsRoot, input.brandId), 'system');
  await copyOptionalDirectoryToProject(input.projectsRoot, input.projectId, input.metadata, path.join(brandRoot, 'logos'), 'logos');
  await copyOptionalDirectoryToProject(input.projectsRoot, input.projectId, input.metadata, path.join(brandRoot, 'fonts'), 'fonts');
  await copyOptionalDirectoryToProject(input.projectsRoot, input.projectId, input.metadata, path.join(brandRoot, 'prefetch'), 'prefetch');
}

async function writeOptionalFileToProject(
  projectsRoot: string,
  projectId: string,
  metadata: ProjectMetadata,
  root: string,
  rel: string,
): Promise<void> {
  const abs = path.join(root, rel);
  if (!isFile(abs)) return;
  await writeProjectFile(projectsRoot, projectId, rel, fs.readFileSync(abs), { overwrite: true }, metadata);
}

async function copyOptionalDirectoryToProject(
  projectsRoot: string,
  projectId: string,
  metadata: ProjectMetadata,
  sourceDir: string,
  targetPrefix: string,
): Promise<void> {
  if (!isDirectory(sourceDir)) return;
  await copyDirectoryToProject(projectsRoot, projectId, metadata, sourceDir, targetPrefix);
}

async function copyDirectoryToProject(
  projectsRoot: string,
  projectId: string,
  metadata: ProjectMetadata,
  sourceDir: string,
  targetPrefix: string,
): Promise<void> {
  for (const file of collectFiles(sourceDir)) {
    const projectPath = toPosixPath(path.join(targetPrefix, file.rel));
    await writeProjectFile(projectsRoot, projectId, projectPath, fs.readFileSync(file.abs), { overwrite: true }, metadata);
  }
}

function syncBrandSystemToUserDesignSystem(
  userDesignSystemsRoot: string,
  designSystemId: string,
  brandsRoot: string,
  brandId: string,
  designMd: string,
): void {
  const dir = userDesignSystemDir(userDesignSystemsRoot, designSystemId);
  if (!dir) throw new Error(`invalid design system id: ${designSystemId}`);
  const brandRoot = resolveBrandFile(brandsRoot, brandId, []);
  if (!brandRoot) throw new Error(`invalid brand id: ${brandId}`);

  fs.writeFileSync(path.join(dir, 'DESIGN.md'), designMd, 'utf8');
  copyDirectorySync(brandSystemDir(brandsRoot, brandId), path.join(dir, 'system'));
  copyOptionalDirectorySync(path.join(brandRoot, 'logos'), path.join(dir, 'logos'));
  copyOptionalDirectorySync(path.join(brandRoot, 'fonts'), path.join(dir, 'fonts'));
  copyOptionalDirectorySync(path.join(brandRoot, 'prefetch'), path.join(dir, 'prefetch'));
  const brandJson = resolveBrandFile(brandsRoot, brandId, ['brand.json']);
  if (brandJson && isFile(brandJson)) {
    fs.copyFileSync(brandJson, path.join(dir, 'brand.json'));
  }
}

function userDesignSystemDir(root: string, id: string): string | null {
  if (!id.startsWith('user:')) return null;
  const dirId = id.slice('user:'.length);
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(dirId)) return null;
  const base = path.resolve(root);
  const target = path.resolve(base, dirId);
  if (target !== base && target.startsWith(`${base}${path.sep}`)) return target;
  return null;
}

function copyOptionalDirectorySync(sourceDir: string, targetDir: string): void {
  if (!isDirectory(sourceDir)) return;
  copyDirectorySync(sourceDir, targetDir);
}

function copyDirectorySync(sourceDir: string, targetDir: string): void {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
  for (const file of collectFiles(sourceDir)) {
    const target = path.join(targetDir, file.rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(file.abs, target);
  }
}

function collectFiles(root: string): Array<{ abs: string; rel: string }> {
  const out: Array<{ abs: string; rel: string }> = [];
  const walk = (dir: string, prefix: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = prefix ? path.join(prefix, entry.name) : entry.name;
      if (entry.isDirectory()) {
        walk(abs, rel);
      } else if (entry.isFile()) {
        out.push({ abs, rel: toPosixPath(rel) });
      }
    }
  };
  walk(root, '');
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

/** List every stored brand as a summary (meta + provisional brand). */
export function listBrandSummaries(brandsRoot: string): BrandSummary[] {
  const out: BrandSummary[] = [];
  for (const id of listBrandIds(brandsRoot)) {
    const meta = readMeta(brandsRoot, id);
    if (!meta) continue;
    out.push({ meta, brand: readBrand(brandsRoot, id) });
  }
  return out;
}

/** Full detail for one brand, or null when it is missing. */
export function readBrandDetail(brandsRoot: string, id: string): BrandDetailResponse | null {
  const meta = readMeta(brandsRoot, id);
  if (!meta) return null;
  return {
    meta,
    brand: readBrand(brandsRoot, id),
    guide: readBrandGuide(brandsRoot, id),
  };
}

/**
 * Remove a brand and its registered user design system. Returns false when the
 * brand dir did not exist.
 */
export async function removeBrand(
  brandsRoot: string,
  userDesignSystemsRoot: string,
  id: string,
): Promise<boolean> {
  const meta = readMeta(brandsRoot, id);
  if (meta?.designSystemId) {
    try {
      await deleteUserDesignSystem(userDesignSystemsRoot, meta.designSystemId);
    } catch {
      // Best-effort — still remove the brand dir below.
    }
  }
  return deleteBrandDir(brandsRoot, id);
}

const LOGO_EXT_PRIORITY = ['.svg', '.png', '.webp', '.jpg', '.jpeg', '.gif', '.ico'];

/**
 * Absolute path to the brand's primary logo file, or null when none exists.
 * Prefers brand.logo.primary, then the first logo in `logos/` by extension
 * priority (vector/raster before icon).
 */
export function resolveBrandLogoPath(brandsRoot: string, id: string): string | null {
  const brand = readBrand(brandsRoot, id);
  const primary = brand?.logo?.primary;
  if (primary) {
    const rel = primary.replace(/^\.?\/+/, '').split('/').filter(Boolean);
    const abs = resolveBrandFile(brandsRoot, id, rel);
    if (abs && isFile(abs)) return abs;
  }

  const logosDir = resolveBrandFile(brandsRoot, id, ['logos']);
  if (!logosDir) return null;
  let names: string[];
  try {
    names = fs.readdirSync(logosDir);
  } catch {
    return null;
  }
  const ranked = names
    .filter((n) => isFile(path.join(logosDir, n)))
    .sort((a, b) => extRank(a) - extRank(b) || a.localeCompare(b));
  const pick = ranked[0];
  return pick ? path.join(logosDir, pick) : null;
}

function extRank(name: string): number {
  const i = LOGO_EXT_PRIORITY.indexOf(path.extname(name).toLowerCase());
  return i === -1 ? LOGO_EXT_PRIORITY.length : i;
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}
