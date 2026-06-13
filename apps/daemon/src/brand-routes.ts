// Brands HTTP surface — list / extract / finalize / detail / delete / logo.
//
// A "brand" = brand metadata (brand.json + meta.json under
// `<brandsRoot>/<id>/`) PLUS a registered user design system. These routes are
// a thin HTTP wrapper over the agent-driven engine in `./brands/index.js`; they
// hold no brand business logic of their own.
//
//   POST /api/brands           — reserve the brand + stand up the extraction
//                                 project (browser tab + seeded prompt). JSON.
//   POST /api/brands/:id/finalize — register the agent's brand kit. JSON.

import path from 'node:path';

import type { Application, Request, Response } from 'express';

import type { insertProject } from './db.js';
import {
  finalizeBrand,
  listBrandSummaries,
  readBrandDetail,
  removeBrand,
  renderBrandPreviewIntoProject,
  resolveBrandLogoPath,
  startBrandExtraction,
} from './brands/index.js';

export interface BrandRoutesDeps {
  /** `<dataDir>/brands` — root of all brand directories. */
  brandsRoot: string;
  /** `<dataDir>/design-systems` — where extracted brands register their
   *  `user:<id>` design system, so selecting a brand in the composer reuses
   *  the existing design-system apply flow. */
  userDesignSystemsRoot: string;
  /** `<dataDir>/projects` — backing brand-extraction projects. */
  projectsRoot: string;
  /** Skills root — the agent-driven kit page is rendered from the bundled
   *  `brand-extract` template under here. */
  skillsRoot: string;
  /** Shared app database used to register the backing project + conversation. */
  db: Parameters<typeof insertProject>[0];
  /** Optional id factory; defaults inside the brand engine when omitted. */
  randomId?: () => string;
}

/** Content-Type for the served primary logo, keyed by file extension. */
const LOGO_CONTENT_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
};

export function registerBrandRoutes(app: Application, deps: BrandRoutesDeps): void {
  const { brandsRoot, userDesignSystemsRoot, projectsRoot, skillsRoot, db, randomId } = deps;

  // GET /api/brands — list every stored brand as a summary.
  app.get('/api/brands', (_req: Request, res: Response) => {
    try {
      res.json({ brands: listBrandSummaries(brandsRoot) });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // POST /api/brands { url } — reserve the brand and stand up its extraction
  // project (target site open in a browser tab + a seeded prompt that drives an
  // agent through the extraction chain). Returns the ids to navigate into.
  app.post('/api/brands', async (req: Request, res: Response) => {
    const url = typeof req.body?.url === 'string' ? req.body.url : '';
    if (!url.trim()) {
      res.status(400).json({ error: 'url is required' });
      return;
    }
    try {
      const startOptions: Parameters<typeof startBrandExtraction>[0] = {
        url,
        brandsRoot,
        projectsRoot,
        skillsRoot,
        db,
      };
      if (randomId) startOptions.randomId = randomId;
      const result = await startBrandExtraction(startOptions);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // A bad URL is the only expected throw; everything else is a 500.
      const status = /valid http/i.test(message) ? 400 : 500;
      res.status(status).json({ error: message });
    }
  });

  // POST /api/brands/:id/preview — re-render brand.html from the project's
  // current brand.json. The extraction agent calls this (`od brand preview`)
  // after each measurement pass so the kit page fills in live.
  app.post('/api/brands/:id/preview', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const projectId =
      typeof req.body?.projectId === 'string' && req.body.projectId.trim()
        ? String(req.body.projectId)
        : undefined;
    try {
      const renderOptions: Parameters<typeof renderBrandPreviewIntoProject>[0] = {
        id,
        brandsRoot,
        skillsRoot,
        projectsRoot,
      };
      if (projectId) renderOptions.projectId = projectId;
      const result = await renderBrandPreviewIntoProject(renderOptions);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = /not found/i.test(message) ? 404 : 500;
      res.status(status).json({ error: message });
    }
  });

  // POST /api/brands/:id/finalize — register the agent's extracted brand kit
  // (brand.json + assets in the backing project) as a `user:<id>` design system
  // and mark the brand ready. Called by the agent / `od brand finalize`.
  app.post('/api/brands/:id/finalize', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const projectId =
      typeof req.body?.projectId === 'string' && req.body.projectId.trim()
        ? String(req.body.projectId)
        : undefined;
    try {
      const finalizeOptions: Parameters<typeof finalizeBrand>[0] = {
        id,
        brandsRoot,
        userDesignSystemsRoot,
        projectsRoot,
        skillsRoot,
        db,
      };
      if (projectId) finalizeOptions.projectId = projectId;
      if (randomId) finalizeOptions.randomId = randomId;
      const result = await finalizeBrand(finalizeOptions);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = /not found/i.test(message) ? 404 : 422;
      res.status(status).json({ error: message });
    }
  });

  // GET /api/brands/:id — full detail (meta + brand + guide). 404 if missing.
  app.get('/api/brands/:id', (req: Request, res: Response) => {
    try {
      const detail = readBrandDetail(brandsRoot, String(req.params.id));
      if (!detail) {
        res.status(404).json({ error: 'brand not found' });
        return;
      }
      res.json(detail);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // DELETE /api/brands/:id — remove the brand and its registered design system.
  app.delete('/api/brands/:id', async (req: Request, res: Response) => {
    try {
      await removeBrand(brandsRoot, userDesignSystemsRoot, String(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/brands/:id/logo — serve the primary logo image. 404 if none.
  app.get('/api/brands/:id/logo', (req: Request, res: Response) => {
    try {
      const logoPath = resolveBrandLogoPath(brandsRoot, String(req.params.id));
      if (!logoPath) {
        res.status(404).json({ error: 'logo not found' });
        return;
      }
      const contentType = LOGO_CONTENT_TYPES[path.extname(logoPath).toLowerCase()];
      if (contentType) res.type(contentType);
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(logoPath, (err) => {
        if (err && !res.headersSent) {
          res.status(404).json({ error: 'logo not found' });
        }
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });
}
