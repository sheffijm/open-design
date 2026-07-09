import type { Express } from 'express';
import type { PreviewComment } from '@open-design/contracts';
import type { RouteDeps } from '../../server-context.js';

export interface RegisterProjectCommentRoutesDeps extends RouteDeps<'db' | 'projectStore' | 'conversations'> {
  /**
   * Resolve the comment author's workspaceMemberId from the request identity
   * (workspace context). Server-authoritative — the stored/synced comment's
   * author must not be client-supplied. Optional: off-team it returns undefined
   * and the comment is stored without an author.
   */
  resolveAuthorMemberId?: (authorization: string | undefined) => Promise<string | undefined>;
  /**
   * Fired after a comment is saved, so the collab-cloud service can push it to
   * the cross-daemon relay (best-effort — a push failure must not fail the
   * local save). No-op off-team / when the collab cloud is unconfigured.
   */
  onCommentCreated?: (comment: PreviewComment) => void;
}

export function registerProjectCommentRoutes(app: Express, ctx: RegisterProjectCommentRoutesDeps): void {
  const { db } = ctx;
  const { updateProject } = ctx.projectStore;
  const {
    getConversation,
    listPreviewComments,
    upsertPreviewComment,
    updatePreviewCommentStatus,
    updatePreviewCommentAnchor,
    deletePreviewComment,
  } = ctx.conversations;

  // ---- Preview comments ----------------------------------------------------

  app.get('/api/projects/:id/conversations/:cid/comments', (req, res) => {
    const conv = getConversation(db, req.params.cid);
    if (!conv || conv.projectId !== req.params.id) {
      return res.status(404).json({ error: 'conversation not found' });
    }
    res.json({
      comments: listPreviewComments(db, req.params.id, req.params.cid),
    });
  });

  app.post('/api/projects/:id/conversations/:cid/comments', async (req, res) => {
    const conv = getConversation(db, req.params.cid);
    if (!conv || conv.projectId !== req.params.id) {
      return res.status(404).json({ error: 'conversation not found' });
    }
    try {
      // Server-authoritative author: stamp the current member id so the stored
      // (and pushed) comment carries who wrote it, rather than trusting the body.
      const body = { ...(req.body || {}) };
      if (ctx.resolveAuthorMemberId) {
        const authorMemberId = await ctx.resolveAuthorMemberId(req.headers.authorization);
        if (authorMemberId) body.authorMemberId = authorMemberId;
      }
      const comment = upsertPreviewComment(db, req.params.id, req.params.cid, body);
      updateProject(db, req.params.id, {});
      // Best-effort cross-daemon push; never fails the local save.
      if (comment) {
        try {
          ctx.onCommentCreated?.(comment as unknown as PreviewComment);
        } catch {
          /* push is best-effort */
        }
      }
      res.json({ comment });
    } catch (err: any) {
      res.status(400).json({ error: String(err?.message || err) });
    }
  });

  app.patch(
    '/api/projects/:id/conversations/:cid/comments/:commentId',
    (req, res) => {
      const conv = getConversation(db, req.params.cid);
      if (!conv || conv.projectId !== req.params.id) {
        return res.status(404).json({ error: 'conversation not found' });
      }
      try {
        const comment = updatePreviewCommentStatus(
          db,
          req.params.id,
          req.params.cid,
          req.params.commentId,
          req.body?.status,
        );
        if (!comment)
          return res.status(404).json({ error: 'comment not found' });
        updateProject(db, req.params.id, {});
        res.json({ comment });
      } catch (err: any) {
        res.status(400).json({ error: String(err?.message || err) });
      }
    },
  );

  app.patch(
    '/api/projects/:id/conversations/:cid/comments/:commentId/anchor',
    (req, res) => {
      const conv = getConversation(db, req.params.cid);
      if (!conv || conv.projectId !== req.params.id) {
        return res.status(404).json({ error: 'conversation not found' });
      }
      try {
        // Drift-ladder write-back: the client resolves anchor state each render
        // and reports it here. No updateProject() — anchor resolution is a
        // derived read-back, not a content edit.
        const comment = updatePreviewCommentAnchor(
          db,
          req.params.id,
          req.params.cid,
          req.params.commentId,
          req.body || {},
        );
        if (!comment) return res.status(404).json({ error: 'comment not found' });
        res.json({ comment });
      } catch (err: any) {
        res.status(400).json({ error: String(err?.message || err) });
      }
    },
  );

  app.delete(
    '/api/projects/:id/conversations/:cid/comments/:commentId',
    (req, res) => {
      const conv = getConversation(db, req.params.cid);
      if (!conv || conv.projectId !== req.params.id) {
        return res.status(404).json({ error: 'conversation not found' });
      }
      const ok = deletePreviewComment(
        db,
        req.params.id,
        req.params.cid,
        req.params.commentId,
      );
      if (!ok) return res.status(404).json({ error: 'comment not found' });
      updateProject(db, req.params.id, {});
      res.json({ ok: true });
    },
  );
}
