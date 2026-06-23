import { describe, expect, it } from 'vitest';
import {
  enrichFailureUiWithCategory,
  resolveRunFailureUi,
} from '../../src/runtime/amr-guidance';
import {
  appendErrorStatusEvent,
  errorFailureClassification,
} from '../../src/runtime/chat-events';
import type { ChatMessage } from '../../src/types';

// PR-2: the daemon's structured failure category (PR-1) drives a human-readable
// reason / expectation / retry hint on the failure card, layered on top of the
// existing errorCode-derived UI without disturbing the interactive flows.
describe('enrichFailureUiWithCategory', () => {
  const generic = () => resolveRunFailureUi(undefined, 'claude');

  it('upgrades a generic failure with category reason + retry hint', () => {
    const ui = enrichFailureUiWithCategory(generic(), 'rate_limit', 'retry');
    expect(ui.titleKey).toBe('chat.runError.title.rateLimited');
    expect(ui.reasonKey).toBe('chat.runError.reason.rateLimit');
    expect(ui.retryHintKey).toBe('chat.runError.retryHint.wait');
  });

  it('classifies an explicit cancel for neutral rendering', () => {
    const ui = enrichFailureUiWithCategory(generic(), 'user_cancel', 'none');
    expect(ui.titleKey).toBe('chat.runError.title.userCancel');
    expect(ui.reasonKey).toBe('chat.runError.reason.userCancel');
    expect(ui.offerSwitchModel).toBe(false);
  });

  it('offers switch-model only for model-recoverable categories', () => {
    expect(
      enrichFailureUiWithCategory(generic(), 'model_unavailable', 'switch_model').offerSwitchModel,
    ).toBe(true);
    expect(
      enrichFailureUiWithCategory(generic(), 'timeout', 'retry').offerSwitchModel,
    ).toBe(true);
    // account / cancel issues a different model can't fix:
    expect(enrichFailureUiWithCategory(generic(), 'rate_limit', 'retry').offerSwitchModel).toBe(
      false,
    );
  });

  it('leaves the interactive AMR auth UI untouched', () => {
    const base = resolveRunFailureUi('AMR_AUTH_REQUIRED', 'amr');
    const ui = enrichFailureUiWithCategory(base, 'auth', 'login');
    // auth keeps its base interactive flow (sign-in pill + messageKey), no enrich.
    expect(ui.primaryAction).toBe('authorize');
    expect(ui.messageKey).toBe('chat.runError.signInMessage.amr');
    expect(ui.reasonKey ?? null).toBeNull();
  });

  it('is a no-op without a category', () => {
    const base = generic();
    expect(enrichFailureUiWithCategory(base, null, null)).toEqual(base);
  });
});

describe('error status event classification round-trip', () => {
  it('persists failureCategory/userAction onto the error status event', () => {
    const msg: ChatMessage = { id: 'm1', role: 'assistant', content: '' };
    const next = appendErrorStatusEvent(msg, 'boom', 'AGENT_EXIT_1', {
      failureCategory: 'timeout',
      userAction: 'retry',
    });
    const ev = next.events?.at(-1);
    expect(ev).toMatchObject({
      kind: 'status',
      label: 'error',
      code: 'AGENT_EXIT_1',
      failureCategory: 'timeout',
      userAction: 'retry',
    });
  });

  it('reads classification stamped on a surfaced error', () => {
    const err = Object.assign(new Error('x'), { failureCategory: 'tool_error' as const });
    expect(errorFailureClassification(err)).toEqual({ failureCategory: 'tool_error' });
    expect(errorFailureClassification(new Error('plain'))).toBeUndefined();
  });
});
