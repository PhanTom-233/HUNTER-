/**
 * AI 读这里：把当前软件的写接口结构摊开给外部 AI 看。
 *
 * 页面只读，数据来自 `GET /api/ai-schema`；不做复制粘贴式导出。
 * 外部 AI 直接请求同一个端点即可拿到完整结构，比读页面 HTML 省 token。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AiSchema, AiSchemaEndpoint } from '../../../shared/types';
import { Icon } from '../../components/Icons';
import { api } from '../../lib/api';

export interface AiReadPageProps {
  projectId: string;
}

const METHOD_BADGE: Record<string, string> = {
  GET: 'hx-badge-dim',
  POST: 'hx-badge',
  PATCH: 'hx-badge-amber',
  PUT: 'hx-badge-orange',
  DELETE: 'hx-badge-red',
};

interface Group {
  name: string;
  items: AiSchemaEndpoint[];
}

export function AiReadPage({ projectId }: AiReadPageProps): JSX.Element {
  const [schema, setSchema] = useState<AiSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSchema(await api.aiSchema());
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取 API 结构失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const origin = window.location.origin;
  const schemaUrl = `${origin}/api/ai-schema`;
  const dataUrl = `${origin}/api/projects/${projectId}`;

  const groups = useMemo<Group[]>(() => {
    if (!schema) return [];
    const map = new Map<string, AiSchemaEndpoint[]>();
    for (const endpoint of schema.endpoints) {
      const list = map.get(endpoint.group) ?? [];
      list.push(endpoint);
      map.set(endpoint.group, list);
    }
    return [...map.entries()].map(([name, items]) => ({ name, items }));
  }, [schema]);

  const copy = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
    }
    setCopied(label);
    window.setTimeout(() => setCopied(''), 1600);
  }, []);

  const total = schema?.endpoints.length ?? 0;
  const enumCount = schema ? Object.keys(schema.enums).length : 0;

  if (loading) {
    return (
      <div className="hx-content-inner">
        <div className="hx-empty">
          <Icon name="spinner" size={20} className="hx-spin" />
          <div>正在读取 API 结构…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="hx-content-inner">
      <div className="hx-page-head">
        <div>
          <h1 className="hx-page-title">AI 读这里</h1>
          <div className="hx-crumb">
            项目 {projectId} · 机器可读 API 结构 · 只读
          </div>
        </div>
        <div className="hx-spacer" />
        <button type="button" className="hx-btn" onClick={() => void load()}>
          <Icon name="spark" size={13} />
          重新读取
        </button>
      </div>

      <div className="hx-card hx-ai-hero">
        <div className="hx-ai-hero-title">
          <Icon name="spark" size={14} />
          给外部 AI 的两个地址
        </div>
        <p className="hx-hint">
          让 AI 直接请求下面的地址拿结构，比让它读页面 HTML 省 token；写操作一律 JSON body，
          本地单机无鉴权。
        </p>

        <div className="hx-ai-url-row">
          <span className="hx-ai-url-label">结构</span>
          <code className="hx-ai-url">GET {schemaUrl}</code>
          <button
            type="button"
            className="hx-btn hx-btn-sm"
            onClick={() => void copy(schemaUrl, 'schema')}
          >
            {copied === 'schema' ? '已复制' : '复制地址'}
          </button>
        </div>

        <div className="hx-ai-url-row">
          <span className="hx-ai-url-label">数据</span>
          <code className="hx-ai-url">GET {dataUrl}</code>
          <button
            type="button"
            className="hx-btn hx-btn-sm"
            onClick={() => void copy(dataUrl, 'data')}
          >
            {copied === 'data' ? '已复制' : '复制地址'}
          </button>
        </div>

        <div className="hx-hint" style={{ marginTop: 8 }}>
          共 {total} 个写接口 · {enumCount} 组枚举值；字段的中文标签与页面表单一致，可直接对照填写。
        </div>
      </div>

      {error ? (
        <div className="hx-card" style={{ marginTop: 12 }}>
          <div className="hx-empty">
            <Icon name="alert" size={18} />
            <div>{error}</div>
            <button type="button" className="hx-btn hx-btn-primary" onClick={() => void load()}>
              重试
            </button>
          </div>
        </div>
      ) : null}

      {groups.map((group) => (
        <section className="hx-copilot-section" key={group.name}>
          <h2 className="hx-card-title">
            <Icon name="endpoints" size={14} />
            {group.name}
            <span className="hx-card-title-hint">{group.items.length} 个接口</span>
          </h2>

          <div className="hx-ai-endpoint-list">
            {group.items.map((endpoint) => (
              <article className="hx-ai-endpoint" key={`${endpoint.method} ${endpoint.path}`}>
                <div className="hx-ai-endpoint-head">
                  <span className={`hx-badge hx-mono ${METHOD_BADGE[endpoint.method] ?? ''}`}>
                    {endpoint.method}
                  </span>
                  <code className="hx-ai-endpoint-path">{endpoint.path}</code>
                  <span className="hx-hint">{endpoint.summary}</span>
                </div>

                {endpoint.fields.length === 0 ? (
                  <div className="hx-hint" style={{ padding: '8px 10px' }}>
                    无请求体字段
                  </div>
                ) : (
                  <table className="hx-table hx-table-dense hx-ai-fields">
                    <thead>
                      <tr>
                        <th>字段</th>
                        <th>中文标签</th>
                        <th>类型</th>
                        <th>必填</th>
                        <th>约束 / 可选值</th>
                      </tr>
                    </thead>
                    <tbody>
                      {endpoint.fields.map((field) => (
                        <tr key={field.name}>
                          <td className="hx-mono">{field.name}</td>
                          <td>{field.label}</td>
                          <td className="hx-mono hx-hint">{field.type}</td>
                          <td>
                            {field.required ? (
                              <span className="hx-badge hx-badge-red">必填</span>
                            ) : (
                              <span className="hx-hint">可选</span>
                            )}
                          </td>
                          <td className="hx-ai-constraint">
                            {field.values?.length ? (
                              <span className="hx-mono">{field.values.join(' / ')}</span>
                            ) : field.max !== undefined ? (
                              <span className="hx-mono">≤ {field.max} 字符</span>
                            ) : field.min !== undefined ? (
                              <span className="hx-mono">≥ {field.min}</span>
                            ) : null}
                            {field.note ? <span className="hx-hint"> {field.note}</span> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {endpoint.example ? (
                  <details className="hx-ai-example">
                    <summary>请求体示例</summary>
                    <pre>{JSON.stringify(endpoint.example, null, 2)}</pre>
                  </details>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ))}

      {schema && schema.enums ? (
        <section className="hx-copilot-section">
          <h2 className="hx-card-title">
            <Icon name="folder" size={14} />
            枚举值总表
            <span className="hx-card-title-hint">{enumCount} 组 · 与后端校验常量同源</span>
          </h2>
          <div className="hx-ai-enums">
            {Object.entries(schema.enums).map(([key, values]) => (
              <div className="hx-ai-enum-row" key={key}>
                <code className="hx-ai-enum-key">{key}</code>
                <span className="hx-mono hx-hint">{values.join(' / ')}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
