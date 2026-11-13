/**
 * 接口批量导入的纯字符串解析器。
 *
 * 红线：这里只做文本解析，**绝不对目标发任何网络请求**。
 * 三种输入：
 * 1. `path`：每行一条路径，默认 GET；
 * 2. `curl`：解析 -X / URL / -H / -d / --data-* 参数，支持引号与续行符；
 * 3. `swagger`：Swagger 2 / OpenAPI 3 JSON，展开 paths × methods，解析一层 $ref。
 *
 * 单行 / 单条解析失败只跳过该行并返回原因，绝不让整批 500。
 */

import {
  ENDPOINT_SOURCES,
  HTTP_METHODS,
  PARAM_LOCATIONS,
  RESP_SIGNATURES,
} from '../shared/constants';
import type {
  EndpointImportDraft,
  EndpointImportError,
  EndpointImportFormat,
  HttpMethod,
  Param,
  ParamLocation,
  RespSignature,
} from '../shared/types';

export interface ParsedImport {
  drafts: EndpointImportDraft[];
  errors: EndpointImportError[];
  /** 跳过的行数（空行 / 注释 / 解析失败 / 非 method 键） */
  skipped: number;
}

const MAX_PATH = 2000;
const MAX_NOTE = 500;
const METHOD_KEYS = new Set([
  'get',
  'post',
  'put',
  'delete',
  'patch',
  'options',
  'head',
  'trace',
]);

const BUSINESS_KEY = /^(id|.*_id$|.*Id$|uid|user|account|amount|price|money|total|count|qty|status|order|page|size|limit|offset|url|uri|callback|redirect|file|path|cmd|query|keyword|token|key|secret|salt|sign|phone|email|card|balance|coupon|score)$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBusiness(name: string): boolean {
  return BUSINESS_KEY.test(name.trim());
}

function methodFrom(value: string): HttpMethod | null {
  const upper = value.trim().toUpperCase();
  return HTTP_METHODS.includes(upper as HttpMethod) ? (upper as HttpMethod) : null;
}

function validLocation(value: string): value is ParamLocation {
  return PARAM_LOCATIONS.includes(value as ParamLocation);
}

function dedupeParams(params: Param[]): Param[] {
  const map = new Map<string, Param>();
  for (const param of params) {
    const name = param.name.trim();
    if (!name) continue;
    const key = `${param.in}:${name}`;
    if (!map.has(key)) map.set(key, { ...param, name });
  }
  return [...map.values()];
}

function makeParam(name: string, location: ParamLocation, type = 'string'): Param {
  return {
    name: name.trim(),
    in: location,
    type: type.trim() || 'string',
    isBusiness: isBusiness(name),
  };
}

/** 从 path / query / header / body 提取参数并去重 */
function collectParams(
  pathWithQuery: string,
  headers: string[],
  bodies: string[],
): Param[] {
  const params: Param[] = [];
  const pathPart = pathWithQuery.split('#')[0];

  // path 模板变量，如 /api/order/{id}
  for (const match of pathPart.matchAll(/\{([^}]+)\}/g)) {
    params.push(makeParam(match[1], 'path'));
  }

  // query 参数
  const queryIndex = pathPart.indexOf('?');
  if (queryIndex >= 0) {
    const query = pathPart.slice(queryIndex + 1);
    for (const [name] of new URLSearchParams(query)) {
      if (name) params.push(makeParam(name, 'query'));
    }
  }

  // header 参数
  for (const raw of headers) {
    const separator = raw.indexOf(':');
    const name = separator > 0 ? raw.slice(0, separator) : raw;
    if (name.trim()) params.push(makeParam(name, 'header'));
  }

  // body：JSON 对象取键，表单 / 文本按 a=1&b=2 取键
  for (const raw of bodies) {
    const text = raw.trim();
    if (!text) continue;
    if (text.startsWith('{') || text.startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(text);
        if (isRecord(parsed)) {
          for (const [key, value] of Object.entries(parsed)) {
            params.push(makeParam(key, 'body', isRecord(value) ? 'object' : typeof value));
          }
        } else if (Array.isArray(parsed) && parsed.length > 0 && isRecord(parsed[0])) {
          for (const key of Object.keys(parsed[0])) params.push(makeParam(key, 'body'));
        }
      } catch {
        params.push(makeParam('raw', 'body', 'string'));
      }
    } else {
      for (const piece of text.split('&')) {
        const [name] = piece.split('=', 1);
        if (name) params.push(makeParam(decodeURIComponent(name), 'body'));
      }
    }
  }

  return dedupeParams(params);
}

/** new URL() 会把 {id} 编码成 %7Bid%7D，还原回模板变量原貌（其余合法编码不动） */
function restorePathTemplates(value: string): string {
  return value.replace(/%7B/gi, '{').replace(/%7D/gi, '}');
}

function normalizePath(raw: string): string {
  const text = raw.trim();
  if (!text) return '';
  if (text.startsWith('/')) return text;
  try {
    const url = new URL(text, 'http://placeholder.local');
    return restorePathTemplates(`${url.pathname}${url.search}`);
  } catch {
    return text.startsWith('/') ? text : `/${text}`;
  }
}

function fullUrlOf(baseUrl: string, raw: string, path: string): string {
  if (/^https?:\/\//i.test(raw)) {
    try {
      return restorePathTemplates(new URL(raw).toString());
    } catch {
      return raw.slice(0, MAX_PATH);
    }
  }
  if (!baseUrl) return '';
  try {
    return restorePathTemplates(new URL(path, baseUrl).toString());
  } catch {
    return `${baseUrl.replace(/\/$/, '')}${path}`;
  }
}

function defaultRespSignature(): RespSignature {
  // 未探活前用中性占位，避免把「未测试」伪造成有业务数据 / 空列表 / 登录码
  return RESP_SIGNATURES.includes('静态HTML') ? '静态HTML' : RESP_SIGNATURES[0];
}

function makeDraft(input: {
  assetId: string;
  method: HttpMethod;
  pathRaw: string;
  source: EndpointImportDraft['source'];
  params: Param[];
  baseUrl: string;
  note?: string;
}): EndpointImportDraft {
  const path = normalizePath(input.pathRaw);
  return {
    assetId: input.assetId,
    featureId: null,
    method: input.method,
    path,
    fullUrl: fullUrlOf(input.baseUrl, input.pathRaw, path),
    source: input.source,
    params: input.params,
    accessState: '未测试',
    respSignature: defaultRespSignature(),
    diffSurface: false,
    keys: [],
    note: (input.note ?? '').slice(0, MAX_NOTE),
  };
}

/* ------------------------------------------------------------------ */
/* path：每行一条                                                       */
/* ------------------------------------------------------------------ */

function parsePathLines(text: string, assetId: string, baseUrl: string): ParsedImport {
  const drafts: EndpointImportDraft[] = [];
  const errors: EndpointImportError[] = [];
  let skipped = 0;

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    const lineNo = index + 1;
    if (!line || line.startsWith('#')) {
      skipped += 1;
      return;
    }

    let method: HttpMethod = 'GET';
    let pathRaw = line;
    const firstSpace = line.search(/\s/);
    const firstToken = firstSpace > 0 ? line.slice(0, firstSpace) : '';
    const maybeMethod = firstToken ? methodFrom(firstToken) : null;
    if (maybeMethod) {
      method = maybeMethod;
      pathRaw = line.slice(firstSpace + 1).trim();
    }

    if (!pathRaw) {
      skipped += 1;
      errors.push({ line: lineNo, reason: 'path 为空' });
      return;
    }
    if (!/^https?:\/\//i.test(pathRaw) && !pathRaw.startsWith('/')) {
      skipped += 1;
      errors.push({ line: lineNo, reason: 'path 必须以 / 或 http(s):// 开头' });
      return;
    }

    const path = normalizePath(pathRaw);
    drafts.push(
      makeDraft({
        assetId,
        method,
        pathRaw,
        source: ENDPOINT_SOURCES.includes('字典') ? '字典' : ENDPOINT_SOURCES[0],
        params: collectParams(path, [], []),
        baseUrl,
        note: `path 第 ${lineNo} 行导入`,
      }),
    );
  });

  return { drafts, errors, skipped };
}

/* ------------------------------------------------------------------ */
/* curl：字符串解析                                                     */
/* ------------------------------------------------------------------ */

function splitCurlCommands(text: string): { command: string; line: number }[] {
  const result: { command: string; line: number }[] = [];
  let buffer = '';
  let startLine = 1;

  const flush = (): void => {
    const command = buffer.trim();
    if (command) result.push({ command, line: startLine });
    buffer = '';
  };

  text.split(/\r?\n/).forEach((raw, index) => {
    const lineNo = index + 1;
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (!buffer && (!trimmed || trimmed.startsWith('#'))) return;
    if (!buffer) startLine = lineNo;

    if (line.endsWith('\\')) {
      buffer += `${line.slice(0, -1)} `;
      return;
    }
    buffer += line;
    flush();
    startLine = lineNo + 1;
  });
  flush();
  return result;
}

function tokenizeCurl(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (const char of command) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\' && (quote === '"' || quote === null)) {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

const VALUE_OPTIONS = new Set([
  '-X',
  '--request',
  '-H',
  '--header',
  '-d',
  '--data',
  '--data-raw',
  '--data-ascii',
  '--data-binary',
  '--data-urlencode',
  '-b',
  '--cookie',
  '-A',
  '--user-agent',
  '-e',
  '--referer',
  '-u',
  '--user',
  '-o',
  '--output',
  '-F',
  '--form',
  '--connect-timeout',
  '--max-time',
  '-m',
  '--url',
]);

function optionValue(token: string): { key: string; inline?: string } {
  const equal = token.indexOf('=');
  if (token.startsWith('--') && equal > 2) {
    return { key: token.slice(0, equal), inline: token.slice(equal + 1) };
  }
  return { key: token };
}

function parseCurlCommands(text: string, assetId: string, baseUrl: string): ParsedImport {
  const drafts: EndpointImportDraft[] = [];
  const errors: EndpointImportError[] = [];
  let skipped = 0;

  for (const { command, line } of splitCurlCommands(text)) {
    const tokens = tokenizeCurl(command);
    if (tokens.length === 0 || tokens[0] !== 'curl') {
      skipped += 1;
      errors.push({ line, reason: '不是 curl 命令（应以 curl 开头）' });
      continue;
    }

    let method: HttpMethod | null = null;
    let explicitMethod = false;
    let urlRaw = '';
    const headers: string[] = [];
    const bodies: string[] = [];

    for (let index = 1; index < tokens.length; index += 1) {
      const rawToken = tokens[index];
      const { key, inline } = optionValue(rawToken);
      const needsValue = VALUE_OPTIONS.has(key);
      let value = inline;

      if (needsValue && value === undefined) {
        if (index + 1 >= tokens.length) {
          skipped += 1;
          errors.push({ line, reason: `参数 ${key} 缺少值` });
          value = '';
        } else {
          index += 1;
          value = tokens[index];
        }
      }

      if (key === '-X' || key === '--request') {
        explicitMethod = true;
        method = methodFrom(value ?? '');
        continue;
      }
      if (key === '-H' || key === '--header') {
        if (value) headers.push(value);
        continue;
      }
      if (
        key === '-d' ||
        key === '--data' ||
        key === '--data-raw' ||
        key === '--data-ascii' ||
        key === '--data-binary' ||
        key === '--data-urlencode'
      ) {
        if (value !== undefined) bodies.push(value);
        continue;
      }
      if (key === '--url') {
        urlRaw = value ?? '';
        continue;
      }
      if (needsValue) continue; // 其它带值选项只登记参数，不进 URL

      if (!rawToken.startsWith('-') && !urlRaw) {
        if (rawToken.includes('://') || rawToken.startsWith('/') || rawToken.includes('/')) {
          urlRaw = rawToken;
        }
      }
      // 其余开关（-k / -L / -s 等）忽略
    }

    if (explicitMethod && !method) {
      skipped += 1;
      errors.push({ line, reason: '-X 的 method 非法' });
      continue;
    }
    const finalMethod: HttpMethod = method ?? (bodies.length > 0 ? 'POST' : 'GET');
    if (!urlRaw) {
      skipped += 1;
      errors.push({ line, reason: '没有解析到 URL' });
      continue;
    }

    const path = normalizePath(urlRaw);
    if (!path) {
      skipped += 1;
      errors.push({ line, reason: 'URL 解析出的 path 为空' });
      continue;
    }

    drafts.push(
      makeDraft({
        assetId,
        method: finalMethod,
        pathRaw: urlRaw,
        source: ENDPOINT_SOURCES.includes('抓包') ? '抓包' : ENDPOINT_SOURCES[0],
        params: collectParams(path, headers, bodies),
        baseUrl,
        note: `curl 第 ${line} 行导入`,
      }),
    );
  }

  return { drafts, errors, skipped };
}

/* ------------------------------------------------------------------ */
/* Swagger / OpenAPI JSON                                               */
/* ------------------------------------------------------------------ */

function resolveRef(ref: unknown, doc: Record<string, unknown>): unknown {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return null;
  let current: unknown = doc;
  for (const rawPart of ref.slice(2).split('/')) {
    const part = rawPart.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!isRecord(current) && !Array.isArray(current)) return null;
    current = (current as Record<string, unknown>)[part];
    if (current === undefined) return null;
  }
  return current;
}

function schemaProperties(schema: unknown, doc: Record<string, unknown>): Param[] {
  if (!isRecord(schema)) return [];
  let target = schema;
  if (typeof schema.$ref === 'string') {
    const resolved = resolveRef(schema.$ref, doc);
    if (!isRecord(resolved)) return [];
    target = resolved;
  }
  const rawProperties = target.properties;
  if (!isRecord(rawProperties)) return [];
  return Object.entries(rawProperties).map(([name, value]) =>
    makeParam(
      name,
      'body',
      isRecord(value) && typeof value.type === 'string' ? value.type : 'string',
    ),
  );
}

function parameterFromRaw(
  raw: unknown,
  doc: Record<string, unknown>,
  inherited: Param[] = [],
): Param[] {
  let item = raw;
  if (isRecord(raw) && typeof raw.$ref === 'string') {
    const resolved = resolveRef(raw.$ref, doc);
    if (!isRecord(resolved)) return [];
    item = resolved;
  }
  if (!isRecord(item)) return [];
  const name = typeof item.name === 'string' ? item.name : '';
  const rawLocation = typeof item.in === 'string' ? item.in : '';
  const location: ParamLocation | '' = rawLocation === 'formData' ? 'body' : (rawLocation as ParamLocation | '');
  if (!name || !location || !validLocation(location)) return [];
  // Swagger 2 的 body 参数：展开 schema.properties，而不是记一个叫 body 的参数
  if (location === 'body' && isRecord(item.schema)) {
    return [...schemaProperties(item.schema, doc), ...inherited];
  }

  const type =
    (isRecord(item.schema) && typeof item.schema.type === 'string' && item.schema.type) ||
    (typeof item.type === 'string' && item.type) ||
    'string';
  return [makeParam(name, location, type), ...inherited];
}

function operationParams(
  operation: Record<string, unknown>,
  pathItem: Record<string, unknown>,
  doc: Record<string, unknown>,
): Param[] {
  const params: Param[] = [];

  // path 级 parameters + operation 级 parameters
  for (const list of [pathItem.parameters, operation.parameters]) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) params.push(...parameterFromRaw(raw, doc));
  }

  // OpenAPI 3 requestBody
  const requestBody = operation.requestBody;
  if (isRecord(requestBody)) {
    const body = typeof requestBody.$ref === 'string'
      ? resolveRef(requestBody.$ref, doc)
      : requestBody;
    if (isRecord(body) && isRecord(body.content)) {
      for (const media of Object.values(body.content)) {
        if (isRecord(media) && isRecord(media.schema)) {
          params.push(...schemaProperties(media.schema, doc));
        }
      }
    }
  }

  // Swagger 2 body 参数已被 parameterFromRaw 处理；这里补 formData / schema properties
  return dedupeParams(params);
}

function methodFromSwaggerKey(key: string): HttpMethod {
  const upper = key.toUpperCase();
  return (HTTP_METHODS.includes(upper as HttpMethod) ? upper : '*') as HttpMethod;
}

function parseSwaggerJson(text: string, assetId: string, baseUrl: string): ParsedImport {
  const drafts: EndpointImportDraft[] = [];
  const errors: EndpointImportError[] = [];
  let skipped = 0;

  let doc: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) throw new Error('根节点不是对象');
    doc = parsed;
  } catch (error) {
    return {
      drafts,
      errors: [{ line: 1, reason: `不是合法的 Swagger/OpenAPI JSON：${(error as Error).message}` }],
      skipped: 1,
    };
  }

  const paths = doc.paths;
  if (!isRecord(paths)) {
    return {
      drafts,
      errors: [{ line: 1, reason: '缺少 paths 对象' }],
      skipped: 1,
    };
  }

  for (const [pathKey, pathItem] of Object.entries(paths)) {
    if (!isRecord(pathItem)) {
      skipped += 1;
      errors.push({ line: 1, reason: `path ${pathKey} 不是对象，已跳过` });
      continue;
    }
    for (const [key, operation] of Object.entries(pathItem)) {
      if (!METHOD_KEYS.has(key.toLowerCase())) {
        skipped += 1; // parameters / summary / $ref 等非 method 键
        continue;
      }
      if (!isRecord(operation)) {
        skipped += 1;
        errors.push({ line: 1, reason: `${key.toUpperCase()} ${pathKey} 不是对象，已跳过` });
        continue;
      }
      const method = methodFromSwaggerKey(key);
      drafts.push(
        makeDraft({
          assetId,
          method,
          pathRaw: pathKey,
          source: ENDPOINT_SOURCES.includes('Swagger') ? 'Swagger' : ENDPOINT_SOURCES[0],
          params: operationParams(operation, pathItem, doc),
          baseUrl,
          note: `Swagger ${key.toUpperCase()} ${pathKey}`,
        }),
      );
    }
  }

  return { drafts, errors, skipped };
}

/** 统一入口 */
export function parseEndpointImport(
  format: EndpointImportFormat,
  text: string,
  assetId: string,
  baseUrl: string,
): ParsedImport {
  if (format === 'path') return parsePathLines(text, assetId, baseUrl);
  if (format === 'curl') return parseCurlCommands(text, assetId, baseUrl);
  return parseSwaggerJson(text, assetId, baseUrl);
}
