import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Persisted marker for one desktop run.
 *
 *  - `reachedRunning` flips true once the app is actually up (window + runtime),
 *    so a bootstrap failure BEFORE that (already covered by
 *    `packaged_runtime_failed`) is never mistaken for a runtime crash.
 *  - `clean` flips true on a graceful quit.
 *
 * A previous run counts as an abnormal "runtime 闪退" only when it
 * `reachedRunning` but never went `clean` — the app was up, then the whole
 * process died without a graceful shutdown (main-process crash, OS kill,
 * force-quit after a hang, power loss). That class reaches no other telemetry:
 * a dead process can't report itself, and renderer/startup crashes are separate
 * events.
 */
export interface DesktopSessionState {
  sessionId: string;
  version: string | null;
  startedAt: string;
  reachedRunning: boolean;
  clean: boolean;
}

function defaultRead(path: string): string {
  return readFileSync(path, "utf8");
}

function defaultWrite(path: string, data: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data, "utf8");
}

function parseState(raw: string): DesktopSessionState | null {
  const parsed = JSON.parse(raw) as Partial<DesktopSessionState>;
  if (parsed == null || typeof parsed.sessionId !== "string") return null;
  return {
    sessionId: parsed.sessionId,
    version: typeof parsed.version === "string" ? parsed.version : null,
    startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : "",
    reachedRunning: parsed.reachedRunning === true,
    clean: parsed.clean === true,
  };
}

export interface BeginDesktopSessionDeps {
  stateFilePath: string;
  sessionId: string;
  version: string | null;
  now: () => Date;
  /** Injectable for tests; defaults to fs. */
  readFile?: (path: string) => string;
  writeFile?: (path: string, data: string) => void;
}

/**
 * Read the previous run's marker, then write a fresh marker for this run
 * (`reachedRunning: false`, `clean: false`). Returns the previous state ONLY
 * when it ended as an abnormal RUNTIME exit — it had reached running and never
 * went clean. Overwriting the marker here means the previous state is reported
 * at most once. Best-effort: any fs/parse failure yields no signal and never
 * throws — this must not be able to block startup.
 */
export function beginDesktopSession(
  deps: BeginDesktopSessionDeps,
): { previousUncleanSession: DesktopSessionState | null } {
  const read = deps.readFile ?? defaultRead;
  const write = deps.writeFile ?? defaultWrite;

  let previousUncleanSession: DesktopSessionState | null = null;
  try {
    const previous = parseState(read(deps.stateFilePath));
    if (previous != null && previous.reachedRunning && !previous.clean) {
      previousUncleanSession = previous;
    }
  } catch {
    // No marker (first run), unreadable, or a run that never reached running —
    // not a runtime-crash signal.
  }

  const state: DesktopSessionState = {
    sessionId: deps.sessionId,
    version: deps.version,
    startedAt: deps.now().toISOString(),
    reachedRunning: false,
    clean: false,
  };
  try {
    write(deps.stateFilePath, JSON.stringify(state));
  } catch {
    // Best-effort: without a marker we simply won't detect a crash of THIS run
    // next time — never a reason to fail startup.
  }
  return { previousUncleanSession };
}

function updateState(
  stateFilePath: string,
  patch: Partial<DesktopSessionState>,
  readFile: (path: string) => string,
  writeFile: (path: string, data: string) => void,
): void {
  try {
    const state = parseState(readFile(stateFilePath));
    if (state == null) return;
    writeFile(stateFilePath, JSON.stringify({ ...state, ...patch }));
  } catch {
    // Best-effort.
  }
}

/**
 * Flip this run's marker to `reachedRunning: true` once the app is actually up.
 * Only after this does a subsequent dirty marker count as a runtime crash.
 */
export function markDesktopSessionRunning(deps: {
  stateFilePath: string;
  readFile?: (path: string) => string;
  writeFile?: (path: string, data: string) => void;
}): void {
  updateState(deps.stateFilePath, { reachedRunning: true }, deps.readFile ?? defaultRead, deps.writeFile ?? defaultWrite);
}

/**
 * Flip this run's marker to `clean: true` on a graceful quit, so the next launch
 * doesn't misreport it as an abnormal exit. Best-effort and idempotent.
 */
export function endDesktopSessionCleanly(deps: {
  stateFilePath: string;
  readFile?: (path: string) => string;
  writeFile?: (path: string, data: string) => void;
}): void {
  updateState(deps.stateFilePath, { clean: true }, deps.readFile ?? defaultRead, deps.writeFile ?? defaultWrite);
}
