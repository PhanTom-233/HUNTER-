/**
 * 资产编辑抽屉（右侧滑出 760px）。
 *
 * 七个分区：
 * 1. 基本信息（name* / url / host / ip / port / protocol / title / category / weight / ownership /
 *    aliveStatus / sameSkinGroup / riskNote）
 * 2. 说清这摊（brief 四问）
 * 3. 技术栈（16 栏，见 FingerprintEditor）
 * 4. 攻击面（只读，见 AttackSurfaceView）
 * 5. 历史漏洞（自动带出 + 手动补，见 VulnRefEditor）
 * 6. 本轮完成（11 项，见 ChecklistPanel）
 *
 * 交互约定：
 * - **不做自动保存**，底部固定「取消 / 保存」；Esc 或点遮罩关闭时若有改动先确认。
 * - 指纹改动后，攻击面与历史漏洞在前端先用 `deriveFromFp` 即时联动，保存后仍以服务端返回为准。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  ALIVE_STATUSES,
  ASSET_CATEGORY_KEYS,
  ASSET_NAME_MAX,
  CATEGORIES,
  CATEGORY_DESC,
  OWNERSHIPS,
} from '../../../shared/constants';
import { deriveFromFp, mergeVulnRefs, summarizeFp } from '../../../shared/fpDerive';
import type {
  Asset,
  AssetCategory,
  AssetFingerprints,
  AssetWeight,
  Fingerprint,
} from '../../../shared/types';
import { Icon } from '../../components/Icons';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { api, toErrorText } from '../../lib/api';
import { AttackSurfaceView } from './AttackSurfaceView';
import { ChecklistPanel } from './ChecklistPanel';
import { CollapsibleSection } from './Section';
import { FingerprintEditor } from './FingerprintEditor';
import { VulnRefEditor } from './VulnRefEditor';
import {
  checklistDone,
  draftFromAsset,
  hasDraftErrors,
  parseUrlParts,
  sameDraft,
  toCreateInput,
  unfinishedChecklist,
  validateDraft,
} from './assetForm';
import type { AssetDraft, DraftErrors } from './assetForm';

export interface AssetEditorProps {
  open: boolean;
  projectId: string;
  /** null = 新建 */
  asset: Asset | null;
  library: Fingerprint[];
  onClose: () => void;
  onSaved: (asset: Asset, isNew: boolean) => void;
}

const BRIEF_FIELDS: {
  key: keyof AssetDraft['brief'];
  label: string;
  placeholder: string;
}[] = [
  {
    key: 'user',
    label: '谁在用',
    placeholder: '例：门店店长、加盟商、外部消费者、内部运营',
  },
  {
    key: 'objects',
    label: '核心对象',
    placeholder: '例：订单、会员余额、优惠券、门店资料、结算单',
  },
  {
    key: 'money',
    label: '钱权状态落在哪',
    placeholder: '例：退款金额走财务审批，门店可改单价，优惠券由运营发放',
  },
  {
    key: 'preAuth',
    label: '没登录能碰到哪层',
    placeholder: '例：未登录只能看首页与商品列表，下单必须登录，后台整站 302',
  },
];

export function AssetEditor({
  open,
  projectId,
  asset,
  library,
  onClose,
  onSaved,
}: AssetEditorProps): JSX.Element | null {
  const toast = useToast();

  const initial = useMemo<AssetDraft>(() => draftFromAsset(asset), [asset]);
  const [draft, setDraft] = useState<AssetDraft>(initial);
  const [baseline, setBaseline] = useState<AssetDraft>(initial);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [unfinished, setUnfinished] = useState<string[] | null>(null);
  const [fpNotice, setFpNotice] = useState('');

  /* 打开 / 切换资产时重置草稿 */
  useEffect(() => {
    if (!open) return;
    setDraft(initial);
    setBaseline(initial);
    setErrors({});
    setFpNotice('');
    setUnfinished(null);
    setConfirmClose(false);
  }, [open, initial]);

  const dirty = !sameDraft(draft, baseline);

  const requestClose = useCallback((): void => {
    if (saving) return;
    if (!sameDraft(draft, baseline)) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }, [saving, draft, baseline, onClose]);

  /* Esc 关闭：有改动时先弹确认 */
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      requestClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, requestClose]);

  if (!open) return null;

  const patchDraft = (part: Partial<AssetDraft>): void => {
    setDraft((prev) => ({ ...prev, ...part }));
  };

  /** URL 变了就尝试解析 host / port / protocol（解析失败保留用户手填值） */
  const handleUrlChange = (value: string): void => {
    const parsed = parseUrlParts(value);
    setDraft((prev) => {
      if (!parsed) return { ...prev, url: value };
      return {
        ...prev,
        url: value,
        host: parsed.host,
        port: parsed.port,
        protocol: parsed.protocol,
      };
    });
  };

  const handleCategoryChange = (value: AssetCategory): void => {
    setDraft((prev) => ({
      ...prev,
      category: value,
      // 类别变了，肥瘦回到该类别默认值；用户随后仍可手动改
      weight: CATEGORIES[value].weight,
    }));
  };

  const handleWeightChange = (value: AssetWeight): void => {
    patchDraft({ weight: value });
  };

  /** 指纹 → 攻击面 / 历史漏洞即时联动（前端预览，保存后以服务端为准） */
  const handleFpChange = (nextFp: AssetFingerprints): void => {
    const derived = deriveFromFp(nextFp, library, draft.vulnRefs);
    const merged = mergeVulnRefs(derived.vulnRefs, draft.vulnRefs);
    setDraft((prev) => ({ ...prev, fp: nextFp, vulnRefs: merged }));
    setFpNotice(
      derived.vulnRefs.length > 0
        ? `已从指纹带出 ${derived.vulnRefs.length} 条历史漏洞（同 id 的状态保留）`
        : '当前技术栈没有预置历史漏洞',
    );
  };

  const handleMarkComplete = (): void => {
    const done = checklistDone(draft.checklist);
    const total = 11;
    if (done === total) {
      toast('info', '11 项已全勾，保存后 covered 自动置 true');
      return;
    }
    setUnfinished(unfinishedChecklist(draft.checklist));
  };

  const handleSave = async (): Promise<void> => {
    const nextErrors = validateDraft(draft);
    setErrors(nextErrors);
    if (hasDraftErrors(nextErrors)) {
      toast('error', '还有字段不合法，按红色提示改完再保存');
      return;
    }

    setSaving(true);
    try {
      const input = toCreateInput(draft);
      const saved = asset
        ? await api.updateAsset(projectId, asset.id, input)
        : await api.createAsset(projectId, input);
      toast('success', asset ? `资产「${saved.name}」已更新` : `资产「${saved.name}」已创建`);
      setSaving(false);
      onSaved(saved, !asset);
    } catch (error) {
      toast('error', toErrorText(error));
      setSaving(false);
    }
  };

  const fpSummary = summarizeFp(draft.fp);

  return (
    <div
      className="hx-drawer-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <aside className="hx-drawer hx-slide-in" role="dialog" aria-modal="true" aria-label="资产编辑">
        <header className="hx-drawer-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="hx-crumb">
              {asset ? `编辑资产 · ${asset.id}` : '新建资产'} · 项目 {projectId}
            </div>
            <h2 className="hx-drawer-title">
              {draft.name.trim() ? draft.name : asset ? asset.name : '未命名资产'}
            </h2>
            <div className="hx-hint" style={{ fontSize: 11 }}>
              {CATEGORIES[draft.category].label} ·{' '}
              {draft.weight === 'fat' ? '肥面' : '瘦壳'}
              {fpSummary ? ` · ${fpSummary}` : ''}
            </div>
          </div>
          <button
            type="button"
            className="hx-icon-btn"
            onClick={requestClose}
            disabled={saving}
            title="关闭（Esc）"
            aria-label="关闭"
          >
            <Icon name="close" size={14} />
          </button>
        </header>

        <div className="hx-drawer-body" key={asset?.id ?? 'new'}>
          {/* 1. 基本信息 ------------------------------------------------ */}
          <CollapsibleSection title="基本信息" hint="打 * 的必填" defaultOpen>
            <div className="hx-form-grid-2">
              <label className="hx-field" style={{ gridColumn: '1 / -1' }}>
                <span className="hx-label">资产名称 *</span>
                <input
                  className={`hx-input${errors.name ? ' hx-input-error' : ''}`}
                  value={draft.name}
                  maxLength={ASSET_NAME_MAX}
                  placeholder="如：XX商城后台 / 订单中心 API"
                  onChange={(event) => {
                    patchDraft({ name: event.target.value });
                    setErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                />
                {errors.name ? <div className="hx-field-error">{errors.name}</div> : null}
              </label>

              <label className="hx-field">
                <span className="hx-label">类别</span>
                <select
                  className="hx-select"
                  value={draft.category}
                  onChange={(event) => handleCategoryChange(event.target.value as AssetCategory)}
                >
                  {ASSET_CATEGORY_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {CATEGORIES[key].label}
                    </option>
                  ))}
                </select>
                <div className="hx-hint" style={{ marginTop: 5, fontSize: 11 }}>
                  {CATEGORY_DESC[draft.category]}
                </div>
              </label>

              <label className="hx-field">
                <span className="hx-label">肥瘦</span>
                <select
                  className="hx-select"
                  value={draft.weight}
                  onChange={(event) => handleWeightChange(event.target.value as AssetWeight)}
                >
                  <option value="fat">肥面（展开进站七步）</option>
                  <option value="thin">瘦壳（一眼证伪）</option>
                </select>
                <div className="hx-hint" style={{ marginTop: 5, fontSize: 11 }}>
                  默认按类别推导，可手改
                </div>
              </label>

              <label className="hx-field" style={{ gridColumn: '1 / -1' }}>
                <span className="hx-label">URL</span>
                <input
                  className={`hx-input hx-mono${errors.url ? ' hx-input-error' : ''}`}
                  value={draft.url}
                  placeholder="https://example.com/admin/"
                  onChange={(event) => {
                    handleUrlChange(event.target.value);
                    setErrors((prev) => ({ ...prev, url: undefined }));
                  }}
                />
                {errors.url ? <div className="hx-field-error">{errors.url}</div> : null}
              </label>

              <label className="hx-field">
                <span className="hx-label">Host</span>
                <input
                  className="hx-input hx-mono"
                  value={draft.host}
                  placeholder="从 URL 自动解析，可改"
                  onChange={(event) => patchDraft({ host: event.target.value })}
                />
              </label>

              <label className="hx-field">
                <span className="hx-label">IP / 内网主机名</span>
                <input
                  className={`hx-input hx-mono${errors.ip ? ' hx-input-error' : ''}`}
                  value={draft.ip}
                  placeholder="10.0.0.8 / intranet-db01"
                  onChange={(event) => {
                    patchDraft({ ip: event.target.value });
                    setErrors((prev) => ({ ...prev, ip: undefined }));
                  }}
                />
                {errors.ip ? <div className="hx-field-error">{errors.ip}</div> : null}
              </label>

              <label className="hx-field">
                <span className="hx-label">端口</span>
                <input
                  className={`hx-input hx-mono${errors.port ? ' hx-input-error' : ''}`}
                  value={draft.port}
                  placeholder="443"
                  onChange={(event) => {
                    patchDraft({ port: event.target.value });
                    setErrors((prev) => ({ ...prev, port: undefined }));
                  }}
                />
                {errors.port ? <div className="hx-field-error">{errors.port}</div> : null}
              </label>

              <label className="hx-field">
                <span className="hx-label">协议</span>
                <input
                  className="hx-input hx-mono"
                  value={draft.protocol}
                  placeholder="https"
                  onChange={(event) => patchDraft({ protocol: event.target.value })}
                />
              </label>

              <label className="hx-field" style={{ gridColumn: '1 / -1' }}>
                <span className="hx-label">页面标题</span>
                <input
                  className="hx-input"
                  value={draft.title}
                  placeholder="浏览器标签页上的 title"
                  onChange={(event) => patchDraft({ title: event.target.value })}
                />
              </label>

              <label className="hx-field">
                <span className="hx-label">归属</span>
                <select
                  className="hx-select"
                  value={draft.ownership}
                  onChange={(event) => patchDraft({ ownership: event.target.value as AssetDraft['ownership'] })}
                >
                  {OWNERSHIPS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="hx-field">
                <span className="hx-label">存活状态</span>
                <select
                  className="hx-select"
                  value={draft.aliveStatus}
                  onChange={(event) =>
                    patchDraft({ aliveStatus: event.target.value as AssetDraft['aliveStatus'] })
                  }
                >
                  {ALIVE_STATUSES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="hx-field">
                <span className="hx-label">同皮组</span>
                <input
                  className="hx-input"
                  value={draft.sameSkinGroup}
                  placeholder="同皮资产只做 2-3 个代表，如 mall-admin"
                  onChange={(event) => patchDraft({ sameSkinGroup: event.target.value })}
                />
              </label>

              <label className="hx-field" style={{ gridColumn: '1 / -1' }}>
                <span className="hx-label">风险备注</span>
                <textarea
                  className="hx-textarea"
                  value={draft.riskNote}
                  placeholder="这摊最值钱的东西在哪、谁最可能出问题"
                  onChange={(event) => patchDraft({ riskNote: event.target.value })}
                />
              </label>
            </div>
          </CollapsibleSection>

          {/* 2. 说清这摊 ------------------------------------------------ */}
          <CollapsibleSection
            title="说清这摊"
            hint="四个字段非空才算过第 1 项"
            badge={Object.values(draft.brief).every((value) => value.trim()) ? '已填完' : '待填'}
            defaultOpen
          >
            <div className="hx-form-grid-2">
              {BRIEF_FIELDS.map((field) => (
                <label key={field.key} className="hx-field" style={{ gridColumn: '1 / -1' }}>
                  <span className="hx-label">{field.label}</span>
                  <textarea
                    className="hx-textarea"
                    style={{ minHeight: 54 }}
                    value={draft.brief[field.key]}
                    placeholder={field.placeholder}
                    onChange={(event) =>
                      patchDraft({ brief: { ...draft.brief, [field.key]: event.target.value } })
                    }
                  />
                </label>
              ))}
            </div>
          </CollapsibleSection>

          {/* 3. 技术栈 -------------------------------------------------- */}
          <CollapsibleSection title="技术栈（16 栏）" hint="每填一条自动带出攻击面与历史漏洞" defaultOpen>
            <FingerprintEditor
              fp={draft.fp}
              library={library}
              onChange={handleFpChange}
              error={errors.fp}
            />
          </CollapsibleSection>

          {/* 4. 攻击面 -------------------------------------------------- */}
          <CollapsibleSection title="攻击面" hint="自动推导 · 只读" defaultOpen>
            <AttackSurfaceView fp={draft.fp} library={library} />
          </CollapsibleSection>

          {/* 5. 历史漏洞 ------------------------------------------------ */}
          <CollapsibleSection
            title="历史漏洞"
            badge={`${draft.vulnRefs.length} 条`}
            hint={fpNotice || '自动带出 + 手动补'}
            defaultOpen
          >
            <VulnRefEditor
              refs={draft.vulnRefs}
              onChange={(refs) => patchDraft({ vulnRefs: refs })}
            />
          </CollapsibleSection>

          {/* 6. 本轮完成 ------------------------------------------------ */}
          <CollapsibleSection title="本轮完成（11 项）" hint="全勾才 covered" defaultOpen>
            <ChecklistPanel
              checklist={draft.checklist}
              onChange={(checklist) => patchDraft({ checklist })}
              onMarkComplete={handleMarkComplete}
            />
          </CollapsibleSection>
        </div>

        <footer className="hx-drawer-foot">
          <span className="hx-hint" style={{ fontSize: 11 }}>
            {dirty ? '有未保存改动' : '没有改动'}
            {asset ? ` · 上次更新 ${asset.updatedAt.slice(0, 16).replace('T', ' ')}` : ''}
          </span>
          <span className="hx-spacer" />
          <button type="button" className="hx-btn" onClick={requestClose} disabled={saving}>
            取消
          </button>
          <button
            type="button"
            className="hx-btn hx-btn-primary"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? (
              <>
                <Icon name="spinner" size={13} className="hx-spin" />
                保存中…
              </>
            ) : (
              <>
                <Icon name="check" size={13} />
                保存
              </>
            )}
          </button>
        </footer>
      </aside>

      {/* 未保存改动确认 */}
      <Modal
        open={confirmClose}
        title="放弃未保存的改动？"
        subtitle="关掉抽屉后，这次填的字段不会保留。"
        onClose={() => setConfirmClose(false)}
        maxWidth={460}
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
        <div className="hx-hint">
          未保存的字段包括基本信息、技术栈、历史漏洞状态与「本轮完成」勾选。
        </div>
      </Modal>

      {/* 未完成项拦截 */}
      <Modal
        open={unfinished !== null}
        title="还没打满 11 项"
        subtitle="这些项还没勾，先补完再标记完成。"
        onClose={() => setUnfinished(null)}
        maxWidth={520}
        footer={
          <button type="button" className="hx-btn" onClick={() => setUnfinished(null)}>
            知道了
          </button>
        }
      >
        {unfinished ? (
          <ol className="hx-ol" style={{ paddingLeft: 18, margin: 0 }}>
            {unfinished.map((item) => (
              <li key={item} style={{ marginBottom: 4 }}>
                {item}
              </li>
            ))}
          </ol>
        ) : null}
      </Modal>
    </div>
  );
}
