# Spec Compliance Audit — change: suggest-implementation-and-spec-deps

Date: 2026-08-24 · Mode: change (full verification) · Graph: freshly indexed

## Aggregate

| Batch      | Requirements | Satisfied    | Partial | Discrepancies                  |
| ---------- | ------------ | ------------ | ------- | ------------------------------ |
| sdk        | 10           | 7            | 3       | 7 (3 medium)                   |
| cli        | 17           | 14           | 2       | 2 + observations               |
| code-graph | 2 delta reqs | 2            | 0       | 0 (advisories only)            |
| global     | 6 rules      | 1 borderline | —       | 5 violations + 1 inconsistency |

## Detailed Findings (verbatim partials)

---

# Compliance Audit Partial — cli area

Change: `20260816-112112-suggest-implementation-and-spec-deps` (state: `verifying`)
Assigned specs: `cli:spec-implementation`, `cli:spec-deps`
Method: merged content via `changes spec-preview`, source inspection under `packages/cli/src`, targeted vitest run (8/8 PASS), cross-checked against `core:get/update-persisted-spec-{implementation,deps}`, `sdk:suggest-*`, `cli:entrypoint`, `default:_global/error-handling-conventions`.

---

## Spec 1: cli:spec-implementation

### Requirements Summary

8 requirements: Command signature · List subcommand · Add subcommand · Remove subcommand · No repeated CLI-owned mutation logic · Shared path semantics with change-time tracking · Error mapping · Suggest subcommand (+ Constraints: no direct lock access, allowExcessArguments(false)).

### Implementation Status

| Requirement                                                                                                                                                  | Status                 | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command signature (`specs implementation list/add/remove`)                                                                                                   | ✅ Compliant           | Registered under `specs` group (alias `spec`): packages/cli/src/index.ts:177-193 (`registerSpecImplementation(specCmd)` at :193). Subcommands `list <specPath>` (:59), `add <specPath>` (:81), `remove <specPath>` (:115), `suggest [specPath]` (:149) in packages/cli/src/commands/spec/implementation.ts. All accept `--format text\|json\|toon` default `'text'` (:62, :86, :120, :158); validation via `parseFormat` (packages/cli/src/formatter.ts:22-27).                                                                               |
| List subcommand → `Kernel.specs.getPersistedImplementation`, distinguish file vs symbol entries, not-initialized reporting, `initialized` field in JSON/TOON | ✅ Compliant           | Kernel call at implementation.ts:68. File-vs-symbol distinction at :36-40 (symbol-level rendered `file [sym, …]`, file-level bare path). Text not-initialized branch at :26-29 (`spec … is not initialized — run specs init first`). JSON/TOON payload includes `initialized` always: :45. Core contract honored: packages/core/src/application/use-cases/get-persisted-spec-implementation.ts:48-53.                                                                                                                                         |
| Add subcommand → `updatePersistedImplementation` `action:'add'` + raw `--file` + `--symbol`s, print resulting list                                           | ✅ Compliant           | implementation.ts:96-107: single call with `{ specId, action: 'add', file: opts.file, symbols? }`; raw `--file` passed through (no normalization); renders resulting list at :102-107. Test confirms exact payload shape.                                                                                                                                                                                                                                                                                                                     |
| Remove subcommand → `action:'remove'`                                                                                                                        | ✅ Compliant           | implementation.ts:130-144: identical delegation with `action: 'remove'`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| No repeated CLI-owned mutation logic                                                                                                                         | ✅ Compliant           | Handler performs no fs access, no path canonicalization, no boundary checks; only parse (`parseSpecId`, helpers/spec-path.ts) + one kernel call. Normalization lives in `UpdatePersistedSpecImplementation` (packages/core/src/application/use-cases/update-persisted-spec-implementation.ts).                                                                                                                                                                                                                                                |
| Shared path semantics (raw project-relative path accepted)                                                                                                   | ✅ Compliant           | `--file <path>` is free-form required option (implementation.ts:84); no `workspace:path` demanded from user; canonicalization delegated to core use case (boundary/file checks at core update-persisted-spec-implementation.ts:108, :208, :215).                                                                                                                                                                                                                                                                                              |
| Error mapping (SpecNotFound / FileNotFound / WorkspaceBoundary / ArtifactConflict / ReadOnlyWorkspace → exit 1, `error:` prefix)                             | ⚠️ Partially compliant | All five are `SpecdError` subtypes falling through to the default branch → exit 1 with `error:` prefix (packages/cli/src/handle-error.ts:44-45, :195-196). Messages name spec/path (`Spec '${id}' not found` — spec-not-found-error.ts:18; `Implementation file "…" does not exist` — implementation-file-not-found-error.ts:10; boundary msg — implementation-workspace-boundary-error.ts:14). **Gap:** `ArtifactConflictError` message contains no retry instruction (see Discrepancies D1); readOnly message quality issue (D2).           |
| Suggest subcommand → `SuggestImplementationLinks` (@specd/sdk), `--apply` delegates additive merge, `[already included]`/`[new]` tags, `--format` support    | ✅ Compliant           | Dynamic import + invocation: implementation.ts:176-177, execute at :193-220 with all documented flags (`--spec`, `--all`, `--workspace`, `--apply`, `--confidence HIGH\|MEDIUM\|MED\|LOW` :156/:199-201, `--rebuild-cache`). Apply merges via SDK → `UpdatePersistedSpecImplementation` `action:'add'` skipping already-included (packages/sdk/src/orchestration/suggest-implementation-links.ts:513, :535-546). Tags rendered at implementation.ts:246-248. Spinner gated to `fmt==='text' && TTY` (:183-189) so machine formats stay clean. |

Constraints: every leaf subcommand calls `.allowExcessArguments(false)` — implementation.ts:60, :82, :116, :150 ✅. No direct `spec-lock.json` I/O in handler ✅.

### Discrepancies

- **D1 (partial, wording): `ArtifactConflictError` output lacks the mandated retry instruction.** Requirement: exit 1 + `error:` message "indicating a concurrent modification **and instructing the user to retry**". The user-visible message is `Artifact "<file>" was modified after it was loaded — save aborted to prevent data loss` (packages/core/src/domain/errors/artifact-conflict-error.ts:56) — concurrent modification is indicated, retry guidance exists only in the developer docblock (:12), never in emitted output. `handleError` passes messages verbatim (handle-error.ts:196) and a grep of packages/cli/src for `ArtifactConflict|retry|concurrent` returns zero hits. Hypotheses: (a) spec assumed a CLI-side catch-and-augment that was never implemented; (b) intent was satisfied at domain level and the spec over-specified. Either way the emitted text does not fulfill "instructing the user to retry". Also conflicts with `default:_global/error-handling-conventions` ("actionable messages").
- **D2 (dependency-rooted, minor): readOnly errors surface as bare workspace name.** Core use cases throw `new ReadOnlyWorkspaceError(workspace)` with the workspace string as the entire message (packages/core/src/application/use-cases/update-persisted-spec-implementation.ts:90; same pattern in update-persisted-spec-deps.ts:79). CLI then prints e.g. `error: docs`. Exit-code and no-workaround clauses ARE met (handle-error.ts:196; no config workaround anywhere in message chain), but the message does not state what operation was blocked or why — see Dependency findings F2.
- **Checked, no violation:** `--confidence MED` normalization is done in SDK zod schema (suggest-implementation-links.ts:54-59), so CLI's raw-string cast (implementation.ts:199-201) cannot produce an invalid threshold without a typed `InvalidInputError`.
- **Checked, no violation:** add/remove renderers receive literal `initialized: true` (implementation.ts:105, :139) — sound because a successful persisted mutation implies state existence.

### Test Coverage

| Requirement                                                 | Test                                                                                                                                                     |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| List delegation                                             | `list delegates to kernel.specs.getPersistedImplementation` — packages/cli/test/commands/spec-implementation.spec.ts:64-79 ✅                            |
| Add delegation (action/file/symbols)                        | `add delegates to kernel.specs.updatePersistedImplementation` — :81-110 ✅                                                                               |
| Suggest delegation                                          | `suggest delegates to SuggestImplementationLinks orchestration use case` — :112-134 ✅                                                                   |
| Suggest text rendering (`[new]`, applied mutations)         | `suggest renders text output for existing files, confidence and mutations by default` — :136-170 ✅ (asserts `[new] [HIGH] src/auth.ts [login]` at :168) |
| **Remove subcommand**                                       | ❌ No test (no `remove` case in this file)                                                                                                               |
| **Error mapping (all five typed errors)**                   | ❌ No tests                                                                                                                                              |
| **`initialized:false` text + JSON rendering**               | ❌ No tests                                                                                                                                              |
| **`[already included]` tag for implementation suggestions** | ❌ Not asserted here (only covered analogously in spec-deps.spec.ts:168)                                                                                 |
| **`--format toon` acceptance per subcommand**               | ❌ Indirect only (json used in suggest test :117-126)                                                                                                    |

---

## Spec 2: cli:spec-deps

### Requirements Summary

9 requirements: Command signature · List · Add · Remove · Set · Clear · No repeated CLI-owned mutation logic · Error mapping · Suggest subcommand (+ Constraints).

### Implementation Status

| Requirement                                                                                                                                                                                                     | Status                 | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command signature (`specs deps list/add/remove/set/clear`)                                                                                                                                                      | ✅ Compliant           | Registered under `specs`: index.ts:192. Subcommands in packages/cli/src/commands/spec/deps.ts: `list <specPath>` (:70), `add` (:88), `remove` (:111), `set` (:134), `clear` (:154), `suggest [specPath]` (:173). Repeatable `--dep` via `collect` (helpers/collect.ts:8-10); `--format` default `'text'` everywhere (:73, :92, :115, :138, :157, :182).                                                                                                                                                                                                                                                                                                                                         |
| List → `getPersistedDeps`; not-initialized distinct text; `initialized` in JSON/TOON                                                                                                                            | ✅ Compliant           | Kernel call deps.ts:78-80. Text branches: not-initialized :33-36; empty :37-39; populated :41-44. JSON/TOON object carries `initialized` when defined (:48-56). Core returns the flag (get-persisted-spec-deps.ts:46-51).                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Add → `updatePersistedDeps {add}`                                                                                                                                                                               | ✅ Compliant           | deps.ts:100-104; guards empty `--dep` with `cliError('--dep requires at least one value')` (:96-98) — CLI-level input validation, permitted (not merge semantics). Renders result :104.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Remove → `{remove}`; no-op on uninitialized reported, not errored                                                                                                                                               | ✅ Compliant           | deps.ts:123-127. Uninitialized no-op handled core-side returning `{dependsOn: [], created: false}` without creating state (update-persisted-spec-deps.ts:110-121); CLI exits 0 rendering `dependsOn: (empty)` (deps.ts:37-39). Minor note: output doesn't say "no-op"/"removed 0" explicitly — indistinguishable from an empty set; scenario's letter ("does not exit with an error") is met.                                                                                                                                                                                                                                                                                                   |
| Set → `{set}` (may be empty)                                                                                                                                                                                    | ✅ Compliant           | deps.ts:143-147; `--dep` optional so `set` with zero flags maps to `set: []` clearing via core (:133-137 optional option; core set-empty path update-persisted-spec-deps.ts:133-134).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Clear → `{clear: true}`                                                                                                                                                                                         | ✅ Compliant           | deps.ts:162-166.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| No repeated CLI-owned mutation logic                                                                                                                                                                            | ✅ Compliant           | Each mutation = exactly one `kernel.specs.updatePersistedDeps.execute` with flags mapped 1:1 onto `UpdatePersistedSpecDepsInput`; merge logic (`applyDependsOnMutation`, initial-state derivation) lives entirely in core (update-persisted-spec-deps.ts:87-99, :110-161).                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Error mapping (SpecNotFound / ArtifactConflict / ReadOnlyWorkspace → exit 1, `error:`, no config workaround for readOnly)                                                                                       | ⚠️ Partially compliant | Same shared mapping as spec 1 (handle-error.ts:195-196): all three → exit 1 + `error:` prefix; `SPEC_NOT_FOUND` message names spec (spec-not-found-error.ts:17-19). **Gaps:** D1 retry instruction missing; D2 readOnly message quality (explicitly tied to `core:workspace` conventions by this spec).                                                                                                                                                                                                                                                                                                                                                                                         |
| Suggest → `SuggestSpecDependencies` (@specd/sdk); `--apply` delegates additive merge via `UpdatePersistedSpecDeps`; `--create-change`; fallback alignment-command log; machine formats never prompt/block stdin | ✅ Compliant           | Dynamic import + invocation deps.ts:200-201, execute :217-260 with `specId`/`specIds`/`workspace`/`all`/`apply`/`createAlignmentChange` (:223-225)/`rebuildCache`. Flag `--create-change` defined :180. SDK merges only new dep IDs through `UpdatePersistedSpecDeps` (sdk/orchestration/suggest-spec-dependencies.ts:767-776). Alignment change gathers ALL invalid specs + writes `.specd-exploration.md` (suggest-spec-dependencies.ts:820-854); suggested manual command surfaced by CLI at deps.ts:307-311. Machine-format safety: spinner created only when `fmt==='text' && TTY` (:207-213); no stdin readers in handler. Tags `[already included]`/`[new]` + reasons rendered :285-288. |

Constraints: `.allowExcessArguments(false)` on all six leaf subcommands — deps.ts:71, :89, :112, :135, :155, :174 ✅. No direct lock reads/writes ✅.

### Discrepancies

- **D1 applies identically** (shared `handleError` path): `specs deps add/remove/set/clear` concurrent-modification output lacks retry instruction. Evidence chain identical to spec 1.
- **D2 applies identically**: `ReadOnlyWorkspaceError` from update-persisted-spec-deps.ts:79 yields `error: <workspace>`; this spec explicitly defers to "`core:workspace` readOnly error-message conventions", which demand stating the blocked operation and reason (see F2) — currently unmet at the emission point (core-side root cause, CLI-side symptom).
- **D3 (observation, out-of-assigned-spec scope): suggested alignment command hardcodes a dev invocation.** `postApplyValidation.suggestedAlignmentCommand` is built as `node packages/cli/dist/index.js changes create align-spec-deps --spec …` (sdk/orchestration/suggest-spec-dependencies.ts:860) instead of the portable `specd changes create …`. Neither cli:spec-deps nor sdk:suggest-spec-dependencies prescribes the exact form, so this is not a violation of the audited specs, but it bakes repo-relative paths into end-user output and will be wrong for globally-installed CLIs.
- **Checked, no violation:** mutation renderers hardcode `initialized: true` (deps.ts:104, :127, :147, :166) and drop `created` from `UpdatePersistedSpecDepsResult` — rendering choice after guaranteed-successful mutation; neither spec requires echoing `created`.

### Test Coverage

| Requirement                                                                                               | Test                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| List delegation                                                                                           | `list delegates to kernel.specs.getPersistedDeps` — packages/cli/test/commands/spec-deps.spec.ts:62-77 ✅                                           |
| Set delegation                                                                                            | `set delegates to kernel.specs.updatePersistedDeps` — :79-104 ✅ (asserts exact `{specId, set}` payload :100-103)                                   |
| Suggest delegation                                                                                        | `suggest delegates to SuggestSpecDependencies orchestration use case` — :106-128 ✅                                                                 |
| Suggest text rendering (existing, `[new]`/`[already included]`, applied mutations, post-apply validation) | `suggest renders text output for existing deps, tags and validation by default` — :130-171 ✅ (tags asserted :167-168)                              |
| **Add / Remove / Clear subcommands**                                                                      | ❌ Only `set` has a mutation-delegation test                                                                                                        |
| **Remove-on-uninitialized no-op**                                                                         | ❌ No test                                                                                                                                          |
| **Set-with-no-`--dep` clears**                                                                            | ❌ No test                                                                                                                                          |
| **Error mapping (unknown spec / conflict / readOnly)**                                                    | ❌ No tests (analogous readOnly message tests exist only for change-edit/change-create: change-edit.spec.ts:219-260, change-create.spec.ts:317-354) |
| **`initialized:false` text + JSON**                                                                       | ❌ No tests (analogous pattern tested only for optimizations: spec-optimizations.spec.ts:111-124)                                                   |

Targeted run result: `vitest test/commands/spec-deps.spec.ts test/commands/spec-implementation.spec.ts` → **PASS (8) FAIL (0)**.

---

## Dependency & Global Conformance findings

- **F1 — core:get-persisted-spec-{implementation,deps} ✅ consistent.** Both return `initialized` + canonical lists exactly as the CLI specs assume (get-persisted-spec-implementation.ts:48-53; get-persisted-spec-deps.ts:46-51); read-only, no state creation, no projection fallback. CLI JSON output faithfully forwards the flag.
- **F2 — core:update-persisted-spec-{implementation,deps} ⚠️ readOnly message convention divergence.** `core:workspace` mandates readOnly rejections whose "Error messages MUST state what operation was blocked and why (the workspace is `readOnly`)" (canonical core:workspace spec, readOnly enforcement section). Conforming pattern exists: archive-change.ts:348-350 (`Cannot archive change "…" — it contains specs from readOnly workspaces…`). Non-conforming: update-persisted-spec-implementation.ts:90 and update-persisted-spec-deps.ts:79 throw `new ReadOnlyWorkspaceError(workspace)` → message is just the workspace name. Also diverges from the observable CLI convention string `workspace "<name>" is readOnly` asserted in change-edit/change-create tests. Root cause is core-side; flagged here because both audited CLI specs inherit the output.
- **F3 — sdk:suggest-implementation-links ✅ consistent.** `alreadyIncluded` computed against persisted lock files (:513); apply path skips included items and issues `action:'add'` calls through `UpdatePersistedSpecImplementation` (:535-546) satisfying "delegate additive mutation"; `appliedMutations` counters match what the CLI renders (implementation.ts:252-257).
- **F4 — sdk:suggest-spec-dependencies ✅ consistent** with cli:spec-deps suggest clause: warm-up + traversal + directional pruning implemented as specced (sdk:suggest-spec-dependencies delta spec Pass 1/2/2.5/2.6/3 ↔ suggest-spec-dependencies.ts:259-885); alignment change gathers ALL invalid specs into one change named `align-spec-deps-<timestamp>` (:821-826, matching delta spec line 58) and writes `.specd-exploration.md` (:832, :846-847); no change when `all-valid` (:863-868). Exception: D3 hardcoded command prefix.
- **F5 — cli:entrypoint ✅ consistent.** `--format` defaults to `text` on all 11 leaf subcommands; invalid formats raise typed `InvalidFormatError`; exit codes follow entrypoint conventions (domain errors 1 via handle-error.ts:196, hook failures 2 :171-176, schema/system 3 :178-193, unexpected 3 :199-209); `error:`/`fatal:` prefixes per handle-error.ts:44.
- **F6 — default:\_global/error-handling-conventions ⚠️ partially met.** Typed errors carry `specd:true` discriminator and UPPER_SNAKE_CASE codes throughout ✅; but "actionable" message guidance is undercut by D1 (no retry hint) and F2 (bare workspace name), both of which reach users through these two command groups.

---

## Summary counts

| Metric                        | Count                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Requirements audited          | 17 (8 implementation + 9 deps)                                                                                      |
| Fully compliant               | 14                                                                                                                  |
| Partially compliant           | 2 (Error mapping in each spec — D1/D2)                                                                              |
| Non-compliant                 | 0                                                                                                                   |
| Discrepancies opened          | 3 (D1 retry-guidance wording; D2 readOnly message convention; D3 hardcoded alignment-command prefix — observation)  |
| Constraint violations         | 0 (allowExcessArguments, no direct lock I/O: all clean)                                                             |
| Targeted tests                | 8 passed / 0 failed                                                                                                 |
| Test-coverage gaps identified | 9 (remove×2, add-deps, clear, error-mapping×2, initialized:false×2, `[already included]` impl-tag, toon acceptance) |

**Recommended follow-ups (for the change owner, not executed by this audit):**

1. Append retry/concurrent-modification guidance where `ARTIFACT_CONFLICT` is surfaced (CLI `handleError` augmentation or richer domain message) — resolves D1 for both specs.
2. Align `ReadOnlyWorkspaceError` construction in update-persisted-spec-{implementation,deps} with the core:workspace message convention (mirror archive-change.ts:349 or `workspace "<name>" is readOnly`) — resolves D2/F2.
3. Replace `node packages/cli/dist/index.js` prefix in `suggestedAlignmentCommand` with `specd` — D3.
4. Backfill the 9 identified test gaps, prioritizing remove/clear delegation and error-mapping exit codes.

---

# Compliance Audit Partial — code-graph area

Change: `20260816-112112-suggest-implementation-and-spec-deps`
Audited specs: `code-graph:language-adapter`, `code-graph:graph-store` (delta-scoped)
Audit date: 2026-08-24 · Mode: read-only · Test run: **682/682 passed** (55 files, `packages/code-graph`)

Delta scope actually present in the change (read from delta YAML):

- `deltas/code-graph/language-adapter/spec.md.delta.yaml` + `verify.md.delta.yaml` — adds requirement **"Built-in Adapter Registry Composition Factory & Keyword Discovery"**: `createBuiltinAdapterRegistry` factory, optional `LanguageAdapter.keywords?(): readonly string[]`, and `AdapterRegistryPort`/`AdapterRegistry.getReservedKeywords(): Set<string>`. Scenario asserts extensions `.ts/.py/.go/.php` and aggregated keywords including `class`, `def`, `func`, `interface`, `async`.
- `deltas/code-graph/graph-store/spec.md.delta.yaml` + `verify.md.delta.yaml` — adds requirement **"Symbol Query Workspace Scope"**: `SymbolQuery.workspace?: string`; `findSymbols(query)` MUST scope results by exact, case-sensitive prefix `'<workspace>:'` using a parameterized prefix comparison where `%` and `_` are literal (`STARTS WITH` semantics).

Note: the task briefing described the deltas as "complete reserved keyword sets per language version"; the actual delta text does **not** enumerate per-language keyword lists. Both readings are evaluated under "Discrepancies" below.

---

## Spec 1: code-graph:language-adapter

### Requirements Summary (delta-scoped)

From the merged preview (`spec-preview code-graph:language-adapter`, new requirement appended after "Complete symbol source ranges"):

1. `createBuiltinAdapterRegistry` SHALL be a standalone composition factory exposed at `create-builtin-adapter-registry.ts` and re-exported in composition entrypoints.
2. It SHALL instantiate an `AdapterRegistry` pre-populated with `TypeScriptLanguageAdapter`, `PythonLanguageAdapter`, `GoLanguageAdapter`, `PhpLanguageAdapter`, plus any custom adapters provided.
3. Factory MUST support overloads `(extraAdapters?: readonly LanguageAdapter[])` and `(config: SpecdConfig)`.
4. `LanguageAdapter` SHALL support optional `keywords?(): readonly string[]` returning reserved keywords + built-in type names.
5. `AdapterRegistryPort` and `AdapterRegistry` SHALL expose `getReservedKeywords(): Set<string>` aggregating across all registered adapters.

Scenario (verify delta): factory returns registry containing all built-ins; `getSupportedExtensions()` includes `.ts`, `.py`, `.go`, `.php`; `getReservedKeywords()` includes `class`, `def`, `func`, `interface`, `async`.

### Implementation Status (delta-scoped)

| Requirement clause                                               | Status | Evidence                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Standalone factory at `create-builtin-adapter-registry.ts`       | ✅     | `packages/code-graph/src/composition/use-cases/create-builtin-adapter-registry.ts:16-52`                                                                                                                                                          |
| Re-exported in composition entrypoints                           | ✅     | `src/composition/create-code-graph-provider.ts:109` (also used internally at :51); public barrels `src/index.ts:4`, `src/public.ts:4`                                                                                                             |
| Pre-populated with TS/Python/Go/PHP adapters + extras            | ✅     | `create-builtin-adapter-registry.ts:40-43` registers all four; :45-49 appends `extraAdapters`                                                                                                                                                     |
| Overloads `(extraAdapters?)` and `(config: SpecdConfig)`         | ✅     | `create-builtin-adapter-registry.ts:16-18` and :29 (compat overload documented at :20-28; handler :36-52 ignores non-array input, matching "SpecdConfig carries no adapter-registration field")                                                   |
| `LanguageAdapter.keywords?(): readonly string[]` optional        | ✅     | `src/domain/value-objects/language-adapter.ts:70` — exactly `keywords?(): readonly string[]`                                                                                                                                                      |
| `AdapterRegistryPort.getReservedKeywords(): Set<string>`         | ✅     | `src/domain/ports/adapter-registry-port.ts:20`                                                                                                                                                                                                    |
| `AdapterRegistry.getReservedKeywords(): Set<string>` aggregation | ✅     | `src/infrastructure/tree-sitter/adapter-registry.ts:90-100` — iterates unique adapters via `getAdapters()` (:74-76 dedups by identity), guards optional method with `typeof adapter.keywords === 'function'` (:93), collects into a `Set` (dedup) |

Per-language keyword sets implemented (all four built-ins implement `keywords()`):

- TypeScript/JavaScript: `typescript-language-adapter.ts:342-411` — all ECMAScript reserved words present (break…yield incl. `let`, `static`, `async`, `await`, `enum`, `with`), plus TS type names `string/boolean/number/any/Promise/void/null/undefined/never/unknown/symbol/bigint/object` and contextual words `interface/type/readonly/implements/private/protected/public/static/enum/namespace/constructor/as/is/from/of`.
- Python: `python-language-adapter.ts:256-305` — complete Python 3.x hard-keyword set (35/35: `def class import from as return yield lambda if elif else while for in try except finally raise with assert pass break continue and or not is None True False async await del global nonlocal`) plus soft keywords `match/case/type` and built-in types `str/int/float/bool/list/dict/set/tuple`.
- Go: `go-language-adapter.ts:194-231` — complete set of all 25 Go reserved keywords (`func package import type struct interface return if else for range switch case default select chan go goto defer fallthrough break continue var const map`) plus predeclared `nil true false bool string int int64 byte error`.
- PHP: `php-language-adapter.ts:1086-1172` — covers php.net reserved-word list almost fully (function/class/interface/trait/enum/namespace/use/extends/implements/visibility modifiers/static/readonly/const/control flow/match/fn/clone/self/parent/echo/print/logical ops/alternatives endif-family/include*/require*/isset/unset/list/global/goto/die/exit/declare/instanceof/insteadof/var), plus type names `array/string/int/float/bool/void/null/true/false/mixed/never/object/callable/iterable`.

### Discrepancies (both hypotheses)

**Hypothesis A — literal delta text (keyword discovery contract only): NO discrepancies.**
Every SHALL/MUST clause of the added requirement is implemented as written, including exact signatures (`keywords?(): readonly string[]`, `getReservedKeywords(): Set<string>`), both overload forms, four built-in registrations, and re-exports. The scenario's five required sample keywords (`class`, `def`, `func`, `interface`, `async`) are each returned by at least one built-in adapter (TS: class/interface/async; Py: def/class; Go: func/interface).

**Hypothesis B — stricter reading ("complete reserved keyword sets per language version"): minor completeness gaps, none violating the delta text.**
The delta does not enumerate authoritative sets, so these are observations, not violations:

- Go: predeclared identifier/type coverage is a subset — omits numeric types (`float32`, `float64`, `uint*`, `uintptr`, `rune`, `complex64/128`, `iota`, `any`) and builtin funcs (`append`, `len`, `make`, …). All 25 reserved keywords are complete, so only the "built-in type names" half is partial (`go-language-adapter.ts:224-229`).
- TypeScript: contextual/TS-only keywords missing vs. full TS grammar: `declare`, `abstract`, `keyof`, `infer`, `asserts`, `satisfies`, `module`, `override`, `accessor`, `out` (`typescript-language-adapter.ts:343-410`). ES-level reserved words are complete.
- PHP: missing `__halt_compiler` and compound `yield from` vs. the php.net reserved list (`php-language-adapter.ts:1087-1171`). Otherwise near-complete.
- Python: complete (hard + soft keywords). No gap.

If the change intends Hypothesis B, the specific per-language specs (`code-graph:{go,python,typescript,php}-language-adapter`) do not contain keyword-set requirements either (no deltas touch them in this change), so no cross-spec contradiction exists today.

### Test Coverage

- `test/composition/create-builtin-adapter-registry.spec.ts:7-16` — factory returns `AdapterRegistry` instance with extensions `.ts/.py/.go/.php` → maps 1:1 to delta scenario THEN clauses. ✅
- `:41-65` — "aggregates and deduplicates reserved keywords across adapters": custom adapter contributing duplicate `class` collapses to one entry (Set semantics + cross-adapter dedup asserted at :62-64). ✅
- `:67-79` — `getReservedKeywords()` is a `Set`, non-empty, contains `class`, `function`, `interface`, `async`, `def`, `func` — covers every keyword named in the delta scenario. ✅
- `:18-39` — custom adapter extension registration through `extraAdapters`. ✅
- Full targeted suite run: `rtk pnpm build && rtk pnpm test` in `packages/code-graph` → **Test Files 55 passed (55), Tests 682 passed (682)**. All delta scenarios pass.

### Conformance

**CONFORMANT** (both hypotheses; hypothesis-B items are advisory completeness notes only).

---

## Spec 2: code-graph:graph-store

### Requirements Summary (delta-scoped)

Added requirement "Symbol Query Workspace Scope":

1. `SymbolQuery` SHALL include optional `workspace?: string`.
2. When set, `GraphStore.findSymbols(query)` MUST scope results directly to symbols whose file path begins with the exact, case-sensitive prefix `'<workspace>:'`, via parameterized prefix comparison treating `%` and `_` as literals (`s.filePath STARTS WITH '<workspace>:'`).

Scenario: store populated with symbols across workspaces `core`/`cli`/`sdk`; `findSymbols({ name: 'create*', workspace: 'core' })` returns exclusively `core` symbols.

### Implementation Status (delta-scoped)

| Clause                                                                 | Status | Evidence                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SymbolQuery.workspace?: string`                                       | ✅     | `src/domain/value-objects/symbol-query.ts:9` — `readonly workspace?: string`                                                                                                                                                                                |
| Exact, case-sensitive prefix `'<workspace>:'` scoping in `findSymbols` | ✅     | `src/infrastructure/sqlite/sqlite-graph-database.ts:1178-1183` — condition `substr(file_path, 1, length(?)) = ?` with params `` `${query.workspace}:` `` twice; comment explicitly notes it avoids LIKE's ASCII case-folding and `%`/`_` wildcard semantics |
| `%` / `_` matched literally (parameterized, not LIKE)                  | ✅     | Same substr-based comparison; no LIKE interpolation anywhere in the workspace branch; verified by tests exercising workspaces `my_ws` and `a%b` (see below)                                                                                                 |
| Case sensitivity                                                       | ✅     | Binary comparison on `file_path` column (no `COLLATE NOCASE` applied, unlike name/comment branches at :1205/:1215)                                                                                                                                          |
| Port surface unchanged for other backends                              | ✅     | Abstract `findSymbols(query: SymbolQuery)` at `src/domain/ports/graph-store.ts:687`; worker transport passes query verbatim (`sqlite-worker.ts:246`, `sqlite-graph-store.ts:583-585`); provider delegates (`code-graph-provider.ts:327-329`)                |

Backend note: the spec text uses Kuzu-style `STARTS WITH`; the SQLite backend realizes identical observable semantics via parameterized `substr` equality. This is permitted by the pre-existing graph-store requirement that backends MAY represent concepts differently internally while preserving abstract semantics.

Consumer consistency: `packages/sdk/src/orchestration/suggest-implementation-links.ts` scopes symbol queries with `workspace: workspace !== 'default' ? workspace : undefined` (:1160, :1254) and consumes `registry.getReservedKeywords()` (:177) — matches the design intent recorded in `design.md:27,350` and the sibling spec `specs/sdk/suggest-implementation-links/spec.md:40,46`.

### Discrepancies (both hypotheses)

**Hypothesis A — literal delta text: NO discrepancies.**
Property added; prefix semantics, case sensitivity, and wildcard-literal behavior all match; implementation is parameterized (no injection/wildcard leakage).

**Hypothesis B — broader reading (all backends must conform): effectively satisfied, with one cosmetic note.**

- Only one concrete backend exists (`SQLiteGraphStore extends GraphStore`, `sqlite-graph-store.ts:104`), so backend parity is trivially satisfied; the shared contract suite additionally pins the behavior for any future store.
- Cosmetic: the explanatory comment at `sqlite-graph-database.ts:1179` references `InMemoryGraphStore.startsWith`, but no such production class exists (only test helper `test/helpers/in-memory-graph-store.ts`). Stale reference in a comment; zero behavioral impact.

### Test Coverage

- Contract suite (backend-neutral): `test/domain/ports/graph-store.contract.ts:894-931` — "scopes results to workspace when workspace is specified": symbols in `core:` vs `other:` files; `findSymbols({ name: 'create*', workspace: 'core' })` returns only `core:`-prefixed symbols (:926-930). Mirrors the delta scenario (uses workspaces core/other rather than core/cli/sdk; semantically equivalent multi-workspace isolation). Wired to run against `SQLiteGraphStore` via `test/infrastructure/sqlite/sqlite-graph-store.spec.ts:25-42`. ✅
- SQLite-specific edge coverage: `test/infrastructure/sqlite/sqlite-graph-store.spec.ts:925-941`:
  - exact-case `workspace: 'core'` matches only core symbol (:925-926)
  - distinct uppercase workspace `'CORE'` matches its own symbol (:928-929) and `'Core'` matches nothing (:931) — proves case-sensitive prefixing
  - underscore workspace `'my_ws'` matched literally, `'mysws'` does not (:933-935) — proves `_` is not a wildcard
  - percent workspace `'a%b'` matched literally; `'ab'` and `'a%%b'` do not (:937-940) — proves `%` is not a wildcard
- Suite run: same 682/682 pass above (includes contract + sqlite suites).

### Conformance

**CONFORMANT** (both hypotheses; one stale-comment cosmetic note only).

---

## Cross-spec consistency

- **symbol-model dependency**: workspace-prefix scoping relies on canonical workspace-prefixed file paths (`<workspace>:...`), which is the established vocabulary in graph-store's "Minimum graph semantics" requirement and `symbol-model`'s `SymbolNode.filePath`. Consistent; no vocabulary drift introduced by the delta.
- **document-model dependency**: untouched by either delta; document nodes/search unaffected (verified `findSymbols` changes only).
- **language-adapter ↔ graph-store**: independent additions; no overlapping identifiers. The `keywords()` capability is additive/optional on the port, so existing custom adapters (and the SDK's use of `createBuiltinAdapterRegistry(graphOptions?.adapters)` at `create-code-graph-provider.ts:51`) remain source-compatible.

## Summary counts

| Metric                                                    | Count                                                                                   |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Delta requirements audited                                | 2 (language-adapter ×1, graph-store ×1)                                                 |
| Delta scenarios audited                                   | 2                                                                                       |
| Requirements conformant                                   | 2 / 2                                                                                   |
| Requirements partially conformant                         | 0                                                                                       |
| Requirements non-conformant                               | 0                                                                                       |
| Violations requiring spec/code change                     | 0                                                                                       |
| Advisory observations (hypothesis-B keyword completeness) | 3 (Go built-in-type subset, TS contextual keywords, PHP `__halt_compiler`/`yield from`) |
| Cosmetic findings                                         | 1 (stale `InMemoryGraphStore` comment reference, sqlite-graph-database.ts:1179)         |
| Delta scenario tests found & passing                      | 2 / 2 (plus 3 supporting edge tests for case/`_`/`%` literals)                          |
| Test suite result                                         | 682 passed / 682 (55 files)                                                             |

**Verdict: PASS — both audited code-graph deltas are implemented, tested, and conformant.**

---

# Compliance Audit Partial — global conformance

Change: `suggest-implementation-and-spec-deps` (verifying) · Auditor: read-only subagent · Date: 2026-08-24
Scope: six change specs (`cli:spec-implementation`, `cli:spec-deps`, `sdk:suggest-implementation-links`, `sdk:suggest-spec-dependencies`, `code-graph:language-adapter`, `code-graph:graph-store`) vs `default:_global/*` + code spot-checks.

## Global rules checked (per global spec)

- **`default:_global/architecture`** — hexagonal layering (domain pure, application ports-only, only `composition/` imports `infrastructure/`); manual DI / no module-level singletons; ports with shared construction are abstract classes with explicit methods; curated public barrels (`"."` MUST NOT export concrete adapter classes or infrastructure implementations; sdk exposes `"."`, `"./ports"`, `"./extensions"`); one-way package dependency direction; delivery hosts must not depend on both core and code-graph when sdk covers needs; adapter packages contain no business logic.
- **`default:_global/conventions`** — strict TS, ESM-only (NodeNext, `.js` import suffixes), named exports only, kebab-case files, no `any`, explicit return types on public functions, errors extend `SpecdError`, underscore private backing fields, lazy loading metadata-before-content, immutability preference.
- **`default:_global/testing`** — Vitest; tests in `test/` mirroring `src/` with `.spec.ts` suffix matching source file name; unit tests mock ports; port mocks fully implement the port — "No partial mocks with `as unknown as Port`"; infra integration tests use `os.tmpdir()` + unique dir + `afterEach` cleanup; no snapshot tests.
- **`default:_global/error-handling-conventions`** — Specd Error Contract (`specd = true`, machine-readable `code`), core mandate (`SpecdError` base), monorepo package mandate (package bases extend `SpecdError`; e.g. `SpecdCodeGraphError`), `UPPER_SNAKE_CASE` codes.
- **`default:_global/docs`** — every command documented in `docs/cli/`; output-contract changes update the reference in the same change; JSDoc on all symbols.
- **`default:_global/eslint`** — enforces conventions incl. layer boundaries and JSDoc.
- **`default:_global/logging`** — no direct `console.*` in production code; use logging abstraction.
- **`default:_global/spec-layout`, `default:_global/commits`** — consulted for context (spec structure of merged previews; commit hygiene of change commits).

## Findings (rule → affected change spec(s) → verdict → evidence)

### F1 · Public `"."` barrel exports concrete infrastructure adapters — **VIOLATION**

- **Rule:** architecture — "Public `'.'` barrels MUST NOT export concrete adapter classes or infrastructure implementations" (applies explicitly to `@specd/sdk`).
- **Affected:** `sdk:suggest-implementation-links`, `sdk:suggest-spec-dependencies` (introduce the adapters and their barrel exposure).
- **Evidence:** `packages/sdk/src/index.ts:62-65` exports `FsImplementationSuggestionCache` and `FsSpecDepsSuggestionCache` from `./infrastructure/fs/index.js`.
- **Hypotheses:** (a) _Global drift_ — hosts may now be expected to swap cache backends, warranting an intentional export carve-out; but `_global/architecture` was not updated to permit it. (b) _Change non-conformance_ (favored) — commit `0decdcf0` ("scope cache exports to dedicated barrels") moved caches out of `orchestration/index.ts` yet kept the root-barrel re-export, leaving the global rule breached.

### F2 · Orchestration layer imports/instantiates infrastructure directly — **VIOLATION** (with a change-spec clause that itself contradicts the global)

- **Rule:** architecture — application/orchestration interacts through ports only; "Only `composition/` may import from `infrastructure/`"; constraints: "`application/` must not import from `infrastructure/`".
- **Affected:** `sdk:suggest-implementation-links`, `sdk:suggest-spec-dependencies`.
- **Evidence:**
  - `packages/sdk/src/orchestration/suggest-implementation-links.ts:37` imports `FsImplementationSuggestionCache`; `:359-366` constructs it inside `execute()` as default when no cache dep injected. Same at `:1576` in the resolver helper.
  - `packages/sdk/src/orchestration/suggest-spec-dependencies.ts:31,33` imports both Fs caches; `:302` and `:941` construct them; `:846-847` performs direct `mkdir`/`writeFile` for `.specd-exploration.md`.
  - The merged change specs codify the deviation: _"Candidate file existence validation … is permitted as a lightweight infrastructure concern within the orchestration layer"_ and _"Alignment change scaffolding … permitted as a lightweight infrastructure concern"_ — these clauses contradict `_global/architecture` as written.
- **Hypotheses:** (a) _Global drift_ — three-way conflict shows drift: `_global/architecture` allows layered packages with composition; sibling workspace spec `sdk:composition` forbids `infrastructure/` in the SDK entirely ("no `infrastructure/` or `domain/` directories exist") while this change adds `application/ports` + `infrastructure/fs`; the globals likely predate SDK orchestration-with-defaults patterns. (b) _Change non-conformance_ — defaults could be wired exclusively via `resolveXxxDeps(resolver)` so `execute()` never touches `infrastructure/`. Either way, the change specs and `sdk:composition` need reconciliation.

### F3 · Module-level memoized singleton in orchestration — **borderline violation**

- **Rule:** architecture constraint — "Use cases receive all dependencies via constructor — no module-level singletons, in any package."
- **Affected:** `sdk:suggest-implementation-links`.
- **Evidence:** `packages/sdk/src/orchestration/suggest-implementation-links.ts:165` `let cachedBuiltinRegistryData` lazily memoizes built-in adapter registry data across all use-case instances (consumed at `:700`).
- **Hypotheses:** (a) _Drift/tolerance_ — it caches immutable lookup data (extensions/keywords), not an injected service, arguably outside the rule's anti-singleton intent. (b) _Strict reading_ — state persists module-wide instead of arriving via constructor deps.

### F4 · Partial port mocks cast with `as unknown as Port` in tests — **VIOLATION**

- **Rule:** testing — "Port mocks implement the port interface fully. No partial mocks with `as unknown as Port`."
- **Affected:** `sdk:suggest-implementation-links`, `sdk:suggest-spec-dependencies` (their verify suites).
- **Evidence:** `packages/sdk/test/orchestration/suggest-implementation-links.spec.ts:142-146` (`{ list, get, artifact } as unknown as SpecRepository`); `suggest-spec-dependencies.spec.ts:179, 513, 661, 791`.

### F5 · Change-spec constraint "No dependency on @specd/core" contradicts globals and its own requirements — **change-spec inconsistency (spec drift favored)**

- **Rule:** error-handling-conventions — monorepo package mandate requires package base errors to extend `SpecdError` (i.e., `SpecdCodeGraphError extends SpecdError`), which presupposes a core dependency; architecture's dependency graph omits `code-graph` entirely (global drift), while repo guidance sanctions `code-graph → core`.
- **Affected:** `code-graph:language-adapter`, `code-graph:graph-store` (both list "- No dependency on `@specd/core`" under Constraints).
- **Evidence:** `packages/code-graph/package.json` declares `"@specd/core": "workspace:*"`; `src/domain/errors/specd-code-graph-error.ts:1` imports `SpecdError` from `@specd/core` (pre-existing, 2026-05-22); `src/domain/value-objects/index-options.ts:1-2` imports core types into the domain layer; and the language-adapter spec's own requirement that `createBuiltinAdapterRegistry` accept `config: SpecdConfig` forces a core type import (`src/composition/use-cases/create-builtin-adapter-registry.ts:7`). The deltas for both specs were modified within this change (`specs/code-graph/*/spec.md.delta.yaml` in commit `a5f96629`) without fixing the stale constraint.
- **Hypotheses:** (a) _Spec drift_ (favored) — the constraint line means "adapter/store logic must not depend on core domain", but as written it conflicts with the global error taxonomy and the spec's own factory requirement. (b) _Non-conformance_ — code violates the letter of both change specs.

### F6 · CLI declares direct runtime dependency on `@specd/code-graph` and imports its internal barrel — **VIOLATION** (per architecture verify scenario), forced by an SDK barrel gap

- **Rule:** architecture — verify scenario: `packages/cli/package.json` must declare `@specd/sdk` and `@specd/core`/`@specd/code-graph` must be absent; delivery hosts import host-adapter symbols via `@specd/sdk` (see also `sdk:composition`).
- **Affected:** `cli:spec-implementation`, `cli:spec-deps` context (host import policy governing the commands' package); `sdk:suggest-*` (barrel completeness).
- **Evidence:** `packages/cli/package.json` lists `"@specd/code-graph": "workspace:*"` (added in `b86b81c1`, dated 2026-08-16 — same day as this change's creation); `packages/cli/src/commands/graph/index-graph.ts:3` imports `acquireGraphIndexLock` from `@specd/code-graph/internal`. `acquireGraphIndexLock`/`assertGraphIndexUnlocked` are **not exported from `@specd/sdk`** (grep over `packages/sdk/src` returns nothing), so the internal-barrel import is forced by a missing re-export rather than necessity.
- **Hypotheses:** (a) _Global drift_ — the lock helpers were never surfaced through the SDK barrel, making direct internal import pragmatic; the global rule then needs either the barrel fix or an exception. (b) _Change non-conformance_ — the change should have added the re-exports to `@specd/sdk` and dropped the CLI dep/import in the same change. Note nuance: literal requirement text bans depending on "**both** core and code-graph" — CLI has code-graph only, so the requirement prose passes while its verify scenario fails.

### F7 · `docs/cli/spec-deps.md` documents stale flag and removed merge semantics — **VIOLATION** (docs alignment in same change)

- **Rule:** docs — "Changes to a command's documented output contract MUST update the corresponding `docs/cli/` reference in the same change."
- **Affected:** `cli:spec-deps`.
- **Evidence:** `docs/cli/spec-deps.md:9-11` documents `--depends-on <id>...`, but the implemented CLI uses `--dep <id>` (`packages/cli/src/commands/spec/deps.ts:91,114,137`) and the merged `cli:spec-deps` spec specifies `--dep <dependency-id>...`. The doc's Rules section still describes combined add/remove semantics ("`remove` runs before `add` when both appear in one mutation") that do not exist in the one-action-per-call surface. The file was last touched by this change's WIP commit `a5f96629`, so the stale text survived an in-change edit. (`docs/cli/spec-implementation.md` correctly documents `--file`/`--symbol` and the `suggest` subcommand.)
- **Hypotheses:** (a) _Pre-existing drift partially fixed during the change_; (b) straightforward change non-conformance — either way the doc must be corrected before archive.

### F8 · Test file covers two source files — **minor deviation**

- **Rule:** testing — test file name matches the source file name, mirroring `src/`.
- **Affected:** `sdk:suggest-implementation-links`, `sdk:suggest-spec-dependencies` (infra suites).
- **Evidence:** `packages/sdk/test/infrastructure/fs/fs-suggestion-cache.spec.ts` contains `describe('FsImplementationSuggestionCache')` (line 11) **and** `describe('FsSpecDepsSuggestionCache')` (line 105); no dedicated `fs-spec-deps-suggestion-cache.spec.ts`.
- **Hypotheses:** (a) tolerated pairing drift; (b) minor naming non-conformance.

### Conformant highlights (verified against globals)

- **Composition pattern**: both SDK factories implement exactly the canonical triple overload form plus `resolveXxxDeps(resolver)` delegating through `createCompositionResolver` → shared resolver path (`suggest-implementation-links.ts:1559-1624`; mirrored in `suggest-spec-dependencies.ts`) — matches architecture's config-based factory mandate.
- **Error taxonomy**: `InvalidInputError`, `WorkspaceNotFoundError`, `SpecNotFoundError` extend `SpecdError` with UPPER_SNAKE_CASE codes; CLI maps them to exit 1 via `handleError` (`handle-error.ts:165-197`); `ReadOnlyWorkspaceError` falls into the generic SpecdError→exit-1 path.
- **ESM/conventions**: `.js` import suffixes throughout new files; named exports only (no `export default`); kebab-case filenames; no `any` in orchestration/infrastructure spot-checks; underscore private backing fields (`_data`, `_storagePath`, …); explicit return types + JSDoc with `@param`/`@returns` on new symbols.
- **GraphStore port**: abstract class with `storagePath` constructor in `domain/ports/graph-store.ts:118-135`, SQLite adapter under `infrastructure/sqlite/` — matches both the change spec and global port convention.
- **CLI thinness**: `implementation.ts`/`deps.ts` handlers delegate entirely to `Kernel.specs.getPersistedImplementation/updatePersistedImplementation/getPersistedDeps/updatePersistedDeps` and to SDK factories via dynamic `import('@specd/sdk')`; `.allowExcessArguments(false)` on every leaf subcommand; `--format text|json|toon` everywhere; `[already included]`/`[new]` tags rendered; spinner gated to interactive text so json/toon never prompt.
- **Testing**: Vitest everywhere; integration suites use `os.tmpdir()` + unique dirs + `afterEach` cleanup (`fs-suggestion-cache.spec.ts:18,112`; `fs-cache-concurrent-load.spec.ts:77`); zero snapshot assertions; no raw `console.*` in new production code (`Logger` used).
- **Lazy loading**: `repo.list({ includeMeta: true })` for discovery with full artifact reads only on cache miss — consistent with metadata-before-content.
- **SDK package shape**: `"type": "module"`, curated `exports` (`.`, `./ports`, `./extensions`), deps limited to core + code-graph per `sdk:composition`.

## Summary counts

| Verdict                                | Count | Findings                                                                                                                                                                             |
| -------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Violation                              | 5     | F1 (public barrel exports infra), F2 (orchestration→infrastructure), F4 (partial port mocks), F6 (CLI direct code-graph dep/internal import), F7 (stale docs/cli flag+semantics)     |
| Borderline violation                   | 1     | F3 (module-level memo singleton)                                                                                                                                                     |
| Change-spec inconsistency / spec drift | 1     | F5 ("No dependency on @specd/core" vs globals + own requirements)                                                                                                                    |
| Minor deviation                        | 1     | F8 (test file naming coverage)                                                                                                                                                       |
| Conformant areas verified              | 10    | composition factories, error taxonomy, ESM/naming/no-any, GraphStore port shape, CLI thinness, testing hygiene, lazy loading, package shape, docs presence (implementation), logging |

**Overall:** the six specs are structurally well-aligned with the globals (composition, error contract, CLI thinness, testing hygiene). The material risks concentrate in (1) the SDK introducing an `application/ports` + `infrastructure/fs` split that breaches both the global curated-barrel and ports-only rules while contradicting sibling spec `sdk:composition`, (2) test-mock typing, and (3) doc/flag drift in `docs/cli/spec-deps.md`. Hypothesis A (global/workspace-spec drift around SDK orchestration) vs hypothesis B (change non-conformance) is flagged per finding; F1/F4/F7 are actionable within this change regardless of which hypothesis holds.

---

# Compliance Audit Partial — sdk area

Change: `suggest-implementation-and-spec-deps` (state: verifying)
Audited specs: `sdk:suggest-implementation-links`, `sdk:suggest-spec-dependencies`
Evidence date: 2026-08-24. All tests cited were executed green during this audit:
`vitest run test/orchestration/suggest-implementation-links.spec.ts test/orchestration/suggest-spec-dependencies.spec.ts` → 27 passed; `test/infrastructure/fs/fs-suggestion-cache.spec.ts` + `fs-cache-concurrent-load.spec.ts` → 7 passed (workdir `packages/sdk`).

Primary implementation files inspected:

- packages/sdk/src/orchestration/suggest-implementation-links.ts
- packages/sdk/src/orchestration/suggest-spec-dependencies.ts
- packages/sdk/src/application/ports/implementation-suggestion-cache-port.ts
- packages/sdk/src/application/ports/spec-deps-suggestion-cache-port.ts
- packages/sdk/src/domain/value-objects/implementation-suggestion-cache.ts
- packages/sdk/src/domain/value-objects/spec-deps-suggestion-cache.ts
- packages/sdk/src/infrastructure/fs/fs-implementation-suggestion-cache.ts
- packages/sdk/src/infrastructure/fs/fs-spec-deps-suggestion-cache.ts

---

## Spec 1: sdk:suggest-implementation-links

### Requirements Summary (count)

6 requirements in spec.md; 13 scenarios in verify.md.

1. Use Case Interface
2. Input Validation & Error Handling
3. 3-Tier Analysis Algorithm
4. Already-Included Marking
5. Additive Mutation Semantics (`apply: true`)
6. Standard Factory & Composition Overloads

### Implementation Status (per requirement)

**1. Use Case Interface — SATISFIED**

- `async execute(input)` at suggest-implementation-links.ts:339.
- All input fields present: `specId` (:106), `specIds` (:108), `workspace` (:110), `all` (:112), `apply` (:114), `rebuildCache` (:116), `confidenceThreshold` with `'HIGH'|'MEDIUM'|'MED'|'LOW'` union (:118), `onProgress` (:120).
- MED→MEDIUM normalization implemented in zod schema (suggest-implementation-links.ts:54–59).
- Progress event union contains exactly `discovery-start`, `discovery-done`, `start`, `spec-start`, `spec-done`, `done` (:92–98); emission order discovery-start first (:383), discovery-done precedes start (:425 vs :443).

**2. Input Validation & Error Handling — SATISFIED**

- No targeting option → `InvalidInputError`: superRefine guard (:81–89) thrown as InvalidInputError (:340–346).
- Unknown workspace → `WorkspaceNotFoundError` (:349–353).
- Invalid confidence threshold → `InvalidInputError` via zod enum failure (:54–59, :340–346).
- Missing `specId`/`specIds` → `SpecNotFoundError` after discovery (:427–436). All errors extend `SpecdError` (imported from @specd/core, :18–20).
- Minor deviation: schema also accepts lowercase variants `'high'|'medium'|'med'|'low'` (:55), i.e. values technically outside the spec's allowed set are accepted and normalized rather than rejected (see Discrepancies D1-1).

**3. 3-Tier Analysis Algorithm — PARTIAL**

- Tier 1 core mechanics all present:
  - `repo.list(undefined, { includeMeta: true, ... })` across workspaces (:400) — matches "Queries SpecRepository.list({ includeMeta: true })".
  - 2-stage cache staleness (`lastModified` then `hash`) in FsImplementationSuggestionCache.get() (fs-implementation-suggestion-cache.ts:238–261); cache file path `.specd/tmp/fs-cache/implementation-suggestions/suggestions.json` (:58–64, :72–78); domain interfaces exported from value object (implementation-suggestion-cache.ts:5–57, version '1.1.0' at :2).
  - Reads spec.md via `repo.artifact(spec, 'spec.md')` (:682–685); real hash via `repo.artifactMeta(..., { includeHash: true })` (:687–694).
  - Symbol extraction: title words via GetSpecMetadata fallback (:705–716), AST code blocks (:697–698 regex, :822–832 extraction), backticked terms matching PascalCase / camelCase-with-uppercase / `fn()` / `Obj.method` patterns (:728–743 isCodeIdentifierCandidate, :842–865 inline backtick scan), reserved keywords + SPEC_PROSE_KEYWORDS stop-words (:183–265, :702–703).
  - Naming derivative path candidates: kebab→Pascal/Camel/snake (:790–803), factory prefixes register/create/get/handle/parse/resolve (:812–817), path variant expansion over validated source subdirs (:868–935).
  - Candidate existence validated on disk before suggestion (:1012–1015, :1093–1096) — uses async `access` (asyncFileExists :45–52) instead of the literal `existsSync`; functionally equivalent (see Discrepancies D1-2).
  - computePathSpecAffinity (:274–320): split `[\/\\_\-.:]+` (:286), plural stemming `length > 2 && !endsWith('ss')` (:282–285), per-missing-token penalty `-150` recorded as `missing-distinctive-tokens` (:1077–1080), HIGH barred when affinity unclean (:1522–1525 `isCleanAffinity` requirement).
  - code-graph symbol query scoped to workspace via `workspace` property on the query object (:956–959).
  - Variable kind filtered (:963–966); parentId-based top-level preservation / loose child sieving (:1440–1493 verifiedSymbols, top-level node names :1421–1429).
  - isCompoundIdentifier (:724–726); single-word PascalCase restricted to files declaring it top-level (`parentId === undefined`) (:1445–1447, :1477–1493).
  - Exact primary match +200 `primary-symbol-match` (:1050–1052); derivative match +50 `derivative-symbol-match` (:1053–1055).
  - Candidates lacking any spec-title symbol match discarded (:1365–1419).
  - Confidence assignment: HIGH ≥150 w/ primary-or-token/slug reason & clean affinity (:1519–1525), MEDIUM ≥80 (:1526–1527), LOW otherwise (:1518). Matches "HIGH >= 150 with clean affinity, MEDIUM 80–149, LOW < 80".
  - **Short-circuit after Tier 1 NOT implemented literally** — see Discrepancies D1-3.
- Tier 2:
  - Hierarchical domain prefix derivation exists inside the derivedPaths loop: coverage ≥0.3 branch checks distinctive missing sub-tokens in candidate content via disk read + `codeGraphProvider.search` FTS (:1121–1211), awards `subtoken-content-match` +160 (:1180–1188) and attaches declared top-level symbols (:1188–1199).
  - **Tier 2 does not short-circuit the flow either** (same finding D1-3); Tier 3 gating on empty map is correct though.
- Tier 3:
  - Triggered only when `suggestionMap.size === 0` (:1215) ✓.
  - Extracts `<tag>` syntax tags (:1217–1230) and Requirement-heading keywords (:1232–1243), queries code-graph multi-term co-occurrence (:1246–1289), ranks by density, keeps top hits, assigns `fallback-content-co-occurrence` with MEDIUM-range score `min(140, 80 + count*15)` (:1292–1313 → confidence MEDIUM via :1526). Matches spec.

**4. Already-Included Marking — SATISFIED**

- `alreadyIncluded` computed by canonical-path set comparison against persisted lock files (:503–516); field on every entry (value object implementation-suggestion-cache.ts:32; default false at :1536 pre-marking).
- Result entries carry marking into response (:518–524).

**5. Additive Mutation Semantics (`apply: true`) — SATISFIED**

- Set-union semantics: only non-`alreadyIncluded` suggestions applied via `updatePersistedImplementation.execute({ ..., action: 'add', ... })` (:532–555), preserving existing links; mutation counters returned (:575–583).

**6. Standard Factory & Composition Overloads — SATISFIED**

- 3 overload signatures + handler (:1594–1624); type guard (:1632–1640).
- `resolveSuggestImplementationLinksDeps(resolver)` (:1559–1586) wires core use-case factories and FsImplementationSuggestionCache.
- Public exports verified in packages/sdk/src/index.ts:14–16.

### Discrepancies

**D1-1 — confidenceThreshold accepts lowercase values outside the documented enum.**

- Evidence: suggest-implementation-links.ts:54–59 (`z.enum(['HIGH','MEDIUM','MED','LOW','high','medium','med','low'])` + uppercase normalization) vs spec: "If `confidenceThreshold` is specified with an invalid string outside `['HIGH', 'MEDIUM', 'MED', 'LOW']`, `execute()` MUST throw `InvalidInputError`."
- Hypothesis A (spec drift): the spec should document case-insensitive acceptance as intended lenient UX; implementation is correct.
- Hypothesis B (implementation bug): inputs like `'high'` are contract-invalid per the current spec text and must be rejected; the lenient schema silently broadens the API contract. Severity: low (no wrong results produced; normalization maps to valid levels).

**D1-2 — File-existence check uses async `access` instead of literal `existsSync`.**

- Evidence: suggest-implementation-links.ts:45–52 (`access(filePath, constants.F_OK)`) used at :1013, :1094, :1145, :1278; spec text says "`existsSync`" (Tier 1 bullet and Constraints).
- Hypothesis A (spec drift): spec over-specifies the Node API; the constraint's intent ("lightweight infrastructure concern") is satisfied by any existence probe.
- Hypothesis B (implementation bug): none functionally; purely textual mismatch. Severity: informational.

**D1-3 — Tier short-circuiting between Tiers 1 and 2 is not implemented.**

- Evidence: spec says "If Tier 1 produces matching candidates with `HIGH` or `MEDIUM` confidence, the algorithm short-circuits and returns" and "If Tier 2 produces matching candidates, the algorithm short-circuits and returns." In analyzeSpec there is a single continuous pipeline: graph-symbol scoring (Tier 1, :952–1088) always flows into the derivedPaths loop containing naming-derivative and subtoken-content-match logic (Tier 2, :1091–1212); no early return exists when high/medium candidates already exist. Only Tier 3 is correctly gated on zero candidates (:1215).
- Impact: additional lower-tier candidates can be appended even after a successful Tier 1 (e.g. a `subtoken-content-match` entry adding +160 could reach HIGH), changing output versus a strict cascade reading of the spec.
- Hypothesis A (spec drift): the shipped design intentionally merges tiers into one additive-scoring pass (scores/reasons accumulate; ordering by score at :1540 compensates), and the spec paragraph describes an earlier cascade prototype.
- Hypothesis B (implementation bug): missing early-return optimization/guard causes extra graph queries and potentially extra (possibly noisy) suggestions that the spec forbids. Needs owner decision; severity medium because observable result sets can differ from spec.

**D1-4 — Title resolution fallback chain incomplete vs spec.**

- Evidence: spec says title comes from "`GetSpecMetadata` title with fallbacks to `readMetadataSnapshot` and Markdown H1 title". Implementation resolves title only from (a) list metadata passed as `initialTitle` (:406, :705) or (b) `getSpecMetadata.execute` (:706–716). There is no direct `readMetadataSnapshot` call and no H1-title parse of spec.md content anywhere in the file (verified by grep: no H1 regex, no readMetadataSnapshot reference).
- Hypothesis A (spec drift): `initialTitle` from `repo.list({ includeMeta: true })` effectively IS the metadata-snapshot fallback (list reads `.specd-metadata.yaml` internally), so the chain is satisfied semantically; the H1 fallback was dropped intentionally because list/get always supply titles for real repositories.
- Hypothesis B (implementation bug): specs whose repository returns no metadata and no GetSpecMetadata title fall through to empty title, weakening primary-symbol extraction where the spec mandates an H1 fallback. Severity: low-medium (edge-case behavior gap).

### Test Coverage

Test file: packages/sdk/test/orchestration/suggest-implementation-links.spec.ts (12 tests, all passing).

| Verify scenario                                            | Test                                                                  | Assessment                                                                                                                                                                       |
| ---------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Suggest links for target spec (returns HIGH suggestion)    | `analyzes specs and returns confidence-scored suggestions` (:211–226) | Covered analogously with fixture repo; not the exact `cli:spec-implementation` fixture from verify.md                                                                            |
| Missing target options throws InvalidInputError            | :393–398                                                              | Covered (asserts both error type + SpecdError instance)                                                                                                                          |
| Non-existent workspace throws WorkspaceNotFoundError       | :400–409                                                              | Covered                                                                                                                                                                          |
| Invalid confidence threshold throws InvalidInputError      | :411–420                                                              | Covered (uses `'SUPER_HIGH'`)                                                                                                                                                    |
| MED shorthand normalizes to MEDIUM                         | :377–391                                                              | Covered exactly                                                                                                                                                                  |
| Non-existent spec ID error                                 | :422–435                                                              | Covered                                                                                                                                                                          |
| Cache staleness fast-path and rebuild                      | `persists real SHA-256 content hash in cache stamp` (:363–375)        | WEAK — stamp persistence asserted, but no assertion that a second execute serves from cache without re-running graph queries, nor that `rebuildCache: true` bypasses cache reads |
| Path/token affinity disqualifies missing tokens            | (none directly)                                                       | MISSING — no unit test exercises `-150` penalty / HIGH bar; computePathSpecAffinity is private and untested in isolation                                                         |
| Primary exact (+200) vs derivative (+50) differentiation   | Partially via `restricts single-word PascalCase terms...` (:252–318)  | WEAK — verifies top-level restriction but never asserts scores/reason strings `primary-symbol-match`/`derivative-symbol-match`                                                   |
| Tier 2 hierarchical domain prefix + subtoken content match | (none)                                                                | MISSING — no test for domain-prefix candidate + FTS sub-token confirmation scenario                                                                                              |
| Tier 3 fallback tag/keyword co-occurrence                  | (none)                                                                | MISSING — no test drives the `fallback-content-co-occurrence` path                                                                                                               |
| Already-included marking                                   | (none directly)                                                       | MISSING — setup seeds an existing lock file (`existing.ts` :153) but no test asserts `alreadyIncluded: true/false` on result entries                                             |
| Additive application of links                              | `performs additive set union when apply: true` (:228–239)             | MODERATE — asserts update called & counter >0; does not assert `action: 'add'` argument shape nor that already-included files are skipped                                        |
| Config-based factory resolution                            | `supports factory constructor overloads` (:437–449)                   | WEAK — only deps-form overload tested; config-form (`createSuggestImplementationLinks(config)`) and `resolveSuggestImplementationLinksDeps` output never exercised               |
| Progress callback events emission                          | :451–471                                                              | Covered incl. ordering assertions                                                                                                                                                |

Additional tests beyond scenarios: CRLF/multi-language code-block identifier extraction (:320–361).

### Dependency & Global Conformance findings

- Declared deps per `changes status`: `code-graph:symbol-model`, `code-graph:traversal`, `code-graph:language-adapter`, `core:get-persisted-spec-implementation`, `core:update-persisted-spec-implementation`.
  - code-graph:symbol-model — used via `findSymbols`, `SymbolNode`, `SymbolKind`, `parentId` handling (:23–29 imports; :952–1088; :1421–1493). Consistent with symbol-model spec (canonical `ws:path` identities respected at :992–1016).
  - code-graph:traversal — consumed indirectly here through provider `findSymbols`/`search`; heavy traversal usage lives in the sibling spec. Consistent; no contradiction found.
  - code-graph:language-adapter — `createBuiltinAdapterRegistry()` supplies supported extensions + reserved keywords (:172–181). Consistent with adapter-registry role.
  - core:get-persisted-spec-implementation — `getPersistedImplementation.execute({ specId })` (:463–465) matches its result contract (`implementation[]`, file-level vs symbol-level distinction preserved via `link.symbols ?? []`). The sdk swallows errors into empty lock data (:473–475) including the typed `SpecNotFoundError` the dep spec mandates for unknown specs — acceptable consumer-side tolerance, not a contradiction, but it conflates "unknown spec" with "uninitialized" (see shared note N1).
  - core:update-persisted-spec-implementation — invoked with `{ specId, action: 'add', file, symbols? }` (:537–546) exactly per its input contract; canonical `workspace:path` identity preserved because suggestion files are stored workspace-prefixed (:1016). Boundary/confinement enforcement delegated to the core use case — consistent.
- default:\_global/testing — VIOLATION (minor, systemic): "Port mocks are typed… No partial mocks with `as unknown as Port`." The suite builds partial mocks cast via `as unknown as SpecRepository` (:142–146) and `as any` providers (:168–187). In-memory caches DO fully implement their abstract ports (good). Severity low but a direct convention conflict.
- default:\_global/architecture — TENSION (design intent): orchestration modules import infrastructure adapters directly (`FsImplementationSuggestionCache` at :37; constructed as default at :359–366 and in resolver :1576–1581). Architecture spec reserves infrastructure imports for the composition layer ("application layer … never imports infrastructure adapters directly"). Mitigations: ports are injectable (`cache?: ImplementationSuggestionCachePort` :153), and the sdk mirrors core's hexagonal layout with `orchestration/` as its application layer. Report as accepted-deviation candidate needing an explicit note in global architecture or sdk docs.
- default:\_global/conventions — kebab-case files ✓, named exports ✓, SpecdError hierarchy ✓; JSDoc present throughout ✓.
- default:\_global/logging — `Logger.debug` used, no raw console ✓ (:674, :718, :937, etc.).

---

## Spec 2: sdk:suggest-spec-dependencies

### Requirements Summary (count)

4 requirements in spec.md; 11 scenarios in verify.md.

1. Use Case Interface
2. Input Validation & Error Handling
3. Cache Warm-up & 2-Pass Dependency Deduction (Passes 1, 2, 2.5, 2.6, 3)
4. Standard Factory & Composition Overloads

### Implementation Status (per requirement)

**1. Use Case Interface — SATISFIED**

- `async execute(input)` at suggest-spec-dependencies.ts:236.
- Inputs: `specId` (:133), `specIds` (:135), `workspace` (:137), `all` (:139), `apply` (:141), `rebuildCache` (:143), `createAlignmentChange` (:145), `changeNamePrefix` (:147), `onProgress` (:149); zod schema mirror :102–128.
- Progress events include all nine required types incl. `warmup-progress` wrapper (:37–49) and `validation-start`/`validation-done` (:47–48, emitted :787–790, :872–875).

**2. Input Validation & Error Handling — SATISFIED**

- Empty targeting → `InvalidInputError` (schema superRefine :120–128; thrown :237–243).
- Unknown workspace → `WorkspaceNotFoundError` (:246–250).
- Missing spec IDs → `SpecNotFoundError` post-discovery (:353–362).

**3. Cache Warm-up & 2-Pass Dependency Deduction — PARTIAL**

Pass 1 — SATISFIED:

- Warm-up executes `SuggestImplementationLinks.execute({ all: true, apply: false })` dry-run (:265–270).
- Primes impl cache via `setMany` + flush when stamps available (:281–298).
- Reverse lookup via `implCache.findSpecByFile(affPath)` O(1), hub filtering encapsulated in the fs adapter (SHARED_HUB_SPEC_THRESHOLD, fs-implementation-suggestion-cache.ts:18, :387–408; findSpecByFile :415–429) — satisfies "without ad-hoc loops or manual hub filtering in the use case".
- SpecDepsSuggestionCachePort initialized to `FsSpecDepsSuggestionCache` under `.specd/tmp/fs-cache/spec-deps-suggestions/suggestions.json` (:300–307; fs path fs-spec-deps-suggestion-cache.ts:53/:61).
- Deviation: spec names `SpecDepsSuggestionCachePort.isSpecFresh` validating `cacheVersion === '1.1.0'` — no such method exists anywhere in the SDK (grep confirmed 0 hits). Freshness/versioning is achieved structurally: version gate in loadFromDisk (fs-spec-deps-suggestion-cache.ts:98–110, `SPEC_DEPS_CACHE_VERSION='1.1.0'` value-object :4) + stamp/graph-fingerprint validation inside get() (:211–243). See Discrepancy D2-1.

Pass 2 — SATISFIED:

- Cache HIT served directly when fresh & rebuildCache false (:389–414).
- `fileToSpecFingerprint` cross-check against recomputed map fingerprint; mismatch ⇒ MISS (:314 fingerprint snapshot; :389–403 discard; stored on write :743–750; VO field spec-deps-suggestion-cache.ts:20–25; port input :19–20).
- Import tracing: gathers target implementation files from SpecRepository-persisted state + warm-up results (:416–447); depth-1 downstream impact via `analyzeFileImportImpact` preferring, falling back to `analyzeFileImpact` (queryDownstreamImpact :69–77; maxDepth=1 hard-coded at :74/:76) — satisfies "analyzeFileImpact (maxDepth = 1)".
- Imported files mapped to owning specIds via findSpecByFile (:495); barrel re-exports expanded one hop (:500–539).
- Items tagged `status: 'already-configured'|'new'` + `alreadyIncluded` (:543–551; cached path :408–414) so CLI can render `[already included]`.

Pass 2.5 Directional validation — SATISFIED:

- Outbound edges reused from Pass 2 (:452, :490–493); inverted candidates (candidate imports target, target doesn't import candidate) pruned (:615–661, prune at :655–661).

Pass 2.6 Transitive reduction — SATISFIED:

- For each candidate B, if another candidate A has B in its direct persisted deps, B pruned (:665–733; memoized getDirectDeps :671–710; prune :714–732). Uses GetPersistedSpecDeps then falls back to repository persisted state — consistent with dep specs.

Pass 3 Mutation/validation/change creation — SATISFIED:

- Only NEW ids (`alreadyIncluded === false`) unioned via `UpdatePersistedSpecDeps.execute({ specId, add })` (:767–780) — idempotent add per core:update-persisted-spec-deps.
- ValidateSpecs executed post-apply (:786–792); issues parsed into invalidSpecs with `[artifactId, description]` failures (:798–814).
- Alignment change `align-spec-deps-<timestamp>` created only when invalid AND `createAlignmentChange` authorized (:816–855; name `${prefix}-${Date.now()}` :821–822); `.specd-exploration.md` written with `- [artifactId]: description` lines (:834–847).
- `status: 'all-valid'` ⇒ NO change under any circumstances (:863–868). Constraint honored.

**4. Standard Factory & Composition Overloads — SATISFIED**

- 3 overload signatures + handler (:958–988); type guard (:996–1004); `resolveSuggestSpecDependenciesDeps` (:915–950) wiring createGetPersistedSpecDeps / createUpdatePersistedSpecDeps / createValidateSpecs / createCreateChange / both caches. Exports verified (packages/sdk/src/index.ts:18–22).

### Discrepancies

**D2-1 — `SpecDepsSuggestionCachePort.isSpecFresh` named by the spec does not exist.**

- Evidence: spec Pass 2 bullet "Evaluates `SpecDepsSuggestionCachePort.isSpecFresh` (validating `cacheVersion === '1.1.0'`)"; port declares only get/set/setMany/getAll/flush/invalidate (spec-deps-suggestion-cache-port.ts:44–77); grep for `isSpecFresh` across packages/sdk → 0 matches. Version check lives in private loadFromDisk (fs-spec-deps-suggestion-cache.ts:98–110).
- Hypothesis A (spec drift): the API was reshaped during implementation — freshness folded into `get()` self-validation and version gating into load; the spec still references an interim method name. Behavior (old-version entries discarded and regenerated, fs test :165–207) matches the spec's _intent_ and its verify scenarios.
- Hypothesis B (implementation bug): a required public port operation was never implemented, leaving consumers unable to query freshness without performing a get. Severity: low-medium (API surface mismatch; runtime behavior conforms).

**D2-2 — Validation errors silently coerced to `all-valid`.**

- Evidence: if `validateSpecs.execute({})` throws, the catch leaves `postApplyValidation` undefined (:869–871) yet `validation-done` is emitted with fallback status `'all-valid'` (:872–875). Also, validation only runs when `this.deps.validateSpecs` was injected (:786) — the deps-form factory allows omitting it (`validateSpecs?: ValidateSpecs` :209), whereas the spec presents ValidateSpecs as an unconditional Pass-3 step whenever `apply: true`.
- Hypothesis A (spec drift): spec should document the optional-validator dependency and the fail-open reporting policy.
- Hypothesis B (implementation bug): a crashed validator masquerading as "all-valid" suppresses the alignment-change safety net the spec mandates ("If invalid specs exist … creates a single alignment change"); fail-open is the unsafe direction. Severity: medium.

**D2-3 — Alignment-change creation depends on injected `createChange`; scaffolding partially duplicated.**

- Evidence: spec Constraint permits "directory creation and `.specd-exploration.md` writing … within the orchestration layer", but implementation additionally requires an injected `CreateChange` use case (:212, gated at :820) and then ALSO performs raw mkdir/writeFile (:846–847). With `deps`-form construction omitting `createChange`, `createAlignmentChange: true` yields `invalid-specs-detected` without any change and without error — silent capability loss.
- Hypothesis A (spec drift): spec should state the CreateChange collaboration explicitly as a required dep for authorized creation.
- Hypothesis B (implementation bug): unauthorized/no-op creation path violates "Creates a single alignment change gathering ALL failing specs" when authorization was given. Severity: medium.

**D2-4 — `warmup-progress` events forwarded only via raw inner callback (informational).**

- Evidence: warm-up passes its own onProgress translating inner events (:269); spec lists `warmup-progress` among emitted events ✓. No discrepancy — listed to confirm check performed.

### Test Coverage

Test file: packages/sdk/test/orchestration/suggest-spec-dependencies.spec.ts (15 tests, all passing) plus packages/sdk/test/infrastructure/fs/fs-suggestion-cache.spec.ts (3 tests).

| Verify scenario                                                | Test                                                                                                                | Assessment                                                                                                                                                                                                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Suggest deps from code imports (reason references import path) | `performs cache warm-up and traces import graph dependencies` (:242–261)                                            | Covered analogously; reason string `Code import relationship via <path>` asserted indirectly (only specId asserted). Reason-content assertion weak                                                                                                        |
| Missing target options throws InvalidInputError                | :568–573                                                                                                            | Covered                                                                                                                                                                                                                                                   |
| Non-existent workspace throws WorkspaceNotFoundError           | :575–584                                                                                                            | Covered                                                                                                                                                                                                                                                   |
| Non-existent spec ID error                                     | :586–599                                                                                                            | Covered                                                                                                                                                                                                                                                   |
| Directional pruning of inverted suggestions                    | :601–729                                                                                                            | Covered thoroughly incl. barrel-seeded inversion                                                                                                                                                                                                          |
| Transitive reduction                                           | :731–834                                                                                                            | Covered exactly per scenario roles                                                                                                                                                                                                                        |
| Cache version mismatch triggers regeneration                   | `discards and regenerates a cache file persisted with an older cacheVersion` (fs-suggestion-cache.spec.ts:165–207)  | Covered at adapter level (write 1.0.0 file → miss → regenerated header 1.1.0)                                                                                                                                                                             |
| Ownership change invalidates cached suggestions                | `recomputes cached suggestions when an imported file changes owner between runs` (:345–456)                         | Covered end-to-end incl. new-owner suggestion replacing old                                                                                                                                                                                               |
| Post-apply validation + conditional alignment change creation  | `handles invalid specs after applying dependencies and reports diagnostic` (:281–302)                               | WEAK — asserts status + suggestedAlignmentCommand only; `createAlignmentChange: true` path NEVER tested: no test for change name pattern `align-spec-deps-*`, `.specd-exploration.md` contents `[artifactId]: description`, or CreatedAlignmentChangeInfo |
| No change creation when all valid                              | Indirect via `applies suggested dependencies...` asserting `postApplyValidation?.status === 'all-valid'` (:263–279) | MODERATE — doesn't assert absence of createdChange explicitly, acceptable                                                                                                                                                                                 |
| Config-based factory resolution                                | `supports factory constructor overloads` (:458–470)                                                                 | WEAK — deps form only; config form + resolve helper untested                                                                                                                                                                                              |
| Progress callback events emission                              | :836–852                                                                                                            | Covered for presence of all six key event types; sequential order not asserted (unlike impl-links test)                                                                                                                                                   |

Additional tests: barrel hop expansion (:472–566), already-configured tagging (:304–320), deps-cache serving second run without graph queries (:322–343), apply-only-new union (:263–279).

Missing/negative-space coverage worth adding: D2-2 fail-open path (throwing validator), D2-3 omitted-createChange path, `changeNamePrefix` customization, `specIds`/`workspace`/`all` targeting variants (all tests use single `specId`).

### Dependency & Global Conformance findings

- Declared deps per `changes status`: `sdk:suggest-implementation-links`, `code-graph:traversal`, `core:get-persisted-spec-deps`, `core:update-persisted-spec-deps`.
  - sdk:suggest-implementation-links — warm-up delegation (:265–270) consistent; also relies on its cache priming side effect (:281–298), which the dep spec's public contract doesn't promise (implicit coupling; benign, same package).
  - code-graph:traversal — **CONTRADICTION (minor)**: sdk calls `analyzeFileImportImpact` first (queryDownstreamImpact :73–75). This function exists in code-graph (composition/code-graph-provider.ts:162/:818; services/analyze-file-impact.ts:165) but is NOT part of the merged code-graph:traversal spec, which documents only `analyzeFileImpact`/`analyzeFilesImpact`/`analyzeSpecImpact`/`detectChanges`. The sdk therefore consumes a provider capability outside its declared dependency's specified surface. Hypothesis A: spec drift — traversal spec should add the import-impact variant (or the sdk spec should declare the provider interface itself). Hypothesis B: implementation bug — should call only the specced `analyzeFileImpact` (the fallback already covers it; behavior would include CALLS-derived edges too, slightly widening suggestions). Depth-1 + direction 'downstream' usage otherwise conforms to traversal's File impact contract (affectedFiles aggregation, dedup).
  - core:get-persisted-spec-deps — used for existingDependsOn (:383–387) and direct-dep lookups (:677–681). Contract-conformant. Shared note N1: sdk catches ALL errors including the dep-spec-mandated `SpecNotFoundError` for unknown specs and treats them as uninitialized (`dependsOn: []`). Not a violation of the dep spec (that governs the core use case), but the sdk cannot distinguish "unknown spec" from "lock-less spec" — acceptable, note for reviewers.
  - core:update-persisted-spec-deps — `{ specId, add }` non-empty add (:771–774) matches input contract & idempotent-add semantics; readOnly-workspace rejection surfaces then swallowed (:777–779) — swallowed mutation errors mean `updatedSpecsCount` may under-report while validation proceeds. Minor robustness concern, not contradiction.
- `kernel.specs.validate` reference in spec verified real: kernel exposes `specs.validate: ValidateSpecs` (packages/core/src/composition/kernel.ts:235) — spec↔code consistency ✓.
- code-graph:symbol-model consistency (transitively via impl-links): file ownership identity `ws:path` respected by findSpecByFile keys (fs-impl-cache :352–356, :415–429) — consistent with symbol-model canonical paths.
- default:\_global/testing — same partial-mock violation pattern as Spec 1 (`as unknown as SpecRepository` :177–179; `as any` providers :205–216, :350–361, :523–542, :664–695, :794–806). In-memory caches fully implement abstract ports ✓. Integration-flavored fs tests use tmpdir + cleanup ✓ per conventions.
- default:\_global/architecture — same orchestration→infrastructure default-wiring tension (FsSpecDepsSuggestionCache imported at :33; defaults at :300–307, :941–946). Additionally Pass-3 writes files directly via node:fs/promises mkdir/writeFile (:846–847) — explicitly permitted by the change spec's Constraints, but in tension with the global architecture rule; recommend documenting as sanctioned exception.
- default:\_global/error-handling-conventions — thrown errors are core SpecdError subclasses ✓; however several internal failures are swallowed silently (mutation catch :777–779; exploration-write has no try/catch so it propagates ✓). Mixed but acceptable.
- default:\_global/logging — Logger.debug only ✓ (:398, :474, :496, :656, :720).

---

## Summary counts

| Metric                               | Count                                                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Requirements checked                 | 10 (6 impl-links + 4 spec-deps)                                                                                                                                     |
| Satisfied                            | 7                                                                                                                                                                   |
| Partial                              | 3 (impl-links Req 3; spec-deps Req 3 via D2-1/D2-2/D2-3 nuances — core passes conform)                                                                              |
| Not found                            | 0                                                                                                                                                                   |
| Discrepancies raised                 | 7 (D1-1..D1-4, D2-1..D2-3)                                                                                                                                          |
| High-severity discrepancies          | 0                                                                                                                                                                   |
| Medium-severity discrepancies        | 3 (D1-3 tier short-circuit, D2-2 fail-open validation, D2-3 conditional change creation gaps)                                                                       |
| Verify scenarios accounted for       | 24 (13 + 11)                                                                                                                                                        |
| Scenarios with solid test coverage   | 14                                                                                                                                                                  |
| Scenarios with weak/partial coverage | 5 (cache fast-path, affinity penalty, config-factory ×2, all-valid-no-change)                                                                                       |
| Scenarios with NO test coverage      | 5 (Tier 2 subtoken, Tier 3 co-occurrence, already-included marking [impl-links], alignment-change creation + .specd-exploration.md, progress ordering [spec-deps])  |
| Dependency-spec contradictions       | 1 (undocumented `analyzeFileImportImpact` reliance on code-graph:traversal)                                                                                         |
| Global-spec conformance findings     | 3 (testing: partial mocks; architecture: orchestration→infrastructure imports + direct fs writes [partially sanctioned]; logging/conventions/error-handling: clean) |

Overall: implementation tracks both specs closely; all 34 audited tests green. Priority follow-ups: (1) resolve Tier short-circuit wording vs merged-pipeline reality (D1-3); (2) decide fate of `isSpecFresh` API mention (D2-1); (3) make post-apply validation fail-safe and require/validate `createChange` when `createAlignmentChange: true` (D2-2/D2-3); (4) add missing tests for Tier 2/Tier 3, already-included marking, and the alignment-change creation path.
