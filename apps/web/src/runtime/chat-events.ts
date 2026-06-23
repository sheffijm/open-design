import type { ChatMessage } from '../types';
import type {
  TrackingRunFailureCategory,
  TrackingRunFailureUserAction,
} from '@open-design/contracts';

/** Structured failure classification carried alongside the error status event,
 *  mirroring ChatRunStatusResponse.failureCategory/.userAction. Optional so
 *  older runs (and non-failure paths) stay untouched. */
export interface ErrorStatusClassification {
  failureCategory?: TrackingRunFailureCategory;
  userAction?: TrackingRunFailureUserAction;
}

/** Read the failure classification stamped onto a surfaced run error by the
 *  daemon stream layer (see providers/daemon.ts markErrorFailureClassification).
 *  Returns undefined when neither field is present so callers can spread it. */
export function errorFailureClassification(
  err: unknown,
): ErrorStatusClassification | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const e = err as ErrorStatusClassification;
  if (!e.failureCategory && !e.userAction) return undefined;
  return {
    ...(e.failureCategory ? { failureCategory: e.failureCategory } : {}),
    ...(e.userAction ? { userAction: e.userAction } : {}),
  };
}

export function appendErrorStatusEvent(
  message: ChatMessage,
  detail: string,
  code?: string,
  classification?: ErrorStatusClassification,
): ChatMessage {
  if (!detail) return message;
  const events = message.events ?? [];
  const last = events[events.length - 1];
  if (last?.kind === 'status' && last.label === 'error' && last.detail === detail) {
    return message;
  }
  if (!detail?.trim()) {
    return message;
  }
  return {
    ...message,
    events: [
      ...events,
      {
        kind: 'status',
        label: 'error',
        detail,
        ...(code ? { code } : {}),
        ...(classification?.failureCategory
          ? { failureCategory: classification.failureCategory }
          : {}),
        ...(classification?.userAction ? { userAction: classification.userAction } : {}),
      },
    ],
  };
}
