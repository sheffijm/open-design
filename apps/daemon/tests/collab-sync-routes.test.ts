import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import { createCollabRuntime, type CollabRuntime } from '../src/collab/runtime.js';
import type { WorkspaceContextProvider } from '../src/collab/workspace-context.js';
import {
  registerCollabSyncRoutes,
  type PulledProjectStore,
  type RegisterCollabSyncRoutesDeps,
  type RegisterPulledProjectInput,
} from '../src/routes/collab-sync.js';
import { writeProjectManifest } from '../src/project-locations.js';

/** In-memory project store standing in for the daemon's SQLite-backed store, so
 *  a route test can assert register-on-pull without a real database. */
function fakeProjectStore(): PulledProjectStore & {
  projects: Map<string, RegisterPulledProjectInput>;
  registerCalls: number;
} {
  const projects = new Map<string, RegisterPulledProjectInput>();
  const store = {
    projects,
    registerCalls: 0,
    has: (projectId: string) => projects.has(projectId),
    register(input: RegisterPulledProjectInput) {
      store.registerCalls += 1;
      projects.set(input.id, input);
    },
  };
  return store;
}

/** A fixed team context whose `canShareProjects` bit is forced to the tested
 *  value, served by a minimal provider (no `set` seam). */
function fixedShareContextProvider(canShareProjects: boolean): WorkspaceContextProvider {
  const context: WorkspaceCollabContext = {
    workspaceId: 'ws-1',
    workspaceType: 'team',
    workspaceMemberId: 'wm-1',
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 1 }),
    permissions: {
      ...buildWorkspacePermissions({ role: 'member', lifecycleState: 'active' }),
      canShareProjects,
    },
  };
  return { current: async () => context };
}

let server: http.Server | null = null;
let runtime: CollabRuntime | null = null;
const tempDirs: string[] = [];

afterEach(async () => {
  runtime?.dispose(); // cancel any pending debounce timers
  runtime = null;
  if (server) {
    const toClose = server;
    server = null;
    await new Promise<void>((resolve) => toClose.close(() => resolve()));
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

async function startSyncServer(
  workspaceContext?: WorkspaceContextProvider,
  extraDeps?: Omit<RegisterCollabSyncRoutesDeps, 'collab'>,
) {
  const app = express();
  app.use(express.json());
  runtime = createCollabRuntime(workspaceContext ? { workspaceContext } : {});
  registerCollabSyncRoutes(app, { collab: runtime, ...extraDeps });
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind to a TCP port');
  const base = `http://127.0.0.1:${address.port}`;
  return {
    async json(route: string, options: { method?: string; body?: unknown } = {}) {
      const init: RequestInit = { method: options.method ?? 'GET' };
      if (options.body !== undefined) {
        init.headers = { 'content-type': 'application/json' };
        init.body = JSON.stringify(options.body);
      }
      const response = await fetch(`${base}${route}`, init);
      return { status: response.status, body: (await response.json()) as Record<string, any> };
    },
    // Publishing is async (flush → adapter → onPublished); poll until it lands.
    async awaitPublishedVersion(route: string, notEqualTo: number | null): Promise<number | null> {
      let version = notEqualTo;
      for (let i = 0; i < 40 && version === notEqualTo; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        version = (await this.json(route)).body.publishedVersion;
      }
      return version;
    },
  };
}

describe('collab sync routes', () => {
  it('publishes on request and advances the published version monotonically', async () => {
    const api = await startSyncServer();
    expect((await api.json('/api/projects/p1/collab/status')).body.publishedVersion).toBeNull();

    const pub = await api.json('/api/projects/p1/collab/publish', { method: 'POST' });
    expect(pub.status).toBe(200);
    expect(pub.body.ok).toBe(true);

    const v1 = await api.awaitPublishedVersion('/api/projects/p1/collab/status', null);
    expect(v1).toBe(1);

    await api.json('/api/projects/p1/collab/publish', { method: 'POST' });
    const v2 = await api.awaitPublishedVersion('/api/projects/p1/collab/status', v1);
    expect(v2).toBe(2);
  });

  it('accepts a coalesced change notification', async () => {
    const api = await startSyncServer();
    const res = await api.json('/api/projects/p1/collab/changed', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('keeps published versions independent per project', async () => {
    const api = await startSyncServer();
    await api.json('/api/projects/a/collab/publish', { method: 'POST' });
    await api.awaitPublishedVersion('/api/projects/a/collab/status', null);
    expect((await api.json('/api/projects/b/collab/status')).body.publishedVersion).toBeNull();
  });

  it('reports local_only sync state before any share', async () => {
    const api = await startSyncServer();
    expect((await api.json('/api/projects/p1/collab/status')).body.syncState).toBe('local_only');
  });

  it('drives the visibility-to-sync team-share intent through to synced', async () => {
    const api = await startSyncServer();
    const intent = await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_share_requested', projectId: 'p1' },
    });
    expect(intent.status).toBe(200);
    // The intent marks it pending immediately; the publish confirms asynchronously.
    expect(['pending_upload', 'synced']).toContain(intent.body.syncState);

    // Poll until the publish confirms → synced.
    let state = intent.body.syncState;
    for (let i = 0; i < 40 && state !== 'synced'; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      state = (await api.json('/api/projects/p1/collab/status')).body.syncState;
    }
    expect(state).toBe('synced');
    expect((await api.json('/api/projects/p1/collab/status')).body.publishedVersion).toBe(1);
  });

  it('accepts a visibility-changed intent as a no-op signal', async () => {
    const api = await startSyncServer();
    const res = await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_visibility_changed', projectId: 'p1' },
    });
    expect(res.status).toBe(200);
    expect(res.body.syncState).toBe('local_only'); // visibility change alone doesn't publish
  });

  it('rejects an unknown sync intent event', async () => {
    const api = await startSyncServer();
    const res = await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'nonsense', projectId: 'p1' },
    });
    expect(res.status).toBe(400);
  });

  it('refuses a team-share intent from a member without canShareProjects (server-side gate)', async () => {
    // The client hides the share affordance, but the daemon must not trust the
    // client — a member whose context lacks canShareProjects is refused (403),
    // and the project stays local_only (no publish is triggered).
    const api = await startSyncServer(fixedShareContextProvider(false));
    const res = await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_share_requested', projectId: 'p1' },
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('WORKSPACE_PROJECT_SHARE_DENIED');
    expect((await api.json('/api/projects/p1/collab/status')).body.syncState).toBe('local_only');
  });

  it('honors a team-share intent from a member with canShareProjects', async () => {
    const api = await startSyncServer(fixedShareContextProvider(true));
    const res = await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_share_requested', projectId: 'p1' },
    });
    expect(res.status).toBe(200);
    expect(['pending_upload', 'synced']).toContain(res.body.syncState);
  });

  it('pulls the published head for a member (null before any publish)', async () => {
    const api = await startSyncServer();
    const before = await api.json('/api/projects/p1/collab/pull', { method: 'POST' });
    expect(before.status).toBe(200);
    expect(before.body.version).toBeNull();

    await api.json('/api/projects/p1/collab/publish', { method: 'POST' });
    await api.awaitPublishedVersion('/api/projects/p1/collab/status', null);
    const after = await api.json('/api/projects/p1/collab/pull', { method: 'POST' });
    expect(after.body.version).toBe(1);
  });

  it('registers a pulled shared project locally so it appears in the project store', async () => {
    const store = fakeProjectStore();
    const api = await startSyncServer(undefined, {
      projectStore: store,
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
    });

    expect(store.has('shared-1')).toBe(false);
    const pull = await api.json('/api/projects/shared-1/collab/pull', { method: 'POST' });
    expect(pull.status).toBe(200);

    // The pull registered a local project record. With no manifest under the
    // (non-existent) pull dir, it falls back to the placeholder name.
    expect(store.has('shared-1')).toBe(true);
    expect(store.projects.get('shared-1')?.name).toBe('共享项目');
  });

  it('registers a pulled shared project under its real name from the manifest', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-pull-'));
    tempDirs.push(dir);
    // The shared tree carries the owner's project manifest; register-on-pull
    // reads it so the local record shows the real name after opening.
    await writeProjectManifest(dir, {
      schemaVersion: 1,
      id: 'shared-2',
      name: 'Team Roadmap',
      createdAt: 111,
      updatedAt: 222,
      skillId: 'live-artifact',
      designSystemId: 'ds-9',
    });

    const store = fakeProjectStore();
    const api = await startSyncServer(undefined, {
      projectStore: store,
      resolvePullDir: () => dir,
    });

    await api.json('/api/projects/shared-2/collab/pull', { method: 'POST' });
    const registered = store.projects.get('shared-2');
    expect(registered?.name).toBe('Team Roadmap');
    expect(registered?.skillId).toBe('live-artifact');
    expect(registered?.designSystemId).toBe('ds-9');
    expect(registered?.createdAt).toBe(111);
    expect(registered?.updatedAt).toBe(222);
  });

  it('is idempotent — a pull for an already-local project does not re-register it', async () => {
    const store = fakeProjectStore();
    store.register({
      id: 'shared-3',
      name: 'Already Local',
      skillId: null,
      designSystemId: null,
      createdAt: 1,
      updatedAt: 1,
    });
    expect(store.registerCalls).toBe(1);

    const api = await startSyncServer(undefined, {
      projectStore: store,
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
    });

    await api.json('/api/projects/shared-3/collab/pull', { method: 'POST' });
    // Still exactly one registration; the existing record is left untouched.
    expect(store.registerCalls).toBe(1);
    expect(store.projects.get('shared-3')?.name).toBe('Already Local');
  });
});
