import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { build as buildWithEsbuild } from "esbuild";
import { BUNDLE_DESCRIPTOR_SCHEMA_VERSION, type BundleArtifactDescriptor } from "@open-design/bundle";

import { assertSidecarEntryFile, copyOptionalDirectory, copyRequiredDirectory, pathExists, removePath } from "./fs.js";
import { findWorkspaceRoot } from "./workspace.js";

const DAEMON_RELEASE_ENTRY = "sidecar/index.mjs";
const DAEMON_RESOURCE_ROOT = "daemon/resources";
const DAEMON_SIDECAR_BUILD_ENTRY = "dist/sidecar/index.js";
const DAEMON_CLI_BUILD_ENTRY = "dist/cli.js";
const DAEMON_EXTERNAL_RUNTIME_DEPS = ["better-sqlite3", "blake3-wasm"] as const;
const DAEMON_ESM_REQUIRE_BANNER =
  'import { createRequire as __odCreateRequire } from "node:module"; const require = __odCreateRequire(import.meta.url);';
const DAEMON_DEDUPE_BYTES = 16 * 1024;

function toPosixPath(value: string): string {
  return value.replaceAll("\\", "/");
}

function relativeImportSpecifier(fromDirectory: string, targetPath: string): string {
  const specifier = toPosixPath(path.relative(fromDirectory, targetPath));
  return specifier.startsWith(".") ? specifier : `./${specifier}`;
}

function packageDestination(nodeModulesRoot: string, packageName: string): string {
  return path.join(nodeModulesRoot, ...packageName.split("/"));
}

function resolvePackageJson(requireFrom: NodeJS.Require, packageName: string): string | null {
  try {
    return requireFrom.resolve(`${packageName}/package.json`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "MODULE_NOT_FOUND") return null;
    throw error;
  }
}

async function copyPackageClosure(input: {
  nodeModulesRoot: string;
  packageName: string;
  requireFrom: NodeJS.Require;
  seen: Set<string>;
}): Promise<boolean> {
  const packageJsonPath = resolvePackageJson(input.requireFrom, input.packageName);
  if (packageJsonPath == null) return false;

  const packageRoot = path.dirname(packageJsonPath);
  const realPackageRoot = await realpath(packageRoot);
  if (input.seen.has(realPackageRoot)) return true;
  input.seen.add(realPackageRoot);

  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
    dependencies?: Record<string, string>;
  };
  await copyRequiredDirectory(
    packageRoot,
    packageDestination(input.nodeModulesRoot, input.packageName),
    `${input.packageName} runtime dependency`,
  );

  const childRequire = createRequire(packageJsonPath);
  for (const dependencyName of Object.keys(packageJson.dependencies ?? {})) {
    await copyPackageClosure({
      nodeModulesRoot: input.nodeModulesRoot,
      packageName: dependencyName,
      requireFrom: childRequire,
      seen: input.seen,
    });
  }
  return true;
}

async function copyDaemonDeps(sourcePath: string, outPath: string): Promise<void> {
  const nodeModulesRoot = path.join(outPath, "node_modules");
  const requireFromSource = createRequire(path.join(sourcePath, "package.json"));
  const seen = new Set<string>();

  for (const packageName of DAEMON_EXTERNAL_RUNTIME_DEPS) {
    await copyPackageClosure({
      nodeModulesRoot,
      packageName,
      requireFrom: requireFromSource,
      seen,
    });
  }
}

async function copyDaemonResources(sourcePath: string, outPath: string): Promise<void> {
  const workspaceRoot = await findWorkspaceRoot(sourcePath);
  if (workspaceRoot == null) return;

  const resourceRoot = path.join(outPath, ...DAEMON_RESOURCE_ROOT.split("/"));
  const preserveSymlinks = process.platform !== "win32";
  const copies: Array<{ from: string; to: string }> = [
    { from: "skills", to: "skills" },
    { from: "design-systems", to: "design-systems" },
    { from: "design-templates", to: "design-templates" },
    { from: "craft", to: "craft" },
    { from: "assets/community-pets", to: "community-pets" },
    { from: "prompt-templates", to: "prompt-templates" },
    { from: "plugins/_official", to: "plugins/_official" },
    { from: "plugins/registry", to: "plugins/registry" },
  ];

  for (const copyInfo of copies) {
    await copyOptionalDirectory(
      path.join(workspaceRoot, ...copyInfo.from.split("/")),
      path.join(resourceRoot, ...copyInfo.to.split("/")),
      `daemon resource ${copyInfo.from}`,
      { preserveSymlinks },
    );
  }
}

async function collectDedupeFiles(root: string): Promise<Array<{ path: string; size: number }>> {
  const files: Array<{ path: string; size: number }> = [];

  async function walk(current: string): Promise<void> {
    const entries = (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      const metadata = await lstat(entryPath);
      if (metadata.isSymbolicLink()) continue;
      if (metadata.isDirectory()) {
        await walk(entryPath);
        continue;
      }
      if (metadata.isFile() && metadata.size >= DAEMON_DEDUPE_BYTES) {
        files.push({ path: entryPath, size: metadata.size });
      }
    }
  }

  if (await pathExists(root)) await walk(root);
  return files;
}

async function hashFile(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function dedupeDaemonResources(resourceRoot: string): Promise<void> {
  if (process.platform === "win32") return;

  const filesBySize = new Map<number, string[]>();
  for (const file of await collectDedupeFiles(resourceRoot)) {
    const existing = filesBySize.get(file.size) ?? [];
    existing.push(file.path);
    filesBySize.set(file.size, existing);
  }

  for (const files of filesBySize.values()) {
    if (files.length < 2) continue;
    const canonicalByHash = new Map<string, string>();
    for (const file of files) {
      const digest = await hashFile(file);
      const canonical = canonicalByHash.get(digest);
      if (canonical == null) {
        canonicalByHash.set(digest, file);
        continue;
      }

      const relativeTarget = path.relative(path.dirname(file), canonical);
      await rm(file, { force: true });
      await symlink(relativeTarget.length === 0 ? "." : relativeTarget, file);
    }
  }
}

async function pruneSourceResidue(root: string): Promise<void> {
  async function walk(current: string): Promise<void> {
    const info = await lstat(current).catch(() => null);
    if (info == null || info.isSymbolicLink()) return;
    if (info.isDirectory()) {
      const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) await walk(path.join(current, entry.name));
      return;
    }

    const relativePath = path.relative(root, current).split(path.sep).join("/");
    if (relativePath.endsWith(".map") || relativePath.endsWith(".tsbuildinfo")) {
      await rm(current, { force: true });
    }
  }

  await walk(root);
}

async function pruneBrokenLinks(root: string): Promise<void> {
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

async function pruneDaemonRuntime(outPath: string): Promise<void> {
  const betterSqliteRoot = path.join(outPath, "node_modules", "better-sqlite3");
  await removePath(path.join(betterSqliteRoot, "deps"));
  await removePath(path.join(betterSqliteRoot, "build", "Release", "obj"));
  await pruneSourceResidue(outPath);
  await pruneBrokenLinks(outPath);
}

function renderDaemonCliEntry(input: { entryRoot: string; sourceCliPath: string }): string {
  return [
    'import { fileURLToPath } from "node:url";',
    "const selfPath = fileURLToPath(import.meta.url);",
    "process.env.OD_BIN ??= selfPath;",
    "process.env.OD_DAEMON_CLI_PATH ??= selfPath;",
    `await import(${JSON.stringify(relativeImportSpecifier(input.entryRoot, input.sourceCliPath))});`,
    "",
  ].join("\n");
}

export async function emitDaemonRuntime(sourcePath: string, outPath: string): Promise<BundleArtifactDescriptor> {
  const sourceSidecarPath = path.join(sourcePath, ...DAEMON_SIDECAR_BUILD_ENTRY.split("/"));
  const sourceCliPath = path.join(sourcePath, ...DAEMON_CLI_BUILD_ENTRY.split("/"));
  await assertSidecarEntryFile(sourceSidecarPath, "daemon sidecar build entry");
  await assertSidecarEntryFile(sourceCliPath, "daemon CLI build entry");

  const entryRoot = path.join(outPath, ".entrypoints");
  const cliEntryPath = path.join(entryRoot, "daemon-cli.mjs");
  await mkdir(entryRoot, { recursive: true });
  await writeFile(cliEntryPath, renderDaemonCliEntry({ entryRoot, sourceCliPath }), "utf8");
  await buildWithEsbuild({
    banner: { js: DAEMON_ESM_REQUIRE_BANNER },
    bundle: true,
    chunkNames: "daemon/chunks/[name]-[hash]",
    entryPoints: [
      { in: sourceSidecarPath, out: "sidecar/index" },
      { in: cliEntryPath, out: "daemon/daemon-cli" },
    ],
    external: [...DAEMON_EXTERNAL_RUNTIME_DEPS],
    format: "esm",
    outdir: outPath,
    outExtension: { ".js": ".mjs" },
    platform: "node",
    splitting: true,
    target: "node24",
  });
  await rm(entryRoot, { force: true, recursive: true });
  await copyDaemonDeps(sourcePath, outPath);
  await copyDaemonResources(sourcePath, outPath);
  await pruneDaemonRuntime(outPath);
  await dedupeDaemonResources(path.join(outPath, ...DAEMON_RESOURCE_ROOT.split("/")));

  return {
    entry: { kind: "js", path: DAEMON_RELEASE_ENTRY },
    schemaVersion: BUNDLE_DESCRIPTOR_SCHEMA_VERSION,
  };
}
