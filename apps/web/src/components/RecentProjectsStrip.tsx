// Horizontal "Recent projects" rail for the Home view.
//
// Mirrors the strip Lovart shows under its hero: a small set of
// recent project cards with a "View all" link that switches to the
// full Projects view. We keep the data shape narrow (Project[] +
// onOpen / onViewAll) so the strip can be reused later by other
// surfaces (e.g. an in-project quick-switcher pane).

import type { CSSProperties } from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@open-design/components';
import { useT } from '../i18n';
import { fetchProjectFiles, fetchProjectFileText, projectFileUrl } from '../providers/registry';
import type {
  DesignSystemSummary,
  Project,
  ProjectDisplayStatus,
  ProjectFile,
  PromptTemplateSummary,
} from '../types';
import { Icon } from './Icon';
import { InviteDialog } from './InviteDialog';
import { STATUS_LABEL_KEYS } from './DesignsTab';
import { isDesignSystemProject, isPublishedDesignSystemProject } from './design-system-project';

interface Props {
  projects: Project[];
  /** Used only to show a "Published" status for design-system projects whose
   *  backing system is published (independent of the project's run status). */
  designSystems?: DesignSystemSummary[];
  /** Drives the "Templates" tab on the Home browser. */
  promptTemplates?: PromptTemplateSummary[];
  /** Retained for call-site compatibility; the strip skips rendering
   *  while the list is loading so we never need a loading state. */
  loading?: boolean;
  /** Section heading (defaults to the Canva-style "最近使用"). */
  heading?: string;
  onOpen: (id: string) => void;
  onViewAll?: () => void;
  onDelete?: (id: string) => Promise<boolean | void> | boolean | void;
  onRename?: (id: string, name: string) => void;
  limit?: number;
  /** 'recent' = mixed private/shared (home); 'drafts' = all private (mine);
   *  'team' = all shared, varied team-member creators. */
  space?: SpaceKind;
  /** Demo-only: Cloud has team visibility, CLI/BYOK does not. */
  collaborationEnabled?: boolean;
}

type BrowseTab = 'projects' | 'design-systems' | 'templates';

const EMPTY_DESIGN_SYSTEMS: DesignSystemSummary[] = [];

// Demo-only mocked metadata so the grid shows a believable mix of owners,
// visibility, and recency instead of the seeded "我创建 · just now" uniformity.
const MOCK_MEMBERS = [
  { name: '我', initial: '我', img: '/team-avatars/a2.png' },
  { name: '张伟', initial: '张', img: '/team-avatars/a1.png' },
  { name: '李娜', initial: '李', img: '/team-avatars/a3.png' },
  { name: '王芳', initial: '王', img: '/team-avatars/a4.png' },
  { name: '陈明', initial: '陈', img: '/team-avatars/a6.png' },
  { name: '刘洋', initial: '刘', img: '/team-avatars/a7.png' },
];
const MOCK_TIMES = ['刚刚', '12 分钟前', '1 小时前', '3 小时前', '昨天', '2 天前', '上周', '3 周前'];

const ME = { name: '我', initial: '我', img: '/team-avatars/a2.png' };
type SpaceKind = 'recent' | 'drafts' | 'team';
function mockCardMeta(index: number, space: SpaceKind) {
  const time = MOCK_TIMES[index % MOCK_TIMES.length] ?? '刚刚';
  if (space === 'team') {
    // All projects: everything is shared, owned by varied team members.
    const m = MOCK_MEMBERS[(index * 3 + 1) % MOCK_MEMBERS.length] ?? ME;
    return { ownerName: m.name, ownerInitial: m.initial, ownerImg: m.img, badge: 'shared' as 'private' | 'shared', time };
  }
  if (space === 'drafts') {
    // Drafts: everything is private, owned by me.
    return { ownerName: '我', ownerInitial: '我', ownerImg: ME.img, badge: 'private' as 'private' | 'shared', time };
  }
  // Recent (home): a believable mix — private items are mine, shared ones were
  // created by varied teammates (so the avatars read as a real team).
  const badge: 'private' | 'shared' = index % 3 === 0 ? 'shared' : 'private';
  if (badge === 'shared') {
    const m = MOCK_MEMBERS[(index * 3 + 2) % MOCK_MEMBERS.length] ?? ME;
    return { ownerName: m.name, ownerInitial: m.initial, ownerImg: m.img, badge, time };
  }
  return { ownerName: '我', ownerInitial: '我', ownerImg: ME.img, badge, time };
}

const DECK_PREVIEW_WIDTH = 1280;
const DECK_PREVIEW_HEIGHT = 720;
const deckCoverCache = new Map<string, string>();
const deckCoverInflight = new Map<string, Promise<string>>();

export function RecentProjectsStrip({
  projects,
  designSystems = EMPTY_DESIGN_SYSTEMS,
  heading = '最近使用',
  space = 'recent',
  onOpen,
  onDelete,
  onRename,
  limit = 6,
  collaborationEnabled = true,
}: Props) {
  const t = useT();
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<{
    project: Project;
    action: 'to-team' | 'to-personal';
  } | null>(null);
  const [moveDontRemind, setMoveDontRemind] = useState(false);
  // Projects flipped private → shared via "转入团队空间" (demo-local).
  const [movedToTeam, setMovedToTeam] = useState<Set<string>>(() => new Set());
  // Projects flipped shared → private via "移出团队空间" (demo-local).
  const [movedToPersonal, setMovedToPersonal] = useState<Set<string>>(() => new Set());
  const moveTitleId = useId();

  const sorted = useMemo(
    () => [...projects].sort((a, b) => b.updatedAt - a.updatedAt),
    [projects],
  );
  // Canva-style "Recently used": all recent items, capped by `limit`.
  const visibleProjects = useMemo(() => sorted.slice(0, limit), [sorted, limit]);
  const [coverByProject, setCoverByProject] = useState<
    Record<string, { kind: 'html' | 'image' | 'video' | 'logo'; name: string } | null>
  >({});
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; original: string } | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<Project | null>(null);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);
  const renameTitleId = useId();
  const confirmTitleId = useId();
  const actionsAvailable = Boolean(onDelete || onRename);

  useEffect(() => {
    if (!menuOpenId) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && menuContainerRef.current?.contains(target)) return;
      setMenuOpenId(null);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [menuOpenId]);

  useEffect(() => {
    let cancelled = false;
    if (visibleProjects.length === 0) {
      setCoverByProject({});
      return;
    }

    void Promise.all(
      visibleProjects.map(async (project) => {
        const designSystemProject = isDesignSystemProject(project);
        if (project.metadata?.entryFile && !designSystemProject) return [project.id, null] as const;
        let files: Awaited<ReturnType<typeof fetchProjectFiles>>;
        try {
          files = await fetchProjectFiles(project.id);
        } catch {
          return [project.id, null] as const;
        }
        if (designSystemProject) {
          const cover = await findDesignSystemCover(project.id, files);
          if (cover) {
            return [
              project.id,
              cover,
            ] as const;
          }
          return [project.id, null] as const;
        }
        const html =
          files.find((file) => (file.path ?? file.name) === 'index.html') ??
          files
            .filter((file) => file.kind === 'html')
            .sort((a, b) => b.mtime - a.mtime)[0];
        if (html) {
          return [
            project.id,
            { kind: 'html' as const, name: html.path ?? html.name },
          ] as const;
        }
        const image = files
          .filter((file) => file.kind === 'image')
          .sort((a, b) => b.mtime - a.mtime)[0];
        if (image) {
          return [
            project.id,
            { kind: 'image' as const, name: image.path ?? image.name },
          ] as const;
        }
        const video = files
          .filter((file) => file.kind === 'video')
          .sort((a, b) => b.mtime - a.mtime)[0];
        if (video) {
          return [
            project.id,
            { kind: 'video' as const, name: video.path ?? video.name },
          ] as const;
        }
        return [project.id, null] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      setCoverByProject(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
  }, [visibleProjects]);

  // First-run home shouldn't reserve space for an empty "Recent
  // projects" rail — the dashed empty box just adds visual noise
  // above the plugin gallery. We also skip rendering during the
  // load window so the section doesn't pop in and then collapse;
  // the prompt hero is enough chrome on its own.
  if (sorted.length === 0) {
    return null;
  }

  function startRename(project: Project) {
    setMenuOpenId(null);
    setRenameTarget({ id: project.id, original: project.name });
    setRenameInput(project.name);
  }

  function cancelRename() {
    setRenameTarget(null);
    setRenameInput('');
  }

  function commitRename() {
    if (!renameTarget || !onRename) return;
    const trimmed = renameInput.trim();
    if (trimmed && trimmed !== renameTarget.original) {
      onRename(renameTarget.id, trimmed);
    }
    cancelRename();
  }

  function requestDelete(project: Project) {
    setMenuOpenId(null);
    setConfirmTarget(project);
  }

  async function commitDelete() {
    if (!confirmTarget || !onDelete) return;
    const target = confirmTarget;
    setConfirmTarget(null);
    await onDelete(target.id);
  }

  return (
    <section className="recent-projects" data-testid="recent-projects-strip">
      <header className="recent-projects__head">
        <h2 className="recent-projects__heading">{heading}</h2>
        <div className="recent-projects__controls">
          {collaborationEnabled && space === 'team' ? (
            <button
              type="button"
              className="recent-projects__invite"
              onClick={() => setInviteOpen(true)}
            >
              <Icon name="share" size={15} /> 邀请同事
            </button>
          ) : null}
          <button type="button" className="recent-projects__filter" aria-hidden>
            所有者
            <Icon name="chevron-down" size={13} />
          </button>
          <button type="button" className="recent-projects__filter" aria-hidden>
            任何类型
            <Icon name="chevron-down" size={13} />
          </button>
          <button type="button" className="recent-projects__view-btn" aria-label="排序">
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7h6M3 12h10M3 17h14M17 4v8m0 0 3-3m-3 3-3-3" />
            </svg>
          </button>
          <div className="recent-projects__view" role="group" aria-label={t('designs.viewToggleAria')}>
            <button
              type="button"
              className={`recent-projects__view-btn${view === 'grid' ? ' is-active' : ''}`}
              aria-pressed={view === 'grid'}
              aria-label={t('designs.viewGrid')}
              onClick={() => setView('grid')}
            >
              <Icon name="grid" size={15} />
            </button>
            <button
              type="button"
              className={`recent-projects__view-btn${view === 'list' ? ' is-active' : ''}`}
              aria-pressed={view === 'list'}
              onClick={() => setView('list')}
            >
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
              </svg>
            </button>
          </div>
        </div>
      </header>
      <div
        className={`recent-projects__row recent-projects__row--${view}${menuOpenId ? ' recent-projects__row--menu-open' : ''}`}
        role="list"
      >
        {visibleProjects.map((project, index) => {
          const cover = projectCover(project, coverByProject[project.id] ?? null);
          const baseMeta = mockCardMeta(index, space);
          // A project moved to the team space reads as shared regardless of its
          // original mock visibility; a project moved out reads as private.
          const meta = movedToTeam.has(project.id)
            ? { ...baseMeta, badge: 'shared' as 'private' | 'shared' }
            : movedToPersonal.has(project.id)
              ? { ...baseMeta, badge: 'private' as 'private' | 'shared', ownerName: '我', ownerInitial: '我', ownerImg: ME.img }
            : baseMeta;
          const projectMoveAction: 'to-team' | 'to-personal' =
            meta.badge === 'shared' ? 'to-personal' : 'to-team';
          const designSystemProject = isDesignSystemProject(project);
          const status: ProjectDisplayStatus = project.status?.value ?? 'not_started';
          const publishedDesignSystem = isPublishedDesignSystemProject(project, designSystems);
          const isActive =
            !publishedDesignSystem &&
            (status === 'running' || status === 'queued' || status === 'awaiting_input');
          return (
            <div
              key={project.id}
              role="listitem"
              className={`recent-projects__card${designSystemProject ? ' is-design-system-project' : ''}${menuOpenId === project.id ? ' is-menu-open' : ''}`}
              data-project-id={project.id}
            >
              <button
                type="button"
                className="recent-projects__card-main"
                onClick={() => onOpen(project.id)}
                title={project.name}
              >
                <div
                  className={`recent-projects__card-thumb recent-projects__card-thumb-${cover.kind}`}
                  style={cover.style}
                  aria-hidden
                >
                  {(cover.kind === 'image' || cover.kind === 'logo') && cover.src ? (
                    <img
                      className="recent-projects__thumb-media"
                      src={cover.src}
                      alt=""
                      loading="lazy"
                    />
                  ) : cover.kind === 'video' && cover.src ? (
                    <video
                      className="recent-projects__thumb-media"
                      src={cover.src}
                      muted
                      preload="metadata"
                      playsInline
                    />
                  ) : cover.kind === 'html' && cover.src ? (
                    <RecentProjectHtmlThumb
                      src={cover.src}
                      deckCoverOnly={project.metadata?.kind === 'deck'}
                    />
                  ) : (
                    <span className="recent-projects__card-glyph">{cover.initial}</span>
                  )}
                  {collaborationEnabled && meta.badge === 'private' ? (
                    <span className="recent-projects__card-badge">
                      <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                        <rect x="5" y="11" width="14" height="9" rx="2" />
                        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                      </svg>
                      私人
                    </span>
                  ) : collaborationEnabled && meta.badge === 'shared' ? (
                    <span className="recent-projects__card-badge recent-projects__card-badge--shared">
                      <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="9" cy="8" r="3" />
                        <path d="M3 20a6 6 0 0 1 12 0M16 11a3 3 0 1 0-1-5.8M21 20a6 6 0 0 0-5-5.9" />
                      </svg>
                      共享
                    </span>
                  ) : null}
                </div>
                <div className="recent-projects__card-meta">
                  <div className="recent-projects__card-name">{project.name}</div>
                  <div className="recent-projects__card-footer">
                    <div className="recent-projects__card-time">
                      <span className="recent-projects__card-owner" aria-hidden>
                        {meta.ownerImg ? <img src={meta.ownerImg} alt="" loading="lazy" /> : meta.ownerInitial}
                      </span>
                      <span>{meta.ownerName}创建</span>
                      <span className="recent-projects__card-sep" aria-hidden>·</span>
                      {meta.time}
                    </div>
                    <div className="design-card-tag-row">
                      {designSystemProject ? (
                        <DesignSystemProjectTag />
                      ) : (
                        <ProjectTag category={projectCategory(project)} />
                      )}
                    </div>
                  </div>
                </div>
              </button>
              {actionsAvailable ? (
                <div
                  className="recent-projects__card-menu-anchor"
                  ref={menuOpenId === project.id ? menuContainerRef : undefined}
                >
                  <button
                    type="button"
                  className="recent-projects__card-more"
                  aria-label={t('designs.menuMore')}
                  aria-haspopup="menu"
                  aria-expanded={menuOpenId === project.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      setMenuOpenId((current) => current === project.id ? null : project.id);
                    }}
                  >
                    <Icon name="more-horizontal" size={14} />
                  </button>
                  {menuOpenId === project.id ? (
                    <div
                      className="recent-projects__card-menu"
                      role="menu"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {collaborationEnabled ? (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpenId(null);
                            setMoveTarget({ project, action: projectMoveAction });
                          }}
                        >
                          <Icon name={projectMoveAction === 'to-team' ? 'import' : 'log-out'} size={12} />
                          <span>{projectMoveAction === 'to-team' ? '转入团队空间' : '移出团队空间'}</span>
                        </button>
                      ) : null}
                      {onRename ? (
                        <button type="button" role="menuitem" onClick={() => startRename(project)}>
                          <Icon name="pencil" size={12} />
                          <span>{t('designs.menuRename')}</span>
                        </button>
                      ) : null}
                      {onDelete ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="danger"
                          onClick={() => requestDelete(project)}
                        >
                          <Icon name="close" size={12} />
                          <span>{t('designs.menuDelete')}</span>
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {renameTarget ? (
        <Dialog
          as="form"
          className="modal-rename"
          onClose={cancelRename}
          closeOnEscape
          ariaLabelledBy={renameTitleId}
          onSubmit={(event) => {
            event.preventDefault();
            commitRename();
          }}
        >
          <DialogTitle id={renameTitleId}>{t('designs.renameTitle')}</DialogTitle>
          <label>
            {t('designs.renamePrompt', { name: renameTarget.original })}
            <input
              type="text"
              value={renameInput}
              autoFocus
              onChange={(event) => setRenameInput(event.target.value)}
            />
          </label>
          <DialogFooter className="row">
            <button type="button" onClick={cancelRename}>
              {t('designs.renameCancel')}
            </button>
            <button
              type="submit"
              className="primary"
              disabled={!renameInput.trim() || renameInput.trim() === renameTarget.original}
            >
              {t('designs.renameSave')}
            </button>
          </DialogFooter>
        </Dialog>
      ) : null}
      {confirmTarget ? (
        <Dialog
          className="modal-confirm"
          role="alertdialog"
          onClose={() => setConfirmTarget(null)}
          ariaLabelledBy={confirmTitleId}
        >
          <DialogTitle id={confirmTitleId}>{t('designs.deleteTitle')}</DialogTitle>
          <DialogDescription>
            {t('designs.deleteConfirm', { name: confirmTarget.name })}
          </DialogDescription>
          <DialogFooter className="row">
            <button type="button" onClick={() => setConfirmTarget(null)}>
              {t('designs.renameCancel')}
            </button>
            <button type="button" className="primary danger" onClick={() => void commitDelete()}>
              {t('designs.menuDelete')}
            </button>
          </DialogFooter>
        </Dialog>
      ) : null}
      {moveTarget ? (
        <Dialog
          className="modal-confirm"
          role="alertdialog"
          onClose={() => setMoveTarget(null)}
          ariaLabelledBy={moveTitleId}
        >
          <DialogTitle id={moveTitleId}>
            {moveTarget.action === 'to-team' ? '转入团队空间' : '移出团队空间'}
          </DialogTitle>
          <DialogDescription>
            {moveTarget.action === 'to-team' ? (
              <>
                「{moveTarget.project.name}」转入团队空间后，<strong>团队全体成员都可以查看和编辑</strong>。该操作可在「全部项目」中找到。
              </>
            ) : (
              <>
                「{moveTarget.project.name}」移出团队空间后，将回到私人项目，<strong>只有你可以查看和编辑</strong>。
              </>
            )}
          </DialogDescription>
          <label className="recent-projects__move-remind">
            <input
              type="checkbox"
              checked={moveDontRemind}
              onChange={(event) => setMoveDontRemind(event.target.checked)}
            />
            不再提示
          </label>
          <DialogFooter className="row">
            <button type="button" onClick={() => setMoveTarget(null)}>
              {t('designs.renameCancel')}
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => {
                if (moveTarget.action === 'to-team') {
                  setMovedToTeam((prev) => new Set(prev).add(moveTarget.project.id));
                  setMovedToPersonal((prev) => {
                    const next = new Set(prev);
                    next.delete(moveTarget.project.id);
                    return next;
                  });
                } else {
                  setMovedToPersonal((prev) => new Set(prev).add(moveTarget.project.id));
                  setMovedToTeam((prev) => {
                    const next = new Set(prev);
                    next.delete(moveTarget.project.id);
                    return next;
                  });
                }
                setMoveTarget(null);
              }}
            >
              {moveTarget.action === 'to-team' ? '确认转入' : '确认移出'}
            </button>
          </DialogFooter>
        </Dialog>
      ) : null}
      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </section>
  );
}

function RecentProjectHtmlThumb({
  src,
  deckCoverOnly,
}: {
  src: string;
  deckCoverOnly: boolean;
}) {
  if (!deckCoverOnly) {
    return (
      <iframe
        className="recent-projects__thumb-iframe"
        src={src}
        title=""
        loading="lazy"
        sandbox="allow-scripts"
        tabIndex={-1}
      />
    );
  }

  return <DeckCoverThumb src={src} />;
}

function DeckCoverThumb({ src }: { src: string }) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [srcDoc, setSrcDoc] = useState<string | null>(() => deckCoverCache.get(src) ?? null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    let cancelled = false;
    const cached = deckCoverCache.get(src);
    if (cached) {
      setSrcDoc(cached);
      return;
    }
    setSrcDoc(null);
    loadDeckCover(src)
      .then((next) => {
        if (!cancelled) setSrcDoc(next);
      })
      .catch(() => {
        if (cancelled) return;
        setSrcDoc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const update = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setScale(Math.min(rect.width / DECK_PREVIEW_WIDTH, rect.height / DECK_PREVIEW_HEIGHT));
    };
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={frameRef}
      className="recent-projects__deck-frame"
      style={{ '--recent-deck-scale': scale } as CSSProperties}
      aria-hidden
    >
      {srcDoc ? (
        <iframe
          className="recent-projects__deck-iframe"
          srcDoc={srcDoc}
          title=""
          loading="lazy"
          sandbox=""
          tabIndex={-1}
        />
      ) : (
        <span className="recent-projects__deck-cover-loading" aria-hidden />
      )}
    </div>
  );
}

async function loadDeckCover(src: string): Promise<string> {
  const cached = deckCoverCache.get(src);
  if (cached) return cached;
  const existing = deckCoverInflight.get(src);
  if (existing) return existing;
  const run = fetch(src)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load project cover: ${res.status}`);
      return res.text();
    })
    .then((html) => {
      const parsed = deckPreviewSrcDoc(html);
      deckCoverCache.set(src, parsed);
      deckCoverInflight.delete(src);
      return parsed;
    })
    .catch((error) => {
      deckCoverInflight.delete(src);
      throw error;
    });
  deckCoverInflight.set(src, run);
  return run;
}

function deckPreviewSrcDoc(html: string): string {
  const withoutScripts = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, '');
  const style = `<style id="od-recent-deck-real-preview">
    html,
    body {
      margin: 0 !important;
      width: ${DECK_PREVIEW_WIDTH}px !important;
      height: ${DECK_PREVIEW_HEIGHT}px !important;
      overflow: hidden !important;
    }
    body {
      display: block !important;
      scroll-snap-type: none !important;
    }
    .slide,
    section[data-slide],
    section[data-screen-label] {
      position: absolute !important;
      inset: 0 !important;
      width: ${DECK_PREVIEW_WIDTH}px !important;
      height: ${DECK_PREVIEW_HEIGHT}px !important;
      flex: none !important;
      scroll-snap-align: none !important;
    }
    .slide:not(:first-of-type),
    section[data-slide]:not(:first-of-type),
    section[data-screen-label]:not(:first-of-type),
    .deck-counter,
    .deck-controls,
    .deck-hint,
    .deck-page-controls,
    .deck-pager,
    .deck-progress,
    .deck-nav,
    .deck-navigation,
    .page-controls,
    .page-flip-controls,
    .page-nav,
    .page-navigation,
    .pagination-control,
    .pagination-controls,
    #deck-prev,
    #deck-next,
    #deck-cur,
    #deck-total,
    [data-deck-controls],
    [data-page-controls],
    [data-pagination],
    [aria-label="Previous slide"],
    [aria-label="Next slide"],
    [aria-label="Deck navigation"],
    [aria-label="Page navigation"],
    [aria-label="Pagination"],
    nav[aria-label*="page" i],
    nav[aria-label*="pagination" i] {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
  </style>`;
  return injectBefore(withoutScripts, '</head>', style);
}

function injectBefore(source: string, marker: string, addition: string): string {
  const index = source.toLowerCase().lastIndexOf(marker);
  if (index === -1) return `${addition}${source}`;
  return `${source.slice(0, index)}${addition}${source.slice(index)}`;
}

function statusLabel(
  status: ProjectDisplayStatus,
  t: ReturnType<typeof useT>,
): string {
  return t(STATUS_LABEL_KEYS[status]);
}

function relativeTime(ts: number, t: ReturnType<typeof useT>): string {
  const diff = Date.now() - ts;
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return t('common.justNow');
  if (diff < hr) return t('common.minutesAgo', { n: Math.floor(diff / min) });
  if (diff < day) return t('common.hoursAgo', { n: Math.floor(diff / hr) });
  if (diff < 7 * day) return t('common.daysAgo', { n: Math.floor(diff / day) });
  return new Date(ts).toLocaleDateString();
}

function projectCover(
  project: Project,
  override: { kind: 'html' | 'image' | 'video' | 'logo'; name: string } | null,
): {
  kind: 'image' | 'video' | 'html' | 'logo' | 'fallback';
  src?: string;
  style: CSSProperties;
  initial: string;
} {
  let h = 0;
  for (let i = 0; i < project.id.length; i += 1) {
    h = (h * 31 + project.id.charCodeAt(i)) >>> 0;
  }
  const hue = h % 360;
  const hue2 = (hue + 38) % 360;
  const style: CSSProperties = {
    background: `radial-gradient(circle at 30% 28%, hsl(${hue} 70% 78% / 0.55), transparent 42%), linear-gradient(135deg, hsl(${hue} 65% 88%), hsl(${hue2} 70% 90%))`,
  };
  const trimmed = project.name.trim();
  const initial = (trimmed ? Array.from(trimmed)[0]! : '?').toUpperCase();
  if (override) {
    return {
      kind: override.kind,
      src: projectFileUrl(project.id, override.name),
      style,
      initial,
    };
  }
  const meta = project.metadata;
  const entry = meta?.entryFile;
  if (entry) {
    const src = projectFileUrl(project.id, entry);
    if (meta?.kind === 'image') return { kind: 'image', src, style, initial };
    if (meta?.kind === 'video') return { kind: 'video', src, style, initial };
    if (/\.html?$/i.test(entry)) return { kind: 'html', src, style, initial };
  }
  return { kind: 'fallback', style, initial };
}

type ProjectCategory = 'prototype' | 'live-artifact' | 'slide' | 'media' | 'brand';

function projectCategory(project: Project): ProjectCategory {
  const meta = project.metadata;
  if (meta?.intent === 'live-artifact' || project.skillId === 'live-artifact') {
    return 'live-artifact';
  }
  if (meta?.kind === 'deck') return 'slide';
  if (meta?.kind === 'brand') return 'brand';
  if (meta?.kind === 'image' || meta?.kind === 'video' || meta?.kind === 'audio') {
    return 'media';
  }
  return 'prototype';
}

function ProjectTag({ category }: { category: ProjectCategory }) {
  const t = useT();
  const label =
    category === 'live-artifact'
      ? t('designs.tagLiveArtifact')
      : category === 'slide'
        ? t('designs.tagSlide')
        : category === 'brand'
          ? 'Brand'
        : category === 'media'
          ? t('designs.tagMedia')
          : t('designs.tagPrototype');
  return <span className={`design-card-tag tag-${category}`}>{label}</span>;
}

function DesignSystemProjectTag() {
  return <span className="design-card-tag tag-design-system">Design System</span>;
}

function findDesignSystemLogoFile(files: ProjectFile[]): ProjectFile | null {
  const logoCandidates = files
    .filter((file) => file.type !== 'dir')
    .filter((file) => {
      const name = file.path ?? file.name;
      return file.kind === 'image' || /\.(svg|png|jpe?g|webp|gif)$/iu.test(name);
    });
  return (
    logoCandidates.find((file) => (file.path ?? file.name).toLowerCase() === 'assets/logo.svg') ??
    logoCandidates.find((file) => /(^|\/)(logo|wordmark|brand-mark|brandmark|mark|icon|favicon)[^/]*\.(svg|png|jpe?g|webp|gif)$/iu.test(file.path ?? file.name)) ??
    null
  );
}

async function findDesignSystemCover(
  projectId: string,
  files: ProjectFile[],
): Promise<{ kind: 'image' | 'logo'; name: string } | null> {
  const knownFiles = new Set(files.map((file) => file.path ?? file.name));
  const brandCover = await designSystemCoverFromBrandJson(projectId, knownFiles);
  if (brandCover) return brandCover;

  const logo = findDesignSystemLogoFile(files);
  if (!logo) return null;
  return { kind: 'logo', name: logo.path ?? logo.name };
}

async function designSystemCoverFromBrandJson(
  projectId: string,
  knownFiles: ReadonlySet<string>,
): Promise<{ kind: 'image' | 'logo'; name: string } | null> {
  const raw = await fetchProjectFileText(projectId, 'brand.json', { cache: 'no-store' });
  if (!raw) return null;
  let brand: unknown;
  try {
    brand = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!brand || typeof brand !== 'object') return null;
  const root = brand as Record<string, unknown>;
  const imagery = root.imagery && typeof root.imagery === 'object'
    ? root.imagery as Record<string, unknown>
    : null;
  const samples = Array.isArray(imagery?.samples) ? imagery.samples : [];
  const samplePaths = samples
    .filter((sample): sample is Record<string, unknown> => Boolean(sample && typeof sample === 'object'))
    .sort((a, b) => imageSampleRank(a.kind) - imageSampleRank(b.kind))
    .map((sample) => typeof sample.file === 'string' ? sample.file : null)
    .filter((file): file is string => Boolean(file));
  const image = samplePaths.find((file) => knownFiles.has(file) && isRasterOrSvgImage(file));
  if (image) return { kind: 'image', name: image };

  const logo = root.logo && typeof root.logo === 'object' ? root.logo as Record<string, unknown> : null;
  const alternates = Array.isArray(logo?.alternates) ? logo.alternates : [];
  const logoCandidates = [
    typeof logo?.primary === 'string' ? logo.primary : null,
    ...alternates,
  ];
  const nonFaviconLogo = logoCandidates.find(
    (candidate): candidate is string =>
      typeof candidate === 'string' &&
      knownFiles.has(candidate) &&
      isRasterOrSvgImage(candidate) &&
      !/(^|\/)favicon[-.]/iu.test(candidate),
  );
  if (nonFaviconLogo) return { kind: 'logo', name: nonFaviconLogo };
  if (typeof logo?.primary === 'string' && knownFiles.has(logo.primary) && isRasterOrSvgImage(logo.primary)) {
    return { kind: 'logo', name: logo.primary };
  }
  return null;
}

function imageSampleRank(kind: unknown): number {
  if (kind === 'cover') return 0;
  if (kind === 'hero') return 1;
  return 2;
}

function isRasterOrSvgImage(path: string): boolean {
  return /\.(svg|png|jpe?g|webp|gif)$/iu.test(path);
}
