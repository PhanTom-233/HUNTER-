/**
 * 未建页面的占位页：写清「哪一块交付」+「这一页将包含什么」+ 现在该去哪。
 * 不允许留空白页。
 */

import { navBlockLabel } from '../../shared/constants';
import type { NavItem } from '../../shared/constants';
import { Icon } from '../components/Icons';

export interface PlaceholderPageProps {
  item: NavItem;
  onBack: () => void;
}

export function PlaceholderPage({ item, onBack }: PlaceholderPageProps): JSX.Element {
  return (
    <div className="hx-content-inner">
      <div className="hx-crumb" style={{ marginBottom: 8 }}>
        第 1 块 · 空壳 / {item.label}
      </div>
      <div className="hx-row" style={{ marginBottom: 12 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 20,
            color: 'var(--strong)',
            fontWeight: 600,
            letterSpacing: '-0.01em',
          }}
        >
          {item.label}
        </h1>
        <span className="hx-badge hx-badge-todo">待建</span>
        <span className="hx-badge">{navBlockLabel(item.block)}</span>
      </div>

      <p className="hx-hint" style={{ maxWidth: 720, marginTop: 0 }}>
        {item.desc}。本轮（第 1 块）只交付了脚手架、JSON 存储层与项目 CRUD，
        这一页的业务还没接数据，所以先做成占位页 —— 但会把它要做的事写清楚，避免你点进来一片空白。
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 12, marginTop: 16 }}>
        <div className="hx-card">
          <h2 className="hx-card-title">
            <Icon name={item.icon} size={14} />
            本页将包含
          </h2>
          <ul className="hx-ul" style={{ margin: 0, paddingLeft: 16 }}>
            {item.bullets.map((bullet) => (
              <li key={bullet} style={{ marginBottom: 4 }}>
                {bullet}
              </li>
            ))}
          </ul>
        </div>

        <div className="hx-card">
          <h2 className="hx-card-title">
            <Icon name="arrowRight" size={14} />
            现在能做什么
          </h2>
          <div className="hx-hint" style={{ lineHeight: 1.9 }}>
            1. 去「总览」看当前项目的状态与已交付清单；
            <br />
            2. 在顶栏切换项目，或新建一个项目（新建后会自动切过去）；
            <br />
            3. 想验证落盘：关掉后端再启动，数据还在。
          </div>
          <div style={{ marginTop: 14 }}>
            <button type="button" className="hx-btn" onClick={onBack}>
              <Icon name="overview" size={13} />
              回到总览
            </button>
          </div>
        </div>
      </div>

      <div className="hx-card-flat" style={{ marginTop: 12 }}>
        <div className="hx-row">
          <Icon name="alert" size={14} />
          <span className="hx-hint">
            这一页不做假数据、不做假交互。等对应交付块落地后，这里会直接连到真实数据。
          </span>
        </div>
      </div>
    </div>
  );
}
