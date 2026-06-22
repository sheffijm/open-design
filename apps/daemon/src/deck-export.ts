import path from 'node:path';

import { PDFDocument } from 'pdf-lib';
import * as PptxGenJSModule from 'pptxgenjs';
import type { DesktopRenderSlidesInput } from '@open-design/sidecar-proto';

// pptxgenjs ships a default-export class, but its NodeNext typings resolve the
// default to the module namespace (no construct signature). At runtime the ESM
// build's default IS the class, so reach it and re-type as a constructor.
type PptxInstance = InstanceType<typeof import('pptxgenjs').default>;
const PptxGenJS = PptxGenJSModule.default as unknown as { new (): PptxInstance };

import { readProjectFile } from './projects.js';

export interface BuildDeckRenderInputOptions {
  daemonUrl: string;
  fileName: string;
  index?: number;
  projectId: string;
  projectsRoot: string;
  scale?: number;
  title?: string;
}

export interface DeckRenderRequest {
  defaultFilename: string;
  input: DesktopRenderSlidesInput;
  title: string;
}

/**
 * Reads a deck HTML file and prepares the {@link DesktopRenderSlidesInput} the
 * desktop renderer needs. Mirrors {@link buildDesktopPdfExportInput} in
 * pdf-export.ts: same `<base href>` derivation so the rendered deck resolves
 * its relative CSS/JS/image assets through the daemon's `/raw/` route.
 */
export async function buildDeckRenderInput(
  options: BuildDeckRenderInputOptions,
): Promise<DeckRenderRequest> {
  const file = await readProjectFile(options.projectsRoot, options.projectId, options.fileName);
  const title = displayTitle(options.title, options.fileName);
  return {
    defaultFilename: `${safeFilename(title, 'deck')}`,
    title,
    input: {
      baseHref: rawBaseHref(options.daemonUrl, options.projectId, options.fileName),
      html: file.buffer.toString('utf8'),
      ...(options.index == null ? {} : { index: options.index }),
      ...(options.scale == null ? {} : { scale: options.scale }),
    },
  };
}

/**
 * Decodes the `data:image/png;base64,...` URLs the desktop renderer returns
 * into raw PNG buffers. Rejects anything that is not a base64 PNG data URL so
 * a malformed renderer response surfaces as an export failure rather than a
 * corrupt file.
 */
export function decodeSlideDataUrls(urls: string[]): Buffer[] {
  return urls.map((url, index) => {
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(url ?? '');
    if (!match) {
      throw new Error(`slide ${index + 1} is not a base64 PNG data URL`);
    }
    return Buffer.from(match[1] ?? '', 'base64');
  });
}

/**
 * Assembles per-slide PNGs into a screenshot-based .pptx — one full-bleed image
 * per 16:9 slide. The slides are pixel-perfect images (not editable text), the
 * "exactly what you see" export mode. Returns the .pptx bytes.
 */
export async function buildScreenshotPptx(
  pngs: Buffer[],
  opts: { title?: string } = {},
): Promise<Buffer> {
  if (pngs.length === 0) throw new Error('no slides to export');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = 'Open Design';
  if (opts.title) pptx.title = opts.title;
  pptx.subject = 'Screenshot-based PPTX';
  for (const png of pngs) {
    const slide = pptx.addSlide();
    slide.addImage({
      data: `data:image/png;base64,${png.toString('base64')}`,
      x: 0,
      y: 0,
      w: '100%',
      h: '100%',
    });
  }
  const out = await pptx.write({ outputType: 'nodebuffer' });
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}

/**
 * Assembles per-slide PNGs into a screenshot-based .pdf — one page per slide,
 * each page sized to its image. Pixel-perfect, raster (not selectable text).
 */
export async function buildScreenshotPdf(pngs: Buffer[]): Promise<Buffer> {
  if (pngs.length === 0) throw new Error('no slides to export');
  const pdf = await PDFDocument.create();
  for (const png of pngs) {
    const image = await pdf.embedPng(png);
    const page = pdf.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  }
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

function displayTitle(title: string | undefined, fileName: string): string {
  if (typeof title === 'string' && title.trim().length > 0) return title.trim();
  const base = path.posix.basename(fileName);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base || 'deck';
}

function rawBaseHref(daemonUrl: string, projectId: string, fileName: string): string {
  const dir = path.posix.dirname(fileName.replace(/^\/+/, ''));
  const safeProjectId = encodeURIComponent(projectId);
  const rawBase = `${daemonUrl.replace(/\/+$/, '')}/api/projects/${safeProjectId}/raw/`;
  if (!dir || dir === '.') return rawBase;
  return `${rawBase}${encodePathSegments(dir)}/`;
}

function encodePathSegments(value: string): string {
  return value
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function safeFilename(name: string, fallback: string): string {
  const slug = (name || fallback)
    .replace(/[^\w.\-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || fallback;
}
