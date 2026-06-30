# Proposal: 03-core-host-orchestration-context

## Motivation

CLI `change context` and `project context` rebuild a full `CompileContextConfig` from `specd.yaml` on every invocation. That yaml-derived snapshot is stable for the lifetime of a kernel instance and belongs at composition time — not duplicated in every host adapter.

## Current behaviour

Today:

- `packages/cli/src/commands/change/context.ts` maps `SpecdConfig` into a `CompileContextConfig` object (~40 lines) and passes it on every `CompileContext.execute` call along with runtime flags.
- `packages/cli/src/commands/project/context.ts` performs the same inline `CompileContextConfig` construction before `GetProjectContext.execute`.
- `CompileContextInput` and `GetProjectContextInput` require a `config` field on every call.
- `createCompileContext` / `createGetProjectContext` wire ports but do not pre-compute context configuration defaults.

## Proposed solution

**P1a — bake defaults at construction:**

1. Add an internal composition helper `buildCompileContextConfig(config: SpecdConfig): CompileContextConfig` under `packages/core/src/composition/`. It is **not** exported from the public `@specd/core` barrel (A3).
2. `CompileContext` and `GetProjectContext` store a `_defaultConfig` field set at construction from `buildCompileContextConfig`.
3. Remove `config` from `CompileContextInput` and `GetProjectContextInput`.
4. `execute` merges `_defaultConfig` with per-call runtime overrides only:
   - shared: `contextMode?`, `llmOptimizedContext?`, `followDeps?`, `depth?`, `sections?`
   - change-scoped: `name`, `step`, `includeChangeSpecs?`, `fingerprint?`
5. Composition factories (`createCompileContext`, `createGetProjectContext`) call `buildCompileContextConfig` when constructing use cases from `SpecdConfig`.
6. CLI hosts stop building `CompileContextConfig` inline; they pass runtime overrides derived from flags (`--mode`, `--optimized`, section flags, etc.).

`RefreshImplementationTracking` before `change context` remains caller-owned in this change (same as today).

## Specs affected

### New specs

_none_

### Modified specs

- `core:compile-context`: bake yaml-derived `CompileContextConfig` at construction; drop `config` from input; document runtime override merge semantics.
  - Depends on (added): none
  - Depends on (removed): none

- `core:get-project-context`: same construction-time default config pattern; drop `config` from input; merge runtime overrides at execute.
  - Depends on (added): none
  - Depends on (removed): none

- `cli:change-context`: remove inline `CompileContextConfig` builder; pass runtime overrides to `CompileContext.execute` only.
  - Depends on (added): none
  - Depends on (removed): none

- `cli:project-context`: remove inline `CompileContextConfig` builder; pass runtime overrides to `GetProjectContext.execute` only.
  - Depends on (added): none
  - Depends on (removed): none

- `cli:project-status`: migrate `--context` path to baked `GetProjectContext` defaults; no inline `CompileContextConfig`; runtime overrides only (`execute({})`, `execute({ llmOptimizedContext: false })` when raw spec list needed).
  - Depends on (added): `core:get-project-context`
  - Depends on (removed): none

## Impact

- **Core:** `CompileContext`, `GetProjectContext`, `createCompileContext`, `createGetProjectContext`, new internal `buildCompileContextConfig`, kernel wiring, unit tests.
- **CLI:** `change/context.ts`, `project/context.ts`, `project/status.ts`, command tests.
- **API surface:** `CompileContextInput` and `GetProjectContextInput` lose required `config`; gain optional `contextMode` and `llmOptimizedContext` runtime overrides. `buildCompileContextConfig` is composition-internal only.
- **Blast radius:** HIGH — 16 files including kernel and both context use cases (per graph impact analysis).

## Technical context

- Precedent: `GetStatus` bakes `config.approvals` in its constructor — same pattern for context config defaults.
- `GetConfig` (P0c) gives hosts a detached `SpecdConfig` read; this change does not require hosts to call `GetConfig` to build context config.
- Workspace-level `contextIncludeSpecs` / `contextExcludeSpecs` remain in the baked default (yaml-derived); CLI `--mode` / `--optimized` / section flags remain runtime overrides.
- SDK/MCP handler thinning is out of scope for `main` (noted for merge doc).
- Should land after P0c (`getConfig`) when possible; before P1d (`07-core-kernel-input-audit`). Overlap warning with `core:kernel` changes in sibling active changes — archive in dependency order.

## Open questions

_none — API handler migration and `CompileContext`-internal refresh baking are explicitly deferred to follow-up changes._
