/**
 * 可折叠分区（抽屉里的所有 group 共用）。
 *
 * 交互：点标题整行展开/收起；`badge` 用来显示「已填 N 条」「N 条」这类计数。
 */

import { useState } from 'react';
import type { ReactNode } from 'react';

import { Icon } from '../../components/Icons';

export interface CollapsibleSectionProps {
  title: string;
  /** 标题右侧的一句话说明 */
  hint?: string;
  /** 标题后的计数徽章，如「3 条」 */
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  hint,
  badge,
  defaultOpen = true,
  children,
}: CollapsibleSectionProps): JSX.Element {
  const [open, setOpen] = useState<boolean>(defaultOpen);

  return (
    <section className="hx-group">
      <button
        type="button"
        className="hx-group-head"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className={`hx-chevron${open ? ' open' : ''}`}>
          <Icon name="chevronDown" size={13} />
        </span>
        <span className="hx-group-title">{title}</span>
        {badge ? <span className="hx-badge">{badge}</span> : null}
        <span className="hx-spacer" />
        {hint ? <span className="hx-group-hint">{hint}</span> : null}
      </button>
      {open ? <div className="hx-group-body">{children}</div> : null}
    </section>
  );
}
