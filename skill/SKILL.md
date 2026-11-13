---
name: skill
description: >
  Skill is an authorized enterprise security research workflow coordinated
  by a negotiated Agent adapter. It turns scope into an asset graph, collects passive signals,
  maintains a bounded hypothesis ledger, validates one reversible decision at
  a time, and produces a reproducible evidence package.
---

# Skill

This is the package entry point. Use it for authorized SRC, enterprise
security review, controlled black-box testing, and white-box code review.
The package does not authorize activity by itself: a verifiable scope record
is required before active validation.
The workflow is one stateful loop. Every candidate must retain its source,
scope, baseline, validation result, and evidence status.

## Operating Loop

1. Confirm authorization, scope, identities, time window, request budget, and
   prohibited actions.
2. Create an asset graph with domains, hosts, applications, roles, tenants,
   data classes, and known exclusions.
3. Collect passive surface data through configured search MCPs.
4. Use the SnowEyes collection lane for HTML, JavaScript, routes, API
   schemas, parameters, response signals, and rendered client state.
5. Normalize records, redact secrets, deduplicate assets, and link each record
   to its source and collection time.
6. Record one hypothesis in the ledger. Load one specialist lane only when a
   concrete signal justifies it.
7. Establish a control request, change one variable, and perform the smallest
   reversible validation that can decide the hypothesis.
8. Apply the evidence gate. A scanner result, banner, route name, or error
   message is a lead, not a finding.
9. Write the result using the report lane, record cleanup, and update the
   replay state.
10. Feed confirmed outcomes, false positives, and rejection reasons into the
    local pattern index without storing secrets or personal data.

## Grok Coordination Contract

Grok owns the state machine and must keep these fields visible:

- `scope_state`: confirmed, incomplete, or blocked;
- `profile_state`: asset, role, tenant, and trust-boundary coverage;
- `collection_state`: source, timestamp, query, page, and deduplication key;
- `hypothesis_state`: one asset, one behavior, one expected invariant;
- `validation_state`: baseline, mutation, response delta, and impact;
- `evidence_state`: reproducible, redacted, reversible, and reportable;
- `next_action`: the smallest useful next action or an explicit stop reason.

Do not open a new branch while the current branch has an unresolved
high-value decision. Two consecutive no-change validations require a route
review, not an uncontrolled expansion of the target set.

## Collection Layer

- Search MCPs provide passive asset and technology candidates. Use more than
  one source only when the sources answer different questions.
- SnowEyes provides page, script, route, parameter, API, authentication, and
  rendered-state extraction. Its extension is loaded through the configured
  environment path.
- Local parsers normalize outputs into stable records before prioritization.
- Active requests are off by default and require an explicit authorization
  state, request budget, impact estimate, and rollback rule.

Read `references/lanes/information-collection.md` for the collection contract
and `skills/specialized/snoweyes-collector/SKILL.md` for the implementation
lane.

## Specialist Routing

Use exactly one primary lane per hypothesis:

| Signal | Primary lane |
| --- | --- |
| API route, object, role, token, or schema boundary | `skills/specialized/api-security/SKILL.md` |
| Payment, order, quota, coupon, workflow, or state transition | `skills/specialized/business-logic-attack/SKILL.md` |
| Broad authorized target discovery and iterative hunting | `skills/specialized/src-hunt-lane/SKILL.md` |
| Target inventory, technology graph, and attack-surface ranking | `skills/specialized/target-profiling/SKILL.md` |
| Submission decision, severity, reproduction, and evidence quality | `skills/specialized/src-report-paradigm/SKILL.md` |
| SQL injection signal | `skills/specialized/sqli-sql-injection/SKILL.md` |

The expert library under `references/experts/` is an optional depth layer.
Experts are selected by the primary lane and must return to the same
hypothesis and evidence contract. They are not independent routers.

## Evidence Gate

A reportable result requires all of the following:

- confirmed authorization and in-scope asset;
- reproducible request or observation;
- control or baseline comparison;
- affected object, identity, tenant, or business state;
- clear security impact;
- safe rollback or cleanup;
- redacted evidence references.

If one item is missing, mark the candidate as incomplete and state the next
decision needed. Never inflate a lead into a finding.

## Safety Boundary

Use only on assets and environments where testing is authorized. Do not cross
scope, retain secrets, expose personal data, perform uncontrolled crawling,
degrade availability, or make irreversible state changes without explicit
approval. Keep probes read-only or reversible whenever possible.

Before execution, negotiate the host Agent adapter in `adapters/`. The adapter
must declare available tools, context limits, confirmation behavior, session
isolation, and persistence boundaries. The core workflow remains authoritative
over platform-specific syntax.

The mandatory 2.2 operating contract, evidence schema, MCP governance rules,
local knowledge index, 2.3 adapter protocol, and benchmark contract are in
`references/v22/`, `adapters/`, and `references/v23/`.

For long-running SRC work, read `references/v23/enterprise-loop.md` and
`references/v23/coverage-and-quality.md`. For browser or multi-agent runs,
read `references/v23/browser-and-subagent-contract.md`.

## Package Map

- `skills/skill/`: deep routing and the canonical knowledge base;
- `skills/specialized/`: the six primary lanes;
- `references/experts/`: optional depth modules with local link contracts;
- `references/playbooks/`: bounded technical playbooks;
- `mcp-servers/`: local MCP adapters and tests;
- `scripts/`: validation, link auditing, and state utilities.
