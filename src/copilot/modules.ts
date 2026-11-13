/**
 * 按资产指纹解析内置方法论模块（只读 skill/index.json，不遍历 md）。
 */

import skillIndex from '../../skill/index.json';
import { fpItems } from '../../shared/fpDerive';
import { FINGERPRINT_LIBRARY } from '../../shared/fingerprints';
import type { Asset } from '../../shared/types';

export interface CopilotModuleRow {
  assetId: string;
  assetName: string;
  moduleId: string;
  title: string;
  /** 相对 skill/ 的路径，用于复制，不拼本机目录 */
  path: string;
}

const KNOWLEDGE_BASE = skillIndex.knowledgeBase as { id: string; title: string; path: string }[];
const ALIASES = skillIndex.moduleAliases as Record<string, string>;

const KB_BY_ID = new Map(KNOWLEDGE_BASE.map((entry) => [entry.id, entry]));

/** index 里少数标题取到的是文档内的通用小标题（如「一、原有knowledge-base」），回退用模块 id 展示 */
function displayTitle(id: string, title: string): string {
  const clean = title.trim();
  if (!clean || clean === id || /^[一二三四五六七八九十]+、/.test(clean)) return id;
  return clean;
}

/** 先查 knowledgeBase[].id，再用 moduleAliases 兜底；解析不到返回 null */
export function resolveKbModule(moduleId: string): { title: string; path: string } | null {
  const entry = KB_BY_ID.get(moduleId);
  if (entry) return { title: displayTitle(entry.id, entry.title), path: entry.path };
  const alias = ALIASES[moduleId];
  if (alias) return { title: moduleId, path: alias };
  return null;
}

/** 资产指纹名 → FINGERPRINT_LIBRARY.kbModules → 模块相对路径 */
export function resolveAssetModules(assets: Asset[]): CopilotModuleRow[] {
  const rows = new Map<string, CopilotModuleRow>();

  for (const asset of assets) {
    for (const item of fpItems(asset.fp)) {
      const fingerprint = FINGERPRINT_LIBRARY.find(
        (entry) => entry.name.trim().toLowerCase() === item.name.trim().toLowerCase(),
      );
      if (!fingerprint) continue;
      for (const moduleId of fingerprint.kbModules) {
        const resolved = resolveKbModule(moduleId);
        if (!resolved) continue;
        const key = `${asset.id}::${resolved.path}`;
        if (!rows.has(key)) {
          rows.set(key, {
            assetId: asset.id,
            assetName: asset.name,
            moduleId,
            title: resolved.title,
            path: resolved.path,
          });
        }
      }
    }
  }

  return [...rows.values()];
}
