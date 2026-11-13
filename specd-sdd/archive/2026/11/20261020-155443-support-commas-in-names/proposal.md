# Proposal: support-commas-in-names

## Motivation

Two related defects share one root: values that name things (files, spec IDs) are not handled as whole, validated names.

1. Several CLI options split their values on commas before the use cases see them, so a file whose name contains a comma becomes two names that do not exist. `specd changes implementation ignore|resolve --file` could not handle the tracked file `SpecD — Análisis de identidad LogicalSymbol, dependencias y casos de uso.md`, and the change had to be repaired by editing `manifest.json` by hand.
2. Spec IDs are not really validated on write. `specd changes deps <change> <spec> --set ""` stored an empty ID, which was archived into `spec-lock.json` as `"dependsOn": [""]`. Every later read of that lock failed with a raw `ZodError`, and the repair commands read the same lock first, so the CLI could not repair it.

## Current behaviour

- `packages/cli/src/commands/change/implementation.ts:290` expands `--file` values with `f.split(',').map(trim)`; `graph/index-graph.ts:75` splits `--exclude-path` on commas (a glob such as `{a,b}/**` breaks). The use cases already take `string[]`.
- Five divergent rules decide what a spec ID is: core `parseSpecId` (no validation, splits on the first `:`), CLI `parseSpecId` in `helpers/spec-path.ts` (only checks the workspace exists), the Zod schemas in `parse-spec-lock.ts` and `parse-metadata.ts` (strict and duplicated: workspace `^[a-z][a-z0-9-]*$`, segment `^[a-z0-9_][a-z0-9_-]*$`), and `SpecPath.parse` (permissive: only rejects `\ : * ? " < > |`, `.`, `..` and Windows device names). `core:spec-id-format` does not state the real rule.
- `UpdateSpecDeps.validateDepIds` calls the lenient `parseSpecId`, so `add` and `set` accept `""`, whitespace, `:` and `ws:`.
- `changes deps` exposes `--add`, `--remove`, `--set` and no way to clear; `specs deps clear` exists but neither command confirms the clear.
- Reading an invalid `spec-lock.json` throws a raw `ZodError` (printed as a pino `fatal` dump), not a typed `SpecdError`.
- Text output lists names joined with `, `, which is ambiguous when a name contains a comma.

## Proposed solution

1. **Names are never split.** Each value of `--file` (`add`, `ignore`, `resolve`) and `--exclude-path` is one whole name; the canonical forms are `--file a --file b` and `--file a b`. No splitter, no escape, no quote parsing, no compatibility path. Comma lists stay only where a comma can never be part of a valid value (`graph impact --type`, file categories, `--status`). Use cases take `string[]` and never split, so SDK and MCP already pass arrays. Text output lists names one per line; JSON and TOON stay arrays. A recorded name is never trimmed. The only alteration is that on a Windows host `\` in implementation file paths becomes `/` (one isolated, platform-parameterized helper), so Windows-style paths match the forward-slash entries git reports; on other hosts names are kept byte for byte. A failure shows the full original value. With several files, all are validated before any is persisted.
2. **One canonical spec ID format, cross-platform**, written into `core:spec-id-format`: workspace `^[a-z][a-z0-9-]+$` (two or more characters, so `c:` is never read as a Windows drive); capability path of one or more `/`-separated folder segments, each `^[a-z0-9_][a-z0-9_-]*$` and never a Windows device name; no `.`, spaces, commas or uppercase; no empty segments. Commas are not valid in spec IDs. The existing workspace rule in `core:workspace` is tightened to match.
3. **One validator in core: `parseSpecId` itself** (domain, no I/O). `parseSpecId(id, { workspaces?, defaultWorkspace? })` validates the canonical format and returns `{ workspace, capPath, specId }` fully qualified; without `workspaces` it checks syntax only, with them it also rejects an unknown workspace. Typed `InvalidSpecIdError` and `WorkspaceNotFoundError` (`SpecdError`, UPPER_SNAKE codes). Nothing persisted is expected to be malformed, so the strict behaviour applies to every core caller. No generic lenient splitter is kept, because it would reintroduce a function that accepts `""`. Callers whose input is not a spec ID get their own specific parser: `parseSpecPattern(pattern)` for context include/exclude patterns (`*`, `workspace:*`, `prefix/*`, `workspace:prefix/*`, exact paths; `*` only alone, after `workspace:`, or at the end after `/`), shared by `listMatchingSpecs` and `validateContextPattern`, so what is validated at startup is what is interpreted later; and a local split of `[workspace:]name` for schema references (`#workspace:name`, `#name`) in `schema-registry.ts`, whose `name` is validated by the schema repository, not by the spec ID rules. The workspace-name rule is exposed once as `isValidWorkspaceName` (`^[a-z][a-z0-9-]+$`) and used by `parseSpecId`, `parseSpecPattern`, the schema reference split, `validateContextPattern` and `ConfigLoader`, replacing five copies of the regex. Design confirms each of the ~45 callers of `parseSpecId`. `SpecPath` and both Zod schemas delegate to the same segment rule.
   **Bare IDs.** The core, not the CLI, turns an ID without `:` into `default:<path>` at input boundaries (use cases that receive an ID from a user, CLI, MCP or SDK); `parseSpecId` always returns the fully-qualified ID. Where a bare ID means "this same workspace" (a spec's `dependsOn` in `depends-on-traversal.ts`, and context patterns), the caller passes its own `defaultWorkspace` explicitly and `default` is never assumed silently. Persisted data is always written fully qualified, and a bare ID in `spec-lock.json` is rejected on read with the typed error (the lock's legacy tolerance for bare IDs is removed) and metadata is written strictly while its read path stays lenient because it is a regenerable cache (all 1189 `dependsOn` entries in the project's locks are already qualified).
   **Option B, complete:** the CLI holds no spec-ID rule. All 14 CLI commands that call the CLI-side `parseSpecId` (`change create|edit|validate`, `spec schema|init|implementation|context|generate-metadata|outline|validate|optimizations|metadata|deps|show`) pass raw strings, and every use case that accepts a spec ID validates and normalizes it with `parseSpecId` and the configured workspaces, returning the fully-qualified ID. `helpers/spec-path.ts` is deleted. `remove` operations do not validate syntax, so an invalid stored ID can still be removed.
4. **Existence rules for dependency targets.** `changes deps` accepts a target that does not exist yet (the change may create it): syntax and workspace only. `specs deps` and `UpdatePersistedSpecDeps` act on existing specs and require every target to exist; a future dependency belongs in the change.
5. **`--clear`** on `changes deps` (mutually exclusive with `--add`, `--remove`, `--set`) and a `clear` input on `UpdateSpecDeps`, reusing `applyDependsOnMutation`. `changes deps --clear` and `specs deps clear` both ask for confirmation on a TTY, accept `--force` to skip it, and fail with a clear error when there is no TTY and no `--force`. Confirmation lives in the CLI; the use case receives `clear: true`.
6. **Invalid persisted lock.** Reading a lock that fails validation raises a typed `SpecdError` naming the spec, the lock file and the field path, instead of a raw `ZodError`. Reads stay strict everywhere; no command reads a lock leniently and nothing is dropped silently. A command that repairs invalid locks (a broader `doctor`) is deliberately left to a separate change.
7. **Skills.** `skills:workflow-automation` currently tells agents to use comma-separated `--file` lists; it changes to repeated `--file`. The templates that emit `--file <p1>,<p2>` (known: `specd-archive` L112 and L117, `specd-implement` L185) change accordingly as implementation tasks.

8. **Verification follow-up.** Preserve platform-aware file identity when several new tracked files arrive in one batch; validate `defaultWorkspace` with the existing workspace-name helper; preserve one-shot workspace iterables across repeated dependency mutations; include the offending lock value in invalid-ID diagnostics. Reconcile stale primary-workspace and dependency-output scenarios with the current contracts, and complete structured help schemas for the affected commands. These are the decisions recorded in `reports/20261108-174945/decisions.md`.

9. **Metadata validation boundary (2026-11-13).** `ValidateSpecs` obtains usable metadata through `GetSpecMetadata` and trusts that projection. It does not re-extract dependencies, compare them against a second persisted-state observation, or assume that a spec without a lock has no dependencies. Materialization failures become validation failures and materialization warnings are propagated without duplicate logging. This brings CP3 and the related warning-propagation gap CP2 into scope; the remaining deferred findings stay separate.

## Specs affected

### New specs

None. The validator and its error types are specified in `core:spec-id-format`.

### Modified specs

- `core:spec-id-format`: states the canonical format (workspace, folder segments, cross-platform rules), the single shared validator with its optional workspace set, the typed errors, and that `remove` skips syntax validation.
  - Depends on (added): none
  - Depends on (removed): none
- `core:workspace`: workspace names must have two or more characters, `^[a-z][a-z0-9-]+$`; prefix segments follow the same segment rule.
  - Depends on (added): none
  - Depends on (removed): none
- `core:update-spec-deps`: validate `add` and `set` with the shared validator (syntax and workspace; target may not exist); add the `clear` operation; `remove` stays lenient.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:change-deps`: add `--clear` (mutually exclusive, confirmation or `--force`); `--set ""` and malformed IDs fail with a typed error; text output is unambiguous.
  - Depends on (added): none
  - Depends on (removed): none
- `core:update-persisted-spec-deps`: validate `add` and `set` with the shared validator and require every target to exist; `remove` stays lenient; `clear` unchanged.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:spec-deps`: `specs deps clear` asks for confirmation or `--force`; invalid and missing IDs are rejected with typed errors; an invalid lock fails with the typed lock error.
  - Depends on (added): none
  - Depends on (removed): none
- `core:spec-lock`: an invalid lock fails with a typed error naming the spec, the lock file and the field path; validation of `dependsOn` entries uses the shared validator and requires fully-qualified IDs (the legacy tolerance for bare IDs is removed).
  - Depends on (added): none
  - Depends on (removed): none
- `core:edit-change`: `--add-spec` validates IDs with the shared validator and workspace set; `--remove-spec` stays lenient; the `readOnly` workspace rejection moves here from the CLI.
  - Depends on (added): `core:spec-id-format`
  - Depends on (removed): none
- `cli:change-edit`: IDs are passed raw; the command no longer resolves workspaces or checks ownership; typed errors quote the full original value.
  - Depends on (added): none
  - Depends on (removed): none
- `core:create-change`: `--spec` IDs are validated with the shared validator and workspace set; the `readOnly` workspace rejection moves here from the CLI.
  - Depends on (added): `core:spec-id-format`
  - Depends on (removed): none
- `cli:change-create`: `--spec` values are passed raw and unsplit; workspace resolution and `readOnly` rejection are no longer done by the command (they belong to `CreateChange`, which maps its typed errors).
  - Depends on (added): `core:spec-id-format`
  - Depends on (removed): none
- `core:update-implementation-tracking`: file names are whole names, never split or trimmed; on a Windows host `\` in file paths is normalized to `/`; all files of a call are validated before any is persisted; failure quotes the full value.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:change-implementation`: `--file` of `add`, `ignore` and `resolve` takes whole names (`--file a --file b` or `--file a b`), no comma split; text output lists one name per line.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:graph-index`: `--exclude-path` values are whole gitignore patterns and are not split on commas.
  - Depends on (added): none
  - Depends on (removed): none

- `core:config`: context include/exclude pattern grammar is shared with `parseSpecPattern`, and workspace names use the two-or-more-character rule; schema references keep their grammar.
  - Depends on (added): `core:spec-id-format`
  - Depends on (removed): none
- `core:config-loader`: the pattern grammar and the workspace-qualifier and path-segment rules it states (`/^[a-z][a-z0-9-]*$/` and `/^[a-z_][a-z0-9_-]*$/`, a third segment rule different from the lock's) are replaced by the shared rules (`isValidWorkspaceName`, canonical segment, `parseSpecPattern`).
  - Depends on (added): `core:spec-id-format`
  - Depends on (removed): none
- `core:spec-metadata`: `dependsOn` entries must be fully-qualified valid spec IDs under the shared rule (the "valid spec ID pattern" wording is replaced; bare IDs are rejected when persisting, while the read path stays lenient).
  - Depends on (added): `core:spec-id-format`
  - Depends on (removed): none
- `core:generate-metadata`, `core:validate-specs`: the spec ID input is validated and normalized with `parseSpecId` and the configured workspaces; an invalid or unknown-workspace ID fails with the typed error.
  - Depends on (added): `core:spec-id-format`
  - Depends on (removed): none
- `core:preview-spec`: the spec ID input accepts a bare or qualified valid ID, is normalized, and must be one of the change's `specIds`; invalid IDs fail with the typed error.
  - Depends on (added): `core:spec-id-format`
  - Depends on (removed): none
- `core:get-persisted-spec-deps`, `core:get-persisted-spec-implementation`, `core:get-persisted-spec-optimizations`, `core:get-persisted-spec-schema`: `specId` input is validated and normalized (bare or qualified valid ID accepted, returned fully qualified); invalid IDs fail with the typed error.
  - Depends on (added): `core:spec-id-format`
  - Depends on (removed): none
- `core:update-persisted-spec-implementation`, `core:update-persisted-spec-optimizations`, `core:update-persisted-spec-schema`: same input validation and normalization of `specId`.
  - Depends on (added): `core:spec-id-format`
  - Depends on (removed): none
- `skills:workflow-automation`: the `--file` guidance for resolving or ignoring several files changes from comma-separated lists to repeated `--file`.
  - Depends on (added): none
  - Depends on (removed): none

- `cli:project-init`: workspace names entered during init are validated with the shared `isValidWorkspaceName` rule (two or more characters, no Windows device names) instead of a local regex, so init can never write a name the config loader rejects. (Audit finding.)
  - Depends on (added): `core:spec-id-format`
  - Depends on (removed): none
- `core:spec-repository-port`: documents the lenient `dependsOn` read (`lenientDependsOn`) used by `writePersistedState` and the lenient revision check, which the port contract did not mention. (Audit finding.)
  - Depends on (added): none
  - Depends on (removed): none
- `core:archived-change-index-entry`: workspaces derived from `specIds` for the index entry use the shared validator or an explicit tolerant derivation instead of an unvalidated split. (Audit finding.)
  - Depends on (added): `core:spec-id-format`
  - Depends on (removed): none

### Audit hardening (compliance audit 20261104-103701)

The verification audit found no HIGH issues but six MEDIUM and many LOW items. All are in scope; nothing is deferred. Beyond the three specs above, the existing deltas of the already-listed specs are amended as follows:

- `cli:change-edit`: remove the self-contradiction (the command derives no workspaces itself; the resulting `workspaces` shown come from the use case result).
- `core:edit-change`: the input contract lists `invalidationPolicy`.
- `core:update-persisted-spec-optimizations`: an empty or malformed `specId` always raises `InvalidSpecIdError` (one wording, no `InvalidInputError` mention).
- `core:update-persisted-spec-schema`: the "artifacts parse under the target schema" check runs for every target schema, not only those that extract `dependsOn`.
- `core:update-persisted-spec-implementation`: the `codeRoot` boundary check uses a path-relative containment test (no bare prefix match) and applies to qualified `ws:../x` paths too.
- `core:spec-lock`: scenarios for the lenient `dependsOn` read and the lenient revision check in `writePersistedState`.
- `core:update-implementation-tracking`: on Windows hosts errors quote the original value as the caller gave it, not the normalized name.
- `core:preview-spec`: `@throws` documents `InvalidSpecIdError` and `WorkspaceNotFoundError`.
- `cli:spec-deps`: `remove` on an uninitialized spec reports a no-op (the rendered `initialized` flag reflects the real state); the non-interactive `clear` error cites only `--force`.
- `cli:change-deps`: the display-only use of `parseSpecId` is routed through core (no spec-ID rule in the CLI).
- Lock error repair hint carries no `--force` parenthetical.
- Missing verification scenarios are added so every changed requirement has a test: comma names in SDK arrays, `ignore`/`resolve` on win32, duplicate collapse, one persisted mutation, empty and malformed IDs on add and remove, mixed owned/readOnly, unknown workspace with and without a workspace set, two-character workspace, `core:Auth/*`, `graph index --exclude-path 'a' 'b'`, `get-persisted-*` and `update-persisted-*` happy paths.

### Audit hardening (compliance audit 20261106-175354)

The full-mode compliance audit of the implemented change found code gaps, spec defects and missing tests. All are in scope. Decisions settled with the user:

- **Last-spec rule dropped.** `cli:change-edit` no longer says removing the last spec exits 1; `core:create-change` already allows an empty `specIds`, so the edit command follows (requirement and scenario removed, no code).
- **Invalidation policy validated in core.** `CreateChange` and `EditChange` reject a value outside `none`, `surgical`, `downstream`, `global` with `InvalidInputError` before persisting; the CLI cast is not validation. `core:create-change`, `core:edit-change`, `cli:change-create` and `cli:change-edit` state it and get scenarios.
- **Case follows `_global/cross-platform`.** `core:update-implementation-tracking` drops exact-case file matching: tracked file names are compared the way the host platform compares paths, so case-only differences are not distinct on Windows and macOS. The recorded name is still stored as given.
- **Lock-error repair hint stays CLI-only.** `core:spec-lock` keeps the core error host-neutral (spec, field, reason, lock location when read from disk, no command); `cli:spec-deps` states that the CLI adds the repair hint, scoped to `specs deps` commands. The spec documents the split so `_global/error-handling-conventions` is satisfied at the host that can name a command.
- **Schema compatibility is out of scope.** The audit also found that `compat` is read from the active schema in both `CreateChange` and `EditChange` instead of the change's own schema, that an explicit schema override on `CreateChange` is not validated, and that a legacy spec (no persisted schema) must assume the project's schema. This is being solved in `feat/lifecycle-transitions-ux` (`ResolveChangeSchema`); fixing it here would duplicate that work, so this change leaves the schema-compatibility blocks of both use cases untouched and the specs' guardrail wording as it is.
- **Defaults taken (spec stays, code follows):** `UpdateImplementationTracking` validates a supplied `specId` for every action including `start`; `EditChange` persists nothing when the resulting `specIds`, description and policy are unchanged.

Spec wording fixes from the audit, in the existing deltas: `core:edit-change` dependency and `updateSpecIds` signature text; `core:update-implementation-tracking` `specRepositories` required; `cli:change-edit` and `cli:change-create` truncated and duplicated output requirements; `core:update-spec-deps` error type is `InvalidInputError` and `set: []` clears; `cli:change-deps` display mode uses `GetChangeSpecDeps`; `core:update-persisted-spec-implementation` `..` rule matches the path-relative containment test; `core:update-persisted-spec-schema` unchanged-schema short-circuit; `core:get-persisted-spec-optimizations` partial-block behaviour; `core:archived-change-index-entry` no stale claim about `workspacesFromSpecIds`. Missing dependencies are added where the audit listed them.

Code gaps from the same audit (handled in implementation): `UpdatePersistedSpecDeps` matches `remove` against the raw and the normalized form and names the lock location in its post-mutation `InvalidSpecLockError`; `UpdateImplementationTracking` `start` validates `specId`; `EditChange` skips persistence on a no-op; `change implementation start` prints name, `trackingActive` and timestamp; invalidation policy validation as above.

### Verification decisions (2026-11-08 to 2026-11-09)

- `core:workspace` and `core:archived-change-index-entry`: a change has no singular or primary workspace. Its computed `workspaces` is the plural set derived from its specs; archive paths do not resolve `{{change.workspace}}`. Remove the obsolete primary-workspace requirement/scenarios and update the stale archive-index scenario. Clarify read-only source writes versus disposable metadata-cache writes.
- `core:update-implementation-tracking`: case-only aliases within one new batch collapse on macOS and Windows, preserving the first spelling when no entry was previously tracked. Linux keeps distinct names. Reuse the existing platform-aware comparison.
- `core:spec-id-format`: validate a resolved `defaultWorkspace` with `isValidWorkspaceName`, whether or not a workspace set is supplied. `core:update-spec-deps`: materialize the accepted workspace iterable once so repeated calls work with `Map.keys()`.
- `core:spec-id-format` and `core:spec-lock`: lock diagnostics identify the invalid `dependsOn` value as well as its field path, owner, location and rule; domain errors do not add CLI repair advice.
- `cli:change-deps`: rendered dependencies retain fully-qualified Core IDs, including `default:`. Correct the stale bare-ID scenarios and mocks. Complete the add-scenario output expectation.
- Help schemas for the affected CLI commands: expose the options and result fields already shown by their commands in JSON/TOON help, including `changePath` for change creation. This is help metadata work; it does not alter command execution.
- CM4, CLI-S2, CLI-I1 and CP1–CP8 from the same audit were deferred to `EXPLORATION_VERIFY_FOLLOWUPS.md` at the repository root. The 2026-11-13 decision brings CP2 and CP3 into this change; CM4, CLI-S2, CLI-I1, CP1 and CP4–CP8 remain deferred.

### Metadata validation decision (2026-11-13)

- `core:validate-specs`: replace the independent dependency-consistency rules with delegation to `GetSpecMetadata`. A successful materialization is accepted whether dependencies came from a lock or the schema's extraction rules; `ValidateSpecs` does not derive another dependency baseline. Preserve artifact validation, typed-ID handling and transparent result caching.
- Propagate materialization warnings into the spec entry and turn materialization failures into validation failures. An extraction/persisted-dependency conflict, when rejected by `GetSpecMetadata`, is reported through that failure path rather than checked again by the consumer.
- No new spec or dependency is introduced: `core:validate-specs` already depends on `core:get-spec-metadata`. Keep generation and materialization behavior unchanged. Tests must prove delegation, lock-less extracted dependencies, warning propagation, failure propagation and result-cache invalidation for the changed validation engine.

## Impact

- **Core domain**: `domain/services/parse-spec-id.ts` becomes the strict validator (new options and return shape, a new `splitSpecId` for lenient splitting) plus `InvalidSpecIdError` and `WorkspaceNotFoundError`; `SpecPath` validation tightens to the canonical segment rule; `parse-spec-lock.ts` and `parse-metadata.ts` stop duplicating the regexes. Graph blast radius of `parse-spec-id.ts`, `spec-path.ts`, `parse-spec-lock.ts` and `parse-metadata.ts` is **CRITICAL** (111 direct and 333 affected files). `parseSpecId` has about 45 call sites in core, plus `core/public.ts:598` and `sdk/core-reexports.ts:551`, so its signature change is a public API change (accepted, alpha). The 300 spec IDs that exist today all satisfy the new format, so no current spec breaks.
- **Core application**: every use case that accepts a spec ID validates and normalizes it (create, edit, update-spec-deps, update-persisted-spec-_, get-persisted-spec-_, preview, compile-context, validate-\*, generate/materialize metadata, initialize-persisted-spec-state, update-implementation-tracking, archive, and the rest of the ~45 call sites; the exact list is fixed in design from the graph). `UpdateSpecDeps` also gains `clear`; `UpdateImplementationTracking` validates all files before persisting; `FsSpecRepository._readSpecLock` raises a typed error; `ConfigLoader` workspace-name check uses the shared rule. Callers that parse context patterns use `parseSpecPattern`, and `schema-registry.ts` uses its own schema-reference split.
- **CLI**: the 14 commands above stop calling `helpers/spec-path.ts`, which is deleted; `change/implementation.ts`, `change/deps.ts`, `spec/deps.ts` and `graph/index-graph.ts` also change for names, `--clear` and `--exclude-path`; a shared confirmation helper (TTY prompt, `--force`).
- **Skills**: `skills:workflow-automation` spec text and the templates in `packages/skills/templates` that emit comma lists (full sweep in design).
- **Docs/guide**: CLI reference entries for the touched commands; the generated `guides.ts` diff is expected noise.
- **Breaking** (alpha, accepted): `--file a,b` is now one file named `a,b`.

## Technical context

- Detection is not at fault: the VCS adapter reads git with `-z` and splits on `\0`, so names with commas are recorded intact. The defect is only in the input path.
- Rejected alternatives: a smart or quote-aware splitter (quotes are legal in POSIX file names, so it creates ambiguity and costs cross-shell testing), an escape for `\,`, exact-match-first with a legacy comma fallback (kept an ambiguous branch with no value in an alpha product), and a `--files-from -` stdin list (out of scope, can be added later).
- Spec IDs reject commas by definition. This closes the exploration question about whether commas are valid in capability paths without changing the persisted format.
- `core:workspace` currently allows a one-character workspace name (`/^[a-z][a-z0-9-]*$/`). The two-character minimum avoids `c:foo` reading as a Windows drive path. All 16 current workspaces have three or more characters.
- `remove` skips syntax validation on purpose, so that an invalid stored ID can always be removed and never traps the user.
- A dependency from `core:update-spec-deps` and `cli:change-deps` to a spec that does not exist is legal at change level because the change may create it.
- Confirmation follows `project init`: interactive `confirm` on a TTY, `--force` skips it. No `--yes` is introduced because none exists in the CLI.
- The `workspaces` option of the validator is `Iterable<string | { readonly name: string }>`: it accepts name arrays, sets, `Map.keys()` and `ProjectWorkspace[]` as they are, and the domain service depends on no application type (`ProjectWorkspace` carries `SpecRepository`). Which use cases already hold `ListWorkspaces` or a repository map is confirmed with the graph in design.
- The CLI is only a step towards a use case. Every rule lives in core: ID validation and normalization, `--clear` mutual exclusion with `add`/`remove`/`set`, existence checks, and all-or-nothing validation of several files. The CLI only parses options, asks for the `--clear` confirmation (an interaction, not a rule), forwards raw values, and formats output. Option-conflict checks in the CLI, if kept, are fast-fail only and the use case remains the authority. The CLI-side `parseSpecId` (`helpers/spec-path.ts`) is removed from every command (option B).
- Finding while checking option B: `change create` and `change edit` resolve the workspace of each ID and reject `readOnly` workspaces in the CLI (`create.ts:52`, `edit.ts:77`), and `EditChange`/`CreateChange` have no ownership check. Without a CLI-side parser this rule cannot stay there, so it moves into the two use cases (as `ReadOnlyWorkspaceError`), which also closes a gap where MCP and SDK callers bypassed it.
- Core `parseSpecId` is deliberately made strict: persisted data is expected to be well formed, and a malformed ID should fail loudly with a typed error. This is why callers that parse non-spec-ID strings (wildcard patterns in `spec-pattern-matching.ts`, schema references such as `#name` in `schema-registry.ts`) get dedicated parsers instead. An unknown workspace in a context pattern stays an `unknown-workspace` warning that yields no specs, as today. Callers with a `label` or `key` argument (`validate-specs.ts:592`, `artifact-filename.ts:34`) are checked in design.
- Because the validation rule is cross-cutting, it is stated once as a requirement in `core:spec-id-format` ("every use case that accepts a spec ID validates and normalizes it with the shared validator"). Individual use-case specs get a delta only where they state spec-ID handling; the exact list is derived from the graph in the `specs` artifact.

## Open questions

None. Settled with the user:

- Repair of invalid persisted locks is out of scope. Reads stay strict and typed; a broader `doctor` (dependencies, links to missing files, missing symbols, and more) will be its own change.
- Overlaps with other designing changes (`implementation-snapshot`, `create-change-spec-metadata`, `cli-graph-index-import-diagnostics`, `fs-decouple-04-config-loader-opaque-bindings`) do not matter; they are resolved at archive.
- `skills:workflow-automation` defines the comma guidance, so it is part of the scope.
