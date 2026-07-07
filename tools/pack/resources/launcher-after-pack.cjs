// electron-builder afterPack hook: place the Open Design Go launcher at the
// bundle's executable slot and relocate the real Electron binary beside it, so
// the OS launches the fossil launcher, which then spawns Electron. macOS only for
// now (mac-first); other platforms are a no-op. This hook must run BEFORE the
// web-standalone adhoc bundle sign so that pass covers the swapped-in binary.
const { execFile } = require("node:child_process");
const { access, chmod, copyFile, readFile, rename } = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");

const CONFIG_ENV = "OD_TOOLS_PACK_LAUNCHER_HOOK_CONFIG";
const DEFAULT_RELOCATED_NAME = "od-electron";
const execFileAsync = promisify(execFile);

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readHookConfig() {
  const configPath = process.env[CONFIG_ENV];
  if (configPath == null || configPath.length === 0) {
    throw new Error(`[tools-pack launcher] missing ${CONFIG_ENV}`);
  }
  if (!path.isAbsolute(configPath)) {
    throw new Error(`[tools-pack launcher] ${CONFIG_ENV} must be absolute: ${configPath}`);
  }
  const raw = JSON.parse(await readFile(configPath, "utf8"));
  if (!isRecord(raw) || raw.version !== 1) {
    throw new Error("[tools-pack launcher] hook config must be an object with version=1");
  }
  if (typeof raw.launcherBinaryPath !== "string" || !path.isAbsolute(raw.launcherBinaryPath)) {
    throw new Error("[tools-pack launcher] config.launcherBinaryPath must be an absolute path");
  }
  return {
    adhocSign: raw.adhocSign === true,
    launcherBinaryPath: raw.launcherBinaryPath,
    relocatedName: typeof raw.relocatedName === "string" && raw.relocatedName.length > 0 ? raw.relocatedName : DEFAULT_RELOCATED_NAME,
  };
}

function resolveMacAppPath(context) {
  if (context == null || typeof context.appOutDir !== "string" || context.appOutDir.length === 0) {
    throw new Error("[tools-pack launcher] electron-builder context.appOutDir is missing");
  }
  const productFilename = context.packager?.appInfo?.productFilename;
  if (typeof productFilename !== "string" || productFilename.length === 0) {
    throw new Error("[tools-pack launcher] electron-builder productFilename is missing");
  }
  return { appPath: path.join(context.appOutDir, `${productFilename}.app`), productFilename };
}

// insertMacLauncher is the testable core: relocate the real Electron binary from
// Contents/MacOS/<product> to a sibling and drop the launcher binary in its place.
// Idempotent — the Electron binary is relocated only once.
async function insertMacLauncher({ appPath, productFilename, launcherBinaryPath, relocatedName = DEFAULT_RELOCATED_NAME, adhocSign = false }) {
  const macDir = path.join(appPath, "Contents", "MacOS");
  const slot = path.join(macDir, productFilename);
  const relocated = path.join(macDir, relocatedName);
  if (!(await pathExists(launcherBinaryPath))) {
    throw new Error(`[tools-pack launcher] launcher binary not found: ${launcherBinaryPath}`);
  }
  if (!(await pathExists(relocated))) {
    if (!(await pathExists(slot))) {
      throw new Error(`[tools-pack launcher] bundle executable not found: ${slot}`);
    }
    await rename(slot, relocated);
  }
  await copyFile(launcherBinaryPath, slot);
  await chmod(slot, 0o755);
  if (adhocSign) {
    await execFileAsync("codesign", ["--force", "--sign", "-", "--timestamp=none", slot], { maxBuffer: 20 * 1024 * 1024 });
  }
  return { relocated, slot };
}

async function runLauncherAfterPack(context) {
  if (context?.electronPlatformName !== "darwin") return;
  const config = await readHookConfig();
  const { appPath, productFilename } = resolveMacAppPath(context);
  if (!(await pathExists(appPath))) {
    throw new Error(`[tools-pack launcher] app bundle not found: ${appPath}`);
  }
  await insertMacLauncher({ appPath, productFilename, ...config });
}

module.exports = async function launcherAfterPack(context) {
  try {
    await runLauncherAfterPack(context);
  } catch (error) {
    console.error("[tools-pack launcher] after-pack hook failed:", error instanceof Error ? error.message : error);
    throw error;
  }
};
module.exports.insertMacLauncher = insertMacLauncher;
