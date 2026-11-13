# Third-Party Notices

This repository contains two categories of material:

1. **Source code** in `src/`, `server/`, `shared/`, `scripts/`, and the build/config files at the repository root. These are licensed under the MIT License; see [LICENSE](LICENSE).
2. **Third-party methodology documents** in `skill/`. These are bundled with the application, but they are **not** covered by the MIT License. Copyright and licensing remain with their original authors.

## Bundled methodology package

The `skill/` directory contains rules, knowledge-base entries, lanes, strategy notes, playbooks, specialized routing docs, and templates. It is included so the application can provide its built-in suggestions, module lookup, and report template.

The copy in this repository does not include a separate license file for these documents, and the repository's MIT license does not relicense them. If you intend to reuse, redistribute, or commercially use the contents of `skill/` outside this project, check the original package's terms first.

If the original terms do not permit redistribution with this project, remove the `skill/` directory before publishing. The application will still start, but module lookup and docx report creation will be unavailable.

## Known references

Some documents reference or summarize third-party projects and public research, including:

- **SnowEyes** — the collection lane under `skill/specialized/snoweyes-collector/`.
- **Shannon** — the hybrid scanning note at `skill/strategy/14-shannon-hybrid-scanning.md`.
- Public vulnerability reports and research linked from the playbooks.

These names are mentioned for identification only. Their trademarks, copyrights, and licenses belong to their respective owners.

## Corrections

If you are a rights holder and believe a document is included without proper attribution or in violation of its license, please open an issue with the path and the license you believe applies. The content will be corrected or removed.
