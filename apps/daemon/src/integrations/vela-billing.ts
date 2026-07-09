import { execFile } from 'node:child_process';
import type { WorkspaceBillingSummary } from '@open-design/contracts';
import { amrVelaProfileEnv } from './vela-profile.js';

// A-lane billing 收口. Instead of the daemon holding billing credentials, it
// shells out to `vela billing summary --format json`, which authenticates with
// the same vela login session AMR + the resource CLI use — one identity, and
// the billing truth lives in the vela backend. This is the read-side twin of
// the resource CLI adapter (see vela-cli-resource-adapter.ts): the client shows
// real credits + plan tier instead of a placeholder, and it degrades to null
// (the client keeps its context-derived tier hint) when the CLI / session is
// unavailable. The child process is injectable so the mapping is unit-tested
// without a live CLI.

/** Run `vela billing summary --format json` and resolve its stdout. */
export type RunVelaBilling = () => Promise<string>;

export interface FetchVelaBillingOptions {
  /** Injectable child-process runner; defaults to spawning the vela binary. */
  run?: RunVelaBilling;
}

/**
 * Fetch the caller's Vela billing summary via the CLI 收口. Returns null when
 * the CLI is missing, the user has no billing session, or the payload can't be
 * parsed — every failure is a clean "no summary", never a throw, so the route
 * can always answer and the client falls back to its context tier hint.
 */
export async function fetchVelaBillingSummary(
  options: FetchVelaBillingOptions = {},
): Promise<WorkspaceBillingSummary | null> {
  const run = options.run ?? defaultRunVelaBilling;
  let stdout: string;
  try {
    stdout = await run();
  } catch {
    return null;
  }
  return parseBillingSummary(stdout);
}

/** Map the `vela billing summary` JSON into the client-facing summary. */
export function parseBillingSummary(stdout: string): WorkspaceBillingSummary | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
  const balances = (raw.balances ?? {}) as Record<string, unknown>;
  const total = Number(balances.totalAvailableCredits ?? 0);
  return {
    membershipTier: str(raw.membershipTier),
    totalAvailableCredits: Number.isFinite(total) ? total : 0,
    balanceUsd: str(raw.balanceUsd) || '0',
    subscriptionStatus: str(raw.subscriptionStatus),
    availableActions: Array.isArray(raw.availableActions)
      ? raw.availableActions.filter((a): a is string => typeof a === 'string')
      : [],
  };
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

const defaultRunVelaBilling: RunVelaBilling = () =>
  new Promise<string>((resolve, reject) => {
    const bin = process.env.OD_VELA_BIN?.trim() || 'vela';
    execFile(
      bin,
      ['billing', 'summary', '--format', 'json'],
      // Inherit the AMR profile so the CLI reads the same ~/.amr session the
      // daemon's AMR runtime + resource transport use — one login covers agent
      // runs, resources, and billing.
      { env: { ...process.env, ...amrVelaProfileEnv() }, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      },
    );
  });
