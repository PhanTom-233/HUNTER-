/**
 * 项目管理弹窗：从顶栏下拉进入，集中做「打开 / 新建 / 删除」。
 *
 * 不新增第 11 个导航项、不改 10 页信息架构；删除沿用二次确认态（不是 window.confirm）。
 */

import { useEffect, useState } from 'react';

import { MODE_META, PROJECT_STATUS_LABEL } from '../../shared/constants';
import type { ProjectSummary } from '../../shared/types';
import { formatDateTime, formatRelative } from '../lib/format';
import { Icon } from './Icons';
import { Modal } from './Modal';

export interface ProjectManagerProps {
  open: boolean;
  projects: ProjectSummary[];
  activeProjectId: string | null;
  onClose: () => void;
  onOpen: (projectId: string) => void;
  onDelete: (projectId: string) => Promise<void>;
  onCreate: () => void;
}

export function ProjectManager({
  open,
  projects,
  activeProjectId,
  onClose,
  onOpen,
  onDelete,
  onCreate,
}: ProjectManagerProps): JSX.Element {
  const [pendingDelete, setPendingDelete] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 每次打开都从列表态开始，避免上次停在确认态
  useEffect(() => {
    if (open) {
      setPendingDelete(null);
      setDeleting(false);
    }
  }, [open]);

  const confirming = pendingDelete !== null;

  const handleClose = (): void => {
    if (deleting) return;
    setPendingDelete(null);
    onClose();
  };

  const confirmDelete = async (): Promise<void> => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await onDelete(pendingDelete.id);
      setPendingDelete(null);
    } catch {
      // 错误提示由 App 统一 toast，这里保持确认态让用户能重试
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={confirming ? '确认删除项目？' : '项目管理'}
      subtitle={
        confirming && pendingDelete
          ? `将删除 data/${pendingDelete.id}.json 及其全部备份文件，不可恢复。`
          : `${projects.length} 个项目 · 数据都在本地 data/ 目录，切换项目不会丢任何东西`
      }
      onClose={handleClose}
      locked={deleting}
      maxWidth={confirming ? 480 : 780}
      footer={
        confirming ? (
          <>
            <button
              type="button"
              className="hx-btn"
              onClick={() => setPendingDelete(null)}
              disabled={deleting}
            >
              取消
            </button>
            <button
              type="button"
              className="hx-btn hx-btn-danger"
              onClick={() => void confirmDelete()}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Icon name="spinner" size={13} className="hx-spin" />
                  删除中…
                </>
              ) : (
                <>
                  <Icon name="trash" size={13} />
                  确认删除
                </>
              )}
            </button>
          </>
        ) : (
          <>
            <span className="hx-hint" style={{ marginRight: 'auto', fontSize: 11 }}>
              打开 = 切换当前项目；删除会连同该项目的备份一起清掉
            </span>
            <button type="button" className="hx-btn" onClick={handleClose}>
              关闭
            </button>
            <button type="button" className="hx-btn hx-btn-primary" onClick={onCreate}>
              <Icon name="plus" size={13} />
              新建项目
            </button>
          </>
        )
      }
    >
      {confirming && pendingDelete ? (
        <div className="hx-hint">
          项目：<span style={{ color: 'var(--strong)' }}>{pendingDelete.name}</span>
          <br />
          目标：{pendingDelete.targetName}
          <br />
          <br />
          删除后该项目下的资产、接口、矩阵记录、报告都会一起消失。
          <span style={{ color: 'var(--red)' }}> 这条操作不可撤销。</span>
        </div>
      ) : projects.length === 0 ? (
        <div className="hx-empty" style={{ padding: '26px 16px' }}>
          <Icon name="folder" size={20} />
          <div style={{ color: 'var(--strong)', fontSize: 13 }}>还没有项目</div>
          <div>点下面「＋ 新建项目」建一个，填项目名称、目标名称、模式三项就能开工。</div>
        </div>
      ) : (
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          <table className="hx-table">
            <thead>
              <tr>
                <th style={{ width: '26%' }}>项目</th>
                <th style={{ width: '20%' }}>目标</th>
                <th style={{ width: '12%' }}>模式</th>
                <th style={{ width: '10%' }}>状态</th>
                <th style={{ width: '14%' }}>更新时间</th>
                <th style={{ width: '18%', textAlign: 'right' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => {
                const isActive = project.id === activeProjectId;
                return (
                  <tr key={project.id}>
                    <td>
                      <div className="hx-row" style={{ gap: 6 }}>
                        <span style={{ color: 'var(--strong)' }}>{project.name}</span>
                        {isActive ? <span className="hx-badge hx-badge-active">当前</span> : null}
                      </div>
                      <div className="hx-mono" style={{ fontSize: 10, color: 'var(--dim)' }}>
                        {project.id}
                      </div>
                    </td>
                    <td style={{ color: 'var(--txt)' }}>{project.targetName}</td>
                    <td>
                      <span
                        className={`hx-badge ${
                          project.mode === 'lock' ? 'hx-badge-lock' : 'hx-badge-free'
                        }`}
                        title={MODE_META[project.mode].desc}
                      >
                        {MODE_META[project.mode].label}
                      </span>
                    </td>
                    <td>
                      <span className="hx-badge">{PROJECT_STATUS_LABEL[project.status]}</span>
                    </td>
                    <td title={formatDateTime(project.updatedAt)}>
                      <span className="hx-mono" style={{ fontSize: 11, color: 'var(--dim)' }}>
                        {formatRelative(project.updatedAt)}
                      </span>
                    </td>
                    <td>
                      <div className="hx-row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                        <button
                          type="button"
                          className="hx-btn hx-btn-sm"
                          onClick={() => onOpen(project.id)}
                          disabled={isActive || deleting}
                          title={isActive ? '已经是当前项目' : '切换到这个项目'}
                        >
                          打开
                          <Icon name="arrowRight" size={12} />
                        </button>
                        <button
                          type="button"
                          className="hx-btn hx-btn-sm hx-btn-danger"
                          onClick={() => setPendingDelete(project)}
                          disabled={deleting}
                          title="删除项目"
                        >
                          <Icon name="trash" size={12} />
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
