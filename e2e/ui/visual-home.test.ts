import { expect, test } from '@playwright/test';
import { ensureRailOpen } from '@/playwright/rail';
import {
  captureVisual,
  configureVisualPage,
  gotoVisualHome,
  waitForVisualFonts,
  waitForVisualProjects,
} from '@/playwright/visual';

const VISUAL_CLI_AGENTS = [
  {
    id: 'claude',
    name: 'Claude Code',
    bin: 'claude',
    available: true,
    version: '2.1.31',
    models: [
      { id: 'sonnet-alias', label: 'Sonnet (alias)' },
      { id: 'opus-alias', label: 'Opus (alias)' },
    ],
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    bin: 'codex',
    available: true,
    version: '0.134.0',
    models: [
      { id: 'default', label: 'Default (CLI config)' },
      { id: 'gpt-5.4', label: 'GPT-5.4' },
      { id: 'gpt-5.4-mini', label: 'GPT-5.4-Mini' },
    ],
  },
] as const;

const VISUAL_AMR_AGENT = {
  id: 'amr',
  name: 'Open Design AMR',
  bin: 'vela',
  available: true,
  version: '0.1.0',
  models: [
    { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
    { id: 'deepseek-v3.2', label: 'DeepSeek V3.2' },
    { id: 'glm-5.1', label: 'GLM 5.1' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  ],
} as const;

test('[P2] captures the onboarding runtime selection surface', async ({ page }) => {
  await configureVisualPage(page, {
    projects: [],
    agents: [VISUAL_AMR_AGENT, ...VISUAL_CLI_AGENTS],
    config: {
      onboardingCompleted: false,
      agentId: 'amr',
      agentModels: { amr: { model: 'deepseek-v4-flash', reasoning: 'default' } },
    },
  });

  await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /Welcome|欢迎/i })).toBeVisible();
  await expect(page.getByText(/Open Design AMR/i)).toBeVisible();
  await expect(page.getByText(/DeepSeek V4 Flash/i)).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-onboarding-runtime');
});

test('[P2] captures the visual home harness', async ({ page }) => {
  await configureVisualPage(page, { projects: [] });
  await gotoVisualHome(page);

  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
  await waitForVisualProjects(page, []);

  await captureVisual(page, 'visual-home');
});

test('[P2] captures the home plugin catalog surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  // The redesigned entry shell keeps every view mounted (only the active one
  // is visible) so tab switches don't reload thumbnails. That means
  // `plugins-home-section` exists in both the home and plugins views, so
  // scope the lookup to the home view to keep these strict-mode locators
  // unambiguous.
  const home = page.getByTestId('entry-view-home');
  await expect(page.getByTestId('recent-projects-strip')).toBeVisible();
  await expect(home.getByTestId('plugins-home-section')).toBeVisible();
  await expect(home.getByTestId('plugins-home-chip-saved')).toBeVisible();

  await captureVisual(page, 'visual-home-catalog');
});

test('[P2] captures the home plugin filtered surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  const home = page.getByTestId('entry-view-home');
  await home.getByTestId('plugins-home-pill-category-deck').click();
  await expect(home.locator('article.plugins-home__card[data-plugin-id="visual-deck-writer"]')).toBeVisible();

  await captureVisual(page, 'visual-home-plugin-filter');
});

test('[P2] captures the home plugin detail surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  const home = page.getByTestId('entry-view-home');
  await home.getByTestId('plugins-home-pill-category-deck').click();
  const card = home.locator('article.plugins-home__card[data-plugin-id="visual-deck-writer"]');
  await expect(card).toBeVisible();
  await card.hover();
  await home.getByTestId('plugins-home-details-visual-deck-writer').click({ force: true });
  await expect(page.getByRole('dialog', { name: /Deck Writer preview/i })).toBeVisible();
  await expect(page.getByTestId('plugin-details-use-visual-deck-writer')).toBeVisible();
  await expect(page.locator('.ds-modal-stage-iframe-scaler iframe')).toBeVisible();

  await captureVisual(page, 'visual-plugin-details');
});

test('[P2] captures the plugin detail share menu surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  const home = page.getByTestId('entry-view-home');
  await home.getByTestId('plugins-home-pill-category-deck').click();
  const card = home.locator('article.plugins-home__card[data-plugin-id="visual-deck-writer"]');
  await expect(card).toBeVisible();
  await card.hover();
  await home.getByTestId('plugins-home-details-visual-deck-writer').click({ force: true });
  await expect(page.getByRole('dialog', { name: /Deck Writer preview/i })).toBeVisible();
  await page.getByTestId('plugin-share-visual-deck-writer').getByRole('button', { name: /^More$/i }).click();
  await expect(page.locator('.plugin-share-popover[role="menu"]')).toBeVisible();

  await captureVisual(page, 'visual-plugin-share-menu');
});

test('[P2] captures the home context picker surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await page.getByTestId('home-hero-input').fill('@visual');
  await expect(page.getByTestId('home-hero-plugin-picker')).toBeVisible();
  await expect(page.getByRole('option', { name: /Prototype Starter/i })).toBeVisible();

  await captureVisual(page, 'visual-home-context-picker');
});

test('[P2] captures the home staged attachment surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await page.getByTestId('home-hero-file-input').setInputFiles({
    name: 'visual-brief.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Visual regression fixture for staged home attachments.\n', 'utf8'),
  });
  await expect(page.getByTestId('home-hero-staged-files')).toContainText('visual-brief.txt');

  await captureVisual(page, 'visual-home-staged-attachment');
});

test('[P2] captures the new project modal surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-new-project').click();
  await expect(page.getByTestId('new-project-modal')).toBeVisible();
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
  await expect(page.getByTestId('new-project-name')).toBeVisible();

  await captureVisual(page, 'visual-new-project-modal');
});

test('[P2] captures the projects page surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-projects').click();
  await expect(page).toHaveURL(/\/projects$/);
  const projects = page.getByTestId('entry-view-projects');
  await expect(projects.getByRole('heading', { name: 'Projects' })).toBeVisible();
  await expect(projects.getByText('Launchpad dashboard').first()).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-projects');
});

test('[P2] captures the projects kanban surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-projects').click();
  const projects = page.getByTestId('entry-view-projects');
  await projects.getByTestId('designs-view-kanban').click();
  await expect(projects.getByTestId('designs-view-kanban')).toHaveAttribute('aria-pressed', 'true');
  await expect(projects.getByText('Launchpad dashboard').first()).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-projects-kanban');
});

test('[P2] captures the design systems page surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-design-systems').click();
  await expect(page).toHaveURL(/\/design-systems$/);
  await expect(page.getByTestId('design-systems-tab')).toBeVisible();
  await page.getByRole('tab', { name: 'Official presets' }).click();
  await expect(page.getByTestId('design-system-card-agentic')).toBeVisible();
  await expect(page.getByTestId('design-system-card-airbnb')).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-design-systems');
});

test('[P2] captures the plugins page surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-plugins').click();
  await expect(page).toHaveURL(/\/plugins$/);
  const plugins = page.getByTestId('entry-view-plugins');
  await expect(plugins.getByRole('heading', { name: 'Plugins', exact: true })).toBeVisible();
  await expect(plugins.getByTestId('plugins-tab-installed')).toBeVisible();
  await expect(plugins.getByText('Prototype Starter').first()).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-plugins');
});

test('[P2] captures the integrations page surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-integrations').click();
  await expect(page).toHaveURL(/\/integrations$/);
  await expect(page.getByRole('heading', { name: 'Integrations' })).toBeVisible();
  await expect(page.getByTestId('integrations-tab-connectors')).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-integrations');
});

test('[P2] captures the integrations use everywhere surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-integrations').click();
  await page.getByTestId('integrations-tab-use-everywhere').click();
  await expect(page.getByTestId('integrations-tab-use-everywhere')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('CLI, HTTP, MCP').first()).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-integrations-use-everywhere');
});

test('[P2] captures the tasks page surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-tasks').click();
  await expect(page).toHaveURL(/\/automations$/);
  await expect(page.getByTestId('tasks-view')).toBeVisible();
  await expect(page.getByText('No automations yet')).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-tasks');
});

test('[P2] captures the project workspace surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('file-workspace')).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-project-workspace');
});

test('[P2] captures the topbar execution switcher surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await page.getByTestId('inline-model-switcher-chip').click();
  await expect(page.getByTestId('inline-model-switcher-popover')).toBeVisible();
  await expect(page.getByTestId('inline-model-switcher-mode-daemon')).toBeVisible();

  await captureVisual(page, 'visual-topbar-execution-switcher');
});

test('[P2] captures the topbar BYOK execution switcher surface', async ({ page }) => {
  await configureVisualPage(page, {
    config: {
      mode: 'api',
      apiKey: 'sk-visual',
      apiProtocol: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      agentId: null,
    },
  });
  await gotoVisualHome(page);

  await page.getByTestId('inline-model-switcher-chip').click();
  await expect(page.getByTestId('inline-model-switcher-popover')).toBeVisible();
  await expect(page.getByTestId('inline-model-switcher-mode-api')).toHaveAttribute('aria-selected', 'true');

  await captureVisual(page, 'visual-topbar-byok-switcher');
});

test('[P2] captures the avatar menu surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  const menu = await openAvatarMenu(page);
  // Settings moved out of the avatar menu to the header gear (footer-toolbar
  // layout); assert an agent option is present instead.
  await expect(menu.locator('.avatar-item').first()).toBeVisible();

  await captureVisual(page, 'visual-avatar-menu');
});

test('[P2] captures the avatar local agent list surface', async ({ page }) => {
  await configureVisualPage(page, {
    agents: VISUAL_CLI_AGENTS,
    config: {
      agentId: 'codex',
      agentModels: { codex: { model: 'default', reasoning: 'default' } },
    },
  });
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  const menu = await openAvatarMenu(page);
  await expect(menu.getByTestId('avatar-agent-option-claude')).toBeVisible();
  await expect(menu.getByTestId('avatar-agent-option-codex')).toBeVisible();

  await captureVisual(page, 'visual-avatar-local-agent-list');
});

test('[P2] captures the settings execution surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  const dialog = await openSettingsDetailsFromHeader(page);
  await expect(dialog.getByRole('tab', { name: /Local CLI/i })).toBeVisible();
  await expect(dialog.getByRole('tablist', { name: 'Execution mode' })).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-settings-execution');
});

test('[P2] captures the settings local CLI surface', async ({ page }) => {
  await configureVisualPage(page, {
    agents: VISUAL_CLI_AGENTS,
    config: {
      agentId: 'codex',
      agentModels: { codex: { model: 'default', reasoning: 'default' } },
    },
  });
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  const dialog = await openSettingsDetailsFromHeader(page);
  await dialog.getByRole('tab', { name: /Local CLI/i }).click();
  await expect(dialog.getByTestId('settings-agent-select-codex')).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-settings-local-cli');
});

test('[P2] captures the settings BYOK surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  const dialog = await openSettingsDetailsFromHeader(page);
  await dialog.getByRole('tab', { name: 'BYOK' }).click();
  await expect(dialog.getByRole('tablist', { name: 'API protocol' })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Anthropic API' })).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-settings-byok');
});

test('[P2] captures the settings BYOK OpenAI surface', async ({ page }) => {
  await configureVisualPage(page, {
    config: {
      mode: 'api',
      apiKey: 'sk-visual',
      apiProtocol: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      agentId: null,
    },
  });
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  const dialog = await openSettingsDetailsFromHeader(page);
  await dialog.getByRole('tab', { name: 'BYOK' }).click();
  await dialog.getByRole('tab', { name: 'OpenAI', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'OpenAI API' })).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-settings-byok-openai');
});

async function openAvatarMenu(page: Parameters<typeof configureVisualPage>[0]) {
  await page.locator('.avatar-menu .avatar-agent-trigger').click();
  const menu = page.locator('.avatar-popover[role="dialog"]');
  await expect(menu).toBeVisible();
  return menu;
}

async function openSettingsDetailsFromHeader(page: Parameters<typeof configureVisualPage>[0]) {
  await page.locator('.settings-icon-btn').click();
  await expect(page.getByTestId('entry-settings-menu')).toBeVisible();
  await page.getByTestId('entry-settings-open-details').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

async function gotoVisualWorkspace(page: Parameters<typeof configureVisualPage>[0]) {
  await page.getByTestId('recent-projects-strip').locator('[data-project-id]').first().click();
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
}
