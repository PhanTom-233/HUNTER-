/**
 * 顶栏 48px：项目切换器 + 模式徽章 + 主题切换。
 */

import { MODE_META } from '../../shared/constants';
import type { ProjectSummary } from '../../shared/types';
import type { Theme } from '../lib/theme';
import { Icon } from './Icons';

export interface TopbarProps {
  projects: ProjectSummary[];
  activeProject: ProjectSummary | null;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  /** 打开「项目管理」弹窗（打开 / 删除 / 新建的统一入口） */
  onManageProjects: () => void;
  theme: Theme;
  onToggleTheme: () => void;
}

const NEW_PROJECT_VALUE = '__new__';
const MANAGE_PROJECT_VALUE = '__manage__';
const NO_PROJECT_VALUE = '';

export function Topbar({
  projects,
  activeProject,
  onSelectProject,
  onCreateProject,
  onManageProjects,
  theme,
  onToggleTheme,
}: TopbarProps): JSX.Element {
  const mode = activeProject ? MODE_META[activeProject.mode] : null;
  const currentValue = activeProject ? activeProject.id : NO_PROJECT_VALUE;

  return (
    <header className="hx-topbar">
      <select
        className="hx-select"
        style={{ width: 220, height: 28, padding: '0 26px 0 9px', fontSize: 12 }}
        value={currentValue}
        onChange={(event) => {
          const value = event.target.value;
          // 受控组件：选完「管理 / 新建」后显式回到当前项目，避免下拉视觉上停在动作项
          event.target.value = currentValue;
          if (value === MANAGE_PROJECT_VALUE) {
            onManageProjects();
            return;
          }
          if (value === NEW_PROJECT_VALUE) {
            onCreateProject();
            return;
          }
          if (value === NO_PROJECT_VALUE) return;
          onSelectProject(value);
        }}
        title="切换当前项目（选「项目管理…」可以打开 / 删除项目）"
        aria-label="当前项目"
      >
        <option value={NO_PROJECT_VALUE}>未选择项目</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
        <option value={MANAGE_PROJECT_VALUE}>≣ 项目管理…</option>
        <option value={NEW_PROJECT_VALUE}>＋ 新建项目</option>
      </select>

      {mode && activeProject ? (
        <span
          className={`hx-badge ${activeProject.mode === 'lock' ? 'hx-badge-lock' : 'hx-badge-free'}`}
          title={mode.desc}
        >
          <Icon name={activeProject.mode === 'lock' ? 'lock' : 'free'} size={11} />
          {mode.label}
        </span>
      ) : null}

      <div className="hx-spacer" />

      <button
        type="button"
        className="hx-icon-btn"
        onClick={onToggleTheme}
        title={theme === 'dark' ? '切到浅色主题' : '切到深色主题'}
        aria-label={theme === 'dark' ? '切到浅色主题' : '切到深色主题'}
      >
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
      </button>
    </header>
  );
}
