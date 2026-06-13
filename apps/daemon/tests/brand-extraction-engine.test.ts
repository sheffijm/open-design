import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  closeDatabase,
  getProject,
  listTabs,
  openDatabase,
} from '../src/db.js';
import {
  finalizeBrand,
  readBrandDetail,
  renderBrandPreviewIntoProject,
  startBrandExtraction,
} from '../src/brands/index.js';

// Real repo skills root so the bundled brand-kit template resolves.
const SKILLS_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../skills',
);

// A minimal-but-valid brand.json the agent is expected to have written into the
// backing project before finalize runs (seven roles, the three required ones).
const VALID_BRAND = {
  name: 'Acme',
  tagline: 'We make things',
  description: 'Acme makes excellent things for everyone.',
  colors: [
    { role: 'background', hex: '#f5f4ed', oklch: 'oklch(96% 0.01 90)', name: 'Parchment', usage: 'page background' },
    { role: 'surface', hex: '#ffffff', oklch: 'oklch(100% 0 0)', name: 'Card', usage: 'cards' },
    { role: 'foreground', hex: '#141413', oklch: 'oklch(17% 0.005 90)', name: 'Ink', usage: 'text' },
    { role: 'muted', hex: '#87867f', oklch: 'oklch(60% 0.01 90)', name: 'Stone', usage: 'secondary text' },
    { role: 'border', hex: '#e8e6dc', oklch: 'oklch(92% 0.01 90)', name: 'Hairline', usage: 'borders' },
    { role: 'accent', hex: '#d97757', oklch: 'oklch(67% 0.13 40)', name: 'Terracotta', usage: 'CTAs' },
    { role: 'accent-secondary', hex: '#3d7a4f', oklch: 'oklch(50% 0.09 150)', name: 'Moss', usage: 'success' },
  ],
  typography: {
    display: { family: 'Tiempos', fallbacks: ['Georgia', 'serif'], weights: [400, 600] },
    body: { family: 'Inter', fallbacks: ['system-ui'], weights: [400, 700] },
  },
};

describe('agent-driven brand extraction engine', () => {
  let tempDir: string;
  let brandsRoot: string;
  let projectsRoot: string;
  let userDesignSystemsRoot: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-brand-engine-'));
    brandsRoot = path.join(tempDir, 'brands');
    projectsRoot = path.join(tempDir, 'projects');
    userDesignSystemsRoot = path.join(tempDir, 'user-design-systems');
    mkdirSync(brandsRoot, { recursive: true });
    mkdirSync(projectsRoot, { recursive: true });
    mkdirSync(userDesignSystemsRoot, { recursive: true });
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('startBrandExtraction reserves the brand and seeds a live brand.html tab', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });

    const result = await startBrandExtraction({
      url: 'acme.com',
      brandsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
    });

    // URL is normalized to https and the brand starts in `extracting`.
    expect(result.sourceUrl).toBe('https://acme.com/');
    const detail = readBrandDetail(brandsRoot, result.id);
    expect(detail?.meta.status).toBe('extracting');
    expect(detail?.meta.projectId).toBe(result.projectId);

    // The backing project exists and carries the seeded extraction prompt.
    const project = getProject(db, result.projectId);
    expect(project).toBeTruthy();
    expect(project?.metadata?.kind).toBe('brand');
    expect(project?.pendingPrompt ?? '').toContain('BRAND EXTRACTION');
    expect(project?.pendingPrompt ?? '').toContain(`od brand preview ${result.id}`);

    // brand.html is seeded as the active tab; the site stays as a secondary
    // browser tab the user can use to clear an anti-bot wall by hand.
    const brandHtmlPath = path.join(projectsRoot, result.projectId, 'brand.html');
    expect(existsSync(brandHtmlPath)).toBe(true);
    const seeded = readFileSync(brandHtmlPath, 'utf8');
    expect(seeded).toContain('"status":"extracting"');
    expect(seeded).toContain('acme.com');

    const tabs = listTabs(db, result.projectId) as {
      active: string | null;
      browserTabs?: Array<{ url?: string }>;
    };
    expect(tabs.active).toBe('brand.html');
    expect(tabs.browserTabs?.[0]?.url).toBe('https://acme.com/');
  });

  it('rejects a non-http(s) URL', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    await expect(
      startBrandExtraction({ url: 'ftp://nope', brandsRoot, projectsRoot, skillsRoot: SKILLS_ROOT, db }),
    ).rejects.toThrow(/valid http/i);
  });

  it('renderBrandPreviewIntoProject re-renders brand.html from a partial brand.json', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const started = await startBrandExtraction({
      url: 'acme.com',
      brandsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
    });

    // Agent writes a partial kit (name + a couple colors, no fonts yet).
    const projectDir = path.join(projectsRoot, started.projectId);
    writeFileSync(
      path.join(projectDir, 'brand.json'),
      JSON.stringify({
        name: 'Acme',
        sourceUrl: started.sourceUrl,
        colors: [VALID_BRAND.colors[0], VALID_BRAND.colors[5]],
      }),
      'utf8',
    );

    const preview = await renderBrandPreviewIntoProject({
      id: started.id,
      brandsRoot,
      skillsRoot: SKILLS_ROOT,
      projectsRoot,
    });
    expect(preview.rendered).toBe(true);
    expect(preview.file).toBe('brand.html');

    const html = readFileSync(path.join(projectDir, 'brand.html'), 'utf8');
    // The partial palette flowed into the embedded payload, still "extracting".
    expect(html).toContain('"status":"extracting"');
    expect(html).toContain('#d97757');
  });

  it('finalizeBrand registers the kit, marks it ready, and lights up the assets', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const started = await startBrandExtraction({
      url: 'acme.com',
      brandsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
    });

    // Simulate the agent writing the complete kit into the backing project.
    const projectDir = path.join(projectsRoot, started.projectId);
    writeFileSync(
      path.join(projectDir, 'brand.json'),
      JSON.stringify({ ...VALID_BRAND, sourceUrl: started.sourceUrl }, null, 2),
      'utf8',
    );
    writeFileSync(path.join(projectDir, 'BRAND.md'), '# Acme Brand Guide\n', 'utf8');

    const finalized = await finalizeBrand({
      id: started.id,
      brandsRoot,
      userDesignSystemsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
    });

    expect(finalized.brand.name).toBe('Acme');
    expect(finalized.designSystemId.startsWith('user:')).toBe(true);
    expect(finalized.files.length).toBeGreaterThan(0);

    const detail = readBrandDetail(brandsRoot, started.id);
    expect(detail?.meta.status).toBe('ready');
    expect(detail?.meta.designSystemId).toBe(finalized.designSystemId);

    const project = getProject(db, started.projectId);
    expect(project?.designSystemId).toBe(finalized.designSystemId);

    // brand.html re-rendered as ready, and the six artifacts exist so the
    // Brand Assets tiles resolve.
    const html = readFileSync(path.join(projectDir, 'brand.html'), 'utf8');
    expect(html).toContain('"status":"ready"');
    expect(existsSync(path.join(projectDir, 'system', 'artifacts', 'landing.html'))).toBe(true);
  });

  it('finalizeBrand fails clearly when the agent has not written brand.json yet', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const started = await startBrandExtraction({
      url: 'acme.com',
      brandsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
    });

    await expect(
      finalizeBrand({
        id: started.id,
        brandsRoot,
        userDesignSystemsRoot,
        projectsRoot,
        skillsRoot: SKILLS_ROOT,
        db,
      }),
    ).rejects.toThrow(/brand\.json not found/i);
  });
});
