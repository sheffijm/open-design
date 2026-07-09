import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
} from '@open-design/contracts';
import type {
  CollabMemberRole,
  WorkspaceBillingState,
  WorkspaceCollabContext,
  WorkspaceLifecycleState,
  WorkspaceMemberStatus,
  WorkspaceProviderMode,
  WorkspaceType,
} from '@open-design/contracts';

// The daemon's single B-integration point . Presence + sync need the
// caller's workspace identity (workspaceMemberId + role + lifecycle). In
// production this provider verifies the request's auth against the B service and
// returns B's CurrentWorkspaceContext for that user; until B is reachable, the
// dev provider below holds an in-memory context that a demo/tools-dev run can
// set. Swapping the provider is the only change when B ships — routes and the
// web client stay put.

export interface WorkspaceContextRequest {
  /** The caller's bearer token (a real provider verifies this against B). */
  authorization?: string | undefined;
}

export interface WorkspaceContextProvider {
  current(req: WorkspaceContextRequest): Promise<WorkspaceCollabContext | null>;
  /**
   * Dev/demo seam: override the returned context. Absent on a real B-backed
   * provider (whose context is derived per-request from the token).
   */
  set?(context: WorkspaceCollabContext | null): void;
}

const WORKSPACE_TYPES: ReadonlySet<WorkspaceType> = new Set(['personal', 'team']);
const ROLES: ReadonlySet<CollabMemberRole> = new Set(['owner', 'admin', 'member']);
const MEMBER_STATUSES: ReadonlySet<WorkspaceMemberStatus> = new Set(['active', 'removed']);
const LIFECYCLE_STATES: ReadonlySet<WorkspaceLifecycleState> = new Set([
  'active',
  'billing_past_due',
  'locked',
  'deleting',
  'deleted',
]);
const PROVIDER_MODES: ReadonlySet<WorkspaceProviderMode> = new Set([
  'platform_credits',
  'personal_byok',
]);
const BILLING_STATES: ReadonlySet<WorkspaceBillingState> = new Set([
  'free',
  'active',
  'past_due',
  'canceled',
  'inactive',
  'locked',
]);

/** Fallback billing state derived from lifecycle, used when a dev payload omits
 *  it. Production always carries B's authoritative `billingState`. */
function billingStateForLifecycle(lifecycle: WorkspaceLifecycleState): WorkspaceBillingState {
  switch (lifecycle) {
    case 'active':
      return 'active';
    case 'billing_past_due':
      return 'past_due';
    case 'locked':
      return 'locked';
    default:
      return 'inactive';
  }
}

function nonNegativeInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback;
}

/**
 * The URL of the team's settings/management console on the cloud web app. Team
 * management (members, billing, dashboard) lives there — the local client only
 * links out to it. Prefers an explicit value the upstream context carries;
 * otherwise builds one from `OD_VELA_WEB_URL` when configured. Undefined when
 * neither is available (the client then hides the settings entry).
 */
export function resolveWorkspaceSettingsUrl(
  workspaceId: string,
  explicit: unknown,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  const base = env.OD_VELA_WEB_URL?.trim();
  if (!base) return undefined;
  // The cloud web app serves the current workspace's settings at /settings (the
  // workspace is implicit from the signed-in session — no id in the path). We
  // still take an explicit URL first, so if the upstream context ever carries one
  // it wins over this construction.
  void workspaceId;
  return `${base.replace(/\/$/, '')}/settings`;
}

/**
 * Validate an untrusted workspace-context payload (dev PUT body / env). Returns
 * the typed context or null if any required enum field is missing or out of enum.
 * Permissions and the seat summary are DERIVED through the contract helpers
 * (B's `buildWorkspacePermissions`/`buildWorkspaceSeatSummary` mirror) so a dev
 * payload only needs role + lifecycle + seat counts; the real B proxy passes
 * B's already-derived values straight through.
 */
export function parseWorkspaceCollabContext(input: unknown): WorkspaceCollabContext | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const workspaceMemberId = typeof raw.workspaceMemberId === 'string' ? raw.workspaceMemberId.trim() : '';
  if (!workspaceMemberId) return null;
  if (!WORKSPACE_TYPES.has(raw.workspaceType as WorkspaceType)) return null;
  if (!ROLES.has(raw.role as CollabMemberRole)) return null;
  if (!MEMBER_STATUSES.has(raw.memberStatus as WorkspaceMemberStatus)) return null;
  if (!LIFECYCLE_STATES.has(raw.lifecycleState as WorkspaceLifecycleState)) return null;

  const workspaceType = raw.workspaceType as WorkspaceType;
  const role = raw.role as CollabMemberRole;
  const memberStatus = raw.memberStatus as WorkspaceMemberStatus;
  const lifecycleState = raw.lifecycleState as WorkspaceLifecycleState;
  const teamId = typeof raw.teamId === 'string' && raw.teamId.trim() ? raw.teamId.trim() : undefined;
  const workspaceId =
    typeof raw.workspaceId === 'string' && raw.workspaceId.trim()
      ? raw.workspaceId.trim()
      : (teamId ?? workspaceMemberId);
  const providerMode = PROVIDER_MODES.has(raw.providerMode as WorkspaceProviderMode)
    ? (raw.providerMode as WorkspaceProviderMode)
    : 'platform_credits';
  const billingState = BILLING_STATES.has(raw.billingState as WorkspaceBillingState)
    ? (raw.billingState as WorkspaceBillingState)
    : billingStateForLifecycle(lifecycleState);
  const planId = typeof raw.planId === 'string' && raw.planId.trim() ? raw.planId.trim() : null;
  const seatLimit = nonNegativeInt(raw.seatLimit, workspaceType === 'team' ? 5 : 1);
  const usedSeats = nonNegativeInt(raw.usedSeats, 1);

  const context: WorkspaceCollabContext = {
    workspaceId,
    workspaceType,
    workspaceMemberId,
    role,
    memberStatus,
    lifecycleState,
    billingState,
    planId,
    providerMode,
    seatSummary: buildWorkspaceSeatSummary({ seatLimit, usedSeats }),
    permissions: buildWorkspacePermissions({ role, lifecycleState, memberStatus }),
  };
  if (teamId) context.teamId = teamId;
  if (workspaceType === 'team') {
    const settingsUrl = resolveWorkspaceSettingsUrl(workspaceId, raw.workspaceSettingsUrl);
    if (settingsUrl) context.workspaceSettingsUrl = settingsUrl;
  }
  if (typeof raw.teamName === 'string' && raw.teamName.trim()) {
    context.teamName = raw.teamName.trim();
  }
  if (typeof raw.displayName === 'string' && raw.displayName.trim()) {
    context.displayName = raw.displayName.trim();
  }
  if (typeof raw.lastActiveWorkspaceId === 'string' && raw.lastActiveWorkspaceId.trim()) {
    context.lastActiveWorkspaceId = raw.lastActiveWorkspaceId.trim();
  }
  return context;
}

/**
 * Dev/demo provider: holds a single in-memory context, optionally seeded from
 * `OD_DEV_WORKSPACE_CONTEXT` (JSON). Ignores the request — a real B-backed
 * provider derives the context per-caller from the token instead.
 */
export function createDevWorkspaceContextProvider(
  seed?: WorkspaceCollabContext | null,
): WorkspaceContextProvider {
  let context: WorkspaceCollabContext | null = seed ?? readEnvContext();
  return {
    current: () => Promise.resolve(context),
    set: (next) => {
      context = next;
    },
  };
}

function readEnvContext(): WorkspaceCollabContext | null {
  const raw = process.env.OD_DEV_WORKSPACE_CONTEXT;
  if (!raw) return null;
  try {
    return parseWorkspaceCollabContext(JSON.parse(raw));
  } catch {
    return null;
  }
}
