// Reusable "invite teammates" dialog for the team workspace.
//
// Opened from the team dropdown in the left rail. Ported VERBATIM (markup +
// classes) from the design demo (origin/demo/workspace-team-features) — the
// Canva-style two-column layout: form on the left, decorative avatar-cluster art
// on the right. The ONLY difference from the demo is the submit: instead of the
// demo's no-backend `onSubmit` stub, "确认并邀请" POSTs the collected
// { email, role } rows to the real daemon endpoint (`POST /api/workspace/invite`),
// which creates each invite on B with the signed-in vela session. On success the
// dialog shows a brief success state and closes; on failure it surfaces an inline
// error and stays open. The UI never blocks on the backend being present.

import { useEffect, useState } from 'react';
import type { WorkspaceInviteRole } from '@open-design/contracts';
import { Icon } from './Icon';

export interface InviteRow {
  email: string;
  role: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Shows "你的团队有 1人" for single-seat plans (vs the team default). */
  freePlan?: boolean;
  /** Called with the entered rows when "确认并邀请" is pressed. The host
   *  decides whether to send invites directly or route through upgrade. */
  onSubmit?: (rows: InviteRow[]) => void;
  /** Owner / Admin can choose roles; Member invites with the default role. */
  canAssignRoles?: boolean;
}

// Default invited role, aligned to the PRD matrix (管理员/成员 are assignable;
// 所有者 is the workspace creator only and never assignable).
const DEFAULT_ROLE = '成员';

// Map the dialog's Chinese role labels to the canonical assignable role B
// expects (never 'owner'). An unknown label falls back to 'member'.
function toCanonicalRole(role: string): WorkspaceInviteRole {
  return role === '管理员' ? 'admin' : 'member';
}

export function InviteDialog({ open, onClose, freePlan = false, onSubmit, canAssignRoles = true }: Props) {
  const [rows, setRows] = useState<InviteRow[]>([{ email: '', role: DEFAULT_ROLE }]);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || canAssignRoles) return;
    setRows((prev) => prev.map((row) => ({ ...row, role: DEFAULT_ROLE })));
  }, [canAssignRoles, open]);

  // Reset the submit lifecycle each time the dialog opens so a prior error /
  // success never lingers on the next invite.
  useEffect(() => {
    if (!open) return;
    setSubmitting(false);
    setSuccess(false);
    setError(null);
  }, [open]);

  if (!open) return null;

  function updateRow(index: number, patch: Partial<InviteRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, { email: '', role: DEFAULT_ROLE }]);
  }
  function removeRow(index: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  // Demo-grade email shape check (something@something.tld) — keeps obvious
  // non-emails from enabling submit; both the button state and the rows
  // passed to onSubmit use the same predicate.
  const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  const hasValidEmail = rows.some((r) => isEmail(r.email));

  async function handleConfirm() {
    const valid = rows.filter((r) => isEmail(r.email));
    if (valid.length === 0 || submitting || success) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/workspace/invite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          invites: valid.map((r) => ({ email: r.email.trim(), role: toCanonicalRole(r.role) })),
        }),
      });
      if (!res.ok) throw new Error('request_failed');
      const body = (await res.json().catch(() => null)) as
        | { results?: Array<{ ok?: boolean }> }
        | null;
      const results = body?.results ?? [];
      // Treat "every invite failed" as an overall failure; a partial success
      // still closes with the success state.
      if (results.length > 0 && results.every((r) => r.ok === false)) {
        throw new Error('all_failed');
      }
      setSuccess(true);
      onSubmit?.(valid);
      window.setTimeout(() => {
        onClose();
        setRows([{ email: '', role: DEFAULT_ROLE }]);
        setSuccess(false);
        setSubmitting(false);
      }, 1000);
    } catch {
      setError('邀请发送失败，请稍后重试。');
      setSubmitting(false);
    }
  }

  return (
    <div className="entry-invite" role="dialog" aria-modal="true" aria-label="邀请成员">
      <div className="entry-invite__backdrop" onClick={onClose} />
      <div className="entry-invite__panel entry-invite__panel--split">
        <button
          type="button"
          className="entry-invite__close"
          onClick={onClose}
          aria-label="关闭"
        >
          <Icon name="close" size={16} />
        </button>

        <div className="entry-invite__form">
          <h2 className="entry-invite__title">邀请成员加入你的团队</h2>
          <p className="entry-invite__teamsize">
            {freePlan
              ? '免费版含 1 个席位，邀请同事后将引导你升级到团队版。'
              : '邀请同事加入团队，一起共享项目、设计系统与插件。'}
          </p>

          <div className="entry-invite__field-labels">
            <span className="entry-invite__label">通过电子邮件邀请成员</span>
            <span className="entry-invite__label entry-invite__label--role">
              {canAssignRoles ? '分配角色' : '默认身份'}
            </span>
          </div>
          <div className="entry-invite__rows">
            {rows.map((row, i) => (
              <div className="entry-invite__fields" key={i}>
                <input
                  className="entry-invite__input"
                  type="email"
                  placeholder="输入电子邮件地址……"
                  value={row.email}
                  onChange={(e) => updateRow(i, { email: e.target.value })}
                />
                <select
                  className="entry-invite__role"
                  value={canAssignRoles ? row.role : DEFAULT_ROLE}
                  onChange={(e) => updateRow(i, { role: e.target.value })}
                  disabled={!canAssignRoles}
                  aria-label={canAssignRoles ? '分配角色' : '默认身份'}
                >
                  <option value="管理员">管理员</option>
                  <option value="成员">成员</option>
                </select>
                {rows.length > 1 ? (
                  <button
                    type="button"
                    className="entry-invite__row-remove"
                    onClick={() => removeRow(i)}
                    aria-label="移除"
                  >
                    <Icon name="close" size={15} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <button type="button" className="entry-invite__add-row" onClick={addRow}>
            <Icon name="plus" size={14} /> 添加成员
          </button>

          <button
            type="button"
            className="entry-invite__collapse"
            onClick={() => setVisibilityOpen((v) => !v)}
            aria-expanded={visibilityOpen}
          >
            团队成员会看到我的设计吗?
            <Icon
              name="chevron-down"
              size={16}
              style={visibilityOpen ? { transform: 'rotate(180deg)' } : undefined}
            />
          </button>
          {visibilityOpen ? (
            <p className="entry-invite__collapse-body">
              团队成员可以看到你共享到团队空间的设计；保存在「草稿」中的私人设计不会对其他人可见。
            </p>
          ) : null}

          {error ? (
            <p className="entry-invite__collapse-body" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            className="entry-invite__submit"
            onClick={handleConfirm}
            disabled={!hasValidEmail || submitting || success}
          >
            {success ? '已发送邀请' : submitting ? '邀请中……' : '确认并邀请'}
          </button>
        </div>

        <div className="entry-invite__art" aria-hidden>
          <span className="entry-invite__art-glow" />
          <div className="entry-invite__art-cluster">
            <span className="entry-invite__art-avatar">
              <img src="/team-avatars/a2.png" alt="" />
            </span>
            <span className="entry-invite__art-avatar">
              <img src="/team-avatars/a1.png" alt="" />
            </span>
            <span className="entry-invite__art-avatar">
              <img src="/team-avatars/a4.png" alt="" />
            </span>
            <span className="entry-invite__art-avatar">
              <img src="/team-avatars/a6.png" alt="" />
            </span>
            <span className="entry-invite__art-avatar entry-invite__art-avatar--invite">
              <Icon name="plus" size={26} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
