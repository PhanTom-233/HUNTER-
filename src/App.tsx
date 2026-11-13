/**
 * 应用外壳：项目列表 / 当前项目 / 页面切换 / 主题 / 弹窗。
 *
 * 本轮只有「总览」是真实页面，其余走占位页；无项目时一律落到 ProjectsPage。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { NAV_ITEM_MAP, STORAGE_KEY_ACTIVE_PROJECT } from '../shared/constants';
import type { PageKey } from '../shared/constants';
import type {
  Asset,
  CreateProjectInput,
  Endpoint,
  ProjectData,
  ProjectSummary,
} from '../shared/types';
import { Icon } from './components/Icons';
import { ProjectDialog } from './components/ProjectDialog';
import { ProjectManager } from './components/ProjectManager';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { useToast } from './components/Toast';
import { api, toErrorText } from './lib/api';
import { initTheme, setTheme, toggleTheme } from './lib/theme';
import type { Theme } from './lib/theme';
import { AssetsPage } from './pages/assets/AssetsPage';
import { AiReadPage } from './pages/ai-read/AiReadPage';
import { CopilotPage } from './pages/copilot/CopilotPage';
import { DashboardPage } from './pages/DashboardPage';
import { EndpointsPage } from './pages/endpoints/EndpointsPage';
import { GraphPage } from './pages/graph/GraphPage';
import { MatrixPage } from './pages/matrix/MatrixPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ReportsPage } from './pages/reports/ReportsPage';
import { SeedsPage } from './pages/seeds/SeedsPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { WorkflowPage } from './pages/workflow/WorkflowPage';

function readStoredActiveId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY_ACTIVE_PROJECT);
  } catch {
    return null;
  }
}

function writeStoredActiveId(projectId: string | null): void {
  try {
    if (projectId) window.localStorage.setItem(STORAGE_KEY_ACTIVE_PROJECT, projectId);
    else window.localStorage.removeItem(STORAGE_KEY_ACTIVE_PROJECT);
  } catch {
    // localStorage 不可用时只影响「刷新后自动打开」，不阻塞主流程
  }
}

export default function App(): JSX.Element {
  const toast = useToast();

  const [theme, setThemeState] = useState<Theme>(() => initTheme());
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeData, setActiveData] = useState<ProjectData | null>(null);
  const [page, setPage] = useState<PageKey>('overview');
  const [booting, setBooting] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  /** 资产库 / 接口清单「在图谱中查看」：目标节点 id，图谱页聚焦后清空 */
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);

  /* ---------------- 启动：读项目列表 + 决定当前项目 ---------------- */

  const bootstrap = useCallback(async (): Promise<void> => {
    setBooting(true);
    setBootError(null);
    try {
      const payload = await api.listProjects();
      setProjects(payload.projects);
      const stored = readStoredActiveId();
      const preferred = [payload.activeProjectId, stored].find(
        (id): id is string =>
          typeof id === 'string' && payload.projects.some((project) => project.id === id),
      );
      const next = preferred ?? payload.projects[0]?.id ?? null;
      setActiveProjectId(next);
      writeStoredActiveId(next);
    } catch (error) {
      setBootError(toErrorText(error));
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  /* ---------------- 当前项目全量数据 ---------------- */

  useEffect(() => {
    if (!activeProjectId) {
      setActiveData(null);
      return undefined;
    }
    let cancelled = false;
    setDataLoading(true);
    api
      .getProject(activeProjectId)
      .then((data) => {
        if (!cancelled) setActiveData(data);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setActiveData(null);
        toast('error', toErrorText(error));
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, toast]);

  /* ---------------- 交互 ---------------- */

  const handleSelectProject = useCallback(
    async (projectId: string): Promise<void> => {
      try {
        await api.activateProject(projectId);
        setActiveProjectId(projectId);
        writeStoredActiveId(projectId);
        setPage('overview');
      } catch (error) {
        toast('error', toErrorText(error));
      }
    },
    [toast],
  );

  const handleCreateProject = useCallback(
    async (input: CreateProjectInput): Promise<void> => {
      try {
        const summary = await api.createProject(input);
        await api.activateProject(summary.id);
        setProjects((prev) => [summary, ...prev.filter((item) => item.id !== summary.id)]);
        setActiveProjectId(summary.id);
        writeStoredActiveId(summary.id);
        setPage('overview');
        setDialogOpen(false);
        toast('success', `项目「${summary.name}」已创建`);
      } catch (error) {
        toast('error', toErrorText(error));
        throw error;
      }
    },
    [toast],
  );

  const handleDeleteProject = useCallback(
    async (projectId: string): Promise<void> => {
      try {
        await api.deleteProject(projectId);
        setProjects((prev) => prev.filter((item) => item.id !== projectId));
        if (activeProjectId === projectId) {
          setActiveProjectId(null);
          setActiveData(null);
          writeStoredActiveId(null);
          setPage('overview');
        }
        toast('success', '项目已删除');
      } catch (error) {
        toast('error', toErrorText(error));
        throw error;
      }
    },
    [activeProjectId, toast],
  );

  const handleToggleTheme = useCallback((): void => {
    setThemeState((current) => toggleTheme(current));
  }, []);

  const handleThemeChange = useCallback((next: Theme): void => {
    setTheme(next);
    setThemeState(next);
  }, []);

  /** 资产库保存 / 删除后重新拉项目全量数据（资产是 ProjectData 的一部分） */
  const reloadActiveData = useCallback(async (): Promise<void> => {
    if (!activeProjectId) return;
    try {
      const data = await api.getProject(activeProjectId);
      setActiveData(data);
    } catch (error) {
      toast('error', toErrorText(error));
    }
  }, [activeProjectId, toast]);

  /** 资产库 → 图谱：中间件资产是 mw 节点，其余是 site 节点 */
  const handleViewInGraph = useCallback((asset: Asset): void => {
    setFocusNodeId(asset.category === 'middleware' ? `mw:${asset.id}` : `site:${asset.id}`);
    setPage('graph');
  }, []);

  /** 接口清单 → 图谱：聚焦 api 节点 */
  const handleViewEndpointInGraph = useCallback((endpoint: Endpoint): void => {
    setFocusNodeId(`api:${endpoint.id}`);
    setPage('graph');
  }, []);

  /* ---------------- 渲染 ---------------- */

  const activeSummary = useMemo<ProjectSummary | null>(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  );

  const navItem = NAV_ITEM_MAP[page];

  let body: JSX.Element;
  if (booting) {
    body = (
      <div className="hx-content-inner">
        <div className="hx-empty">
          <Icon name="spinner" size={20} className="hx-spin" />
          <div>正在读取本地项目索引…</div>
        </div>
      </div>
    );
  } else if (bootError) {
    body = (
      <div className="hx-content-inner">
        <div className="hx-empty">
          <Icon name="alert" size={20} />
          <div style={{ color: 'var(--red)' }}>{bootError}</div>
          <div>后端没起来的话，前端读不到任何数据。请确认 `npm run dev` 的两个进程都在跑。</div>
          <button type="button" className="hx-btn" onClick={() => void bootstrap()}>
            <Icon name="spinner" size={13} />
            重新连接
          </button>
        </div>
      </div>
    );
  } else if (!activeSummary) {
    body = (
      <ProjectsPage
        projects={projects}
        onCreate={() => setDialogOpen(true)}
        onOpen={(projectId) => void handleSelectProject(projectId)}
        onDelete={handleDeleteProject}
      />
    );
  } else if (page === 'assets') {
    body = (
      <AssetsPage
        projectId={activeSummary.id}
        assets={activeData?.assets ?? []}
        loading={dataLoading}
        onRefresh={reloadActiveData}
        onViewInGraph={handleViewInGraph}
      />
    );
  } else if (page === 'endpoints') {
    body = (
      <EndpointsPage
        projectId={activeSummary.id}
        assets={activeData?.assets ?? []}
        endpoints={activeData?.endpoints ?? []}
        tests={activeData?.tests ?? []}
        features={activeData?.features ?? []}
        loading={dataLoading}
        onRefresh={reloadActiveData}
        onViewInGraph={handleViewEndpointInGraph}
      />
    );
  } else if (page === 'matrix') {
    body = (
      <MatrixPage
        projectId={activeSummary.id}
        assets={activeData?.assets ?? []}
        endpoints={activeData?.endpoints ?? []}
        tests={activeData?.tests ?? []}
        loading={dataLoading}
        onRefresh={reloadActiveData}
      />
    );
  } else if (page === 'copilot') {
    body = (
      <CopilotPage
        projectId={activeSummary.id}
        data={activeData}
        loading={dataLoading}
        onNavigate={setPage}
      />
    );
  } else if (page === 'reports') {
    body = <ReportsPage projectId={activeSummary.id} onRefresh={reloadActiveData} />;
  } else if (page === 'ai-read') {
    body = <AiReadPage projectId={activeSummary.id} />;
  } else if (page === 'settings') {
    body = (
      <SettingsPage
        projectId={activeSummary.id}
        projectName={activeSummary.name}
        theme={theme}
        onThemeChange={handleThemeChange}
        onRefresh={reloadActiveData}
      />
    );
  } else if (page === 'seeds') {
    body = (
      <SeedsPage
        projectId={activeSummary.id}
        data={activeData}
        loading={dataLoading}
        onRefresh={reloadActiveData}
        onNavigate={setPage}
      />
    );
  } else if (page === 'workflow') {
    body = (
      <WorkflowPage
        projectId={activeSummary.id}
        data={activeData}
        loading={dataLoading}
        onRefresh={reloadActiveData}
        onNavigate={setPage}
      />
    );
  } else if (page === 'graph') {
    body = (
      <GraphPage
        key={activeSummary.id}
        projectId={activeSummary.id}
        data={activeData}
        loading={dataLoading}
        onRefresh={reloadActiveData}
        focusNodeId={focusNodeId}
        onFocusHandled={() => setFocusNodeId(null)}
        onGoAssets={() => setPage('assets')}
      />
    );
  } else if (!navItem.implemented) {
    body = <PlaceholderPage item={navItem} onBack={() => setPage('overview')} />;
  } else {
    body = (
      <DashboardPage data={activeData} loading={dataLoading} onNavigate={setPage} />
    );
  }

  return (
    <div className="hx-app">
      {/* 没有项目时高亮固定在「总览」，提示先建项目 */}
      <Sidebar activePage={activeSummary ? page : 'overview'} onNavigate={setPage} />
      <div className="hx-main">
        <Topbar
          projects={projects}
          activeProject={activeSummary}
          onSelectProject={(projectId) => void handleSelectProject(projectId)}
          onCreateProject={() => setDialogOpen(true)}
          onManageProjects={() => setManageOpen(true)}
          theme={theme}
          onToggleTheme={handleToggleTheme}
        />
        <main className={page === 'graph' ? 'hx-content hx-content-graph' : 'hx-content'}>
          {body}
        </main>
      </div>

      <ProjectManager
        open={manageOpen}
        projects={projects}
        activeProjectId={activeProjectId}
        onClose={() => setManageOpen(false)}
        onOpen={(projectId) => {
          setManageOpen(false);
          void handleSelectProject(projectId);
        }}
        onDelete={handleDeleteProject}
        onCreate={() => {
          setManageOpen(false);
          setDialogOpen(true);
        }}
      />

      <ProjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleCreateProject}
      />
    </div>
  );
}
