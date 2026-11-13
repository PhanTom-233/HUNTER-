/**
 * 第 7 页「资产图谱」。
 *
 * 装配顺序：
 * 1. `buildNodes` 把 ProjectData 变成节点 + 拓扑边（纯函数，可单测）；
 * 2. `layout` 规划坐标（首次 elk 分层；之后存档优先，只补新节点）；
 * 3. React Flow 负责拖拽 / 连边 / 缩放；本页负责工具栏、过滤、路径、抽屉、HUD、图例。
 *
 * 明确不做（3.12.8）：不自动推断横向关联、不做 3D、不引图数据库、不替代资产库表格。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import type {
  Connection,
  Edge,
  EdgeMouseHandler,
  NodeMouseHandler,
  OnNodeDrag,
} from '@xyflow/react';

import { MODE_META, RELATION_TYPES, SEVERITY_COLOR, CATEGORIES } from '../../../shared/constants';
import type { ProjectData, RelationType } from '../../../shared/types';
import { Icon } from '../../components/Icons';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { buildGraph } from './buildNodes';
import type { GraphNode } from './buildNodes';
import { manualFlowEdge, pathFlowEdge, topologyEdge } from './edges';
import { planPositions, relayout } from './layout';
import type { LayoutMode, XY } from './layout';
import { KIND_LABEL, nodeTypes } from './nodes';
import { useGraphStore } from './useGraphStore';

export interface GraphPageProps {
  projectId: string;
  data: ProjectData | null;
  loading: boolean;
  onRefresh: () => Promise<void>;
  /** 从资产库「在图谱中查看」传进来，聚焦后回调清空 */
  focusNodeId: string | null;
  onFocusHandled: () => void;
  /** 空状态「去资产库」 */
  onGoAssets: () => void;
  /** 预留：从报告定位时给一条节点链（本轮 reports 为空） */
  focusPath?: string[];
}

const EMPTY_GRAPH = {
  nodes: [] as GraphNode[],
  edges: [] as Edge[],
  counts: { nodes: 0, edges: 0, covered: 0, holes: 0 },
  skipped: 0,
  unassignedAssetIds: [] as string[],
};

const CLUSTER_THRESHOLD = 80;

/** 顶部 HUD / 提示条 / 工具栏是浮层，fitView 必须给它们留出空间，否则根域会被盖住 */
const FIT_PADDING = { top: '160px', right: '24px', bottom: '24px', left: '24px' } as const;

/** MiniMap 节点色用主题语义变量，亮色下自动换成更深一档 */
const MINIMAP_COLORS: Record<string, string> = {
  root: 'var(--blue)',
  domain: 'var(--blue)',
  host: 'var(--amber)',
  site: 'var(--cyan)',
  mw: 'var(--amber)',
  feature: 'var(--cyan)',
  api: 'var(--violet)',
  vuln: 'var(--red)',
};

type FilterMode = 'all' | 'hole' | 'uncovered';

interface ClusterResult {
  nodes: GraphNode[];
  edges: Edge[];
  /** nodeId -> cluster nodeId（聚焦 / 定位时反查用） */
  map: Map<string, string>;
  folded: number;
}

/** 节点 >80 时按 rootId 收成簇节点；双击簇节点展开 */
function applyClusters(
  nodes: GraphNode[],
  edges: Edge[],
  expandedRoots: Set<string>,
): ClusterResult {
  if (nodes.length <= CLUSTER_THRESHOLD) {
    return { nodes, edges, map: new Map(), folded: 0 };
  }

  const groups = new Map<string, GraphNode[]>();
  for (const node of nodes) {
    const key = node.data.rootId || node.id;
    const list = groups.get(key) ?? [];
    list.push(node);
    groups.set(key, list);
  }

  const visible: GraphNode[] = [];
  const clusters: GraphNode[] = [];
  const map = new Map<string, string>();

  for (const [rootId, members] of groups) {
    if (members.length <= 1 || expandedRoots.has(rootId)) {
      visible.push(...members);
      continue;
    }
    const clusterId = `cluster:${rootId}`;
    const avgX = members.reduce((sum, node) => sum + node.position.x, 0) / members.length;
    const avgY = members.reduce((sum, node) => sum + node.position.y, 0) / members.length;
    const anchor = members.find((node) => node.id === rootId) ?? members[0];
    clusters.push({
      id: clusterId,
      type: 'asset',
      position: { x: avgX, y: avgY },
      data: {
        kind: 'root',
        title: anchor.data.title,
        sub: `已折叠 ${members.length} 个节点 · 双击展开`,
        covered: false,
        hole: members.some((node) => node.data.hole),
        rootId,
      },
    });
    for (const member of members) map.set(member.id, clusterId);
  }

  if (clusters.length === 0) return { nodes, edges, map, folded: 0 };

  const remapped = new Map<string, Edge>();
  for (const edge of edges) {
    const source = map.get(edge.source) ?? edge.source;
    const target = map.get(edge.target) ?? edge.target;
    if (source === target) continue;
    const id = `c:${source}->${target}`;
    if (remapped.has(id)) continue;
    remapped.set(id, topologyEdge(id, source, target));
  }

  return {
    nodes: [...visible, ...clusters],
    edges: [...remapped.values()],
    map,
    folded: nodes.length - visible.length,
  };
}

/** 沿拓扑边往上补祖先，保证过滤后仍能看到归属链 */
function withAncestors(seed: Set<string>, edges: Edge[]): Set<string> {
  const parent = new Map<string, string>();
  for (const edge of edges) {
    if (!parent.has(edge.target)) parent.set(edge.target, edge.source);
  }
  const result = new Set(seed);
  for (const id of seed) {
    let cursor = parent.get(id);
    while (cursor && !result.has(cursor)) {
      result.add(cursor);
      cursor = parent.get(cursor);
    }
  }
  return result;
}

function GraphPageInner({
  projectId,
  data,
  loading,
  onRefresh,
  focusNodeId,
  onFocusHandled,
  onGoAssets,
  focusPath,
}: GraphPageProps): JSX.Element {
  const toast = useToast();
  const flow = useReactFlow<GraphNode, Edge>();

  const built = useMemo(() => (data ? buildGraph(data) : EMPTY_GRAPH), [data]);
  const store = useGraphStore(projectId, data?.manualEdges ?? []);

  const [nodes, setNodes, onNodesChange] = useNodesState<GraphNode>([]);
  const [positions, setPositions] = useState<Record<string, XY>>({});
  const [expandedRoots, setExpandedRoots] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<LayoutMode>('layered');
  const [pendingMode, setPendingMode] = useState<LayoutMode>('layered');

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [edgeDraftRelation, setEdgeDraftRelation] = useState<RelationType>(RELATION_TYPES[0]);
  const [edgeDraftNote, setEdgeDraftNote] = useState('');

  const [relation, setRelation] = useState<RelationType | ''>(RELATION_TYPES[0]);
  const [pendingConnection, setPendingConnection] = useState<Connection | null>(null);

  const [pathMode, setPathMode] = useState(false);
  const [pathNodes, setPathNodes] = useState<string[]>([]);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [hideDead, setHideDead] = useState(false);
  const [relationFilter, setRelationFilter] = useState<RelationType | 'all'>('all');

  /* ---------------- 坐标：首次布局 / 存档优先 ---------------- */
  useEffect(() => {
    let cancelled = false;
    if (built.nodes.length === 0) {
      setPositions({});
      setNodes([]);
      return undefined;
    }
    void (async () => {
      const plan = await planPositions(built.nodes, built.edges, data?.graphPositions ?? [], mode);
      if (cancelled) return;
      setPositions(plan.positions);
      setNodes(
        built.nodes.map((node) => ({
          ...node,
          position: plan.positions[node.id] ?? { x: 0, y: 0 },
        })),
      );
      if (plan.saveAll) {
        await store.savePositionsNow(
          built.nodes.map((node) => ({
            nodeId: node.id,
            x: plan.positions[node.id]?.x ?? 0,
            y: plan.positions[node.id]?.y ?? 0,
          })),
        );
      }
      // React Flow 的 fitView 只认首次挂载；节点坐标是异步补上的，
      // 必须等一帧再手动 fit 一次，否则画面会停在「所有节点叠在原点」的视口。
      window.setTimeout(() => {
        void flow.fitView({ padding: FIT_PADDING, duration: 300 });
      }, 100);
    })();
    return () => {
      cancelled = true;
    };
    // 只在图结构 / 布局模式变化时重算；坐标存档变化不触发（否则拖拽会被重置）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built, mode]);

  /* ---------------- 折叠 / 展开 ---------------- */
  const clustered = useMemo<ClusterResult>(() => {
    const withPositions = built.nodes.map((node) => ({
      ...node,
      position: positions[node.id] ?? node.position,
    }));
    return applyClusters(withPositions, built.edges, expandedRoots);
  }, [built, positions, expandedRoots]);

  useEffect(() => {
    setNodes(clustered.nodes);
  }, [clustered, setNodes]);

  /* ---------------- 手动边 / 路径 / 过滤 ---------------- */
  const manualFlowEdges = useMemo(
    () => store.manualEdges.map((edge) => manualFlowEdge(edge)),
    [store.manualEdges],
  );

  const pathSet = useMemo(() => new Set(pathNodes), [pathNodes]);
  const pathPairs = useMemo(() => {
    const pairs = new Set<string>();
    for (let index = 0; index < pathNodes.length - 1; index += 1) {
      pairs.add(`${pathNodes[index]}->${pathNodes[index + 1]}`);
    }
    return pairs;
  }, [pathNodes]);

  const baseEdges = useMemo(() => {
    const merged = [...clustered.edges, ...manualFlowEdges];
    const visibleIds = new Set(nodes.map((node) => node.id));
    return merged.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target));
  }, [clustered.edges, manualFlowEdges, nodes]);

  const visibleIds = useMemo<Set<string> | null>(() => {
    // 折叠态下按簇节点判断，保持简单：折叠时不做有洞/未覆盖过滤
    if (clustered.folded > 0) return null;
    let seed: Set<string> | null = null;
    if (filterMode === 'hole') {
      seed = new Set(
        nodes.filter((node) => node.data.hole || node.data.kind === 'vuln').map((node) => node.id),
      );
    } else if (filterMode === 'uncovered') {
      seed = new Set(
        nodes
          .filter(
            (node) =>
              (node.data.kind === 'site' || node.data.kind === 'mw') && !node.data.covered,
          )
          .map((node) => node.id),
      );
    }
    if (seed) seed = withAncestors(seed, baseEdges);
    if (hideDead) {
      const dead = new Set(
        nodes
          .filter((node) => node.data.aliveStatus === '死链')
          .map((node) => node.id),
      );
      if (dead.size > 0) {
        const children = new Map<string, string[]>();
        for (const edge of baseEdges) {
          const list = children.get(edge.source) ?? [];
          list.push(edge.target);
          children.set(edge.source, list);
        }
        const queue = [...dead];
        while (queue.length > 0) {
          const current = queue.shift() as string;
          for (const child of children.get(current) ?? []) {
            if (!dead.has(child)) {
              dead.add(child);
              queue.push(child);
            }
          }
        }
        seed = seed ? new Set([...seed].filter((id) => !dead.has(id))) : new Set(
          [...nodes.map((node) => node.id)].filter((id) => !dead.has(id)),
        );
      }
    }
    return seed;
  }, [clustered.folded, filterMode, hideDead, nodes, baseEdges]);

  const viewNodes = useMemo(() => {
    const filtered = visibleIds ? nodes.filter((node) => visibleIds.has(node.id)) : nodes;
    return filtered.map((node) => ({
      ...node,
      // 显式标可拖：避免上层 node 对象被替换后 draggable 变成 undefined 的边缘情况
      draggable: true,
      style: {
        ...node.style,
        opacity: pathMode && pathNodes.length > 0 && !pathSet.has(node.id) ? 0.15 : 1,
        transition: 'opacity .25s',
      },
    }));
  }, [nodes, visibleIds, pathMode, pathNodes.length, pathSet]);

  const viewEdges = useMemo(() => {
    const visible = visibleIds
      ? baseEdges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target))
      : baseEdges;

    const pathEdges: Edge[] = [];
    for (let index = 0; index < pathNodes.length - 1; index += 1) {
      const source = pathNodes[index];
      const target = pathNodes[index + 1];
      if (!nodes.some((node) => node.id === source) || !nodes.some((node) => node.id === target)) {
        continue;
      }
      pathEdges.push(pathFlowEdge(`p:${source}->${target}`, source, target));
    }

    const keep = pathMode
      ? visible.filter((edge) => !pathPairs.has(`${edge.source}->${edge.target}`))
      : visible;

    const all = [...keep, ...(pathMode ? pathEdges : [])];
    return all.map((edge) => {
      const isManual = Boolean(edge.data && typeof edge.data === 'object' && 'manualId' in edge.data);
      let opacity = 1;
      if (pathMode && pathNodes.length > 0) {
        const inPath = pathSet.has(edge.source) && pathSet.has(edge.target);
        opacity = inPath ? 1 : 0.12;
      }
      if (isManual && relationFilter !== 'all') {
        const manualRelation = (edge.data as { relation?: RelationType }).relation;
        if (manualRelation !== relationFilter) opacity = Math.min(opacity, 0.12);
      }
      return {
        ...edge,
        style: { ...edge.style, opacity, transition: 'opacity .25s' },
      };
    });
  }, [baseEdges, visibleIds, pathMode, pathNodes, pathPairs, pathSet, relationFilter, nodes]);

  /* ---------------- 交互 ---------------- */
  const handleNodeClick = useCallback<NodeMouseHandler<GraphNode>>(
    (_event, node) => {
      if (pathMode) {
        setPathNodes((prev) => (prev.includes(node.id) ? prev : [...prev, node.id]));
        return;
      }
      setSelectedNodeId(node.id);
      setSelectedEdgeId(null);
    },
    [pathMode],
  );

  const handleNodeDoubleClick = useCallback<NodeMouseHandler<GraphNode>>(
    (_event, node) => {
      if (node.id.startsWith('cluster:')) {
        setExpandedRoots((prev) => new Set(prev).add(node.data.rootId));
        return;
      }
      const neighbors = new Set<string>([node.id]);
      for (const edge of viewEdges) {
        if (edge.source === node.id) neighbors.add(edge.target);
        if (edge.target === node.id) neighbors.add(edge.source);
      }
      void flow.fitView({
        nodes: [...neighbors].map((id) => ({ id })),
        duration: 320,
        padding: FIT_PADDING,
        maxZoom: 1.4,
      });
    },
    [flow, viewEdges],
  );

  const handleEdgeClick = useCallback<EdgeMouseHandler>(
    (_event, edge) => {
      const manualId = (edge.data as { manualId?: string } | undefined)?.manualId;
      if (!manualId) return;
      setSelectedEdgeId(manualId);
      setSelectedNodeId(null);
    },
    [],
  );

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, []);

  const handleNodeDragStop = useCallback<OnNodeDrag<GraphNode>>(
    (_event, node) => {
      if (node.id.startsWith('cluster:')) return; // 簇节点坐标是派生的，不落库
      setPositions((prev) => ({ ...prev, [node.id]: { x: node.position.x, y: node.position.y } }));
      store.queuePosition(node.id, node.position.x, node.position.y);
    },
    [store],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target) {
        toast('error', '起点和终点不能是同一个节点');
        return;
      }
      if (!relation) {
        setPendingConnection(connection);
        return;
      }
      void store.createEdge({
        source: connection.source,
        target: connection.target,
        relation,
      });
    },
    [relation, store, toast],
  );

  /* 选中手动边时同步草稿 */
  useEffect(() => {
    if (!selectedEdgeId) return;
    const edge = store.manualEdges.find((item) => item.id === selectedEdgeId);
    if (!edge) {
      setSelectedEdgeId(null);
      return;
    }
    setEdgeDraftRelation(edge.relation);
    setEdgeDraftNote(edge.note);
  }, [selectedEdgeId, store.manualEdges]);

  /* Ctrl+0 复位 / Esc 退出路径 */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        if (pendingConnection) {
          setPendingConnection(null);
          return;
        }
        if (pathMode) {
          setPathMode(false);
          setPathNodes([]);
          return;
        }
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        return;
      }
      if (event.ctrlKey && event.key === '0') {
        event.preventDefault();
        void flow.fitView({ padding: FIT_PADDING, duration: 300 });
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [flow, pathMode, pendingConnection]);

  /* 从资产库 / 报告定位 */
  useEffect(() => {
    if (!focusNodeId) return;
    const target = nodes.find((node) => node.id === focusNodeId);
    if (!target) {
      // 可能被折叠了：先展开所属根簇，等 nodes 更新后这个 effect 会重跑
      const raw = built.nodes.find((node) => node.id === focusNodeId);
      if (raw && clustered.map.has(focusNodeId)) {
        setExpandedRoots((prev) => new Set(prev).add(raw.data.rootId));
        return;
      }
      onFocusHandled();
      return;
    }
    setSelectedNodeId(focusNodeId);
    const timer = window.setTimeout(() => {
      void flow.fitView({
        nodes: [{ id: focusNodeId }],
        duration: 400,
        padding: FIT_PADDING,
        maxZoom: 1.35,
      });
      onFocusHandled();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [focusNodeId, nodes, built.nodes, clustered.map, flow, onFocusHandled]);

  /* 预留：从报告带一条路径过来 */
  useEffect(() => {
    if (!focusPath || focusPath.length === 0) return;
    setPathMode(true);
    setPathNodes(focusPath);
  }, [focusPath]);

  /* 布局切换 */
  const requestModeChange = (next: LayoutMode): void => {
    if (next === mode) return;
    if (next === 'layered') {
      // 切回分层：有存档坐标就不重排（3.12.4 #9）
      setMode('layered');
      setPendingMode('layered');
      return;
    }
    setPendingMode(next);
  };

  const confirmRelayout = async (): Promise<void> => {
    const next = pendingMode;
    const result = await relayout(built.nodes, built.edges, next);
    setPositions(result);
    setNodes(
      built.nodes.map((node) => ({
        ...node,
        position: result[node.id] ?? { x: 0, y: 0 },
      })),
    );
    setMode(next);
    setPendingMode(next);
    await store.savePositionsNow(
      built.nodes.map((node) => ({
        nodeId: node.id,
        x: result[node.id]?.x ?? 0,
        y: result[node.id]?.y ?? 0,
      })),
    );
    toast('success', next === 'layered' ? '已按分层重新排布' : '已按力导向（环形）重新排布');
  };

  /* 抽屉数据 */
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedAsset =
    data && selectedNode?.data.assetId
      ? data.assets.find((asset) => asset.id === selectedNode.data.assetId) ?? null
      : null;
  const selectedEndpoint =
    data && selectedNode?.data.endpointId
      ? data.endpoints.find((endpoint) => endpoint.id === selectedNode.data.endpointId) ?? null
      : null;
  const selectedReport =
    data && selectedNode?.data.reportId
      ? data.reports.find((report) => report.id === selectedNode.data.reportId) ?? null
      : null;
  const selectedEdge = selectedEdgeId
    ? store.manualEdges.find((edge) => edge.id === selectedEdgeId) ?? null
    : null;

  // 折叠数直接跟 nodes 走：展开后 nodes 里不再有 cluster:* 节点，HUD 必须同步消失
  const hasClusterNodes = nodes.some((node) => node.id.startsWith('cluster:'));
  const foldedCount = hasClusterNodes ? clustered.folded : 0;

  const saveSelectedEdge = async (): Promise<void> => {
    if (!selectedEdge) return;
    const updated = await store.updateEdge(selectedEdge.id, {
      relation: edgeDraftRelation,
      note: edgeDraftNote,
    });
    if (updated) toast('success', '关联已更新');
  };

  const deleteSelectedEdge = async (): Promise<void> => {
    if (!selectedEdge) return;
    const removed = await store.deleteEdge(selectedEdge.id);
    if (removed) {
      setSelectedEdgeId(null);
      toast('success', '关联已删除');
    }
  };

  /* ---------------- 渲染 ---------------- */
  if (!data) {
    return (
      <div className="hx-graph-page">
        <div className="hx-graph-empty">
          <Icon name="spinner" size={20} className="hx-spin" />
          <div>{loading ? '正在读取项目数据…' : '项目数据未加载'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`hx-graph-page${built.skipped > 0 ? ' has-skip' : ''}`}>
      <ReactFlow
        nodes={viewNodes}
        edges={viewEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handlePaneClick}
        onNodeDragStop={handleNodeDragStop}
        fitView
        fitViewOptions={{ padding: FIT_PADDING }}
        minZoom={0.25}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        nodesConnectable
        nodeDragThreshold={0}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="var(--graph-grid)"
        />
        <Controls
          showInteractive={false}
          position="bottom-left"
          className="hx-graph-controls"
        />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          maskColor="var(--graph-minimap-mask)"
          nodeColor={(node) =>
            MINIMAP_COLORS[(node.data as { kind?: string } | undefined)?.kind ?? 'site'] ??
            'var(--cyan)'
          }
          style={{
            background: 'var(--graph-minimap-bg)',
            border: '1px solid var(--graph-minimap-border)',
            borderRadius: 5,
          }}
        />
      </ReactFlow>

      {/* HUD */}
      <div className="hx-graph-hud">
        <span className="hx-graph-brand">
          ASSET <b>GRAPH</b> // {MODE_META[data.project.mode].label}
        </span>
        <span className="hx-graph-stat">
          节点 <b>{built.counts.nodes}</b>
        </span>
        <span className="hx-graph-stat">
          边 <b>{built.counts.edges + store.manualEdges.length}</b>
        </span>
        <span className="hx-graph-stat">
          已覆盖 <b>{built.counts.covered}</b>
        </span>
        <span className="hx-graph-stat">
          有洞 <b className="hole">{built.counts.holes}</b>
        </span>
        {foldedCount > 0 ? (
          <span className="hx-graph-folded">已折叠 {foldedCount} 个节点</span>
        ) : null}
      </div>

      {/* 无地址资产提示：不进图，但必须让用户知道为什么少了几条 */}
      {built.skipped > 0 ? (
        <div className="hx-graph-skip">
          <Icon name="alert" size={13} />
          <span>{built.skipped} 个资产缺少 host / IP，未入图</span>
          <button type="button" className="hx-btn hx-btn-sm" onClick={onGoAssets}>
            去资产库补全
          </button>
        </div>
      ) : null}

      {/* 工具栏 */}
      <div className="hx-graph-tools">
        <label>
          新边类型
          <select
            className="hx-select"
            value={relation}
            onChange={(event) => setRelation(event.target.value as RelationType | '')}
          >
            <option value="">请选择类型</option>
            {RELATION_TYPES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`hx-btn hx-btn-sm${pathMode ? ' hx-btn-primary' : ''}`}
          onClick={() => {
            setPathMode((value) => !value);
            setPathNodes([]);
          }}
        >
          路径模式
        </button>
        <label>
          布局
          <select
            className="hx-select"
            value={mode}
            onChange={(event) => requestModeChange(event.target.value as LayoutMode)}
          >
            <option value="layered">分层（elk）</option>
            <option value="force">力导向（环形）</option>
          </select>
        </label>
        <label>
          只看
          <select
            className="hx-select"
            value={filterMode}
            onChange={(event) => setFilterMode(event.target.value as FilterMode)}
          >
            <option value="all">全部节点</option>
            <option value="hole">有洞</option>
            <option value="uncovered">未覆盖</option>
          </select>
        </label>
        <label>
          关联
          <select
            className="hx-select"
            value={relationFilter}
            onChange={(event) => setRelationFilter(event.target.value as RelationType | 'all')}
          >
            <option value="all">全部类型</option>
            {RELATION_TYPES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`hx-btn hx-btn-sm${hideDead ? ' hx-btn-primary' : ''}`}
          onClick={() => setHideDead((value) => !value)}
        >
          隐藏死链
        </button>
        <button
          type="button"
          className="hx-btn hx-btn-sm"
          onClick={() => void flow.fitView({ padding: FIT_PADDING, duration: 300 })}
          title="Ctrl+0"
        >
          复位视图
        </button>
        {pathMode ? (
          <span className="hx-graph-path-inline">
            路径模式 · 已选 {pathNodes.length} 个 · Esc 退出
          </span>
        ) : null}
      </div>

      {/* 空状态 */}
      {built.nodes.length === 0 ? (
        <div className="hx-graph-empty">
          <Icon name="graph" size={26} />
          <div style={{ color: 'var(--strong)', fontSize: 14 }}>图上还没有节点</div>
          <div style={{ maxWidth: 460, lineHeight: 1.9 }}>
            先录资产，图上才有节点：根域 → 子域 → 主机 → 站点 → 接口 → 漏洞。
            同 IP 的站点会自动指向同一个主机节点。
          </div>
          <button type="button" className="hx-btn hx-btn-primary" onClick={onGoAssets}>
            <Icon name="assets" size={13} />
            去资产库
          </button>
        </div>
      ) : null}

      {/* 右侧抽屉 */}
      {selectedNode ? (
        <aside className="hx-graph-panel">
          <div className="hx-graph-panel-head">
            <div>
              <div className="hx-graph-panel-kind">{KIND_LABEL[selectedNode.data.kind]}</div>
              <div className="hx-graph-panel-title" title={selectedNode.data.title}>
                {selectedNode.data.title}
              </div>
            </div>
            <button
              type="button"
              className="hx-icon-btn"
              onClick={() => setSelectedNodeId(null)}
              aria-label="关闭"
            >
              <Icon name="close" size={13} />
            </button>
          </div>
          <div className="hx-graph-panel-sub">{selectedNode.data.sub}</div>

          <dl className="hx-graph-kv">
            <dt>节点 ID</dt>
            <dd className="hx-mono">{selectedNode.id}</dd>
            <dt>坐标</dt>
            <dd className="hx-mono">
              {Math.round(selectedNode.position.x)}, {Math.round(selectedNode.position.y)}
            </dd>
            <dt>覆盖</dt>
            <dd>
              {selectedNode.data.covered ? '已覆盖' : '未覆盖'}
              {selectedNode.data.hole ? ' · 有洞' : ''}
            </dd>
          </dl>

          {selectedAsset ? (
            <div className="hx-graph-detail">
              <div className="hx-graph-detail-title">资产信息</div>
              <dl className="hx-graph-kv">
                <dt>URL</dt>
                <dd className="hx-mono">{selectedAsset.url || '—'}</dd>
                <dt>Host</dt>
                <dd className="hx-mono">{selectedAsset.host || '—'}</dd>
                <dt>IP</dt>
                <dd className="hx-mono">
                  {selectedAsset.ip || '—'}
                  {selectedAsset.port !== null ? ` : ${selectedAsset.port}` : ''}
                </dd>
                <dt>类别</dt>
                <dd>{CATEGORIES[selectedAsset.category].label}</dd>
                <dt>归属</dt>
                <dd>{selectedAsset.ownership}</dd>
                <dt>存活</dt>
                <dd>{selectedAsset.aliveStatus}</dd>
                <dt>指纹</dt>
                <dd>{selectedAsset.fingerprints.join(' / ') || '—'}</dd>
                <dt>历史漏洞</dt>
                <dd>{selectedAsset.vulnRefs.length} 条</dd>
              </dl>
              <button type="button" className="hx-btn hx-btn-sm" onClick={onGoAssets}>
                去资产库编辑
              </button>
            </div>
          ) : null}

          {selectedEndpoint ? (
            <div className="hx-graph-detail">
              <div className="hx-graph-detail-title">接口信息</div>
              <dl className="hx-graph-kv">
                <dt>方法</dt>
                <dd className="hx-mono">{selectedEndpoint.method}</dd>
                <dt>路径</dt>
                <dd className="hx-mono">{selectedEndpoint.path}</dd>
                <dt>可访问性</dt>
                <dd>{selectedEndpoint.accessState}</dd>
                <dt>回包特征</dt>
                <dd>{selectedEndpoint.respSignature}</dd>
              </dl>
            </div>
          ) : null}

          {selectedReport ? (
            <div className="hx-graph-detail">
              <div className="hx-graph-detail-title">漏洞信息</div>
              <dl className="hx-graph-kv">
                <dt>等级</dt>
                <dd style={{ color: SEVERITY_COLOR[selectedReport.severity] }}>
                  {selectedReport.severity}
                </dd>
                <dt>状态</dt>
                <dd>{selectedReport.status}</dd>
                <dt>目标</dt>
                <dd className="hx-mono">{selectedReport.targetUrl}</dd>
              </dl>
            </div>
          ) : null}
        </aside>
      ) : null}

      {/* 手动边抽屉 */}
      {selectedEdge ? (
        <aside className="hx-graph-panel">
          <div className="hx-graph-panel-head">
            <div>
              <div className="hx-graph-panel-kind">手动关联</div>
              <div className="hx-graph-panel-title">{selectedEdge.relation}</div>
            </div>
            <button
              type="button"
              className="hx-icon-btn"
              onClick={() => setSelectedEdgeId(null)}
              aria-label="关闭"
            >
              <Icon name="close" size={13} />
            </button>
          </div>
          <div className="hx-graph-panel-sub hx-mono">
            {selectedEdge.source} → {selectedEdge.target}
          </div>

          <label className="hx-field">
            <span className="hx-label">边类型</span>
            <select
              className="hx-select"
              value={edgeDraftRelation}
              onChange={(event) => setEdgeDraftRelation(event.target.value as RelationType)}
            >
              {RELATION_TYPES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="hx-field">
            <span className="hx-label">备注</span>
            <textarea
              className="hx-textarea"
              style={{ minHeight: 64 }}
              value={edgeDraftNote}
              placeholder="为什么认为它们有关联"
              onChange={(event) => setEdgeDraftNote(event.target.value)}
            />
          </label>
          <div className="hx-row">
            <button type="button" className="hx-btn hx-btn-sm hx-btn-primary" onClick={() => void saveSelectedEdge()}>
              保存
            </button>
            <button type="button" className="hx-btn hx-btn-sm hx-btn-danger" onClick={() => void deleteSelectedEdge()}>
              删除
            </button>
          </div>
        </aside>
      ) : null}

      {/* 图例 */}
      <div className="hx-graph-legend">
        <span>
          <i className="l1" />
          拓扑归属
        </span>
        <span>
          <i className="l2" />
          手动关联
        </span>
        <span>
          <i className="l3" />
          攻击路径
        </span>
      </div>

      {/* 新建边必须选类型 */}
      <Modal
        open={pendingConnection !== null}
        title="先选关联类型"
        subtitle="不允许建无类型边。类型决定图例与后续横向分析。"
        onClose={() => setPendingConnection(null)}
        maxWidth={440}
        footer={
          <>
            <button type="button" className="hx-btn" onClick={() => setPendingConnection(null)}>
              取消
            </button>
            <button
              type="button"
              className="hx-btn hx-btn-primary"
              onClick={() => {
                if (!pendingConnection || !pendingConnection.source || !pendingConnection.target) {
                  setPendingConnection(null);
                  return;
                }
                if (!relation) {
                  toast('error', '必须先选一个关联类型');
                  return;
                }
                void store.createEdge({
                  source: pendingConnection.source,
                  target: pendingConnection.target,
                  relation,
                });
                setPendingConnection(null);
              }}
            >
              建立关联
            </button>
          </>
        }
      >
        <label className="hx-field" style={{ marginBottom: 0 }}>
          <span className="hx-label">关联类型</span>
          <select
            className="hx-select"
            value={relation}
            onChange={(event) => setRelation(event.target.value as RelationType | '')}
          >
            <option value="">请选择</option>
            {RELATION_TYPES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </Modal>

      {/* 切换布局确认 */}
      <Modal
        open={pendingMode === 'force' && mode !== 'force'}
        title="重排会覆盖你拖过的位置，继续？"
        subtitle="力导向（环形）会重新计算全部节点坐标，已存档的坐标会被覆盖。"
        onClose={() => setPendingMode(mode)}
        maxWidth={460}
        footer={
          <>
            <button type="button" className="hx-btn" onClick={() => setPendingMode(mode)}>
              取消
            </button>
            <button
              type="button"
              className="hx-btn hx-btn-primary"
              onClick={() => void confirmRelayout()}
            >
              继续重排
            </button>
          </>
        }
      >
        <div className="hx-hint">切回「分层」时会优先使用已存档坐标，不会自动再排一次。</div>
      </Modal>

      {/* 重新读取项目数据，保证坐标 / 手动边是最新 */}
      <button
        type="button"
        className="hx-btn hx-btn-sm hx-graph-refresh"
        onClick={() => void onRefresh()}
        title="重新读取项目数据"
      >
        刷新数据
      </button>
    </div>
  );
}

export function GraphPage(props: GraphPageProps): JSX.Element {
  return (
    <ReactFlowProvider>
      <GraphPageInner {...props} />
    </ReactFlowProvider>
  );
}
