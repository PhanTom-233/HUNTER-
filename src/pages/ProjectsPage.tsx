/**
 * 无项目时的落地页：价值主张 + 两种模式说明 + 已有项目列表 + 新建入口。
 */

import { useState } from 'react';

import { MODE_META, PROJECT_STATUS_LABEL } from '../../shared/constants';
import type { ProjectSummary } from '../../shared/types';
import { Icon } from '../components/Icons';
import { Modal } from '../components/Modal';
import { formatDateTime, formatRelative } from '../lib/format';

export interface ProjectsPageProps {
  projects: ProjectSummary[];
  onCreate: () => void;
  onOpen: (projectId: string) => void;
  onDelete: (projectId: string) => Promise<void>;
}

export function ProjectsPage({
  projects,
  onCreate,
  onOpen,
  onDelete,
}: ProjectsPageProps): JSX.Element {
  const [pending, setPending] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async (): Promise<void> => {
    if (!pending) return;
    setDeleting(true);
    try {
      await onDelete(pending.id);
      setPending(null);
    } catch {
      // 父级已经 toast 过错误
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="hx-content-inner">
      <div className="hx-hero">
        <div className="hx-hero-eyebrow">HUNTER · 阶段 4 交付 · 接口清单可用</div>
        <h1 className="hx-hero-title">
          先把项目立起来，
          <br />
          后面每一步才有落点。
        </h1>
        <p className="hx-hero-desc">
          这个工具只做三件事：记录你打到哪了、按方法论提示下一步、把该交的报告凑齐。
          它不内置扫描器、不自动发包、不联网。你负责打，它负责不漏、不重、不偏科。
        </p>
      </div>

      <section className="hx-section">
        <h2 className="hx-section-title">两种模式，先想清楚这次怎么打</h2>
        <div className="hx-grid-2">
          <div className="hx-card">
            <div className="hx-card-title">
              <Icon name="lock" size={14} />
              锁面 · {MODE_META.lock.short}
            </div>
            <p className="hx-hint" style={{ margin: 0 }}>
              {MODE_META.lock.desc}
            </p>
            <div className="hx-hint" style={{ marginTop: 10, color: 'var(--dim)' }}>
              适合：SRC 项目范围写得很死、甲方只看授权域名的场景。
            </div>
          </div>
          <div className="hx-card">
            <div className="hx-card-title">
              <Icon name="free" size={14} />
              自由跳 · {MODE_META.free.short}
            </div>
            <p className="hx-hint" style={{ margin: 0 }}>
              {MODE_META.free.desc}
            </p>
            <div className="hx-hint" style={{ marginTop: 10, color: 'var(--dim)' }}>
              适合：需要顺着集团、子公司、备案一路扩面的 SRC 场景。
            </div>
          </div>
        </div>
      </section>

      <section className="hx-section">
        <div className="hx-row" style={{ marginBottom: 10 }}>
          <h2 className="hx-section-title" style={{ margin: 0 }}>
            已有项目（{projects.length}）
          </h2>
          <div className="hx-spacer" />
          <button type="button" className="hx-btn hx-btn-primary" onClick={onCreate}>
            <Icon name="plus" size={13} />
            新建项目
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="hx-empty">
            <Icon name="folder" size={22} />
            <div style={{ color: 'var(--strong)', fontSize: 14 }}>还没有项目</div>
            <div style={{ maxWidth: 520, lineHeight: 1.8 }}>
              下一步：点「新建项目」，填三项就能开工 ——「项目名称」（例：某集团_SRC挖洞）、
              「目标名称」（这次打的是谁）、「模式」（锁面 / 自由跳）。
              授权范围说明和 SRC 地址可以先留空，后面在项目信息里补。
            </div>
            <button type="button" className="hx-btn hx-btn-primary" onClick={onCreate}>
              <Icon name="plus" size={13} />
              新建项目
            </button>
          </div>
        ) : (
          <div className="hx-card" style={{ padding: '4px 6px' }}>
            <table className="hx-table">
              <thead>
                <tr>
                  <th style={{ width: '24%' }}>项目</th>
                  <th style={{ width: '20%' }}>目标</th>
                  <th style={{ width: '10%' }}>模式</th>
                  <th style={{ width: '10%' }}>状态</th>
                  <th style={{ width: '16%' }}>更新时间</th>
                  <th style={{ width: '20%', textAlign: 'right' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id}>
                    <td>
                      <div style={{ color: 'var(--strong)' }}>{project.name}</div>
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
                      <span className="hx-badge">
                        {PROJECT_STATUS_LABEL[project.status]}
                      </span>
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
                        >
                          打开
                          <Icon name="arrowRight" size={12} />
                        </button>
                        <button
                          type="button"
                          className="hx-btn hx-btn-sm hx-btn-danger"
                          onClick={() => setPending(project)}
                          title="删除项目"
                        >
                          <Icon name="trash" size={12} />
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="hx-section">
        <div className="hx-card-flat">
          <div className="hx-card-title">
            <Icon name="alert" size={14} />
            使用边界（写死在 README 里，也写在这里）
          </div>
          <ul className="hx-ul" style={{ paddingLeft: 16, margin: 0 }}>
            <li>本程序只做记录、编排、建议：不内置扫描器、不自动发包、不爆破、不对目标发起任何请求。</li>
            <li>所有「查询方向」都是给你复制到 FOFA / crt.sh 手动执行的语句，程序自身不联网。</li>
            <li>仅用于授权范围内的 SRC 项目、自有资产或书面授权目标。</li>
            <li>数据全部存在本地 data/ 目录，不上传任何地方。</li>
          </ul>
        </div>
      </section>

      <Modal
        open={pending !== null}
        title="确认删除项目？"
        subtitle={
          pending
            ? `将删除 data/${pending.id}.json 及其全部备份文件，不可恢复。`
            : undefined
        }
        onClose={() => {
          if (!deleting) setPending(null);
        }}
        locked={deleting}
        maxWidth={480}
        footer={
          <>
            <button
              type="button"
              className="hx-btn"
              onClick={() => setPending(null)}
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
        }
      >
        {pending ? (
          <div className="hx-hint">
            项目：<span style={{ color: 'var(--strong)' }}>{pending.name}</span>
            <br />
            目标：{pending.targetName}
            <br />
            <br />
            删除后该项目下的资产、接口、矩阵记录、报告都会一起消失。
            <span style={{ color: 'var(--red)' }}> 这条操作不可撤销。</span>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
