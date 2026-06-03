/*
 * Copy for the Solution → Use case and Role landing pages
 * (`/solutions/<slug>/` and `/for/<slug>/`).
 *
 * These pages are image + text + table surfaces that explain how a given
 * workflow or role uses Open Design. They are kept OUT of the large
 * `InfoPageCopy` shape in `info-page-i18n.ts` on purpose: that interface is
 * mirrored field-by-field inside `compactInfoPageCopy()` for all 18 locales,
 * so adding rich page bodies there would force a hand-written entry per
 * locale. Here we ship English + Simplified Chinese now; every other locale
 * falls back to English via `getSolutionPageCopy()` until it is translated.
 *
 * Each page shares one shape (`SolutionPageCopy`) so the Astro template is
 * identical across all 11 pages — only the data differs.
 */
import { DEFAULT_LOCALE, type LandingLocaleCode } from './i18n';

export type SolutionStep = {
  /** Step heading, e.g. "Describe the screen". */
  title: string;
  /** One or two sentences explaining the step. */
  body: string;
  /** Alt text for the step's illustration. */
  imageAlt: string;
};

export type SolutionTableRow = {
  /** Row label — the capability or task. */
  capability: string;
  /** What Open Design does. */
  withOd: string;
  /** The old / manual / tool-bound way. */
  without: string;
};

export type SolutionFaq = {
  q: string;
  a: string;
};

export type SolutionGalleryItem = {
  /**
   * Thumbnail id — the basename of a real preview PNG under
   * `public/previews/plugins/`, WITHOUT the `.png` extension. The page
   * renders it from `/previews/plugins/<thumb>.png`, so every value here
   * must point at a file that actually ships in the repo.
   */
  thumb: string;
  /** Short caption naming the real template / output this thumbnail is. */
  caption: string;
};

export type SolutionPageCopy = {
  // ---- meta / SEO ----
  title: string;
  description: string;
  breadcrumb: string;
  /** Uppercase kicker above the H1, e.g. "Use case · Prototype". */
  label: string;
  // ---- hero ----
  heading: string;
  lead: string;
  heroImageAlt: string;
  // ---- tl;dr ----
  tldrTitle: string;
  tldrBody: string;
  // ---- how to use (image + text steps) ----
  stepsTitle: string;
  steps: SolutionStep[];
  // ---- capability table ----
  tableTitle: string;
  tableColCapability: string;
  tableColWithOd: string;
  tableColWithout: string;
  tableRows: SolutionTableRow[];
  // ---- template gallery (real in-repo example thumbnails) ----
  galleryTitle: string;
  galleryLead: string;
  gallery: SolutionGalleryItem[];
  /** Relative href to the matching templates/plugins surface. */
  exampleHref: string;
  exampleLinkLabel: string;
  // ---- faq ----
  faqTitle: string;
  faq: SolutionFaq[];
  // ---- cta ----
  ctaTitle: string;
  ctaBody: string;
};

type SolutionPageKey =
  | 'prototype'
  | 'dashboard'
  | 'slides'
  | 'image'
  | 'video'
  | 'designSystem';

type SolutionLocaleCopy = Partial<Record<SolutionPageKey, SolutionPageCopy>>;

// ---------------------------------------------------------------------------
// English (source of truth)
// ---------------------------------------------------------------------------
const EN: SolutionLocaleCopy = {
  prototype: {
    title: 'Build interactive prototypes with Open Design + Claude Code',
    description:
      'Turn a prompt into a clickable, multi-screen prototype without leaving your terminal. Open Design gives your coding agent the design skills, templates, and design system to ship real prototypes you can open in a browser.',
    breadcrumb: 'Prototype',
    label: 'Use case · Prototype',
    heading: 'Prototype at the speed of a prompt',
    lead: 'Describe the flow you have in mind and let your agent assemble a real, clickable prototype — multiple screens, shared styles, and live interactions — rendered straight to HTML you can open, share, and hand to engineering.',
    heroImageAlt:
      'Editorial illustration of a hand sketching a wireframe that turns into a clickable multi-screen app prototype',
    tldrTitle: 'In one line',
    tldrBody:
      'Open Design is the design layer for the coding agent you already use. For prototyping, that means going from a one-paragraph idea to a navigable, styled prototype in a single session — no design tool, no export step, no handoff gap.',
    stepsTitle: 'How prototyping works with Open Design',
    steps: [
      {
        title: 'Describe the flow',
        body: 'Tell your agent what you are building in plain language — "an onboarding flow with a welcome screen, a plan picker, and a confirmation." Open Design loads the prototype skill so the agent knows to produce screens, not a single page.',
        imageAlt:
          'Illustration of a person typing a plain-language description of an app flow into a terminal',
      },
      {
        title: 'Generate styled screens',
        body: 'The agent applies a design system and prototype templates from Open Design, so every screen shares typography, spacing, and components instead of looking like a rough draft. You get a coherent set of screens, not disconnected mockups.',
        imageAlt:
          'Illustration of several app screens appearing in sequence, all sharing one consistent visual style',
      },
      {
        title: 'Wire up the interactions',
        body: 'Buttons navigate, tabs switch, modals open. The prototype renders to self-contained HTML, so it behaves like the real thing in any browser — no prototyping tool account required to view it.',
        imageAlt:
          'Illustration of a cursor clicking through linked screens with arrows showing navigation between them',
      },
      {
        title: 'Iterate and hand off',
        body: 'Refine by talking to the agent — "make the plan picker a three-column layout." Because the artifact lives in your project, the design and the eventual code share one source of truth, closing the usual designer-to-engineer handoff gap.',
        imageAlt:
          'Illustration of a prototype being revised then passed to an engineer, with design and code merging into one file',
      },
    ],
    tableTitle: 'Prototyping with Open Design vs. the old way',
    tableColCapability: 'What you need',
    tableColWithOd: 'With Open Design',
    tableColWithout: 'Traditional prototyping tools',
    tableRows: [
      {
        capability: 'Go from idea to first screen',
        withOd: 'One prompt in the agent you already have open',
        without: 'Open a separate tool, start a file, drag boxes by hand',
      },
      {
        capability: 'Multiple linked screens',
        withOd: 'Generated as a set with shared styles and working navigation',
        without: 'Each frame drawn and linked manually',
      },
      {
        capability: 'Consistent visual system',
        withOd: 'Pulled from a reusable design system the agent applies',
        without: 'Re-created per file or maintained by hand',
      },
      {
        capability: 'Shareable result',
        withOd: 'Self-contained HTML — opens in any browser, no account',
        without: 'Viewer needs a seat or a share link in the vendor tool',
      },
      {
        capability: 'Path to real code',
        withOd: 'Artifact lives in your repo; design and code share one source',
        without: 'Re-built from scratch after a separate handoff',
      },
      {
        capability: 'Cost & lock-in',
        withOd: 'Open source, bring your own keys, runs locally',
        without: 'Per-seat subscription, vendor-hosted, export-limited',
      },
    ],
    galleryTitle: 'Prototypes people built with Open Design',
    galleryLead:
      'Every one of these started as a prompt and rendered to a clickable artifact. Pick a template close to your idea, describe your variation, and the agent adapts it.',
    gallery: [
      { thumb: 'example-dating-web', caption: 'Dating web app — multi-screen flow' },
      { thumb: 'example-gamified-app', caption: 'Gamified mobile app' },
      { thumb: 'example-hr-onboarding', caption: 'HR onboarding flow' },
      { thumb: 'example-mobile-app', caption: 'Mobile app prototype' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Browse prototype templates',
    faqTitle: 'Prototyping FAQ',
    faq: [
      {
        q: 'Do I need a design tool like Figma to prototype with Open Design?',
        a: 'No. Open Design runs inside your coding agent and renders prototypes to HTML. You describe the flow in language; the agent produces the screens. There is no separate canvas tool to learn or pay for.',
      },
      {
        q: 'Are the prototypes interactive or just static mockups?',
        a: 'Interactive. Navigation, tabs, and modals work because the output is real HTML and CSS. You can click through it in any browser exactly as a user would.',
      },
      {
        q: 'Which agents can I use?',
        a: 'Open Design works with Claude Code, Codex, Cursor Agent, Gemini CLI, and a dozen more first-party adapters. You bring your own provider keys; nothing is hosted for you.',
      },
      {
        q: 'Can a prototype become the real product?',
        a: 'That is the point. The artifact lives in your project, so the same design system and components carry into production code instead of being thrown away after a handoff.',
      },
    ],
    ctaTitle: 'Prototype your next idea tonight',
    ctaBody:
      'Star the repo, install Open Design, and turn your next "what if" into something you can click — in the agent you already use.',
  },
  dashboard: {
    title: 'Generate data dashboards with Open Design + Claude Code',
    description:
      'Describe the metrics you track and let your coding agent build a styled, responsive dashboard — charts, KPI cards, and tables rendered to HTML you can host anywhere. No BI tool seat, no drag-and-drop builder.',
    breadcrumb: 'Dashboard',
    label: 'Use case · Dashboard',
    heading: 'Dashboards from a description, not a drag-and-drop builder',
    lead: 'Tell your agent what to show and how it should feel. Open Design supplies the chart patterns, layout system, and visual language so you get a coherent, presentable dashboard — not a wall of default-styled widgets.',
    heroImageAlt:
      'Editorial illustration of raw numbers on the left flowing into a clean dashboard of charts and KPI cards on the right',
    tldrTitle: 'In one line',
    tldrBody:
      'Open Design turns a plain-language spec of your metrics into a styled dashboard your agent renders to HTML — versioned in your repo, hostable anywhere, with no per-seat BI subscription.',
    stepsTitle: 'How dashboards work with Open Design',
    steps: [
      {
        title: 'Describe the metrics',
        body: 'List what matters — "weekly active users, revenue by plan, churn, and a 30-day trend." The agent loads the dashboard skill so it knows to lay out KPI cards, charts, and a table rather than a single block of text.',
        imageAlt: 'Illustration of a person listing the metrics they care about',
      },
      {
        title: 'Pick the chart patterns',
        body: 'Open Design ships chart and layout templates, so trends become line charts, breakdowns become bars, and ratios become the right visual — consistent typography and spacing throughout instead of mismatched defaults.',
        imageAlt: 'Illustration of several chart types arranged into a coherent grid',
      },
      {
        title: 'Wire in your data',
        body: 'Point the dashboard at a CSV, a JSON endpoint, or paste sample rows. It renders to self-contained HTML that updates when the data does — open it in any browser, drop it on any static host.',
        imageAlt: 'Illustration of a data file connecting into a live-updating dashboard',
      },
      {
        title: 'Refine and ship',
        body: 'Adjust by talking to the agent — "group revenue by region, move the KPI row to the top." The artifact lives in your project, so the dashboard is reviewable and versioned like any other code.',
        imageAlt: 'Illustration of a dashboard being refined then deployed',
      },
    ],
    tableTitle: 'Dashboards with Open Design vs. the old way',
    tableColCapability: 'What you need',
    tableColWithOd: 'With Open Design',
    tableColWithout: 'BI tools / hand-coded',
    tableRows: [
      {
        capability: 'Go from metrics list to layout',
        withOd: 'One prompt; the agent lays out cards, charts, and tables',
        without: 'Drag widgets one by one, or write chart code from scratch',
      },
      {
        capability: 'Consistent visual system',
        withOd: 'Chart patterns and spacing from a reusable design system',
        without: 'Default widget styles, or styled by hand per chart',
      },
      {
        capability: 'Connect data',
        withOd: 'CSV / JSON / pasted rows, rendered to live HTML',
        without: 'Vendor connectors or bespoke data plumbing',
      },
      {
        capability: 'Hosting & sharing',
        withOd: 'Self-contained HTML on any static host, no account',
        without: 'Viewer needs a seat in the BI vendor',
      },
      {
        capability: 'Review & versioning',
        withOd: 'Lives in your repo; diffable like code',
        without: 'Locked inside the vendor, no real diff',
      },
      {
        capability: 'Cost & lock-in',
        withOd: 'Open source, bring your own keys, runs locally',
        without: 'Per-seat subscription, vendor-hosted',
      },
    ],
    galleryTitle: 'Dashboards people built with Open Design',
    galleryLead:
      'Real dashboards rendered from a prompt and a data source. Start from one close to yours and describe the metrics you track.',
    gallery: [
      { thumb: 'example-dashboard', caption: 'Analytics dashboard' },
      { thumb: 'example-github-dashboard', caption: 'GitHub activity dashboard' },
      { thumb: 'example-live-dashboard', caption: 'Live metrics dashboard' },
      { thumb: 'example-data-report', caption: 'Data report' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Browse dashboard templates',
    faqTitle: 'Dashboard FAQ',
    faq: [
      {
        q: 'Do I need a BI tool like Tableau or Looker?',
        a: 'No. Open Design renders dashboards to HTML inside your coding agent. You describe the metrics and point it at your data; there is no separate BI platform to license or learn.',
      },
      {
        q: 'Where does the data come from?',
        a: 'A CSV, a JSON endpoint, or rows you paste in. The dashboard is plain HTML and JavaScript, so you control exactly where it reads from — nothing is proxied through a hosted service.',
      },
      {
        q: 'Can non-technical teammates view it?',
        a: 'Yes. The output is a self-contained web page. Anyone with the link or file can open it in a browser — no account, no seat.',
      },
      {
        q: 'Which agents can I use?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI, and a dozen more first-party adapters. You bring your own provider keys.',
      },
    ],
    ctaTitle: 'Build your dashboard tonight',
    ctaBody:
      'Star the repo, install Open Design, and turn your metrics into a dashboard you can host anywhere — in the agent you already use.',
  },
  slides: {
    title: 'Generate presentation decks with Open Design + Claude Code',
    description:
      'Turn an outline into a designed, on-brand slide deck without opening a presentation app. Open Design gives your coding agent deck templates and a visual system, rendering slides to HTML you can present, export, or share.',
    breadcrumb: 'Slides',
    label: 'Use case · Slides',
    heading: 'Decks that look designed, written by a prompt',
    lead: 'Hand your agent an outline and a tone. Open Design applies a deck template and visual system so every slide is laid out, typeset, and on-brand — not a bullet list on a blank background.',
    heroImageAlt:
      'Editorial illustration of an outline on the left turning into a sequence of designed presentation slides on the right',
    tldrTitle: 'In one line',
    tldrBody:
      'Open Design turns an outline into a designed HTML deck your agent renders in one session — present it in the browser, export to PDF or PPTX, and keep the source in your repo.',
    stepsTitle: 'How decks work with Open Design',
    steps: [
      {
        title: 'Give it the outline',
        body: 'Paste your talking points or a rough structure. The agent loads the deck skill so it produces a sequence of laid-out slides, not one long document.',
        imageAlt: 'Illustration of a text outline being handed to an agent',
      },
      {
        title: 'Choose a deck style',
        body: 'Open Design ships deck templates — editorial, Swiss-international, dark technical, and more. The agent applies one so typography, grid, and accents stay consistent across every slide.',
        imageAlt: 'Illustration of several deck style options laid side by side',
      },
      {
        title: 'Generate the slides',
        body: 'Each point becomes a designed slide with the right hierarchy — titles, supporting visuals, data callouts. It renders to HTML, so it presents full-screen in any browser.',
        imageAlt: 'Illustration of a sequence of finished slides with consistent styling',
      },
      {
        title: 'Present, export, iterate',
        body: 'Present from the browser, or export to PDF / PPTX for sharing. Refine by talking to the agent — "tighten the data slide, add a closing call to action." The deck source stays in your project.',
        imageAlt: 'Illustration of a deck being presented and exported to multiple formats',
      },
    ],
    tableTitle: 'Decks with Open Design vs. the old way',
    tableColCapability: 'What you need',
    tableColWithOd: 'With Open Design',
    tableColWithout: 'PowerPoint / Keynote / AI slide tools',
    tableRows: [
      {
        capability: 'Go from outline to slides',
        withOd: 'One prompt; the agent lays out every slide',
        without: 'Build each slide by hand, or fight a template',
      },
      {
        capability: 'Consistent design',
        withOd: 'Deck templates with a real grid and type system',
        without: 'Theme drift, manual alignment, off-brand defaults',
      },
      {
        capability: 'Data & diagrams',
        withOd: 'Charts and callouts rendered as part of the slide',
        without: 'Paste static images or rebuild charts each time',
      },
      {
        capability: 'Export formats',
        withOd: 'HTML to present, plus PDF / PPTX export',
        without: 'Locked to one app’s format',
      },
      {
        capability: 'Review & versioning',
        withOd: 'Source lives in your repo, diffable',
        without: 'Binary file, no meaningful diff',
      },
      {
        capability: 'Cost & lock-in',
        withOd: 'Open source, bring your own keys, runs locally',
        without: 'App license or per-seat AI add-on',
      },
    ],
    galleryTitle: 'Decks people built with Open Design',
    galleryLead:
      'Real decks rendered from an outline. Pick a style close to your talk and describe the content.',
    gallery: [
      { thumb: 'example-deck-swiss-international', caption: 'Swiss-international deck' },
      { thumb: 'example-deck-guizang-editorial', caption: 'Editorial magazine deck' },
      { thumb: 'example-guizang-ppt', caption: 'Illustrated keynote' },
      { thumb: 'example-html-ppt-knowledge-arch-blueprint', caption: 'Technical blueprint deck' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Browse deck templates',
    faqTitle: 'Slides FAQ',
    faq: [
      {
        q: 'Do I need PowerPoint or Keynote?',
        a: 'No. Open Design renders decks to HTML inside your coding agent and can export to PDF or PPTX. You present from the browser or hand off a file — no presentation app required to build it.',
      },
      {
        q: 'Are these just AI-generated bullet points?',
        a: 'No. The agent applies a real deck template with a grid, type scale, and visual hierarchy, so slides look designed rather than auto-filled.',
      },
      {
        q: 'Can I export to PowerPoint for a client?',
        a: 'Yes. Decks export to PPTX and PDF in addition to the HTML you present from, so they fit whatever the audience expects.',
      },
      {
        q: 'Which agents can I use?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI, and more first-party adapters, with your own provider keys.',
      },
    ],
    ctaTitle: 'Build your next deck tonight',
    ctaBody:
      'Star the repo, install Open Design, and turn your outline into a designed deck — in the agent you already use.',
  },
  image: {
    title: 'Generate on-brand graphics with Open Design + Claude Code',
    description:
      'Produce social cards, article covers, and marketing graphics from a prompt — laid out with real typography and your brand system, rendered to crisp HTML you can export to PNG. No design app, no template subscription.',
    breadcrumb: 'Image',
    label: 'Use case · Image',
    heading: 'On-brand graphics, generated and laid out for you',
    lead: 'Describe the card or cover you need. Open Design composes it with real type, grid, and your brand colors — then renders to HTML you can export as an image, instead of wrestling a design app or a generic template.',
    heroImageAlt:
      'Editorial illustration of a prompt turning into a set of laid-out social cards and article covers',
    tldrTitle: 'In one line',
    tldrBody:
      'Open Design turns a prompt into a typeset, on-brand graphic your agent renders to HTML and exports to PNG — repeatable, versioned, and free of per-seat design tools.',
    stepsTitle: 'How graphics work with Open Design',
    steps: [
      {
        title: 'Describe the graphic',
        body: 'Say what it is — "a Twitter card for our launch with the headline and a quote." The agent loads the right skill so it composes a laid-out graphic, not a plain text block.',
        imageAlt: 'Illustration of a person describing a social card they need',
      },
      {
        title: 'Apply the brand system',
        body: 'Open Design pulls your colors, type, and spacing from a reusable design system, so every card matches the rest of your brand instead of looking like a one-off.',
        imageAlt: 'Illustration of brand colors and type being applied to a card layout',
      },
      {
        title: 'Render and export',
        body: 'The graphic renders to HTML at the exact dimensions you need — social card, cover, banner — then exports to PNG. Crisp text, real layout, no manual nudging.',
        imageAlt: 'Illustration of a graphic rendering and exporting to an image file',
      },
      {
        title: 'Reuse the recipe',
        body: 'Because it is a template, the next graphic is one prompt away — change the headline, keep the layout. Series of cards stay perfectly consistent.',
        imageAlt: 'Illustration of one card template producing a consistent series of graphics',
      },
    ],
    tableTitle: 'Graphics with Open Design vs. the old way',
    tableColCapability: 'What you need',
    tableColWithOd: 'With Open Design',
    tableColWithout: 'Design apps / generic templates',
    tableRows: [
      {
        capability: 'Go from idea to laid-out graphic',
        withOd: 'One prompt; the agent composes type and layout',
        without: 'Open an app, place every element by hand',
      },
      {
        capability: 'Stay on brand',
        withOd: 'Colors and type from a reusable design system',
        without: 'Re-pick brand styles per file, or drift off-brand',
      },
      {
        capability: 'Consistent series',
        withOd: 'Same template, new copy — perfectly aligned set',
        without: 'Re-align each variant manually',
      },
      {
        capability: 'Export',
        withOd: 'HTML at exact dimensions, exported to PNG',
        without: 'Manual canvas sizing and export settings',
      },
      {
        capability: 'Repeatable',
        withOd: 'A prompt-driven recipe in your repo',
        without: 'A one-off file you recreate each time',
      },
      {
        capability: 'Cost & lock-in',
        withOd: 'Open source, bring your own keys, runs locally',
        without: 'Per-seat design tool or template marketplace',
      },
    ],
    galleryTitle: 'Graphics people built with Open Design',
    galleryLead:
      'Real cards and covers rendered from a prompt. Pick one close to what you need and swap in your copy.',
    gallery: [
      { thumb: 'example-card-twitter', caption: 'Twitter / X social card' },
      { thumb: 'example-card-xiaohongshu', caption: 'Xiaohongshu card' },
      { thumb: 'example-article-magazine', caption: 'Magazine article cover' },
      { thumb: 'example-frame-liquid-bg-hero', caption: 'Hero graphic' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Browse graphic templates',
    faqTitle: 'Image FAQ',
    faq: [
      {
        q: 'Is this an AI image generator like Midjourney?',
        a: 'No. Open Design composes graphics with real layout and typography — your headline, your brand, exact dimensions — and renders to HTML you export as PNG. It is design composition, not pixel generation.',
      },
      {
        q: 'Can I make a consistent series of cards?',
        a: 'Yes. Because each graphic is a template, you keep the layout and change the copy, so a whole series stays perfectly aligned and on-brand.',
      },
      {
        q: 'What sizes can it produce?',
        a: 'Any — the graphic renders at the exact dimensions you specify, from a square social card to a wide banner, then exports to PNG.',
      },
      {
        q: 'Which agents can I use?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI, and more first-party adapters, with your own provider keys.',
      },
    ],
    ctaTitle: 'Make your next graphic tonight',
    ctaBody:
      'Star the repo, install Open Design, and turn a prompt into an on-brand graphic — in the agent you already use.',
  },
  video: {
    title: 'Generate motion graphics & short video with Open Design + Claude Code',
    description:
      'Turn a script into animated frames and short-form video — title cards, motion backgrounds, and outros composed with your brand system and rendered from HTML. No motion-graphics suite, no timeline scrubbing.',
    breadcrumb: 'Video',
    label: 'Use case · Video',
    heading: 'Motion graphics from a script, not a timeline',
    lead: 'Describe the moment you want — a title reveal, a data animation, a logo outro. Open Design composes animated frames with your brand system and renders them to video, no motion-graphics suite required.',
    heroImageAlt:
      'Editorial illustration of a script turning into a sequence of animated video frames',
    tldrTitle: 'In one line',
    tldrBody:
      'Open Design turns a script into animated, on-brand frames your agent renders to short-form video — composed from HTML, versioned in your repo, with no timeline editor to learn.',
    stepsTitle: 'How motion works with Open Design',
    steps: [
      {
        title: 'Describe the moment',
        body: 'Say what should happen — "a glitch title that resolves into our logo, then a closing card." The agent loads the motion skill so it produces animated frames, not a static image.',
        imageAlt: 'Illustration of a person describing a motion sequence',
      },
      {
        title: 'Apply the brand & motion style',
        body: 'Open Design supplies frame templates — cinematic light leaks, glitch titles, logo outros — and applies your colors and type, so the motion looks intentional and on-brand.',
        imageAlt: 'Illustration of brand styling applied to animated frames',
      },
      {
        title: 'Render the frames to video',
        body: 'Frames are composed in HTML and rendered to video, so timing and layout are precise and repeatable — no manual keyframing on a timeline.',
        imageAlt: 'Illustration of HTML frames rendering into a video clip',
      },
      {
        title: 'Iterate and export',
        body: 'Refine by talking to the agent — "slow the title reveal, add a caption." Export short-form clips for social or product. The source stays in your project.',
        imageAlt: 'Illustration of a video clip being refined and exported for social',
      },
    ],
    tableTitle: 'Motion with Open Design vs. the old way',
    tableColCapability: 'What you need',
    tableColWithOd: 'With Open Design',
    tableColWithout: 'After Effects / motion suites',
    tableRows: [
      {
        capability: 'Go from script to animated frames',
        withOd: 'One prompt; the agent composes the sequence',
        without: 'Keyframe each element on a timeline by hand',
      },
      {
        capability: 'Stay on brand',
        withOd: 'Frame templates + your colors and type',
        without: 'Rebuild brand styling per project',
      },
      {
        capability: 'Precise, repeatable timing',
        withOd: 'Composed in HTML, rendered deterministically',
        without: 'Manual scrubbing, hard to reproduce',
      },
      {
        capability: 'Export for social',
        withOd: 'Short-form clips rendered to video',
        without: 'Export presets and codec wrangling',
      },
      {
        capability: 'Review & versioning',
        withOd: 'Frame source lives in your repo, diffable',
        without: 'Binary project file, no real diff',
      },
      {
        capability: 'Cost & lock-in',
        withOd: 'Open source, bring your own keys, runs locally',
        without: 'Expensive suite, steep learning curve',
      },
    ],
    galleryTitle: 'Motion people built with Open Design',
    galleryLead:
      'Real animated frames and clips rendered from a prompt. Pick one close to your idea and describe the motion.',
    gallery: [
      { thumb: 'example-video-hyperframes', caption: 'Hyperframes motion sequence' },
      { thumb: 'example-video-shortform', caption: 'Short-form social video' },
      { thumb: 'example-motion-frames', caption: 'Motion frame set' },
      { thumb: 'example-frame-light-leak-cinema', caption: 'Cinematic light-leak frame' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Browse motion templates',
    faqTitle: 'Video FAQ',
    faq: [
      {
        q: 'Do I need After Effects or a motion-graphics suite?',
        a: 'No. Open Design composes animated frames in HTML and renders them to video inside your coding agent. There is no timeline editor to learn or license.',
      },
      {
        q: 'What kind of video is this good for?',
        a: 'Short-form motion — title cards, data animations, logo outros, social clips. It is built for brand and product motion, not feature-length editing.',
      },
      {
        q: 'Is the timing reproducible?',
        a: 'Yes. Because frames are composed in code and rendered deterministically, you get the same result every time and can tweak it precisely with a prompt.',
      },
      {
        q: 'Which agents can I use?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI, and more first-party adapters, with your own provider keys.',
      },
    ],
    ctaTitle: 'Animate your next idea tonight',
    ctaBody:
      'Star the repo, install Open Design, and turn a script into motion — in the agent you already use.',
  },
  designSystem: {
    title: 'Build and apply a design system with Open Design + Claude Code',
    description:
      'Capture your brand as a reusable design system your coding agent applies to every artifact — colors, type, components, and tone in one DESIGN.md. Define it once; every prototype, deck, and dashboard stays on brand.',
    breadcrumb: 'Design System',
    label: 'Use case · Design System',
    heading: 'One design system, applied to everything your agent makes',
    lead: 'Define your brand once and Open Design carries it into every output — prototypes, decks, dashboards, graphics. The system lives in your repo as a DESIGN.md the agent reads, so consistency is automatic, not manual.',
    heroImageAlt:
      'Editorial illustration of a single design system radiating into many on-brand artifacts',
    tldrTitle: 'In one line',
    tldrBody:
      'Open Design captures your brand as a portable design system your agent applies to every artifact — defined once in your repo, enforced everywhere, with no central design tool to gate-keep it.',
    stepsTitle: 'How design systems work with Open Design',
    steps: [
      {
        title: 'Capture the system',
        body: 'Describe your brand — colors, type, spacing, voice — or point the agent at an existing site to extract it. Open Design writes it into a DESIGN.md that lives in your project.',
        imageAlt: 'Illustration of a brand being captured into a single design-system file',
      },
      {
        title: 'Start from a proven base',
        body: 'Open Design ships 140+ reference design systems — from Apple and Linear to editorial and brutalist. Fork one close to your brand instead of starting from a blank page.',
        imageAlt: 'Illustration of a gallery of reference design systems being browsed',
      },
      {
        title: 'Apply it everywhere',
        body: 'Every other skill reads the same system, so a prototype, a deck, and a dashboard all share one visual language — without you re-specifying it each time.',
        imageAlt: 'Illustration of one system applied consistently across many artifact types',
      },
      {
        title: 'Evolve it in one place',
        body: 'Change the system and the next render reflects it everywhere. Because it is a file in your repo, design decisions are reviewed and versioned like code.',
        imageAlt: 'Illustration of a design system being updated and propagating to all outputs',
      },
    ],
    tableTitle: 'Design systems with Open Design vs. the old way',
    tableColCapability: 'What you need',
    tableColWithOd: 'With Open Design',
    tableColWithout: 'Design-tool libraries / style guides',
    tableRows: [
      {
        capability: 'Define the system',
        withOd: 'A DESIGN.md the agent reads, forked from 140+ references',
        without: 'A static style guide or a tool-bound library',
      },
      {
        capability: 'Apply across artifact types',
        withOd: 'Same system feeds prototypes, decks, dashboards, graphics',
        without: 'Re-implemented per tool and per file',
      },
      {
        capability: 'Keep everything consistent',
        withOd: 'Automatic — every skill reads one source',
        without: 'Manual discipline; drifts over time',
      },
      {
        capability: 'Evolve the brand',
        withOd: 'Edit once; next render updates everywhere',
        without: 'Hunt-and-replace across files and tools',
      },
      {
        capability: 'Review & versioning',
        withOd: 'Lives in your repo, diffable like code',
        without: 'Buried in a design tool, hard to audit',
      },
      {
        capability: 'Cost & lock-in',
        withOd: 'Open source, portable, runs locally',
        without: 'Locked to a design-tool subscription',
      },
    ],
    galleryTitle: 'Design systems in Open Design',
    galleryLead:
      'A few of the 140+ reference systems you can fork as a starting point. Pick one close to your brand and adapt it.',
    gallery: [
      { thumb: 'design-system-apple', caption: 'Apple-style system' },
      { thumb: 'design-system-linear-app', caption: 'Linear-style system' },
      { thumb: 'design-system-airbnb', caption: 'Airbnb-style system' },
      { thumb: 'design-system-vercel', caption: 'Vercel-style system' },
    ],
    exampleHref: '/plugins/systems/',
    exampleLinkLabel: 'Browse design systems',
    faqTitle: 'Design System FAQ',
    faq: [
      {
        q: 'What exactly is the design system here?',
        a: 'A DESIGN.md file in your repo that captures colors, type, spacing, components, and voice. Every Open Design skill reads it, so your brand is applied automatically to whatever the agent produces.',
      },
      {
        q: 'Do I have to start from scratch?',
        a: 'No. Open Design ships 140+ reference design systems you can fork — from Apple and Linear to editorial and brutalist — then adapt to your brand.',
      },
      {
        q: 'How does it stay consistent across decks, dashboards, and prototypes?',
        a: 'Because all of those skills read the same DESIGN.md. Define the system once and consistency is automatic instead of something you police by hand.',
      },
      {
        q: 'Which agents can I use?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI, and more first-party adapters, with your own provider keys.',
      },
    ],
    ctaTitle: 'Define your design system tonight',
    ctaBody:
      'Star the repo, install Open Design, and give your agent one brand to apply everywhere — in the agent you already use.',
  },
};

// ---------------------------------------------------------------------------
// Simplified Chinese (hand-reviewed)
// ---------------------------------------------------------------------------
const ZH: SolutionLocaleCopy = {
  prototype: {
    title: '用 Open Design + Claude Code 做可交互原型',
    description:
      '一句话描述，就能在终端里生成可点击、多屏的原型。Open Design 把设计技能、模板和设计系统交给你的编码 agent，直接产出能在浏览器里打开的真实原型。',
    breadcrumb: '原型',
    label: '使用场景 · 原型',
    heading: '以一句话的速度做原型',
    lead: '把脑子里的流程描述出来，让 agent 拼出真实可点击的原型——多个屏幕、统一样式、可交互——直接渲染成 HTML，能打开、能分享、能交给工程。',
    heroImageAlt: '编辑风插画：一只手画出线框，线框变成可点击的多屏应用原型',
    tldrTitle: '一句话',
    tldrBody:
      'Open Design 是你正在用的编码 agent 的设计层。对原型来说，就是在一次对话里从一段想法走到可导航、有样式的原型——不用设计工具、不用导出、没有交接断层。',
    stepsTitle: '用 Open Design 做原型的流程',
    steps: [
      {
        title: '描述流程',
        body: '用大白话告诉 agent 你要做什么——"一个引导流程，含欢迎页、套餐选择页和确认页"。Open Design 会加载原型 skill，让 agent 知道要产出多个屏幕，而不是单页。',
        imageAlt: '插画：一个人在终端里用自然语言描述应用流程',
      },
      {
        title: '生成带样式的屏幕',
        body: 'agent 套用 Open Design 的设计系统和原型模板，每个屏幕共享字体、间距和组件，而不是看起来像草稿。你得到的是一套连贯的屏幕，不是互不相干的 mockup。',
        imageAlt: '插画：多个应用屏幕依次出现，全部共享同一套视觉风格',
      },
      {
        title: '接上交互',
        body: '按钮能跳转、标签页能切换、弹窗能打开。原型渲染成自包含的 HTML，在任何浏览器里都像真东西一样运行——查看它不需要任何原型工具账号。',
        imageAlt: '插画：光标在彼此链接的屏幕间点击，箭头标出页面之间的跳转',
      },
      {
        title: '迭代并交付',
        body: '靠跟 agent 对话来改——"把套餐选择页改成三列布局"。因为产物就在你的项目里，设计和最终代码共享同一份事实来源，弥合了设计到工程的交接断层。',
        imageAlt: '插画：原型被修改后交给工程师，设计与代码合并成同一个文件',
      },
    ],
    tableTitle: '用 Open Design 做原型 vs. 老办法',
    tableColCapability: '你需要什么',
    tableColWithOd: '用 Open Design',
    tableColWithout: '传统原型工具',
    tableRows: [
      {
        capability: '从想法到第一屏',
        withOd: '在你本来就开着的 agent 里一句话',
        without: '打开另一个工具、新建文件、手动拖框',
      },
      {
        capability: '多个相互链接的屏幕',
        withOd: '成套生成，共享样式、导航可用',
        without: '每一屏手动绘制并手动连线',
      },
      {
        capability: '一致的视觉系统',
        withOd: '从可复用的设计系统里取，由 agent 套用',
        without: '每个文件重做一遍，或纯靠手维护',
      },
      {
        capability: '可分享的成果',
        withOd: '自包含 HTML——任何浏览器都能打开，不需账号',
        without: '查看者要占一个席位或要厂商工具的分享链接',
      },
      {
        capability: '通往真实代码的路径',
        withOd: '产物在你的 repo 里，设计与代码同源',
        without: '一次交接之后从零重建',
      },
      {
        capability: '成本与锁定',
        withOd: '开源、自带密钥、本地运行',
        without: '按席位订阅、厂商托管、导出受限',
      },
    ],
    galleryTitle: '别人用 Open Design 做出来的原型',
    galleryLead:
      '下面每一个都是从一句 prompt 开始、渲染成可点击产物的。挑一个跟你想法接近的模板，描述你的改法，agent 帮你改。',
    gallery: [
      { thumb: 'example-dating-web', caption: '交友 Web 应用——多屏流程' },
      { thumb: 'example-gamified-app', caption: '游戏化移动应用' },
      { thumb: 'example-hr-onboarding', caption: 'HR 入职流程' },
      { thumb: 'example-mobile-app', caption: '移动应用原型' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '浏览原型模板',
    faqTitle: '原型常见问题',
    faq: [
      {
        q: '用 Open Design 做原型需要 Figma 这类设计工具吗？',
        a: '不需要。Open Design 在你的编码 agent 里运行，把原型渲染成 HTML。你用语言描述流程，agent 产出屏幕。没有额外的画布工具要学或要付费。',
      },
      {
        q: '产出的是可交互原型还是静态 mockup？',
        a: '可交互。导航、标签页、弹窗都能用，因为输出是真实的 HTML 和 CSS。你能在任何浏览器里像用户一样点击体验。',
      },
      {
        q: '可以用哪些 agent？',
        a: 'Open Design 支持 Claude Code、Codex、Cursor Agent、Gemini CLI 等十多个一方适配。你自带 provider 密钥，没有任何东西替你托管。',
      },
      {
        q: '原型能变成真正的产品吗？',
        a: '这正是重点。产物就在你的项目里，同一套设计系统和组件会带进生产代码，而不是交接后被丢弃。',
      },
    ],
    ctaTitle: '今晚就把下一个想法做成原型',
    ctaBody:
      '给 repo 点个 star、装上 Open Design，在你本来就用的 agent 里，把下一个"要是……"变成能点击的东西。',
  },
  dashboard: {
    title: '用 Open Design + Claude Code 生成数据看板',
    description:
      '描述你要盯的指标，让编码 agent 帮你做出有样式、响应式的看板——图表、KPI 卡片、表格，全部渲染成可随处托管的 HTML。不用 BI 工具席位，不用拖拽搭建。',
    breadcrumb: '看板',
    label: '使用场景 · 看板',
    heading: '看板靠描述生成，不靠拖拽搭建',
    lead: '告诉 agent 要展示什么、要什么感觉。Open Design 提供图表范式、布局系统和视觉语言，你拿到的是连贯、能拿得出手的看板，而不是一堆默认样式的控件。',
    heroImageAlt: '编辑风插画：左边的原始数字流向右边一个干净的图表 + KPI 卡片看板',
    tldrTitle: '一句话',
    tldrBody:
      'Open Design 把你对指标的大白话描述变成有样式的看板，由 agent 渲染成 HTML——在你的 repo 里版本化、随处可托管、无需按席位订阅 BI。',
    stepsTitle: '用 Open Design 做看板的流程',
    steps: [
      {
        title: '描述指标',
        body: '列出你关心的——"周活、按套餐分的收入、流失率、近 30 天趋势"。agent 加载看板 skill，知道要排布 KPI 卡片、图表和表格，而不是一段文字。',
        imageAlt: '插画：一个人列出自己关心的指标',
      },
      {
        title: '选择图表范式',
        body: 'Open Design 自带图表和布局模板，趋势变折线、占比变柱状、比例用对的图——全程字体和间距统一，而不是一堆不搭的默认样式。',
        imageAlt: '插画：多种图表类型排成一个连贯的网格',
      },
      {
        title: '接入数据',
        body: '把看板指向 CSV、JSON 接口，或粘贴示例行。它渲染成自包含 HTML，数据变它就变——任何浏览器能打开，任何静态托管能放。',
        imageAlt: '插画：一个数据文件接入实时更新的看板',
      },
      {
        title: '打磨并交付',
        body: '靠跟 agent 对话来调——"收入按地区分组、把 KPI 行挪到顶部"。产物在你的项目里，看板像任何代码一样可 review、可版本化。',
        imageAlt: '插画：看板被打磨后部署上线',
      },
    ],
    tableTitle: '用 Open Design 做看板 vs. 老办法',
    tableColCapability: '你需要什么',
    tableColWithOd: '用 Open Design',
    tableColWithout: 'BI 工具 / 纯手写',
    tableRows: [
      { capability: '从指标清单到布局', withOd: '一句话，agent 排布卡片、图表、表格', without: '一个个拖控件，或从零写图表代码' },
      { capability: '一致的视觉系统', withOd: '图表范式和间距来自可复用设计系统', without: '默认控件样式，或每张图手动调' },
      { capability: '接入数据', withOd: 'CSV / JSON / 粘贴行，渲染成实时 HTML', without: '厂商连接器或定制数据管道' },
      { capability: '托管与分享', withOd: '自包含 HTML 放任何静态托管，不要账号', without: '查看者要 BI 厂商的席位' },
      { capability: 'review 与版本化', withOd: '在 repo 里，像代码一样可 diff', without: '锁在厂商里，无法真正 diff' },
      { capability: '成本与锁定', withOd: '开源、自带密钥、本地运行', without: '按席位订阅、厂商托管' },
    ],
    galleryTitle: '别人用 Open Design 做出来的看板',
    galleryLead: '下面是从 prompt + 数据源渲染出的真实看板。挑一个接近你的，描述你要盯的指标。',
    gallery: [
      { thumb: 'example-dashboard', caption: '分析看板' },
      { thumb: 'example-github-dashboard', caption: 'GitHub 活动看板' },
      { thumb: 'example-live-dashboard', caption: '实时指标看板' },
      { thumb: 'example-data-report', caption: '数据报告' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '浏览看板模板',
    faqTitle: '看板常见问题',
    faq: [
      { q: '需要 Tableau、Looker 这类 BI 工具吗？', a: '不需要。Open Design 在你的编码 agent 里把看板渲染成 HTML。你描述指标、指向数据，没有额外的 BI 平台要授权或学习。' },
      { q: '数据从哪来？', a: 'CSV、JSON 接口，或你粘贴的行。看板是纯 HTML + JavaScript，你完全控制它从哪读——不经任何托管服务中转。' },
      { q: '非技术同事能看吗？', a: '能。产出是自包含网页，任何人拿到链接或文件就能在浏览器打开——不要账号、不要席位。' },
      { q: '可以用哪些 agent？', a: 'Claude Code、Codex、Cursor Agent、Gemini CLI 等十多个一方适配，自带 provider 密钥。' },
    ],
    ctaTitle: '今晚就把看板做出来',
    ctaBody: '给 repo 点个 star、装上 Open Design，把你的指标变成一个随处可托管的看板——在你本来就用的 agent 里。',
  },
  slides: {
    title: '用 Open Design + Claude Code 生成演示文稿',
    description:
      '把大纲变成有设计感、符合品牌的幻灯片，不用打开任何演示软件。Open Design 给编码 agent 提供 deck 模板和视觉系统，把幻灯片渲染成可演示、可导出、可分享的 HTML。',
    breadcrumb: '幻灯片',
    label: '使用场景 · 幻灯片',
    heading: '看起来精心设计的 deck，由一句 prompt 写出来',
    lead: '把大纲和语气交给 agent。Open Design 套用 deck 模板和视觉系统，每一页都排好版、配好字、贴合品牌——不是空白底上的一串要点。',
    heroImageAlt: '编辑风插画：左边的大纲变成右边一连串有设计感的演示幻灯片',
    tldrTitle: '一句话',
    tldrBody:
      'Open Design 把大纲变成有设计感的 HTML deck，由 agent 一次生成——浏览器里全屏演示、导出 PDF 或 PPTX、源文件留在 repo。',
    stepsTitle: '用 Open Design 做 deck 的流程',
    steps: [
      { title: '给它大纲', body: '粘贴你的要点或粗略结构。agent 加载 deck skill，产出一连串排好版的幻灯片，而不是一篇长文档。', imageAlt: '插画：一份文字大纲被交给 agent' },
      { title: '选一个 deck 风格', body: 'Open Design 自带 deck 模板——编辑风、瑞士国际主义、深色技术风等。agent 套用其中一个，字体、网格、强调色在每页之间保持一致。', imageAlt: '插画：几种 deck 风格并排展示' },
      { title: '生成幻灯片', body: '每个要点变成一页有层次的幻灯片——标题、辅助视觉、数据高亮。渲染成 HTML，任何浏览器都能全屏演示。', imageAlt: '插画：一连串风格一致的成品幻灯片' },
      { title: '演示、导出、迭代', body: '从浏览器演示，或导出 PDF / PPTX 分享。靠跟 agent 对话来改——"收紧数据页、加一个结尾行动号召"。deck 源文件留在你的项目里。', imageAlt: '插画：一个 deck 被演示并导出成多种格式' },
    ],
    tableTitle: '用 Open Design 做 deck vs. 老办法',
    tableColCapability: '你需要什么',
    tableColWithOd: '用 Open Design',
    tableColWithout: 'PowerPoint / Keynote / AI 幻灯工具',
    tableRows: [
      { capability: '从大纲到幻灯片', withOd: '一句话，agent 排布每一页', without: '一页页手搭，或跟模板较劲' },
      { capability: '一致的设计', withOd: 'deck 模板带真实网格和字体系统', without: '主题跑偏、手动对齐、默认样式不贴品牌' },
      { capability: '数据与图示', withOd: '图表和高亮作为幻灯片的一部分渲染', without: '贴静态图，或每次重建图表' },
      { capability: '导出格式', withOd: 'HTML 演示，外加 PDF / PPTX 导出', without: '锁在某个软件的格式里' },
      { capability: 'review 与版本化', withOd: '源文件在 repo 里，可 diff', without: '二进制文件，无法有意义地 diff' },
      { capability: '成本与锁定', withOd: '开源、自带密钥、本地运行', without: '软件授权或按席位的 AI 附加费' },
    ],
    galleryTitle: '别人用 Open Design 做出来的 deck',
    galleryLead: '下面是从大纲渲染出的真实 deck。挑一个接近你演讲风格的，描述内容。',
    gallery: [
      { thumb: 'example-deck-swiss-international', caption: '瑞士国际主义 deck' },
      { thumb: 'example-deck-guizang-editorial', caption: '编辑杂志风 deck' },
      { thumb: 'example-guizang-ppt', caption: '插画风主题演讲' },
      { thumb: 'example-html-ppt-knowledge-arch-blueprint', caption: '技术蓝图 deck' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '浏览 deck 模板',
    faqTitle: '幻灯片常见问题',
    faq: [
      { q: '需要 PowerPoint 或 Keynote 吗？', a: '不需要。Open Design 在你的编码 agent 里把 deck 渲染成 HTML，还能导出 PDF 或 PPTX。你从浏览器演示或交付文件——做的时候不需要任何演示软件。' },
      { q: '这只是 AI 生成的要点吗？', a: '不是。agent 套用带网格、字号体系和视觉层次的真实 deck 模板，幻灯片看起来是设计出来的，而不是自动填的。' },
      { q: '能导出 PowerPoint 给客户吗？', a: '能。deck 除了用来演示的 HTML，还能导出 PPTX 和 PDF，适配观众的预期。' },
      { q: '可以用哪些 agent？', a: 'Claude Code、Codex、Cursor Agent、Gemini CLI 等一方适配，自带 provider 密钥。' },
    ],
    ctaTitle: '今晚就把下一个 deck 做出来',
    ctaBody: '给 repo 点个 star、装上 Open Design，把你的大纲变成有设计感的 deck——在你本来就用的 agent 里。',
  },
  image: {
    title: '用 Open Design + Claude Code 生成贴合品牌的图片',
    description:
      '从一句 prompt 产出社交卡片、文章封面、营销图——用真实排版和你的品牌系统排好版，渲染成可导出 PNG 的清晰 HTML。不用设计软件，不用订阅模板。',
    breadcrumb: '图片',
    label: '使用场景 · 图片',
    heading: '贴合品牌的图片，自动生成并排好版',
    lead: '描述你要的卡片或封面。Open Design 用真实字体、网格和你的品牌色把它组合出来，再渲染成可导出图片的 HTML——不用跟设计软件或通用模板较劲。',
    heroImageAlt: '编辑风插画：一句 prompt 变成一组排好版的社交卡片和文章封面',
    tldrTitle: '一句话',
    tldrBody:
      'Open Design 把 prompt 变成排好版、贴合品牌的图片，由 agent 渲染成 HTML 并导出 PNG——可复用、可版本化，没有按席位的设计工具。',
    stepsTitle: '用 Open Design 做图的流程',
    steps: [
      { title: '描述图片', body: '说清它是什么——"一张发布用的 Twitter 卡片，带标题和一句引用"。agent 加载对应 skill，组合出排好版的图片，而不是纯文字块。', imageAlt: '插画：一个人描述自己需要的社交卡片' },
      { title: '套用品牌系统', body: 'Open Design 从可复用设计系统里取你的颜色、字体和间距，每张卡片都跟品牌其余部分一致，而不是各做各的。', imageAlt: '插画：品牌色和字体被套用到卡片布局上' },
      { title: '渲染并导出', body: '图片按你要的精确尺寸渲染成 HTML——社交卡、封面、横幅——再导出 PNG。文字清晰、布局真实、不用手动微调。', imageAlt: '插画：一张图片渲染并导出成图片文件' },
      { title: '复用这套配方', body: '因为它是模板，下一张图只差一句 prompt——换标题、留布局。成系列的卡片完美一致。', imageAlt: '插画：一个卡片模板产出一致的系列图片' },
    ],
    tableTitle: '用 Open Design 做图 vs. 老办法',
    tableColCapability: '你需要什么',
    tableColWithOd: '用 Open Design',
    tableColWithout: '设计软件 / 通用模板',
    tableRows: [
      { capability: '从想法到排好版的图', withOd: '一句话，agent 组合字体和布局', without: '打开软件、手动摆每个元素' },
      { capability: '保持贴合品牌', withOd: '颜色和字体来自可复用设计系统', without: '每个文件重选品牌样式，或跑偏' },
      { capability: '一致的系列', withOd: '同模板、换文案——完美对齐的一组', without: '每个变体手动对齐' },
      { capability: '导出', withOd: 'HTML 按精确尺寸，导出 PNG', without: '手动调画布尺寸和导出设置' },
      { capability: '可复用', withOd: 'repo 里一套 prompt 驱动的配方', without: '每次重做的一次性文件' },
      { capability: '成本与锁定', withOd: '开源、自带密钥、本地运行', without: '按席位的设计工具或模板市场' },
    ],
    galleryTitle: '别人用 Open Design 做出来的图',
    galleryLead: '下面是从 prompt 渲染出的真实卡片和封面。挑一个接近你需要的，换上你的文案。',
    gallery: [
      { thumb: 'example-card-twitter', caption: 'Twitter / X 社交卡片' },
      { thumb: 'example-card-xiaohongshu', caption: '小红书卡片' },
      { thumb: 'example-article-magazine', caption: '杂志文章封面' },
      { thumb: 'example-frame-liquid-bg-hero', caption: 'Hero 主视觉图' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '浏览图片模板',
    faqTitle: '图片常见问题',
    faq: [
      { q: '这是 Midjourney 那种 AI 生图吗？', a: '不是。Open Design 用真实布局和排版组合图片——你的标题、你的品牌、精确尺寸——渲染成 HTML 再导出 PNG。是设计排版，不是像素生成。' },
      { q: '能做风格一致的系列卡片吗？', a: '能。因为每张图都是模板，保留布局换文案，整个系列就完美对齐、贴合品牌。' },
      { q: '能出哪些尺寸？', a: '任意——图片按你指定的精确尺寸渲染，从方形社交卡到宽幅横幅，再导出 PNG。' },
      { q: '可以用哪些 agent？', a: 'Claude Code、Codex、Cursor Agent、Gemini CLI 等一方适配，自带 provider 密钥。' },
    ],
    ctaTitle: '今晚就把下一张图做出来',
    ctaBody: '给 repo 点个 star、装上 Open Design，把一句 prompt 变成贴合品牌的图片——在你本来就用的 agent 里。',
  },
  video: {
    title: '用 Open Design + Claude Code 生成动态图形和短视频',
    description:
      '把脚本变成动画帧和短视频——标题卡、动态背景、片尾，用你的品牌系统组合并从 HTML 渲染。不用动态图形套件，不用在时间轴上拖拽。',
    breadcrumb: '视频',
    label: '使用场景 · 视频',
    heading: '动态图形靠脚本生成，不靠时间轴',
    lead: '描述你想要的那一刻——标题揭示、数据动画、logo 片尾。Open Design 用你的品牌系统组合动画帧并渲染成视频，不需要动态图形套件。',
    heroImageAlt: '编辑风插画：一份脚本变成一连串动画视频帧',
    tldrTitle: '一句话',
    tldrBody:
      'Open Design 把脚本变成贴合品牌的动画帧，由 agent 渲染成短视频——从 HTML 组合、在 repo 里版本化、不用学时间轴编辑器。',
    stepsTitle: '用 Open Design 做动效的流程',
    steps: [
      { title: '描述那一刻', body: '说清要发生什么——"一个故障感标题化解成我们的 logo，然后一张结尾卡"。agent 加载动效 skill，产出动画帧而不是静态图。', imageAlt: '插画：一个人描述一段动效序列' },
      { title: '套用品牌与动效风格', body: 'Open Design 提供帧模板——电影感漏光、故障标题、logo 片尾——并套用你的颜色和字体，让动效看起来是有意为之、贴合品牌。', imageAlt: '插画：品牌样式被套用到动画帧上' },
      { title: '把帧渲染成视频', body: '帧在 HTML 里组合并渲染成视频，时序和布局精确可复现——不用在时间轴上手动打关键帧。', imageAlt: '插画：HTML 帧渲染成一段视频' },
      { title: '迭代并导出', body: '靠跟 agent 对话来改——"放慢标题揭示、加一行字幕"。导出短视频用于社交或产品。源文件留在你的项目里。', imageAlt: '插画：一段视频被打磨并导出用于社交' },
    ],
    tableTitle: '用 Open Design 做动效 vs. 老办法',
    tableColCapability: '你需要什么',
    tableColWithOd: '用 Open Design',
    tableColWithout: 'After Effects / 动效套件',
    tableRows: [
      { capability: '从脚本到动画帧', withOd: '一句话，agent 组合整段序列', without: '在时间轴上一个个手打关键帧' },
      { capability: '保持贴合品牌', withOd: '帧模板 + 你的颜色和字体', without: '每个项目重建品牌样式' },
      { capability: '精确可复现的时序', withOd: '在 HTML 里组合、确定性渲染', without: '手动拖拽，难以复现' },
      { capability: '导出用于社交', withOd: '短视频渲染成片', without: '导出预设和编码格式折腾' },
      { capability: 'review 与版本化', withOd: '帧源文件在 repo 里，可 diff', without: '二进制工程文件，无法真正 diff' },
      { capability: '成本与锁定', withOd: '开源、自带密钥、本地运行', without: '昂贵套件、陡峭学习曲线' },
    ],
    galleryTitle: '别人用 Open Design 做出来的动效',
    galleryLead: '下面是从 prompt 渲染出的真实动画帧和短片。挑一个接近你想法的，描述动效。',
    gallery: [
      { thumb: 'example-video-hyperframes', caption: 'Hyperframes 动效序列' },
      { thumb: 'example-video-shortform', caption: '短视频' },
      { thumb: 'example-motion-frames', caption: '动效帧组' },
      { thumb: 'example-frame-light-leak-cinema', caption: '电影感漏光帧' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '浏览动效模板',
    faqTitle: '视频常见问题',
    faq: [
      { q: '需要 After Effects 或动效套件吗？', a: '不需要。Open Design 在你的编码 agent 里用 HTML 组合动画帧并渲染成视频。没有时间轴编辑器要学或要授权。' },
      { q: '这适合做什么视频？', a: '短视频动效——标题卡、数据动画、logo 片尾、社交短片。它为品牌和产品动效而生，不是做长片剪辑。' },
      { q: '时序可复现吗？', a: '可以。因为帧是用代码组合、确定性渲染的，每次结果一致，还能用一句 prompt 精确调整。' },
      { q: '可以用哪些 agent？', a: 'Claude Code、Codex、Cursor Agent、Gemini CLI 等一方适配，自带 provider 密钥。' },
    ],
    ctaTitle: '今晚就把下一个想法做成动效',
    ctaBody: '给 repo 点个 star、装上 Open Design，把一份脚本变成动效——在你本来就用的 agent 里。',
  },
  designSystem: {
    title: '用 Open Design + Claude Code 搭建并套用设计系统',
    description:
      '把你的品牌沉淀成一套可复用的设计系统，让编码 agent 套用到每一个产物——颜色、字体、组件、语气，全在一份 DESIGN.md 里。定义一次，每个原型、deck、看板都贴合品牌。',
    breadcrumb: '设计系统',
    label: '使用场景 · 设计系统',
    heading: '一套设计系统，套用到 agent 做的每一样东西',
    lead: '把你的品牌定义一次，Open Design 就把它带进每个产出——原型、deck、看板、图片。系统作为一份 DESIGN.md 留在你的 repo 里供 agent 读取，一致性是自动的，不靠手动维护。',
    heroImageAlt: '编辑风插画：一套设计系统向外辐射成众多贴合品牌的产物',
    tldrTitle: '一句话',
    tldrBody:
      'Open Design 把你的品牌沉淀成一套可移植的设计系统，agent 套用到每个产物——在 repo 里定义一次、处处强制执行，没有中心化设计工具把关。',
    stepsTitle: '用 Open Design 做设计系统的流程',
    steps: [
      { title: '沉淀系统', body: '描述你的品牌——颜色、字体、间距、语气——或让 agent 指向一个现有站点去提取。Open Design 把它写进一份留在你项目里的 DESIGN.md。', imageAlt: '插画：一个品牌被沉淀进一份设计系统文件' },
      { title: '从成熟基底起步', body: 'Open Design 自带 140+ 套参考设计系统——从 Apple、Linear 到编辑风、粗野主义。fork 一个接近你品牌的，而不是从白纸开始。', imageAlt: '插画：浏览一排参考设计系统' },
      { title: '处处套用', body: '其他每个 skill 都读同一套系统，所以原型、deck、看板共享一套视觉语言——你不用每次重新指定。', imageAlt: '插画：一套系统一致地套用到多种产物类型' },
      { title: '在一处演进', body: '改一处系统，下一次渲染处处生效。因为它是 repo 里的一个文件，设计决策像代码一样被 review 和版本化。', imageAlt: '插画：一套设计系统被更新并传播到所有产出' },
    ],
    tableTitle: '用 Open Design 做设计系统 vs. 老办法',
    tableColCapability: '你需要什么',
    tableColWithOd: '用 Open Design',
    tableColWithout: '设计工具组件库 / 风格指南',
    tableRows: [
      { capability: '定义系统', withOd: '一份 agent 读取的 DESIGN.md，从 140+ 参考 fork', without: '一份静态风格指南或锁在工具里的组件库' },
      { capability: '跨产物类型套用', withOd: '同一套系统喂给原型、deck、看板、图片', without: '每个工具、每个文件重做一遍' },
      { capability: '保持一致', withOd: '自动——每个 skill 读同一个源', without: '靠人工自律，时间一长就跑偏' },
      { capability: '演进品牌', withOd: '改一次，下次渲染处处更新', without: '跨文件跨工具查找替换' },
      { capability: 'review 与版本化', withOd: '在 repo 里，像代码一样可 diff', without: '埋在设计工具里，难以审计' },
      { capability: '成本与锁定', withOd: '开源、可移植、本地运行', without: '锁在设计工具订阅里' },
    ],
    galleryTitle: 'Open Design 里的设计系统',
    galleryLead: '下面是 140+ 套参考系统里的几个，可作为起点 fork。挑一个接近你品牌的去改。',
    gallery: [
      { thumb: 'design-system-apple', caption: 'Apple 风格系统' },
      { thumb: 'design-system-linear-app', caption: 'Linear 风格系统' },
      { thumb: 'design-system-airbnb', caption: 'Airbnb 风格系统' },
      { thumb: 'design-system-vercel', caption: 'Vercel 风格系统' },
    ],
    exampleHref: '/plugins/systems/',
    exampleLinkLabel: '浏览设计系统',
    faqTitle: '设计系统常见问题',
    faq: [
      { q: '这里的设计系统具体是什么？', a: 'repo 里一份 DESIGN.md，沉淀颜色、字体、间距、组件和语气。每个 Open Design skill 都读它，所以 agent 产出的任何东西都自动套用你的品牌。' },
      { q: '必须从零开始吗？', a: '不必。Open Design 自带 140+ 套参考设计系统可 fork——从 Apple、Linear 到编辑风、粗野主义——再适配你的品牌。' },
      { q: '怎么在 deck、看板、原型之间保持一致？', a: '因为这些 skill 都读同一份 DESIGN.md。定义一次，一致性就是自动的，而不是靠手动盯着。' },
      { q: '可以用哪些 agent？', a: 'Claude Code、Codex、Cursor Agent、Gemini CLI 等一方适配，自带 provider 密钥。' },
    ],
    ctaTitle: '今晚就定义你的设计系统',
    ctaBody: '给 repo 点个 star、装上 Open Design，给你的 agent 一套处处套用的品牌——在你本来就用的 agent 里。',
  },
};

const BY_LOCALE: Partial<Record<LandingLocaleCode, SolutionLocaleCopy>> = {
  en: EN,
  zh: ZH,
};

/**
 * Resolve a Solution page's copy for a locale, falling back to English for
 * any locale not yet translated. Returns `undefined` only if the page key
 * itself does not exist in English (a programming error).
 */
export function getSolutionPageCopy(
  locale: LandingLocaleCode,
  key: SolutionPageKey,
): SolutionPageCopy {
  const localized = BY_LOCALE[locale]?.[key];
  if (localized) return localized;
  return BY_LOCALE[DEFAULT_LOCALE]![key]!;
}
