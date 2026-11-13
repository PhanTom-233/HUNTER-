# SnowEyes Collector Skill

This is the Skill content-aware information collection lane.

It combines:

- passive search MCP discovery;
- SnowEyes HTML, JavaScript, response, and URL parsing;
- optional browser-runtime collection;
- normalization, redaction, deduplication, scoring, and handoff;
- bounded probe planning with an approval gate.

The Node MCP is the executable backend. The browser extension is an optional
runtime collector. Both use the same record contract in `references/`.
