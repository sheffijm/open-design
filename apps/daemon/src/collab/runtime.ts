// Team-collab (C lane) daemon subsystem: bundles the author-side publish
// scheduler and the presence tracker behind one factory so the server wires
// them once. The resource hub itself is E's (沅锡) — this holds only C's
// trigger + presence, talking to the hub through ResourcePublishAdapter.

import {
  CollabPresenceTracker,
  type CollabPresenceTrackerOptions,
  type PresenceMember,
} from './presence-tracker.js';
import {
  CollabPublishScheduler,
  type CollabPublishSchedulerOptions,
  type ResourcePublishAdapter,
} from './publish-scheduler.js';
import { createStubResourcePublishAdapter } from './stub-resource-adapter.js';

export interface CollabRuntime {
  presence: CollabPresenceTracker;
  scheduler: CollabPublishScheduler;
  dispose(): void;
}

export interface CreateCollabRuntimeOptions {
  /** Resource hub client. Defaults to the local stub until E's client ships. */
  adapter?: ResourcePublishAdapter;
  /** Fired after a project is published so the caller can notify online members. */
  onPublished?: (result: { projectId: string; version: number; reason: string }) => void;
  /** Fired when a project's presence set changes (join/leave). */
  onPresenceChange?: (result: { projectId: string; present: PresenceMember[] }) => void;
  onError?: (result: { projectId: string; error: unknown }) => void;
}

export function createCollabRuntime(options: CreateCollabRuntimeOptions = {}): CollabRuntime {
  const adapter = options.adapter ?? createStubResourcePublishAdapter();
  // Build options conditionally — exactOptionalPropertyTypes forbids assigning an
  // explicit `undefined` to an optional callback property.
  const schedulerOptions: CollabPublishSchedulerOptions = { adapter };
  if (options.onPublished) schedulerOptions.onPublished = options.onPublished;
  if (options.onError) schedulerOptions.onError = options.onError;
  const scheduler = new CollabPublishScheduler(schedulerOptions);
  const presenceOptions: CollabPresenceTrackerOptions = {};
  if (options.onPresenceChange) presenceOptions.onChange = options.onPresenceChange;
  const presence = new CollabPresenceTracker(presenceOptions);
  return {
    presence,
    scheduler,
    dispose() {
      scheduler.dispose();
      presence.dispose();
    },
  };
}
