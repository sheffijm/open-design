import { describe, expect, test } from "vitest";

import {
  beginDesktopSession,
  endDesktopSessionCleanly,
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
    get: () => files.get("state.json"),
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

describe("desktop session lifecycle", () => {
  test("first run reports no previous session and writes a dirty marker", () => {
    const store = makeStore();
    const { previousUncleanSession } = begin(store, "s1");
    expect(previousUncleanSession).toBeNull();
    const written = JSON.parse(store.get()!) as DesktopSessionState;
    expect(written).toMatchObject({ sessionId: "s1", version: "0.14.0", clean: false });
  });

  test("detects a previous UNCLEAN exit (marker left dirty)", () => {
    // Previous run wrote a dirty marker and never marked it clean = it crashed.
    const store = makeStore(JSON.stringify({ sessionId: "prev", version: "0.13.0", startedAt: "t0", clean: false }));
    const { previousUncleanSession } = begin(store, "s2");
    expect(previousUncleanSession).toMatchObject({ sessionId: "prev", version: "0.13.0", clean: false });
    // ...and it stamps a fresh dirty marker for this run.
    expect((JSON.parse(store.get()!) as DesktopSessionState).sessionId).toBe("s2");
  });

  test("a previous CLEAN exit is not reported", () => {
    const store = makeStore(JSON.stringify({ sessionId: "prev", version: "0.13.0", startedAt: "t0", clean: true }));
    expect(begin(store, "s3").previousUncleanSession).toBeNull();
  });

  test("endDesktopSessionCleanly flips the current marker to clean", () => {
    const store = makeStore();
    begin(store, "s4");
    endDesktopSessionCleanly({ stateFilePath: "state.json", readFile: store.readFile, writeFile: store.writeFile });
    expect((JSON.parse(store.get()!) as DesktopSessionState).clean).toBe(true);
  });

  test("full cycle: clean shutdown then next launch reports nothing; a crash is caught", () => {
    const store = makeStore();
    begin(store, "a");
    endDesktopSessionCleanly({ stateFilePath: "state.json", readFile: store.readFile, writeFile: store.writeFile });
    // Next launch after a clean quit: no abnormal-exit signal.
    expect(begin(store, "b").previousUncleanSession).toBeNull();
    // 'b' now runs and crashes (no endDesktopSessionCleanly). Next launch catches it.
    expect(begin(store, "c").previousUncleanSession?.sessionId).toBe("b");
  });

  test("never throws on unreadable/corrupt marker and still stamps this run", () => {
    const store = makeStore("}{ not json");
    expect(() => begin(store, "s5")).not.toThrow();
    expect((JSON.parse(store.get()!) as DesktopSessionState).sessionId).toBe("s5");
  });
});
