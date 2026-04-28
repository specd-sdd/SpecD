---
'@specd/specd': minor
---

20260428 - context-modes-ux: Adds an explicit --mode flag to context commands and aligns full/hybrid rendering behavior across project context, change context, and spec context. The implementation now defaults full-mode output to structured Description + Rules + Constraints, with section filters overriding defaults while preserving header context. Core and CLI context use cases/tests were updated to enforce consistent mode semantics and predictable context output for agents.

Modified packages:

- @specd/cli
- @specd/core

Specs affected:

- `cli:cli/project-context`
- `cli:cli/change-context`
- `cli:cli/spec-context`
- `core:core/compile-context`
- `core:core/get-spec-context`
- `core:core/get-project-context`
- `core:core/config`
