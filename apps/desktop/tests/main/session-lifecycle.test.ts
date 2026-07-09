import { describe, expect, test } from "vitest";

import {
  beginDesktopSession,
  endDesktopSessionCleanly,
  markDesktopSessionRunning,
  type DesktopSessionState,
} from "../../src/main/session-lifecycle.js";

// In-memory fs so the pure lifecycle logic is exercised without touching disk.
function makeStore(initial?: string) {
  const files = new Map<string, string>();
  if (initial != null) files.set("state.json", initial);
  return {
    readFile: (p: string) => {
      const v = files.get(p);
      if (v == null) throw new Error("ENOENT");
      return v;
    },
    writeFile: (p: string, d: string) => {
      files.set(p, d);
    },
    state: () => JSON.parse(files.get("state.json")!) as DesktopSessionState,
    raw: () => files.get("state.json"),
  };
}

const FIXED = new Date("2026-07-09T12:00:00.000Z");

function begin(store: ReturnType<typeof makeStore>, sessionId: string, version = "0.14.0") {
  return beginDesktopSession({
    stateFilePath: "state.json",
    sessionId,
    version,
    now: () => FIXED,
    readFile: store.readFile,
    writeFile: store.writeFile,
  });
}
const running = (store: ReturnType<typeof makeStore>) =>
  markDesktopSessionRunning({ stateFilePath: "state.json", readFile: store.readFile, writeFile: store.writeFile });
const quit = (store: ReturnType<typeof makeStore>) =>
  endDesktopSessionCleanly({ stateFilePath: "state.json", readFile: store.readFile, writeFile: store.writeFile });

describe("desktop session lifecycle", () => {
  test("first run reports nothing and writes a not-yet-running marker", () => {
    const store = makeStore();
    expect(begin(store, "s1").previousUncleanSession).toBeNull();
    expect(store.state()).toMatchObject({ sessionId: "s1", reachedRunning: false, clean: false });
  });

  test("a previous run that reached running and never went clean is a runtime crash", () => {
    const store = makeStore(
      JSON.stringify({ sessionId: "prev", version: "0.13.0", startedAt: "t0", reachedRunning: true, clean: false }),
    );
    expect(begin(store, "s2").previousUncleanSession).toMatchObject({ sessionId: "prev", reachedRunning: true });
  });

  test("a previous run that never reached running is NOT reported (startup failure, not a crash)", () => {
    const store = makeStore(
      JSON.stringify({ sessionId: "prev", version: "0.13.0", startedAt: "t0", reachedRunning: false, clean: false }),
    );
    expect(begin(store, "s3").previousUncleanSession).toBeNull();
  });

  test("a previous clean exit is not reported", () => {
    const store = makeStore(
      JSON.stringify({ sessionId: "prev", version: "0.13.0", startedAt: "t0", reachedRunning: true, clean: true }),
    );
    expect(begin(store, "s4").previousUncleanSession).toBeNull();
  });

  test("markDesktopSessionRunning then a graceful quit → next launch reports nothing", () => {
    const store = makeStore();
    begin(store, "a");
    running(store);
    expect(store.state().reachedRunning).toBe(true);
    quit(store);
    expect(store.state().clean).toBe(true);
    expect(begin(store, "b").previousUncleanSession).toBeNull();
  });

  test("reached running then crashed (no clean) → next launch reports it", () => {
    const store = makeStore();
    begin(store, "a");
    running(store);
    // 'a' crashes — no endDesktopSessionCleanly.
    expect(begin(store, "b").previousUncleanSession?.sessionId).toBe("a");
  });

  test("bootstrap failure before running is not reported next launch", () => {
    const store = makeStore();
    begin(store, "a"); // never calls markDesktopSessionRunning (crashed during bootstrap)
    expect(begin(store, "b").previousUncleanSession).toBeNull();
  });

  test("never throws on a corrupt marker and still stamps this run", () => {
    const store = makeStore("}{ not json");
    expect(() => begin(store, "s5")).not.toThrow();
    expect(store.state().sessionId).toBe("s5");
  });
});
