/**
 * 「本轮完成」11 项清单：进度条 + 勾选项 + 标记完成。
 *
 * 文案严格照 PROMPT 3.7 原文（CHECKLIST_ITEMS 里维护），这里不改写。
 * `covered` 由服务端根据这 11 项是否全 true 计算，前端只展示。
 */

import { CHECKLIST_ITEMS } from '../../../shared/constants';
import type { AssetChecklist } from '../../../shared/types';
import { Icon } from '../../components/Icons';
import { checklistDone, checklistProgress } from './assetForm';

export interface ChecklistPanelProps {
  checklist: AssetChecklist;
  onChange: (next: AssetChecklist) => void;
  onMarkComplete: () => void;
}

export function ChecklistPanel({
  checklist,
  onChange,
  onMarkComplete,
}: ChecklistPanelProps): JSX.Element {
  const done = checklistDone(checklist);
  const total = CHECKLIST_ITEMS.length;
  const percent = checklistProgress(checklist);
  const complete = done === total;

  return (
    <div>
      <div className="hx-progress-row">
        <div className="hx-progress">
          <div
            className={`hx-progress-bar${complete ? ' done' : ''}`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="hx-mono hx-progress-text">
          {done}/{total}
        </span>
        <span className="hx-spacer" />
        <button
          type="button"
          className={`hx-btn hx-btn-sm${complete ? ' hx-btn-primary' : ''}`}
          onClick={onMarkComplete}
        >
          <Icon name={complete ? 'check' : 'alert'} size={12} />
          标记完成
        </button>
      </div>

      <div className="hx-checklist">
        {CHECKLIST_ITEMS.map((item, index) => (
          <label key={item.key} className="hx-checklist-item">
            <input
              type="checkbox"
              checked={checklist[item.key]}
              onChange={(event) =>
                onChange({ ...checklist, [item.key]: event.target.checked })
              }
            />
            <span className="hx-checklist-index hx-mono">{String(index + 1).padStart(2, '0')}</span>
            <span className={checklist[item.key] ? 'hx-checklist-text done' : 'hx-checklist-text'}>
              {item.label}
            </span>
          </label>
        ))}
      </div>

      <div className="hx-hint" style={{ marginTop: 10 }}>
        11 项全勾保存后，服务端会把 `covered` 置为 true 并记录完成时间；取消任一项会立即变回未覆盖。
      </div>
    </div>
  );
}
