import { useEffect, useState } from 'react';
import type { WorkspaceCollabContext, WorkspaceContextResponse } from '@open-design/contracts';

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
