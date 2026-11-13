/**
 * 极简设置页后端：单项目 JSON 导入 / 手动备份。
 *
 * 不提供任何路径配置、换库、模块映射或断链检测。
 * 导入前由 store 的持久化流程自动备份旧项目文件。
 */

import fs from 'fs';
import path from 'path';

import { Router } from 'express';
import type { Request, Response } from 'express';

import type {
  Activity,
  Asset,
  BreakLog,
  Endpoint,
  Feature,
  GraphPosition,
  ManualEdge,
  Project,
  Report,
  ReportFile,
  Seed,
  TestRecord,
} from '../../shared/types';
import { NotFoundError, ValidationError, sendOk, wrap } from '../http';
import * as store from '../store';

const router = Router();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBody(req: Request): Record<string, unknown> {
  const raw: unknown = req.body;
  if (!isRecord(raw)) throw new ValidationError('请求体必须是 JSON 对象');
  return raw;
}

function readProjectId(req: Request): string {
  const { projectId } = req.params;
  if (typeof projectId !== 'string' || !projectId.trim()) {
    throw new ValidationError('缺少项目 id');
  }
  return projectId.trim();
}

function arrayOr<T>(value: unknown, label: string): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new ValidationError(`${label} 必须是数组`);
  return value as T[];
}

router.post(
  '/projects/:projectId/import',
  wrap(async (req: Request, res: Response) => {
    const projectId = readProjectId(req);
    const body = readBody(req);
    const source = body.data;
    if (!isRecord(source)) throw new ValidationError('data 必须是项目 JSON 对象');
    if (!isRecord(source.project)) throw new ValidationError('导入数据缺少 project 对象');

    const current = store.getProject(projectId);
    const importedProject = source.project as unknown as Project;
    const nextProject: Project = {
      ...current.project,
      ...importedProject,
      id: projectId,
      createdAt:
        typeof importedProject.createdAt === 'string'
          ? importedProject.createdAt
          : current.project.createdAt,
      updatedAt: current.project.updatedAt,
    };

    const seeds = arrayOr<Seed>(source.seeds, 'seeds');
    const assets = arrayOr<Asset>(source.assets, 'assets');
    const endpoints = arrayOr<Endpoint>(source.endpoints, 'endpoints');
    const tests = arrayOr<TestRecord>(source.tests, 'tests');
    const reports = arrayOr<Report>(source.reports, 'reports');
    const reportFiles = arrayOr<ReportFile>(source.reportFiles, 'reportFiles');
    const manualEdges = arrayOr<ManualEdge>(source.manualEdges, 'manualEdges');
    const graphPositions = arrayOr<GraphPosition>(source.graphPositions, 'graphPositions');
    const features = arrayOr<Feature>(source.features, 'features');
    const activity = arrayOr<Activity>(source.activity, 'activity');
    const breakLogs = arrayOr<BreakLog>(source.breakLogs, 'breakLogs');

    store.mutateProject(projectId, (data) => {
      data.project = nextProject;
      data.seeds = seeds;
      data.assets = assets;
      data.endpoints = endpoints;
      data.tests = tests;
      data.reports = reports;
      data.reportFiles = reportFiles;
      data.manualEdges = manualEdges;
      data.graphPositions = graphPositions;
      data.features = features;
      data.activity = activity;
      data.breakLogs = breakLogs;
    });
    await store.flushAll();
    sendOk(res, store.getProject(projectId));
  }),
);

router.post(
  '/projects/:projectId/backup',
  wrap(async (req: Request, res: Response) => {
    const projectId = readProjectId(req);
    store.getProject(projectId);
    await store.flushAll();

    const dataDir = store.getDataDir();
    const source = path.join(dataDir, `${projectId}.json`);
    if (!fs.existsSync(source)) throw new NotFoundError(`项目 ${projectId} 的数据文件不存在`);

    const backupDir = path.join(dataDir, 'backup');
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = path.join(backupDir, `${projectId}-manual-${stamp}.json`);
    fs.copyFileSync(source, target);

    const relative = path.relative(dataDir, target).split(path.sep).join('/');
    sendOk(res, { file: `data/${relative}` });
  }),
);

export default router;
