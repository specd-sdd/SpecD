---
'@specd/specd': minor
---

20260430 - compact-and-complete-outlines: Implemented a compact-first outline workflow by keeping changes artifact-instruction focused on availableOutlines references and moving full structure retrieval to on-demand specs outline. Added --full and --hints modes, with parser-owned default subsets and parser-provided root-level selectorHints, reducing verbosity while preserving complete selector coverage when needed. Updated core/CLI contracts, parser adapters, tests, and workflow guidance to keep the behavior consistent across current and future parsers.

Modified packages:

- @specd/cli
- @specd/core
- @specd/skills

Specs affected:

- `cli:cli/change-artifact-instruction`
- `core:core/get-artifact-instruction`
- `core:core/delta-format`
- `cli:cli/spec-outline`
- `core:core/get-spec-outline`
- `core:core/artifact-parser-port`
- `skills:workflow-automation`
