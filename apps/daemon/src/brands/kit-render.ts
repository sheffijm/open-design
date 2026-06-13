// Brand-kit HTML renderer.
//
// Turns a (possibly partial) brand.json into a self-contained `brand.html`
// "aha" page by injecting a JSON payload into the template the brand-extract
// skill ships (`skills/brand-extract/templates/brand-kit.html`). The page is
// deterministic and never agent-authored: the agent only writes brand.json and
// asks the daemon to (re)render, so the user watches a real, on-brand kit fill
// in instead of just a scrolling chat. While `status === 'extracting'` the page
// soft-reloads itself, so each `od brand preview` pass shows up live.

import fs from 'node:fs';
import path from 'node:path';

import type { ProjectMetadata } from '@open-design/contracts';

import { resolveProjectDir, writeProjectFile } from '../projects.js';

/** Location of the bundled template relative to the daemon's skills root. */
const BRAND_KIT_TEMPLATE_REL = path.join('brand-extract', 'templates', 'brand-kit.html');

/** The file the rendered kit is written to inside the extraction project. */
export const BRAND_KIT_FILE = 'brand.html';

const PAYLOAD_TOKEN = '__OD_BRAND_PAYLOAD__';

/** The six brand assets the deterministic system builder emits, in the order
 *  the kit page lists them. `href` is relative to `brand.html` at the project
 *  root so links resolve under the FileViewer's raw URL load. */
export const BRAND_KIT_ASSET_DEFS: ReadonlyArray<{
  kind: string;
  label: string;
  desc: string;
  href: string;
}> = [
  { kind: 'landing', label: 'Landing page', desc: 'Hero, features, CTA — the brand’s web face', href: 'system/artifacts/landing.html' },
  { kind: 'deck', label: 'Pitch deck', desc: '16:9 slides with keyboard navigation', href: 'system/artifacts/deck.html' },
  { kind: 'poster', label: 'Poster', desc: 'Print-style key-art poster', href: 'system/artifacts/poster.html' },
  { kind: 'email', label: 'Email', desc: 'Bulletproof table-layout HTML email', href: 'system/artifacts/email.html' },
  { kind: 'newsletter', label: 'Newsletter', desc: 'Multi-story email digest', href: 'system/artifacts/newsletter.html' },
  { kind: 'form', label: 'Form page', desc: 'Signup / contact form, brand-styled', href: 'system/artifacts/form.html' },
];

let cachedTemplate: { root: string; html: string } | null = null;

/** Read (and cache) the bundled brand-kit template from the skills root. */
export function loadBrandKitTemplate(skillsRoot: string): string {
  if (cachedTemplate && cachedTemplate.root === skillsRoot) return cachedTemplate.html;
  const file = path.join(skillsRoot, BRAND_KIT_TEMPLATE_REL);
  const html = fs.readFileSync(file, 'utf8');
  cachedTemplate = { root: skillsRoot, html };
  return html;
}

export interface BrandKitPayload {
  status: 'extracting' | 'ready';
  host: string;
  brand: Record<string, unknown>;
  assets: Array<{ kind: string; label: string; desc: string; href: string; available: boolean }>;
  system: { href: string } | null;
  brandMd: { href: string } | null;
}

/** Embed the payload into the template, neutralizing any `</script>` in the
 *  JSON so the inline data block cannot break out of its own tag. */
export function renderBrandKitHtml(template: string, payload: BrandKitPayload): string {
  const json = JSON.stringify(payload).replace(/<\//g, '<\\/');
  return template.replace(PAYLOAD_TOKEN, json);
}

function hostOf(brand: Record<string, unknown>, fallback: string): string {
  const url = typeof brand.sourceUrl === 'string' ? brand.sourceUrl : '';
  try {
    return url ? new URL(url).hostname.replace(/^www\./i, '') : fallback;
  } catch {
    return fallback;
  }
}

/** True when a built artifact already exists in the project (so the kit can
 *  show a live preview tile instead of a pending placeholder). */
function fileExists(absPath: string): boolean {
  try {
    return fs.statSync(absPath).isFile();
  } catch {
    return false;
  }
}

export interface WriteBrandKitOptions {
  skillsRoot: string;
  projectsRoot: string;
  projectId: string;
  brand: Record<string, unknown>;
  status: 'extracting' | 'ready';
  /** Fallback host label before brand.sourceUrl is known. */
  host?: string;
  metadata?: ProjectMetadata;
}

/**
 * Render `brand.html` from the given (partial) brand and write it into the
 * extraction project. Asset tiles light up automatically once the matching
 * `system/artifacts/<kind>.html` exists in the project (i.e. after finalize).
 * Best-effort: returns false (without throwing) when the template or project
 * dir cannot be resolved, so seeding/preview never blocks the main flow.
 */
export async function writeBrandKitPreview(opts: WriteBrandKitOptions): Promise<boolean> {
  let template: string;
  try {
    template = loadBrandKitTemplate(opts.skillsRoot);
  } catch {
    return false;
  }
  let projectDir: string;
  try {
    projectDir = resolveProjectDir(opts.projectsRoot, opts.projectId, opts.metadata);
  } catch {
    return false;
  }
  const host = hostOf(opts.brand, opts.host ?? 'Brand');
  const systemAvailable = fileExists(path.join(projectDir, 'system', 'index.html'));
  const brandMdAvailable = fileExists(path.join(projectDir, 'BRAND.md'));
  const assets = BRAND_KIT_ASSET_DEFS.map((def) => ({
    kind: def.kind,
    label: def.label,
    desc: def.desc,
    href: def.href,
    available: fileExists(path.join(projectDir, ...def.href.split('/'))),
  }));
  const payload: BrandKitPayload = {
    status: opts.status,
    host,
    brand: opts.brand,
    assets,
    system: systemAvailable ? { href: 'system/index.html' } : null,
    brandMd: brandMdAvailable ? { href: 'BRAND.md' } : null,
  };
  const html = renderBrandKitHtml(template, payload);
  try {
    await writeProjectFile(
      opts.projectsRoot,
      opts.projectId,
      BRAND_KIT_FILE,
      html,
      { overwrite: true },
      opts.metadata,
    );
  } catch {
    return false;
  }
  return true;
}
