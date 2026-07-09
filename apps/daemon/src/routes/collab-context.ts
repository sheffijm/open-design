import type { Express } from 'express';
import type {
  WorkspaceBillingResponse,
  WorkspaceBillingSummary,
  WorkspaceContextResponse,
} from '@open-design/contracts';
import {
  parseWorkspaceCollabContext,
  type WorkspaceContextProvider,
} from '../collab/workspace-context.js';
import {
  consumeInviteContinuation,
  type InviteContinueOutcome,
} from '../collab/invite-continue.js';
import { fetchVelaBillingSummary } from '../integrations/vela-billing.js';

export interface RegisterCollabContextRoutesDeps {
  workspaceContext: WorkspaceContextProvider;
  /** Injectable for tests; defaults to consuming against B with the vela session. */
  consumeInvite?: (nonce: string) => Promise<InviteContinueOutcome>;
  /** Injectable for tests; defaults to the vela billing CLI 收口. */
  fetchBilling?: () => Promise<WorkspaceBillingSummary | null>;
}

/**
 * Workspace-context route : the daemon's single B-integration seam. The
 * web client fetches the current caller's workspace context here to decide
 * whether collab runs and who the present member is (resolveCollabSession). In
 * production the provider proxies B; the dev provider is settable via PUT so a
 * demo/tools-dev run can exercise the full path before B is reachable.
 */
export function registerCollabContextRoutes(app: Express, deps: RegisterCollabContextRoutesDeps): void {
  const { workspaceContext } = deps;
  const consumeInvite = deps.consumeInvite ?? ((nonce: string) => consumeInviteContinuation(nonce));
  const fetchBilling = deps.fetchBilling ?? (() => fetchVelaBillingSummary());

  // Desktop invite hand-off ("桌面唤起和本地恢复"): the desktop app parses the
  // opendesign:// invite deeplink and POSTs the nonce here. The daemon consumes
  // the one-time continuation on B with the signed-in vela session and returns
  // the resolved workspace context so the client can switch into the team
  // workspace. The nonce is single-use — B enforces subject match + one consume.
  app.post('/api/workspace/invite/continue', async (req, res) => {
    const body = req.body as { nonce?: unknown } | null;
    const nonce = body && typeof body.nonce === 'string' ? body.nonce : '';
    if (!nonce.trim()) return res.status(400).json({ error: 'missing_nonce' });
    const outcome = await consumeInvite(nonce);
    if (!outcome.ok) return res.status(outcome.status).json({ error: outcome.error });
    return res.json({ context: outcome.context, workspaceMemberId: outcome.workspaceMemberId });
  });

  app.get('/api/workspace/context', async (req, res) => {
    const authorization = req.header('authorization') ?? undefined;
    const context = await workspaceContext.current({ authorization });
    const body: WorkspaceContextResponse = { context };
    res.json(body);
  });

  // A-lane billing 收口: the client's credits chip fetches the caller's real
  // plan tier + credit balance here. The daemon shells out to `vela billing
  // summary` (same vela session as resources); a null summary means the CLI /
  // session is unavailable and the client keeps its context-derived tier hint.
  app.get('/api/workspace/billing', async (_req, res) => {
    const summary = await fetchBilling();
    const body: WorkspaceBillingResponse = { summary };
    res.json(body);
  });

  // Dev/demo seam: override the in-memory context. A real B-backed provider does
  // not expose `set`, so this 404s in production instead of spoofing identity.
  app.put('/api/workspace/context', (req, res) => {
    if (!workspaceContext.set) {
      return res.status(404).json({ error: 'workspace context is not settable' });
    }
    const body = req.body as unknown;
    // `null` explicitly clears the context (sign-out / leave team).
    if (body === null || (body && typeof body === 'object' && Object.keys(body).length === 0)) {
      workspaceContext.set(null);
      const cleared: WorkspaceContextResponse = { context: null };
      return res.json(cleared);
    }
    const context = parseWorkspaceCollabContext(body);
    if (!context) return res.status(400).json({ error: 'invalid workspace context' });
    workspaceContext.set(context);
    const response: WorkspaceContextResponse = { context };
    res.json(response);
  });
}
