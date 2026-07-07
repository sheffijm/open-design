import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const hook = require("../resources/launcher-after-pack.cjs") as {
  (context: unknown): Promise<void>;
  insertMacLauncher: (input: {
    adhocSign?: boolean;
    appPath: string;
    launcherBinaryPath: string;
    productFilename: string;
    relocatedName?: string;
  }) => Promise<{ relocated: string; slot: string }>;
};

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function buildSyntheticBundle(): Promise<{ appPath: string; launcherBinaryPath: string; product: string; root: string }> {
  const root = await mkdtemp(join(tmpdir(), "od-launcher-afterpack-"));
  const product = "Open Design";
  const appPath = join(root, `${product}.app`);
  const macDir = join(appPath, "Contents", "MacOS");
  await mkdir(macDir, { recursive: true });
  await writeFile(join(macDir, product), "ELECTRON-BINARY", "utf8");
  await chmod(join(macDir, product), 0o755);
  const launcherBinaryPath = join(root, "go-launcher");
  await writeFile(launcherBinaryPath, "GO-LAUNCHER-BINARY", "utf8");
  await chmod(launcherBinaryPath, 0o755);
  return { appPath, launcherBinaryPath, product, root };
}

describe("launcher after-pack insertion", () => {
  it("relocates Electron and drops the launcher in the executable slot", async () => {
    const { appPath, launcherBinaryPath, product, root } = await buildSyntheticBundle();
    try {
      const macDir = join(appPath, "Contents", "MacOS");
      const { slot, relocated } = await hook.insertMacLauncher({ appPath, productFilename: product, launcherBinaryPath, relocatedName: "od-electron" });

      expect(slot).toBe(join(macDir, product));
      expect(relocated).toBe(join(macDir, "od-electron"));
      expect(await readFile(relocated, "utf8")).toBe("ELECTRON-BINARY");
      expect(await readFile(slot, "utf8")).toBe("GO-LAUNCHER-BINARY");
      // The OS-launched slot must be executable.
      const { mode } = await import("node:fs/promises").then((fs) => fs.stat(slot));
      expect(mode & 0o100).toBeTruthy();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("is idempotent — a second run does not clobber the relocated Electron", async () => {
    const { appPath, launcherBinaryPath, product, root } = await buildSyntheticBundle();
    try {
      await hook.insertMacLauncher({ appPath, productFilename: product, launcherBinaryPath });
      // Second run: the slot already holds the launcher; Electron must stay put.
      await hook.insertMacLauncher({ appPath, productFilename: product, launcherBinaryPath });
      const macDir = join(appPath, "Contents", "MacOS");
      expect(await readFile(join(macDir, "od-electron"), "utf8")).toBe("ELECTRON-BINARY");
      expect(await readFile(join(macDir, product), "utf8")).toBe("GO-LAUNCHER-BINARY");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("fails clearly when the launcher binary is missing", async () => {
    const { appPath, product, root } = await buildSyntheticBundle();
    try {
      await expect(
        hook.insertMacLauncher({ appPath, productFilename: product, launcherBinaryPath: join(root, "missing") }),
      ).rejects.toThrow(/launcher binary not found/);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
