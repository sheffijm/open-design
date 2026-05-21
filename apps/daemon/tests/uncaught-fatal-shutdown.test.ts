// The daemon's `uncaughtException` / `unhandledRejection` handlers must
// preserve Node's fatal-exit semantics. Installing a listener silences
// Node's default crash path, so we have to call `process.exit(1)`
// explicitly after a bounded posthog-node flush. Without this guarantee
// the process would log telemetry and then keep serving requests with a
// corrupted state — the codex-reviewed regression on PR #2527.
//
// This file pins the contract that's hard to assert from the server.ts
// integration suite (which has no way to throw inside Express handlers
// without crashing vitest). We re-implement the relevant shutdown helper
// shape here and verify:
//
//   - captureSafety is invoked exactly once even on repeated faults
//   - shutdown() is invoked and either resolves or times out
//   - process.exit(1) is called after the race resolves
//   - the bounded timeout fires when shutdown hangs

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const FATAL_FLUSH_TIMEOUT_MS = 1000;

type CaptureSafetyArgs = {
  eventName: string;
  appVersion: string;
  properties: Record<string, unknown>;
};

interface FakeAnalyticsService {
  captureSafety: (args: CaptureSafetyArgs) => void;
  shutdown: () => Promise<void>;
}

function buildFatalShutdown(
  analyticsService: FakeAnalyticsService,
  exitFn: (code: number) => void,
): (eventName: string, properties: Record<string, unknown>) => void {
  // Mirrors `triggerFatalShutdown` in apps/daemon/src/server.ts. Kept in
  // sync with that helper by structure — the unit assertions below
  // verify each invariant the server-side path also relies on.
  let fatalShuttingDown = false;
  return (eventName, properties) => {
    if (fatalShuttingDown) return;
    fatalShuttingDown = true;
    try {
      analyticsService.captureSafety({
        eventName,
        appVersion: '1.0.0',
        properties,
      });
    } catch {
      // capture must never block the exit path
    }
    void Promise.race([
      analyticsService.shutdown(),
      new Promise<void>((resolve) => setTimeout(resolve, FATAL_FLUSH_TIMEOUT_MS)),
    ]).finally(() => {
      exitFn(1);
    });
  };
}

let captureSafetyMock: ReturnType<typeof vi.fn<(args: CaptureSafetyArgs) => void>>;
let shutdownMock: ReturnType<typeof vi.fn<() => Promise<void>>>;
let exitMock: ReturnType<typeof vi.fn<(code: number) => void>>;
let analytics: FakeAnalyticsService;
let exit: (code: number) => void;

beforeEach(() => {
  captureSafetyMock = vi.fn<(args: CaptureSafetyArgs) => void>();
  shutdownMock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  exitMock = vi.fn<(code: number) => void>();
  analytics = {
    captureSafety: captureSafetyMock,
    shutdown: shutdownMock,
  };
  exit = exitMock;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('daemon fatal-shutdown helper', () => {
  it('flushes posthog-node and exits with code 1 on uncaughtException', async () => {
    const fatal = buildFatalShutdown(analytics, exit);

    fatal('daemon_uncaught_exception', { error_message: 'boom' });

    expect(captureSafetyMock).toHaveBeenCalledTimes(1);
    expect(captureSafetyMock).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'daemon_uncaught_exception' }),
    );

    // shutdown() resolved synchronously — let the microtask queue drain.
    await vi.runAllTimersAsync();
    expect(shutdownMock).toHaveBeenCalledTimes(1);
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  it('still exits even when shutdown() hangs past the timeout (bounded flush)', async () => {
    // Simulate posthog-node never resolving — network hang during exit.
    shutdownMock.mockReturnValue(new Promise<void>(() => undefined));

    const fatal = buildFatalShutdown(analytics, exit);
    fatal('daemon_uncaught_exception', { error_message: 'stuck-flush' });

    // Advance just past the bounded timeout.
    await vi.advanceTimersByTimeAsync(FATAL_FLUSH_TIMEOUT_MS + 1);

    expect(exitMock).toHaveBeenCalledWith(1);
  });

  it('captures only once even when multiple faults fire before exit completes', async () => {
    const fatal = buildFatalShutdown(analytics, exit);

    fatal('daemon_uncaught_exception', { error_message: 'first' });
    fatal('daemon_unhandled_rejection', { error_message: 'second' });
    fatal('daemon_uncaught_exception', { error_message: 'third' });

    expect(captureSafetyMock).toHaveBeenCalledTimes(1);
    expect(captureSafetyMock).toHaveBeenCalledWith(
      expect.objectContaining({ properties: { error_message: 'first' } }),
    );

    await vi.runAllTimersAsync();
    // Single exit call too — re-entry must not produce a second process.exit.
    expect(exitMock).toHaveBeenCalledTimes(1);
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  it('still tries to exit when captureSafety itself throws', async () => {
    captureSafetyMock.mockImplementation(() => {
      throw new Error('posthog client died');
    });

    const fatal = buildFatalShutdown(analytics, exit);
    fatal('daemon_uncaught_exception', { error_message: 'capture-explodes' });

    await vi.runAllTimersAsync();
    expect(exitMock).toHaveBeenCalledWith(1);
  });
});
