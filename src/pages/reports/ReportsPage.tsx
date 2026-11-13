/**
 * 漏洞报告 docx 快捷方式页：创建 / 打开 / 删除。
 *
 * 程序不存正文、不解析 docx；打开必须走后端 API，不能用 file:// 链接。
 */

import { useCallback, useEffect, useState } from 'react';

import type { ReportFileView } from '../../../shared/types';
import { Icon } from '../../components/Icons';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { api, toErrorText } from '../../lib/api';
import { formatDateTime } from '../../lib/format';

export interface ReportsPageProps {
  projectId: string;
  onRefresh: () => Promise<void>;
}

function formatSize(size: number | null): string {
  if (size === null) return '缺失';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function ReportsPage({ projectId, onRefresh }: ReportsPageProps): JSX.Element {
  const toast = useToast();
  const [items, setItems] = useState<ReportFileView[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('未命名报告');
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ReportFileView | null>(null);
  const [deleteFile, setDeleteFile] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      setItems(await api.listReportFiles(projectId));
    } catch (error) {
      toast('error', toErrorText(error));
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(async (): Promise<void> => {
    if (!name.trim()) {
      toast('error', '报告名称不能为空');
      return;
    }
    setCreating(true);
    try {
      await api.createReportFile(projectId, name.trim());
      toast('success', '报告文档已创建');
      setCreateOpen(false);
      setName('未命名报告');
      await load();
      await onRefresh();
    } catch (error) {
      toast('error', toErrorText(error));
    } finally {
      setCreating(false);
    }
  }, [load, name, onRefresh, projectId, toast]);

  const open = useCallback(
    async (file: ReportFileView): Promise<void> => {
      try {
        await api.openReportFile(file.id);
        toast('success', '已交给系统默认程序打开');
      } catch (error) {
        toast('error', toErrorText(error));
      }
    },
    [toast],
  );

  const confirmDelete = useCallback(async (): Promise<void> => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const result = await api.deleteReportFile(pendingDelete.id, deleteFile);
      toast(
        'success',
        result.fileDeleted ? '登记与文件均已删除' : '已移除登记，docx 文件保留',
      );
      setPendingDelete(null);
      setDeleteFile(false);
      await load();
      await onRefresh();
    } catch (error) {
      toast('error', toErrorText(error));
    } finally {
      setDeleting(false);
    }
  }, [deleteFile, load, onRefresh, pendingDelete, toast]);

  return (
    <div className="hx-content-inner">
      <div className="hx-page-head">
        <div>
          <h1 className="hx-page-title">漏洞报告</h1>
          <div className="hx-crumb">项目 {projectId}</div>
        </div>
        <div className="hx-spacer" />
        <button type="button" className="hx-btn hx-btn-primary" onClick={() => setCreateOpen(true)}>
          <Icon name="plus" size={13} />
          创建文档
        </button>
      </div>

      {loading && items.length === 0 ? (
        <div className="hx-empty">
          <Icon name="spinner" size={20} className="hx-spin" />
          <div>正在读取报告列表…</div>
        </div>
      ) : items.length === 0 ? (
        <div className="hx-empty hx-empty-tall">
          <Icon name="reports" size={24} />
          <div style={{ color: 'var(--strong)', fontSize: 14 }}>还没有报告</div>
          <div>还没有报告，点创建文档生成一份带 2.3 章节骨架的 docx。</div>
          <button type="button" className="hx-btn hx-btn-primary" onClick={() => setCreateOpen(true)}>
            <Icon name="plus" size={13} />
            创建文档
          </button>
        </div>
      ) : (
        <div className="hx-card" style={{ padding: '4px 6px' }}>
          <div className="hx-table-wrap">
            <table className="hx-table hx-report-table">
              <colgroup>
                <col style={{ width: '30%' }} />
                <col style={{ width: 170 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 160 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>显示名</th>
                  <th>创建时间</th>
                  <th>文件大小</th>
                  <th style={{ textAlign: 'right' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((file) => (
                  <tr key={file.id}>
                    <td>
                      <div style={{ color: 'var(--strong)' }}>{file.name}</div>
                      <div className="hx-mono hx-hint" style={{ fontSize: 10 }}>
                        {file.fileName}
                      </div>
                      {file.missing ? (
                        <span className="hx-badge hx-badge-red">文件缺失</span>
                      ) : null}
                    </td>
                    <td className="hx-mono" style={{ fontSize: 11 }}>
                      {formatDateTime(file.createdAt)}
                    </td>
                    <td className="hx-mono" style={{ fontSize: 11 }}>
                      {formatSize(file.size)}
                    </td>
                    <td>
                      <div className="hx-row" style={{ justifyContent: 'flex-end', gap: 4 }}>
                        <button type="button" className="hx-btn hx-btn-sm" onClick={() => void open(file)}>
                          打开
                        </button>
                        <button
                          type="button"
                          className="hx-icon-btn"
                          onClick={() => {
                            setPendingDelete(file);
                            setDeleteFile(false);
                          }}
                          title="删除报告登记"
                          aria-label={`删除 ${file.name}`}
                        >
                          <Icon name="trash" size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="hx-table-foot">
            <span className="hx-hint">共 {items.length} 份 · 打开由后端调系统默认程序</span>
            <span className="hx-spacer" />
            <span className="hx-hint">删除默认只移除登记，docx 文件保留</span>
          </div>
        </div>
      )}

      <Modal
        open={createOpen}
        title="创建报告文档"
        subtitle="会复制内置 2.3 空白 docx 到程序目录的 reports/ 下。"
        onClose={() => setCreateOpen(false)}
        maxWidth={460}
        locked={creating}
        footer={
          <>
            <button type="button" className="hx-btn" onClick={() => setCreateOpen(false)} disabled={creating}>
              取消
            </button>
            <button
              type="button"
              className="hx-btn hx-btn-primary"
              onClick={() => void create()}
              disabled={creating}
            >
              创建
            </button>
          </>
        }
      >
        <label className="hx-field">
          <span className="hx-label">显示名</span>
          <input
            className="hx-input"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder="未命名报告"
          />
        </label>
        <div className="hx-hint">文件名由程序生成，不接受路径。</div>
      </Modal>

      <Modal
        open={pendingDelete !== null}
        title="删除报告登记？"
        subtitle="默认只移除 JSON 里的登记，docx 文件保留。"
        onClose={() => setPendingDelete(null)}
        maxWidth={520}
        locked={deleting}
        footer={
          <>
            <button type="button" className="hx-btn" onClick={() => setPendingDelete(null)} disabled={deleting}>
              取消
            </button>
            <button
              type="button"
              className="hx-btn hx-btn-danger"
              onClick={() => void confirmDelete()}
              disabled={deleting}
            >
              确认删除
            </button>
          </>
        }
      >
        {pendingDelete ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div className="hx-hint">显示名</div>
              <div style={{ color: 'var(--strong)' }}>{pendingDelete.name}</div>
            </div>
            <div>
              <div className="hx-hint">完整文件名</div>
              <div className="hx-mono" style={{ wordBreak: 'break-all' }}>
                {pendingDelete.fileName}
              </div>
            </div>
            <label className="hx-check-row">
              <input
                type="checkbox"
                checked={deleteFile}
                onChange={(event) => setDeleteFile(event.target.checked)}
              />
              <span>同时删除文件（不可恢复）</span>
            </label>
            <div className={`hx-hint${deleteFile ? ' hx-danger-text' : ''}`}>
              {deleteFile
                ? '确认后会从程序目录 reports/ 删除这份 docx，无法恢复。'
                : '当前只会移除登记，docx 文件仍保留在 reports/ 下。'}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
