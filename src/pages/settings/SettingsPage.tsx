/**
 * 极简设置页：主题 / 单项目 JSON 导出导入 / 手动备份。
 *
 * 不做知识库路径、换 skill、模块映射、断链检测或任何目录配置。
 */

import { useRef, useState } from 'react';

import type { ProjectData } from '../../../shared/types';
import { Icon } from '../../components/Icons';
import { useToast } from '../../components/Toast';
import { api, toErrorText } from '../../lib/api';
import type { Theme } from '../../lib/theme';

export interface SettingsPageProps {
  projectId: string;
  projectName: string;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onRefresh: () => Promise<void>;
}

function safeFileBase(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\r\n]/g, '-')
    .trim()
    .replace(/\s+/g, ' ');
  return cleaned || 'project';
}

function dateStamp(): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
}

export function SettingsPage({
  projectId,
  projectName,
  theme,
  onThemeChange,
  onRefresh,
}: SettingsPageProps): JSX.Element {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState<'export' | 'import' | 'backup' | null>(null);
  const [backupFile, setBackupFile] = useState('');

  const exportProject = async (): Promise<void> => {
    setBusy('export');
    try {
      const data = await api.getProject(projectId);
      const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${safeFileBase(projectName)}-${dateStamp()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast('success', '项目 JSON 已导出');
    } catch (error) {
      toast('error', toErrorText(error));
    } finally {
      setBusy(null);
    }
  };

  const importProject = async (file: File): Promise<void> => {
    setBusy('import');
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        toast('error', '不是合法的 JSON 文件');
        return;
      }
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('project' in parsed) ||
        typeof (parsed as { project?: unknown }).project !== 'object'
      ) {
        toast('error', '导入文件缺少 project 对象');
        return;
      }
      await api.importProject(projectId, parsed as ProjectData);
      toast('success', '项目数据已导入');
      await onRefresh();
    } catch (error) {
      toast('error', toErrorText(error));
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const backup = async (): Promise<void> => {
    setBusy('backup');
    try {
      const result = await api.backupProject(projectId);
      setBackupFile(result.file);
      toast('success', '项目数据已备份');
    } catch (error) {
      toast('error', toErrorText(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="hx-content-inner">
      <div className="hx-page-head">
        <div>
          <h1 className="hx-page-title">设置</h1>
          <div className="hx-crumb">项目 {projectId}</div>
        </div>
        <div className="hx-spacer" />
      </div>

      <div className="hx-settings-grid">
        <section className="hx-card">
          <h2 className="hx-card-title">
            <Icon name="sun" size={14} />
            主题
          </h2>
          <div className="hx-row" style={{ gap: 8 }}>
            <button
              type="button"
              className={`hx-btn${theme === 'dark' ? ' hx-btn-primary' : ''}`}
              onClick={() => onThemeChange('dark')}
            >
              <Icon name="moon" size={13} />
              深色
            </button>
            <button
              type="button"
              className={`hx-btn${theme === 'light' ? ' hx-btn-primary' : ''}`}
              onClick={() => onThemeChange('light')}
            >
              <Icon name="sun" size={13} />
              浅色
            </button>
          </div>
        </section>

        <section className="hx-card">
          <h2 className="hx-card-title">
            <Icon name="folder" size={14} />
            单项目 JSON
          </h2>
          <div className="hx-row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="hx-btn"
              onClick={() => void exportProject()}
              disabled={busy !== null}
            >
              导出当前项目
            </button>
            <button
              type="button"
              className="hx-btn"
              onClick={() => inputRef.current?.click()}
              disabled={busy !== null}
            >
              导入 JSON
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importProject(file);
              }}
            />
          </div>
          <div className="hx-hint" style={{ marginTop: 8 }}>
            导出只包含当前项目全量数据；导入会覆盖当前项目，写入前由 store 自动备份旧文件。
          </div>
        </section>

        <section className="hx-card">
          <h2 className="hx-card-title">
            <Icon name="check" size={14} />
            手动备份
          </h2>
          <button
            type="button"
            className="hx-btn hx-btn-primary"
            onClick={() => void backup()}
            disabled={busy !== null}
          >
            备份当前项目
          </button>
          {backupFile ? (
            <div className="hx-mono hx-hint" style={{ marginTop: 8, wordBreak: 'break-all' }}>
              已备份到 {backupFile}
            </div>
          ) : (
            <div className="hx-hint" style={{ marginTop: 8 }}>
              备份文件写入 data/backup/，不进入版本库。
            </div>
          )}
        </section>
      </div>

      <div className="hx-hint" style={{ marginTop: 12 }}>
        数据保存在程序目录 data/ 下；设置页不提供任何路径配置。
      </div>
    </div>
  );
}
