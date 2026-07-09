// Team-shared project discovery grid for the "全部项目" view.
//
// A member's own /api/projects list is only their LOCAL projects, so a fresh
// member sees an empty strip even though the owner has shared projects to the
// team. Those shared projects live on the resource hub (GET
// /api/workspace/projects/team → TeamProject[]); this renders them as cards a
// member can pull + open. Clicking 打开 materializes the project locally
// (POST /api/projects/:id/collab/pull) and then hands off to the shell's normal
// open-project handler — after the pull the project carries its real name and
// opens read-only (member is not the owner → single-writer read-only path).

import { useState, type CSSProperties } from 'react';
import { Button } from '@open-design/components';
import type { TeamProject } from '@open-design/contracts';
import { Icon } from './Icon';

interface Props {
  projects: TeamProject[];
  /** projectIds already present in the member's local list; skipped here so a
   *  pulled project is not shown twice (once local, once as a team card). */
  localProjectIds: ReadonlySet<string>;
  /** The shell's open-project handler; drives navigation after the pull lands. */
  onOpenProject: (id: string) => Promise<boolean> | boolean | void;
  /** Refresh the member's local project list once a pull materializes one. */
  onProjectsRefresh?: () => Promise<void> | void;
}

const sectionStyle: CSSProperties = {
  marginTop: 28,
};

const headingStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  margin: '0 0 4px',
  fontSize: 15,
  fontWeight: 600,
  color: 'var(--text)',
};

const hintStyle: CSSProperties = {
  margin: '0 0 16px',
  fontSize: 13,
  color: 'var(--text-muted)',
};

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
  gap: 12,
};

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 16,
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: 'var(--bg-panel)',
};

const avatarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 36,
  height: 36,
  borderRadius: 8,
  background: 'var(--accent-tint, var(--bg-subtle))',
  color: 'var(--accent)',
  flex: 'none',
};

const nameStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const ownerStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--text-muted)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

/** Shorten a member id to a compact owner hint (ids are long/opaque). */
function ownerHint(ownerMemberId: string): string {
  const trimmed = ownerMemberId.trim();
  if (!trimmed) return '团队成员';
  return trimmed.length > 12 ? `${trimmed.slice(0, 12)}…` : trimmed;
}

export function TeamProjectsSection({
  projects,
  localProjectIds,
  onOpenProject,
  onProjectsRefresh,
}: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  // Skip projects the member already pulled — those already appear in the local
  // strip above, so showing a team card for them would double up.
  const discoverable = projects.filter((project) => !localProjectIds.has(project.projectId));

  if (discoverable.length === 0) return null;

  async function handleOpen(projectId: string) {
    if (pendingId) return;
    setPendingId(projectId);
    try {
      // Materialize the shared project into the member's local workspace. After
      // this the project exists locally with its real name/metadata.
      await fetch(`/api/projects/${encodeURIComponent(projectId)}/collab/pull`, {
        method: 'POST',
      });
      await Promise.resolve(onProjectsRefresh?.());
    } catch {
      // Best-effort: still try to open — the open handler surfaces a missing
      // state if the pull did not land.
    } finally {
      setPendingId(null);
    }
    await Promise.resolve(onOpenProject(projectId));
  }

  return (
    <section style={sectionStyle} data-testid="team-projects-section">
      <h2 style={headingStyle}>
        <Icon name="users" size={15} />
        团队共享项目
      </h2>
      <p style={hintStyle}>团队成员共享到工作区的项目，打开后以只读方式查看。</p>
      <div style={gridStyle}>
        {discoverable.map((project) => {
          const isPending = pendingId === project.projectId;
          return (
            <div
              key={project.projectId}
              style={cardStyle}
              data-testid="team-project-card"
              data-project-id={project.projectId}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <span style={avatarStyle} aria-hidden>
                  <Icon name="folder" size={18} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={nameStyle} title={project.projectId}>
                    共享项目
                  </div>
                  <div style={ownerStyle} title={project.ownerMemberId}>
                    来自 {ownerHint(project.ownerMemberId)}
                  </div>
                </div>
              </div>
              <Button
                variant="primary"
                disabled={isPending || Boolean(pendingId)}
                onClick={() => void handleOpen(project.projectId)}
                data-testid="team-project-open"
              >
                {isPending ? '打开中…' : '打开'}
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
