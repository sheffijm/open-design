import type { OkResponse } from '../common.js';
import type { ProjectSyncState } from './project-sync.js';

// Team-edition collaboration shared DTOs: presence overlay (presence) and
// the sync trigger. Single source of truth for the daemon routes, the web
// CollabClient, and the `od collab` CLI so no surface re-declares these shapes.

export type CollabMemberRole = 'owner' | 'admin' | 'member';

/** A member present in a shared project (heartbeat identity). */
export interface CollabPresenceMember {
  memberId: string;
  name?: string;
  role?: CollabMemberRole;
}

/** GET /api/projects/:id/presence and the heartbeat response body. */
export interface CollabPresenceResponse {
  present: CollabPresenceMember[];
}

/** POST /api/projects/:id/presence/heartbeat request body. */
export interface CollabPresenceHeartbeatRequest {
  memberId: string;
  name?: string;
  role?: CollabMemberRole;
}

/** POST /api/projects/:id/presence/leave request body. */
export interface CollabPresenceLeaveRequest {
  memberId: string;
}

export interface CollabPresenceLeaveResponse extends OkResponse {
  present: CollabPresenceMember[];
}

/**
 * GET /api/projects/:id/collab/status. `publishedVersion` is the head version
 * members poll to learn when to pull; null before the first publish.
 * `syncState` is the project sync state (see {@link ProjectSyncState}).
 */
export interface CollabSyncStatusResponse {
  publishedVersion: number | null;
  syncState: ProjectSyncState;
}

/** POST /api/projects/:id/collab/sync-intent response. */
export interface CollabSyncIntentResponse extends OkResponse {
  syncState: ProjectSyncState;
}

// Workspace context seam onto the B (identity/membership) + D (visibility)
// lanes. A faithful SUBSET of B's `CurrentWorkspaceContext`
// (vela packages/shared/src/workspace-context.ts) — the exact fields C needs to
// decide whether collab runs and who the present member is — so wiring B's real
// context in is a direct field pass-through. Field names mirror B verbatim.

export type WorkspaceType = 'personal' | 'team';
export type WorkspaceMemberStatus = 'active' | 'removed';
export type WorkspaceLifecycleState =
  | 'active'
  | 'billing_past_due'
  | 'locked'
  | 'deleting'
  | 'deleted';

/**
 * How the workspace pays for model calls. `platform_credits` is the AMR/vela
 * cloud path; `personal_byok` is the user's own key. This axis is ORTHOGONAL to
 * whether team collab is on — a `personal_byok` workspace still has full team
 * features (gate on {@link WorkspaceLifecycleState}/role, never on providerMode).
 * Mirrors B's `workspaceProviderMode` (vela packages/shared/src/workspace-context.ts).
 */
export type WorkspaceProviderMode = 'platform_credits' | 'personal_byok';

/** Billing truth (billing UI only). Mirrors B's `workspaceBillingState`. */
export type WorkspaceBillingState =
  | 'free'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'inactive'
  | 'locked';

/**
 * Permission bits — a verbatim mirror of B's `WorkspacePermissions`
 * (vela packages/shared/src/workspace-context.ts, `buildWorkspacePermissions`).
 * C surfaces CONSUME these to gate UI; never re-derive from role/lifecycle so the
 * two lanes cannot drift. `canWriteSyncedFiles` is the read-only gate for collab;
 * `canManageSharedResources`/`canShareProjects` gate resource sharing.
 */
export interface WorkspacePermissions {
  canManageMembers: boolean;
  canManageBilling: boolean;
  canInviteMembers: boolean;
  canManageAutoRecharge: boolean;
  canShareProjects: boolean;
  canWriteSyncedFiles: boolean;
  canViewWorkspaceSettings: boolean;
  canManageSharedResources: boolean;
}

/** Seat accounting summary. Mirrors B's `WorkspaceSeatSummary`. */
export interface WorkspaceSeatSummary {
  seatLimit: number;
  usedSeats: number;
  availableSeats: number;
  isSeatFull: boolean;
}

/** Billing-recovery entry (locked/past-due). Mirrors B's `WorkspaceBillingRecovery`. */
export interface WorkspaceBillingRecovery {
  canEnterBillingRecovery: boolean;
  recoveryUrl: string | null;
}

/**
 * The one shared workspace context every team surface consumes. A faithful mirror
 * of B's `CurrentWorkspaceContext` (vela packages/shared/src/workspace-context.ts,
 * shipped in powerformer/vela#615) so the daemon's `/api/workspace/context` proxy
 * is a straight field pass-through and no C surface re-derives role/plan/permission
 * judgements. `context` is null off-team (personal, signed out, or B unavailable).
 */
export interface WorkspaceCollabContext {
  workspaceId: string;
  workspaceType: WorkspaceType;
  workspaceMemberId: string;
  role: CollabMemberRole;
  memberStatus: WorkspaceMemberStatus;
  lifecycleState: WorkspaceLifecycleState;
  billingState: WorkspaceBillingState;
  planId: string | null;
  providerMode: WorkspaceProviderMode;
  seatSummary: WorkspaceSeatSummary;
  permissions: WorkspacePermissions;
  billingRecovery?: WorkspaceBillingRecovery;
  /**
   * URL of the team's settings/management console on the cloud web app. Team
   * management (members, billing, dashboard) lives there — the local client only
   * links out to it; it does not embed those views. Absent for a personal
   * workspace or when the console URL is not resolvable.
   */
  workspaceSettingsUrl?: string;
  lastActiveWorkspaceId?: string;
  /** Team id — present for a team workspace, absent for a personal one. Lets the
   *  resource-hub principal derive from this one context (single identity source). */
  teamId?: string;
  /** Human-friendly team name for the workspace switcher (falls back to teamId). */
  teamName?: string;
  /** Display name for the presence overlay (optional; falls back to the id). */
  displayName?: string;
}

/**
 * GET /api/workspace/context. The daemon's single B-integration point: in
 * production it proxies B's context for the caller; `context` is null when there
 * is no team-workspace context (personal, signed out, or B unavailable).
 */
export interface WorkspaceContextResponse {
  context: WorkspaceCollabContext | null;
}

// —— Derivation helpers — a verbatim mirror of B's vela
// packages/shared/src/workspace-context.ts. Both the daemon's dev context stub
// and the real B proxy derive permissions/seat summary through these, so C never
// drifts from B's authorization rules. If B's helper changes, update here too.

export function isWorkspaceLifecycleReadable(state: WorkspaceLifecycleState): boolean {
  return state !== 'deleted';
}

export function isWorkspaceLifecycleWritable(state: WorkspaceLifecycleState): boolean {
  return state === 'active';
}

export function buildWorkspacePermissions(input: {
  role: CollabMemberRole;
  lifecycleState: WorkspaceLifecycleState;
  memberStatus?: WorkspaceMemberStatus;
}): WorkspacePermissions {
  const memberStatus = input.memberStatus ?? 'active';
  const readable =
    memberStatus === 'active' && isWorkspaceLifecycleReadable(input.lifecycleState);
  const writable =
    memberStatus === 'active' && isWorkspaceLifecycleWritable(input.lifecycleState);
  const isOwner = input.role === 'owner';
  const isAdmin = input.role === 'admin';
  return {
    canManageMembers: writable && (isOwner || isAdmin),
    canManageBilling: readable && isOwner,
    canInviteMembers: writable && (isOwner || isAdmin),
    canManageAutoRecharge: writable && isOwner,
    canShareProjects: writable,
    canWriteSyncedFiles: writable,
    canViewWorkspaceSettings: readable,
    canManageSharedResources: writable && (isOwner || isAdmin),
  };
}

export function buildWorkspaceSeatSummary(input: {
  seatLimit: number;
  usedSeats: number;
}): WorkspaceSeatSummary {
  const availableSeats = Math.max(input.seatLimit - input.usedSeats, 0);
  return {
    seatLimit: input.seatLimit,
    usedSeats: input.usedSeats,
    availableSeats,
    isSeatFull: availableSeats === 0,
  };
}
