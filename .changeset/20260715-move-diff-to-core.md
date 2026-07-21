---
    "@specd/core": minor
    "@specd/cli": patch
---

20260715 - move-diff-to-core: Move unified diff generation into core PreviewSpec so CLI, HTTP API, and MCP can reuse the same preview result without duplicating diff logic. This adds an internal DiffGenerator capability with a default core implementation, keeps diff generation opt-in for PreviewSpec callers, and simplifies the CLI to render diff data returned by core while preserving its existing presentation behavior.

Specs affected:

- `core:preview-spec`
- `cli:change-spec-preview`
- `core:diff-generator`
