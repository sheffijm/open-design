import { cp, lstat, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { build as buildWithEsbuild } from "esbuild";
import { BUNDLE_DESCRIPTOR_SCHEMA_VERSION, type BundleArtifactDescriptor } from "@open-design/bundle";

import {
  assertDirectoryRoot,
  assertInternalLinks,
  assertSidecarEntryFile,
  copyOptionalDirectory,
  copyRequiredDirectory,
  linkRelative,
  pathExists,
  removePath,
} from "./fs.js";
import { fail } from "./errors.js";

const WEB_DEFAULT_ENTRY = "sidecar/index.ts";
const WEB_RELEASE_ENTRY = "sidecar/index.mjs";
const WEB_JS_ENTRY_CANDIDATES = ["sidecar/index.mjs", "sidecar/index.js"];
export const WEB_STANDALONE_BUNDLE_ROOT = "web/standalone";
const WEB_STANDALONE_SOURCE_ROOT = path.join(".next", "standalone");
const WEB_STATIC_SOURCE_ROOT = path.join(".next", "static");
const WEB_PUBLIC_SOURCE_ROOT = "public";

export async function detectWebDescriptor(sourcePath: string): Promise<BundleArtifactDescriptor> {
  if (await pathExists(path.join(sourcePath, WEB_DEFAULT_ENTRY))) {
    return {
      entry: { kind: "tsx", path: WEB_DEFAULT_ENTRY },
      schemaVersion: BUNDLE_DESCRIPTOR_SCHEMA_VERSION,
    };
  }

  for (const candidate of WEB_JS_ENTRY_CANDIDATES) {
    if (await pathExists(path.join(sourcePath, candidate))) {
      return {
        entry: { kind: "js", path: candidate },
        schemaVersion: BUNDLE_DESCRIPTOR_SCHEMA_VERSION,
      };
    }
  }

  fail(`web bundle source must contain ${WEB_DEFAULT_ENTRY} or one of: ${WEB_JS_ENTRY_CANDIDATES.join(", ")}`);
}

export async function emitWebSidecar(input: {
  outPath: string;
  sourceDescriptor: BundleArtifactDescriptor;
  sourcePath: string;
}): Promise<BundleArtifactDescriptor> {
  const sourceEntryPath = path.join(input.sourcePath, input.sourceDescriptor.entry.path);
  await assertSidecarEntryFile(sourceEntryPath, "web sidecar entry");

  if (input.sourceDescriptor.entry.kind === "js") {
    const outfile = path.join(input.outPath, input.sourceDescriptor.entry.path);
    await mkdir(path.dirname(outfile), { recursive: true });
    await cp(sourceEntryPath, outfile, { dereference: true });
    return input.sourceDescriptor;
  }

  const outfile = path.join(input.outPath, WEB_RELEASE_ENTRY);
  await mkdir(path.dirname(outfile), { recursive: true });
  await buildWithEsbuild({
    bundle: true,
    entryPoints: [path.join(input.sourcePath, input.sourceDescriptor.entry.path)],
    format: "esm",
    outfile,
    platform: "node",
    sourcemap: true,
    target: "node24",
  });
  return {
    entry: { kind: "js", path: WEB_RELEASE_ENTRY },
    schemaVersion: BUNDLE_DESCRIPTOR_SCHEMA_VERSION,
  };
}

async function resolveStandaloneWebRoot(standaloneRoot: string): Promise<string> {
  const nestedRoot = path.join(standaloneRoot, "apps", "web");
  if (await pathExists(path.join(nestedRoot, "server.js"))) return nestedRoot;
  if (await pathExists(path.join(standaloneRoot, "server.js"))) return standaloneRoot;
  fail(`Next.js standalone server output missing under ${standaloneRoot}`);
}

async function requireWebStandalone(sourcePath: string): Promise<{
  sourceWebRoot: string;
  standaloneRoot: string;
}> {
  const standaloneRoot = path.join(sourcePath, WEB_STANDALONE_SOURCE_ROOT);
  await assertDirectoryRoot(standaloneRoot, "Next.js standalone output");
  return {
    sourceWebRoot: await resolveStandaloneWebRoot(standaloneRoot),
    standaloneRoot,
  };
}

function webStandaloneRoot(outPath: string): string {
  return path.join(outPath, ...WEB_STANDALONE_BUNDLE_ROOT.split("/"));
}

async function linkPnpmPublicHoist(destinationRoot: string): Promise<void> {
  const nodeModulesRoot = path.join(destinationRoot, "node_modules");
  const hoistRoot = path.join(nodeModulesRoot, ".pnpm", "node_modules");
  const entries = await readdir(hoistRoot, { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    const sourcePath = path.join(hoistRoot, entry.name);
    if (entry.name.startsWith("@") && entry.isDirectory()) {
      const scopedEntries = await readdir(sourcePath).catch(() => []);
      for (const scopedEntry of scopedEntries) {
        await linkRelative(
          path.join(sourcePath, scopedEntry),
          path.join(nodeModulesRoot, entry.name, scopedEntry),
        );
      }
      continue;
    }

    await linkRelative(sourcePath, path.join(nodeModulesRoot, entry.name));
  }
}

function isPnpmSharpEntry(name: string): boolean {
  return name.startsWith("sharp@") || name.startsWith("@img+colour@") || name.startsWith("@img+sharp-");
}

function isPrunableImgEntry(name: string): boolean {
  return name === "colour" || name.startsWith("sharp-");
}

async function pruneImgScope(scopePath: string): Promise<void> {
  const entries = await readdir(scopePath).catch(() => []);
  for (const entry of entries) {
    if (isPrunableImgEntry(entry)) await removePath(path.join(scopePath, entry));
  }
}

async function pruneSharp(destinationRoot: string): Promise<void> {
  const nodeModulesRoot = path.join(destinationRoot, "node_modules");
  const pnpmRoot = path.join(nodeModulesRoot, ".pnpm");

  await removePath(path.join(nodeModulesRoot, "sharp"));
  await pruneImgScope(path.join(nodeModulesRoot, "@img"));
  await removePath(path.join(pnpmRoot, "node_modules", "sharp"));
  await pruneImgScope(path.join(pnpmRoot, "node_modules", "@img"));

  const pnpmEntries = await readdir(pnpmRoot).catch(() => []);
  for (const entry of pnpmEntries) {
    if (isPnpmSharpEntry(entry)) {
      await removePath(path.join(pnpmRoot, entry));
      continue;
    }

    if (entry.startsWith("next@")) {
      await removePath(path.join(pnpmRoot, entry, "node_modules", "sharp"));
    }
  }
}

function isSourceBuildResidue(relativePath: string): boolean {
  const normalized = relativePath.split(path.sep).join("/");
  return normalized.endsWith(".map") || normalized.endsWith(".tsbuildinfo");
}

async function pruneSourceBuildResidue(root: string): Promise<void> {
  async function walk(current: string): Promise<void> {
    const info = await lstat(current).catch(() => null);
    if (info == null || info.isSymbolicLink()) return;
    if (info.isDirectory()) {
      const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) await walk(path.join(current, entry.name));
      return;
    }

    const relativePath = path.relative(root, current);
    if (relativePath.length > 0 && isSourceBuildResidue(relativePath)) await removePath(current);
  }

  await walk(root);
}

async function pruneBrokenSymlinks(root: string): Promise<void> {
  async function walk(current: string): Promise<void> {
    const info = await lstat(current).catch(() => null);
    if (info == null) return;
    if (info.isSymbolicLink()) {
      try {
        await stat(current);
      } catch {
        await removePath(current);
      }
      return;
    }
    if (!info.isDirectory()) return;

    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) await walk(path.join(current, entry.name));
  }

  await walk(root);
}

async function pruneWebRuntime(destinationRoot: string): Promise<void> {
  await pruneSharp(destinationRoot);
  await pruneSourceBuildResidue(destinationRoot);
  await pruneBrokenSymlinks(destinationRoot);
}

export async function copyWebRuntime(sourcePath: string, outPath: string): Promise<void> {
  const { sourceWebRoot, standaloneRoot } = await requireWebStandalone(sourcePath);
  const destinationRoot = webStandaloneRoot(outPath);
  const preserveSymlinks = process.platform !== "win32";
  await copyRequiredDirectory(standaloneRoot, destinationRoot, "Next.js standalone output", { preserveSymlinks });

  const relativeWebRoot = path.relative(standaloneRoot, sourceWebRoot);
  const destinationWebRoot = path.join(destinationRoot, relativeWebRoot);
  await copyRequiredDirectory(
    path.join(sourcePath, WEB_STATIC_SOURCE_ROOT),
    path.join(destinationWebRoot, ".next", "static"),
    "Next.js static assets",
    { preserveSymlinks },
  );
  await copyOptionalDirectory(
    path.join(sourcePath, WEB_PUBLIC_SOURCE_ROOT),
    path.join(destinationWebRoot, "public"),
    "web public assets",
    { preserveSymlinks },
  );
  await linkPnpmPublicHoist(destinationRoot);
  await pruneWebRuntime(destinationRoot);
  await assertInternalLinks(destinationRoot, "packed web standalone runtime");
}
