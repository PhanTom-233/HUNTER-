/**
 * 资产图谱的 7 种手动边类型（方法论 3.12.3）——**数据文件，不是组件代码**。
 *
 * 硬约束：边类型写死这 7 种，禁止自由文本；用户新增的类型也必须落库成这 7 种之一。
 * 本轮（第 2 块）UI 还不用它，只为第 3 块图谱准备好元数据，避免到时候把文案散落在组件里。
 */

import type { RelationType } from './types';

export interface RelationTypeMeta {
  relation: RelationType;
  /** 图上边标签的短文案 */
  label: string;
  /** 一句话解释：这条边代表什么关系、为什么值得画 */
  desc: string;
  /** 边与图例的颜色，取主题 CSS 变量 */
  color: string;
}

export const RELATION_TYPE_META: RelationTypeMeta[] = [
  {
    relation: '同 /24',
    label: '同 /24',
    desc: '两台主机同 /24 网段，可能是同一台机器上的多个站点，横向价值高',
    color: 'var(--cyan)',
  },
  {
    relation: '同 C 段',
    label: '同 C 段',
    desc: '更大的网段（/16），同机房 / 同云账号，用于判断归属与资产批次',
    color: 'var(--blue)',
  },
  {
    relation: '同证书',
    label: '同证书',
    desc: '证书 CN / SAN 相同，同一套系统换了域名，鉴权往往共用',
    color: 'var(--violet)',
  },
  {
    relation: '同 favicon',
    label: '同 favicon',
    desc: 'favicon hash 相同，同一套源码部署的多个站，同皮只做 2-3 个代表',
    color: 'var(--amber)',
  },
  {
    relation: '同模板',
    label: '同模板',
    desc: '页面结构 / 版权脚注一致，同一厂商的成品系统，漏洞通常成套出现',
    color: 'var(--green)',
  },
  {
    relation: '互调',
    label: '互调',
    desc: '接口之间互相调用，业务链上下游，越权可以顺着调用链走',
    color: 'var(--blue)',
  },
  {
    relation: '引用(JS→密钥)',
    label: '引用(JS→密钥)',
    desc: 'JS 里抄出来的钥匙指向某个接口或密钥，溯源与认钥闸用',
    color: 'var(--red)',
  },
];

/** 顺序即图例顺序 */
export const RELATION_TYPES: RelationType[] = RELATION_TYPE_META.map((item) => item.relation);

export const RELATION_LABEL: Record<RelationType, string> = RELATION_TYPE_META.reduce(
  (acc, item) => {
    acc[item.relation] = item.label;
    return acc;
  },
  {} as Record<RelationType, string>,
);

export const RELATION_DESC: Record<RelationType, string> = RELATION_TYPE_META.reduce(
  (acc, item) => {
    acc[item.relation] = item.desc;
    return acc;
  },
  {} as Record<RelationType, string>,
);

export const RELATION_COLOR: Record<RelationType, string> = RELATION_TYPE_META.reduce(
  (acc, item) => {
    acc[item.relation] = item.color;
    return acc;
  },
  {} as Record<RelationType, string>,
);
