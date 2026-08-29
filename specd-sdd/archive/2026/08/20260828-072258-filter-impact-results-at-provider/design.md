# Design: filter-impact-results-at-provider

## Non-goals

- This change does not add document impact results or a `documents` result type.
- This change does not add pagination, a new result limit, or change `maxDepth` semantics.
- This change does not add configuration-file keys or environment variables for impact filters.
- This change does not change `graph search` filter behavior or its option cardinality.
- This change does not move filtering into the CLI, SDK, or formatting layer.
- This change does not alter persisted graph entities, relations, source indexes, or user-authored data.
- This change does not change selector resolution, graph freshness checks, or provider lifecycle rules.

## Affected areas

### CLI workspace

- `packages/cli/src/commands/graph/impact.ts`
  - `registerGraphImpact(program: Command, context: GraphCliContext): void` gains four options:
    - `--type <types>` accepts a comma-separated list from `files`, `symbols`, and `specs`.
    - `--kind <kinds>` accepts a comma-separated list of canonical `SymbolKind` values.
    - `--workspace <workspace>` is repeatable.
    - `--exclude-workspace <workspace>` is repeatable.
  - The command option shape gains `type?: string`, `kind?: string`, `workspace?: string[]`, and `excludeWorkspace?: string[]`.
  - Every file, symbol, exported-binding, and spec branch normalizes one `ImpactResultFilter` and passes it as the final provider argument. It must not filter returned arrays.
  - Existing calls change from `provider.analyzeImpact(target, direction, maxDepth)` to `provider.analyzeImpact(target, direction, maxDepth, filter)` and equivalently for public-binding, file, files, and spec analysis.
  - Existing display-path projection remains allowed because it changes representation, not membership.
  - Backwards compatibility: when no filter option is supplied, the command passes `undefined`; output and provider calls are identical to current behavior.
  - Impact analysis reports this command and its provider calls as part of a CRITICAL aggregate blast radius. The CLI spec itself has LOW dependent-spec risk and no dependent specs.
- `packages/cli/src/commands/graph/parse-graph-kinds.ts`
  - Reuse `parseGraphKinds(value: string): SymbolKind[]`; do not create a second symbol-kind vocabulary.
- `packages/cli/test/commands/graph-impact.spec.ts`
  - Extend command registration and execution tests for parsing, repeatable flags, normalization, delegation, structured output, and early validation errors.
- `docs/cli/cli-reference.md`
  - Update the `graph impact` option table and examples with all four flags, comma-separated/repeatable behavior, type/kind compatibility, exclusion precedence, and provider-side semantics.

### Code Graph domain and composition

- `packages/code-graph/src/domain/value-objects/impact-result.ts`
  - Add the public filter types defined in **New constructs**.
  - Add required `affectedSpecs: readonly string[]` to the base `ImpactResult`, so every target family, including symbol and public-binding impact, exposes the selected spec category.
  - Remove the redundant declaration from `SpecImpactResult`; it inherits the same field from `ImpactResult`. Existing fields remain required. Filtering materializes an unrequested category as `[]`; it never omits or makes fields optional.
- `packages/code-graph/src/domain/value-objects/index.ts`, `packages/code-graph/src/public.ts`, and `packages/code-graph/src/index.ts`
  - Export `IMPACT_RESULT_TYPES`, `ImpactResultType`, and `ImpactResultFilter` through the value-object, public, and package entry-point barrels.
  - Export the store frontier contract only from internal/domain barrels needed by adapters and tests; it is not part of the public provider API.
  - Add named exports only and retain `.js` ESM import suffixes.
- `packages/code-graph/src/domain/ports/graph-store.ts`
  - Add the backend-neutral `ImpactFrontierQuery`, `ImpactFrontierResult`, and `ImpactResourceKind` contracts and abstract `queryImpactFrontier(input: ImpactFrontierQuery): Promise<ImpactFrontierResult>` method.
  - All concrete/test stores must implement the new abstract method.
  - Graph-store spec impact is CRITICAL: 10 direct and 13 indirect dependent specs, 45 affected files, and 23 dependent specs. Existing methods remain unchanged; compatibility work is limited to implementing the new method in every backend/test double.
- `packages/code-graph/src/domain/services/analyze-impact.ts`
  - Before: `analyzeImpact(store, target, direction, maxDepth = 3, resolution?)` and `analyzePublicBindingImpact(store, input, direction, maxDepth = 3)`.
  - After: append `filter?: ImpactResultFilter` to each signature, after every existing parameter.
  - Use `queryImpactFrontier` for traversal expansion and hydration. Preserve public-binding resolution behavior.
  - Populate `affectedSpecs` for symbol and public-binding targets from specs covering the root symbol, its owning file, and the admitted affected symbol/file evidence. Spec discovery is a projection over admitted traversal evidence and does not alter counts, depths, or risk.
- `packages/code-graph/src/domain/services/collect-impact-specs.ts`
  - Introduce one shared internal helper for deterministic `COVERS_SYMBOL` and `COVERS_FILE` coverage lookup.
  - Move the existing file-impact covering-spec collection logic behind this helper so `analyze-impact.ts` does not import `analyze-file-impact.ts` and create a service cycle.
  - Return detailed `CoveringSpecImpact` evidence for file results and provide stable-deduplicated spec IDs for the base `affectedSpecs` projection.
- `packages/code-graph/src/domain/services/analyze-file-impact.ts`
  - Before: `analyzeFileImpact(store, filePath, direction, maxDepth = 3, resolve?)` and the internal details operation with its current context parameter.
  - After: append `filter?: ImpactResultFilter` after all existing optional resolver/context parameters; internal calls forward the same normalized filter.
  - Reuse the shared coverage helper. `coveringSpecs` retains its detailed file-specific evidence, while base `affectedSpecs` contains the corresponding deterministic spec IDs.
- `packages/code-graph/src/domain/services/analyze-files-impact.ts`
  - Before: `analyzeFilesImpact(store, filePaths, direction, maxDepth = 3, resolve?)`.
  - After: append `filter?: ImpactResultFilter`. Aggregation deduplicates only rows admitted by the store and calculates depths, counts, and risk from those rows.
- `packages/code-graph/src/domain/services/analyze-spec-impact.ts`
  - Before: `analyzeSpecImpact(store, specId, direction, maxDepth = 3, resolve?)`.
  - After: append `filter?: ImpactResultFilter`; inherited `affectedSpecs`, files, and symbols obey result-type and workspace filters.
- `packages/code-graph/src/composition/code-graph-provider.ts`
  - Append `filter?: ImpactResultFilter` to these interface and implementation methods: `analyzeImpact`, `analyzePublicBindingImpact`, `analyzeFileImpact`, `analyzeFilesImpact`, and `analyzeSpecImpact`.
  - Each implementation calls `assertAvailable()` exactly once, then delegates the unchanged target/direction/depth plus filter to its domain service.
  - No concrete store or SQL type may leak through `CodeGraphProvider`.
  - Composition impact is HIGH at the spec level (10 direct, 9 indirect dependent specs, 20 affected files). Runtime source impact is CRITICAL (47 direct dependents across 45 files), mitigated by optional final arguments and additive exports.
- `packages/code-graph/test/domain/services/traversal.spec.ts` and `packages/code-graph/test/domain/services/analyze-files-impact.spec.ts`
  - Add filtered traversal, depth/count/risk, legacy compatibility, category materialization, precedence, and deduplication cases.
- `packages/code-graph/test/domain/ports/graph-store.contract.ts`
  - Add backend contract assertions for frontier filtering, deterministic results, empty input, and omitted filters.
- `packages/code-graph/test/helpers/in-memory-graph-store.ts`
  - Implement `queryImpactFrontier` with the same observable contract for domain unit tests. This helper may filter in memory because it is a test backend, not a production adapter.
- `packages/code-graph/test/composition/code-graph-provider.spec.ts` and `packages/code-graph/test/barrel.spec.ts`
  - Verify lifecycle/delegation and public named exports.

### SQLite infrastructure

- `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`
  - Implement `queryImpactFrontier` as one typed worker request and return its typed result unchanged.
  - It must not fetch broad rows and post-filter them in TypeScript.
- `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`
  - Add `queryImpactFrontier(input: ImpactFrontierQuery): ImpactFrontierResult`.
  - Build direction-aware relation selection and category hydration with bound parameters. Workspace predicates for symbols join `symbols.file_path = files.path`; file and spec predicates use their own `workspace` columns.
  - Apply inclusion and exclusion predicates before returned relations are admitted. Exclusion always wins.
  - Return relations for admitted traversal endpoints and hydrate only requested categories.
- `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-protocol.ts`
  - Add `queryImpactFrontier: { payload: { input: ImpactFrontierQuery }; result: ImpactFrontierResult }` to `SQLiteWorkerOperationMap`.
- `packages/code-graph/src/infrastructure/sqlite/sqlite-worker.ts`
  - Add a `queryImpactFrontier` switch branch that calls the database method and returns the result. No filtering logic belongs in the worker dispatcher.
- `packages/code-graph/src/infrastructure/sqlite/schema.ts`
  - Change `SQLITE_SCHEMA_VERSION` from `9` to `10`.
  - Add `idx_files_workspace ON files(workspace)` and `idx_symbols_kind_file_path ON symbols(kind, file_path)`. Keep `idx_specs_workspace` and existing relation indexes.
- `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`, `packages/code-graph/test/infrastructure/sqlite/sqlite-worker-protocol.spec.ts`, and `packages/code-graph/test/integration/sqlite-wide-traversal.spec.ts`
  - Verify real SQL predicates, worker transport, schema version/indexes, parameterization, deterministic ordering, and bounded traversal behavior.

### Cross-change coordination

- The five modified specs overlap with active change `language-agnostic-member-symbol-references`. Implementation must inspect the other change and current worktree before editing shared source or delta files, preserve its edits, and adapt this implementation to the merged current state. This change must not rewrite or remove the other change's artifacts.
- A final grouped graph impact over the 27 indexed implementation/test files above reports `CRITICAL`: 497 direct dependents, 904 indirect dependents, 601 transitive dependents, and 133 affected files. `docs/cli/cli-reference.md` is not graph-indexed and was reviewed separately as a documentation-only target. The primary risk drivers are the abstract `GraphStore` contract, provider facade, public barrels, and SQLite worker/database path. Optional final arguments, additive exports, complete backend/test-double implementations, schema-versioned reindexing, and full contract/integration tests are mandatory mitigations.

## New constructs

### Public impact filter vocabulary

Location: `packages/code-graph/src/domain/value-objects/impact-result.ts`.

```ts
import { type SymbolKind } from './symbol-kind.js'

/** Stable result categories accepted by impact analysis. */
export const IMPACT_RESULT_TYPES = ['files', 'symbols', 'specs'] as const

/** One materialized category in an impact result. */
export type ImpactResultType = (typeof IMPACT_RESULT_TYPES)[number]

/** Optional provider-owned constraints for impact traversal and materialization. */
export interface ImpactResultFilter {
  readonly types?: readonly ImpactResultType[]
  readonly kinds?: readonly SymbolKind[]
  readonly workspaces?: readonly string[]
  readonly excludeWorkspaces?: readonly string[]
}
```

Invariants:

- Omitted properties mean unconstrained behavior for that dimension.
- Arrays passed across the public API are already trimmed, stable-deduplicated, and non-empty.
- `kinds` constrains symbols. The CLI rejects it when an explicit `types` list excludes `symbols`; non-CLI callers may combine it with omitted `types` or a list containing `symbols`.
- `excludeWorkspaces` takes precedence over `workspaces` for identical names.
- Values are immutable inputs; services and adapters must not mutate them.

### Backend-neutral frontier contract

Location: `packages/code-graph/src/domain/ports/graph-store.ts`.

```ts
import { type ImpactResultFilter } from '../value-objects/impact-result.js'

export type ImpactDirection = 'upstream' | 'downstream' | 'both'
export type ImpactResourceKind = 'symbol' | 'file' | 'spec'

export interface ImpactFrontierQuery {
  readonly resource: ImpactResourceKind
  readonly frontier: readonly string[]
  readonly direction: ImpactDirection
  readonly depth: number
  readonly maxDepth: number
  readonly relationTypes: readonly RelationType[]
  readonly filter?: ImpactResultFilter
}

export interface ImpactFrontierResult {
  readonly relations: readonly Relation[]
  readonly symbols: readonly SymbolNode[]
  readonly files: readonly FileNode[]
  readonly specs: readonly SpecNode[]
}
```

`GraphStore` gains:

```ts
abstract queryImpactFrontier(input: ImpactFrontierQuery): Promise<ImpactFrontierResult>
```

Invariants:

- `frontier` contains canonical IDs/paths of the current expansion nodes.
- `resource` designates the candidate or neighbor resource category to expand towards or hydrate (e.g., `'spec'` when discovering covering specs for symbols/files).
- `depth` is the depth of candidate endpoints; traversal steps satisfy `1 <= depth <= maxDepth`, while direct coverage lookups may use `depth: 0`.
- `relations` contains only direction/type-compatible edges whose candidate endpoint passes workspace/kind constraints.
- `symbols`, `files`, and `specs` contain the admitted endpoint nodes requested for materialization; unrequested categories are empty arrays.
- Unselected result types (e.g. `--type specs` or `--type files`) suppress only the returned output collection (`[]`); they do NOT truncate graph reachability, depth counts, or risk calculations.
- Every array is stable-deduplicated and deterministically sorted by canonical identity; relations use the repository's canonical relation ordering.
- An empty frontier returns four empty arrays without database/worker work.

No new public service, error class, configuration key, or external dependency is introduced. One internal coverage-helper module is added to avoid circular service dependencies.

## Data models & Contracts

### CLI input contract

| Option                            |           Cardinality | Normalized value     | Validation                                              |
| --------------------------------- | --------------------: | -------------------- | ------------------------------------------------------- |
| `--type <types>`                  | once, comma-separated | `ImpactResultType[]` | lowercase token must be `files`, `symbols`, or `specs`  |
| `--kind <kinds>`                  | once, comma-separated | `SymbolKind[]`       | parsed by `parseGraphKinds`                             |
| `--workspace <workspace>`         |            repeatable | `string[]`           | trim; discard empty; stable-deduplicate                 |
| `--exclude-workspace <workspace>` |            repeatable | `string[]`           | trim; discard empty; stable-deduplicate; exclusion wins |

Comma-separated type/kind tokens are trimmed and stable-deduplicated by first occurrence. Workspace names are not comma-split. Unknown workspace names are valid and naturally produce no admitted rows. If all four options are absent, normalization returns `undefined` rather than an object with empty arrays.

Example normalized request:

```ts
{
  types: ['files', 'symbols'],
  kinds: ['function', 'method'],
  workspaces: ['cli', 'code-graph'],
  excludeWorkspaces: ['cli'],
}
```

The effective workspace set excludes `cli`; exclusions are retained in the provider payload so all callers receive identical precedence behavior.

### Result contract

The base result contract gains one required field:

```ts
interface ImpactResult {
  // existing required fields remain unchanged
  readonly affectedSpecs: readonly string[]
}
```

`SpecImpactResult` inherits this field rather than redeclaring it. This is an additive runtime/API field, but making it required is intentionally source-breaking for handwritten fixtures and structural mocks; all repository constructors, fixtures, and test doubles are migrated in the same change. Making it optional was rejected because callers must receive one deterministic shape.

Category mapping is exact:

| Result type | Fields materialized                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------- |
| `files`     | `ImpactResult.affectedFiles`                                                                                  |
| `symbols`   | `ImpactResult.affectedSymbols`; `FileImpactResult.symbols`                                                    |
| `specs`     | `ImpactResult.affectedSpecs` for every target; `FileImpactResult.coveringSpecs` as detailed coverage evidence |

`affectedProcesses` remains governed by existing traversal semantics and is derived only from admitted evidence; it is not a selectable category. A missing `types` property materializes all legacy categories. A present list materializes only selected categories and assigns `[]` to the rest.

For symbol and public-binding targets, spec coverage inputs include the resolved root symbol and its owning file at depth `0`, plus every symbol and file admitted by traversal. Coverage follows incoming `COVERS_SYMBOL` and `COVERS_FILE` relations from specs, applies the same workspace filter at the store boundary, stable-deduplicates by canonical spec ID, and sorts by that ID. This root inclusion is what makes `graph impact --symbol SpecRepository --type specs` return the specs that directly cover `SpecRepository`, even when files and symbols are not requested for output.

`directDependents`, `indirectDependents`, `transitiveDependents`, and `riskLevel` are derived from admitted traversal endpoints after workspace and kind constraints. Result-type selection suppresses category hydration but does not remove relation evidence required to reach a selected category. `riskLevel` uses the current thresholds and algorithm without modification.

### SQLite worker contract

```ts
queryImpactFrontier: {
  payload: {
    input: ImpactFrontierQuery
  }
  result: ImpactFrontierResult
}
```

The payload and result are structured-clone-safe readonly data. No `Map`, callback, database handle, prepared statement, or class instance crosses the worker boundary.

### SQL predicate contract

- Every frontier ID, relation type, symbol kind, included workspace, and excluded workspace is a bound `?` parameter.
- Dynamic SQL may generate only placeholder counts and fixed column/table fragments selected by `resource` and `direction`; user values are never interpolated.
- Empty include/exclude/kind lists omit their `IN`/`NOT IN` clauses.
- Upstream uses the relation endpoint that currently represents a dependent; downstream uses the opposite endpoint; `both` unions the two direction queries and deduplicates by relation identity.
- Symbol workspace filtering joins `symbols AS candidate_symbol` with `files AS candidate_file ON candidate_file.path = candidate_symbol.file_path`.
- File workspace filtering uses `candidate_file.workspace`; spec workspace filtering uses `candidate_spec.workspace`.
- Inclusion predicate: `candidate_workspace IN (...)` when `workspaces` is present.
- Exclusion predicate: `candidate_workspace NOT IN (...)` when `excludeWorkspaces` is present. Both predicates apply together, which guarantees exclusion precedence.

## Approach & Execution flow

1. Commander registers the four filter flags. Repeatable workspace options use an append collector initialized to `[]`; existing command flags and selectors remain unchanged.
2. Before opening or calling the provider, the command normalizes filter options:
   1. Split `--type` by comma, trim/lowercase tokens, reject invalid tokens, and stable-deduplicate.
   2. Parse `--kind` with `parseGraphKinds` and stable-deduplicate.
   3. Trim and stable-deduplicate repeatable workspace arrays.
   4. Reject `--kind` if explicit types do not contain `symbols`.
   5. Produce `undefined` if no filter dimension remains; otherwise produce one immutable `ImpactResultFilter`.
3. Selector resolution and freshness checks execute exactly as today. The selected command branch calls one provider impact operation with the normalized filter as its final argument.
4. `CodeGraphProviderImpl` performs its current `assertAvailable()` once and forwards all inputs to the matching domain service. It performs no filtering.
5. The domain service initializes traversal state with the existing target, direction, depth, and resolution rules. At each breadth-first depth it constructs one `ImpactFrontierQuery` with the canonical current frontier, allowed relation types, resource kind, current depth, maximum depth, and filter.
6. `GraphStore.queryImpactFrontier` is the sole production read boundary for filtered frontier membership:
   1. Empty frontier returns empty arrays immediately.
   2. SQLite sends one typed worker operation.
   3. The worker database selects direction/type-compatible relations.
   4. It joins the candidate endpoint to the correct resource table.
   5. It applies symbol-kind and workspace predicates with bound parameters before rows cross the database boundary.
   6. It hydrates only selected category nodes, sorts/deduplicates, and returns the compact result.
7. The domain service advances the BFS only through admitted relations. Existing visited-set and shallowest-depth rules prevent cycles and duplicates. It aggregates counts, evidence, and risk from admitted endpoints.
8. When specs are selected (or `types` is omitted), the shared coverage helper queries coverage for the root evidence at depth `0` and all admitted symbol/file evidence. It uses `COVERS_SYMBOL` and `COVERS_FILE`, applies workspace constraints in the store query, and returns deterministic spec IDs. This hydration does not admit new traversal endpoints and cannot change counts or risk. When specs are not selected, `affectedSpecs` is `[]` and no coverage query is required.
9. File-set aggregation merges per-file admitted results by canonical identity, retains the shallowest depth, combines base spec IDs and detailed covering-spec evidence deterministically, and calculates counts/risk after deduplication.
10. Every result constructor assigns all required category arrays. Category arrays not selected are assigned `[]`.
11. The CLI applies only current output-format and display-path transformations. JSON, TOON, and text formatters receive the same filtered semantic result.
12. Closing/disposal follows the current provider lifecycle; no filter state persists between invocations.

Legacy branch: with `filter === undefined`, services and SQLite omit every new predicate, hydrate all categories, and return byte-for-byte-equivalent ordered semantic arrays for the same graph generation.

## Error handling & Edge cases

- Invalid type token throws the command's existing usage-error path before provider creation/open with exact message `invalid impact type "<token>". Expected one or more of: files, symbols, specs` and process exit code `1`.
- Invalid kind uses the existing `parseGraphKinds` error class/message and exits `1` before provider access.
- `--kind` with explicit types excluding symbols exits `1` with exact message `--kind requires --type to include symbols` before provider access.
- Empty comma tokens are discarded. If `--type` or `--kind` contains no non-empty tokens, it is treated as absent; no empty SQL `IN ()` is generated.
- Repeated values preserve the first occurrence and never duplicate output.
- A workspace in both include and exclude arrays is excluded.
- Unknown workspace, kind with no matches, or mutually eliminating workspace filters returns a valid result with zero admitted counts, LOW risk according to the existing empty-impact rule, and empty category arrays.
- Missing targets/selectors retain current not-found errors and exit behavior.
- A symbol with no direct or admitted transitive coverage returns `affectedSpecs: []`; this is distinct from the former absence of a base spec field and remains a valid result.
- Coverage relations pointing to duplicate specs through both a symbol and its file produce one canonical spec ID. The detailed file evidence may retain distinct reason/path data according to its existing contract.
- `maxDepth` validation, zero/negative handling, and defaults remain unchanged. The store never receives `depth > maxDepth`.
- Cycles retain the current visited-set behavior. Filtering happens before visited/count admission, so an excluded endpoint cannot inflate depth counts or risk.
- A stale or externally replaced SQLite generation retains current `GraphProviderStaleError`/recovery behavior. No fallback performs broad reads.
- Closed providers retain `StoreNotOpenError`; each provider operation asserts availability once.
- Worker failures retain the existing typed worker error propagation. No new retry or fallback is introduced.
- Concurrent reads use the current worker serialization and SQLite snapshot behavior; filters are request-local immutable payloads.
- SQL injection is prevented by bound values. Dynamic identifiers are selected only from closed internal enums.
- Omitted `types` preserves all categories. Present `types` cannot be empty after CLI normalization; direct callers passing an empty list are treated as omitted to keep the contract safe and avoid surprising all-empty results.

## Key decisions

- **Decision: provider/store ownership.** Filtering is represented in the public Code Graph provider and enforced at the graph-store read boundary. This keeps semantic ownership in Code Graph and avoids loading broad rows into the CLI. Rejected: CLI or formatter post-filtering, because counts/risk would be wrong and database work would remain unbounded.
- **Decision: frontier query rather than a complete SQL traversal rewrite.** Domain services keep BFS, aggregation, risk, and evidence rules; SQLite decides admitted endpoints and hydration on every frontier. Rejected: one recursive CTE per impact operation, because it would duplicate several domain algorithms and make in-memory/backend parity harder.
- **Decision: optional final arguments.** Every service/provider filter parameter is appended. Rejected: options-object replacement, because it would break callers across CLI, SDK, tests, and plugins.
- **Decision: required legacy result fields remain required.** Unselected categories become empty arrays. Rejected: optional/omitted properties, because that would break structured consumers and formatter assumptions.
- **Decision: `affectedSpecs` belongs to base `ImpactResult`.** Specs are a valid result category for every target, not only file/spec targets. Rejected: keeping the field only on `SpecImpactResult` or synthesizing it in the CLI, because symbol/public-binding provider results would remain semantically incomplete.
- **Decision: coverage includes root evidence.** Symbol/public-binding spec projection starts with the resolved target symbol and owning file at depth `0`, then adds admitted impacted evidence. Rejected: considering only transitive impact rows, because a directly covering spec such as the one for `SpecRepository` would disappear from a specs-only query.
- **Decision: shared internal coverage helper.** File, symbol, and public-binding analysis reuse one `COVERS_SYMBOL`/`COVERS_FILE` collector. Rejected: importing file analysis from symbol analysis, because the file service already depends on symbol traversal and that would create a service cycle.
- **Decision: result types select materialization; workspace/kind constrain traversal evidence.** This permits a files-only query to traverse symbol relations while avoiding symbol result hydration. Rejected: treating all dimensions as final projection only, because dependent counts and risk would include excluded workspaces/kinds.
- **Decision: exclusions win.** Both include and exclude predicates apply and exclusion removes overlap. This matches established graph filtering semantics and avoids ambiguity.
- **Decision: repeatable workspace flags.** Both include and exclude workspace flags append values. This is the explicitly selected CLI contract and supports shell-friendly calls without comma parsing for workspace names.
- **Decision: schema version 10 with targeted indexes.** Workspace and kind predicates receive indexes appropriate to the new read path. Rejected: retaining version 9, because existing derived databases would silently lack the performance contract.
- **Decision: no new public error class.** Validation is CLI usage validation; provider/store errors retain current classes. This avoids expanding the error API for deterministic argument mistakes.

## Trade-offs

- Additional frontier queries can add worker round trips for deep traversal → retain current breadth batching so each depth/resource kind uses one operation, and verify wide traversal integration performance.
- `both` direction may union two indexed queries → stable-deduplicate by relation identity and reuse relation endpoint indexes.
- Schema version 10 forces rebuild of derived graph stores → graph data is reproducible, the version mismatch is explicit, and reindex is safer than an implicit partial migration.
- Required empty arrays do not distinguish “not requested” from “requested but no matches” in output → the invocation flags carry that intent while structural compatibility is preserved.
- Adding a required base `affectedSpecs` field breaks TypeScript structural fixtures that construct `ImpactResult` literals → update every constructor/mock in one atomic change and keep the runtime field unconditional.
- Specs-only symbol queries still need internal symbol/file identity evidence to discover coverage → suppress final category materialization, not traversal evidence, and keep coverage lookup bounded to the root plus admitted rows.
- Test in-memory filtering cannot prove SQL efficiency → the SQLite integration suite asserts query behavior and no adapter-side post-filtering; production code review verifies predicates reside in the database layer.
- Active-change overlap increases merge risk → inspect current content before every shared edit, preserve the other change, and run full validation against the combined worktree.

## Spec impact

- `code-graph:graph-store`: CRITICAL ripple; 10 direct and 13 indirect dependent specs, 45 affected files, 23 dependent specs. The new method is additive but abstract, so concrete stores/test doubles must implement it. Existing store methods and their requirements remain valid.
- `code-graph:composition`: HIGH ripple; 10 direct and 9 indirect dependent specs, 20 affected files. Dependents include SDK composition/host-context and CLI graph commands. Optional final arguments and additive named exports preserve all existing requirements, so no SDK spec delta is required.
- `code-graph:traversal`: HIGH ripple; 3 direct and 10 indirect dependent specs, 20 affected files, 13 dependent specs. Omitted-filter behavior preserves current traversal, resolution, hotspots, and change-detection expectations.
- `cli:graph-impact`: LOW ripple; no dependent specs and 6 covered files. Its CLI contract changes intentionally and is fully captured in scope.
- `code-graph:sqlite-graph-store`: directly in scope because it owns the worker/database implementation and physical query efficiency.
- `sdk:composition` remains valid: runtime provider acquisition/lifecycle does not change, and CLI may import the filter as a type from `@specd/code-graph` while obtaining the provider through the existing SDK path.
- Global architecture remains satisfied: domain defines backend-neutral ports and pure aggregation; infrastructure owns SQLite/worker I/O; composition wires implementations; CLI owns parsing only. Global conventions remain satisfied with named exports, ESM `.js` imports, no `any`, and repository naming. New public constructs and abstract methods require JSDoc with parameter/return documentation consistent with `default:_global/docs`. Tests remain colocated under package test suites and cover unit plus real-adapter behavior.
- No additional spec requires changed behavior. All five scoped specs overlap with `language-agnostic-member-symbol-references`; that overlap is coordination risk, not an additional requirement delta.

## Dependency map

```mermaid
graph LR
  CLI[cli graph impact] -->|ImpactResultFilter| Provider[CodeGraphProvider impact methods]
  SDK[@specd/sdk provider acquisition] --> Provider
  Provider --> Services[impact domain services]
  Services -->|ImpactFrontierQuery| Port[GraphStore]
  Port --> Memory[In-memory test store]
  Port --> Adapter[SQLiteGraphStore]
  Adapter --> Protocol[SQLite worker protocol]
  Protocol --> Worker[SQLite worker]
  Worker --> DB[SQLiteGraphDatabase]
  DB --> Tables[(relations symbols files specs)]
  CLI -. modifies .-> CliSpec[cli:graph-impact]
  Services -. modifies .-> TraversalSpec[code-graph:traversal]
  Port -. modifies .-> StoreSpec[code-graph:graph-store]
  Provider -. modifies .-> CompositionSpec[code-graph:composition]
  DB -. modifies .-> SqliteSpec[code-graph:sqlite-graph-store]
  CompositionSpec -. dependent compatibility .-> SDKSpec[sdk:composition]
```

```text
┌──────────────────────────┐
│ CLI graph impact         │
│ parse + validate flags   │
└────────────┬─────────────┘
             │ ImpactResultFilter
             ▼
┌──────────────────────────┐       ┌──────────────────────────┐
│ CodeGraphProvider        │◀──────│ SDK provider acquisition │
│ optional final argument  │       │ unchanged                │
└────────────┬─────────────┘       └──────────────────────────┘
             ▼
┌──────────────────────────┐
│ Domain impact services   │
│ BFS, counts, risk        │
└────────────┬─────────────┘
             │ ImpactFrontierQuery
             ▼
┌──────────────────────────┐
│ GraphStore port          │ [CRITICAL]
└───────┬──────────────────┘
        ├───────────────► in-memory contract/test backend
        ▼
┌──────────────────────────┐
│ SQLite store → worker    │
│ → database parameterized │
│ relations/table joins    │
└──────────────────────────┘

Specs: cli:graph-impact → code-graph:traversal → code-graph:graph-store
                         └→ code-graph:composition → sdk dependents
SQLite implementation: code-graph:sqlite-graph-store → graph-store contract
```

## Migration / Rollback

1. Release code with `SQLITE_SCHEMA_VERSION = 10`, the two new indexes, worker operation, store method, domain/provider signatures, and CLI flags as one compatible unit.
2. Existing version-9 derived databases fail the normal compatibility check and request recreation/reindex; they are not mutated in place.
3. Run `node packages/cli/dist/index.js graph index --format toon` for each workspace configuration to rebuild the derived graph under schema 10. No source/spec content migration is required.
4. Confirm graph statistics are current and impact without filters matches the pre-release semantic result.
5. Rollback: deploy the previous code/schema version, remove/recreate any version-10 derived database through the existing supported recreate/index flow, then re-run graph indexing. Never manually decrement an existing database's schema metadata.
6. Because the store is derived and reproducible, rollback loses no authored data. Any in-flight read fails through existing worker/provider error propagation and can be retried after reindex.

## Testing

### Automated tests

- `packages/cli/test/commands/graph-impact.spec.ts`
  - Registers all four options and proves both workspace flags collect repeated occurrences.
  - Parses comma-separated types/kinds, trims, lowercases types, stable-deduplicates, and forwards one normalized filter to every target branch.
  - Asserts no filter flags forward `undefined` and preserve legacy mock calls/output.
  - Asserts invalid type and kind fail before provider open.
  - Asserts `--kind` plus a non-symbol explicit type emits the exact compatibility error.
  - Asserts inclusion/exclusion overlap retains exclusion precedence and structured output keeps unselected arrays as `[]`.
- Domain service tests under `packages/code-graph/test/domain/services/`
  - Omitted filters reproduce legacy ordering, counts, depths, risk, and arrays.
  - Type selection materializes only mapped fields while keeping required empty arrays.
  - Kind and workspace predicates remove traversal endpoints before direct/indirect/transitive counts and risk.
  - Exclusion wins over inclusion; unknown workspace yields empty admitted impact.
  - Filtering happens before `maxDepth`/frontier admission and cycles/deduplication retain shallowest depth.
  - File-set aggregation deduplicates files, symbols, specs, and evidence after filtering.
  - Symbol/public-binding specs-only analysis derives `affectedSpecs` from `COVERS_SYMBOL` and `COVERS_FILE`, includes root depth-zero coverage, and leaves `affectedFiles`/`affectedSymbols` empty.
- `packages/code-graph/test/domain/ports/graph-store.contract.ts`
  - Runs the same contract for all registered stores: omitted filter, each category, kind, include/exclude workspace, overlap precedence, empty frontier, deterministic ordering, and input immutability.
- `packages/code-graph/test/helpers/in-memory-graph-store.ts`
  - Contract suite validates its implementation; no production-efficiency claim is made from this helper.
- `packages/code-graph/test/composition/code-graph-provider.spec.ts`
  - Each impact method forwards the exact filter and calls availability assertion once; closed/stale behavior is unchanged.
- `packages/code-graph/test/barrel.spec.ts`
  - Public package barrels expose the constant and filter/result types without exporting SQLite implementation types.
- `packages/code-graph/test/infrastructure/sqlite/sqlite-worker-protocol.spec.ts`
  - Compile/runtime fixtures cover the new payload/result and structured-clone-safe arrays.
- `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`
  - Uses a real temporary SQLite database with multiple workspaces and symbol kinds.
  - Proves SQL-side admission for files, symbols, specs, kinds, include/exclude overlap, both directions, and bound strings containing quotes/SQL metacharacters.
  - Proves empty filter arrays omit invalid SQL, rows are deterministic/deduplicated, schema version is 10, and both new indexes exist.
- `packages/code-graph/test/integration/sqlite-wide-traversal.spec.ts`
  - Builds a wide/deep graph and asserts filtered endpoints never cross the worker boundary, counts/risk match admitted rows, and traversal remains batched by frontier rather than node.

Run in order:

```bash
pnpm --filter @specd/code-graph test -- traversal.spec.ts analyze-files-impact.spec.ts code-graph-provider.spec.ts
pnpm --filter @specd/code-graph test -- sqlite-graph-store.spec.ts sqlite-worker-protocol.spec.ts sqlite-wide-traversal.spec.ts barrel.spec.ts
pnpm --filter @specd/cli test -- graph-impact.spec.ts
pnpm --filter @specd/code-graph lint
pnpm --filter @specd/cli lint
pnpm build
node packages/cli/dist/index.js changes validate filter-impact-results-at-provider --format text
```

Expected: all suites/build/lint exit `0`; the change validator reports every artifact complete and valid.

### Manual / E2E verification

1. Rebuild/index a graph containing at least two workspaces:

   ```bash
   node packages/cli/dist/index.js graph index --format toon
   ```

   Expected: indexing succeeds under schema 10 and graph freshness is current.

2. Capture legacy behavior:

   ```bash
   node packages/cli/dist/index.js graph impact --symbol '<known-symbol>' --format json
   ```

   Expected: all legacy arrays are present and populated as before.

3. Select files only and repeat workspace filters:

   ```bash
   node packages/cli/dist/index.js graph impact --symbol '<known-symbol>' --type files --workspace cli --workspace code-graph --exclude-workspace cli --format json
   ```

   Expected: only `code-graph` files are present; symbol/spec arrays remain present as `[]`; counts and risk exclude `cli` endpoints.

4. Select symbol kinds:

   ```bash
   node packages/cli/dist/index.js graph impact --file '<known-file>' --type symbols --kind function,method --format toon
   ```

   Expected: only function/method symbol evidence is returned, with deterministic ordering.

5. Verify symbol-to-spec coverage regression:

   ```bash
   node packages/cli/dist/index.js graph impact --symbol SpecRepository --type specs --format json
   ```

   Expected: `affectedSpecs` contains the deterministic spec IDs covering `SpecRepository` or its owning file; `affectedFiles` and `affectedSymbols` are `[]`.

6. Verify early validation:

   ```bash
   node packages/cli/dist/index.js graph impact --symbol '<known-symbol>' --type files --kind function
   ```

   Expected: exit `1`, exact `--kind requires --type to include symbols`, and no store open/index side effect.

7. Verify all selector branches (`--file`, repeated file selection where supported, `--symbol`, `--export ... --from ...`, and `--spec`) with the same filters and compare JSON/TOON/text membership.

Failure indicators: excluded workspaces appear, counts/risk match the unfiltered result when admitted rows differ, an unrequested field is omitted instead of `[]`, invalid input opens the provider, SQL syntax errors occur for empty lists, or version-9 databases are silently used without rebuild.
