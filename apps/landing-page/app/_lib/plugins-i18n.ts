/*
 * Plugins-specific i18n strings, kept separate from `_lib/i18n.ts` so
 * the plugin library's chrome (hub, list pages, chip rails, share
 * dialog) doesn't bloat the canonical Copy table every page already
 * loads. The catch-all (`pages/[locale]/[...path].astro`) and the
 * locale-prefixed detail page (`pages/[locale]/plugins/[slug]/`)
 * import from here.
 *
 * Locale strategy:
 *   - English fills every key; every other locale is `Partial<...>`
 *     and falls back to English on miss. Translations were drafted to
 *     match the voice of the existing `_lib/i18n.ts` overrides for
 *     each locale. Long blurbs that don't have an obvious idiomatic
 *     translation stay in English — the catalog still reads cleanly,
 *     and a follow-up can polish them without rebuilding the schema.
 *   - 7 artifact-kind labels and 25 scene-subcategory labels are
 *     translated to keep the chip rails legible at a glance.
 *   - Share-dialog copy ports the 18-locale table from PR #2679 so
 *     the brand keyword "open-source Claude Design alternative" stays
 *     in English on every share (deliberate — see PR #2679).
 */
/*
 * Locale key uses `LandingLocaleCode` (short codes — `en`, `zh`,
 * `zh-tw`, `pt-br`, …) to match the rest of `app/pages/plugins/...`,
 * which derives the active locale from `localeFromPath()`. The
 * Cloudflare `_redirects` file maps the long-code variants
 * (`/zh-CN/...` → `/zh/...`) so visitors can still land here from
 * either URL shape.
 */
import type { LandingLocaleCode } from '../i18n';
const DEFAULT_LOCALE: LandingLocaleCode = 'en';

export interface PluginCategoryCopy {
  label: string;
  description: string;
}

export interface PluginsCopy {
  hubLabel: string;
  hubHeading: (n: number) => string;
  hubLead: string;

  tileTemplates: string;
  tileSkills: string;
  tileSystems: string;
  tileCraft: string;
  tileTemplatesBlurb: string;
  tileSkillsBlurb: string;
  tileSystemsBlurb: string;
  tileCraftBlurb: string;

  browseTemplates: string;
  browseSkills: string;
  browseSystems: string;
  browseCraft: string;

  templatesLabel: string;
  templatesHeading: (n: number) => string;
  templatesLead: string;

  skillsLabel: string;
  skillsHeading: (n: number) => string;
  skillsLead: string;

  systemsLabel: string;
  systemsHeading: (n: number) => string;
  systemsLead: string;

  craftLabel: string;
  craftHeading: (n: number) => string;
  craftLead: string;

  artifactKindLabel: string;
  sceneLabel: string;
  allChip: string;

  category: Record<
    'prototype' | 'live-artifact' | 'deck' | 'image' | 'video' | 'hyperframes' | 'audio',
    PluginCategoryCopy
  >;

  subcategory: Record<string, string>;

  // Detail page chrome
  detailUseCta: string;        // "Use this plugin →"
  detailFindOnGithub: string;  // "Find on GitHub →"
  detailHomepage: string;      // "Homepage ↗"
  detailMode: string;
  detailScenario: string;
  detailPlatform: string;
  detailSurface: string;
  detailAuthor: string;
  detailManifestId: string;
  detailTags: string;
  detailPreviewCaption: string;
  detailClickForLivePreview: string;  // "Click for live preview ↗"
  detailOpenInNewTab: string;          // "Open in new tab ↗"
  detailBucketLabel: Record<
    'examples' | 'image-templates' | 'video-templates' | 'scenarios' | 'design-systems' | 'atoms',
    string
  >;

  // Share dialog
  shareOpen: string;
  shareTitle: string;
  shareLead: string;
  shareCopyText: string;
  shareCopyLink: string;
  shareJumpTo: string;
  shareTemplate: (vars: { title: string; url: string }) => string;
}

const en: PluginsCopy = {
  hubLabel: 'Plugin library',
  hubHeading: (n) => `${n} composable pieces.`,
  hubLead:
    'Open Design is built around four kinds of plugin. Templates and Skills are what your agent runs; Systems and Craft are how it stays on-brand and accessible. Pick a section to drill in, or jump straight to a slug if you already know which one you want.',

  tileTemplates: 'Templates',
  tileSkills: 'Skills',
  tileSystems: 'Systems',
  tileCraft: 'Craft',
  tileTemplatesBlurb:
    'Visual, runnable templates — prototypes, slides, image and video generators, motion compositions. Every entry ships an example.html so you can fork, swap data, and ship.',
  tileSkillsBlurb:
    'Instruction skills the agent loads mid-task — copywriting, color theory, creative direction, brainstorming. Pure SKILL.md prose; the output depends on your input.',
  tileSystemsBlurb:
    'Brand-anchored design systems — palette, typography, motion, voice. Snap a project to a system and every plugin output inherits the same identity.',
  tileCraftBlurb:
    'Brand-agnostic craft rules — accessibility, RTL, motion easing, photography ethics. Skills opt in via `od.craft.requires` so a plugin inherits the right rigour automatically.',

  browseTemplates: 'Browse templates',
  browseSkills: 'Browse skills',
  browseSystems: 'Browse systems',
  browseCraft: 'Browse craft',

  templatesLabel: 'Plugins · Templates',
  templatesHeading: (n) => `${n} runnable templates.`,
  templatesLead:
    'Every template ships a working preview — the catalog row’s thumbnail comes straight from the manifest poster the agent uses inside the product. Browse all of them below, or jump to one of the seven artifact kinds.',

  skillsLabel: 'Plugins · Skills',
  skillsHeading: (n) => `${n} instruction skills.`,
  skillsLead:
    'Skills the agent loads mid-task — copywriting, color theory, creative direction, brainstorming. There’s no static demo because the outcome depends on your input, so each detail page reads like a brief: title, description, triggers, attribution.',

  systemsLabel: 'Plugins · Systems',
  systemsHeading: (n) => `${n} design systems.`,
  systemsLead:
    'Brand-anchored design systems plugins can adopt via `od.craft.requires`. Each ships its own palette, typography, motion, and voice; snap a project to a system and every plugin output inherits the same identity.',

  craftLabel: 'Plugins · Craft',
  craftHeading: (n) => `${n} craft principles.`,
  craftLead:
    'Brand-agnostic craft rules — accessibility, RTL, motion easing, photography ethics. Skills opt in via `od.craft.requires` so a plugin inherits the right rigour automatically.',

  artifactKindLabel: 'Artifact kind',
  sceneLabel: 'Scene',
  allChip: 'All',

  category: {
    prototype: {
      label: 'Prototype',
      description:
        'Interactive product mockups — dashboards, apps, landing pages, internal tools. Anything you’d hand a stakeholder and click through.',
    },
    'live-artifact': {
      label: 'Live Artifact',
      description:
        'Refreshable, data-aware artifacts that re-render whenever the underlying data changes. Live dashboards, monitoring boards, recurring trackers.',
    },
    deck: {
      label: 'Slides',
      description:
        'Polished slide decks from a narrative brief — pitch decks, course modules, weekly reports, product launches.',
    },
    image: {
      label: 'Image',
      description:
        'Image assets generated from structured creative direction — UI mockups, brand visuals, storyboards, social posts, illustrations.',
    },
    video: {
      label: 'Video',
      description:
        'Video prompts, storyboards, and render-ready motion artifacts — short-form social, marketing cuts, motion graphics, cinematic stories.',
    },
    hyperframes: {
      label: 'HyperFrames',
      description:
        'HyperFrames-ready motion compositions — agent-built video that blends template HTML with frame-level keyframes.',
    },
    audio: {
      label: 'Audio',
      description:
        'Audio, voice, and sound-design assets generated from a brief — podcast intros, jingles, ambient beds.',
    },
  },

  subcategory: {
    'business-dashboards': 'Dashboards',
    'app-prototypes': 'Apps',
    'landing-marketing': 'Landing & marketing',
    'developer-tools': 'Developer tools',
    'docs-reports': 'Docs & reports',
    'brand-design': 'Brand & design',
    'pitch-business': 'Pitch & business',
    'course-training': 'Course & training',
    'reports-briefings': 'Reports & briefings',
    'product-sales': 'Product & sales',
    'engineering-talks': 'Engineering talks',
    'creative-decks': 'Creative decks',
    'ui-product-mockups': 'UI & product mockups',
    'brand-visuals': 'Brand & logo',
    'storyboards-motion-refs': 'Storyboards',
    'social-content': 'Social & content',
    'avatar-portrait': 'Avatar & portrait',
    'illustration-style': 'Illustration & style',
    'motion-effects': 'Motion & effects',
    'social-short-form': 'Social short form',
    'marketing-product': 'Marketing & product',
    'data-explainers': 'Data & explainers',
    'cinematic-story': 'Cinematic story',
  },

  detailUseCta: 'Use this plugin →',
  detailFindOnGithub: 'Find on GitHub →',
  detailHomepage: 'Homepage ↗',
  detailMode: 'Mode',
  detailScenario: 'Scenario',
  detailPlatform: 'Platform',
  detailSurface: 'Surface',
  detailAuthor: 'Author',
  detailManifestId: 'Manifest id',
  detailTags: 'Tags',
  detailPreviewCaption: 'Preview from the bundled-plugin manifest.',
  detailClickForLivePreview: 'Click for live preview ↗',
  detailOpenInNewTab: 'Open in new tab ↗',
  detailBucketLabel: {
    examples: 'Example',
    'image-templates': 'Image template',
    'video-templates': 'Video template',
    scenarios: 'Scenario',
    'design-systems': 'Design system',
    atoms: 'Atom',
  },

  shareOpen: 'Share ↗',
  shareTitle: 'Share this plugin',
  shareLead:
    'Copy the message below, then jump to the platform you want to share on and paste.',
  shareCopyText: 'Copy text',
  shareCopyLink: 'Copy link only',
  shareJumpTo: 'Then jump to:',
  shareTemplate: ({ title, url }) =>
    `🎨 Just discovered ${title} on @opendesignai — the open-source Claude Design alternative.
✨ Local-first · BYOK · your agent does the design.

→ ${url}`,
};

const overrides: Partial<Record<LandingLocaleCode, Partial<PluginsCopy>>> = {
  zh: {
    hubLabel: '插件库',
    hubHeading: (n) => `${n} 个可组合的构件。`,
    hubLead:
      'Open Design 围绕四类插件构建：Templates 与 Skills 是 agent 真正运行的内容，Systems 与 Craft 让它保持品牌一致和可访问。点进任意一类深入查看，或直接跳到你已经知道 slug 的那一项。',
    tileTemplates: '模板',
    tileSkills: '技能',
    tileSystems: '设计系统',
    tileCraft: '工艺',
    tileTemplatesBlurb:
      '可视化、可运行的模板——原型、幻灯片、图像与视频生成器、动效合成。每一条都附带 example.html，可以 fork、替换数据后直接交付。',
    tileSkillsBlurb:
      'agent 在任务中加载的指令型技能——文案、配色、创意指导、头脑风暴。纯 SKILL.md 文档，输出取决于你的输入。',
    tileSystemsBlurb:
      '锚定品牌的设计系统——色板、字体、动效、文风。把项目绑到某个系统，所有插件输出都会继承同一身份。',
    tileCraftBlurb:
      '与品牌无关的工艺规则——可访问性、RTL、动效缓动、摄影伦理。Skills 通过 `od.craft.requires` 选用，插件自动继承相应严谨度。',
    browseTemplates: '浏览模板',
    browseSkills: '浏览技能',
    browseSystems: '浏览系统',
    browseCraft: '浏览工艺',
    templatesLabel: '插件 · 模板',
    templatesHeading: (n) => `${n} 个可运行的模板。`,
    templatesLead:
      '每个模板都附带可用的预览——目录中的缩略图直接来自 agent 在产品里使用的 manifest 海报。浏览全部，或按七大产物类型筛选。',
    skillsLabel: '插件 · 技能',
    skillsHeading: (n) => `${n} 个指令型技能。`,
    skillsLead:
      'agent 在任务中加载的技能——文案、配色、创意指导、头脑风暴。没有静态 demo，输出取决于你的输入，所以每个详情页像一份简报：标题、描述、触发词、出处。',
    systemsLabel: '插件 · 设计系统',
    systemsHeading: (n) => `${n} 个设计系统。`,
    systemsLead:
      '插件可通过 `od.craft.requires` 采用的品牌设计系统。每个系统自带色板、字体、动效与文风；把项目绑到某个系统，所有插件输出都会继承同一身份。',
    craftLabel: '插件 · 工艺',
    craftHeading: (n) => `${n} 条工艺规则。`,
    craftLead:
      '与品牌无关的工艺规则——可访问性、RTL、动效缓动、摄影伦理。Skills 通过 `od.craft.requires` 选用，插件自动继承相应严谨度。',
    artifactKindLabel: '产物类型',
    sceneLabel: '场景',
    allChip: '全部',
    category: {
      prototype: { label: '原型', description: '交互式产品稿——仪表盘、应用、落地页、内部工具。任何能交给 stakeholder 点击的东西。' },
      'live-artifact': { label: '实时产物', description: '可刷新、感知数据的产物，底层数据变化时自动重新渲染。实时仪表盘、监控板、周期跟踪。' },
      deck: { label: '幻灯片', description: '从叙事简报生成的精致 deck——融资 deck、课程模块、周报、产品发布。' },
      image: { label: '图像', description: '从结构化创意指令生成的图像——UI 稿、品牌视觉、分镜、社媒、插画。' },
      video: { label: '视频', description: '视频提示词、分镜与可渲染的动态产物——短视频、营销片段、动效图形、电影感故事。' },
      hyperframes: { label: 'HyperFrames', description: 'HyperFrames 就绪的动效合成——agent 构建的视频，融合模板 HTML 与帧级关键帧。' },
      audio: { label: '音频', description: '从简报生成的音频、人声与声音设计——播客片头、音乐衬底、环境音。' },
    },
    subcategory: {
      'business-dashboards': '仪表盘', 'app-prototypes': '应用', 'landing-marketing': '落地页 / 营销',
      'developer-tools': '开发者工具', 'docs-reports': '文档 / 报告', 'brand-design': '品牌 / 设计',
      'pitch-business': '路演 / 商业', 'course-training': '课程 / 培训', 'reports-briefings': '报告 / 简报',
      'product-sales': '产品 / 销售', 'engineering-talks': '工程演讲', 'creative-decks': '创意 deck',
      'ui-product-mockups': 'UI / 产品稿', 'brand-visuals': '品牌 / Logo', 'storyboards-motion-refs': '分镜',
      'social-content': '社媒 / 内容', 'avatar-portrait': '头像 / 肖像', 'illustration-style': '插画 / 风格',
      'motion-effects': '动效', 'social-short-form': '短视频', 'marketing-product': '营销 / 产品',
      'data-explainers': '数据讲解', 'cinematic-story': '电影感叙事',
    },
    detailUseCta: '使用此插件 →', detailFindOnGithub: '在 GitHub 上查看 →', detailHomepage: '主页 ↗',
    detailMode: '模式', detailScenario: '场景', detailPlatform: '平台', detailSurface: '形态',
    detailAuthor: '作者', detailManifestId: 'Manifest ID', detailTags: '标签',
    detailPreviewCaption: '来自 bundled-plugin manifest 的预览。',
    detailClickForLivePreview: '点击预览实时效果 ↗', detailOpenInNewTab: '在新标签打开 ↗',
    detailBucketLabel: { examples: '示例', 'image-templates': '图像模板', 'video-templates': '视频模板', scenarios: '场景', 'design-systems': '设计系统', atoms: 'Atom' },
    shareOpen: '分享 ↗', shareTitle: '分享这个插件',
    shareLead: '复制下面的文案，然后跳到你想分享的平台粘贴即可。',
    shareCopyText: '复制文案', shareCopyLink: '只复制链接', shareJumpTo: '跳转到：',
    shareTemplate: ({ title, url }) => `🎨 安利一个：@opendesignai 上的 ${title} —— Claude Design 的开源替代品。\n✨ 本地优先 · 自带模型 · 让你自己的 agent 做设计。\n\n→ ${url}`,
  },
  'zh-tw': {
    hubLabel: '外掛庫', hubHeading: (n) => `${n} 個可組合的元件。`,
    hubLead: 'Open Design 圍繞四類外掛構建：Templates 與 Skills 是 agent 真正執行的內容，Systems 與 Craft 讓它保持品牌一致與可存取性。',
    tileTemplates: '範本', tileSkills: '技能', tileSystems: '設計系統', tileCraft: '工藝',
    browseTemplates: '瀏覽範本', browseSkills: '瀏覽技能', browseSystems: '瀏覽系統', browseCraft: '瀏覽工藝',
    artifactKindLabel: '產物類型', sceneLabel: '場景', allChip: '全部',
    detailUseCta: '使用此外掛 →', detailFindOnGithub: '在 GitHub 上查看 →',
    detailClickForLivePreview: '點擊預覽即時效果 ↗', detailOpenInNewTab: '在新分頁開啟 ↗',
    shareOpen: '分享 ↗', shareTitle: '分享這個外掛',
    shareLead: '複製下面的文案，然後跳到你想分享的平台貼上即可。',
    shareCopyText: '複製文案', shareCopyLink: '只複製連結', shareJumpTo: '跳轉到：',
    shareTemplate: ({ title, url }) => `🎨 推薦一個：@opendesignai 上的 ${title} —— Claude Design 的開源替代品。\n✨ 本地優先 · 自帶模型 · 讓你自己的 agent 做設計。\n\n→ ${url}`,
  },
  ja: {
    hubLabel: 'プラグインライブラリ', hubHeading: (n) => `${n} 個の組み合わせ可能なパーツ。`,
    tileTemplates: 'テンプレート', tileSkills: 'スキル', tileSystems: 'システム', tileCraft: 'クラフト',
    browseTemplates: 'テンプレートを見る', browseSkills: 'スキルを見る', browseSystems: 'システムを見る', browseCraft: 'クラフトを見る',
    artifactKindLabel: '成果物の種類', sceneLabel: 'シーン', allChip: 'すべて',
    detailUseCta: 'このプラグインを使う →', detailFindOnGithub: 'GitHub で見る →',
    detailClickForLivePreview: 'クリックでライブプレビュー ↗', detailOpenInNewTab: '新しいタブで開く ↗',
    shareOpen: '共有 ↗', shareTitle: 'このプラグインを共有',
    shareLead: '下のメッセージをコピーしてから、共有したいプラットフォームに移動して貼り付けてください。',
    shareCopyText: 'テキストをコピー', shareCopyLink: 'リンクのみコピー', shareJumpTo: 'プラットフォームへ：',
    shareTemplate: ({ title, url }) => `🎨 @opendesignai で ${title} を発見 —— オープンソースの Claude Design 代替。\n✨ ローカル優先 · BYOK · あなたのエージェントが設計する。\n\n→ ${url}`,
  },
  ko: {
    hubLabel: '플러그인 라이브러리', hubHeading: (n) => `${n}개의 조합 가능한 구성요소.`,
    tileTemplates: '템플릿', tileSkills: '스킬', tileSystems: '시스템', tileCraft: '크래프트',
    browseTemplates: '템플릿 보기', browseSkills: '스킬 보기', browseSystems: '시스템 보기', browseCraft: '크래프트 보기',
    artifactKindLabel: '산출물 종류', sceneLabel: '장면', allChip: '전체',
    detailUseCta: '이 플러그인 사용 →', detailFindOnGithub: 'GitHub에서 보기 →',
    detailClickForLivePreview: '클릭하여 라이브 프리뷰 ↗', detailOpenInNewTab: '새 탭에서 열기 ↗',
    shareOpen: '공유 ↗', shareTitle: '이 플러그인 공유',
    shareLead: '아래 메시지를 복사한 다음 공유할 플랫폼으로 이동해 붙여넣으세요.',
    shareCopyText: '텍스트 복사', shareCopyLink: '링크만 복사', shareJumpTo: '플랫폼으로:',
    shareTemplate: ({ title, url }) => `🎨 @opendesignai에서 ${title} 발견 —— 오픈 소스 Claude Design 대안.\n✨ 로컬 우선 · BYOK · 에이전트가 디자인합니다.\n\n→ ${url}`,
  },
  de: {
    hubLabel: 'Plugin-Bibliothek', hubHeading: (n) => `${n} kombinierbare Bausteine.`,
    tileTemplates: 'Vorlagen', tileSkills: 'Skills', tileSystems: 'Systeme', tileCraft: 'Handwerk',
    browseTemplates: 'Vorlagen ansehen', browseSkills: 'Skills ansehen', browseSystems: 'Systeme ansehen', browseCraft: 'Handwerk ansehen',
    artifactKindLabel: 'Artefakt-Art', sceneLabel: 'Szene', allChip: 'Alle',
    detailUseCta: 'Plugin nutzen →', detailFindOnGithub: 'Auf GitHub ansehen →',
    detailClickForLivePreview: 'Klicken für Live-Vorschau ↗', detailOpenInNewTab: 'In neuem Tab öffnen ↗',
    shareOpen: 'Teilen ↗', shareTitle: 'Diesen Plugin teilen',
    shareLead: 'Kopiere die Nachricht unten und füge sie auf der gewünschten Plattform ein.',
    shareCopyText: 'Text kopieren', shareCopyLink: 'Nur Link kopieren', shareJumpTo: 'Zur Plattform:',
    shareTemplate: ({ title, url }) => `🎨 Gerade entdeckt: ${title} auf @opendesignai — die Open-Source-Alternative zu Claude Design.\n✨ Local-first · BYOK · dein Agent designt.\n\n→ ${url}`,
  },
  fr: {
    hubLabel: 'Bibliothèque de plugins', hubHeading: (n) => `${n} éléments composables.`,
    tileTemplates: 'Modèles', tileSkills: 'Skills', tileSystems: 'Systèmes', tileCraft: 'Artisanat',
    browseTemplates: 'Parcourir les modèles', browseSkills: 'Parcourir les skills', browseSystems: 'Parcourir les systèmes', browseCraft: 'Parcourir l’artisanat',
    artifactKindLabel: 'Type d’artefact', sceneLabel: 'Scène', allChip: 'Tous',
    detailUseCta: 'Utiliser ce plugin →', detailFindOnGithub: 'Voir sur GitHub →',
    detailClickForLivePreview: 'Cliquer pour aperçu en direct ↗', detailOpenInNewTab: 'Ouvrir dans un nouvel onglet ↗',
    shareOpen: 'Partager ↗', shareTitle: 'Partager ce plugin',
    shareLead: 'Copiez le message ci-dessous, puis ouvrez la plateforme de votre choix et collez.',
    shareCopyText: 'Copier le texte', shareCopyLink: 'Copier le lien', shareJumpTo: 'Aller sur :',
    shareTemplate: ({ title, url }) => `🎨 Découvert : ${title} sur @opendesignai — l’alternative open-source à Claude Design.\n✨ Local-first · BYOK · votre agent fait le design.\n\n→ ${url}`,
  },
  ru: {
    hubLabel: 'Библиотека плагинов', hubHeading: (n) => `${n} компонуемых элементов.`,
    tileTemplates: 'Шаблоны', tileSkills: 'Скиллы', tileSystems: 'Системы', tileCraft: 'Ремесло',
    browseTemplates: 'Все шаблоны', browseSkills: 'Все скиллы', browseSystems: 'Все системы', browseCraft: 'Все правила ремесла',
    artifactKindLabel: 'Тип артефакта', sceneLabel: 'Сцена', allChip: 'Все',
    detailUseCta: 'Использовать плагин →', detailFindOnGithub: 'Посмотреть на GitHub →',
    detailClickForLivePreview: 'Кликните для живого превью ↗', detailOpenInNewTab: 'Открыть в новой вкладке ↗',
    shareOpen: 'Поделиться ↗', shareTitle: 'Поделиться плагином',
    shareLead: 'Скопируйте сообщение ниже, затем перейдите на нужную платформу и вставьте.',
    shareCopyText: 'Скопировать текст', shareCopyLink: 'Только ссылка', shareJumpTo: 'Перейти:',
    shareTemplate: ({ title, url }) => `🎨 Нашёл ${title} на @opendesignai — open-source альтернативу Claude Design.\n✨ Локально · BYOK · агент сам делает дизайн.\n\n→ ${url}`,
  },
  es: {
    hubLabel: 'Biblioteca de plugins', hubHeading: (n) => `${n} piezas componibles.`,
    tileTemplates: 'Plantillas', tileSkills: 'Skills', tileSystems: 'Sistemas', tileCraft: 'Oficio',
    browseTemplates: 'Ver plantillas', browseSkills: 'Ver skills', browseSystems: 'Ver sistemas', browseCraft: 'Ver oficio',
    artifactKindLabel: 'Tipo de artefacto', sceneLabel: 'Escena', allChip: 'Todos',
    detailUseCta: 'Usar este plugin →', detailFindOnGithub: 'Ver en GitHub →',
    detailClickForLivePreview: 'Clic para vista previa ↗', detailOpenInNewTab: 'Abrir en nueva pestaña ↗',
    shareOpen: 'Compartir ↗', shareTitle: 'Compartir este plugin',
    shareLead: 'Copia el mensaje y abre la plataforma donde quieras compartirlo.',
    shareCopyText: 'Copiar texto', shareCopyLink: 'Solo el enlace', shareJumpTo: 'Ir a:',
    shareTemplate: ({ title, url }) => `🎨 Acabo de descubrir ${title} en @opendesignai — la alternativa open-source a Claude Design.\n✨ Local-first · BYOK · tu agente diseña.\n\n→ ${url}`,
  },
  'pt-br': {
    hubLabel: 'Biblioteca de plugins', hubHeading: (n) => `${n} peças combináveis.`,
    tileTemplates: 'Templates', tileSkills: 'Skills', tileSystems: 'Sistemas', tileCraft: 'Ofício',
    browseTemplates: 'Ver templates', browseSkills: 'Ver skills', browseSystems: 'Ver sistemas', browseCraft: 'Ver ofício',
    artifactKindLabel: 'Tipo de artefato', sceneLabel: 'Cena', allChip: 'Todos',
    detailUseCta: 'Usar este plugin →', detailFindOnGithub: 'Ver no GitHub →',
    detailClickForLivePreview: 'Clique para preview ao vivo ↗', detailOpenInNewTab: 'Abrir em nova aba ↗',
    shareOpen: 'Compartilhar ↗', shareTitle: 'Compartilhar este plugin',
    shareLead: 'Copie a mensagem e abra a plataforma onde quer compartilhar.',
    shareCopyText: 'Copiar texto', shareCopyLink: 'Só o link', shareJumpTo: 'Ir para:',
    shareTemplate: ({ title, url }) => `🎨 Acabei de descobrir ${title} no @opendesignai — a alternativa open-source ao Claude Design.\n✨ Local-first · BYOK · seu agente faz o design.\n\n→ ${url}`,
  },
  it: {
    hubLabel: 'Libreria plugin', hubHeading: (n) => `${n} pezzi componibili.`,
    tileTemplates: 'Modelli', tileSkills: 'Skill', tileSystems: 'Sistemi', tileCraft: 'Artigianato',
    browseTemplates: 'Esplora modelli', browseSkills: 'Esplora skill', browseSystems: 'Esplora sistemi', browseCraft: 'Esplora artigianato',
    artifactKindLabel: 'Tipo di artefatto', sceneLabel: 'Scena', allChip: 'Tutti',
    detailUseCta: 'Usa questo plugin →', detailFindOnGithub: 'Vedi su GitHub →',
    detailClickForLivePreview: 'Clicca per anteprima live ↗', detailOpenInNewTab: 'Apri in nuova scheda ↗',
    shareOpen: 'Condividi ↗', shareTitle: 'Condividi questo plugin',
    shareLead: 'Copia il messaggio e apri la piattaforma su cui vuoi condividere.',
    shareCopyText: 'Copia testo', shareCopyLink: 'Solo il link', shareJumpTo: 'Vai a:',
    shareTemplate: ({ title, url }) => `🎨 Ho appena scoperto ${title} su @opendesignai — l’alternativa open-source a Claude Design.\n✨ Local-first · BYOK · il tuo agente progetta.\n\n→ ${url}`,
  },
  id: {
    hubLabel: 'Pustaka plugin', hubHeading: (n) => `${n} potongan yang bisa digabungkan.`,
    tileTemplates: 'Template', tileSkills: 'Skill', tileSystems: 'Sistem', tileCraft: 'Kerajinan',
    browseTemplates: 'Jelajahi template', browseSkills: 'Jelajahi skill', browseSystems: 'Jelajahi sistem', browseCraft: 'Jelajahi kerajinan',
    artifactKindLabel: 'Jenis artefak', sceneLabel: 'Adegan', allChip: 'Semua',
    detailUseCta: 'Gunakan plugin ini →', detailFindOnGithub: 'Lihat di GitHub →',
    detailClickForLivePreview: 'Klik untuk live preview ↗', detailOpenInNewTab: 'Buka di tab baru ↗',
    shareOpen: 'Bagikan ↗', shareTitle: 'Bagikan plugin ini',
    shareLead: 'Salin pesan di bawah, lalu buka platform yang ingin Anda gunakan dan tempel.',
    shareCopyText: 'Salin teks', shareCopyLink: 'Salin tautan', shareJumpTo: 'Buka:',
    shareTemplate: ({ title, url }) => `🎨 Baru nemu ${title} di @opendesignai — alternatif open-source untuk Claude Design.\n✨ Local-first · BYOK · agent kamu yang nge-desain.\n\n→ ${url}`,
  },
  pl: {
    hubLabel: 'Biblioteka pluginów', hubHeading: (n) => `${n} komponowalnych elementów.`,
    tileTemplates: 'Szablony', tileSkills: 'Umiejętności', tileSystems: 'Systemy', tileCraft: 'Rzemiosło',
    browseTemplates: 'Przeglądaj szablony', browseSkills: 'Przeglądaj skille', browseSystems: 'Przeglądaj systemy', browseCraft: 'Przeglądaj rzemiosło',
    artifactKindLabel: 'Typ artefaktu', sceneLabel: 'Scena', allChip: 'Wszystkie',
    detailUseCta: 'Użyj tego pluginu →', detailFindOnGithub: 'Zobacz na GitHubie →',
    detailClickForLivePreview: 'Kliknij, aby zobaczyć podgląd ↗', detailOpenInNewTab: 'Otwórz w nowej karcie ↗',
    shareOpen: 'Udostępnij ↗', shareTitle: 'Udostępnij ten plugin',
    shareLead: 'Skopiuj wiadomość poniżej, otwórz wybraną platformę i wklej.',
    shareCopyText: 'Kopiuj tekst', shareCopyLink: 'Skopiuj link', shareJumpTo: 'Przejdź do:',
    shareTemplate: ({ title, url }) => `🎨 Właśnie odkryłem ${title} na @opendesignai — open-source’ową alternatywę dla Claude Design.\n✨ Local-first · BYOK · twój agent projektuje.\n\n→ ${url}`,
  },
  ar: {
    hubLabel: 'مكتبة الإضافات', hubHeading: (n) => `${n} قطعة قابلة للتركيب.`,
    tileTemplates: 'قوالب', tileSkills: 'مهارات', tileSystems: 'أنظمة', tileCraft: 'حِرَفية',
    browseTemplates: 'تصفح القوالب', browseSkills: 'تصفح المهارات', browseSystems: 'تصفح الأنظمة', browseCraft: 'تصفح الحِرَفية',
    artifactKindLabel: 'نوع المنتج', sceneLabel: 'مشهد', allChip: 'الكل',
    detailUseCta: 'استخدم هذه الإضافة ←', detailFindOnGithub: 'اعرضها على GitHub ←',
    detailClickForLivePreview: 'انقر للمعاينة الحية ↗', detailOpenInNewTab: 'افتح في علامة تبويب جديدة ↗',
    shareOpen: 'مشاركة ↗', shareTitle: 'شارك هذه الإضافة',
    shareLead: 'انسخ الرسالة أدناه، ثم انتقل إلى المنصة التي تريد المشاركة عليها والصقها.',
    shareCopyText: 'انسخ النص', shareCopyLink: 'انسخ الرابط فقط', shareJumpTo: 'انتقل إلى:',
    shareTemplate: ({ title, url }) => `🎨 اكتشفت للتو ${title} على @opendesignai — البديل مفتوح المصدر لـ Claude Design.\n✨ محلي أولًا · BYOK · وكيلك يصمّم.\n\n→ ${url}`,
  },
  tr: {
    hubLabel: 'Eklenti kütüphanesi', hubHeading: (n) => `${n} birleştirilebilir parça.`,
    tileTemplates: 'Şablonlar', tileSkills: 'Yetenekler', tileSystems: 'Sistemler', tileCraft: 'Zanaat',
    browseTemplates: 'Şablonları gözat', browseSkills: 'Yetenekleri gözat', browseSystems: 'Sistemleri gözat', browseCraft: 'Zanaatı gözat',
    artifactKindLabel: 'Çıktı türü', sceneLabel: 'Sahne', allChip: 'Tümü',
    detailUseCta: 'Bu eklentiyi kullan →', detailFindOnGithub: 'GitHub’da görüntüle →',
    detailClickForLivePreview: 'Canlı önizleme için tıkla ↗', detailOpenInNewTab: 'Yeni sekmede aç ↗',
    shareOpen: 'Paylaş ↗', shareTitle: 'Bu eklentiyi paylaş',
    shareLead: 'Aşağıdaki mesajı kopyala, dilediğin platformu açıp yapıştır.',
    shareCopyText: 'Metni kopyala', shareCopyLink: 'Sadece linki kopyala', shareJumpTo: 'Şuraya git:',
    shareTemplate: ({ title, url }) => `🎨 Yeni keşfettim: ${title} (@opendesignai) — Claude Design’a açık kaynaklı alternatif.\n✨ Local-first · BYOK · ajanın tasarlıyor.\n\n→ ${url}`,
  },
  uk: {
    hubLabel: 'Бібліотека плагінів', hubHeading: (n) => `${n} компонованих елементів.`,
    tileTemplates: 'Шаблони', tileSkills: 'Навички', tileSystems: 'Системи', tileCraft: 'Ремесло',
    browseTemplates: 'Переглянути шаблони', browseSkills: 'Переглянути навички', browseSystems: 'Переглянути системи', browseCraft: 'Переглянути ремесло',
    artifactKindLabel: 'Тип артефакту', sceneLabel: 'Сцена', allChip: 'Усі',
    detailUseCta: 'Використати цей плагін →', detailFindOnGithub: 'Дивитись на GitHub →',
    detailClickForLivePreview: 'Клікніть для живого перегляду ↗', detailOpenInNewTab: 'Відкрити в новій вкладці ↗',
    shareOpen: 'Поділитись ↗', shareTitle: 'Поділитись цим плагіном',
    shareLead: 'Скопіюйте повідомлення нижче, потім перейдіть на платформу й вставте.',
    shareCopyText: 'Копіювати текст', shareCopyLink: 'Тільки посилання', shareJumpTo: 'Перейти:',
    shareTemplate: ({ title, url }) => `🎨 Щойно знайшов ${title} на @opendesignai — open-source альтернативу Claude Design.\n✨ Local-first · BYOK · ваш агент робить дизайн.\n\n→ ${url}`,
  },
  vi: {
    hubLabel: 'Thư viện plugin', hubHeading: (n) => `${n} thành phần có thể ghép nối.`,
    tileTemplates: 'Mẫu', tileSkills: 'Kỹ năng', tileSystems: 'Hệ thống', tileCraft: 'Thủ công',
    browseTemplates: 'Xem các mẫu', browseSkills: 'Xem kỹ năng', browseSystems: 'Xem hệ thống', browseCraft: 'Xem thủ công',
    artifactKindLabel: 'Loại sản phẩm', sceneLabel: 'Cảnh', allChip: 'Tất cả',
    detailUseCta: 'Dùng plugin này →', detailFindOnGithub: 'Xem trên GitHub →',
    detailClickForLivePreview: 'Nhấn để xem preview trực tiếp ↗', detailOpenInNewTab: 'Mở trong tab mới ↗',
    shareOpen: 'Chia sẻ ↗', shareTitle: 'Chia sẻ plugin này',
    shareLead: 'Sao chép nội dung dưới đây, rồi mở nền tảng bạn muốn chia sẻ và dán vào.',
    shareCopyText: 'Sao chép', shareCopyLink: 'Chỉ sao chép link', shareJumpTo: 'Mở:',
    shareTemplate: ({ title, url }) => `🎨 Vừa khám phá ${title} trên @opendesignai — giải pháp mã nguồn mở thay thế Claude Design.\n✨ Ưu tiên local · BYOK · agent của bạn thiết kế.\n\n→ ${url}`,
  },
  nl: {
    hubLabel: 'Plugin-bibliotheek', hubHeading: (n) => `${n} combineerbare onderdelen.`,
    tileTemplates: 'Templates', tileSkills: 'Skills', tileSystems: 'Systemen', tileCraft: 'Vakmanschap',
    browseTemplates: 'Bekijk templates', browseSkills: 'Bekijk skills', browseSystems: 'Bekijk systemen', browseCraft: 'Bekijk vakmanschap',
    artifactKindLabel: 'Type artefact', sceneLabel: 'Scène', allChip: 'Alle',
    detailUseCta: 'Gebruik deze plugin →', detailFindOnGithub: 'Bekijk op GitHub →',
    detailClickForLivePreview: 'Klik voor live preview ↗', detailOpenInNewTab: 'Open in nieuw tabblad ↗',
    shareOpen: 'Delen ↗', shareTitle: 'Deel deze plugin',
    shareLead: 'Kopieer het bericht hieronder en plak het op het platform van jouw keuze.',
    shareCopyText: 'Tekst kopiëren', shareCopyLink: 'Alleen de link', shareJumpTo: 'Ga naar:',
    shareTemplate: ({ title, url }) => `🎨 Net ontdekt: ${title} op @opendesignai — het open-source alternatief voor Claude Design.\n✨ Local-first · BYOK · jouw agent ontwerpt.\n\n→ ${url}`,
  },
};

/**
 * Resolve a complete `PluginsCopy` object for a given locale, merging
 * locale overrides on top of the English baseline. Missing keys fall
 * back to English so a partially-translated locale still renders
 * sensibly.
 */
export function getPluginsCopy(locale: LandingLocaleCode): PluginsCopy {
  if (locale === DEFAULT_LOCALE) return en;
  const partial = overrides[locale];
  if (!partial) return en;
  return {
    ...en,
    ...partial,
    category: { ...en.category, ...(partial.category ?? {}) },
    subcategory: { ...en.subcategory, ...(partial.subcategory ?? {}) },
    detailBucketLabel: { ...en.detailBucketLabel, ...(partial.detailBucketLabel ?? {}) },
  };
}
