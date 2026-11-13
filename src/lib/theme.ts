/**
 * 深浅色主题：写 `data-theme` 属性 + 存 localStorage，不做任何网络请求。
 */

import { STORAGE_KEY_THEME } from '../../shared/constants';

export type Theme = 'dark' | 'light';

const DEFAULT_THEME: Theme = 'dark';

export function getStoredTheme(): Theme {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_THEME);
    if (raw === 'dark' || raw === 'light') return raw;
  } catch {
    // localStorage 不可用（隐私模式 / 被禁用）时退回默认暗色
  }
  return DEFAULT_THEME;
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function persistTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY_THEME, theme);
  } catch {
    // 存不了就算了，不影响当前会话
  }
}

export function setTheme(theme: Theme): void {
  applyTheme(theme);
  persistTheme(theme);
}

export function toggleTheme(current: Theme): Theme {
  const next: Theme = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

/** 应用启动时调用一次：把存下来的主题刷到 <html> 上 */
export function initTheme(): Theme {
  const theme = getStoredTheme();
  applyTheme(theme);
  return theme;
}
