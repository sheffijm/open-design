import { useCallback, useEffect, useState } from 'react';
import type {
  TeamProject,
  WorkspaceBillingResponse,
  WorkspaceBillingSummary,
  WorkspaceCollabContext,
  WorkspaceContextResponse,
  WorkspaceTeamProjectsResponse,
} from '@open-design/contracts';

// One shared read of the workspace context (`GET /api/workspace/context`) for the
// navigation shell. The daemon proxies B's `CurrentWorkspaceContext`; `context` is
// null off-team (personal, signed out, or B unavailable). Every team surface in the
// entry shell (nav rail, workspace switcher, gating) consumes THIS one read so the
// two-state shell never re-derives role/permission judgements or fans out duplicate
// fetches. See `packages/contracts/src/api/collab.ts` for the shape.
export interface WorkspaceContextState {
  context: WorkspaceCollabContext | null;
  loading: boolean;
}

export function useWorkspaceContext(): WorkspaceContextState {
  const [state, setState] = useState<WorkspaceContextState>({ context: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/workspace/context');
        if (!res.ok) {
          if (!cancelled) setState({ context: null, loading: false });
          return;
        }
        const body = (await res.json()) as WorkspaceContextResponse;
        if (!cancelled) setState({ context: body.context ?? null, loading: false });
      } catch {
        // Personal / offline / daemon without the B proxy: stay in the local state.
        if (!cancelled) setState({ context: null, loading: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/**
 * One shared read of the caller's Vela billing summary for the nav shell
 * (`GET /api/workspace/billing`, A-lane data via the vela CLI 收口). Null until
 * it loads, or when the CLI / billing session is unavailable — the credits chip
 * then falls back to the plan-tier hint the workspace context already carries.
 */
export function useWorkspaceBilling(): WorkspaceBillingSummary | null {
  const [summary, setSummary] = useState<WorkspaceBillingSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/workspace/billing');
        if (!res.ok) return;
        const body = (await res.json()) as WorkspaceBillingResponse;
        if (!cancelled) setSummary(body.summary ?? null);
      } catch {
        if (!cancelled) setSummary(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return summary;
}

export interface TeamProjectsState {
  projects: TeamProject[];
  loading: boolean;
  /** Re-fetch the team-shared project list (e.g. after a member pulls one). */
  reload: () => void;
}

/**
 * Team-wide shared-project discovery for the "全部项目" view
 * (`GET /api/workspace/projects/team`, resource-hub data behind the daemon).
 * A member's own `/api/projects` list is only their LOCAL projects; the projects
 * the owner shared to the team live on the hub until pulled, and this read
 * surfaces them so a member can discover + open them. Empty off-team or when the
 * hub is not configured — the daemon degrades to `{ projects: [] }` there.
 */
export function useTeamProjects(): TeamProjectsState {
  const [projects, setProjects] = useState<TeamProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch('/api/workspace/projects/team');
        if (!res.ok) {
          if (!cancelled) {
            setProjects([]);
            setLoading(false);
          }
          return;
        }
        const body = (await res.json()) as WorkspaceTeamProjectsResponse;
        if (!cancelled) {
          setProjects(body.projects ?? []);
          setLoading(false);
        }
      } catch {
        // Personal / offline / daemon without the hub: no team-shared projects.
        if (!cancelled) {
          setProjects([]);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { projects, loading, reload };
}
