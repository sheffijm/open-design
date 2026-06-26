import { describe, expect, test } from 'vitest';

import {
  paginateViewportBand,
  scrollStitchGeometry,
  scrollStitchRowOffset,
  shouldCaptureAsDeck,
  tallPageChunkHeights,
  tooTallPdfErrorMessage,
} from '../../src/main/deck-capture.js';

// A too-tall page on the PDF path that can't paginate must distinguish a failed
// debugger attach (retryable "busy") from a CDP command that failed after a
// successful attach (surface the real, actionable error).
describe('tooTallPdfErrorMessage', () => {
  test('no cdpError (attach failed) → retryable busy message', () => {
    const msg = tooTallPdfErrorMessage(null);
    expect(msg).toContain('renderer is busy, please retry');
    expect(msg).not.toMatch(/export as PDF/i);
  });

  test('cdpError present (attached, later CDP command failed) → surfaces the real error', () => {
    const msg = tooTallPdfErrorMessage(new Error('Target.captureScreenshot failed: GPU'));
    expect(msg).toContain('Target.captureScreenshot failed: GPU');
    expect(msg).not.toContain('renderer is busy');
  });

  test('non-Error cdpError is stringified', () => {
    expect(tooTallPdfErrorMessage('boom')).toContain('boom');
  });
});

// A non-deck page taller than one image is paginated into a multi-page raster
// PDF; tallPageChunkHeights computes the per-page chunk heights (logical px).
describe('tallPageChunkHeights', () => {
  test('splits a tall page into texture/RAM-bounded chunks, remainder last', () => {
    // maxChunkDevH 8192 @2x => 4096 logical per page; 10000 -> [4096,4096,1808].
    const chunks = tallPageChunkHeights(10000, 8192, 2);
    expect(chunks).toEqual([4096, 4096, 1808]);
    expect(chunks.reduce((a, b) => a + b, 0)).toBe(10000);
  });

  test('a page that fits in one chunk yields a single page', () => {
    expect(tallPageChunkHeights(3000, 8192, 2)).toEqual([3000]);
  });

  test('never yields a zero-height chunk', () => {
    for (const c of tallPageChunkHeights(5000, 0, 0)) expect(c).toBeGreaterThan(0);
  });
});

// Full-page scroll-stitch geometry must use the REAL captured device width and
// its true (possibly fractional) pixel ratio. A previous version rounded the
// ratio to an integer, which corrupted output width + row placement on non-
// retina display scaling (125% / 150%).
const PAGE_W = 1440;

describe('scrollStitchGeometry', () => {
  test('retina (2x) — integer ratio', () => {
    const g = scrollStitchGeometry(2880, 5000, PAGE_W);
    expect(g.dpr).toBe(2);
    expect(g.width).toBe(2880);
    expect(g.height).toBe(10000);
  });

  test('125% scaling (1.25x) — fractional ratio is NOT rounded to 1', () => {
    const g = scrollStitchGeometry(1800, 5000, PAGE_W);
    expect(g.dpr).toBeCloseTo(1.25, 5);
    expect(g.width).toBe(1800); // real device width, not PAGE_W*round(1.25)=1440
    expect(g.height).toBe(6250); // round(5000 * 1.25)
  });

  test('150% scaling (1.5x)', () => {
    const g = scrollStitchGeometry(2160, 4000, PAGE_W);
    expect(g.dpr).toBeCloseTo(1.5, 5);
    expect(g.width).toBe(2160);
    expect(g.height).toBe(6000);
  });

  test('1x (no scaling)', () => {
    const g = scrollStitchGeometry(1440, 3000, PAGE_W);
    expect(g.dpr).toBe(1);
    expect(g.width).toBe(1440);
    expect(g.height).toBe(3000);
  });
});

describe('shouldCaptureAsDeck', () => {
  test('an ordinary page with .slide markup but deck:false captures as a page', () => {
    // The regression: a non-deck HTML page (carousel/testimonial `.slide`) sent
    // with an explicit deck:false must NOT be captured per-slide.
    expect(shouldCaptureAsDeck(true, false)).toBe(false);
  });
  test('an explicit deck with slides captures as a deck', () => {
    expect(shouldCaptureAsDeck(true, true)).toBe(true);
  });
  test('no slides is never a deck', () => {
    expect(shouldCaptureAsDeck(false, true)).toBe(false);
    expect(shouldCaptureAsDeck(false, undefined)).toBe(false);
  });
  test('no signal falls back to the slide-count heuristic', () => {
    expect(shouldCaptureAsDeck(true, undefined)).toBe(true);
  });
});

// The PDF path paginates a long non-deck page into one image per viewport
// (PAGE_VIEW_H = 1000). paginateViewportBand picks the viewport sub-rectangle
// for each page so the pages tile the document exactly — no overlap, no gap —
// even when the final page can't scroll a full viewport (it captures the
// remaining rows from a lower offset inside the clamped viewport).
describe('paginateViewportBand', () => {
  test('full viewport pages until the clamped remainder (2500px → 1000+1000+500)', () => {
    // maxScroll = 2500 - 1000 = 1500.
    expect(paginateViewportBand(0, 0, 2500)).toEqual({ top: 0, height: 1000 });
    expect(paginateViewportBand(1, 1000, 2500)).toEqual({ top: 0, height: 1000 });
    // Final page: requested offset 2000 clamps to actualY 1500, so the band
    // starts 500px down the viewport and is 500px tall → doc rows [2000,2500).
    expect(paginateViewportBand(2, 1500, 2500)).toEqual({ top: 500, height: 500 });
  });

  test('an exact multiple of the viewport tiles with no clamped page (2000px → 1000+1000)', () => {
    expect(paginateViewportBand(0, 0, 2000)).toEqual({ top: 0, height: 1000 });
    expect(paginateViewportBand(1, 1000, 2000)).toEqual({ top: 0, height: 1000 });
  });

  test('a page shorter than one viewport is a single partial page', () => {
    expect(paginateViewportBand(0, 0, 600)).toEqual({ top: 0, height: 600 });
  });

  test('bands tile the document exactly (no overlap, no gap)', () => {
    const total = 3300;
    const viewportH = 1000;
    const maxScroll = Math.max(0, total - viewportH);
    const pageCount = Math.ceil(total / viewportH);
    let covered = 0;
    for (let p = 0; p < pageCount; p++) {
      const actualY = Math.min(p * viewportH, maxScroll);
      const band = paginateViewportBand(p, actualY, total);
      // The document row this band's top maps to must continue exactly where the
      // previous page ended.
      expect(actualY + band.top).toBe(covered);
      covered += band.height;
    }
    expect(covered).toBe(total);
  });
});

describe('scrollStitchRowOffset', () => {
  test('places chunks at the true fractional pixel offset', () => {
    // At 1.25x, a chunk scrolled to logical y=1000 lands at device row 1250 —
    // exactly one chunk height (1000 * 1.25) below the previous, so chunks tile
    // without the gaps/overlap an integer-rounded scale produced.
    expect(scrollStitchRowOffset(0, 1.25)).toBe(0);
    expect(scrollStitchRowOffset(1000, 1.25)).toBe(1250);
    expect(scrollStitchRowOffset(2000, 1.25)).toBe(2500);
    expect(scrollStitchRowOffset(1000, 1.5)).toBe(1500);
    expect(scrollStitchRowOffset(1000, 2)).toBe(2000);
  });
});
