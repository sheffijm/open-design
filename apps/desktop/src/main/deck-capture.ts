import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { BrowserWindow, nativeImage } from "electron";
import type { DesktopRenderSlidesInput, DesktopRenderSlidesResult } from "@open-design/sidecar-proto";

import { waitForPrintableContent } from "./pdf-export.js";

// Returns the rendered images either as on-disk files (when the daemon provided
// an `outputDir`) or as base64 data URLs (legacy/fallback). Writing files keeps
// tens of MB of image bytes off the JSON IPC channel — the daemon, which owns
// and created the directory, reads the files back and deletes them. desktop only
// ever writes to the absolute path the daemon handed it.
async function emitImages(
  images: Array<{ buffer: Buffer; jpeg: boolean }>,
  outputDir: string | undefined,
): Promise<Pick<DesktopRenderSlidesResult, "slideFiles" | "slides">> {
  if (outputDir) {
    await mkdir(outputDir, { recursive: true });
    const slideFiles: string[] = [];
    for (let i = 0; i < images.length; i++) {
      const img = images[i]!;
      const file = path.join(outputDir, `slide-${i}.${img.jpeg ? "jpeg" : "png"}`);
      await writeFile(file, img.buffer);
      slideFiles.push(file);
    }
    return { slideFiles };
  }
  return {
    slides: images.map(
      (img) => `data:image/${img.jpeg ? "jpeg" : "png"};base64,${img.buffer.toString("base64")}`,
    ),
  };
}

// Default deck slide stage when the authored size can't be measured: 1920x1080
// (16:9). We render at the logical size and let Electron's capturePage emit the
// display's native pixel scale (2x on retina => 3840x2160), so the PNGs are at
// least FHD and pixel-perfect to the browser. This reuses the bundled Electron
// Chromium — no second headless engine, so the packaged app does not grow.
const SLIDE_W = 1920;
const SLIDE_H = 1080;
// Bounds for a measured slide size; outside this we fall back to the default to
// avoid a pathological capture (a deck with a broken/zero/huge slide box).
const SLIDE_MIN_PX = 320;
const SLIDE_MAX_PX = 8192;

// Chrome the live deck adds (presenter overlays, the auto-managed progress bar,
// nav hints) must not bleed into a captured slide. Mirrors the print-hide list
// in design-templates/html-ppt/assets/runtime.js.
const HIDE_CHROME_SELECTOR =
  ".progress-bar, .notes-overlay, .overview, .notes, aside.notes, .speaker-notes, .deck-nav, .deck-hint, .deck-counter";

// The slide-surface family, matching the print/export path in pdf-export.ts
// (`.slide, [data-screen-label], .deck-slide, .ppt-slide`) — decks ship under
// several conventions, not just `.slide` (e.g. zhangzara-creative-mode uses
// `<section data-screen-label=...>`). Decks also nest them differently
// (`.deck > .slide`, `.deck-viewport > .deck-stage > .slide`, etc.); presenter-
// mode clones (`.mini-slide .slide`, `.overview .slide`) are filtered out in the
// page rather than via a rigid direct-child selector, which missed nested decks.
const SLIDE_SELECTOR = ".slide, [data-screen-label], .deck-slide, .ppt-slide";
// JS expression (used inside executeJavaScript) returning the real slides.
const REAL_SLIDES_JS =
  "Array.prototype.slice.call(document.querySelectorAll('.slide, [data-screen-label], .deck-slide, .ppt-slide')).filter(function(el){return !el.closest('.mini-slide, .overview, .notes-overlay, .thumb')})";

/**
 * Renders an HTML deck to one PNG per slide using a hidden Electron window.
 * The window is shown fully transparent and inactive so the GPU compositor
 * paints it (capturePage needs a live frame) without any visible flash or
 * focus theft, then destroyed.
 */
export async function renderDeckSlides(
  input: DesktopRenderSlidesInput,
): Promise<DesktopRenderSlidesResult> {
  const window = new BrowserWindow({
    width: SLIDE_W,
    height: SLIDE_H,
    useContentSize: true,
    show: false,
    // The deck is 1920x1080. Without this, macOS clamps a window taller than
    // the work area (laptop displays), so the content viewport comes back
    // shorter than 1080 and slides capture at the wrong aspect ratio.
    enableLargerThanScreen: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());

  // Coarse per-phase timing so a slow export can be diagnosed from the desktop
  // log (load/fonts vs. render/encode) instead of guesswork. One line per export.
  const t0 = Date.now();
  let tLoad = t0;
  let tAssets = t0;
  let tPrepare = t0;
  const finish = (result: DesktopRenderSlidesResult): DesktopRenderSlidesResult => {
    const end = Date.now();
    // eslint-disable-next-line no-console
    console.info("[od-export] render", {
      mode: result.mode,
      slides: (result.slideFiles ?? result.slides ?? []).length,
      out: result.slideFiles ? "file" : "dataurl",
      loadMs: tLoad - t0,
      assetsMs: tAssets - tLoad,
      prepareMs: tPrepare - tAssets,
      renderMs: end - tPrepare,
      totalMs: end - t0,
    });
    return result;
  };

  try {
    const doc = injectBaseHref(input.html, input.baseHref);
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(doc)}`);
    tLoad = Date.now();
    await waitForPrintableContent(window);
    tAssets = Date.now();

    // Lay out at the default stage first so the slide box can be measured
    // against a stable viewport.
    window.setContentSize(SLIDE_W, SLIDE_H);

    // Paint invisibly: opacity 0 before showInactive => compositor renders the
    // page (so capturePage returns real pixels) with zero on-screen flash.
    window.setOpacity(0);
    window.showInactive();

    // Cheap, NON-mutating slide count first — the deck-only DOM mutations
    // (hiding chrome, freezing animations) must not touch the document until we
    // know this is a deck, or a page-mode export would render on a modified DOM
    // (e.g. content using generic `.notes`/`.overview` classes would vanish).
    const count = (await window.webContents.executeJavaScript(
      `(${countRealSlides.toString()})(${JSON.stringify(SLIDE_SELECTOR)})`,
      true,
    )) as number;
    tPrepare = Date.now();

    // Decide page vs deck. Prefer the caller's explicit `deck` signal: an
    // ordinary page can contain `.slide` markup (carousels, testimonials)
    // without being a deck, so we must NOT treat any `.slide` as proof of a deck.
    // `deck:false` forces full-page capture; otherwise require actual slides.
    const hasSlides = Number.isInteger(count) && count >= 1;
    // The caller explicitly asked for a deck but no slide surfaces were found —
    // fail fast with a clear error instead of silently downgrading to a single
    // full-page capture (which would be the wrong export for PPTX/deck).
    if (input.deck === true && !hasSlides) {
      return finish({ ok: false, error: "no slide surfaces found in this deck" });
    }
    const wantsDeck = shouldCaptureAsDeck(hasSlides, input.deck);
    if (!wantsDeck) {
      // Page mode: capture the original, unmodified document. `paginate` (set by
      // the PDF path) splits a long page into one image per viewport.
      return finish(
        await capturePage(window, input.pageImageFormat === "jpeg", input.outputDir, input.paginate === true),
      );
    }

    // Deck mode only: now apply the deck DOM prep (hide presenter chrome, freeze
    // animations) so each slide reaches its final state for capture.
    await window.webContents.executeJavaScript(
      `(${prepareDeckStage.toString()})(${JSON.stringify(HIDE_CHROME_SELECTOR)})`,
      true,
    );

    // Measure the deck's authored slide size instead of assuming 16:9 — decks
    // can be 4:3, square, portrait, or any custom canvas. The capture rect, the
    // pinned stage, and (downstream) the PPTX layout all follow this so a non-16:9
    // deck is not clipped or distorted. Falls back to 1920x1080 if unmeasurable.
    const stage = await measureSlideStage(window);
    window.setContentSize(stage.w, stage.h);
    await nextFrames(window);

    // Pin the stage to the measured slide size.
    await window.webContents.executeJavaScript(`(${pinDeckStage.toString()})(${stage.w}, ${stage.h})`, true);

    // Deck slides default to PNG (crisp text, no JPEG artifacts). The CLI image
    // route can explicitly request JPEG via pageImageFormat; PPTX/PDF leave it
    // unset and keep PNG.
    const jpeg = input.pageImageFormat === "jpeg";

    // Capture each slide via CDP `Page.captureScreenshot` when the debugger can
    // attach. Unlike `capturePage()` (which grabs the last COMPOSITED frame and
    // can hand back the previous slide's frame when the new one hasn't composited
    // yet — the duplicate-page race), CDP renders the CURRENT DOM to a fresh
    // frame, so the captured pixels always match the slide we just showed. No
    // pixel-compare / retry needed. Animations + transitions are already frozen
    // (prepareDeckStage), so each slide is captured at its final state — never a
    // mid page-turn frame. Falls back to capturePage if the debugger is busy.
    const deckDbg = window.webContents.debugger;
    let deckDbgAttached = false;
    try {
      deckDbg.attach("1.3");
      deckDbgAttached = true;
      await deckDbg.sendCommand("Page.enable");
    } catch {
      // already attached / unavailable — captureDeckSlide falls back to capturePage
    }
    const dbg = deckDbgAttached ? deckDbg : null;
    try {
      // Image export of a deck wants every slide stitched top-to-bottom into one
      // tall image (the "whole deck as one picture").
      if (input.stitch) {
        return finish(await stitchDeckSlides(window, dbg, count, stage, jpeg, input.outputDir));
      }

      // Otherwise render every slide, or just the one requested by image export.
      // A specified-but-out-of-range index is a caller error — fail fast instead
      // of silently falling back to slide 0 (which the daemon would return with
      // 200 for image export).
      if (input.index != null && (input.index < 0 || input.index >= count)) {
        return finish({
          ok: false,
          error: `slide index ${input.index} is out of range (deck has ${count} slide(s))`,
        });
      }
      const indices = input.index != null ? [input.index] : range(count);
      const images: Array<{ buffer: Buffer; jpeg: boolean }> = [];
      let width = stage.w;
      let height = stage.h;
      for (const i of indices) {
        const image = await captureDeckSlide(window, dbg, i, stage);
        const size = image.getSize();
        width = size.width;
        height = size.height;
        images.push({ buffer: jpeg ? image.toJPEG(82) : image.toPNG(), jpeg });
      }
      return finish({ ok: true, ...(await emitImages(images, input.outputDir)), width, height, mode: "deck" });
    } finally {
      if (deckDbgAttached) {
        try {
          deckDbg.detach();
        } catch {
          // ignore
        }
      }
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
}

// The measured (or fallback) logical slide stage in DIP.
interface Stage {
  w: number;
  h: number;
}

// Measures the deck's authored slide box so the capture/PPTX follow the real
// aspect ratio instead of assuming 16:9. Reads the rendered (post-transform)
// rect of the first slide that has layout, so a fit-to-viewport deck reports the
// stage it actually paints. Clamps to a sane range and falls back to 1920x1080.
async function measureSlideStage(window: BrowserWindow): Promise<Stage> {
  try {
    const measured = (await window.webContents.executeJavaScript(
      `(${measureSlide.toString()})(${JSON.stringify(SLIDE_SELECTOR)})`,
      true,
    )) as { w: number; h: number } | null;
    if (
      measured &&
      Number.isFinite(measured.w) &&
      Number.isFinite(measured.h) &&
      measured.w >= SLIDE_MIN_PX &&
      measured.w <= SLIDE_MAX_PX &&
      measured.h >= SLIDE_MIN_PX &&
      measured.h <= SLIDE_MAX_PX
    ) {
      return { w: Math.round(measured.w), h: Math.round(measured.h) };
    }
  } catch {
    // fall through to the default stage
  }
  return { w: SLIDE_W, h: SLIDE_H };
}

// Shows exactly slide `i` and lets the style change settle for two frames. The
// style toggle AND the two-frame settle happen in ONE executeJavaScript round
// trip (showSlide returns the settle Promise, which executeJavaScript awaits) —
// halving the main<->renderer hops per slide vs. a separate settle call, which
// matters for long decks where the loop dominates.
async function showDeckSlide(window: BrowserWindow, i: number, stage: Stage): Promise<void> {
  const rect = (await window.webContents.executeJavaScript(
    `(${showSlide.toString()})(${JSON.stringify(SLIDE_SELECTOR)}, ${i})`,
    true,
  )) as { x: number; y: number; w: number; h: number } | null;
  // If the active slide did not land in the top-left capture viewport (a
  // translated carousel strip leaves it off-screen), restack it into place and
  // settle again before the caller captures.
  const onStage =
    rect != null &&
    Math.abs(rect.x) <= 2 &&
    Math.abs(rect.y) <= 2 &&
    rect.w >= stage.w * 0.5 &&
    rect.h >= stage.h * 0.5;
  if (!onStage) {
    await window.webContents.executeJavaScript(
      `(${restackActiveSlide.toString()})(${JSON.stringify(SLIDE_SELECTOR)}, ${i}, ${stage.w}, ${stage.h})`,
      true,
    );
    await nextFrames(window);
  }
}

// Shows slide `i` and captures the measured stage rect. Prefers CDP
// `Page.captureScreenshot` (renders the CURRENT DOM to a fresh frame, so it
// cannot return a stale composited frame of the previous slide — the
// duplicate-page race `capturePage` exhibits); falls back to `capturePage` when
// the debugger isn't attached. `scale: 1` because the window's device-pixel
// ratio already provides the pixel scale (avoids double-scaling).
async function captureDeckSlide(
  window: BrowserWindow,
  dbg: Electron.Debugger | null,
  i: number,
  stage: Stage,
): Promise<Electron.NativeImage> {
  await showDeckSlide(window, i, stage);
  if (dbg) {
    const shot = (await dbg.sendCommand("Page.captureScreenshot", {
      clip: { x: 0, y: 0, width: stage.w, height: stage.h, scale: 1 },
      format: "png",
    })) as { data: string };
    return nativeImage.createFromBuffer(Buffer.from(shot.data, "base64"));
  }
  return await window.webContents.capturePage({ x: 0, y: 0, width: stage.w, height: stage.h });
}

// Captures every deck slide and stacks them top-to-bottom into one tall image
// (deck image export). Stitches BGRA with a native memcpy per slide and encodes
// once natively, like the scroll-segment path. Bounds the output height: a deck
// taller than this is uniformly downscaled so EVERY slide is preserved — never
// silently truncated.
const DECK_STITCH_MAX_H = 30000;
// RAM budget for the stitched BGRA buffer, mirroring the page stitcher. The
// height cap alone is not enough: a wide / high-DPR stage can still blow past a
// gigabyte (e.g. 8192px stage @2x => W~16384, * 30000 * 4 ≈ 1.9 GiB).
const DECK_STITCH_MAX_BYTES = 320 * 1024 * 1024;
async function stitchDeckSlides(
  window: BrowserWindow,
  dbg: Electron.Debugger | null,
  count: number,
  stage: Stage,
  jpeg: boolean,
  outputDir: string | undefined,
): Promise<DesktopRenderSlidesResult> {
  // Capture slide 0 first to learn the native per-slide pixel size, then pick a
  // single uniform downscale so all `count` slides fit under BOTH the height cap
  // and the RAM byte budget. Scaling (instead of dropping trailing slides) keeps
  // the "whole deck as one picture" contract — long/large decks just get a
  // smaller per-slide size.
  const first = await captureDeckSlide(window, dbg, 0, stage);
  const nativeSize = first.getSize();
  const nativeW = Math.max(1, nativeSize.width);
  const nativeH = Math.max(1, nativeSize.height);
  const heightScale = DECK_STITCH_MAX_H / (nativeH * count);
  // total bytes = (nativeW*s) * (nativeH*count*s) * 4 <= MAX_BYTES  =>  s <= sqrt(...)
  const byteScale = Math.sqrt(DECK_STITCH_MAX_BYTES / (nativeW * nativeH * count * 4));
  const scale = Math.min(1, heightScale, byteScale);
  const W = Math.max(1, Math.round(nativeW * scale));
  const slideHpx = Math.max(1, Math.round(nativeSize.height * scale));
  const bgra = Buffer.alloc(W * slideHpx * count * 4);
  const place = (image: Electron.NativeImage, index: number): void => {
    const scaled = scale < 1 ? image.resize({ width: W, height: slideHpx }) : image;
    const bmp = scaled.toBitmap(); // BGRA, full-width rows
    bmp.copy(bgra, index * slideHpx * W * 4, 0, Math.min(bmp.length, slideHpx * W * 4));
  };
  place(first, 0);
  for (let i = 1; i < count; i++) {
    const image = await captureDeckSlide(window, dbg, i, stage);
    place(image, i);
  }
  const H = slideHpx * count;
  const img = nativeImage.createFromBitmap(bgra, { width: W, height: H });
  const bytes = jpeg ? img.toJPEG(82) : img.toPNG();
  return {
    ok: true,
    ...(await emitImages([{ buffer: bytes, jpeg }], outputDir)),
    width: W,
    height: H,
    mode: "deck",
  };
}

// Ordinary (non-deck) page: capture the WHOLE document as one long image at a
// fixed desktop width, viewport-independent.
const PAGE_W = 1440;
// Logical viewport height used for the scroll-segment fallback.
const PAGE_VIEW_H = 1000;
// RAM budget for the stitched output buffer (~RGBA). Bounds the worst-case
// output height regardless of how tall the page is.
const PAGE_RAM_BUDGET_BYTES = 320 * 1024 * 1024;
// Conservative floor for the per-machine GPU texture limit if we cannot query
// it (older/integrated GPUs can be as low as this).
const FALLBACK_MAX_TEXTURE = 8192;

/**
 * Captures an ordinary page as one long, viewport-independent image.
 *
 * Image export (paginate=false) always SCROLL-SEGMENT STITCHES: it scrolls the
 * page one viewport at a time, captures each screen in the state it actually
 * paints at that scroll position, and stitches the frames by their real scroll
 * offset into a single tall image. This is faithful to scroll-driven / parallax
 * pages (a single `captureBeyondViewport` pass renders the whole document at
 * scroll 0 and gets parallax/reveal-on-scroll content wrong). It is RAM-bound,
 * so a page taller than the memory budget refuses (PNG) or paginates into a
 * multi-page raster (the JPEG path that feeds a PDF).
 *
 * PDF export (paginate=true) is handled earlier via paginatePageViewports (one
 * image per viewport, not stitched).
 */
async function capturePage(
  window: BrowserWindow,
  jpeg: boolean,
  outputDir: string | undefined,
  paginate = false,
): Promise<DesktopRenderSlidesResult> {
  // Lay the document out at a desktop width first so width-dependent content
  // (responsive layouts) renders the way a desktop visitor sees it.
  window.setContentSize(PAGE_W, PAGE_VIEW_H);
  await nextFrames(window);

  // Pre-pass: freeze animations and scroll the whole page once so reveal-on-
  // scroll content (IntersectionObserver / AOS / lazy images) is triggered and
  // settles before we capture.
  //
  // Both the PDF (per-viewport pages) and image (per-viewport stitch) paths
  // KEEP fixed/sticky positioning as authored and capture each viewport live at
  // its real scroll offset — identical capture logic, they only differ in how
  // the frames are assembled (separate PDF pages vs one tall stitched image).
  // We do NOT neutralize fixed/sticky: on parallax / scroll-pinned designs the
  // headline and foreground text are positioned by that very CSS, and flattening
  // it (fixed→absolute, sticky→static) dropped the text entirely from the
  // capture (the "exported image has no text" bug on reverie-style pages).
  await preparePageForCapture(window);

  // PDF of a long non-deck page: capture one image PER VIEWPORT, top to bottom,
  // so the daemon assembles a multi-page PDF (one screen per page) instead of a
  // single giant page. Done before the single-pass/stitch path selection below.
  if (paginate) {
    const measured = (await window.webContents.executeJavaScript(
      "Math.ceil(Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0))",
      true,
    )) as number;
    const totalLogical = Math.max(PAGE_VIEW_H, Number.isFinite(measured) ? measured : PAGE_VIEW_H);
    return await paginatePageViewports(window, totalLogical, jpeg, outputDir);
  }

  const maxTexture = await queryMaxTextureSize(window);
  // The window's device-pixel-ratio already scales the capture (2 on retina),
  // exactly like the deck path's capturePage. Report real px via it.
  const dpr = await queryDevicePixelRatio(window);
  const outW = PAGE_W * dpr;
  const ramMaxOutH = Math.floor(PAGE_RAM_BUDGET_BYTES / (outW * 4));

  const dbg = window.webContents.debugger;
  let attached = false;
  // Set if the debugger attached but a CDP command later threw — distinct from a
  // failed attach. Lets the too-tall PDF refusal surface the real error vs a
  // misleading "renderer is busy, retry".
  let cdpError: unknown = null;
  try {
    dbg.attach("1.3");
    attached = true;
  } catch {
    // already attached or unavailable — scroll-segment fallback below
  }

  try {
    if (attached) {
      await dbg.sendCommand("Page.enable");
      // Measure the document height in CSS px directly (CDP contentSize is in
      // device px in this Electron, which would double-scale). Clip width to the
      // desktop viewport we laid out at — horizontal overflow is rare and a
      // desktop-width capture is what we want.
      const measuredH = (await window.webContents.executeJavaScript(
        "Math.ceil(Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0))",
        true,
      )) as number;
      const docW = PAGE_W;
      const docH = Math.max(1, Number.isFinite(measuredH) ? measuredH : PAGE_VIEW_H);
      const outHpx = docH * dpr;

      // Image export always stitches the page from per-viewport captures (scroll
      // down one screen at a time, capture, stitch by real scroll offset). This
      // is faithful to scroll-driven / parallax pages — each screen is captured
      // in the state it actually paints at that scroll position — unlike a single
      // captureBeyondViewport pass, which renders the whole document at scroll 0
      // and gets parallax/reveal content wrong. Too-tall pages still refuse (PNG)
      // or paginate into a multi-page raster (the JPEG/PDF-feeding path) below.
      if (outHpx > ramMaxOutH) {
        if (jpeg) {
          return await paginateTallPage(window, dbg, docW, docH, dpr, maxTexture, ramMaxOutH, jpeg, outputDir);
        }
        return {
          ok: false,
          error: `page is too tall to export as one image (~${docH}px) — export as PDF instead`,
        };
      }
      return await scrollSegmentStitch(window, docH, jpeg, outputDir);
    }
  } catch (error) {
    // The debugger attached but a later CDP command failed (Chromium/GPU/clip
    // error) — remember it so the too-tall PDF refusal below can surface the
    // real, actionable error instead of the retryable "renderer busy" message
    // (which is only correct when the debugger could not attach at all).
    cdpError = error;
  } finally {
    if (attached) {
      try {
        dbg.detach();
      } catch {
        // ignore
      }
    }
  }

  // No debugger available: measure + scroll-segment.
  const measured = (await window.webContents.executeJavaScript(
    "Math.ceil(Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0))",
    true,
  )) as number;
  const totalLogical = Math.max(PAGE_VIEW_H, Number.isFinite(measured) ? measured : PAGE_VIEW_H);
  // Same budget guard as the debugger path: refuse rather than truncate. The PDF
  // path normally paginates a too-tall page (paginateTallPage), but that needs
  // CDP. We reach here either because the debugger could not attach, or because
  // it attached and a CDP command later failed (cdpError). Surface the real CDP
  // error in the latter case; only show the retryable "busy" message when the
  // attach itself failed. Either way, don't tell the user to "export as PDF
  // instead" — they already chose PDF.
  if (totalLogical * dpr > ramMaxOutH) {
    if (jpeg) {
      return { ok: false, error: tooTallPdfErrorMessage(cdpError) };
    }
    return {
      ok: false,
      error: `page is too tall to export as one image (~${totalLogical}px) — export as PDF instead`,
    };
  }
  return await scrollSegmentStitch(window, totalLogical, jpeg, outputDir);
}

// Renders a non-deck page taller than a single image into a MULTI-PAGE raster
// PDF: the document is split into stacked chunks (each as tall as the GPU
// texture / RAM budget allows) and every chunk is emitted as its own image, so
// the daemon assembles one PDF page per chunk. Used only for the PDF path; the
// single-image `/export/image` path keeps its refusal. Uses captureBeyondViewport
// per chunk (the page rendered fully — it's only too tall for one texture), which
// does not duplicate fixed elements (already neutralized in preparePageForCapture).
async function paginateTallPage(
  window: BrowserWindow,
  dbg: Electron.Debugger,
  docW: number,
  docH: number,
  dpr: number,
  maxTexture: number,
  ramMaxOutH: number,
  jpeg: boolean,
  outputDir: string | undefined,
): Promise<DesktopRenderSlidesResult> {
  // Largest per-page chunk (device px) that fits BOTH the GPU texture limit and
  // the RAM byte budget.
  const maxChunkDevH = Math.min(maxTexture, ramMaxOutH);
  const chunks = tallPageChunkHeights(docH, maxChunkDevH, dpr);
  const images: Array<{ buffer: Buffer; jpeg: boolean }> = [];
  let offset = 0;
  for (const chunkH of chunks) {
    const shot = (await dbg.sendCommand("Page.captureScreenshot", {
      captureBeyondViewport: true,
      clip: { x: 0, y: offset, width: docW, height: chunkH, scale: 1 },
      ...(jpeg ? { format: "jpeg", quality: 82 } : { format: "png" }),
    })) as { data: string };
    images.push({ buffer: Buffer.from(shot.data, "base64"), jpeg });
    offset += chunkH;
  }
  return {
    ok: true,
    ...(await emitImages(images, outputDir)),
    width: docW * dpr,
    height: (chunks[0] ?? docH) * dpr,
    mode: "page",
  };
}

// Splits a document of logical height `docLogicalH` into per-page chunk heights
// (logical px), each capped to the largest chunk that fits the device texture /
// RAM budget (`maxChunkDevH`). Exported for tests. The last chunk is the
// remainder; total always sums back to `docLogicalH`.
// Error message for a too-tall page on the PDF path that couldn't be paginated.
// When the debugger attached but a CDP command later failed (`cdpError`), surface
// the real Chromium/GPU error so it's actionable; only when the attach itself
// failed (cdpError null/undefined) is the retryable "renderer is busy" message
// correct. Either way it must not tell the user to "export as PDF" (they did).
// Exported for tests.
export function tooTallPdfErrorMessage(cdpError: unknown): string {
  if (cdpError) {
    const detail = cdpError instanceof Error ? cdpError.message : String(cdpError);
    return `couldn't render this long page to PDF: ${detail}`;
  }
  return `couldn't render this long page to PDF — the renderer is busy, please retry`;
}

export function tallPageChunkHeights(docLogicalH: number, maxChunkDevH: number, dpr: number): number[] {
  const pageLogicalH = Math.max(1, Math.floor(Math.max(1, maxChunkDevH) / Math.max(1, dpr)));
  const total = Math.max(1, Math.ceil(docLogicalH));
  const chunks: number[] = [];
  for (let offset = 0; offset < total; offset += pageLogicalH) {
    chunks.push(Math.min(pageLogicalH, total - offset));
  }
  return chunks;
}

// Freezes animations/transitions and scroll-prewarms the page so reveal-on-
// scroll content (IntersectionObserver, AOS, `loading=lazy`) is triggered and
// holds before capture — the standard technique full-page screenshot services
// use. Does NOT fix JS that recomputes transforms from scrollY every frame
// (continuous parallax): those have no single correct frame and still fall to
// scroll-segment via the blank-below-fold check.
async function preparePageForCapture(window: BrowserWindow): Promise<void> {
  try {
    // NOTE: fixed/sticky positioning is intentionally LEFT AS AUTHORED. We used
    // to flatten it (fixed→absolute, sticky→static) so a pinned hero wasn't
    // repeated down a stitched capture, but that dropped scroll-pinned headline/
    // foreground TEXT on parallax pages (the "exported image has no text" bug).
    // Capturing each viewport live at its real scroll offset is faithful to how
    // the page actually paints, so we keep the CSS and accept that a genuinely
    // fixed bar may appear in more than one viewport.
    await window.webContents.executeJavaScript(
      `(function(){try{var s=document.createElement('style');s.setAttribute('data-od-capture','1');s.textContent='*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;scroll-behavior:auto!important}';(document.head||document.documentElement).appendChild(s);}catch(e){}})()`,
      true,
    );
    await window.webContents.executeJavaScript(
      `(async function(){var vh=window.innerHeight||1000;var H=function(){return Math.max(document.documentElement.scrollHeight, document.body?document.body.scrollHeight:0)};for(var y=0;y<H();y+=vh){window.scrollTo(0,y);await new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r)})});await new Promise(function(r){setTimeout(r,120)});}window.scrollTo(0,0);await new Promise(function(r){setTimeout(r,200)});return true;})()`,
      true,
    );
    // Wait for any fonts / images / CSS bg images that loaded during the prewarm.
    await waitForPrintableContent(window);
  } catch {
    // Best-effort — capture proceeds even if the pre-pass fails.
  }
}

// Window device-pixel-ratio (2 on retina). capturePage / captureScreenshot both
// scale the output by it, so we use it to compute real output pixel sizes.
async function queryDevicePixelRatio(window: BrowserWindow): Promise<number> {
  try {
    const v = (await window.webContents.executeJavaScript("window.devicePixelRatio || 1", true)) as number;
    return Number.isFinite(v) && v > 0 ? v : 1;
  } catch {
    return 1;
  }
}

// Reads the GPU's real max texture size so the single-pass/stitch threshold
// adapts to the user's hardware instead of a hard-coded guess.
async function queryMaxTextureSize(window: BrowserWindow): Promise<number> {
  try {
    const v = (await window.webContents.executeJavaScript(
      `(function(){try{var c=document.createElement('canvas');var gl=c.getContext('webgl2')||c.getContext('webgl');return gl?gl.getParameter(gl.MAX_TEXTURE_SIZE):0}catch(e){return 0}})()`,
      true,
    )) as number;
    return Number.isFinite(v) && v > 0 ? v : FALLBACK_MAX_TEXTURE;
  } catch {
    return FALLBACK_MAX_TEXTURE;
  }
}

// Scrolls the page one viewport at a time, captures each frame, and stitches
// them by real scroll offset into one tall BGRA buffer, then encodes once with
// Electron's native PNG encoder. Stitching is a single Buffer.copy per chunk
// (no per-pixel JS, no channel swap — capturePage already gives BGRA, which is
// what createFromBitmap wants) and the encode is native C++, so this is fast
// even for long pages. createFromBitmap is a CPU bitmap, so it is NOT bound by
// the GPU texture limit; height is bounded only by the caller's RAM cap.
// Full-page stitch geometry derived from the REAL captured device width. The
// capture's pixel ratio can be fractional (e.g. 1.25 on 125% display scaling),
// so we must NOT round it to an integer — that corrupts the output width and
// every row offset off macOS-retina (integer DPR) defaults. Exported for tests.
export function scrollStitchGeometry(
  deviceWidth: number,
  totalLogical: number,
  pageW: number,
): { width: number; height: number; dpr: number } {
  const dpr = deviceWidth > 0 && pageW > 0 ? deviceWidth / pageW : 1;
  return { width: Math.max(1, deviceWidth), height: Math.max(1, Math.round(totalLogical * dpr)), dpr };
}
// Device-pixel row offset for a chunk captured at logical scroll `actualY`.
export function scrollStitchRowOffset(actualY: number, dpr: number): number {
  return Math.round(actualY * dpr);
}

async function scrollSegmentStitch(
  window: BrowserWindow,
  totalLogical: number,
  jpeg: boolean,
  outputDir: string | undefined,
): Promise<DesktopRenderSlidesResult> {
  window.setContentSize(PAGE_W, PAGE_VIEW_H);
  await nextFrames(window);
  const maxScroll = Math.max(0, totalLogical - PAGE_VIEW_H);

  let W = 0;
  let H = 0;
  let dpr = 1;
  let bgra: Buffer | null = null;

  for (let y = 0; ; y += PAGE_VIEW_H) {
    const target = Math.min(y, maxScroll);
    const actualY = (await window.webContents.executeJavaScript(
      `(function(){window.scrollTo(0, ${target});return new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(function(){setTimeout(function(){r(Math.round(window.scrollY||window.pageYOffset||0))},180)})})})})()`,
      true,
    )) as number;
    const image = await window.webContents.capturePage({ x: 0, y: 0, width: PAGE_W, height: PAGE_VIEW_H });
    const bmp = image.toBitmap(); // BGRA
    const size = image.getSize();
    if (!bgra) {
      // Use the real captured pixel width (and its true, possibly fractional,
      // ratio) for the buffer + placement — never a rounded integer scale.
      const geo = scrollStitchGeometry(size.width, totalLogical, PAGE_W);
      W = geo.width;
      H = geo.height;
      dpr = geo.dpr;
      bgra = Buffer.alloc(W * H * 4);
    }
    const destRow = scrollStitchRowOffset(actualY, dpr);
    if (destRow < H) {
      const rows = Math.min(size.height, H - destRow);
      if (rows > 0) {
        if (size.width === W) {
          // Chunk rows are full-width and contiguous — one native memcpy.
          bmp.copy(bgra, destRow * W * 4, 0, rows * W * 4);
        } else {
          // Defensive width mismatch — copy the overlapping width row by row.
          const rowWidth = Math.min(size.width, W) * 4;
          for (let r = 0; r < rows; r++) {
            bmp.copy(bgra, (destRow + r) * W * 4, r * size.width * 4, r * size.width * 4 + rowWidth);
          }
        }
      }
    }
    if (target >= maxScroll) break;
  }

  const img = nativeImage.createFromBitmap(bgra ?? Buffer.alloc(4), { width: W || 1, height: H || 1 });
  const bytes = jpeg ? img.toJPEG(82) : img.toPNG();
  return {
    ok: true,
    ...(await emitImages([{ buffer: bytes, jpeg }], outputDir)),
    width: W,
    height: H,
    mode: "page",
  };
}

// Splits an ordinary (non-deck) page into one image PER VIEWPORT, top to
// bottom — the PDF path uses this so a long scrolling site becomes a multi-page
// PDF (one screen per page) instead of one giant page. Each page is a LIVE
// viewport capture at its scroll offset, so scroll-driven parallax renders
// correctly per screen (unlike a single off-screen capture). Pages don't
// overlap: every page but the last is a full viewport; the last captures only
// the remaining rows. Bounded by page count rather than RAM (each image is one
// small viewport), so arbitrarily long pages are safe. Exported helpers
// `paginateViewportPlan`/-`Geometry` keep the offset math unit-testable.
async function paginatePageViewports(
  window: BrowserWindow,
  totalLogical: number,
  jpeg: boolean,
  outputDir: string | undefined,
): Promise<DesktopRenderSlidesResult> {
  window.setContentSize(PAGE_W, PAGE_VIEW_H);
  await nextFrames(window);
  const maxScroll = Math.max(0, totalLogical - PAGE_VIEW_H);
  const pageCount = Math.max(1, Math.ceil(totalLogical / PAGE_VIEW_H));
  const images: Array<{ buffer: Buffer; jpeg: boolean }> = [];
  let width = PAGE_W;
  let height = PAGE_VIEW_H;
  for (let p = 0; p < pageCount; p++) {
    const target = Math.min(p * PAGE_VIEW_H, maxScroll);
    const actualY = (await window.webContents.executeJavaScript(
      `(function(){window.scrollTo(0, ${target});return new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(function(){setTimeout(function(){r(Math.round(window.scrollY||window.pageYOffset||0))},180)})})})})()`,
      true,
    )) as number;
    const band = paginateViewportBand(p, actualY, totalLogical);
    const image = await window.webContents.capturePage({
      x: 0,
      y: band.top,
      width: PAGE_W,
      height: band.height,
    });
    const size = image.getSize();
    width = size.width;
    height = size.height;
    images.push({ buffer: jpeg ? image.toJPEG(82) : image.toPNG(), jpeg });
  }
  return {
    ok: true,
    ...(await emitImages(images, outputDir)),
    width,
    height,
    mode: "page",
  };
}

// The viewport sub-rectangle to capture for page `p` given the scroll position
// the browser actually landed at (`actualY`, which the final page clamps below
// the requested offset when the page can't scroll further). `top` is where this
// page's band begins inside the live viewport (>0 only on a clamped final page,
// so its rows don't overlap the previous page); `height` is the remaining rows,
// capped to the rest of the viewport. Exported for tests.
export function paginateViewportBand(
  p: number,
  actualY: number,
  totalLogical: number,
): { top: number; height: number } {
  const desiredTop = p * PAGE_VIEW_H;
  const top = Math.max(0, Math.round(desiredTop - actualY));
  const remaining = Math.ceil(totalLogical - desiredTop);
  const height = Math.max(1, Math.min(PAGE_VIEW_H - top, remaining));
  return { top, height };
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

async function nextFrames(window: BrowserWindow): Promise<void> {
  await window.webContents.executeJavaScript(
    "new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(function(){r(true)})})})",
    true,
  );
}

function injectBaseHref(doc: string, baseHref: string | undefined): string {
  if (!baseHref) return doc;
  const tag = `<base href="${escapeHtmlAttribute(baseHref)}">`;
  if (/<head[^>]*>/i.test(doc)) return doc.replace(/<head[^>]*>/i, (match) => `${match}${tag}`);
  if (/<html[^>]*>/i.test(doc)) return doc.replace(/<html[^>]*>/i, (match) => `${match}<head>${tag}</head>`);
  return `<!doctype html><html><head>${tag}</head><body>${doc}</body></html>`;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// --- Functions serialized into the page (kept dependency-free) ---

// Page-vs-deck decision (exported for tests). Deck capture requires real slide
// surfaces AND the caller not having explicitly said `deck: false`. So an
// ordinary page with carousel/testimonial `.slide` markup, exported with
// `deck: false`, is captured as a full page — never per-slide. When the caller
// omits the signal, the `.slide` count heuristic decides (CLI back-compat).
export function shouldCaptureAsDeck(hasSlides: boolean, deckSignal: boolean | undefined): boolean {
  return hasSlides && deckSignal !== false;
}

// Non-mutating: count the real slide surfaces (presenter clones excluded). Used
// to decide page-vs-deck BEFORE any deck-only DOM mutation, so page-mode exports
// keep the original document intact.
function countRealSlides(slideSelector: string): number {
  return Array.prototype.slice
    .call(document.querySelectorAll(slideSelector))
    .filter((el) => !(el as HTMLElement).closest(".mini-slide, .overview, .notes-overlay, .thumb")).length;
}

// Deck-only DOM prep (run only once we've decided this is a deck): hide presenter
// chrome and freeze animations/transitions so each slide (and its reveal-on-show
// inner elements, e.g. `.slide.visible .reveal`) reaches its final state.
function prepareDeckStage(hideSelector: string): void {
  document.querySelectorAll(hideSelector).forEach((el) => {
    (el as HTMLElement).style.setProperty("display", "none", "important");
  });
  const s = document.createElement("style");
  s.textContent =
    "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important}";
  (document.head || document.documentElement).appendChild(s);
}

// Deck-only: pin to the measured WxH stage so each slide captures
// deterministically. NOT applied in page mode — an ordinary page must keep its
// natural width/height.
function pinDeckStage(w: number, h: number): void {
  const style = document.createElement("style");
  style.textContent =
    `html,body{margin:0!important;padding:0!important;width:${w}px!important;height:${h}px!important;overflow:hidden!important}` +
    `.deck{width:${w}px!important;height:${h}px!important}`;
  document.head.appendChild(style);
}

// Serialized into the page: measures the authored slide box. Prefers a slide
// that already has a non-zero layout rect (covers decks that hide inactive
// slides via opacity/visibility); if every slide is display:none, force-measures
// the first one off-screen. Returns the rendered DIP size or null.
function measureSlide(slideSelector: string): { w: number; h: number } | null {
  const slides = Array.prototype.slice
    .call(document.querySelectorAll(slideSelector))
    .filter((el) => !(el as HTMLElement).closest(".mini-slide, .overview, .notes-overlay, .thumb"));
  if (slides.length === 0) return null;
  for (const node of slides) {
    const r = (node as HTMLElement).getBoundingClientRect();
    if (r.width > 1 && r.height > 1) return { w: r.width, h: r.height };
  }
  const el = slides[0] as HTMLElement;
  const prev = el.style.cssText;
  el.style.setProperty("display", "block", "important");
  el.style.setProperty("visibility", "hidden", "important");
  const rect = el.getBoundingClientRect();
  el.style.cssText = prev;
  return rect.width > 1 && rect.height > 1 ? { w: rect.width, h: rect.height } : null;
}

// Returns a Promise that resolves after the style change has settled for two
// animation frames, so the caller can show + wait in a single round trip.
function showSlide(slideSelector: string, index: number): Promise<{ x: number; y: number; w: number; h: number } | null> {
  const slides = Array.prototype.slice
    .call(document.querySelectorAll(slideSelector))
    .filter((el) => !(el as HTMLElement).closest(".mini-slide, .overview, .notes-overlay, .thumb"));
  // Cover the common deck "active slide" conventions so the deck's own CSS shows
  // the slide (incl. visibility:hidden->visible and reveal animations), plus
  // inline overrides as a backstop for decks that hide via opacity/visibility.
  const activeClasses = ["active", "visible", "is-active", "current"];
  slides.forEach((node, k) => {
    const el = node as HTMLElement;
    const on = k === index;
    el.style.transition = "none";
    el.style.animation = "none";
    el.style.opacity = on ? "1" : "0";
    el.style.visibility = on ? "visible" : "hidden";
    el.style.transform = "none";
    el.style.pointerEvents = on ? "auto" : "none";
    el.style.zIndex = on ? "999" : "0";
    activeClasses.forEach((c) => el.classList.toggle(c, on));
  });
  // Report where the active slide actually landed after two frames, so the
  // capturer can detect a slide that the deck keeps off-screen (e.g. a
  // horizontal carousel that paginates by translating a flex strip rather than
  // stacking slides in place) and restack it before capturing.
  return new Promise((resolve) => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = slides[index] as HTMLElement | undefined;
        if (!el) return resolve(null);
        const r = el.getBoundingClientRect();
        resolve({ x: r.x, y: r.y, w: r.width, h: r.height });
      }),
    );
  });
}

// Serialized into the page: forces the active slide into the top-left capture
// viewport for decks that position it elsewhere (translated carousel strip).
// Only used when showSlide reports the slide off-stage, so transform-scaled
// fit-to-viewport decks (whose active slide is already at 0,0) are untouched —
// clearing ancestor transforms here is safe because such off-stage decks do not
// rely on an ancestor scale.
function restackActiveSlide(slideSelector: string, index: number, w: number, h: number): void {
  const slides = Array.prototype.slice
    .call(document.querySelectorAll(slideSelector))
    .filter((el) => !(el as HTMLElement).closest(".mini-slide, .overview, .notes-overlay, .thumb"));
  const el = slides[index] as HTMLElement | undefined;
  if (!el) return;
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.documentElement) {
    node.style.setProperty("transform", "none", "important");
    node.style.setProperty("transition", "none", "important");
    node = node.parentElement;
  }
  el.style.setProperty("position", "fixed", "important");
  el.style.setProperty("left", "0", "important");
  el.style.setProperty("top", "0", "important");
  el.style.setProperty("margin", "0", "important");
  el.style.setProperty("width", `${w}px`, "important");
  el.style.setProperty("height", `${h}px`, "important");
  el.style.setProperty("transform", "none", "important");
  el.style.setProperty("z-index", "2147483647", "important");
}
