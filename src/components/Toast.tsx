/**
 * 全局 toast：`const toast = useToast(); toast('error', '…')`
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import type { IconName } from '../../shared/constants';
import { Icon } from './Icons';

export type ToastKind = 'success' | 'error' | 'info';

export type PushToast = (kind: ToastKind, text: string) => void;

interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}

const KIND_ICON: Record<ToastKind, IconName> = {
  success: 'check',
  error: 'alert',
  info: 'spark',
};

const AUTO_DISMISS_MS = 3600;

const ToastContext = createContext<PushToast>(() => {
  // 没有 Provider 时（理论上不会发生）静默丢弃，不抛错影响页面
});

export function useToast(): PushToast {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const push = useCallback<PushToast>((kind, text) => {
    seq.current += 1;
    const id = seq.current;
    setItems((prev) => [...prev, { id, kind, text }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((item) => item.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  const value = useMemo<PushToast>(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="hx-toasts">
        {items.map((item) => (
          <div
            key={item.id}
            className={`hx-toast hx-toast-${item.kind} hx-fade-in`}
            role="status"
            aria-live="polite"
          >
            <span style={{ marginTop: 1, color: 'var(--dim)' }}>
              <Icon name={KIND_ICON[item.kind]} size={14} />
            </span>
            <span>{item.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
