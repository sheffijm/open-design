// Team analytics dashboard (demo).
//
// UC-10: owner/admin-visible workspace data overview. Demo-only data for
// product review; no backend calls yet.

import type { CSSProperties } from 'react';
import { Icon } from './Icon';

const DASHBOARD_STATS = [
  { label: '创建的设计数', value: '128', delta: '+18 本周', icon: 'grid' },
  { label: '创建的 Design System 数', value: '12', delta: '+3 本月', icon: 'palette' },
  { label: '活跃成员', value: '5', delta: '过去 7 天', icon: 'share' },
] as const;

const TOKEN_RANKING = [
  { name: '琼羽（你）', role: 'Owner', tokens: '1.42M', share: 100, color: '#c65b3a' },
  { name: '张伟', role: 'Manager', tokens: '980K', share: 69, color: '#f97316' },
  { name: '李娜', role: 'Editor', tokens: '640K', share: 45, color: '#6366f1' },
  { name: '王芳', role: 'Reviewer', tokens: '420K', share: 30, color: '#10b981' },
] as const;

export function TeamDashboardView() {
  return (
    <div className="entry-section team-dashboard">
      <header className="entry-section__head team-dashboard__head">
        <div>
          <h1 className="entry-section__title">数据大盘</h1>
          <p className="team-dashboard__subtitle">所有者 / 管理员可见 · Nexu 团队最近 30 天</p>
        </div>
        <span className="team-dashboard__access">UC-10</span>
      </header>

      <section className="team-dashboard__hero" aria-label="UC-10 数据大盘">
        <div className="team-dashboard__hero-copy">
          <span className="team-dashboard__kicker">Workspace analytics</span>
          <h2>Nexu 团队</h2>
          <p>汇总团队产出、Design System 沉淀、活跃协作和 token 消耗结构。</p>
        </div>
        <div className="team-dashboard__hero-meta" aria-label="数据范围">
          <span>Owner / Manager</span>
          <span>最近 30 天</span>
          <span>Demo data</span>
        </div>
      </section>

      <div className="team-dashboard__metric-grid">
        {DASHBOARD_STATS.map((stat) => (
          <article className="team-dashboard__metric-card" key={stat.label}>
            <span className="team-dashboard__metric-icon" aria-hidden>
              <Icon name={stat.icon} size={16} />
            </span>
            <span className="team-dashboard__metric-label">{stat.label}</span>
            <strong className="team-dashboard__metric-value">{stat.value}</strong>
            <span className="team-dashboard__metric-delta">{stat.delta}</span>
          </article>
        ))}
      </div>

      <section className="team-dashboard__token-card" aria-label="Token 消耗排名">
        <div className="team-dashboard__token-head">
          <div>
            <h2>Token 消耗排名</h2>
            <p>按最近 30 天团队协作与 Agent 任务消耗统计。</p>
          </div>
          <span>Top 4</span>
        </div>

        <div className="team-dashboard__token-list">
          {TOKEN_RANKING.map((person, index) => (
            <div
              className="team-dashboard__token-row"
              key={person.name}
              style={{ '--member-rank-color': person.color } as CSSProperties}
            >
              <span className="team-dashboard__token-rank">{index + 1}</span>
              <div className="team-dashboard__token-person">
                <strong>{person.name}</strong>
                <span>{person.role}</span>
              </div>
              <span className="team-dashboard__token-value">{person.tokens}</span>
              <span className="team-dashboard__token-bar" aria-hidden>
                <span style={{ width: `${person.share}%` }} />
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
