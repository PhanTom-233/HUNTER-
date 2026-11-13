/**
 * 指纹推导纯函数（前后端共用）。
 *
 * 设计要点：
 * 1. 全部是纯函数，不读 IO、不依赖 React，服务端与前端调同一份实现，避免两边口径不一致。
 * 2. `deriveFromFp` 的第三个参数是可选的「上一次的 vulnRefs」：已存在同 id 的历史漏洞会保留
 *    用户改过的 `status`（已验证 / 不适用），新增的默认 `待验证`。不传等价于全新推导。
 * 3. 服务端是唯一权威：前端只是用它在保存前做即时预览。
 */

import { FP_CATEGORIES } from './constants';
import type {
  AssetCategory,
  AssetFingerprints,
  AssetWeight,
  Fingerprint,
  FpCategoryKey,
  FpItem,
  VulnRef,
} from './types';

/** 16 栏全空数组（新建资产 / 旧数据缺字段时用） */
export function emptyFingerprints(): AssetFingerprints {
  const empty = {} as AssetFingerprints;
  for (const { key } of FP_CATEGORIES) {
    empty[key] = [];
  }
  return empty;
}

/** 把任意对象补成 16 栏结构（缺的分栏补空数组），不做字段校验 */
export function normalizeFingerprints(raw: Partial<AssetFingerprints> | null | undefined): AssetFingerprints {
  const result = emptyFingerprints();
  if (!raw || typeof raw !== 'object') return result;
  for (const { key } of FP_CATEGORIES) {
    const value = raw[key];
    if (Array.isArray(value)) result[key] = value;
  }
  return result;
}

/** 一条指纹的展示文案：`名称 版本`；版本为空或未知时只写名称 */
export function fpLabel(item: FpItem): string {
  const version = (item.version ?? '').trim();
  if (!version || version === '未知') return item.name;
  return `${item.name} ${version}`;
}

/** 16 栏里所有指纹条目（按 16 栏顺序扁平展开） */
export function fpItems(fp: AssetFingerprints): FpItem[] {
  const out: FpItem[] = [];
  for (const { key } of FP_CATEGORIES) {
    const list = fp[key] ?? [];
    for (const item of list) out.push(item);
  }
  return out;
}

/** 已填条目总数（列表页/分组头上的计数） */
export function countFpItems(fp: AssetFingerprints): number {
  return fpItems(fp).length;
}

function uniquePush(target: string[], value: string): void {
  if (value && !target.includes(value)) target.push(value);
}

export interface DeriveResult {
  /** `名称 版本` 去重后的扁平标签，按 16 栏顺序 */
  labels: string[];
  /** 命中指纹的 attackSurface 去重结果 */
  attackSurface: string[];
  /** 命中指纹的 knownVulns（保留用户改过的状态） */
  vulnRefs: VulnRef[];
}

/**
 * 指纹 → 标签 / 攻击面 / 历史漏洞。
 *
 * @param fp 资产侧 16 栏技术栈
 * @param library 全局指纹库
 * @param previousRefs 上次保存的历史漏洞；同 id 的 `status` 会被保留
 */
export function deriveFromFp(
  fp: AssetFingerprints,
  library: Fingerprint[],
  previousRefs: VulnRef[] = [],
): DeriveResult {
  const labels: string[] = [];
  const attackSurface: string[] = [];
  const vulnRefs: VulnRef[] = [];

  const libByName = new Map<string, Fingerprint>();
  for (const item of library) libByName.set(item.name, item);

  const prevById = new Map<string, VulnRef>();
  for (const ref of previousRefs) prevById.set(ref.id, ref);

  const seenVulnIds = new Set<string>();

  for (const { key } of FP_CATEGORIES) {
    const list = fp[key] ?? [];
    for (const item of list) {
      uniquePush(labels, fpLabel(item));

      const lib = libByName.get(item.name);
      if (!lib) continue;

      for (const surface of lib.attackSurface) uniquePush(attackSurface, surface);

      for (const vuln of lib.knownVulns) {
        if (seenVulnIds.has(vuln.id)) continue;
        seenVulnIds.add(vuln.id);
        const prev = prevById.get(vuln.id);
        vulnRefs.push({ ...vuln, status: prev ? prev.status : '待验证' });
      }
    }
  }

  return { labels, attackSurface, vulnRefs };
}

/**
 * 合并「指纹带出的漏洞」与「用户手动补的漏洞」。
 *
 * 手动补的漏洞以 `fingerprintId === ''` 为标记（不挂任何指纹），重算时不会被丢掉。
 */
export function mergeVulnRefs(derived: VulnRef[], previous: VulnRef[]): VulnRef[] {
  const merged: VulnRef[] = [...derived];
  const seen = new Set(merged.map((ref) => ref.id));
  for (const ref of previous) {
    if (ref.fingerprintId !== '') continue;
    if (seen.has(ref.id)) continue;
    seen.add(ref.id);
    merged.push(ref);
  }
  return merged;
}

/** 列表页摘要：最多 3 个标签，超出显示 `+N`；没有任何指纹时返回空字符串 */
export function summarizeFp(fp: AssetFingerprints): string {
  const labels = fpItems(fp).map(fpLabel);
  const unique: string[] = [];
  for (const label of labels) uniquePush(unique, label);
  if (unique.length === 0) return '';
  const head = unique.slice(0, 3).join(' / ');
  const rest = unique.length - 3;
  return rest > 0 ? `${head} +${rest}` : head;
}

/** 由类别推导肥瘦（允许用户手动覆盖；这里只是默认值） */
export function deriveWeight(category: AssetCategory): AssetWeight {
  switch (category) {
    case 'big_system':
    case 'api_service':
    case 'admin_console':
      return 'fat';
    case 'single_page':
    case 'static_shell':
    case 'mobile_h5':
    case 'middleware':
    default:
      return 'thin';
  }
}

function randomSuffix(): string {
  const raw = Math.random().toString(16).slice(2, 10);
  return raw.padEnd(8, '0').slice(0, 8);
}

/**
 * 从指纹库条目生成一条资产侧条目（前端「从库中选择」时用）。
 * 版本留空，让用户按实际识别结果填。
 */
export function fpItemFromLibrary(lib: Fingerprint): FpItem {
  return {
    id: `fpi_${randomSuffix()}`,
    name: lib.name,
    version: lib.version ?? '',
    evidence: lib.evidence ?? '',
    confidence: lib.confidence,
  };
}

/** 生成一条新的资产侧指纹 id（前端新增条目用） */
export function newFpItemId(): string {
  return `fpi_${randomSuffix()}`;
}

/** 单个分栏里按名称查找（判断是否已加过） */
export function hasFpItem(fp: AssetFingerprints, key: FpCategoryKey, name: string): boolean {
  return (fp[key] ?? []).some((item) => item.name === name);
}
