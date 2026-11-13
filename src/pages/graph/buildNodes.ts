/**
 * 实体 → 图谱节点 + 拓扑边（纯函数）。
 *
 * 输入是 `ProjectData`，输出 React Flow 的 nodes / edges。
 * 硬约束（3.12.1 / 3.12.2）：
 * 1. 同一 IP 只建一个 `host:<ip>` 节点（去重红线，旁站关系靠它自动成立）；
 * 2. 只生成纵向归属边，横向关联一律不猜（同 IP / 同证书 / 同 favicon 都不自动连）；
 * 3. 拓扑边 id 用 `t:<source>-><target>`，稳定可复现。
 */

import type { Edge, Node } from '@xyflow/react';

import { CATEGORIES } from '../../../shared/constants';
import { summarizeFp } from '../../../shared/fpDerive';
import type { AliveStatus, Asset, GraphNodeKind, ProjectData } from '../../../shared/types';
import { topologyEdge } from './edges';

/** 节点数据（挂到 React Flow node.data 上） */
export interface GraphNodeData extends Record<string, unknown> {
  kind: GraphNodeKind;
  title: string;
  sub: string;
  covered: boolean;
  hole: boolean;
  /** 所属根节点 id（折叠簇 / 定位用） */
  rootId: string;
  assetId?: string;
  endpointId?: string;
  reportId?: string;
  /** 站点 / 中间件节点的存活状态（「隐藏死链」过滤用） */
  aliveStatus?: AliveStatus;
}

/** addNode 的入参（rootId 由 addNode 自己补） */
interface GraphNodeSeed {
  kind: GraphNodeKind;
  title: string;
  sub: string;
  covered: boolean;
  hole: boolean;
  assetId?: string;
  endpointId?: string;
  reportId?: string;
  aliveStatus?: AliveStatus;
}

export type GraphNode = Node<GraphNodeData>;

export interface BuiltGraph {
  nodes: GraphNode[];
  edges: Edge[];
  counts: { nodes: number; edges: number; covered: number; holes: number };
  /** 既无 host 也无 ip 的资产数（不进图） */
  skipped: number;
  unassignedAssetIds: string[];
}

export interface BuildOptions {
  /** 功能点层默认关闭（3.13）；开启后为 feature 建节点 */
  includeFeatures?: boolean;
}

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const SECOND_LEVEL_SUFFIXES = new Set([
  'com.cn',
  'net.cn',
  'org.cn',
  'gov.cn',
  'edu.cn',
  'ac.cn',
  'com.hk',
  'com.tw',
  'com.mo',
  'co.jp',
  'co.kr',
  'co.uk',
  'com.au',
  'com.sg',
]);

function looksLikeIp(host: string): boolean {
  if (!IPV4.test(host)) return false;
  return host
    .split('.')
    .map((part) => Number(part))
    .every((n) => Number.isInteger(n) && n >= 0 && n <= 255);
}

function hostFromUrl(url: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * 注册域归约：只做常见二级后缀判断，不联网、不引 PSL。
 * 例：admin.example.com → example.com；admin.example.com.cn → example.com.cn
 */
export function registeredDomain(host: string): string {
  const normalized = host.trim().toLowerCase().replace(/\.$/, '');
  if (!normalized) return '';
  if (looksLikeIp(normalized)) return normalized;
  const parts = normalized.split('.').filter(Boolean);
  if (parts.length <= 2) return normalized;
  const last2 = parts.slice(-2).join('.');
  if (SECOND_LEVEL_SUFFIXES.has(last2)) return parts.slice(-3).join('.');
  return last2;
}

function domainOfAsset(asset: Asset): string {
  const raw = (asset.host || hostFromUrl(asset.url) || '').trim().toLowerCase().replace(/\.$/, '');
  if (!raw || looksLikeIp(raw)) return '';
  return raw;
}

function ipOfAsset(asset: Asset): string {
  const explicit = (asset.ip || '').trim();
  if (looksLikeIp(explicit)) return explicit;
  // host 字段被填成 IP 字面量（或服务端从 url 解析出的 host 就是 IP）也算有地址
  const hostRaw = (asset.host || '').trim();
  if (looksLikeIp(hostRaw)) return hostRaw;
  const urlHost = hostFromUrl(asset.url);
  if (looksLikeIp(urlHost)) return urlHost;
  return '';
}

function pushUnique(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (!list) map.set(key, [value]);
  else if (!list.includes(value)) list.push(value);
}

/** 构建节点 + 拓扑边 */
export function buildGraph(data: ProjectData, options: BuildOptions = {}): BuiltGraph {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, Edge>();
  /** child -> parent（用来推 rootId，也用来判环） */
  const parentOf = new Map<string, string>();
  /** host 节点 id -> 端口集合 / 站点数，最后统一回填副标题 */
  const hostPorts = new Map<string, Set<string>>();
  const hostSites = new Map<string, number>();

  const addNode = (id: string, partial: GraphNodeSeed): void => {
    if (nodes.has(id)) return;
    nodes.set(id, {
      id,
      type: 'asset',
      position: { x: 0, y: 0 },
      data: { ...partial, rootId: id },
    });
  };

  const addEdge = (source: string, target: string, label?: string): void => {
    if (!source || !target || source === target) return;
    const id = `t:${source}->${target}`;
    if (edges.has(id)) return;
    edges.set(id, topologyEdge(id, source, target, label));
    if (!parentOf.has(target)) parentOf.set(target, source);
  };

  /* 1. 域名 / 主机 / 站点 ------------------------------------------ */
  const siteNodeOfAsset = new Map<string, string>();
  const unassignedAssetIds: string[] = [];

  for (const asset of data.assets) {
    const domain = domainOfAsset(asset);
    const ip = ipOfAsset(asset);

    // 图谱只画「有地址的资产」：既无 host 也无 ip 的资产不进图，
    // 页面顶部用提示条引导用户去资产库补全，不造漂浮节点。
    if (!domain && !ip) {
      unassignedAssetIds.push(asset.id);
      continue;
    }

    let parentId = '';
    let rootId = '';

    if (domain) {
      const reg = registeredDomain(domain);
      rootId = `domain:${reg}`;
      addNode(rootId, {
        kind: 'root',
        title: reg,
        sub: `根域 · ${asset.ownership}`,
        covered: false,
        hole: false,
      });

      if (domain !== reg) {
        const domainId = `domain:${domain}`;
        addNode(domainId, {
          kind: 'domain',
          title: domain,
          sub: `子域 · ${CATEGORIES[asset.category].label}`,
          covered: false,
          hole: false,
        });
        addEdge(rootId, domainId);
        parentId = domainId;
      } else {
        parentId = rootId;
      }
    }

    if (ip) {
      const hostId = `host:${ip}`;
      addNode(hostId, {
        kind: 'host',
        title: ip,
        sub: '主机 · 待补端口',
        covered: false,
        hole: false,
      });
      if (parentId) addEdge(parentId, hostId);
      parentId = hostId;
      if (asset.port !== null) {
        const ports = hostPorts.get(hostId) ?? new Set<string>();
        ports.add(String(asset.port));
        hostPorts.set(hostId, ports);
      }
      hostSites.set(hostId, (hostSites.get(hostId) ?? 0) + 1);
    }

    const isMiddleware = asset.category === 'middleware';
    const siteId = isMiddleware ? `mw:${asset.id}` : `site:${asset.id}`;
    addNode(siteId, {
      kind: isMiddleware ? 'mw' : 'site',
      title: asset.name,
      sub: isMiddleware
        ? `中间件 · ${asset.host || asset.ip || asset.url || '未填地址'}`
        : summarizeFp(asset.fp) || asset.host || asset.url || '未填地址',
      covered: asset.covered,
      hole: false,
      assetId: asset.id,
      aliveStatus: asset.aliveStatus,
    });
    if (parentId) addEdge(parentId, siteId);
    siteNodeOfAsset.set(asset.id, siteId);
  }

  /* host 副标题回填：端口 + 站点数 */
  for (const [hostId, node] of nodes) {
    if (node.data.kind !== 'host') continue;
    const ports = [...(hostPorts.get(hostId) ?? [])].sort();
    const sites = hostSites.get(hostId) ?? 0;
    const portText = ports.length > 0 ? ` · ${ports.join('/')}` : '';
    node.data.sub = `主机${portText} · ${sites} 站点`;
  }

  /* 2. 功能点（默认关闭，必须建在接口之前，接口才能挂到 feature 下） --- */
  if (options.includeFeatures) {
    for (const feature of data.features) {
      const parent = siteNodeOfAsset.get(feature.assetId);
      if (!parent) continue;
      const featureId = `feature:${feature.id}`;
      addNode(featureId, {
        kind: 'feature',
        title: feature.name,
        sub: feature.riskTags.length > 0 ? feature.riskTags.join(' / ') : '功能点',
        covered: false,
        hole: false,
        assetId: feature.assetId,
      });
      addEdge(parent, featureId);
    }
  }

  /* 3. 接口 ------------------------------------------------------- */
  for (const endpoint of data.endpoints) {
    const parent = siteNodeOfAsset.get(endpoint.assetId);
    if (!parent) continue; // 孤儿接口（资产已删）不建节点
    const apiId = `api:${endpoint.id}`;
    addNode(apiId, {
      kind: 'api',
      title: endpoint.path || endpoint.fullUrl || '(未填路径)',
      sub: `${endpoint.method} · ${endpoint.accessState}`,
      covered: false,
      hole: false,
      assetId: endpoint.assetId,
      endpointId: endpoint.id,
    });
    // Feature 层开启且该接口确实挂在某个已存在的 feature 下时，边从 feature 出
    const featureNodeId = endpoint.featureId ? `feature:${endpoint.featureId}` : '';
    const exposedBy =
      options.includeFeatures && featureNodeId && nodes.has(featureNodeId)
        ? featureNodeId
        : parent;
    addEdge(exposedBy, apiId, '暴露');
  }

  /* 4. 漏洞（报告） ----------------------------------------------- */
  const assetHasReport = new Set<string>();
  for (const report of data.reports) {
    const siteId = siteNodeOfAsset.get(report.assetId);
    // 资产本身没入图（无 host/ip）→ 它的报告也不上图，避免孤儿漏洞节点
    if (!siteId) continue;
    assetHasReport.add(report.assetId);
    const vulnId = `vuln:${report.id}`;
    const apiId = report.endpointId ? `api:${report.endpointId}` : '';
    const parent = apiId && nodes.has(apiId) ? apiId : siteId;
    addNode(vulnId, {
      kind: 'vuln',
      title: report.title,
      sub: `${report.severity} · ${report.status}`,
      covered: false,
      hole: true,
      assetId: report.assetId,
      endpointId: report.endpointId ?? undefined,
      reportId: report.id,
    });
    addEdge(parent, vulnId);
  }

  /* 5. 站点「有洞」标记（有报告即视为有洞） ---------------------- */
  for (const node of nodes.values()) {
    if (node.data.kind !== 'site' && node.data.kind !== 'mw') continue;
    if (node.data.assetId && assetHasReport.has(node.data.assetId)) node.data.hole = true;
  }

  /* 6. rootId 传播：从没有父节点的节点开始 BFS -------------------- */
  const children = new Map<string, string[]>();
  for (const [child, parent] of parentOf) pushUnique(children, parent, child);

  const queue: string[] = [];
  for (const id of nodes.keys()) {
    if (!parentOf.has(id)) queue.push(id);
  }
  while (queue.length > 0) {
    const current = queue.shift() as string;
    const currentRoot = nodes.get(current)?.data.rootId ?? current;
    for (const child of children.get(current) ?? []) {
      const childNode = nodes.get(child);
      if (!childNode || childNode.data.rootId !== child) continue; // 已传播过，防环
      childNode.data.rootId = currentRoot;
      queue.push(child);
    }
  }

  const nodeList = [...nodes.values()];
  const edgeList = [...edges.values()];
  return {
    nodes: nodeList,
    edges: edgeList,
    counts: {
      nodes: nodeList.length,
      edges: edgeList.length,
      covered: nodeList.filter((node) => node.data.covered).length,
      // HUD 的「有洞」按漏洞节点数算；站点上的红点只是提示该站有报告
      holes: nodeList.filter((node) => node.data.kind === 'vuln').length,
    },
    skipped: unassignedAssetIds.length,
    unassignedAssetIds,
  };
}
