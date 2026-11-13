/**
 * 三种批量导入入口（path / curl / Swagger）。
 *
 * 预览与提交都只把文本发给本地后端做字符串解析，**绝不对目标发请求**。
 * 单行失败只跳过该行，面板里逐行显示原因。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Asset, EndpointImportFormat, EndpointImportResult } from '../../../shared/types';
import { Icon } from '../../components/Icons';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { api, toErrorText } from '../../lib/api';

export interface EndpointImportPanelProps {
  open: boolean;
  projectId: string;
  assets: Asset[];
  defaultAssetId: string;
  onClose: () => void;
  onImported: () => Promise<void> | void;
}

const FORMATS: { key: EndpointImportFormat; label: string; hint: string }[] = [
  { key: 'path', label: '每行 path', hint: '默认 GET；也可写 METHOD /path' },
  { key: 'curl', label: 'curl 命令', hint: '每行一条，支持 -X / -H / -d 与续行符' },
  { key: 'swagger', label: 'Swagger / OpenAPI JSON', hint: '展开 paths × methods，解析一层 $ref' },
];

const PLACEHOLDER: Record<EndpointImportFormat, string> = {
  path: '/api/order/detail?id=1\n/api/user/list\nPOST /api/order/create',
  curl:
    "curl -X POST 'https://example.com/api/order/detail?id=1' \\\n  -H 'Content-Type: application/json' \\\n  -d '{\"orderId\":123,\"amount\":99}'",
  swagger:
    '{\n  "openapi": "3.0.0",\n  "paths": {\n    "/api/order/{id}": {\n      "get": { "parameters": [{"name":"id","in":"path","schema":{"type":"string"}}] },\n      "post": { "requestBody": { "content": { "application/json": { "schema": { "type":"object", "properties": { "amount": {"type":"number"} } } } } } }\n    }\n  }\n}',
};

type TextMap = Record<EndpointImportFormat, string>;

export function EndpointImportPanel({
  open,
  projectId,
  assets,
  defaultAssetId,
  onClose,
  onImported,
}: EndpointImportPanelProps): JSX.Element | null {
  const toast = useToast();
  const [format, setFormat] = useState<EndpointImportFormat>('path');
  const [assetId, setAssetId] = useState(defaultAssetId);
  const [texts, setTexts] = useState<TextMap>({ path: '', curl: '', swagger: '' });
  const [preview, setPreview] = useState<EndpointImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAssetId(defaultAssetId);
    setPreview(null);
  }, [open, defaultAssetId]);

  useEffect(() => {
    setPreview(null);
  }, [format, assetId, texts]);

  const currentText = texts[format];
  const activeFormat = useMemo(
    () => FORMATS.find((item) => item.key === format) ?? FORMATS[0],
    [format],
  );

  const runPreview = useCallback(async (): Promise<void> => {
    if (!assetId) {
      toast('error', '先选一个资产');
      return;
    }
    if (!currentText.trim()) {
      toast('error', '先粘贴要导入的内容');
      return;
    }
    setLoading(true);
    try {
      const result = await api.previewEndpointImport(projectId, {
        assetId,
        format,
        text: currentText,
      });
      setPreview(result);
    } catch (error) {
      toast('error', toErrorText(error));
    } finally {
      setLoading(false);
    }
  }, [assetId, currentText, format, projectId, toast]);

  const commit = useCallback(async (): Promise<void> => {
    if (!preview || preview.successCount === 0) return;
    setCommitting(true);
    try {
      const result = await api.commitEndpointImport(projectId, {
        assetId,
        format,
        text: currentText,
      });
      toast('success', `已导入 ${result.successCount} 条接口，跳过 ${result.skipped} 行`);
      await onImported();
      onClose();
    } catch (error) {
      toast('error', toErrorText(error));
    } finally {
      setCommitting(false);
    }
  }, [assetId, currentText, format, onClose, onImported, preview, projectId, toast]);

  if (!open) return null;

  return (
    <Modal
      open={open}
      title="批量导入接口"
      subtitle="纯字符串解析，不对目标发任何请求；解析失败只跳过对应行。"
      onClose={onClose}
      maxWidth={860}
      locked={committing}
      footer={
        <>
          <span className="hx-hint" style={{ marginRight: 'auto' }}>
            {preview
              ? `预览：成功 ${preview.successCount} 条 / 跳过 ${preview.skipped} 行 / 错误 ${preview.errors.length} 条`
              : '先点「解析预览」，确认无误再导入'}
          </span>
          <button type="button" className="hx-btn" onClick={onClose} disabled={committing}>
            取消
          </button>
          <button
            type="button"
            className="hx-btn"
            onClick={() => void runPreview()}
            disabled={loading || committing}
          >
            {loading ? <Icon name="spinner" size={12} className="hx-spin" /> : null}
            解析预览
          </button>
          <button
            type="button"
            className="hx-btn hx-btn-primary"
            onClick={() => void commit()}
            disabled={!preview || preview.successCount === 0 || committing || loading}
          >
            导入 {preview?.successCount ?? 0} 条
          </button>
        </>
      }
    >
      <div className="hx-import-tabs">
        {FORMATS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`hx-btn hx-btn-sm${format === item.key ? ' hx-btn-primary' : ''}`}
            onClick={() => setFormat(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="hx-hint" style={{ marginBottom: 8 }}>{activeFormat.hint}</div>

      <label className="hx-field">
        <span className="hx-label">导入到资产 *</span>
        <select
          className="hx-select"
          value={assetId}
          onChange={(event) => setAssetId(event.target.value)}
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
        <span className="hx-label">粘贴内容 *</span>
        <textarea
          className="hx-textarea hx-mono hx-import-text"
          value={currentText}
          placeholder={PLACEHOLDER[format]}
          onChange={(event) => setTexts((prev) => ({ ...prev, [format]: event.target.value }))}
        />
      </label>

      {preview ? (
        <div className="hx-import-result">
          <div className="hx-import-summary">
            <span className="hx-badge hx-badge-green">成功 {preview.successCount}</span>
            <span className="hx-badge hx-badge-amber">跳过 {preview.skipped}</span>
            <span className="hx-badge hx-badge-red">错误 {preview.errors.length}</span>
          </div>

          {preview.errors.length > 0 ? (
            <div className="hx-import-errors">
              <div className="hx-hint">逐行错误：</div>
              {preview.errors.slice(0, 30).map((error, index) => (
                <div key={`${error.line}-${index}`} className="hx-import-error">
                  第 {error.line} 行 · {error.reason}
                </div>
              ))}
              {preview.errors.length > 30 ? (
                <div className="hx-hint">… 还有 {preview.errors.length - 30} 条</div>
              ) : null}
            </div>
          ) : null}

          {preview.drafts.length > 0 ? (
            <div className="hx-table-wrap">
              <table className="hx-table hx-table-dense hx-import-table">
                <thead>
                  <tr>
                    <th>METHOD</th>
                    <th>path</th>
                    <th>来源</th>
                    <th>参数数</th>
                    <th>可访问性</th>
                    <th>回包特征</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.drafts.slice(0, 50).map((draft, index) => (
                    <tr key={`${draft.method}-${draft.path}-${index}`}>
                      <td><span className="hx-badge">{draft.method}</span></td>
                      <td><div className="hx-cell-clip hx-mono" title={draft.path}>{draft.path}</div></td>
                      <td>{draft.source}</td>
                      <td>{draft.params.length}</td>
                      <td>{draft.accessState}</td>
                      <td>{draft.respSignature}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.drafts.length > 50 ? (
                <div className="hx-hint" style={{ padding: 6 }}>… 仅预览前 50 条</div>
              ) : null}
            </div>
          ) : (
            <div className="hx-empty" style={{ margin: 8 }}>没有解析出可导入的接口</div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
