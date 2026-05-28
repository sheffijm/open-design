import { execFile } from "node:child_process";
import { mkdir, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";

import type { ToolPackConfig } from "../config.js";
import { winResources } from "../resources.js";
import type { WinBuiltAppManifest, WinPackTiming, WinPaths } from "./types.js";

const execFileAsync = promisify(execFile);

// Produces a portable zip from the unpacked Electron build using the same 7z
// binary that ships with tools-pack for the NSIS payload. The zip lays files
// flat at the archive root so that users can extract it anywhere on Windows
// and run `Open Design.exe` without going through the NSIS installer.
//
// We deliberately do not delegate this to electron-builder's native `zip`
// target: the existing tools-pack flow forces electron-builder to `to: "dir"`
// so the cached `win-unpacked` output can be shared across cache hits and
// post-processed into the custom NSIS installer. Producing the zip from that
// same cached unpacked tree keeps the build deterministic and avoids a
// second electron-builder pass.
export async function buildWinPortableZip(
  _config: ToolPackConfig,
  paths: WinPaths,
  builtApp: WinBuiltAppManifest,
): Promise<WinPackTiming[]> {
  if (process.platform !== "win32") throw new Error("Windows portable zip build must run on Windows");
  const timings: WinPackTiming[] = [];
  const runSegment = async <T>(phase: string, task: () => Promise<T>): Promise<T> => {
    const startedAt = Date.now();
    try {
      return await task();
    } finally {
      timings.push({ durationMs: Date.now() - startedAt, phase });
    }
  };

  await runSegment("portable-zip:prepare", async () => {
    await mkdir(dirname(paths.setupZipPath), { recursive: true });
    await rm(paths.setupZipPath, { force: true });
  });
  await runSegment("portable-zip:7z", async () => {
    await execFileAsync(
      winResources.sevenZipExe,
      ["a", "-tzip", "-mx=5", paths.setupZipPath, ".\\*"],
      {
        cwd: builtApp.unpackedRoot,
        windowsHide: true,
      },
    );
  });
  await runSegment("portable-zip:stat", async () => {
    await stat(paths.setupZipPath);
  });
  return timings;
}
