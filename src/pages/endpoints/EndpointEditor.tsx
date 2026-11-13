/**
 * 接口编辑抽屉（右侧 760px）。
 *
 * 只做记录，不对目标发请求；保存时把 diffSurface 按回包特征硬规则重算：
 * - 仅登录码 → false（同闸，四件套 N/A）
 * - 空列表 / 报错500 / 超时 → true（有差分面，必须测）
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  ACCESS_STATES,
  ENDPOINT_SOURCES,
  HTTP_METHODS,
  PARAM_LOCATIONS,
  RESP_SIGNATURES,
} from '../../../shared/constants';
import type {
  AccessState,
  Asset,
  Endpoint,
  EndpointSource,
  Feature,
  HttpMethod,
  Param,
  ParamLocation,
  RespSignature,
} from '../../../shared/types';
import { Icon } from '../../components/Icons';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { api, toErrorText } from '../../lib/api';
import { ACCESS_BADGE, RESP_HINT, forcedDiffSurface } from './endpointUi';

export interface EndpointEditorProps {
  open: boolean;
  projectId: string;
  /** null = 新建 */
  endpoint: Endpoint | null;
  assets: Asset[];
  features: Feature[];
  defaultAssetId: string;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

interface Draft {
  assetId: string;
  featureId: string | null;
  method: HttpMethod;
  path: string;
  fullUrl: string;
  source: EndpointSource;
  params: Param[];
  accessState: AccessState;
  respSignature: RespSignature;
  diffSurface: boolean;
  keys: string;
  note: string;
}

function draftFrom(endpoint: Endpoint | null, defaultAssetId: string): Draft {
  if (!endpoint) {
    return {
      assetId: defaultAssetId,
      featureId: null,
      method: 'GET',
      path: '/',
      fullUrl: '',
      source: '字典',
      params: [],
      accessState: '未测试',
      respSignature: '静态HTML',
      diffSurface: false,
      keys: '',
      note: '',
    };
  }
  return {
    assetId: endpoint.assetId,
    featureId: endpoint.featureId,
    method: endpoint.method,
    path: endpoint.path,
    fullUrl: endpoint.fullUrl,
    source: endpoint.source,
    params: endpoint.params.map((item) => ({ ...item })),
    accessState: endpoint.accessState,
    respSignature: endpoint.respSignature,
    diffSurface: endpoint.diffSurface,
    keys: endpoint.keys.join('\n'),
    note: endpoint.note,
  };
}

function parseKeys(text: string): string[] {
  return text
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function EndpointEditor({
  open,
  projectId,
  endpoint,
  assets,
  features,
  defaultAssetId,
  onClose,
  onSaved,
}: EndpointEditorProps): JSX.Element | null {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(endpoint, defaultAssetId));
  const [initial, setInitial] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const next = draftFrom(endpoint, defaultAssetId);
    setDraft(next);
    setInitial(JSON.stringify(next));
    setError('');
    setConfirmClose(false);
  }, [open, endpoint, defaultAssetId]);

  const dirty = JSON.stringify(draft) !== initial;
  const hint = RESP_HINT[draft.respSignature];
  const forced = forcedDiffSurface(draft.respSignature);
  const assetFeatures = useMemo(
    () => features.filter((item) => item.assetId === draft.assetId),
    [features, draft.assetId],
  );

  const requestClose = useCallback((): void => {
    if (dirty) setConfirmClose(true);
    else onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, requestClose]);

  const setField = <K extends keyof Draft>(key: K, value: Draft[K]): void => {
    setDraft((current) => ({ ...current, [key]: value }));
    setError('');
  };

  const addParam = (): void => {
    setDraft((current) => ({
      ...current,
      params: [
        ...current.params,
        { name: '', in: 'query', type: 'string', isBusiness: false },
      ],
    }));
  };

  const updateParam = (index: number, patch: Partial<Param>): void => {
    setDraft((current) => ({
      ...current,
      params: current.params.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));
  };

  const removeParam = (index: number): void => {
    setDraft((current) => ({
      ...current,
      params: current.params.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const save = async (): Promise<void> => {
    if (!draft.path.trim()) {
      setError('path 不能为空');
      return;
    }
    if (!draft.assetId) {
      setError('必须选择所属资产');
      return;
    }
    const effectiveDiff = forced ?? draft.diffSurface;
    const payload = {
      assetId: draft.assetId,
      featureId: draft.featureId,
      method: draft.method,
      path: draft.path.trim(),
      fullUrl: draft.fullUrl.trim(),
      source: draft.source,
      params: draft.params
        .filter((item) => item.name.trim())
        .map((item) => ({ ...item, name: item.name.trim() })),
      accessState: draft.accessState,
      respSignature: draft.respSignature,
      diffSurface: effectiveDiff,
      keys: parseKeys(draft.keys),
      note: draft.note,
    };

    setSaving(true);
    try {
      if (endpoint) {
        await api.updateEndpoint(projectId, endpoint.id, payload);
        toast('success', `接口 ${payload.method} ${payload.path} 已更新`);
      } else {
        await api.createEndpoint(projectId, payload);
        toast('success', `接口 ${payload.method} ${payload.path} 已新增`);
      }
      await onSaved();
      setInitial(JSON.stringify(draft));
      onClose();
    } catch (err) {
      setError(toErrorText(err));
      toast('error', toErrorText(err));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="hx-drawer-overlay" onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}>
        <aside className="hx-drawer" role="dialog" aria-modal="true" aria-label="接口编辑">
          <div className="hx-drawer-head">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="hx-hint">接口清单 · 编辑</div>
              <div className="hx-drawer-title">
                {endpoint ? `${endpoint.method} ${endpoint.path}` : '新建接口'}
              </div>
            </div>
            <button type="button" className="hx-icon-btn" onClick={requestClose} title="关闭（Esc）" aria-label="关闭">
              <Icon name="close" size={14} />
            </button>
          </div>

          <div className="hx-drawer-body">
            {error ? <div className="hx-field-error" style={{ marginBottom: 10 }}>{error}</div> : null}

            <div className="hx-form-grid-2">
              <label className="hx-field">
                <span className="hx-label">所属资产 *</span>
                <select
                  className="hx-select"
                  value={draft.assetId}
                  onChange={(event) => setField('assetId', event.target.value)}
                >
                  {assets.length === 0 ? <option value="">（先建资产）</option> : null}
                  {assets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="hx-field">
                <span className="hx-label">METHOD *</span>
                <select
                  className="hx-select"
                  value={draft.method}
                  onChange={(event) => setField('method', event.target.value as HttpMethod)}
                >
                  {HTTP_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="hx-field">
              <span className="hx-label">path *</span>
              <input
                className="hx-input hx-mono"
                value={draft.path}
                placeholder="/api/order/detail?id=1"
                onChange={(event) => setField('path', event.target.value)}
              />
            </label>
            <label className="hx-field">
              <span className="hx-label">完整 URL（留空自动用资产 URL + path 拼）</span>
              <input
                className="hx-input hx-mono"
                value={draft.fullUrl}
                placeholder="https://example.com/api/order/detail?id=1"
                onChange={(event) => setField('fullUrl', event.target.value)}
              />
            </label>

            <div className="hx-form-grid-2">
              <label className="hx-field">
                <span className="hx-label">来源 *</span>
                <select
                  className="hx-select"
                  value={draft.source}
                  onChange={(event) => setField('source', event.target.value as EndpointSource)}
                >
                  {ENDPOINT_SOURCES.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>
              </label>
              <label className="hx-field">
                <span className="hx-label">功能点（默认关闭）</span>
                <select
                  className="hx-select"
                  value={draft.featureId ?? ''}
                  onChange={(event) => setField('featureId', event.target.value || null)}
                >
                  <option value="">直接挂在资产下</option>
                  {assetFeatures.map((feature) => (
                    <option key={feature.id} value={feature.id}>
                      {feature.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="hx-form-grid-2">
              <label className="hx-field">
                <span className="hx-label">可访问性 *</span>
                <select
                  className="hx-select"
                  value={draft.accessState}
                  onChange={(event) => setField('accessState', event.target.value as AccessState)}
                >
                  {ACCESS_STATES.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
                <span className={`hx-badge ${ACCESS_BADGE[draft.accessState]}`} style={{ marginTop: 4 }}>
                  {draft.accessState}
                </span>
              </label>
              <label className="hx-field">
                <span className="hx-label">回包特征 *</span>
                <select
                  className="hx-select"
                  value={draft.respSignature}
                  onChange={(event) => setField('respSignature', event.target.value as RespSignature)}
                >
                  {RESP_SIGNATURES.map((sig) => (
                    <option key={sig} value={sig}>
                      {sig}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div
              className={`hx-resp-hint ${hint.tone}`}
              title="方法论硬规则：仅登录码与空列表/500/超时不能混"
            >
              <Icon name={hint.tone === 'samegate' ? 'lock' : hint.tone === 'diff' ? 'alert' : 'arrowRight'} size={13} />
              <div>
                <div>{hint.text}</div>
                {forced !== null ? (
                  <div className="hx-hint">
                    「差分面」已按规则强制为 <b>{forced ? '有' : '无'}</b>，保存时以此为准。
                  </div>
                ) : (
                  <div className="hx-hint">该回包特征不强制，按参数与实测结果勾选差分面。</div>
                )}
              </div>
            </div>

            <label className="hx-check-row" style={{ marginTop: 8 }}>
              <input
                type="checkbox"
                checked={forced ?? draft.diffSurface}
                disabled={forced !== null}
                onChange={(event) => setField('diffSurface', event.target.checked)}
              />
              <span>有差分面（有 total / 条数 / 回显 / 会拉 URL 即为 true）</span>
            </label>

            <div className="hx-group" style={{ marginTop: 12 }}>
              <div className="hx-group-head" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong style={{ fontSize: 12 }}>参数（{draft.params.length}）</strong>
                <span className="hx-spacer" />
                <button type="button" className="hx-btn hx-btn-sm" onClick={addParam}>
                  <Icon name="plus" size={12} />
                  加一行
                </button>
              </div>
              {draft.params.length === 0 ? (
                <div className="hx-hint" style={{ padding: 8 }}>暂无参数。导入 / 手录时把 query / body / header / path 分开记。</div>
              ) : (
                <div className="hx-table-wrap">
                  <table className="hx-table hx-table-dense hx-param-table">
                    <thead>
                      <tr>
                        <th>name</th>
                        <th>in</th>
                        <th>type</th>
                        <th>业务字段</th>
                        <th aria-label="操作" />
                      </tr>
                    </thead>
                    <tbody>
                      {draft.params.map((param, index) => (
                        <tr key={`${index}-${param.name}`}>
                          <td>
                            <input
                              className="hx-input hx-input-sm hx-mono"
                              value={param.name}
                              placeholder="id"
                              onChange={(event) => updateParam(index, { name: event.target.value })}
                            />
                          </td>
                          <td>
                            <select
                              className="hx-select hx-select-sm"
                              value={param.in}
                              onChange={(event) =>
                                updateParam(index, { in: event.target.value as ParamLocation })
                              }
                            >
                              {PARAM_LOCATIONS.map((location) => (
                                <option key={location} value={location}>
                                  {location}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              className="hx-input hx-input-sm hx-mono"
                              value={param.type}
                              onChange={(event) => updateParam(index, { type: event.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              type="checkbox"
                              checked={param.isBusiness}
                              onChange={(event) =>
                                updateParam(index, { isBusiness: event.target.checked })
                              }
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="hx-icon-btn"
                              onClick={() => removeParam(index)}
                              title="删除参数"
                              aria-label={`删除参数 ${param.name || index + 1}`}
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

            <label className="hx-field" style={{ marginTop: 12 }}>
              <span className="hx-label">JS 里抄到的钥匙（一行一个 / 逗号分隔）</span>
              <textarea
                className="hx-textarea hx-mono"
                style={{ minHeight: 56 }}
                value={draft.keys}
                placeholder={'签名盐\nhardcoded-key\n演示账号'}
                onChange={(event) => setField('keys', event.target.value)}
              />
            </label>
            <label className="hx-field">
              <span className="hx-label">备注</span>
              <textarea
                className="hx-textarea"
                style={{ minHeight: 56 }}
                value={draft.note}
                placeholder="从哪看到的、为什么要测、有没有同闸嫌疑"
                onChange={(event) => setField('note', event.target.value)}
              />
            </label>
          </div>

          <div className="hx-drawer-foot">
            <span className="hx-hint">接口只做记录，程序不会向目标发任何请求。</span>
            <span className="hx-spacer" />
            <button type="button" className="hx-btn" onClick={requestClose} disabled={saving}>
              取消
            </button>
            <button
              type="button"
              className="hx-btn hx-btn-primary"
              onClick={() => void save()}
              disabled={saving || assets.length === 0}
            >
              {saving ? <Icon name="spinner" size={13} className="hx-spin" /> : null}
              保存
            </button>
          </div>
        </aside>
      </div>

      <Modal
        open={confirmClose}
        title="放弃未保存的改动？"
        subtitle="关闭抽屉会丢掉这次编辑的内容。"
        onClose={() => setConfirmClose(false)}
        maxWidth={420}
        footer={
          <>
            <button type="button" className="hx-btn" onClick={() => setConfirmClose(false)}>
              继续编辑
            </button>
            <button
              type="button"
              className="hx-btn hx-btn-danger"
              onClick={() => {
                setConfirmClose(false);
                onClose();
              }}
            >
              放弃改动
            </button>
          </>
        }
      >
        <div className="hx-hint">还没保存的接口改动不会被写入项目数据。</div>
      </Modal>
    </>
  );
}
