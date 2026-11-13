/**
 * 16 栏技术栈录入。
 *
 * 结构：顶部识别提示（照 PROMPT 3.4 原话）+ 16 个可折叠分组。
 * 每组：组头（中文名 + 英文 key + 已填条数）→ 已填 chip（含置信度点，悬停看 evidence）
 *       → 添加行（名称 datalist 从指纹库给候选，允许自由输入）。
 */

import { useMemo, useState } from 'react';

import { FP_CATEGORIES } from '../../../shared/constants';
import { newFpItemId } from '../../../shared/fpDerive';
import type {
  AssetFingerprints,
  Fingerprint,
  FingerprintConfidence,
  FpCategoryKey,
  FpCategoryMeta,
  FpItem,
} from '../../../shared/types';
import { Icon } from '../../components/Icons';

export interface FingerprintEditorProps {
  fp: AssetFingerprints;
  library: Fingerprint[];
  onChange: (next: AssetFingerprints) => void;
  /** 校验错误（如名称重复）由父级统一展示 */
  error?: string;
}

const DEFAULT_OPEN: FpCategoryKey[] = ['webServer', 'language', 'webFramework'];

export function FingerprintEditor({
  fp,
  library,
  onChange,
  error,
}: FingerprintEditorProps): JSX.Element {
  // 名称是派生联动的唯一键：库里没有的名字不会带出攻击面 / 历史漏洞，
  // 这里先算一份全局名字集合，用来给「自由输入但库里没有」的条目加提示。
  const libNames = useMemo(() => new Set(library.map((item) => item.name)), [library]);

  return (
    <div>
      <div className="hx-fp-hint">
        <div className="hx-fp-hint-title">
          <Icon name="search" size={13} />
          照这些位置找，别瞎猜
        </div>
        <div className="hx-hint">
          Server 头 / X-Powered-By / Cookie 名（JSESSIONID、PHPSESSID）/ 报错栈 / favicon hash /
          静态资源路径与 hash / sourcemap 可达性 / <code className="hx-code">__NUXT__</code>、
          <code className="hx-code">__NEXT_DATA__</code> / robots.txt / 默认页版权脚注 / 路由后缀（.do
          .action .jsp .aspx .php）
        </div>
      </div>

      {error ? <div className="hx-field-error">{error}</div> : null}

      <div className="hx-fp-groups">
        {FP_CATEGORIES.map((meta) => {
          const items = fp[meta.key] ?? [];
          return (
            <FingerprintGroup
              key={meta.key}
              meta={meta}
              items={items}
              library={library}
              libNames={libNames}
              defaultOpen={DEFAULT_OPEN.includes(meta.key) || items.length > 0}
              onChange={(next) => onChange({ ...fp, [meta.key]: next })}
            />
          );
        })}
      </div>
    </div>
  );
}

interface FingerprintGroupProps {
  meta: FpCategoryMeta;
  items: FpItem[];
  library: Fingerprint[];
  libNames: Set<string>;
  defaultOpen: boolean;
  onChange: (next: FpItem[]) => void;
}

function FingerprintGroup({
  meta,
  items,
  library,
  libNames,
  defaultOpen,
  onChange,
}: FingerprintGroupProps): JSX.Element {
  const [open, setOpen] = useState<boolean>(defaultOpen);
  const [name, setName] = useState('');
  const [version, setVersion] = useState('');
  const [evidence, setEvidence] = useState('');
  const [confidence, setConfidence] = useState<FingerprintConfidence>('确认');
  const [error, setError] = useState('');

  const candidates = useMemo(
    () => library.filter((item) => item.category === meta.key),
    [library, meta.key],
  );

  const typedName = name.trim();
  // 输入过程中（还是某个候选的前缀）先不报警，避免边打字边弹提示；
  // 真正加进去之后，chip 的虚线样式 + 组内提示会持续提醒。
  const typedInLibrary =
    typedName === '' ||
    libNames.has(typedName) ||
    candidates.some((item) => item.name.toLowerCase().startsWith(typedName.toLowerCase()));
  const unknownCount = items.filter((item) => !libNames.has(item.name)).length;

  const handleNameChange = (value: string): void => {
    setName(value);
    setError('');
    const hit = candidates.find((item) => item.name === value);
    if (!hit) return;
    setVersion(hit.version ?? '');
    setEvidence(hit.evidence ?? '');
    setConfidence(hit.confidence);
  };

  const handleAdd = (): void => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('先填指纹名称');
      return;
    }
    if (items.some((item) => item.name === trimmed)) {
      setError(`「${trimmed}」已经加过了`);
      return;
    }
    const item: FpItem = {
      id: newFpItemId(),
      name: trimmed,
      version: version.trim(),
      evidence: evidence.trim(),
      confidence,
    };
    onChange([...items, item]);
    setName('');
    setVersion('');
    setEvidence('');
    setConfidence('确认');
    setError('');
  };

  const handleRemove = (id: string): void => {
    onChange(items.filter((item) => item.id !== id));
  };

  return (
    <div className="hx-fp-group">
      <button
        type="button"
        className="hx-group-head"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className={`hx-chevron${open ? ' open' : ''}`}>
          <Icon name="chevronDown" size={13} />
        </span>
        <span className="hx-group-title">{meta.label}</span>
        <span className="hx-mono hx-group-key">{meta.key}</span>
        <span className="hx-spacer" />
        <span className={`hx-badge${items.length > 0 ? ' hx-badge-active' : ''}`}>
          {items.length > 0 ? `已填 ${items.length} 条` : '未填'}
        </span>
      </button>

      {open ? (
        <div className="hx-group-body">
          {items.length > 0 ? (
            <div className="hx-chips">
              {items.map((item) => {
                const known = libNames.has(item.name);
                const title = `${known ? '' : '指纹库里没有这条：不会自动带出攻击面 / 历史漏洞。'}${
                  item.evidence ? `判定依据：${item.evidence}` : '未填判定依据'
                }`;
                return (
                  <span
                    key={item.id}
                    className={`hx-chip${known ? '' : ' hx-chip-nolib'}`}
                    title={title}
                  >
                    <span
                      className={`hx-chip-dot ${
                        item.confidence === '确认' ? 'confirm' : 'suspect'
                      }`}
                    />
                    <span className="hx-chip-text">
                      {item.name}
                      {item.version ? <span className="hx-chip-ver"> {item.version}</span> : null}
                    </span>
                    <button
                      type="button"
                      className="hx-chip-x"
                      onClick={() => handleRemove(item.id)}
                      title="删除这条指纹（攻击面与历史漏洞会立即联动）"
                      aria-label={`删除 ${item.name}`}
                    >
                      <Icon name="close" size={11} />
                    </button>
                  </span>
                );
              })}
            </div>
          ) : (
            <div className="hx-fp-empty">{meta.hint} · 没识别到就留空，别硬填</div>
          )}

          {unknownCount > 0 ? (
            <div className="hx-fp-nolib">
              本组有 {unknownCount} 条不在指纹库：照实记录没问题，但不会自动带出攻击面 /
              历史漏洞。
            </div>
          ) : null}

          <div className="hx-fp-add">
            <input
              className="hx-input"
              list={`fp-dl-${meta.key}`}
              value={name}
              placeholder={`名称（如 ${meta.hint.split(' / ')[0]}）`}
              onChange={(event) => handleNameChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleAdd();
                }
              }}
            />
            <datalist id={`fp-dl-${meta.key}`}>
              {candidates.map((item) => (
                <option key={item.id} value={item.name} />
              ))}
            </datalist>

            <input
              className="hx-input"
              value={version}
              placeholder="版本（未知可留空）"
              onChange={(event) => setVersion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleAdd();
                }
              }}
            />
            <input
              className="hx-input"
              value={evidence}
              placeholder="判定依据（Server 头 / favicon hash…）"
              onChange={(event) => setEvidence(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleAdd();
                }
              }}
            />
            <select
              className="hx-select"
              value={confidence}
              onChange={(event) =>
                setConfidence(event.target.value === '疑似' ? '疑似' : '确认')
              }
              title="确认 = 有直接证据；疑似 = 只是像"
            >
              <option value="确认">确认</option>
              <option value="疑似">疑似</option>
            </select>
            <button type="button" className="hx-btn" onClick={handleAdd}>
              <Icon name="plus" size={12} />
              添加
            </button>
          </div>
          {!typedInLibrary ? (
            <div className="hx-fp-nolib">
              指纹库里没有「{typedName}」：可以自由录入，但不会自动带出攻击面 / 历史漏洞。
              想联动就换成库里已有的名称（输入框有候选）。
            </div>
          ) : null}
          {error ? <div className="hx-field-error">{error}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
