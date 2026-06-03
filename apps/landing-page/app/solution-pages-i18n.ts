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
  // ---- worked example ----
  exampleTitle: string;
  exampleBody: string;
  exampleImageAlt: string;
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

type SolutionPageKey = 'prototype';

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
    exampleTitle: 'See it on a real template',
    exampleBody:
      'Open Design ships prototype and web-app templates you can start from. Pick one, describe your variation, and the agent adapts it — the fastest way to see the workflow end to end.',
    exampleImageAlt:
      'Illustration of a gallery of prototype templates with one expanded into a full clickable preview',
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
    exampleTitle: '在真实模板上看效果',
    exampleBody:
      'Open Design 自带原型和 Web 应用模板，可以直接起步。挑一个，描述你的改法，agent 帮你改——这是把整个流程从头到尾跑一遍的最快方式。',
    exampleImageAlt: '插画：一排原型模板，其中一个展开成完整的可点击预览',
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
