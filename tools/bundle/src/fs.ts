import { cp, lstat, mkdir, readlink, realpath, readdir, rm, stat, symlink } from "node:fs/promises";
import path from "node:path";

import { fail } from "./errors.js";

export function containsPath(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return rel === "" || (rel.length > 0 && !rel.startsWith("..") && !path.isAbsolute(rel));
}

export async function assertDirectoryRoot(root: string, label: string): Promise<void> {
  let info;
  try {
    info = await lstat(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") fail(`${label} missing: ${root}`);
    throw error;
  }
  if (!info.isDirectory()) fail(`${label} must be a directory: ${root}`);
  if (info.isSymbolicLink()) fail(`${label} must not be a symlink: ${root}`);
}

export async function assertInternalLinks(root: string, label: string): Promise<void> {
  await assertDirectoryRoot(root, label);
  const realRoot = await realpath(root);

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      const child = await lstat(entryPath);
      if (child.isSymbolicLink()) {
        const target = await readlink(entryPath);
        if (path.isAbsolute(target)) {
          fail(`${label} symlinks must be relative: ${entryPath}`);
        }

        let realTarget;
        try {
          realTarget = await realpath(entryPath);
        } catch {
          fail(`${label} symlinks must not be broken: ${entryPath}`);
        }
        if (!containsPath(realRoot, realTarget)) {
          fail(`${label} symlinks must stay inside the bundle: ${entryPath}`);
        }
        continue;
      }
      if (entry.isDirectory()) await walk(entryPath);
    }
  }

  await walk(root);
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function assertSidecarEntryFile(entryPath: string, label = "sidecar entry"): Promise<void> {
  const info = await lstat(entryPath);
  if (info.isSymbolicLink()) fail(`${label} must not be a symlink: ${entryPath}`);
  if (!info.isFile()) fail(`${label} must be a file: ${entryPath}`);
}

export async function copyRequiredDirectory(
  sourcePath: string,
  destinationPath: string,
  label: string,
  options: { preserveSymlinks?: boolean } = {},
): Promise<void> {
  let info;
  try {
    info = await stat(sourcePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      fail(`${label} missing: ${sourcePath}`);
    }
    throw error;
  }
  if (!info.isDirectory()) fail(`${label} must be a directory: ${sourcePath}`);

  await rm(destinationPath, { force: true, recursive: true });
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await cp(sourcePath, destinationPath, {
    dereference: options.preserveSymlinks !== true,
    recursive: true,
    verbatimSymlinks: options.preserveSymlinks === true,
  });
}

export async function copyOptionalDirectory(
  sourcePath: string,
  destinationPath: string,
  label: string,
  options: { preserveSymlinks?: boolean } = {},
): Promise<void> {
  if (!(await pathExists(sourcePath))) return;
  await copyRequiredDirectory(sourcePath, destinationPath, label, options);
}

export async function linkRelative(sourcePath: string, destinationPath: string): Promise<boolean> {
  if (await pathExists(destinationPath)) return false;
  await mkdir(path.dirname(destinationPath), { recursive: true });
  const relativeTarget = path.relative(path.dirname(destinationPath), sourcePath);
  await symlink(relativeTarget.length === 0 ? "." : relativeTarget, destinationPath);
  return true;
}

export async function removePath(targetPath: string): Promise<void> {
  await rm(targetPath, { force: true, recursive: true });
}
