/**
 * 左侧固定侧边栏 240px：品牌 + 10 个导航项 + 交付进度。
 */

import { APP_NAME, APP_TAGLINE, NAV_ITEMS, navBlockLabel } from '../../shared/constants';
import type { PageKey } from '../../shared/constants';
import { Icon } from './Icons';

export interface SidebarProps {
  activePage: PageKey;
  onNavigate: (page: PageKey) => void;
}

export function Sidebar({ activePage, onNavigate }: SidebarProps): JSX.Element {
  return (
    <aside className="hx-sidebar">
      <div className="hx-brand">
        <div className="hx-brand-name">
          <b>{APP_NAME}</b> <span className="hx-brand-sep">//</span>
        </div>
        <div className="hx-brand-title">{APP_TAGLINE}</div>
      </div>

      <nav className="hx-nav" aria-label="主导航">
        {NAV_ITEMS.map((item) => {
          const active = item.key === activePage;
          return (
            <button
              key={item.key}
              type="button"
              className={`hx-nav-item${active ? ' active' : ''}`}
              onClick={() => onNavigate(item.key)}
              title={`${item.label} · ${item.desc}${
                item.implemented ? '' : `（${navBlockLabel(item.block)}）`
              }`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon name={item.icon} size={16} />
              <span className="hx-nav-label">{item.label}</span>
              {item.implemented ? null : <span className="hx-badge hx-badge-todo">待建</span>}
            </button>
          );
        })}
      </nav>

      <div className="hx-sidebar-foot">
        <div>11 / 11 页 · 全部可用</div>
        <div style={{ color: 'var(--line2)' }}>记录 / 矩阵 / 图谱 / 建议 / 报告</div>
      </div>
    </aside>
  );
}
