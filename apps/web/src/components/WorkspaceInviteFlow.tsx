import { useState } from 'react';
import { Button, Input } from '@open-design/components';
import { Icon } from './Icon';
import type { DemoScenario } from './DemoControlBar';

type InviteStage = 'invitation' | 'auth' | 'joining' | 'success';
type LocalLaunchState = 'idle' | 'opening' | 'download' | 'downloaded';

const INVITE_ROLES: Record<
  Extract<DemoScenario, 'invite-editor'>,
  { label: string; description: string }
> = {
  'invite-editor': {
    label: 'Editor',
    description: '可创建、编辑和共享团队项目',
  },
};

const styles = {
  activeStatus: 'workspace-invite-activeStatus',
  ambient: 'workspace-invite-ambient',
  back: 'workspace-invite-back',
  brand: 'workspace-invite-brand',
  brandMark: 'workspace-invite-brandMark',
  card: 'workspace-invite-card',
  divider: 'workspace-invite-divider',
  downloadButton: 'workspace-invite-downloadButton',
  downloadIcon: 'workspace-invite-downloadIcon',
  downloadPrompt: 'workspace-invite-downloadPrompt',
  emailAction: 'workspace-invite-emailAction',
  eyebrow: 'workspace-invite-eyebrow',
  form: 'workspace-invite-form',
  googleMark: 'workspace-invite-googleMark',
  heading: 'workspace-invite-heading',
  inviterAvatar: 'workspace-invite-inviterAvatar',
  inviterBadge: 'workspace-invite-inviterBadge',
  joining: 'workspace-invite-joining',
  joiningSpinner: 'workspace-invite-joiningSpinner',
  joiningTrack: 'workspace-invite-joiningTrack',
  launching: 'workspace-invite-launching',
  page: 'workspace-invite-page',
  pendingHint: 'workspace-invite-pendingHint',
  primaryAction: 'workspace-invite-primaryAction',
  result: 'workspace-invite-result',
  resultIcon: 'workspace-invite-resultIcon',
  resultIconSuccess: 'workspace-invite-resultIconSuccess',
  retryButton: 'workspace-invite-retryButton',
  seatReceipt: 'workspace-invite-seatReceipt',
  securityNote: 'workspace-invite-securityNote',
  shell: 'workspace-invite-shell',
  socialAuth: 'workspace-invite-socialAuth',
  socialButton: 'workspace-invite-socialButton',
  summary: 'workspace-invite-summary',
  summaryIcon: 'workspace-invite-summaryIcon',
  workspaceIdentity: 'workspace-invite-workspaceIdentity',
  workspaceMark: 'workspace-invite-workspaceMark',
} as const;

interface Props {
  scenario: Extract<DemoScenario, 'invite-editor'>;
  onStartCollaborating: () => void;
}

export function WorkspaceInviteFlow({ scenario, onStartCollaborating }: Props) {
  const [stage, setStage] = useState<InviteStage>('invitation');
  const [emailLoginOpen, setEmailLoginOpen] = useState(false);
  const [email, setEmail] = useState('you@example.com');
  const [password, setPassword] = useState('');
  const [localLaunchState, setLocalLaunchState] = useState<LocalLaunchState>('idle');
  const role = INVITE_ROLES[scenario];

  function completeWebSignIn() {
    setStage('joining');
    window.setTimeout(() => setStage('success'), 720);
  }

  function tryOpenLocalWorkspace() {
    setLocalLaunchState('opening');
    window.setTimeout(() => setLocalLaunchState('download'), 1100);
  }

  return (
    <section className={styles.page} aria-label="Workspace 邀请 Web 流程">
      <div className={styles.ambient} aria-hidden>
        <span />
        <span />
        <span />
      </div>

      <div className={styles.shell}>
        <header className={styles.brand}>
          <span className={styles.brandMark}>OD</span>
          <span>Open Design Web</span>
        </header>

        <div className={styles.card}>
          <div className={styles.workspaceIdentity}>
            <div className={styles.workspaceMark}>N</div>
            <div className={styles.inviterAvatar}>
              <img src="/team-avatars/a1.png" alt="" aria-hidden />
              <span className={styles.inviterBadge}>
                <Icon name="send" size={11} />
              </span>
            </div>
          </div>

          {stage === 'invitation' ? (
            <>
              <div className={styles.heading}>
                <span className={styles.eyebrow}>Workspace invitation</span>
                <h1>张伟邀请你加入 Nexu 团队</h1>
                <p>接受后将在浏览器中完成账号登录，并自动加入该 Workspace。</p>
              </div>

              <InviteSummary role={role} />

              <Button
                variant="primary"
                className={styles.primaryAction}
                onClick={() => setStage('auth')}
              >
                在 Web 端接受邀请
                <Icon name="external-link" size={15} />
              </Button>
              <p className={styles.pendingHint}>邀请有效期为 7 天 · 接受前不会占用团队席位</p>
            </>
          ) : null}

          {stage === 'auth' ? (
            <>
              <button
                type="button"
                className={styles.back}
                onClick={() => setStage('invitation')}
              >
                <Icon name="arrow-left" size={14} />
                返回邀请
              </button>
              <div className={styles.heading}>
                <span className={styles.eyebrow}>Continue on the web</span>
                <h1>登录以加入 Nexu 团队</h1>
                <p>登录即表示继续接受邀请。完成后将直接加入，无需再次确认。</p>
              </div>

              <div className={styles.socialAuth}>
                <button type="button" className={styles.socialButton} onClick={completeWebSignIn}>
                  <span className={styles.googleMark}>G</span>
                  使用 Google 继续
                </button>
                <button type="button" className={styles.socialButton} onClick={completeWebSignIn}>
                  <Icon name="github-filled" size={19} />
                  使用 GitHub 继续
                </button>
              </div>

              <div className={styles.divider}>
                <span>或使用邮箱</span>
              </div>

              {emailLoginOpen ? (
                <form
                  className={styles.form}
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!email.trim() || !password.trim()) return;
                    completeWebSignIn();
                  }}
                >
                  <label>
                    <span>邮箱</span>
                    <Input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      autoFocus
                    />
                  </label>
                  <label>
                    <span>密码</span>
                    <Input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="输入密码"
                      autoComplete="current-password"
                    />
                  </label>
                  <Button
                    type="submit"
                    variant="primary"
                    className={styles.primaryAction}
                    disabled={!email.trim() || !password.trim()}
                  >
                    继续并加入 Workspace
                    <Icon name="chevron-right" size={15} />
                  </Button>
                </form>
              ) : (
                <Button
                  variant="ghost"
                  className={styles.emailAction}
                  onClick={() => setEmailLoginOpen(true)}
                >
                  <Icon name="link" size={15} />
                  使用邮箱登录
                </Button>
              )}

              <p className={styles.pendingHint}>
                没有账号？使用 Google、GitHub 或邮箱继续时会自动完成注册。
              </p>
            </>
          ) : null}

          {stage === 'joining' ? (
            <div className={styles.joining} role="status" aria-live="polite">
              <span className={styles.joiningSpinner}>
                <Icon name="spinner" size={25} />
              </span>
              <span className={styles.eyebrow}>Account verified</span>
              <h1>正在加入 Nexu 团队</h1>
              <p>正在应用 {role.label} 权限并占用 1 个团队席位…</p>
              <div className={styles.joiningTrack}>
                <span />
              </div>
            </div>
          ) : null}

          {stage === 'success' ? (
            <div className={styles.result}>
              <span className={`${styles.resultIcon} ${styles.resultIconSuccess}`}>
                <Icon name="check" size={28} />
              </span>
              <span className={styles.eyebrow}>Workspace ready</span>
              <h1>开始协作</h1>
              <p>你已加入 Nexu 团队。接下来将在本地 Open Design 中打开这个 Workspace。</p>

              <div className={styles.seatReceipt}>
                <span>
                  <small>角色</small>
                  <strong>{role.label}</strong>
                </span>
                <span>
                  <small>席位</small>
                  <strong>2 / 3 已用</strong>
                </span>
                <span>
                  <small>状态</small>
                  <strong className={styles.activeStatus}>已加入</strong>
                </span>
              </div>

              {localLaunchState === 'idle' ? (
                <Button
                  variant="primary"
                  className={styles.primaryAction}
                  onClick={tryOpenLocalWorkspace}
                >
                  开始协作
                  <Icon name="external-link" size={15} />
                </Button>
              ) : null}

              {localLaunchState === 'opening' ? (
                <div className={styles.launching} role="status">
                  <Icon name="spinner" size={17} />
                  正在尝试打开本地 Open Design…
                </div>
              ) : null}

              {localLaunchState === 'download' || localLaunchState === 'downloaded' ? (
                <div className={styles.downloadPrompt}>
                  <span className={styles.downloadIcon}>
                    <Icon name="download" size={21} />
                  </span>
                  <div>
                    <strong>没有自动打开？</strong>
                    <p>你的设备可能还没有安装 Open Design。安装后会自动回到 Nexu Workspace。</p>
                  </div>
                  <Button
                    variant="primary"
                    className={styles.downloadButton}
                    onClick={() => setLocalLaunchState('downloaded')}
                  >
                    {localLaunchState === 'downloaded' ? '下载已开始（Demo）' : '下载 Open Design'}
                  </Button>
                  <button
                    type="button"
                    className={styles.retryButton}
                    onClick={() => {
                      setLocalLaunchState('idle');
                      onStartCollaborating();
                    }}
                  >
                    已安装？再次尝试打开
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <p className={styles.securityNote}>
          <Icon name="info" size={13} />
          登录、加入和客户端唤起均在 Web 端完成
        </p>
      </div>
    </section>
  );
}

function InviteSummary({ role }: { role: { label: string; description: string } }) {
  return (
    <div className={styles.summary}>
      <div>
        <span className={styles.summaryIcon}>
          <Icon name="layers-filled" size={17} />
        </span>
        <span>
          <small>Workspace</small>
          <strong>Nexu 团队</strong>
        </span>
      </div>
      <div>
        <span className={styles.summaryIcon}>
          <Icon name="share" size={17} />
        </span>
        <span>
          <small>邀请角色</small>
          <strong>{role.label}</strong>
          <em>{role.description}</em>
        </span>
      </div>
    </div>
  );
}
