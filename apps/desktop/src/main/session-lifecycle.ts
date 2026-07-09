import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Persisted marker for one desktop run. On a graceful quit we set `clean: true`;
 * on the NEXT launch, a marker that is still `clean: false` means the previous
 * run died without a graceful shutdown — a main-process crash, an OS kill, a
 * force-quit after a hang, or power loss. That "runtime 闪退" class is otherwise
 * invisible to telemetry (the renderer-crash and startup-crash events don't
 * cover it, and a dead process can't report itself).
 */
export interface DesktopSessionState {
  sessionId: string;
  version: string | null;
  startedAt: string;
  clean: boolean;
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

function defaultRead(path: string): string {
  return readFileSync(path, "utf8");
}

function defaultWrite(path: string, data: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data, "utf8");
}

function parsePreviousState(raw: string): DesktopSessionState | null {
  const parsed = JSON.parse(raw) as Partial<DesktopSessionState>;
  if (parsed == null || typeof parsed.sessionId !== "string") return null;
  return {
    sessionId: parsed.sessionId,
    version: typeof parsed.version === "string" ? parsed.version : null,
    startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : "",
    clean: parsed.clean === true,
  };
}

/**
 * Read the previous run's marker, then write a fresh `clean: false` marker for
 * this run. Returns the previous state ONLY when it ended uncleanly (marker
 * present and not clean). Best-effort: any fs/parse failure yields no signal and
 * never throws — this must not be able to block startup.
 */
export function beginDesktopSession(
  deps: BeginDesktopSessionDeps,
): { previousUncleanSession: DesktopSessionState | null } {
  const read = deps.readFile ?? defaultRead;
  const write = deps.writeFile ?? defaultWrite;

  let previousUncleanSession: DesktopSessionState | null = null;
  try {
    const previous = parsePreviousState(read(deps.stateFilePath));
    if (previous != null && !previous.clean) previousUncleanSession = previous;
  } catch {
    // No marker (first run) or unreadable — not an unclean-exit signal.
  }

  const state: DesktopSessionState = {
    sessionId: deps.sessionId,
    version: deps.version,
    startedAt: deps.now().toISOString(),
    clean: false,
  };
  try {
    write(deps.stateFilePath, JSON.stringify(state));
  } catch {
    // Best-effort: if we can't write the marker we simply won't detect a crash
    // of THIS run next time — never a reason to fail startup.
  }
  return { previousUncleanSession };
}

/**
 * Flip this run's marker to `clean: true` on a graceful quit, so the next launch
 * does not misreport it as an abnormal exit. Best-effort and idempotent.
 */
export function endDesktopSessionCleanly(deps: {
  stateFilePath: string;
  readFile?: (path: string) => string;
  writeFile?: (path: string, data: string) => void;
}): void {
  const read = deps.readFile ?? defaultRead;
  const write = deps.writeFile ?? defaultWrite;
  try {
    const state = parsePreviousState(read(deps.stateFilePath));
    if (state == null) return;
    write(deps.stateFilePath, JSON.stringify({ ...state, clean: true }));
  } catch {
    // Best-effort — a failure here at worst produces one false unclean-exit
    // event next launch, never a crash.
  }
}
