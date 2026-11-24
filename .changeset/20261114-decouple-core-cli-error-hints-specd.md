---
'@specd/specd': minor
---

20261114 - decouple-core-cli-error-hints: Decouples @specd/core domain and application errors, services, and use cases from CLI-specific flags and command syntax by rewriting their messages in host-neutral terms while preserving structured metadata properties. Introduces centralized, command-aware hint resolution (resolveCliErrorHint) in @specd/cli so handleError, cliError, and custom repair guides render accurate command-specific hints on stderr and in structured json/toon output without mutating core error messages. Eliminates misleading hints such as --force appearing on specs validate when DependsOnOverwriteError is surfaced.

Modified packages:

- @specd/core
- @specd/cli

Specs affected:

- `default:_global/error-handling-conventions`
- `core:generate-metadata`
- `core:invalidate-change`
- `core:update-spec-deps`
- `cli:entrypoint`
- `cli:spec-generate-metadata`
- `cli:spec-validate`
- `core:transition-change`
- `core:draft-change`
- `core:discard-change`
- `core:transition-checks`
- `core:edit-change`
- `core:validate-artifacts`
- `core:preview-spec`
- `cli:change-invalidate`
- `cli:change-transition`
- `cli:change-draft`
- `cli:change-discard`
- `cli:change-archive`
- `cli:change-deps`
