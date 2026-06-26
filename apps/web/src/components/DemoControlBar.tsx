// Demo-only floating control bar.
// Renders globally (portal to document.body) so it's visible on every route,
// including the onboarding flow.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type DemoScenario =
  | 'home'
  | 'onboarding-new'
  | 'invite-editor'
  | 'invite-admin'
  | 'invite-viewer';

export function isInviteScenario(
  s: DemoScenario,
): s is Extract<DemoScenario, 'invite-editor'> {
  return s === 'invite-editor';
}

export function isViewerScenario(s: DemoScenario): boolean {
  return s === 'invite-viewer';
}

// Membership tier — an axis independent of the scenario. Free + the three
// personal tiers (Plus / Pro / Max) are single-seat (solo); team unlocks
// multi-seat collaboration. Upgrade paths: Plus → Pro/Max/Team, Pro → Max/Team,
// Max → Team (and Free → any paid tier).
export type DemoPlan = 'free' | 'plus' | 'pro' | 'max' | 'team';
export type DemoUseMode = 'cloud' | 'local';

export function isSoloPlan(p: DemoPlan): boolean {
  return p !== 'team';
}

export type InviteRole = 'editor' | 'admin' | 'viewer';

interface Props {
  scenario: DemoScenario;
  onScenario: (s: DemoScenario) => void;
  plan: DemoPlan;
  onPlan: (p: DemoPlan) => void;
  useMode: DemoUseMode;
  onUseMode: (mode: DemoUseMode) => void;
  /** Fires the "积分不足" upgrade/top-up flow. */
  onLowCredits: () => void;
  /** Launches the invitee acceptance flow (email link → join workspace). */
  onAcceptInvite: (role: InviteRole) => void;
  /** Demo-only collaboration hooks consumed by project pages when mounted. */
  onQueueDemo?: () => void;
  onEditDemo?: () => void;
}

const MAIN_CHIPS: Array<{ id: DemoScenario; label: string }> = [
  { id: 'home',           label: '🏠 主页' },
  { id: 'onboarding-new', label: '🎉 新注册' },
];

const INVITE_CHIPS: Array<{ role: InviteRole; label: string }> = [
  { role: 'editor', label: 'Editor' },
  { role: 'admin',  label: 'Manager' },
  { role: 'viewer', label: 'Viewer' },
];

const ROLE_CHIPS: Array<{ id: DemoScenario; label: string; invite?: boolean }> = [
  { id: 'invite-editor', label: 'Editor', invite: true },
  { id: 'invite-admin',  label: 'Manager' },
  { id: 'invite-viewer', label: 'Viewer' },
];

const PLAN_CHIPS: Array<{ id: DemoPlan; label: string }> = [
  { id: 'free', label: '免费版' },
  { id: 'plus', label: 'Plus' },
  { id: 'pro',  label: 'Pro' },
  { id: 'max',  label: 'Max' },
  { id: 'team', label: '团队版' },
];

const USE_MODE_CHIPS: Array<{ id: DemoUseMode; label: string; desc: string }> = [
  { id: 'cloud', label: 'Cloud', desc: '云端协作' },
  { id: 'local', label: 'CLI / BYOK', desc: '本地或自带 Key' },
];

const DEMO_BAR_COLLAPSED_KEY = 'od.demoBar.collapsed';

function readCollapsedState(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(DEMO_BAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeCollapsedState(collapsed: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DEMO_BAR_COLLAPSED_KEY, collapsed ? 'true' : 'false');
  } catch {
    /* ignore disabled storage */
  }
}

function labelForScenario(scenario: DemoScenario): string {
  return [...MAIN_CHIPS, ...ROLE_CHIPS].find((chip) => chip.id === scenario)?.label ?? '主页';
}

function labelForPlan(plan: DemoPlan): string {
  return PLAN_CHIPS.find((chip) => chip.id === plan)?.label ?? '免费版';
}

function labelForUseMode(useMode: DemoUseMode): string {
  return USE_MODE_CHIPS.find((chip) => chip.id === useMode)?.label ?? 'Cloud';
}

function Bar({ scenario, onScenario, plan, onPlan, useMode, onUseMode, onLowCredits, onAcceptInvite, onQueueDemo, onEditDemo }: Props) {
  const [collapsed, setCollapsed] = useState(readCollapsedState);
  const availablePlans = useMode === 'local'
    ? PLAN_CHIPS.filter((chip) => chip.id !== 'team')
    : PLAN_CHIPS;

  useEffect(() => {
    writeCollapsedState(collapsed);
  }, [collapsed]);

  if (collapsed) {
    return (
      <div className="demo-bar demo-bar--collapsed">
        <button
          type="button"
          className="demo-bar__summary"
          onClick={() => setCollapsed(false)}
          aria-label="展开 Demo Control"
          aria-expanded="false"
        >
          <span className="demo-bar__summary-dot" aria-hidden />
          <span className="demo-bar__summary-title">Control</span>
          <span className="demo-bar__summary-meta">{labelForScenario(scenario)} · {labelForUseMode(useMode)} · {labelForPlan(plan)}</span>
          <span className="demo-bar__summary-caret" aria-hidden>⌃</span>
        </button>
      </div>
    );
  }
  return (
    <div className="demo-bar">
      <div className="demo-bar__handle">
        <span className="demo-bar__handle-title">Control</span>
        <button
          type="button"
          className="demo-bar__collapse"
          onClick={() => setCollapsed(true)}
          aria-label="收起 Demo Control"
          aria-expanded="true"
        >
          收起
        </button>
      </div>

      <div className="demo-bar__body">
        <div className="demo-bar__group">
          <span className="demo-bar__label">使用方式</span>
          <div className="demo-bar__chips">
            {USE_MODE_CHIPS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`demo-bar__chip${useMode === c.id ? ' is-active' : ''}`}
                onClick={() => onUseMode(c.id)}
                title={c.desc}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="demo-bar__group demo-bar__group--scenario">
          <span className="demo-bar__label">场景</span>
          <div className="demo-bar__chips">
            {MAIN_CHIPS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`demo-bar__chip${scenario === c.id ? ' is-active' : ''}`}
                onClick={() => onScenario(c.id)}
              >
                {c.label}
              </button>
            ))}
            {ROLE_CHIPS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`demo-bar__chip${scenario === c.id ? ' is-active' : ''}`}
                onClick={() => onScenario(c.id)}
              >
                {c.invite ? '📧 ' : '👥 '}{c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="demo-bar__divider" />

        <div className="demo-bar__group">
          <span className="demo-bar__label">版本</span>
          <div className="demo-bar__chips">
            {availablePlans.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`demo-bar__chip${plan === c.id ? ' is-active' : ''}`}
                onClick={() => onPlan(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="demo-bar__divider" />

        <div className="demo-bar__group">
          <span className="demo-bar__label">演示</span>
          <div className="demo-bar__chips">
            <button type="button" className="demo-bar__chip" onClick={onQueueDemo}>
              Queue
            </button>
            <button type="button" className="demo-bar__chip" onClick={onEditDemo}>
              Edit
            </button>
            <button type="button" className="demo-bar__chip demo-bar__chip--warning" onClick={onLowCredits}>
              ⚡ 积分不足
            </button>
          </div>
        </div>

        <div className="demo-bar__divider" />

        {/* ── 被邀请：接受邀请落地流程（角色 = 邀请时设定） ── */}
        <div className="demo-bar__group">
          <span className="demo-bar__label">邀请</span>
          <div className="demo-bar__chips">
            {INVITE_CHIPS.map((c) => (
              <button
                key={c.role}
                type="button"
                className="demo-bar__chip"
                onClick={() => onAcceptInvite(c.role)}
              >
                📧 {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function DemoControlBar(props: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  if (!containerRef.current) {
    const div = document.createElement('div');
    div.className = 'demo-bar-portal';
    containerRef.current = div;
  }

  useEffect(() => {
    const el = containerRef.current!;
    document.body.appendChild(el);
    return () => { document.body.removeChild(el); };
  }, []);

  return createPortal(<Bar {...props} />, containerRef.current);
}
