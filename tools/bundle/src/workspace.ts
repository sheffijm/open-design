import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { createPackageManagerInvocation } from "@open-design/platform";

import { DAEMON_PACKAGE_NAME, WEB_PACKAGE_NAME, type BundleApp, WEB_APP } from "./apps.js";
import { pathExists } from "./fs.js";
import { toolError } from "./errors.js";

const WORKSPACE_MARKER_FILE = "pnpm-workspace.yaml";
function commandLine(command: string, args: string[]): string {
  return [command, ...args].map((part) => JSON.stringify(part)).join(" ");
}

async function runPackageManager(workspaceRoot: string, args: string[], extraEnv: NodeJS.ProcessEnv): Promise<void> {
  const invocation = createPackageManagerInvocation(args, process.env);
  const startedAt = Date.now();
  process.stderr.write(`[tools-bundle] run ${commandLine(invocation.command, invocation.args)}\n`);

  await new Promise<void>((resolveCommand, rejectCommand) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: workspaceRoot,
      env: { ...process.env, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      windowsVerbatimArguments: invocation.windowsVerbatimArguments,
    });
    child.stdout?.on("data", (chunk: Buffer) => process.stderr.write(chunk));
    child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(chunk));
    child.once("error", rejectCommand);
    child.once("close", (code, signal) => {
      if (code === 0 && signal == null) {
        resolveCommand();
        return;
      }
      const suffix = signal == null ? `exit code ${code ?? "unknown"}` : `signal ${signal}`;
      rejectCommand(toolError(`command failed with ${suffix}: ${commandLine(invocation.command, invocation.args)}`));
    });
  });

  process.stderr.write(`[tools-bundle] done ${commandLine(invocation.command, invocation.args)} durationMs=${Date.now() - startedAt}\n`);
}

export async function findWorkspaceRoot(startPath: string): Promise<string | null> {
  let current = path.resolve(startPath);
  while (true) {
    if (await pathExists(path.join(current, WORKSPACE_MARKER_FILE))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

async function readPackageName(packageRoot: string): Promise<string | null> {
  const packageJsonPath = path.join(packageRoot, "package.json");
  try {
    const value = JSON.parse(await readFile(packageJsonPath, "utf8")) as { name?: unknown };
    return typeof value.name === "string" ? value.name : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function buildWebStandalone(sourcePath: string): Promise<void> {
  const [packageName, workspaceRoot] = await Promise.all([
    readPackageName(sourcePath),
    findWorkspaceRoot(sourcePath),
  ]);
  if (packageName !== WEB_PACKAGE_NAME || workspaceRoot == null) return;
  await runPackageManager(workspaceRoot, ["--filter", WEB_PACKAGE_NAME, "build"], {
    OD_WEB_OUTPUT_MODE: "standalone",
  });
}

async function buildDaemon(sourcePath: string): Promise<void> {
  const [packageName, workspaceRoot] = await Promise.all([
    readPackageName(sourcePath),
    findWorkspaceRoot(sourcePath),
  ]);
  if (packageName !== DAEMON_PACKAGE_NAME || workspaceRoot == null) return;
  await runPackageManager(workspaceRoot, ["--filter", DAEMON_PACKAGE_NAME, "build"], {});
}

export async function buildAppIfWorkspace(app: BundleApp, sourcePath: string): Promise<void> {
  if (app === WEB_APP) {
    await buildWebStandalone(sourcePath);
    return;
  }
  await buildDaemon(sourcePath);
}
