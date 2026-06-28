// Credits popover — opened from the ✨ credits chip in the nav-rail account row.
//
// A standalone region (separate from the account dropdown). Shows the plan
// header with an upgrade CTA for free users, the remaining-credits breakdown,
// the daily-refresh allowance, and a usage link. Demo-only mock numbers.

import { Icon } from './Icon';

export interface CreditsInfo {
  /** Full plan name shown in the popover header (e.g. "标准版 Plus"). */
  planName: string;
  /** Short tier label shown on the chip (e.g. "免费" / "Plus" / "团队版"). */
  tierLabel: string;
  /** Any non-team tier shows the 升级 CTA → Pricing page. */
  showUpgrade: boolean;
  /** Remaining usable credits (top-line number). */
  balance: number;
  /** Tip text explaining the plan's credit grant. */
  grantTip: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  info: CreditsInfo;
  onUpgrade: () => void;
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

export function CreditsPanel({ open, onClose, info, onUpgrade }: Props) {
  if (!open) return null;

  return (
    <>
      <div className="entry-nav-rail__menu-backdrop" onClick={onClose} />
      <div className="credits-panel" role="menu">
        <div className="credits-panel__head">
          <span className="credits-panel__plan">{info.planName}</span>
          {info.showUpgrade ? (
            <button type="button" className="credits-panel__upgrade" onClick={onUpgrade}>
              升级
            </button>
          ) : null}
        </div>

        <div className="credits-panel__divider" />

        <div className="credits-panel__row credits-panel__row--total">
          <span className="credits-panel__row-label">
            <Icon name="sparkles" size={15} />
            剩余积分
            <span className="credits-panel__help" title={info.grantTip} aria-label={info.grantTip}>
              <Icon name="info" size={13} />
            </span>
          </span>
          <span className="credits-panel__row-value">{fmt(info.balance)}</span>
        </div>

        <button type="button" className="credits-panel__usage" onClick={onClose}>
          查看使用情况
          <Icon name="chevron-right" size={14} />
        </button>
      </div>
    </>
  );
}
