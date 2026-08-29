# Design: project-context-specs

## Non-goals

- Extending `specd project context` / `GetProjectContext` to print ID-only lists or apply workspace-level patterns.
- A dedicated SDK orchestration function (`resolveProjectContextSpecs`) that only forwards `kernel.project.resolveContextSpecs.execute`.
- Changing `CompileContext` or `GetProjectContext` public inputs, fingerprint/render contracts, `followDeps`, or change-seed protection beyond routing include/exclude through the shared helper.
- Treating incidental `specs/**/spec-lock.json` churn from tooling as product scope.

## Affected areas

### Core — shared helper and CompileContext

- `resolveConfiguredContextSpecs` in `packages/core/src/application/use-cases/_shared/resolve-configured-context-specs.ts`
  - Change: owns ordered project then active-workspace include/exclude via `listMatchingSpecs`; `collector` + optional `onOperation`.
  - Callers: `CompileContext`, `ResolveContextSpecs`, `GetProjectContext` (empty `activeWorkspaces`). Graph marks helper dependents CRITICAL because `CompileContext` fans out broadly; behavioural risk for this change is MEDIUM if parity tests pass (ordering preserved; no public CompileContext / GetProjectContext API change).
- `CompileContext` in `packages/core/src/application/use-cases/compile-context.ts`
  - Change: steps 1–4 call the helper; keep seeding, protected excludes, optimized-project empty project patterns, step 5 traversal.
  - Callers: kernel `project.compileContext`, many tests. Risk: HIGH for regressions in collection; mitigate with existing compile-context suites + helper-parity tests.

### Core — GetProjectContext migration (in scope)

- `GetProjectContext` in `packages/core/src/application/use-cases/get-project-context.ts`
  - Change: replace inline project include/exclude `listMatchingSpecs` loops with `resolveConfiguredContextSpecs({ ..., activeWorkspaces: new Set(), collector })`.
  - Must preserve: project-only matching, warning sink, followDeps after collection, rendering/optimization behaviour.
  - Callers: `project context` CLI, kernel mount, get-project-context tests. Risk: MEDIUM — public contract unchanged; regressions caught by existing get-project-context suites + new helper-usage scenarios.

### Core — ResolveContextSpecs surface

- `ResolveContextSpecs` (+ `ResolveContextSpecsInput` / `ResolveContextSpecsResult`) in `packages/core/src/application/use-cases/resolve-context-specs.ts`
  - Change (compliance follow-up): unknown workspace throws `InvalidInputError` instead of bare `Error`.
  - Callers: kernel mount, CLI, unit tests. Risk: LOW — typed failure path only.
- `createResolveContextSpecs` / `resolveResolveContextSpecsDeps` / `ResolveContextSpecsDeps` in `packages/core/src/composition/use-cases/resolve-context-specs.ts`
- `createKernel` / `Kernel.project.resolveContextSpecs` in `packages/core/src/composition/kernel.ts`
- Barrels: `packages/core/src/application/use-cases/index.ts`, `packages/core/src/composition/use-cases/index.ts`, `packages/core/src/public.ts`
- SDK re-exports only: `packages/sdk/src/core-reexports.ts` (class/types/factory). **Removed** orchestration file `packages/sdk/src/orchestration/resolve-project-context-specs.ts` and its exports from `orchestration/index.ts` / `sdk/src/index.ts`.

### CLI

- `registerProjectContextSpecs` / `formatContextSpecsText` in `packages/cli/src/commands/project/context-specs.ts`
- Registration in `packages/cli/src/index.ts` after `registerProjectContext`
- Host pattern: `resolveCliContext` → `kernel.project.resolveContextSpecs.execute` (same as `project context`)

### Docs (already drafted in fast-track; keep aligned)

- `docs/cli/cli-reference.md`, `docs/cli/project-context-specs.md`, `docs/core/use-cases.md`, `docs/sdk/index.md`, `docs/guide/_sections/getting-started/context-compilation.md`

### Tests / mocks still required

- `packages/core/test/barrel-kernel-coverage.spec.ts` — `KERNEL_ASSEMBLY_EXPORTS` must include `project.resolveContextSpecs` → `createResolveContextSpecs`
- `packages/cli/test/commands/helpers.ts` `makeMockKernel()` and any entrypoint stubs that enumerate `kernel.project` mounts
- Parity / CLI / GetProjectContext helper-adoption tests (see Approach)

## New constructs

### `resolveConfiguredContextSpecs` (application `_shared`)

**Location:** `packages/core/src/application/use-cases/_shared/resolve-configured-context-specs.ts`

**Shape:**

```typescript
type ConfiguredContextSpecSource =
  | { readonly kind: 'project' }
  | { readonly kind: 'workspace'; readonly workspace: string }

interface ConfiguredContextSpecCollector {
  include(spec: ResolvedSpec): void
  exclude(spec: ResolvedSpec): void
}

type ConfiguredContextSpecOperationListener = (
  op: 'include' | 'exclude',
  spec: ResolvedSpec,
  source: ConfiguredContextSpecSource,
) => void

interface ResolveConfiguredContextSpecsInput {
  readonly config: CompileContextConfig
  readonly activeWorkspaces: ReadonlySet<string>
  readonly workspaceMap: ReadonlyMap<string, ProjectWorkspace>
  readonly collector: ConfiguredContextSpecCollector
  readonly warnings: ContextWarning[]
  readonly onOperation?: ConfiguredContextSpecOperationListener
}

async function resolveConfiguredContextSpecs(
  input: ResolveConfiguredContextSpecsInput,
): Promise<void>
```

**Responsibility:** Apply glob include/exclude in fixed order; never render or traverse deps. Empty `activeWorkspaces` ⇒ project steps only.

**Relationships:** Uses `listMatchingSpecs`. Consumed by `CompileContext`, `ResolveContextSpecs`, and `GetProjectContext`.

### `ResolveContextSpecs` (application use case)

**Location:** `packages/core/src/application/use-cases/resolve-context-specs.ts`

**Shape:**

```typescript
interface ResolveContextSpecsInput {
  readonly workspaces?: readonly string[]
  readonly workspacesOnly?: boolean
}

interface ResolveContextSpecsResult {
  readonly project: readonly string[]
  readonly workspaces: Readonly<Record<string, readonly string[]>>
}

class ResolveContextSpecs {
  constructor(listWorkspaces: ListWorkspaces, config: CompileContextConfig)
  execute(input?: ResolveContextSpecsInput): Promise<ResolveContextSpecsResult>
}
```

**Behaviour contract:**

1. Load workspaces via `ListWorkspaces.execute()`.
2. Deduplicate `input.workspaces`; if any name missing → throw `InvalidInputError` (`SpecdError`, code `INVALID_INPUT`) with message `Unknown workspace '<name>'` (one) or `Unknown workspaces: 'a', 'b'` (several). Do **not** throw a bare `Error`.
3. Active set = all configured names when filter omitted/empty; else requested names.
4. If `workspacesOnly`, pass config with empty `contextIncludeSpecs` / `contextExcludeSpecs` into the helper.
5. Collector maintains effective `Map` keyed by `` `${workspace}:${capPath}` ``; `onOperation` records include sources; exclude deletes from both maps.
6. Build `project` from IDs with source `project`; build per-workspace lists from workspace sources; emit every active workspace key (empty array allowed).
7. Dual listing required when both layers included the ID and it survived excludes.

**Composition:** `createResolveContextSpecs(deps)` and config form via `normalizeCompositionFactoryArgs` + `resolveResolveContextSpecsDeps(resolver)` supplying `listWorkspaces` + `defaultConfig` from `getCompileContextConfig()`. Kernel: `project.resolveContextSpecs`.

### CLI command

**Location:** `packages/cli/src/commands/project/context-specs.ts`

**Shape:** Commander subcommand `context-specs` with `--workspace` (collect), `--workspaces-only`, `--format`, `--config`. Text formatter nests `project:` / `workspaces.<name>:`; structured formats emit `ResolveContextSpecsResult` as-is (`project: []` retained when workspaces-only).

## Approach

1. **Helper first** — centralize steps 1–4 glob order so CompileContext, ResolveContextSpecs, and GetProjectContext cannot drift.
2. **Migrate CompileContext** — replace inline loops with helper + collector that preserves protect-on-exclude; empty project patterns when optimized project context is preferred.
3. **Migrate GetProjectContext** — replace project-only include/exclude loops with the helper and `activeWorkspaces: new Set()`; keep followDeps/render/optimization unchanged; remove dead `projectExcludedKeysFrom` if it becomes unused.
4. **Add ResolveContextSpecs** — ID-only, partitioned result, unknown-workspace fail-hard, optional `workspacesOnly`.
5. **Wire composition/kernel/public + SDK re-exports** — no orchestration wrapper.
6. **Thin CLI** — mirror `project context` host wiring; text presentation owned by CLI.
7. **Docs** — CLI reference + dedicated page + core use-cases + SDK mapping note (kernel execute, not orchestration).
8. **Finish tests** — ResolveContextSpecs unit coverage, helper-vs-CompileContext ID parity, GetProjectContext suites green after migration + helper-usage assertions, CLI tests, kernel assembly + mock kernel mounts.

Requirement coverage map:

| Capability                                          | Implementation                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| Partitioned ID result + dual listing                | `ResolveContextSpecs.execute` + unit tests                                     |
| Shared helper order                                 | `resolveConfiguredContextSpecs` + CompileContext / GetProjectContext migration |
| GetProjectContext project-only via empty active set | `GetProjectContext` helper call                                                |
| Workspace filter / unknown fail                     | `ResolveContextSpecs` throws `InvalidInputError`; CLI `handleError` → exit 1   |
| workspacesOnly                                      | Core empties project patterns; CLI omits text `project:`                       |
| Kernel + public exports                             | composition + `public.ts` + SDK re-exports                                     |
| No SDK orchestration wrapper                        | deleted wrapper; CLI uses kernel                                               |
| CompileContext protected seeds / optimized skip     | CompileContext collector + empty project arrays                                |

## Key decisions

- **Decision:** Dedicated Core use case instead of extending `project context` into an ID-only query. **Rejected:** bloating rendered context command / changing GetProjectContext public query shape.
- **Decision:** Shared helper owned with ResolveContextSpecs; CompileContext and GetProjectContext depend on it. **Rejected:** circular `compile-context` ↔ `resolve-context-specs` deps; ResolveContextSpecs depends only on `list-workspaces` + `config`.
- **Decision:** GetProjectContext reuses helper with empty `activeWorkspaces` (in scope). **Rejected:** leaving duplicated project loops as optional follow-up.
- **Decision:** Result `{ project, workspaces }` with dual listing. **Rejected:** flat `specIds` (loses provenance).
- **Decision:** Repeatable `--workspace` + `--workspaces-only`. **Rejected:** positional workspace, CSV / `--workspaces` plural flag.
- **Decision:** Unknown workspaces fail via `InvalidInputError` (`INVALID_INPUT`) so CLI `handleError` exits `1` with `error:` — same contract as other Core validation failures. **Rejected:** bare `Error` (CLI exit `3` / `fatal:`) and inventing a dedicated workspace-not-found error class when `InvalidInputError` already covers invalid use-case input.
- **Decision:** CLI → kernel execute; SDK re-exports types only. **Rejected:** one-line SDK orchestration facade.

## Trade-offs

- [CompileContext / helper blast radius CRITICAL in graph] → Keep public CompileContext and GetProjectContext behaviour identical; rely on existing suites + explicit parity/helper-usage tests.
- [Empty-set convention for project-only] → Document clearly; do not invent a second helper API unless a third caller needs richer modes.
- [Helper is not a public Core export] → Keep under `_shared`; public contracts are the three use cases' requirements.

## Spec impact

- **Modified:** `core:compile-context`, `core:get-project-context` — collection must use helper; dependents remain valid because public inputs/outputs unchanged.
- **New:** `core:resolve-context-specs`, `cli:project-context-specs`.
- **Not in scope / no delta:** `cli:project-context`, `sdk:host-context` (inspect-only).
- **Removed from earlier mistaken scope:** `sdk:resolve-project-context-specs`.

## Testing

### Automated

- `packages/core/test/application/use-cases/resolve-context-specs.spec.ts` — dual listing, workspacesOnly, filter, empty arrays; unknown workspace asserts `InvalidInputError` + `code === 'INVALID_INPUT'` + exact message (single and multi).
- `packages/core/test/application/use-cases/configured-context-parity.spec.ts` — ResolveContextSpecs effective IDs match CompileContext steps 1–4 collection (no change seeds / ignore rendering).
- Dedicated helper unit coverage in `packages/core/test/application/use-cases/resolve-configured-context-specs.spec.ts` (new): project-then-workspace include/exclude order; empty `activeWorkspaces` runs project patterns only; inactive workspace skipped.
- `packages/core/test/application/use-cases/get-project-context.spec.ts` — project exclude via helper; workspace patterns ignored with empty active set.
- `packages/core/test/barrel-kernel-coverage.spec.ts` — `project.resolveContextSpecs` → `createResolveContextSpecs`.
- `packages/cli/test/commands/project-context-specs.spec.ts` — text/toon/workspaces-only/repeatable workspace; unknown workspace mock throws `InvalidInputError` and expects exit `1` + `error:` (not exit `3` / `fatal:`); excess positional rejected.

### Manual / E2E

```bash
node packages/cli/dist/index.js project context-specs --format text
node packages/cli/dist/index.js project context-specs --workspace core --workspaces-only --format toon
node packages/cli/dist/index.js project context-specs --workspace does-not-exist ; echo $?
# expect exit 1 and stderr: error: Unknown workspace 'does-not-exist'
```

## Open questions

_none_
