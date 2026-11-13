/**
 * 攻击面（只读）：由技术栈推导，按来源指纹分组展示。
 *
 * 数据口径与 `deriveFromFp` 完全一致：指纹命中库里的 attackSurface 才显示。
 */

import { useMemo } from 'react';

import { FP_CATEGORIES } from '../../../shared/constants';
import { fpLabel } from '../../../shared/fpDerive';
import type { AssetFingerprints, Fingerprint } from '../../../shared/types';
import { Icon } from '../../components/Icons';

export interface AttackSurfaceViewProps {
  fp: AssetFingerprints;
  library: Fingerprint[];
}

interface SurfaceGroup {
  id: string;
  name: string;
  items: string[];
}

export function AttackSurfaceView({ fp, library }: AttackSurfaceViewProps): JSX.Element {
  const groups = useMemo<SurfaceGroup[]>(() => {
    const byName = new Map<string, Fingerprint>();
    for (const item of library) byName.set(item.name, item);

    const out: SurfaceGroup[] = [];
    for (const { key } of FP_CATEGORIES) {
      for (const item of fp[key] ?? []) {
        const lib = byName.get(item.name);
        if (!lib || lib.attackSurface.length === 0) continue;
        out.push({ id: item.id, name: fpLabel(item), items: lib.attackSurface });
      }
    }
    return out;
  }, [fp, library]);

  if (groups.length === 0) {
    return (
      <div className="hx-empty" style={{ padding: '20px 16px' }}>
        <Icon name="spark" size={18} />
        <div style={{ color: 'var(--strong)' }}>填技术栈后自动生成</div>
        <div style={{ maxWidth: 460 }}>
          攻击面不是手填的：每加一条指纹，指纹库里对应的「推导出的攻击面」会自动追加到这里，
          同时进矩阵点亮对应列。
        </div>
      </div>
    );
  }

  return (
    <div className="hx-surface">
      <div className="hx-hint" style={{ marginBottom: 10 }}>
        只读：由指纹推导，不能手改。要加攻击面就去补技术栈。
      </div>
      {groups.map((group) => (
        <div key={group.id} className="hx-surface-group">
          <div className="hx-surface-head">
            <span className="hx-mono hx-surface-name">{group.name}</span>
            <span className="hx-hint">{group.items.length} 项</span>
          </div>
          <div className="hx-tag-cloud">
            {group.items.map((surface) => (
              <span key={surface} className="hx-tag">
                {surface}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
