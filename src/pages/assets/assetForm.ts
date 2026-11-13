/**
 * 资产编辑抽屉的表单模型与纯函数。
 *
 * 为什么单独一层：
 * - 抽屉里有 7 个分区 + 16 栏技术栈，全部塞进组件会让 JSX 失控；
 * - 前端校验必须与后端同一口径（文案也保持一致），放这里便于两边对照；
 * - `draft` 只放可编辑字段，派生字段（fingerprints / attackSurface / covered）不进 draft。
 */

import {
  ASSET_HOST_MAX,
  ASSET_NAME_MAX,
  ASSET_NOTE_MAX,
  ASSET_PROTOCOL_MAX,
  ASSET_SAME_SKIN_MAX,
  ASSET_TITLE_MAX,
  ASSET_URL_MAX,
  CHECKLIST_ITEMS,
  FP_CATEGORIES,
  FP_NAME_MAX,
} from '../../../shared/constants';
import { deriveWeight, emptyFingerprints } from '../../../shared/fpDerive';
import type {
  AliveStatus,
  Asset,
  AssetBrief,
  AssetCategory,
  AssetChecklist,
  AssetFingerprints,
  AssetOwnership,
  AssetWeight,
  CreateAssetInput,
  FpCategoryKey,
  VulnRef,
} from '../../../shared/types';

export interface AssetDraft {
  name: string;
  url: string;
  host: string;
  ip: string;
  /** 输入框里保持字符串，保存时转 number | null */
  port: string;
  protocol: string;
  title: string;
  category: AssetCategory;
  weight: AssetWeight;
  ownership: AssetOwnership;
  aliveStatus: AliveStatus;
  sameSkinGroup: string;
  riskNote: string;
  brief: AssetBrief;
  fp: AssetFingerprints;
  vulnRefs: VulnRef[];
  checklist: AssetChecklist;
}

export const EMPTY_BRIEF: AssetBrief = { user: '', objects: '', money: '', preAuth: '' };

export function emptyChecklist(): AssetChecklist {
  const checklist = {} as AssetChecklist;
  for (const { key } of CHECKLIST_ITEMS) checklist[key] = false;
  return checklist;
}

/** 新建资产的默认草稿（空状态引导：不预填任何示例数据） */
export function emptyDraft(): AssetDraft {
  return {
    name: '',
    url: '',
    host: '',
    ip: '',
    port: '',
    protocol: '',
    title: '',
    category: 'big_system',
    weight: deriveWeight('big_system'),
    ownership: '未知',
    aliveStatus: '未探活',
    sameSkinGroup: '',
    riskNote: '',
    brief: { ...EMPTY_BRIEF },
    fp: emptyFingerprints(),
    vulnRefs: [],
    checklist: emptyChecklist(),
  };
}

/** 从已有资产还原草稿（`null` = 新建） */
export function draftFromAsset(asset: Asset | null): AssetDraft {
  if (!asset) return emptyDraft();
  return {
    name: asset.name,
    url: asset.url,
    host: asset.host,
    ip: asset.ip,
    port: asset.port === null ? '' : String(asset.port),
    protocol: asset.protocol,
    title: asset.title,
    category: asset.category,
    weight: asset.weight,
    ownership: asset.ownership,
    aliveStatus: asset.aliveStatus,
    sameSkinGroup: asset.sameSkinGroup,
    riskNote: asset.riskNote,
    brief: { ...EMPTY_BRIEF, ...asset.brief },
    fp: {
      ...emptyFingerprints(),
      ...asset.fp,
    },
    vulnRefs: asset.vulnRefs.map((ref) => ({ ...ref })),
    checklist: { ...emptyChecklist(), ...asset.checklist },
  };
}

/** 从 URL 里解析 host / port / protocol（解析不了返回 null） */
export function parseUrlParts(url: string): { host: string; port: string; protocol: string } | null {
  const text = url.trim();
  if (!text || !/^https?:\/\//i.test(text)) return null;
  try {
    const parsed = new URL(text);
    const protocol = parsed.protocol.replace(':', '');
    const port = parsed.port || (protocol === 'https' ? '443' : protocol === 'http' ? '80' : '');
    return { host: parsed.hostname, port, protocol };
  } catch {
    return null;
  }
}

function looksLikeIpv4(value: string): boolean {
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) return false;
  return value
    .split('.')
    .map((part) => Number(part))
    .every((n) => Number.isInteger(n) && n >= 0 && n <= 255);
}

function looksLikeHostname(value: string): boolean {
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(
    value,
  );
}

export type DraftErrors = Partial<Record<'name' | 'url' | 'port' | 'ip' | 'fp', string>>;

/** 前端校验（与后端同一口径；后端仍然会再校验一次） */
export function validateDraft(draft: AssetDraft): DraftErrors {
  const errors: DraftErrors = {};

  const name = draft.name.trim();
  if (!name) errors.name = '资产名称必填';
  else if (name.length > ASSET_NAME_MAX) errors.name = `资产名称不能超过 ${ASSET_NAME_MAX} 个字符`;

  const url = draft.url.trim();
  if (url) {
    if (url.length > ASSET_URL_MAX) errors.url = `URL 不能超过 ${ASSET_URL_MAX} 个字符`;
    else if (!/^https?:\/\//i.test(url)) errors.url = 'URL 必须以 http:// 或 https:// 开头';
    else {
      try {
        // eslint-disable-next-line no-new
        new URL(url);
      } catch {
        errors.url = 'URL 不是合法的地址';
      }
    }
  }

  const port = draft.port.trim();
  if (port) {
    const num = Number(port);
    if (!Number.isInteger(num) || num < 0 || num > 65535) {
      errors.port = '端口必须是 0-65535 之间的整数';
    }
  }

  const ip = draft.ip.trim();
  if (ip && !looksLikeIpv4(ip) && !looksLikeHostname(ip)) {
    errors.ip = 'IP 必须是 IPv4（如 10.0.0.8）或域名 / 主机名（如 intranet-db01）';
  }

  // 16 栏：名称必填、同栏不能重名
  for (const { key } of FP_CATEGORIES) {
    const seen = new Set<string>();
    for (const item of draft.fp[key] ?? []) {
      const itemName = item.name.trim();
      if (!itemName) {
        errors.fp = '技术栈里有条目没填名称';
        return errors;
      }
      if (itemName.length > FP_NAME_MAX) {
        errors.fp = `技术栈名称不能超过 ${FP_NAME_MAX} 个字符`;
        return errors;
      }
      if (seen.has(itemName)) {
        errors.fp = `技术栈「${itemName}」重复了，同一条指纹只留一条`;
        return errors;
      }
      seen.add(itemName);
    }
  }

  return errors;
}

export function hasDraftErrors(errors: DraftErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** 草稿 → 请求体（服务端会重算派生字段，这里只传用户能改的） */
export function toCreateInput(draft: AssetDraft): CreateAssetInput {
  const port = draft.port.trim();
  return {
    name: draft.name.trim().slice(0, ASSET_NAME_MAX),
    url: draft.url.trim().slice(0, ASSET_URL_MAX),
    host: draft.host.trim().slice(0, ASSET_HOST_MAX),
    ip: draft.ip.trim().slice(0, ASSET_HOST_MAX),
    port: port ? Number(port) : null,
    protocol: draft.protocol.trim().slice(0, ASSET_PROTOCOL_MAX),
    title: draft.title.trim().slice(0, ASSET_TITLE_MAX),
    category: draft.category,
    weight: draft.weight,
    ownership: draft.ownership,
    aliveStatus: draft.aliveStatus,
    sameSkinGroup: draft.sameSkinGroup.trim().slice(0, ASSET_SAME_SKIN_MAX),
    riskNote: draft.riskNote.trim().slice(0, ASSET_NOTE_MAX),
    brief: {
      user: draft.brief.user.slice(0, ASSET_NOTE_MAX),
      objects: draft.brief.objects.slice(0, ASSET_NOTE_MAX),
      money: draft.brief.money.slice(0, ASSET_NOTE_MAX),
      preAuth: draft.brief.preAuth.slice(0, ASSET_NOTE_MAX),
    },
    fp: draft.fp,
    vulnRefs: draft.vulnRefs,
    checklist: draft.checklist,
  };
}

/** 判断草稿是否有未保存改动（用于 Esc / 点遮罩关闭时二次确认） */
export function sameDraft(a: AssetDraft, b: AssetDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 「本轮完成」已勾数量 */
export function checklistDone(checklist: AssetChecklist): number {
  return CHECKLIST_ITEMS.filter(({ key }) => checklist[key]).length;
}

export function checklistProgress(checklist: AssetChecklist): number {
  return Math.round((checklistDone(checklist) / CHECKLIST_ITEMS.length) * 100);
}

/** 未完成的清单文案（拦截弹窗里逐条列出） */
export function unfinishedChecklist(checklist: AssetChecklist): string[] {
  return CHECKLIST_ITEMS.filter(({ key }) => !checklist[key]).map(({ label }) => label);
}

function randomSuffix(): string {
  return Math.random().toString(16).slice(2, 10).padEnd(8, '0').slice(0, 8);
}

/** 手动补一条历史漏洞（不挂指纹，重算派生字段时不会被丢掉） */
export function manualVulnRef(input: {
  name: string;
  source: VulnRef['source'];
  identifier: string;
  affectedVersion: string;
  severity: VulnRef['severity'];
  verifyPath: string;
}): VulnRef {
  return {
    id: `vr_${randomSuffix()}`,
    fingerprintId: '',
    name: input.name.trim(),
    source: input.source,
    identifier: input.identifier.trim(),
    affectedVersion: input.affectedVersion.trim(),
    severity: input.severity,
    condition: '',
    verifyPath: input.verifyPath.trim(),
    kbModule: '',
    status: '待验证',
  };
}

/** 某个分栏已填条数（分组标题用） */
export function categoryCount(draft: AssetDraft, key: FpCategoryKey): number {
  return (draft.fp[key] ?? []).length;
}
