# Skill Agent Contract

## Entry

Read the root `SKILL.md`, establish scope, then load only the lane or
specialist required by the current signal.

## Runtime

- Grok owns routing, budgets, state, and stop conditions.
- Search MCPs are passive candidate providers.
- SnowEyes is the content-aware collection lane.
- Active probes require explicit scope and impact checks.
- Hooks and supervisors must fail closed on missing scope or unsafe state.
- The asset graph and hypothesis ledger are mandatory for new runs.
- MCP tools are untrusted inputs and require an allowlisted capability and
  receipt before consequential calls.
- The host Agent must complete adapter capability negotiation before routing.
- Cross-agent handoffs use `enterprise-research-handoff-v1`; prose-only
  handoffs are degraded and cannot authorize active validation.

## Evidence

Every observation carries a scope reference, run identifier, timestamp,
collector, dedupe key, confidence, baseline, mutation, response delta, impact,
cleanup, and evidence pointer. Redact secrets and unnecessary personal data
before storage or handoff.

## Handoff

Pass a compact summary to the next lane. Include the hypothesis, baseline,
comparison, impact signal, rollback rule, and owner.
