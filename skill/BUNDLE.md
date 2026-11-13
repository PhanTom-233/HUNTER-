# 内置方法论包说明（分发版）

本目录是 **Skill** 的精选内置副本，随软件一起分发。
**不需要、也不允许**在软件里配置任何外部 skill 或知识库路径。

## 版本与入口

- 本目录为随软件分发的内置副本，版本标记 `bundled`（见 `manifest.json`）
- 程序唯一入口：**`index.json`**。不要遍历 md 文件，不要拼本机路径。
- 重建索引：`npm run skill:index`（改过本目录 md 之后跑）

## 收录内容

| 目录 | 数量 | 用途 |
|---|---|---|
| `rules/` | 11 | 方法论规则原文 |
| `knowledge-base/` | 47 | 漏洞测试模块 |
| `lanes/` | 27 | 按目标形态分的专业车道 |
| `strategy/` | 36 | 攻击优先级、证据纪律、时间盒等策略 |
| `playbooks/` | 53 | 按漏洞类型分的战术手册 |
| `specialized/` | 18 | 六条主 lane 的深层路由 |
| `templates/` | 4 | 报告模板（md）、**`report-blank.docx` 空白报告骨架**、测试矩阵模板、资产队列模板 |
| 根级 | — | `manifest.json` / `SKILL.md` / `AGENTS.md` / `README.md` / `BUNDLE.md` |

## 有意不收录

本软件是**记录 / 编排 / 建议**工具，不是 Agent 运行时，以下部分与它无关，且体积或敏感度不合适，故不打包：

- `mcp-servers/`（各测绘 MCP、字典文件、含第三方账号说明）
- `scripts/`、`runtime/`、`bin/`、`tests/`（执行与校验脚本）
- `adapters/`、`agents/`、`references/v22`、`references/v23`（Agent 协商与运行时契约）
- `references/experts/`、`references/integrations/`、`references/tools/`（可选深度层）
- `playbooks/intranet-postexp/`、`playbooks/dos.md`（后渗透 / 提权 / 拒绝服务，超出本工具范围）
- 两份「企业级渗透提示词」txt 与教程 PNG（给其他 AI 窗口用的，不是软件数据）
- `config.toml`（含本机环境配置）

因此 `SKILL.md` 末尾 Package Map 里指向 `adapters/`、`mcp-servers/` 等目录的链接在本副本中是**失效的**，属预期情况，以本文件为准。

## 模块解析规则

2.3 把部分模块从 `knowledge-base/` 挪进了 `playbooks/`，另有一个旧版笔误。程序解析 `kbModule` 时：

1. 先按 id 查 `index.json → knowledgeBase[].id`，命中则读 `knowledge-base/<id>.md`
2. 查不到再查 `index.json → moduleAliases`，值是**相对本目录**的路径
3. 仍查不到才标为「模块缺失」

当前 32 个引用已全部可解析（29 个直接命中 + 3 个别名），未解决 0。

`report-blank.docx` 是最小 OOXML（4 个 part，1.4 KB），内含 2.3 报告结构的 13 个小节，用 `scripts/make-report-template.py`（Python 标准库 zipfile）生成，改章节结构时重跑。程序「创建文档」时只做 `copyFileSync`，**不需要也不允许引入 docx 处理库**。

## 便携性

本目录内所有路径均为相对路径，不含盘符、用户名、家目录或任何凭据。文档里出现的 `C:\Windows\...`、`attacker@evil.com` 之类是漏洞测试用的通用示例 payload，不是本机信息。
