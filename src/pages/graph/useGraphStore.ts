/**
 * 图谱的本地状态 + 持久化编排。
 *
 * 分工：
 * - 坐标：拖动时只改内存，**400ms 防抖批量**写回 `/graph/positions`；
 * - 手动边：增删改立即调接口，以服务端返回为准；
 * - 路径 / 选中 / 过滤 / 折叠属于纯 UI 状态，放在 GraphPage，不在这里。
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { ManualEdge, RelationType } from '../../../shared/types';
import { useToast } from '../../components/Toast';
import { api, toErrorText } from '../../lib/api';

export interface PositionInput {
  nodeId: string;
  x: number;
  y: number;
}

export interface GraphStore {
  manualEdges: ManualEdge[];
  /** 拖动中调用：合并进待写队列，400ms 后批量提交 */
  queuePosition: (nodeId: string, x: number, y: number) => void;
  /** 立即提交（首次布局 / 主动重排 / 离开页面前） */
  savePositionsNow: (positions: PositionInput[]) => Promise<void>;
  flushPositions: () => Promise<void>;
  createEdge: (input: {
    source: string;
    target: string;
    relation: RelationType;
    note?: string;
  }) => Promise<ManualEdge | null>;
  updateEdge: (
    edgeId: string,
    patch: { relation?: RelationType; note?: string },
  ) => Promise<ManualEdge | null>;
  deleteEdge: (edgeId: string) => Promise<boolean>;
}

const SAVE_DEBOUNCE_MS = 400;

export function useGraphStore(projectId: string, initialEdges: ManualEdge[]): GraphStore {
  const toast = useToast();
  const [manualEdges, setManualEdges] = useState<ManualEdge[]>(initialEdges);

  const pendingRef = useRef<Map<string, PositionInput>>(new Map());
  const timerRef = useRef<number | null>(null);

  const flushPositions = useCallback(async (): Promise<void> => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pendingRef.current.size === 0) return;
    const positions = [...pendingRef.current.values()];
    pendingRef.current.clear();
    try {
      await api.saveGraphPositions(projectId, positions);
    } catch (error) {
      toast('error', toErrorText(error, '节点坐标保存失败'));
    }
  }, [projectId, toast]);

  /** 卸载时兜底 flush（用 ref 拿最新实现，避免闭包过期） */
  const flushRef = useRef<() => Promise<void>>(flushPositions);
  flushRef.current = flushPositions;
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      void flushRef.current();
    },
    [],
  );

  const queuePosition = useCallback((nodeId: string, x: number, y: number): void => {
    pendingRef.current.set(nodeId, { nodeId, x, y });
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void flushRef.current();
    }, SAVE_DEBOUNCE_MS);
  }, []);

  const savePositionsNow = useCallback(
    async (positions: PositionInput[]): Promise<void> => {
      if (positions.length === 0) return;
      try {
        await api.saveGraphPositions(projectId, positions);
      } catch (error) {
        toast('error', toErrorText(error, '坐标保存失败'));
      }
    },
    [projectId, toast],
  );

  const createEdge = useCallback<GraphStore['createEdge']>(
    async (input) => {
      try {
        const edge = await api.createManualEdge(projectId, input);
        setManualEdges((prev) => [...prev, edge]);
        return edge;
      } catch (error) {
        toast('error', toErrorText(error, '创建关联失败'));
        return null;
      }
    },
    [projectId, toast],
  );

  const updateEdge = useCallback<GraphStore['updateEdge']>(
    async (edgeId, patch) => {
      try {
        const edge = await api.updateManualEdge(projectId, edgeId, patch);
        setManualEdges((prev) => prev.map((item) => (item.id === edgeId ? edge : item)));
        return edge;
      } catch (error) {
        toast('error', toErrorText(error, '更新关联失败'));
        return null;
      }
    },
    [projectId, toast],
  );

  const deleteEdge = useCallback<GraphStore['deleteEdge']>(
    async (edgeId) => {
      try {
        await api.deleteManualEdge(projectId, edgeId);
        setManualEdges((prev) => prev.filter((item) => item.id !== edgeId));
        return true;
      } catch (error) {
        toast('error', toErrorText(error, '删除关联失败'));
        return false;
      }
    },
    [projectId, toast],
  );

  return {
    manualEdges,
    queuePosition,
    savePositionsNow,
    flushPositions,
    createEdge,
    updateEdge,
    deleteEdge,
  };
}
