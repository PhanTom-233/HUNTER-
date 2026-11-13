/**
 * 通用弹窗：Esc 关闭、点遮罩关闭、右侧关闭按钮。
 */

import { useEffect } from 'react';
import type { ReactNode } from 'react';

import { Icon } from './Icons';

export interface ModalProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** 默认 580px */
  maxWidth?: number;
  /** 提交中时禁止 Esc / 点遮罩关闭，避免半截数据 */
  locked?: boolean;
}

export function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  maxWidth = 580,
  locked = false,
}: ModalProps): JSX.Element | null {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !locked) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, locked, onClose]);

  if (!open) return null;

  return (
    <div
      className="hx-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !locked) onClose();
      }}
    >
      <div
        className="hx-modal hx-fade-in"
        style={{ maxWidth }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="hx-modal-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="hx-modal-title">{title}</h2>
            {subtitle ? <div className="hx-modal-sub">{subtitle}</div> : null}
          </div>
          <button
            type="button"
            className="hx-icon-btn"
            onClick={onClose}
            disabled={locked}
            title="关闭（Esc）"
            aria-label="关闭"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
        <div className="hx-modal-body">{children}</div>
        {footer ? <div className="hx-modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}
