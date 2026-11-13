/**
 * 历史漏洞编辑：指纹自动带出 + 用户手动补。
 *
 * 状态（待验证 / 已验证 / 不适用）在这里改；同 id 的状态会被服务端保留，重算指纹时不会被打回。
 */

import { useState } from 'react';

import { VULN_REF_STATUSES, VULN_SEVERITIES, VULN_SOURCES } from '../../../shared/constants';
import type { VulnRef, VulnSeverity, VulnSource } from '../../../shared/types';
import { Icon } from '../../components/Icons';
import { manualVulnRef } from './assetForm';

export interface VulnRefEditorProps {
  refs: VulnRef[];
  onChange: (next: VulnRef[]) => void;
}

const SEVERITY_CLASS: Record<VulnSeverity, string> = {
  严重: 'hx-badge-red',
  高危: 'hx-badge-amber',
  中危: 'hx-badge-blue',
};

export function VulnRefEditor({ refs, onChange }: VulnRefEditorProps): JSX.Element {
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [source, setSource] = useState<VulnSource>('经验');
  const [identifier, setIdentifier] = useState('');
  const [affectedVersion, setAffectedVersion] = useState('');
  const [severity, setSeverity] = useState<VulnSeverity>('高危');
  const [verifyPath, setVerifyPath] = useState('');
  const [error, setError] = useState('');

  const updateStatus = (id: string, status: VulnRef['status']): void => {
    onChange(refs.map((ref) => (ref.id === id ? { ...ref, status } : ref)));
  };

  const remove = (id: string): void => {
    onChange(refs.filter((ref) => ref.id !== id));
  };

  const addManual = (): void => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('漏洞名称必填');
      return;
    }
    onChange([
      ...refs,
      manualVulnRef({ name: trimmed, source, identifier, affectedVersion, severity, verifyPath }),
    ]);
    setName('');
    setSource('经验');
    setIdentifier('');
    setAffectedVersion('');
    setSeverity('高危');
    setVerifyPath('');
    setError('');
    setFormOpen(false);
  };

  return (
    <div>
      <div className="hx-row" style={{ marginBottom: 10 }}>
        <span className="hx-hint">
          填技术栈会自动带出候选；这里只做记录，验证仍按矩阵四态走。
        </span>
        <span className="hx-spacer" />
        <button
          type="button"
          className="hx-btn hx-btn-sm"
          onClick={() => setFormOpen((value) => !value)}
        >
          <Icon name={formOpen ? 'close' : 'plus'} size={12} />
          {formOpen ? '收起' : '手动新增'}
        </button>
      </div>

      {formOpen ? (
        <div className="hx-card-flat" style={{ marginBottom: 12 }}>
          <div className="hx-form-grid-2">
            <label className="hx-field">
              <span className="hx-label">漏洞名称 *</span>
              <input
                className="hx-input"
                value={name}
                placeholder="如：某后台 SQL 注入"
                onChange={(event) => {
                  setName(event.target.value);
                  setError('');
                }}
              />
            </label>
            <label className="hx-field">
              <span className="hx-label">来源</span>
              <select
                className="hx-select"
                value={source}
                onChange={(event) => setSource(event.target.value as VulnSource)}
              >
                {VULN_SOURCES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="hx-field">
              <span className="hx-label">编号 / 通告号</span>
              <input
                className="hx-input"
                value={identifier}
                placeholder="CVE-2022-22947 / 经验"
                onChange={(event) => setIdentifier(event.target.value)}
              />
            </label>
            <label className="hx-field">
              <span className="hx-label">影响版本</span>
              <input
                className="hx-input"
                value={affectedVersion}
                placeholder="如 2.3.4 及以下"
                onChange={(event) => setAffectedVersion(event.target.value)}
              />
            </label>
            <label className="hx-field">
              <span className="hx-label">等级</span>
              <select
                className="hx-select"
                value={severity}
                onChange={(event) => setSeverity(event.target.value as VulnSeverity)}
              >
                {VULN_SEVERITIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="hx-field">
              <span className="hx-label">验证方向</span>
              <input
                className="hx-input"
                value={verifyPath}
                placeholder="打哪个 path / 什么现象算成功"
                onChange={(event) => setVerifyPath(event.target.value)}
              />
            </label>
          </div>
          {error ? <div className="hx-field-error">{error}</div> : null}
          <div className="hx-row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="hx-btn hx-btn-sm" onClick={() => setFormOpen(false)}>
              取消
            </button>
            <button type="button" className="hx-btn hx-btn-sm hx-btn-primary" onClick={addManual}>
              <Icon name="check" size={12} />
              加进清单
            </button>
          </div>
        </div>
      ) : null}

      {refs.length === 0 ? (
        <div className="hx-empty" style={{ padding: '20px 16px' }}>
          <Icon name="alert" size={18} />
          <div style={{ color: 'var(--strong)' }}>还没有历史漏洞</div>
          <div style={{ maxWidth: 460 }}>
            两个来源：① 上面填技术栈，指纹库里有 knownVulns 的会自动带出；② 你知道这个版本的洞，点「手动新增」补一条。
          </div>
        </div>
      ) : (
        <div className="hx-table-wrap">
          <table className="hx-table hx-table-dense hx-table-vuln">
            <colgroup>
              <col style={{ width: '34%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: 54 }} />
              <col style={{ width: '17%' }} />
              <col style={{ width: 82 }} />
              <col style={{ width: 30 }} />
            </colgroup>
            <thead>
              <tr>
                <th>名称</th>
                <th>来源 / 编号</th>
                <th>影响版本</th>
                <th>等级</th>
                <th>验证方向</th>
                <th>状态</th>
                <th aria-label="操作" />
              </tr>
            </thead>
            <tbody>
              {refs.map((ref) => (
                <tr key={ref.id}>
                  <td>
                    <div style={{ color: 'var(--strong)' }}>{ref.name}</div>
                    {ref.condition ? (
                      <div
                        className="hx-hint"
                        style={{ fontSize: 11 }}
                        title={ref.condition}
                      >
                        {ref.condition}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <div className="hx-mono" style={{ fontSize: 11 }}>
                      {ref.source}
                    </div>
                    <div className="hx-mono" style={{ fontSize: 11, color: 'var(--dim)' }}>
                      {ref.identifier || '—'}
                    </div>
                  </td>
                  <td>
                    <div
                      className="hx-cell-clip hx-mono"
                      style={{ fontSize: 11 }}
                      title={ref.affectedVersion || undefined}
                    >
                      {ref.affectedVersion || <span style={{ color: 'var(--dim)' }}>—</span>}
                    </div>
                  </td>
                  <td>
                    <span className={`hx-badge ${SEVERITY_CLASS[ref.severity]}`}>
                      {ref.severity}
                    </span>
                  </td>
                  <td>
                    <div className="hx-cell-clip" title={ref.verifyPath || '未填写验证方向'}>
                      {ref.verifyPath || <span style={{ color: 'var(--dim)' }}>—</span>}
                    </div>
                  </td>
                  <td>
                    <select
                      className="hx-select hx-select-sm"
                      value={ref.status}
                      onChange={(event) =>
                        updateStatus(ref.id, event.target.value as VulnRef['status'])
                      }
                    >
                      {VULN_REF_STATUSES.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="hx-icon-btn"
                      onClick={() => remove(ref.id)}
                      title="从清单里删掉这条"
                      aria-label={`删除 ${ref.name}`}
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
