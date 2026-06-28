// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PluginMarketplaceDemo } from '../../src/components/PluginMarketplaceDemo';

afterEach(() => {
  cleanup();
});

function catalog() {
  return document.querySelector('.plugin-marketplace__catalog') as HTMLElement;
}

describe('PluginMarketplaceDemo', () => {
  it('opens details by clicking an uninstalled plugin card and hides more actions', () => {
    render(<PluginMarketplaceDemo />);

    const area = catalog();
    expect(within(area).getByText('GitHub')).toBeTruthy();
    expect(within(area).getByText('Review PRs, triage issues, inspect CI, and publish release notes.')).toBeTruthy();
    expect(within(area).getAllByRole('button', { name: '安装' }).length).toBeGreaterThan(0);
    expect(within(area).queryByRole('button', { name: 'GitHub more actions' })).toBeNull();
    expect(within(area).queryByText('账号授权、权限范围和外部数据连接。')).toBeNull();

    fireEvent.click(within(area).getByText('GitHub').closest('article') as HTMLElement);

    expect(screen.getByRole('heading', { name: 'GitHub' })).toBeTruthy();
    expect(screen.getByText('@OpenDesign')).toBeTruthy();
    expect(screen.getByText('/pr-review')).toBeTruthy();
    expect(screen.getByText('GitHub OAuth')).toBeTruthy();
    expect(screen.getByText('PR review')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /快捷命令/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /数据连接/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /知识技能/ })).toBeTruthy();
  });

  it('switches the source filter to team expert suites', () => {
    render(<PluginMarketplaceDemo />);

    const area = catalog();
    expect(within(area).queryByText('Notion')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '团队' }));

    const notionRow = within(area).getByText('Notion').closest('article') as HTMLElement;
    expect(notionRow).toBeTruthy();
    expect(within(notionRow).getByRole('button', { name: 'Try it' })).toBeTruthy();
    expect(within(notionRow).getByRole('button', { name: 'Notion more actions' })).toBeTruthy();
    expect(within(area).queryByText('Workspace connection')).toBeNull();
    expect(screen.getByRole('button', { name: '团队' }).className).toContain('is-active');
  });

  it('lets installed plugins open an uninstall menu and try from home', () => {
    const onTryPlugin = vi.fn();
    render(<PluginMarketplaceDemo onTryPlugin={onTryPlugin} />);

    const area = catalog();
    const figmaRow = within(area).getByText('Figma').closest('article') as HTMLElement;
    fireEvent.click(within(figmaRow).getByRole('button', { name: 'Try it' }));
    expect(onTryPlugin).toHaveBeenCalledWith(expect.objectContaining({ name: 'Figma' }));

    fireEvent.click(within(figmaRow).getByRole('button', { name: 'Figma more actions' }));
    expect(within(figmaRow).getByRole('menuitem', { name: '卸载' })).toBeTruthy();
  });

  it('opens a create panel for plugin and skill imports without a marketplace kicker', () => {
    render(<PluginMarketplaceDemo />);

    expect(screen.queryByText('MARKETPLACE')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '新增' }));

    expect(screen.getByRole('dialog', { name: '新增 Plugin' })).toBeTruthy();
    expect(screen.getByText('从链接导入')).toBeTruthy();
    expect(screen.getByText('上传本地文件夹')).toBeTruthy();
    expect(screen.getByPlaceholderText('https://example.com/open-design-suite')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Skill' }));
    expect(screen.getByRole('dialog', { name: '新增 Skill' })).toBeTruthy();
    expect(screen.getByPlaceholderText('https://example.com/skill')).toBeTruthy();
    expect(screen.getByRole('button', { name: '上传 Skill' })).toBeTruthy();
  });

  it('keeps search scoped to plugin names, descriptions, and categories', () => {
    render(<PluginMarketplaceDemo />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search expert suites' }), {
      target: { value: 'drive' },
    });

    const area = catalog();
    expect(within(area).getByText('Google Drive')).toBeTruthy();
    expect(within(area).queryByText('GitHub')).toBeNull();
  });

  it('shows skills as a separate marketplace mode', () => {
    render(<PluginMarketplaceDemo />);

    fireEvent.click(screen.getByRole('button', { name: '技能' }));

    expect(screen.getByText('技能是可复用的任务流程和审查规则，可独立使用，也可以被专家套件组合调用。')).toBeTruthy();
    expect(screen.getByText('Template Creator')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Template Creator more actions' })).toBeNull();
    expect(screen.queryByText('Installed')).toBeNull();
  });
});
