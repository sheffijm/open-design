import type { Express } from 'express';
import type { ProjectSyncIntentEvent } from '@open-design/contracts';
import type { CollabRuntime } from '../collab/runtime.js';
import { readProjectManifest } from '../project-locations.js';

/** The fields register-on-pull reads out of a pulled project's manifest (a
 *  `.open-design/project.json`-type file under the materialized dir). Every field
 *  is optional so a manifest-less pull still registers under a placeholder name. */
export interface PulledProjectManifest {
  name?: string;
  skillId?: string | null;
  designSystemId?: string | null;
  createdAt?: number;
  updatedAt?: number;
}

/** The record register-on-pull inserts so a pulled shared project appears in
 *  `/api/projects` and can be opened. Read-only is NOT a flag here — the member
 *  isn't the owner, so `useProjectCollab` keeps it single-writer read-only. */
export interface RegisterPulledProjectInput {
  id: string;
  name: string;
  skillId: string | null;
  designSystemId: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Local project-store seam for register-on-pull. Kept behind an interface so the
 *  route stays free of `db`/SQLite while the daemon wires it to the real store. */
export interface PulledProjectStore {
  /** Whether a project is already registered locally (idempotency guard). */
  has(projectId: string): boolean;
  /** Register a freshly pulled shared project as a local project record. */
  register(input: RegisterPulledProjectInput): void;
}

export interface RegisterCollabSyncRoutesDeps {
  collab: Pick<
    CollabRuntime,
    | 'scheduler'
    | 'publishedVersion'
    | 'projectSyncState'
    | 'projectOwnerMemberId'
    | 'requestTeamShare'
    | 'pullLatest'
    | 'workspaceContext'
  >;
  /**
   * Resolve the member who shared a project (its single writer), from the team
   * hub — server-authoritative and read at status time, so a member's read-only
   * state derives from the hub rather than a client-supplied id or an in-memory
   * pull record that a daemon restart would lose. Returns null when the project is
   * not team-shared (off-team / hub unconfigured / owned by nobody in the list),
   * in which case the project is a normal editable local project.
   */
  resolveSharedProjectOwner?: (projectId: string) => Promise<string | null>;
  /**
   * Optional project-store seam. When present, `POST /api/projects/:id/collab/pull`
   * registers the pulled shared project locally (idempotently) so a member can
   * open it like any other project. Omitted in unit contexts that only exercise
   * the sync triggers, in which case a pull materializes content but does not
   * register a local record.
   */
  projectStore?: PulledProjectStore;
  /**
   * Resolve the on-disk dir a pull materializes into, so registration can read
   * the shared project's manifest for its real name. Should mirror the pull dir
   * the collab runtime writes to. Required alongside `projectStore`.
   */
  resolvePullDir?: (projectId: string) => string;
  /** Injectable manifest reader; defaults to `.open-design/project.json`. */
  readManifest?: (projectDir: string) => Promise<PulledProjectManifest | null>;
}

const SYNC_INTENT_EVENTS: ReadonlySet<ProjectSyncIntentEvent> = new Set([
  'project_visibility_changed',
  'project_team_share_requested',
]);

/**
 * Team collaboration sync trigger, exposed as a client-driven capability . The client is authoritative about whether it is in a shared context, so
 * it drives the trigger — the daemon does not need D's visibility fact to gate
 * this. Publishing content + advancing the published ref is the resource hub; here
 * we only coalesce and flush.
 */
export function registerCollabSyncRoutes(app: Express, deps: RegisterCollabSyncRoutesDeps): void {
  const {
    scheduler,
    publishedVersion,
    projectSyncState,
    projectOwnerMemberId,
    requestTeamShare,
    pullLatest,
    workspaceContext,
  } = deps.collab;
  const { projectStore, resolvePullDir, resolveSharedProjectOwner } = deps;
  const readManifest = deps.readManifest ?? readProjectManifest;

  // Register a freshly pulled shared project as a local project record so it
  // appears in `/api/projects` and can be opened. Idempotent (a project the
  // member already has locally is left untouched) and best-effort — the pull
  // response never fails on a registration hiccup. The real name comes from the
  // pulled project's manifest when the materialized tree carries one; otherwise
  // it registers under a placeholder ("共享项目") until a manifest is present.
  async function registerPulledProject(projectId: string): Promise<void> {
    if (!projectStore || !resolvePullDir) return;
    if (projectStore.has(projectId)) return;
    let manifest: PulledProjectManifest | null = null;
    try {
      manifest = await readManifest(resolvePullDir(projectId));
    } catch {
      manifest = null;
    }
    const now = Date.now();
    const name = manifest?.name?.trim() || '共享项目';
    projectStore.register({
      id: projectId,
      name,
      skillId: manifest?.skillId ?? null,
      designSystemId: manifest?.designSystemId ?? null,
      createdAt: typeof manifest?.createdAt === 'number' ? manifest.createdAt : now,
      updatedAt: typeof manifest?.updatedAt === 'number' ? manifest.updatedAt : now,
    });
  }

  // An author-side edit landed. The publish is coalesced within the scheduler's
  // window so a burst of edits collapses into one publish.
  app.post('/api/projects/:id/collab/changed', (req, res) => {
    scheduler.notifyChanged(req.params.id, 'change');
    res.json({ ok: true });
  });

  // Run boundary — flush any pending publish immediately (publish the stable
  // end-of-run state rather than waiting out the debounce).
  app.post('/api/projects/:id/collab/publish', (req, res) => {
    scheduler.notifyChanged(req.params.id, 'run');
    scheduler.runBoundary(req.params.id);
    res.json({ ok: true });
  });

  // visibility-to-sync orchestration seam. The visibility surface flips project visibility and emits a
  // ProjectSyncIntent here; the sync trigger owns the reaction. `project_team_share_requested`
  // marks the project pending and flushes a publish (which drives E's resource
  // mechanism behind the scheduler). `project_visibility_changed` is accepted as
  // a no-op signal for now (the share request is the actionable one).
  app.post('/api/projects/:id/collab/sync-intent', async (req, res) => {
    const event = (req.body as { event?: unknown } | undefined)?.event;
    if (typeof event !== 'string' || !SYNC_INTENT_EVENTS.has(event as ProjectSyncIntentEvent)) {
      return res.status(400).json({ error: 'invalid sync intent event' });
    }
    if (event === 'project_team_share_requested') {
      // The caller sharing the project is its single writer; record their id so
      // members can distinguish it from a project of their own.
      const context = await workspaceContext.current({
        authorization: req.headers.authorization,
      });
      // Server-side permission gate, mirroring team resource sharing: a team
      // member without `canShareProjects` is refused — the client hides the
      // affordance, but the daemon must not trust the client to enforce it. No
      // team context stays a silent no-op (the publish adapter no-ops off-team).
      if (context && !context.permissions.canShareProjects) {
        return res.status(403).json({ error: 'WORKSPACE_PROJECT_SHARE_DENIED' });
      }
      requestTeamShare(req.params.id, context?.workspaceMemberId);
    }
    res.json({ ok: true, syncState: projectSyncState(req.params.id) });
  });

  // Member pull trigger (the sync trigger owns *when*; the resource hub fetches + extracts the bytes behind the
  // adapter). Returns the head version that was pulled.
  app.post('/api/projects/:id/collab/pull', async (req, res) => {
    const projectId = req.params.id;
    const result = await pullLatest(projectId);
    // Register the pulled project locally so it opens like any other project.
    // Best-effort: a registration failure must not fail the pull itself.
    try {
      await registerPulledProject(projectId);
    } catch {
      /* registration is best-effort; leave the pull result standing */
    }
    res.json({ ok: true, version: result.version });
  });

  // Members poll this to learn the published head version they should pull and
  // the current sync state (local_only / pending_upload / synced / sync_failed).
  app.get('/api/projects/:id/collab/status', async (req, res) => {
    const projectId = req.params.id;
    let syncState = projectSyncState(projectId);
    let ownerMemberId = projectOwnerMemberId(projectId);
    // Read-only is DERIVED from the team hub at read time, not cached from a pull.
    // In-memory state (`syncStates`/`owners`) only tracks THIS daemon's own share
    // lifecycle (an author publishing their project). A project with no local
    // lifecycle (`local_only`) is still read-only for a member if the hub lists it
    // as shared by someone else — so read-only survives a daemon restart (which
    // clears the in-memory maps) and an already-pulled project opened without a
    // re-pull. The owner's own project resolves to their own id here, so their
    // client still computes isOwner=true and keeps editing. When this hub read
    // becomes a slow vela proxy, cache it behind the version probe (see
    // team-projects.ts TODO) rather than hitting it on every status poll.
    if (syncState === 'local_only' && resolveSharedProjectOwner) {
      try {
        const hubOwner = await resolveSharedProjectOwner(projectId);
        if (hubOwner != null) {
          syncState = 'synced';
          ownerMemberId = hubOwner;
        }
      } catch {
        // Hub unavailable: fall back to the local (editable) state.
      }
    }
    res.json({
      publishedVersion: publishedVersion(projectId),
      syncState,
      ownerMemberId,
    });
  });
}
