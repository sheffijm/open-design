// Shared logic that maps a failed run's error code + agent into the failure
// UI: which contextual button the gray error card shows, whether to override
// the error text, and whether to show the AMR promotion card below. Kept in
// its own module so ChatPane / ProjectView / AssistantMessage can import it
// without a circular dependency.

import type { Dict } from '../i18n/types';
import type {
  TrackingRunFailureCategory,
  TrackingRunFailureUserAction,
} from '@open-design/contracts';

// AMR model-gateway console wallet (account, balance, recharge).
// `source=open_design` tags the landing page_view so vela analytics can
// attribute the visit to Open Design (per-product revenue/traffic attribution).
export const AMR_CONSOLE_URL =
  'https://open-design.ai/amr/wallet?source=open_design';
export const AMR_RECHARGE_URL = AMR_CONSOLE_URL;

const AMR_CONSOLE_URL_BY_PROFILE: Record<string, string> = {
  prod: AMR_CONSOLE_URL,
  test: 'https://vela.powerformer.net/wallet?source=open_design',
  local: 'http://localhost:5173/wallet?source=open_design',
};

export function amrConsoleUrlForProfile(profile: string | null | undefined): string {
  const normalized = profile?.trim() || 'prod';
  return AMR_CONSOLE_URL_BY_PROFILE[normalized] ?? AMR_CONSOLE_URL;
}

export function amrRechargeUrlForProfile(profile: string | null | undefined): string {
  return amrConsoleUrlForProfile(profile);
}

export function amrProfileBadgeLabel(profile: string | null | undefined): string | null {
  if (profile === 'test') return 'TEST';
  if (profile === 'local') return 'LOCAL';
  return null;
}

// Codes that mean a non-AMR agent hit "the model service rejected or could not
// serve the run" — auth missing/invalid, quota/rate exhausted, or the upstream
// model endpoint was unavailable. These are the failures worth promoting AMR
// for. Generic process failures (AGENT_EXECUTION_FAILED) and missing binaries
// (AGENT_UNAVAILABLE) are excluded.
const PROMOTE_AMR_CODES = new Set<string>([
  'AGENT_AUTH_REQUIRED',
  'UNAUTHORIZED',
  'RATE_LIMITED',
  'UPSTREAM_UNAVAILABLE',
]);

// Primary action offered in the gray error card.
//   - retry:                       re-run with the current agent.
//   - authorize:                   AMR sign-in/authorize flow, then auto-retry on success.
//   - recharge:                    open the AMR wallet (manual retry afterwards).
//   - launch-terminal-auth:        Antigravity-specific. agy's `-p`
//                                  print mode cannot complete Google
//                                  Sign-In on its own (no input field
//                                  for the auth code), so OD spawns a
//                                  system Terminal running `agy` and
//                                  the user finishes OAuth there.
//   - launch-terminal-switch-model: Antigravity-specific. agy has no
//                                  `--model` flag (upstream #35), so
//                                  switching to a model with available
//                                  quota means opening agy's TUI and
//                                  using its Switch Model picker. The
//                                  daemon spawns the same terminal as
//                                  launch-terminal-auth — the button
//                                  label is the only thing that changes.
// Both terminal-launch actions pair with `secondaryRetry: true` so the
// user has a Retry button after the external step completes (OAuth /
// switching models happens out-of-band; we can't auto-retry from the
// daemon side).
export type RunFailurePrimaryAction =
  | 'retry'
  | 'authorize'
  | 'recharge'
  | 'launch-terminal-auth'
  | 'launch-terminal-switch-model';

// i18n keys for the gray-card text override (null = show the raw error).
// Keys ending in a value with `{agent}` are interpolated at render time via
// t(key, { agent }) (see ChatPane displayError).
export type RunFailureMessageKey =
  | 'chat.amrError.authMessage'
  | 'chat.amrError.balanceMessage'
  | 'chat.connectionDropped'
  | 'chat.runError.signInMessage.amr'
  | 'chat.runError.signInMessage.other'
  | null;

// i18n keys for the unified error card's TITLE (the "error type" line above the
// detail message). Frontend-only mapping from error code → human-readable type;
// the daemon does not yet emit a type name (the raw status label is just the
// word "error"). A full backend type ⇄ frontend pairing is a later effort.
export type RunFailureTitleKey =
  | 'chat.runError.title.authRequired'
  | 'chat.runError.title.balance'
  | 'chat.runError.title.connectionDropped'
  | 'chat.runError.title.signInRequired'
  | 'chat.runError.title.rateLimited'
  | 'chat.runError.title.generic';

export interface RunFailureUi {
  primaryAction: RunFailurePrimaryAction;
  // Title shown above the detail message — names the failure type. Widened from
  // RunFailureTitleKey to any Dict key so the daemon's 12 failure categories can
  // each contribute a clearer title (see enrichFailureUiWithCategory).
  titleKey: keyof Dict;
  // Override the gray error card's text (e.g. AMR auth / balance get a clearer
  // explanation than the raw upstream string).
  messageKey: RunFailureMessageKey;
  // Human-readable reason for the failure, derived from the daemon's structured
  // `failureCategory`. When set it becomes the card's main detail line; the raw
  // error sinks into the collapsible source. Null = fall back to messageKey/raw.
  reasonKey?: keyof Dict | null;
  // What happens after the user acts (e.g. "Re-runs with the same input").
  expectationKey?: keyof Dict | null;
  // Short retry guidance ("Retry now." / "Wait a few seconds, then retry.").
  retryHintKey?: keyof Dict | null;
  // Show a secondary plain "retry" button alongside the primary action (used
  // by the recharge case, where retry is manual after topping up).
  secondaryRetry: boolean;
  // Show the AMR promotion card under the gray error card.
  showSwitchCard: boolean;
}

// Resolve the failure UI for a failed run:
//   - AMR agent, auth required      → authorize-and-retry button, clearer copy
//   - AMR agent, insufficient funds → recharge button + manual retry, clearer copy
//   - AMR agent, anything else      → plain retry
//   - non-AMR agent, model/auth/quota error → plain retry + promotion card
//   - non-AMR agent, generic failure        → plain retry
export function resolveRunFailureUi(
  code: string | null | undefined,
  agentId: string | null | undefined,
): RunFailureUi {
  if (agentId === 'amr') {
    if (code === 'AMR_AUTH_REQUIRED') {
      return {
        primaryAction: 'authorize',
        // PRD「需要登录」type — shared title with the non-AMR sign-in case.
        titleKey: 'chat.runError.title.signInRequired',
        // "Open Design 智能体尚未登录，前往登录即可正常使用" — single CTA, no
        // AMR promotion (the agent already IS AMR). The authorize action reuses
        // the inline AmrLoginPill (sign-in + auto-retry on success).
        messageKey: 'chat.runError.signInMessage.amr',
        secondaryRetry: false,
        showSwitchCard: false,
      };
    }
    if (code === 'AMR_INSUFFICIENT_BALANCE') {
      return {
        primaryAction: 'recharge',
        titleKey: 'chat.runError.title.balance',
        messageKey: 'chat.amrError.balanceMessage',
        secondaryRetry: true,
        showSwitchCard: false,
      };
    }
    return {
      primaryAction: 'retry',
      titleKey: 'chat.runError.title.generic',
      messageKey: null,
      secondaryRetry: false,
      showSwitchCard: false,
    };
  }
  // Antigravity's auth flow is terminal-only — see the
  // `launch-terminal-auth` action comment for why. Without this branch
  // the user sees the daemon-emitted guidance text and would have to
  // open a terminal themselves; with it they get a one-click button
  // that opens Terminal.app / x-terminal-emulator / cmd with `agy`
  // running, and a Retry button to redo the chat after OAuth completes.
  if (agentId === 'antigravity') {
    if (code === 'AGENT_AUTH_REQUIRED') {
      return {
        primaryAction: 'launch-terminal-auth',
        titleKey: 'chat.runError.title.signInRequired',
        messageKey: null,
        secondaryRetry: true,
        showSwitchCard: false,
      };
    }
    // Quota: each Antigravity model has its own quota, so the action
    // is "open agy, switch model" rather than "sign in." Same handler
    // spawns the same terminal; only the label changes.
    if (code === 'RATE_LIMITED') {
      return {
        primaryAction: 'launch-terminal-switch-model',
        titleKey: 'chat.runError.title.rateLimited',
        messageKey: null,
        secondaryRetry: true,
        showSwitchCard: false,
      };
    }
  }
  // Agent-neutral: a mid-response connection drop (any agent) gets a clear,
  // localized "lost connection — retry" message instead of the raw SDK string.
  // Not an AMR-promotable case: the break is the user's own network path, which
  // switching model service wouldn't fix.
  if (code === 'AGENT_CONNECTION_DROPPED') {
    return {
      primaryAction: 'retry',
      titleKey: 'chat.runError.title.connectionDropped',
      messageKey: 'chat.connectionDropped',
      secondaryRetry: false,
      showSwitchCard: false,
    };
  }
  // Non-AMR sign-in required (any non-amr, non-antigravity agent — those two are
  // handled above). The agent's login lives in the user's own terminal, so Open
  // Design can't sign in for them: surface a "{agent} 尚未登录，请本地检查登录状态"
  // message, offer Retry as the primary action (re-run after they log in
  // locally), and promote AMR as the steadier alternative via the switch card.
  if (code === 'AGENT_AUTH_REQUIRED' || code === 'UNAUTHORIZED') {
    return {
      primaryAction: 'retry',
      titleKey: 'chat.runError.title.signInRequired',
      messageKey: 'chat.runError.signInMessage.other',
      secondaryRetry: false,
      showSwitchCard: true,
    };
  }
  const promote = typeof code === 'string' && PROMOTE_AMR_CODES.has(code);
  return {
    primaryAction: 'retry',
    titleKey: 'chat.runError.title.generic',
    messageKey: null,
    secondaryRetry: false,
    showSwitchCard: promote,
  };
}

// Human-readable copy contributed by the daemon's structured failure category,
// layered on top of the errorCode-derived base UI (see
// enrichFailureUiWithCategory). Only the "informational" categories appear here:
// `auth` / `insufficient_balance` keep their interactive base UI (AMR sign-in
// pill, recharge) untouched, so this map intentionally omits them.
type CategoryCopy = Pick<RunFailureUi, 'reasonKey' | 'expectationKey' | 'retryHintKey'> & {
  // Upgrades the title ONLY when the base resolver fell back to the generic one.
  titleKey?: keyof Dict;
};

const CATEGORY_COPY: Partial<Record<TrackingRunFailureCategory, CategoryCopy>> = {
  rate_limit: {
    titleKey: 'chat.runError.title.rateLimited',
    reasonKey: 'chat.runError.reason.rateLimit',
    expectationKey: 'chat.runError.expectation.retry',
    retryHintKey: 'chat.runError.retryHint.wait',
  },
  model_unavailable: {
    titleKey: 'chat.runError.title.modelUnavailable',
    reasonKey: 'chat.runError.reason.modelUnavailable',
    expectationKey: 'chat.runError.expectation.switchModel',
    retryHintKey: 'chat.runError.retryHint.now',
  },
  prompt_too_large: {
    titleKey: 'chat.runError.title.promptTooLarge',
    reasonKey: 'chat.runError.reason.promptTooLarge',
    expectationKey: 'chat.runError.expectation.reduceContext',
    retryHintKey: null,
  },
  upstream_unavailable: {
    titleKey: 'chat.runError.title.upstreamUnavailable',
    reasonKey: 'chat.runError.reason.upstreamUnavailable',
    expectationKey: 'chat.runError.expectation.retry',
    retryHintKey: 'chat.runError.retryHint.wait',
  },
  timeout: {
    titleKey: 'chat.runError.title.timeout',
    reasonKey: 'chat.runError.reason.timeout',
    expectationKey: 'chat.runError.expectation.retry',
    retryHintKey: 'chat.runError.retryHint.now',
  },
  empty_output: {
    titleKey: 'chat.runError.title.emptyOutput',
    reasonKey: 'chat.runError.reason.emptyOutput',
    expectationKey: 'chat.runError.expectation.retry',
    retryHintKey: 'chat.runError.retryHint.now',
  },
  tool_error: {
    titleKey: 'chat.runError.title.toolError',
    reasonKey: 'chat.runError.reason.toolError',
    expectationKey: 'chat.runError.expectation.retry',
    retryHintKey: 'chat.runError.retryHint.afterFix',
  },
  process_exit: {
    titleKey: 'chat.runError.title.processExit',
    reasonKey: 'chat.runError.reason.processExit',
    expectationKey: 'chat.runError.expectation.retry',
    retryHintKey: 'chat.runError.retryHint.now',
  },
  user_cancel: {
    titleKey: 'chat.runError.title.userCancel',
    reasonKey: 'chat.runError.reason.userCancel',
    expectationKey: null,
    retryHintKey: null,
  },
  unknown: {
    reasonKey: 'chat.runError.reason.unknown',
    expectationKey: 'chat.runError.expectation.retry',
    retryHintKey: 'chat.runError.retryHint.now',
  },
};

// Layer the daemon's structured failure classification onto the errorCode-derived
// base UI. The base (resolveRunFailureUi) owns the interactive recovery flows
// (AMR sign-in/recharge, Antigravity terminal, connection-drop) and is left
// intact; this only adds a human-readable reason / expectation / retry hint for
// the previously-generic failures, and upgrades the generic title when we have a
// more specific one. `userAction` is reserved for PR-2b's category-specific CTAs.
export function enrichFailureUiWithCategory(
  base: RunFailureUi,
  category: TrackingRunFailureCategory | null | undefined,
  _userAction: TrackingRunFailureUserAction | null | undefined,
): RunFailureUi {
  if (!category) return base;
  const copy = CATEGORY_COPY[category];
  if (!copy) return base;
  return {
    ...base,
    titleKey:
      copy.titleKey && base.titleKey === 'chat.runError.title.generic'
        ? copy.titleKey
        : base.titleKey,
    reasonKey: copy.reasonKey ?? null,
    expectationKey: copy.expectationKey ?? null,
    retryHintKey: copy.retryHintKey ?? null,
  };
}
