# Tasks: support-commas-in-names

## 1. Domain rules and errors (core)

- [x] 1.1 Create the shared spec ID rules
      `packages/core/src/domain/services/spec-id-rules.ts`: `isValidWorkspaceName`, `isValidCapabilitySegment` — new file, the only copies of the two expressions
      Approach: `WORKSPACE_NAME_RE = /^[a-z][a-z0-9-]+$/`, `CAPABILITY_SEGMENT_RE = /^[a-z0-9_][a-z0-9_-]*$/`; both also return `false` when `isWindowsDeviceName(value)`; JSDoc on every export
      (Req: Workspace name rule, Capability path segment rule)
- [x] 1.2 Add `InvalidSpecIdError`
      `packages/core/src/domain/errors/invalid-spec-id-error.ts`: `InvalidSpecIdError` — new `SpecdError` subclass with code `INVALID_SPEC_ID`
      Approach: constructor `(value: string, reason: string, segment?: string)`; message `Invalid spec ID '<value>': <reason>`; expose `value`, `reason`, `segment`
      (Req: Syntax validation)
- [x] 1.3 Move `WorkspaceNotFoundError` to the domain and extend it
      `packages/core/src/domain/errors/workspace-not-found-error.ts` (new) and `packages/core/src/application/errors/workspace-not-found-error.ts`: `WorkspaceNotFoundError`
      Approach: constructor `(name: string, context: { specId?: string; known?: readonly string[] } = {})`; message keeps the prefix `Workspace '<name>' not found` and appends ` in spec ID '<id>'` and ` (known workspaces: a, b)` when provided; the application file becomes `export { WorkspaceNotFoundError } from '../../domain/errors/workspace-not-found-error.js'`
      (Req: Unknown workspace rejection)
- [x] 1.4 Add `InvalidSpecLockError`
      `packages/core/src/domain/errors/invalid-spec-lock-error.ts`: `InvalidSpecLockError` — new `SpecdError` subclass with code `INVALID_SPEC_LOCK`
      Approach: constructor `(specId: string | undefined, location: string | undefined, fieldPath: string, reason: string)`; message names spec, location, field path, reason and ends with `Correct that field in the file.`
      (Req: Invalid lock fails with a typed error)
- [x] 1.5 Add `InvalidSpecPatternError`
      `packages/core/src/domain/errors/invalid-spec-pattern-error.ts`: `InvalidSpecPatternError` — new `SpecdError` subclass with code `INVALID_SPEC_PATTERN`
      Approach: constructor `(pattern: string, reason: string)`; message `Invalid spec pattern '<pattern>': <reason>`
      (Req: Patterns and schema references)
- [x] 1.6 Rewrite `parseSpecId` as the single strict validator
      `packages/core/src/domain/services/parse-spec-id.ts`: `parseSpecId`, `ParseSpecIdOptions`, `ParsedSpecId`, `isFullyQualifiedSpecId`
      Approach: exact algorithm and code in design.md "parse-spec-id.ts (rewrite)": blank check, split on first `:`, validate explicit workspace, validate capPath segments (empty, device name, backslash ⇒ hint that `/` is the only separator, regex), optional `workspaces` (`Iterable<string | { name }>`) existence check, return qualified `specId`; `isFullyQualifiedSpecId` requires `:` and `parseSpecId` success
      (Req: Parsing rules, Single validator, Syntax validation, Unknown workspace rejection, Bare path shorthand)
- [x] 1.7 Add `parseSpecPattern`
      `packages/core/src/domain/services/parse-spec-pattern.ts`: `parseSpecPattern`, `ParsedSpecPattern`, `SpecPatternKind`
      Approach: `*` ⇒ kind `all`; split optional qualifier at first `:` (validate with `isValidWorkspaceName`); remainder `*` ⇒ `all`, ends with `/*` ⇒ `prefix` (validate prefix segments), else `exact` (validate segments); `*` elsewhere, empty remainder or empty segment ⇒ `InvalidSpecPatternError`; `workspace` = qualifier ?? `options.defaultWorkspace` ?? `null`
      (Req: Patterns and schema references)
- [x] 1.8 Tighten `SpecPath` segment validation
      `packages/core/src/domain/value-objects/spec-path.ts`: `SpecPath._validateSegments` — use the shared segment rule
      Approach: keep `.`/`..` and device-name messages; replace the `/[\\:*?"<>|]/` test with `!isValidCapabilitySegment(segment)` ⇒ `segment '<s>' contains invalid characters`; keep `parse` trimming and dropping empty segments; exported API unchanged
      (Req: Capability path segment rule)
- [x] 1.9 Export the new domain API
      `packages/core/src/domain/services/index.ts`, `packages/core/src/domain/errors/index.ts`, `packages/core/src/public.ts` (near L598): add exports of `isValidWorkspaceName`, `isValidCapabilitySegment`, `parseSpecPattern`, `isFullyQualifiedSpecId`, `ParseSpecIdOptions`, `ParsedSpecId`, `InvalidSpecIdError`, `InvalidSpecLockError`, `InvalidSpecPatternError`, `WorkspaceNotFoundError`
      Approach: named exports only; mirror in `packages/sdk/src/core-reexports.ts` (near L551)
      (Req: Single validator)
- [x] 1.10 Add the logical file path helper
      `packages/core/src/domain/services/to-logical-file-path.ts`: `toLogicalFilePath` — new file, exported from `domain/services/index.ts`, `public.ts`, and the SDK re-exports
      Approach: `toLogicalFilePath(file, platform = process.platform)` returns `file.replaceAll('\\', '/')` when `platform === 'win32'`, else `file`; JSDoc; no other alteration
      (Req: Path separators are normalized on Windows hosts)

## 2. Persisted data readers (core)

- [x] 2.1 Make the lock schema require qualified IDs and raise the typed error
      `packages/core/src/domain/services/parse-spec-lock.ts`: `specIdString`, `parseSpecLock`
      Approach: `specIdString = z.string().refine(isFullyQualifiedSpecId, { message: 'must be a fully-qualified valid spec ID (workspace:capabilityPath)' })`; delete `WORKSPACE_RE`/`CAP_SEGMENT_RE`; `parseSpecLock(content, context?: { specId: string; location: string })` catches `SyntaxError` (⇒ `fieldPath ''`, reason `is not valid JSON`) and `ZodError` (first issue `path.join('.')`, `message`) and throws `InvalidSpecLockError`
      (Req: Persistent dependencies, Invalid lock fails with a typed error)
- [x] 2.2 Pass context when reading the lock
      `packages/core/src/infrastructure/fs/spec-repository.ts`: `FsSpecRepository._readSpecLock` (L785-796)
      Approach: build `{ specId: '<workspace>:<capPath>', location: <lock path as shown to users> }` and pass it to `parseSpecLock`; do not catch the error; never write on a failed read
      (Req: Invalid lock fails with a typed error)
- [x] 2.3 Make the strict metadata schema require qualified IDs
      `packages/core/src/domain/services/parse-metadata.ts`: `specIdString` in the strict (persistence) schema
      Approach: use `isFullyQualifiedSpecId`, delete the private regexes; leave the lenient read schema untouched
      (Req: Structural validation before persistence, Persisted IDs are fully qualified)
- [x] 2.4 Validate IDs when loading a change manifest
      `packages/core/src/infrastructure/fs/manifest-change-loader.ts` (manifest decode step): validate `specIds` and `specDependsOn` keys and values
      Approach: `isFullyQualifiedSpecId`; on failure throw the existing `CorruptedManifestError` quoting the value and field path
      (Req: Persisted IDs are fully qualified)

## 3. Configuration and schema references (core)

- [x] 3.1 Rebuild `validateContextPattern` on `parseSpecPattern`
      `packages/core/src/application/ports/config-schema.ts`: `validateContextPattern`
      Approach: call `parseSpecPattern(pattern)`; map `InvalidSpecPatternError` to `ConfigValidationError(configPath, '<field>: <reason> in pattern ...')`; delete the private workspace and segment regexes
      (Req: contextIncludeSpecs and contextExcludeSpecs pattern validation, Workspace names and context patterns use the shared rules)
- [x] 3.2 Validate workspace names with the shared rule in the loader
      `packages/core/src/infrastructure/fs/config-loader.ts` (~L391): workspace-name validation
      Approach: `isValidWorkspaceName(name)` (already covers device names) ⇒ `ConfigValidationError`; keep the `root` and `default` reserved-name checks; validate every `prefix` segment with `isValidCapabilitySegment`
      (Req: Workspace names use the shared rule, Prefix semantics, Workspace identity)
- [x] 3.3 Parse patterns with `parseSpecPattern` when matching specs
      `packages/core/src/application/use-cases/_shared/spec-pattern-matching.ts`: `listMatchingSpecs` (L45)
      Approach: replace `parseSpecId(pattern, defaultWorkspace)` with `parseSpecPattern(pattern, { defaultWorkspace })`; use `.workspace ?? defaultWorkspace`, `.kind`, `.path`; keep `unknown-workspace` and `missing-spec` warnings
      (Req: Patterns and schema references, Bare path shorthand)
- [x] 3.4 Split schema references locally
      `packages/core/src/infrastructure/fs/schema-registry.ts`: `resolveRaw` (L96) and new `splitSchemaReference`
      Approach: no `:` ⇒ `{ workspace: 'default', name }`; else qualifier validated with `isValidWorkspaceName` (invalid ⇒ return `null` like an unknown workspace); `name` is not validated here
      (Req: Patterns and schema references)
- [x] 3.5 Use an explicit default workspace in dependency traversal
      `packages/core/src/application/use-cases/_shared/depends-on-traversal.ts` (L155): `parseSpecId(dep, workspace)`
      Approach: `parseSpecId(dep, { defaultWorkspace: workspace })`
      (Req: Bare path shorthand)

## 4. Use cases validate and normalize (core)

- [x] 4.1 `UpdateSpecDeps`: inject workspaces and add `clear`
      `packages/core/src/application/use-cases/update-spec-deps.ts`: `UpdateSpecDeps`, `UpdateSpecDepsInput`
      Approach: constructor `(changes, workspaces: Iterable<string | { name: string }>)`; add `clear?: boolean`; enforce exclusivity (`set` vs `add|remove|clear`, `clear` vs `add|remove`, at least one operation) with typed errors; delete `validateDepIds`
      (Req: Input contract, Mutual exclusivity of set vs add/remove, At least one operation required, Clear removes all dependencies)
- [x] 4.2 `UpdateSpecDeps`: validate and normalize IDs
      `packages/core/src/application/use-cases/update-spec-deps.ts`: `execute`
      Approach: normalize `specId`, `add`, `set` via `parseSpecId(id, { workspaces }).specId` before mutation; `remove` entries normalized only when valid; clear via `applyDependsOnMutation(..., { clear: true })`; no existence check of targets
      (Req: Spec ID validation, Set replaces all dependencies, Remove validates existence)
- [x] 4.3 Wire workspaces into the `UpdateSpecDeps` factory
      `packages/core/src/composition/use-cases/update-spec-deps.ts`: `resolveUpdateSpecDepsDeps`, `createUpdateSpecDeps`
      Approach: resolve `changes` and the configured workspace names from the resolver and pass them to the constructor
      (Req: Config-based factory delegates through resolveUpdateSpecDepsDeps)
- [x] 4.4 `UpdatePersistedSpecDeps`: validate IDs and require existing targets
      `packages/core/src/application/use-cases/update-persisted-spec-deps.ts`: `execute` (L73)
      Approach: `parseSpecId(id, { workspaces: this._specs.keys() })` for `specId`, `add`, `set`; for each `add`/`set` target `repo.get(SpecPath.parse(capPath))` must be non-null else `SpecNotFoundError`; all before `readPersistedState`/`writePersistedState`; `remove` not syntax-validated
      (Req: Spec ID validation and existing targets)
- [x] 4.5 `EditChange`: validate, normalize, and reject readOnly workspaces
      `packages/core/src/application/use-cases/edit-change.ts`: `execute` (workspaces from `_listWorkspaces.execute()` at L100)
      Approach: normalize `addSpecIds` with `parseSpecId(id, { workspaces })`; collect readOnly offenders (`ProjectWorkspace.ownership === 'readOnly'`); throw `ReadOnlyWorkspaceError` with one `Cannot add spec "<specId>" to change — workspace "<workspace>" is readOnly.` line per offender plus `ReadOnlyWorkspaces are protected...` sentence; normalize `removeSpecIds` only when valid; nothing persisted on failure
      (Req: Spec ID validation, ReadOnly workspace rejection, Input contract)
- [x] 4.6 `CreateChange`: validate, normalize, and reject readOnly workspaces
      `packages/core/src/application/use-cases/create-change.ts`: `execute`
      Approach: same flow as 4.5 over `input.specIds` using `this._listWorkspaces`; replace the `parseSpecId(specId)` at L237 with the normalized result; create nothing on failure
      (Req: Spec ID validation, ReadOnly workspace rejection, Input contract)
- [x] 4.7 `UpdateImplementationTracking`: normalize `specId`
      `packages/core/src/application/use-cases/update-implementation-tracking.ts`: `execute` (before `_changes.mutate`, and L163)
      Approach: `parseSpecId(input.specId, { workspaces }).specId` (workspaces from the injected `specRepositories` keys); leave the all-files-validated-before-mutation flow and the `Set` deduplication untouched; no trim, no split
      (Req: Input contract, File names are whole names, Multi-file mutations are all-or-nothing)
- [x] 4.7b Normalize path separators in implementation file names
      `packages/core/src/application/use-cases/update-implementation-tracking.ts`: `UpdateImplementationTracking` constructor and `execute` (the `files` computation before `_validateMutation`)
      Approach: add optional trailing constructor parameter `platform: NodeJS.Platform = process.platform`; map `input.files`/`[input.file]` through `toLogicalFilePath(entry, this._platform)` before the `Set` deduplication; composition passes nothing
      (Req: Path separators are normalized on Windows hosts, File names are whole names)
- [x] 4.8 Normalize `specId` in the persisted-state getters
      `packages/core/src/application/use-cases/get-persisted-spec-deps.ts`, `get-persisted-spec-implementation.ts`, `get-persisted-spec-optimizations.ts`, `get-persisted-spec-schema.ts`: `execute`
      Approach: replace `parseSpecId(input.specId)` with `parseSpecId(input.specId, { workspaces: <specs map keys> })`; return the qualified `specId` in results
      (Req: Spec ID validation)
- [x] 4.9 Normalize `specId` in the persisted-state updaters
      `packages/core/src/application/use-cases/update-persisted-spec-implementation.ts`, `update-persisted-spec-optimizations.ts`, `update-persisted-spec-schema.ts`: `execute`
      Approach: same replacement before workspace resolution and any I/O; the optimizations Zod input schema keeps its non-empty check and delegates ID syntax to `parseSpecId`
      (Req: Spec ID validation)
- [x] 4.10 Normalize IDs in preview, metadata generation, and validation
      `packages/core/src/application/use-cases/preview-spec.ts` (L113), `generate-spec-metadata.ts` (L102), `validate-specs.ts` (L133), `validate-artifacts.ts` (L270)
      Approach: `parseSpecId(id, { workspaces })`; `PreviewSpec` checks the normalized ID against `change.specIds`; keep `WorkspaceNotFoundError` for unknown workspaces
      (Req: Spec ID validation, Single spec validation mode, Spec resolution)
- [x] 4.11 Update the remaining boundary and internal call sites
      `compile-context.ts`, `get-artifact-instruction.ts`, `initialize-persisted-spec-state.ts`, `materialize-spec-metadata.ts`, `archive-change.ts`, `refresh-implementation-tracking.ts`, `resolve-initial-persisted-depends-on.ts`, `_shared/load-persisted-spec-schema.ts`, `_shared/load-persisted-spec-depends-on.ts`, `_shared/spec-reference-resolver.ts`, `domain/entities/change.ts`, `domain/services/artifact-filename.ts`, `infrastructure/fs/change-repository.ts`, `infrastructure/fs/archive-batch-snapshot.ts`, `composition/composition-resolver.ts`, `composition/extractor-transforms/resolve-spec-path.ts`
      Approach: follow design.md categories 1–2: boundary inputs pass `{ workspaces }`, internal persisted IDs call `parseSpecId(id)` unchanged; compile after each file and fix the `capPath`/`specId` destructuring if needed
      (Req: Use cases validate and normalize, Normalization)

## 5. CLI: remove spec ID logic and fix name handling

- [x] 5.1 Add the confirmation helper
      `packages/cli/src/helpers/confirm.ts`: `confirmOrExit`, `ConfirmOptions` — new file
      Approach: `force` ⇒ `true`; non-interactive and not forced ⇒ `cliError('<action> requires confirmation; pass --force to skip it', format)`; interactive ⇒ injected `prompt` (default wraps `@clack/prompts` `confirm`, `isCancel` ⇒ `false`)
      (Req: Clear confirmation)
- [x] 5.2 `changes deps`: add `--clear` and `--force`
      `packages/cli/src/commands/change/deps.ts`: `registerChangeDeps`
      Approach: new options; `hasOp` includes `clear`; fast-fail combinations and missing `<specId>`; `confirmOrExit` then `updateSpecDeps.execute({ name, specId, clear: true })`; declined ⇒ print `cancelled`, return (exit 0); update the help text and the JSON/TOON schema comment
      (Req: Command signature, Clear confirmation, Error cases)
- [x] 5.3 `specs deps clear`: add confirmation and `--force`
      `packages/cli/src/commands/spec/deps.ts`: `clear` subcommand, helper at L16
      Approach: `.option('--force', ...)`; `confirmOrExit` before `updatePersistedDeps.execute({ specId, clear: true })`; replace `parseSpecId(specPath, config).specId` with the raw string in every subcommand
      (Req: Clear subcommand, Raw spec IDs, Error mapping)
- [x] 5.4 Stop splitting `--file` and forward raw values
      `packages/cli/src/commands/change/implementation.ts`: expansion at L290
      Approach: delete `flatMap((f) => f.split(',').map((p) => p.trim()))`; `files = input.files ?? []`; forward `--spec` unchanged; text output of tracked files one name per line
      (Req: Resolve subcommand, Unresolve subcommand, Ignore subcommand, Raw values and unambiguous listings)
- [x] 5.5 Stop splitting `--exclude-path`
      `packages/cli/src/commands/graph/index-graph.ts` (L75)
      Approach: `.argParser((val, prev: string[]) => (prev ?? []).concat(val))`
      (Req: Command signature)
- [x] 5.6 `change create`/`change edit`: raw IDs, no ownership logic
      `packages/cli/src/commands/change/create.ts` (L47-60), `packages/cli/src/commands/change/edit.ts` (L72-92)
      Approach: delete the `parseSpecId` calls and the `config.workspaces.find(...)` ownership blocks; pass raw `opts.spec` / `opts.addSpec` / `opts.removeSpec`; rely on `handleError` for `ReadOnlyWorkspaceError`, `InvalidSpecIdError`, `WorkspaceNotFoundError` (message printed as is, multi-line)
      (Req: Command signature, Workspace resolution, ReadOnly workspace rejection, Error cases)
- [x] 5.7 Remove the CLI spec ID helper from the spec commands
      `packages/cli/src/commands/spec/{schema,init,implementation,context,generate-metadata,outline,validate,optimizations,metadata,show}.ts` and `commands/change/validate.ts` (L367)
      Approach: pass the raw ID to the use case; where the command needs workspace/path (`show`, `context`, `outline`, `validate`, `change validate`), use the fully-qualified `specId` returned by the use case (extend the use case result with `specId` where it is missing)
      (Req: Use cases validate and normalize)
- [x] 5.8 Delete the CLI helper
      `packages/cli/src/helpers/spec-path.ts`: delete the file and its imports; delete or rewrite `packages/cli/test/helpers/spec-path.spec.ts`
      Approach: `grep -rn "helpers/spec-path" packages/cli` must return nothing; build the CLI
      (Req: Use cases validate and normalize)

## 6. Skills

- [x] 6.1 Replace comma lists in the archive skill
      `packages/skills/templates/skills/specd-archive/SKILL.md.tpl` lines 112 and 117
      Approach: `--file <path1> --file <path2> ...`
      (Req: Implementation traceability policy)
- [x] 6.2 Replace comma lists in the implement skill
      `packages/skills/templates/skills/specd-implement/SKILL.md.tpl` lines 185 and 197
      Approach: same replacement; keep the trailing comments
      (Req: Implementation traceability policy)
- [x] 6.3 Sweep the rest of the templates
      `packages/skills/templates/**`
      Approach: `grep -rnE "\-\-file[ =][^ ]*,|<path1>," packages/skills/templates` must return nothing; fix any other hit the same way
      (Req: Implementation traceability policy)

## 7. Unit tests (core)

- [x] 7.1 Test the spec ID rules
      `packages/core/test/domain/services/spec-id-rules.spec.ts` (new): workspace table (`ab`, `plugin-agent-claude`, `con-foo` valid; `a`, `Core`, `1core`, `my_ws`, `nul` invalid) and segment table (`api-v2`, `_global`, `2fa` valid; `Login`, `a b`, `a,b`, `v1.2`, `-bad`, `nul` invalid)
      Approach: `it.each` tables
      (Req: Workspace name rule, Capability path segment rule)
- [x] 7.2 Rewrite the `parseSpecId` tests
      `packages/core/test/domain/services/parse-spec-id.spec.ts`
      Approach: nested path, bare ⇒ default, `defaultWorkspace`, every invalid input from design.md (including the backslash cases `auth\login`, `ws:auth\login`, `ws:section\other\id`, same result on every OS), `workspaces` as array/`Set`/`Map.keys()`/objects, missing `default`, message quotes the value, `isFullyQualifiedSpecId`
      (Req: Parsing rules, Syntax validation, Single validator)
- [x] 7.3 Test `parseSpecPattern`
      `packages/core/test/domain/services/parse-spec-pattern.spec.ts` (new)
      Approach: `*`, `core:*`, `_global/*`, `core:team/*`, exact; misplaced `*`, one-letter qualifier, uppercase segment, qualifier-less with `defaultWorkspace`
      (Req: Patterns and schema references)
- [x] 7.4 Test `SpecPath` and the readers
      `packages/core/test/domain/value-objects/spec-path.spec.ts`, `packages/core/test/domain/services/parse-spec-lock.spec.ts`, `parse-metadata.spec.ts`
      Approach: `Login` rejected, `2fa` accepted; lock `[""]`, bare, malformed, invalid JSON ⇒ `InvalidSpecLockError` with `dependsOn.0` and never `ZodError`; strict metadata rejects bare, lenient read still accepts
      (Req: Capability path segment rule, Invalid lock fails with a typed error, Persisted IDs are fully qualified)
- [x] 7.5 Test `UpdateSpecDeps`
      `packages/core/test/application/use-cases/update-spec-deps.spec.ts`
      Approach: clear; exclusivity matrix; `set ['']`, `add [' ']`, malformed, unknown workspace; non-existent target accepted; bare stored qualified; invalid among valid ⇒ nothing stored; `remove` of an invalid stored value
      (Req: Input contract, Clear removes all dependencies, Spec ID validation)
- [x] 7.6 Test `UpdatePersistedSpecDeps`
      `packages/core/test/application/use-cases/update-persisted-spec-deps.spec.ts`
      Approach: invalid ID before any I/O, missing target ⇒ `SpecNotFoundError`, bare qualified, `remove` of invalid stored value, `InvalidSpecLockError` propagates, `clear`
      (Req: Spec ID validation and existing targets)
- [x] 7.7 Test `EditChange` and `CreateChange`
      `packages/core/test/application/use-cases/edit-change.spec.ts`, `create-change.spec.ts`
      Approach: invalid, comma, unknown workspace, bare normalization, partial invalid, non-existent spec accepted, readOnly (exact line format, one line per spec, nothing applied), removal skips ownership, removal normalization
      (Req: Spec ID validation, ReadOnly workspace rejection)
- [x] 7.8 Test `UpdateImplementationTracking`
      `packages/core/test/application/use-cases/update-implementation-tracking.spec.ts`
      Approach: comma name (`SpecD — Análisis de identidad LogicalSymbol, dependencias y casos de uso.md`) ignored exactly; `a,b.md` missing quoted whole; leading/trailing spaces; quote/backslash/non-ASCII; SDK-style `files`; Windows platform: `packages\core\x.ts` matches tracked `packages/core/x.ts` and is stored with forward slashes, Linux platform keeps `back\slash.md`, Windows comma name keeps its comma, batch normalized per entry; four-file batch with missing fourth leaves three `open`; invalid and bare `specId`
      (Req: File names are whole names, Multi-file mutations are all-or-nothing, Input contract)
- [x] 7.9 Test the persisted-state use cases and metadata/validation/preview
      `packages/core/test/application/use-cases/{get-persisted-spec-*,update-persisted-spec-*,preview-spec,generate-spec-metadata,validate-specs}.spec.ts`
      Approach: invalid `specId` rejected before any repository call; bare resolved to `default`; unknown workspace; qualified accepted
      (Req: Spec ID validation, Single spec validation mode, Spec resolution)
- [x] 7.10 Test patterns, configuration, schema references, lock and manifest reads
      pattern-matching and config-schema specs under `packages/core/test/application/`, `packages/core/test/infrastructure/fs/{config-loader,schema-registry,spec-repository,manifest-change-loader}.spec.ts`
      Approach: leading-digit segment accepted, one-letter qualifier and `Team` prefix rejected, unknown-workspace warning kept, `#billing:x`/`#x` split, real temp-fs lock with `dependsOn: [""]` ⇒ `InvalidSpecLockError` and file unchanged, manifest `specIds: [""]` ⇒ `CorruptedManifestError`
      (Req: contextIncludeSpecs and contextExcludeSpecs pattern validation, Workspace names use the shared rule, Patterns and schema references, Persisted IDs are fully qualified)
- [x] 7.11 Add repository guard tests
      `packages/core/test/` (new `spec-id-guards.spec.ts`)
      Approach: parse every `spec-lock.json` under `specs/` and fail on invalid entries; assert the workspace and segment expressions appear only in `spec-id-rules.ts`
      (Req: Single validator, Persisted IDs are fully qualified)

## 8. Unit tests (cli, skills)

- [x] 8.1 Test `changes deps`
      `packages/cli/test/commands/change/deps.spec.ts`
      Approach: confirm matrix (accept, decline ⇒ exit 0 + `cancelled`, `--force`, no TTY ⇒ exit 1); conflicts; no `<specId>`; `--set ""`; `--set "core:a,b"` is one ID; raw forwarding
      (Req: Clear confirmation, Error cases, Command signature)
- [x] 8.2 Test `specs deps`
      `packages/cli/test/commands/spec/deps.spec.ts`
      Approach: `clear` confirmation matrix; `--dep ""` rejected; missing target; invalid lock ⇒ exit 1 with message and no stack
      (Req: Clear subcommand, Raw spec IDs, Error mapping)
- [x] 8.3 Test `changes implementation`
      `packages/cli/test/commands/change/implementation.spec.ts`
      Approach: repeated and variadic `--file`; comma-named file ignored and resolved; `f3.ts,f4.ts` fails with the whole name; spec ID forwarded raw; list text one name per line, JSON arrays
      (Req: Resolve subcommand, Unresolve subcommand, Ignore subcommand, Raw values and unambiguous listings)
- [x] 8.4 Test `change create`/`change edit`/`graph index`
      `packages/cli/test/commands/change/create.spec.ts`, `edit.spec.ts`, `graph/index-graph` test
      Approach: raw forwarding, comma and invalid IDs, existing readOnly scenarios via error mapping, no import of `helpers/spec-path`; `--exclude-path '{a,b}/**'` stays one pattern
      (Req: Command signature, ReadOnly workspace rejection, Error cases)
- [x] 8.5 Test the skills templates
      `packages/skills/test` (existing template tests)
      Approach: no template contains a comma-joined `--file` list
      (Req: Implementation traceability policy)

## 9. Documentation

- [x] 9.1 Update the CLI reference
      `docs/cli/cli-reference.md`: `--exclude-path` row (~L1279: remove "comma-separated values"), `changes deps` section (`--clear`, `--force`, raw IDs), `changes implementation` section (repeated or listed `--file`, no commas), `specs deps clear` (`--force`), `changes create`/`edit` (raw IDs, errors)
      Approach: keep the option tables consistent with the command help; satisfy `packages/cli/test/documentation-coverage.spec.ts`
      (Req: Command signature)
- [x] 9.2 Document the spec ID format and error codes
      `docs/` pages that describe spec IDs, workspaces, or the errors guide (`packages/guide` sources if they list error codes): add the canonical grammar, `INVALID_SPEC_ID`, `INVALID_SPEC_PATTERN`, `INVALID_SPEC_LOCK`, and the two-character workspace rule; mention that a bare ID means `default` at input boundaries
      Approach: `specd guide search "spec id"` and `grep -rn "workspace names must" docs packages/guide` to locate pages; the generated `guides.ts` diff is expected noise
      (Req: Canonical format, Workspace name rule)

## 10. Verification

- [x] 10.1 Build, lint, and test everything
      repository root
      Approach: `pnpm -r build && pnpm lint && pnpm -r test`; fix every failure caused by stricter validation
      (Req: all)
- [x] 10.2 Run the manual end-to-end checks from design.md
      `node packages/cli/dist/index.js ...`
      Approach: execute scenarios 1–7 of the design's manual list and compare with the expected outputs (empty `--set`, `--clear` with and without `--force`, comma file, invalid lock, invalid `--add-spec`, bare `specs show`, full `specs validate`)
      (Req: all)
- [x] 10.3 Rebuild and reinstall skills
      repository root
      Approach: rebuild `@specd/skills`, regenerate installed skills (`.claude/skills`), and confirm they contain no comma-joined `--file` lists
      (Req: Implementation traceability policy)

## 11. Verification findings fixes

- [x] 11.1 Lenient `dependsOn` read
      `packages/core/src/domain/services/parse-spec-lock.ts`, `application/ports/spec-repository.ts`, `infrastructure/fs/spec-repository.ts`
      Approach: add `options.lenientDependsOn` to `parseSpecLock` and `readPersistedState(spec, options?)`; `writePersistedState` revision check reads leniently
      (Req: core:spec-lock Invalid lock fails with a typed error)
- [x] 11.2 Repairable dependency mutations
      `packages/core/src/application/use-cases/update-persisted-spec-deps.ts`
      Approach: normalize valid `remove` entries; lenient read for `remove`/`set`/`clear`; throw `InvalidSpecLockError` if invalid entries remain after the mutation; `add` stays strict
      (Req: core:update-persisted-spec-deps Spec ID validation and existing targets)
- [x] 11.3 CLI repair hint for invalid dependsOn
      `packages/cli/src/commands/spec/deps.ts` and shared error handler
      Approach: on `InvalidSpecLockError` with field path starting `dependsOn`, print a hint naming `specd specs deps remove|set|clear`
      (Req: cli:spec-deps Error mapping)
- [x] 11.4 Empty `specId` in optimizations update
      `packages/core/src/application/use-cases/update-persisted-spec-optimizations.ts:41`
      Approach: drop `.min(1)` from the zod `specId` so `parseSpecId` throws `InvalidSpecIdError`
      (Req: core:update-persisted-spec-optimizations)
- [x] 11.5 Preview validates the ID first
      `packages/core/src/application/use-cases/preview-spec.ts`
      Approach: call `parseSpecId` before loading the change and schema
      (Req: core:preview-spec)
- [x] 11.6 Skill templates: no comma-separated prose
      `packages/skills/templates/skills/` (specd-implement, specd-archive)
      Approach: remove "comma-separated" wording for resolve/ignore; extend the template test to match the prose, not only `--file x,y`
      (Req: skills:workflow-automation)
- [x] 11.7 Cheap CLI output fixes
      `packages/cli/src/commands/change/implementation.ts`, `spec/deps.ts`, `change/deps.ts`
      Approach: list symbols/candidates one per line; non-TTY clear error names `--clear`/`--force`; `cancelled` honors `--format json`
      (Req: cli:change-implementation, cli:change-deps, cli:spec-deps)
- [x] 11.8 Add the missing tests from the compliance audit
      `packages/core/test`, `packages/cli/test`
      Approach: cover each gap listed in `reports/20261103-211034/*.md` (empty/bad ID quoting, comma IDs on update-spec-deps add/set/remove, edit-change unscaffold and empty ID, preview-spec unknown workspace/order, spec-lock valid+invalid entry, graph-index exclude-path forms, change-deps clear combinations, change-implementation comma names, spec-deps raw IDs)
      (Req: all)
- [x] 11.9 Rebuild, lint, test, rebuild skills
      repository root
      Approach: `pnpm build && pnpm lint && pnpm test`; regenerate installed skills
      (Req: all)

## 12. Second compliance-audit fixes

- [x] 12.1 Up-front guards in `UpdatePersistedSpecDeps`
      `packages/core/src/application/use-cases/update-persisted-spec-deps.ts`
      Approach: mutual exclusivity and minimum-operation checks at the top of `execute()`, before any repository read; typed error instead of generic `Error` in `_createMissingState`
      (Req: core:update-persisted-spec-deps Mutual exclusivity and minimum operation)
- [x] 12.2 Single repair instruction for invalid locks
      `packages/core/src/domain/errors/invalid-spec-lock-error.ts`, `packages/cli/src/handle-error.ts`
      Approach: drop "Correct that field in the file." from the core message; CLI hint names `specd specs deps remove`, `specd specs deps set`, `specd specs deps clear` only
      (Req: core:spec-lock Invalid lock fails with a typed error; cli:spec-deps Error mapping)
- [x] 12.3 `changes deps` display mode accepts bare IDs
      `packages/cli/src/commands/change/deps.ts`
      Approach: normalize the positional spec ID with the core parser before the membership check
      (Req: cli:change-deps Command signature)
- [x] 12.4 Skill templates: `ignore` keeps confirmed links
      `packages/skills/templates/skills/` (specd-archive, specd-implement)
      Approach: remove the claim that files with confirmed links cannot be ignored; update template tests
      (Req: skills:workflow-automation)
- [x] 12.5 Typed errors and cleanup
      `get-persisted-spec-optimizations.ts`, six use cases with `WorkspaceNotFoundError` branch after `parseSpecId`, persisted-state use-case JSDoc, `create-change.ts`, `edit-change.ts`, `update-implementation-tracking.ts`
      Approach: replace generic `Error`; remove unreachable branches; add `@throws InvalidSpecIdError`; dedupe after normalization; actor resolved after add-ID validation; deterministic first-failure order
      (Req: core:create-change, core:edit-change, core:update-implementation-tracking)
- [x] 12.6 Strict metadata schema for `implementation` specIds
      `packages/core/src/domain/` spec metadata schema
      Approach: require fully-qualified IDs for `implementation[].specId`
      (Req: core:spec-metadata)
- [x] 12.7 Missing tests from the second audit
      `packages/core/test`, `packages/cli/test`, `packages/skills/test`
      Approach: cover gaps in `reports/20261104-075417/*.md` (persisted-deps guards with I/O spies and clear on missing state, edit-change empty ID and bare-ID removal, error messages quoting `Bad Id`/`auth/a,b`, persist-metadata bare `dependsOn`, handle-error `InvalidSpecLockError` hint, resolve/unresolve comma names, `--exclude-path` after one option, spec-deps comma `--dep`, confirm helper, change-deps blank `--add`)
      (Req: all)
- [x] 12.8 Rebuild, lint, test, regenerate skills
      repository root
      Approach: `pnpm build && pnpm lint && pnpm test`
      (Req: all)

## 13. Audit hardening (third compliance audit 20261104-103701): core code

Follow-up group added after the third verification audit. Groups 1–12 are the original implementation history and stay as they are.

- [x] 13.1 Create the `GetChangeSpecDeps` use case
      `packages/core/src/application/use-cases/get-change-spec-deps.ts`: `GetChangeSpecDeps`, `GetChangeSpecDepsInput`, `GetChangeSpecDepsResult` — new file
      Approach: constructor `(getStatus: GetStatus, workspaces: Iterable<string | { readonly name: string }>)`; `execute` runs `parseSpecId(input.specId, { workspaces })` first, then `getStatus.execute({ name })`, reads `status.change ?? status.draftView` (guard both `undefined` and `null`), throws `InvalidInputError("spec '<id>' is not in the scope of change '<name>'")` when absent from `specIds`, returns `{ name, specId, dependsOn: [...(status.specDependsOn[specId] ?? [])] }`; full JSDoc with `@throws` for `InvalidSpecIdError`, `WorkspaceNotFoundError`, `ChangeNotFoundError`, `InvalidInputError`
      (Req: Output shows the normalized spec ID; Adapters do not normalize)
- [x] 13.2 Add the composition factory for `GetChangeSpecDeps`
      `packages/core/src/composition/use-cases/get-change-spec-deps.ts`: `GetChangeSpecDepsDeps`, `resolveGetChangeSpecDepsDeps`, `createGetChangeSpecDeps` — new file mirroring `composition/use-cases/update-spec-deps.ts`
      Approach: `GetChangeSpecDepsDeps { getStatus: GetStatus; workspaces }`; `resolveGetChangeSpecDepsDeps(resolver)` builds `getStatus` from the resolver and `workspaces` from `[...resolver.getSpecRepositories().keys()]`; overloaded `createGetChangeSpecDeps(deps | config, options?)` delegates config form through the resolver
      (Req: Output shows the normalized spec ID)
- [x] 13.3 Expose `getSpecDeps` on the kernel and export the new symbols
      `packages/core/src/composition/kernel.ts`: `kernel.changes` — add `getSpecDeps: GetChangeSpecDeps`; `packages/core/src/composition/use-cases/index.ts`, `packages/core/src/application/use-cases/index.ts`, `packages/core/src/public.ts`, `packages/sdk/src/core-reexports.ts` — export `GetChangeSpecDeps`, its input/result types, `createGetChangeSpecDeps`
      Approach: build it from the `getStatus` instance already in the kernel and the workspace names; no other kernel member changes
      (Req: Output shows the normalized spec ID)
- [x] 13.4 Add `initialized` to `UpdatePersistedSpecDepsResult`
      `packages/core/src/application/use-cases/update-persisted-spec-deps.ts`: `UpdatePersistedSpecDepsResult`, `execute`, `_createMissingState` — new readonly `initialized: boolean` with JSDoc
      Approach: existing-state return `{ specId, dependsOn: nextDependsOn, created: false, initialized: true }`; `_createMissingState` no-op return `{ specId, dependsOn: [], created: false, initialized: false }`; created return `{ …, created: true, initialized: true }`
      (Req: Mutation output reflects the real initialized state)
- [x] 13.5 Apply `remove` to the derived base when creating missing state (D4)
      `packages/core/src/application/use-cases/update-persisted-spec-deps.ts`: `_createMissingState` — pass `remove` as well as `add` to `applyDependsOnMutation`
      Approach: `applyDependsOnMutation(initialDependsOn, { ...(input.remove !== undefined ? { remove: input.remove } : {}), ...(input.add !== undefined ? { add: input.add } : {}) })`; `remove` alone and `add: []` still return the no-op without `writePersistedState`
      (Req: Persisted state created from derived base)
- [x] 13.6 Remove the unreachable `WorkspaceNotFoundError` branches
      `packages/core/src/application/use-cases/update-persisted-spec-deps.ts` (`targetRepo === undefined` branch) and `packages/core/src/application/use-cases/get-persisted-spec-schema.ts` (`repo === undefined` branch): delete the branch and the now unused import (audit D10)
      Approach: `parseSpecId` with `workspaces` already throws `WorkspaceNotFoundError`; use `this.specRepositories.get(workspace)!` like the sibling use cases
      (Req: Use cases validate and normalize)
- [x] 13.7 Parse every declared artifact on schema reassignment (M4)
      `packages/core/src/application/use-cases/update-persisted-spec-schema.ts`: add private `_loadParsedArtifacts(spec, repo, schema)`; `_extractDependsOn` receives the loaded artifacts
      Approach: loop `schema.artifacts()` with `scope === 'spec'`, resolve the parser by `artifactType.format ?? inferFormat(filename) ?? 'plaintext'`, skip when no parser or artifact is `null`, wrap non-`SpecdError` failures in `ArtifactParseError(format, message)`; call it after the same-schema no-op return and before the dependency comparison; `_extractDependsOn` still returns `undefined` when the target schema has no dependency extraction
      (Req: Artifacts parse under the target schema)
- [x] 13.8 Confine implementation files with `path.relative` (M5)
      `packages/core/src/application/use-cases/update-persisted-spec-implementation.ts`: `_normalizeFile` returns `{ canonical, relative }`
      Approach: qualifier only when `colon > 0 && isValidWorkspaceName(file.slice(0, colon))` (so `C:\x` is not a qualifier); foreign qualifier ⇒ `ImplementationWorkspaceBoundaryError`; `path.relative(codeRoot, path.resolve(codeRoot, rawPath))` empty, `..`, starting with `..` + separator, or absolute ⇒ `ImplementationWorkspaceBoundaryError`; return forward-slash `relative` and `${workspace}:${relative}`
      (Req: Confinement to the workspace code root)
- [x] 13.9 Run the file existence check after confinement and before the state read (D9)
      `packages/core/src/application/use-cases/update-persisted-spec-implementation.ts`: `execute` — order `parseSpecId` ⇒ read-only guard ⇒ `SpecNotFoundError` ⇒ `_normalizeFile` ⇒ `add` existence check ⇒ `readPersistedState` ⇒ mutate
      Approach: the existence check uses `path.resolve(codeRoot, relative)` from `_normalizeFile` instead of re-splitting the canonical string; `ImplementationFileNotFoundError(input.file)` keeps quoting the original value
      (Req: Confinement to the workspace code root)
- [x] 13.10 Add `ReadOnlyWorkspaceError.forSpec`
      `packages/core/src/domain/errors/read-only-workspace-error.ts`: `ReadOnlyWorkspaceError` — new static factory (audit D12)
      Approach: `static forSpec(specId: string, workspace: string)` returns `new ReadOnlyWorkspaceError(\`Cannot modify spec "${specId}" — workspace "${workspace}" is readOnly.\`)`; JSDoc; no workaround text
      (Req: ReadOnly workspace rejection)
- [x] 13.11 Use `forSpec` in the persisted-state use cases
      `packages/core/src/application/use-cases/update-persisted-spec-deps.ts:128`, `update-persisted-spec-implementation.ts:90`, `update-persisted-spec-optimizations.ts:174`, `update-persisted-spec-schema.ts:82`, `initialize-persisted-spec-state.ts:168`
      Approach: replace `new ReadOnlyWorkspaceError(workspace)` with `ReadOnlyWorkspaceError.forSpec(specId, workspace)`; `EditChange`, `CreateChange`, `ArchiveChange` and `FsSpecRepository` keep their own messages
      (Req: ReadOnly workspace rejection)
- [x] 13.12 Quote the original file value on Windows in `UpdateImplementationTracking` (L1)
      `packages/core/src/application/use-cases/update-implementation-tracking.ts`: `execute` — keep `{ original, logical }` per entry
      Approach: build `entries` from `[...(file ? [file] : []), ...(files ?? [])]`, convert with `toLogicalFilePath(original, platform)`, collapse duplicates by `logical` (first original wins); lookups and storage use `logical`; every `ImplementationFileNotFoundError` is created with `original`
      (Req: File names are whole names; Path separators are normalized on Windows hosts)
- [x] 13.13 Combine `file` and `files` instead of ignoring `file`
      `packages/core/src/application/use-cases/update-implementation-tracking.ts`: `execute` — effective list is `file` followed by `files`
      Approach: same snippet as 13.12; neither input is dropped
      (Req: File names are whole names)
- [x] 13.14 Reject `add`/`remove` without `specId` with `InvalidInputError`
      `packages/core/src/application/use-cases/update-implementation-tracking.ts`: `execute`, `_validateMutation`, `_applyAdd`, `_applyRemove`
      Approach: one guard at the top of `execute` before `mutate`: `throw new InvalidInputError('specId is required for action "<action>"')`; delete the three `ChangeNotFoundError(change.name)` throws
      (Req: Input contract)
- [x] 13.15 Make `specRepositories` mandatory in `UpdateImplementationTracking`
      `packages/core/src/application/use-cases/update-implementation-tracking.ts`: constructor — `specRepositories: ReadonlyMap<string, SpecRepository>` required, placed before the optional `platform`; delete the `parseSpecId(input.specId)` branch without workspaces and the `!== undefined` guard in `_validateMutation`
      Approach: `specId` validated with workspaces whenever supplied for every action except `start`; first failing entry in input order is reported; `composition/use-cases/update-implementation-tracking.ts` already passes the map
      (Req: Input contract)
- [x] 13.16 Collapse duplicate removals in `EditChange`
      `packages/core/src/application/use-cases/edit-change.ts`: `execute` — dedupe after normalization
      Approach: `const removeSpecIds = removeNormalized === undefined ? undefined : [...new Set(removeNormalized)]` so `a` and `default:a` remove once
      (Req: Removal of absent spec throws)
- [x] 13.17 Resolve the actor lazily in `EditChange`
      `packages/core/src/application/use-cases/edit-change.ts`: `execute` — replace the eager `await this._actor.identity()`
      Approach: `let actor` plus `resolveActor = async () => (actor ??= await this._actor.identity())`, called only inside the mutation callback in the branches that call `updateSpecIds`, `setDescription` or the policy update; an idempotent add never resolves the actor
      (Req: Approval invalidation on effective change)
- [x] 13.18 Document `invalidationPolicy` on `EditChangeInput` and add `@throws` to `EditChange`/`CreateChange`
      `packages/core/src/application/use-cases/edit-change.ts`, `create-change.ts`: TSDoc only
      Approach: list `invalidationPolicy` in the input docs; `CreateChange.execute` `@throws InvalidSpecIdError`, `WorkspaceNotFoundError`, `ReadOnlyWorkspaceError`; runtime unchanged (duplicate-name check first and ID dedupe already work)
      (Req: Input contract; Spec ID validation)
- [x] 13.19 Derive archive index workspaces through `parseSpecId`
      `packages/core/src/domain/archived-change-index-entry.ts`: `workspacesFromSpecIds`
      Approach: `for (const id of specIds) set.add(parseSpecId(id).workspace)`; return `[...set]`; JSDoc `@throws {InvalidSpecIdError}`; a bare ID yields `default`
      (Req: Workspaces derived from specIds)
- [x] 13.20 Update optimization result type and TSDoc (L7, L8)
      `packages/core/src/application/use-cases/get-persisted-spec-optimizations.ts`: `PersistedOptimizationFieldResult` — `value?: T` absent when `freshness` is `'missing'`; `update-persisted-spec-optimizations.ts` TSDoc states shape errors ⇒ `InvalidInputError`, `specId` content ⇒ `InvalidSpecIdError`
      Approach: no behavior change; the Zod schema keeps `specId: z.string()` without `.min(1)`
      (Req: Input contract; Missing field shape)
- [x] 13.21 Add `@throws` for spec ID errors to preview, generate and validate use cases
      `packages/core/src/application/use-cases/preview-spec.ts`, `generate-spec-metadata.ts`, `validate-specs.ts`: `execute` TSDoc
      Approach: add `@throws {InvalidSpecIdError}` and `@throws {WorkspaceNotFoundError}`; runtime unchanged
      (Req: Input validation)
- [x] 13.22 Document the lenient reads on the `SpecRepository` port
      `packages/core/src/application/ports/spec-repository.ts`: `readPersistedState` and `writePersistedState` JSDoc
      Approach: state that `{ lenientDependsOn?: boolean }` tolerates invalid `dependsOn` entries only, every other field stays strict and the file is never rewritten by a read, and that `writePersistedState` reads the existing lock leniently because it only needs the revision hash
      (Req: Lenient dependsOn read; core:spec-repository-port)
- [x] 13.23 Align the `strictSpecMetadataSchema` wording with the spec (L12)
      `packages/core/src/domain/services/parse-metadata.ts`: TSDoc of `strictSpecMetadataSchema` only
      Approach: describe keywords regex, sha256 content hashes, optional scenarios, `context`, `generatedBy`, `implementation` entries and passthrough exactly as in the amended `core:spec-metadata`; no code change
      (Req: core:spec-metadata schema requirement)

## 14. Audit hardening: CLI code

- [x] 14.1 Route the `changes deps` display branch through `GetChangeSpecDeps` (M1)
      `packages/cli/src/commands/change/deps.ts`: display branch of the action
      Approach: replace `listWorkspaces` + `parseSpecId` + status lookup with `const shown = await kernel.changes.getSpecDeps.execute({ name, specId })`; render `shown.specId` and `shown.dependsOn` in text, JSON and TOON; delete the `parseSpecId` import from `@specd/sdk`; the listing branch (no `<specId>`) keeps `kernel.changes.status.execute`
      (Req: Output shows the normalized spec ID)
- [x] 14.2 Validate workspace ids in `project init` with `isValidWorkspaceName` (M2)
      `packages/cli/src/commands/project/init.ts`: wizard `validate` and non-interactive `--workspace` check (~L188)
      Approach: import `isValidWorkspaceName` from `@specd/sdk`; `invalidWorkspaceMessage(value)` = `Invalid workspace id '<value>': use two or more of a-z, 0-9 and "-", starting with a letter, and not a Windows device name`; wizard `validate` uses it; non-interactive `cliError(...)` before anything is written; never trim or lowercase; remove the local regex
      (Req: Workspace id validation)
- [x] 14.3 Render the real `initialized` flag in `specs deps`
      `packages/cli/src/commands/spec/deps.ts`: `add`, `remove`, `set`, `clear` actions and `renderDepsResult`
      Approach: replace `renderDepsResult({ ...result, initialized: true }, fmt)` with `renderDepsResult(result, fmt)`; for `remove` pass a not-initialized suffix so text prints `spec <specId> is not initialized — nothing was removed`; other subcommands keep `spec <specId> is not initialized — run specs init first`; JSON/TOON always carry `initialized`
      (Req: Mutation output reflects the real initialized state)
- [x] 14.4 Fix the `specs deps clear` non-interactive message
      `packages/cli/src/commands/spec/deps.ts`: `confirmOrExit` options for `clear`
      Approach: `nonInteractiveMessage: 'clearing requires confirmation; pass --force to skip it'` (no `--clear` option exists on this command); `changes deps --clear` keeps `--clear requires confirmation; pass --force to skip it`
      (Req: Clear confirmation)
- [x] 14.5 Remove the `--force` parenthetical from the lock repair hint
      `packages/cli/src/handle-error.ts` (`InvalidSpecLockError` branch, lines ~196-209)
      Approach: when `fieldPath === 'dependsOn'` or starts with `dependsOn.`, append exactly `\nRepair with: specd specs deps remove <spec-id>, specd specs deps set <spec-id>, or specd specs deps clear <spec-id>`; append nothing else and never mention `--force`
      (Req: Invalid lock fails with a typed error)
- [x] 14.6 Move the `change edit` usage check before context resolution
      `packages/cli/src/commands/change/edit.ts` (~L55-66)
      Approach: compute `hasChanges` and `cliError('at least one of --add-spec, --remove-spec, --description, or --invalidation-policy must be provided', opts.format)` before `resolveCliContext`, so a missing or broken config still yields the usage error
      (Req: Command signature)
- [x] 14.7 Remove the private `collectString` duplicate
      `packages/cli/src/commands/change/implementation.ts`: `collectString` — delete and import `collect` from `packages/cli/src/helpers/collect.ts` for `--symbol`
      Approach: behavior identical; the `--help` output lists all eight subcommands (`list`, `add`, `resolve`, `unresolve`, `ignore`, `remove`, `review`, `start`)
      (Req: Command signature)

## 15. Audit hardening: core tests

- [x] 15.1 Add the `GetChangeSpecDeps` unit tests
      `packages/core/test/application/use-cases/get-change-spec-deps.spec.ts` (new)
      Approach: bare `auth/login` ⇒ `default:auth/login` with its deps; `''` and `Bad Id` ⇒ `InvalidSpecIdError` quoting the value with no `GetStatus` call; unknown workspace ⇒ `WorkspaceNotFoundError`; spec outside `specIds` ⇒ `InvalidInputError`; unknown change ⇒ `ChangeNotFoundError`; draft change works; empty deps ⇒ `[]` (T-GCSD-1)
      (Req: Output shows the normalized spec ID)
- [x] 15.2 Add the `GetChangeSpecDeps` factory test
      `packages/core/test/composition/use-cases/get-change-spec-deps.spec.ts` (new)
      Approach: `resolveGetChangeSpecDepsDeps` returns `getStatus` and workspace names; `createGetChangeSpecDeps(config)` builds the use case (T-GCSD-1)
      (Req: Output shows the normalized spec ID)
- [x] 15.3 Test `ReadOnlyWorkspaceError.forSpec`
      `packages/core/test/domain/errors/read-only-workspace-error.spec.ts` (new)
      Approach: message `Cannot modify spec "core:x" — workspace "core" is readOnly.`; `code === 'READ_ONLY_WORKSPACE'` (T-RO-1)
      (Req: ReadOnly workspace rejection)
- [x] 15.4 Test `toLogicalFilePath`
      `packages/core/test/domain/services/to-logical-file-path.spec.ts` (new)
      Approach: win32 converts `\` to `/`; linux/darwin unchanged; comma and spaces untouched (T-IMPL-9)
      (Req: Path separators are normalized on Windows hosts)
- [x] 15.5 Test `UpdateImplementationTracking` array, special characters and normalization
      `packages/core/test/application/use-cases/update-implementation-tracking.spec.ts`
      Approach: `files: ['a.md', 'b, c.md']` handles exactly two files; `"quoted".md`, `back\slash.md` (linux), `ñandú.md` stored byte for byte; win32 `ignore` of `docs\Análisis, dependencias.md` ⇒ `docs/Análisis, dependencias.md`; win32 `ignore/resolve/unresolve/remove` batches normalized (T-IMPL-1…4)
      (Req: File names are whole names; Path separators are normalized on Windows hosts)
- [x] 15.6 Test `UpdateImplementationTracking` batch semantics and errors
      `packages/core/test/application/use-cases/update-implementation-tracking.spec.ts`
      Approach: two-file `ignore` calls `ChangeRepository.mutate` once; duplicates collapse; `file: 'x'` + `files: ['y']` ⇒ `x`, `y`; win32 missing `a\b.ts` ⇒ message contains `a\b.ts`; `add`/`remove` without `specId` ⇒ `InvalidInputError` with the change untouched (T-IMPL-5…8)
      (Req: Multi-file mutations are all-or-nothing; Input contract)
- [x] 15.7 Test `EditChange` ID and ownership gaps
      `packages/core/test/application/use-cases/edit-change.spec.ts`
      Approach: `['']` ⇒ `InvalidSpecIdError`; `removeSpecIds: ['Bad Id']` ⇒ `SpecNotInChangeError` quoting `Bad Id`; `['auth/login']` removes `default:auth/login`; mixed owned/readOnly lists only readOnly specs and adds nothing; `['a','default:a']` removal collapses; idempotent add never calls `ActorResolver.identity`; `unscaffold` called with removed IDs and not on add (T-EDIT-1…3)
      (Req: Spec ID validation; ReadOnly workspace rejection; Directory cleanup on removal)
- [x] 15.8 Test `CreateChange` ID and ordering gaps
      `packages/core/test/application/use-cases/create-change.spec.ts`
      Approach: `ChangeAlreadyExistsError` before `InvalidSpecIdError`; empty ID rejected; duplicate IDs collapse; mixed owned/readOnly message has only readOnly lines (T-CREATE-1)
      (Req: Spec ID validation; ReadOnly workspace rejection)
- [x] 15.9 Test unknown workspace with and without a workspace set
      `packages/core/test/domain/services/parse-spec-id.spec.ts`
      Approach: with a set ⇒ `WorkspaceNotFoundError` quoting `nope:auth/login` and listing known workspaces; without a set returns workspace `nope`; `instanceof` holds for the error from both import paths (T-ID-1)
      (Req: Unknown workspace rejection)
- [x] 15.10 Test two-character workspace and `core:Auth/*`
      `packages/core/test/infrastructure/fs/config-loader.spec.ts`, `packages/core/test/domain/services/spec-id-rules.spec.ts`
      Approach: `ab` accepted; `core:Auth/*` rejected naming the segment (T-WS-1)
      (Req: Workspace name rule; Capability path segment rule)
- [x] 15.11 Test `InvalidSpecPatternError`
      `packages/core/test/domain/services/parse-spec-pattern.spec.ts`
      Approach: programmatic `a*b` ⇒ `InvalidSpecPatternError` with code `INVALID_SPEC_PATTERN`; `validateContextPattern` wraps it into `ConfigValidationError` (T-CONFIG-1)
      (Req: Patterns and schema references)
- [x] 15.12 Extend `UpdateSpecDeps` tests
      `packages/core/test/application/use-cases/update-spec-deps.spec.ts`
      Approach: `set: []` clears; absent `specDependsOn` entry handled; `clear` on empty list ok; error `.code === 'INVALID_INPUT'`; `remove: ['auth/jwt']` removes `default:auth/jwt` (T-DEPS-1)
      (Req: Mutual exclusivity of set vs add/remove; Spec ID validation)
- [x] 15.13 Test the `UpdateSpecDeps` factory
      `packages/core/test/composition/use-cases/update-spec-deps.spec.ts` (new)
      Approach: `resolveUpdateSpecDepsDeps` returns repository and workspace names; `createUpdateSpecDeps(config)` builds the use case (T-DEPS-2)
      (Req: Config-based factory)
- [x] 15.14 Extend `UpdatePersistedSpecDeps` tests
      `packages/core/test/application/use-cases/update-persisted-spec-deps.spec.ts`
      Approach: `remove[a] add[a,c]` ⇒ `[b,a,c]`; `expectedRevision` is `originalHash`; `ArtifactConflictError` propagates without retry; `ReadOnlyWorkspaceError` message from `forSpec` before any I/O; missing state: `clear` ⇒ `created:true`, `set` skips derivation, `add` derives base, `remove` + non-empty `add` drops the removed ID (D4), `remove` alone and `add: []` ⇒ `initialized:false` without `writePersistedState`; existing state ⇒ `initialized:true` (T-PDEPS-1)
      (Req: Persisted state created from derived base; Mutation output reflects the real initialized state)
- [x] 15.15 Test the spec-lock error code and message
      `packages/core/test/domain/services/parse-spec-lock.spec.ts`
      Approach: `error.code === 'INVALID_SPEC_LOCK'`; message names spec, location, field path and has no repair advice (T-LOCK-1)
      (Req: Invalid lock fails with a typed error)
- [x] 15.16 Test lenient lock reads at repository level
      `packages/core/test/infrastructure/fs/spec-repository.spec.ts` (real temp fs)
      Approach: `readPersistedState(spec, { lenientDependsOn: true })` returns a lock with `dependsOn: [""]` while an invalid `implementation.0.file` still throws; `writePersistedState` over `dependsOn: ["", "core:ok"]` succeeds; strict read of one valid plus one invalid entry throws `InvalidSpecLockError` and the file bytes are unchanged (T-LOCK-2…4)
      (Req: Lenient dependsOn read; Invalid lock fails with a typed error)
- [x] 15.17 Extend the `get-persisted-spec-*` tests
      `packages/core/test/application/use-cases/get-persisted-spec-deps.spec.ts`, `get-persisted-spec-implementation.spec.ts`, `get-persisted-spec-schema.spec.ts`, `get-persisted-spec-optimizations.spec.ts`, plus `packages/core/test/composition/use-cases/get-persisted-spec-*.spec.ts` (new)
      Approach: stored order and duplicates kept; unknown spec ⇒ `SpecNotFoundError` (before `SpecNotInitializedError` for schema); `Bad Id` quoted; only `readPersistedState` used, never `writePersistedState`; factory deps asserted (T-GET-1)
      (Req: Reads persisted state through the repository port; Use cases validate and normalize)
- [x] 15.18 Extend the optimizations reader tests
      `packages/core/test/application/use-cases/get-persisted-spec-optimizations.spec.ts`
      Approach: field filter with present and absent fields; freshness reasons added/removed/changed/lastModified-only/schema-changed; aggregate fresh true/false/filtered; absent field ⇒ `{ freshness:'missing', reasons:['missing'] }` with no `value` (T-GET-2)
      (Req: Missing field shape)
- [x] 15.19 Test implementation confinement and links
      `packages/core/test/application/use-cases/update-persisted-spec-implementation.spec.ts`
      Approach: table `../x`, absolute outside, prefix sibling `core-evil/x`, `core:../x`, `core:../../etc/passwd`, foreign qualifier `other:src/x.ts` ⇒ `ImplementationWorkspaceBoundaryError` with state untouched; `C:\x` not a qualifier; nested path stored with `/`; add symbols to a file-level link; remove symbols / last symbol / whole entry; lock-less `add` ⇒ `created:true`; `remove` on missing state ⇒ no write; `expectedRevision` hash/`null`; `ArtifactConflictError`; `SpecNotFoundError`; read-only message via `forSpec`; existence check before `readPersistedState` (spy order) (T-UIMPL-1, T-UIMPL-2)
      (Req: Confinement to the workspace code root)
- [x] 15.20 Test optimizations updater input and persistence
      `packages/core/test/application/use-cases/update-persisted-spec-optimizations.spec.ts`
      Approach: `specId: undefined` ⇒ `InvalidInputError`; `''` ⇒ `InvalidSpecIdError`; strict-input rejection matrix touches no port; set captures baseline per field; effective schema recorded on create; `created:true`/`expectedRevision:null`; `ArtifactConflictError`; result omits `optimizations` after last clear (T-UOPT-1)
      (Req: Input contract)
- [x] 15.21 Test schema reassignment parse verification
      `packages/core/test/application/use-cases/update-persisted-spec-schema.spec.ts`
      Approach: malformed artifact under a target schema without `dependsOn` extraction ⇒ `ArtifactParseError`, no write; format without parser skipped; success `changed:true` preserving implementation/optimizations; same schema ⇒ `changed:false`, no write; ref-mode `getActiveSchema`; extraction differs ⇒ `PersistedSchemaDependencyConflictError`; optimizations become `schema-changed` stale; `expectedRevision`; `ArtifactConflictError`; `SpecNotFoundError` before `SpecNotInitializedError` (T-USCH-1)
      (Req: Artifacts parse under the target schema)
- [x] 15.22 Test metadata, generate, validate and preview gaps
      `packages/core/test/domain/services/parse-metadata.spec.ts`, `packages/core/test/application/use-cases/generate-spec-metadata.spec.ts`, `validate-specs.spec.ts`, `preview-spec.spec.ts`
      Approach: empty and malformed `dependsOn` entry rejected at `PersistSpecMetadata` level; `Bad Id` and `''` rejected and quoted, `auth/a,b` quoted whole; `ws:` rejected; bare ID resolves to `default:...` in results; preview rejects an ID outside the change; schema field formats (keywords, sha256, optional scenarios, `context`, `generatedBy`) (T-META-1)
      (Req: Spec ID validation; core:spec-metadata schema requirement)
- [x] 15.23 Test `workspacesFromSpecIds`
      `packages/core/test/domain/archived-change-index-entry.spec.ts`
      Approach: `['core:a','default:b','core:c']` ⇒ `['core','default']`; a bare ID yields `default`; `['a:b:c']` and `['']` ⇒ `InvalidSpecIdError` (T-ARCH-1)
      (Req: Workspaces derived from specIds)

## 16. Audit hardening: CLI and skills tests

- [x] 16.1 Test `changes deps` display and flags
      `packages/cli/test/commands/change-deps.spec.ts`
      Approach: display mode calls `getSpecDeps.execute` with the raw typed value and prints the returned `default:...` ID in text, JSON and TOON; source inspection: `change/deps.ts` has no `parseSpecId` import and no `listWorkspaces` call; help lists `--clear`/`--force`; blank value rejected; unknown workspace error mapped (T-CLI-DEPS-1)
      (Req: Output shows the normalized spec ID)
- [x] 16.2 Test `specs deps` output, comma dependency and error mapping
      `packages/cli/test/commands/spec-deps.spec.ts`
      Approach: `remove` on an uninitialized spec prints `not initialized — nothing was removed` and JSON `initialized:false`; mutations render the returned `initialized`; `--dep "a,b"` rejected as one invalid ID; `clear` non-interactive error is `clearing requires confirmation; pass --force to skip it` and does not contain `--clear`; `ArtifactConflictError` ⇒ exit 1 with retry advice; `ReadOnlyWorkspaceError` ⇒ exit 1 (T-CLI-SDEPS-1)
      (Req: Mutation output reflects the real initialized state; Clear confirmation)
- [x] 16.3 Test the lock repair hint
      `packages/cli/test/handle-error.spec.ts`
      Approach: hint equals the three commands exactly, contains no `--force` and no parenthesis, and is absent for non-`dependsOn` field paths (T-CLI-ERR-1)
      (Req: Invalid lock fails with a typed error)
- [x] 16.4 Test `changes implementation` gaps
      `packages/cli/test/commands/change-implementation.spec.ts`
      Approach: `resolve --file "a, b.md"`; `resolve --file a --file b` and `--file a b`; `unresolve` repeated plus comma name; `--file " spaced.md "` forwarded with spaces; `--format json` file names as array entries; `remove --symbol "A.b,c"` forwarded raw; `--help` lists all eight subcommands; `start` idempotent on second run (T-CLI-IMPL-1)
      (Req: Resolve subcommand; Raw values and unambiguous listings; Command signature)
- [x] 16.5 Test `change edit` and `change create` gaps
      `packages/cli/test/commands/change-edit.spec.ts`, `packages/cli/test/commands/change-create.spec.ts`
      Approach: `"Bad Id"` ⇒ exit 1 with the quoted value; `auth/a,b` message quotes the whole value; `--remove-spec` forwarded raw; usage error precedes config resolution (unresolvable config still yields the usage message); source inspection: no `SpecdConfig`/ownership read; create: invalid name mapped from core, mixed owned/readOnly and multiple-readOnly lines (T-CLI-EDIT-1)
      (Req: Command signature; ReadOnly workspace rejection)
- [x] 16.6 Test `project init` workspace id validation
      `packages/cli/test/commands/project-init.spec.ts`
      Approach: `--workspace a`, `Core`, `nul` ⇒ exit 1, message quotes the value and names the rule, no file written; wizard validator rejects the same and accepts `default`/`ab`; value never trimmed; guard: no `a-z][a-z0-9-]` regex in `packages/cli/src` (T-INIT-1)
      (Req: Workspace id validation)
- [x] 16.7 Test `graph index --exclude-path` listed form
      `packages/cli/test/commands/graph-index.spec.ts`
      Approach: `--exclude-path 'a' 'b'` yields `['a','b']`; `{a,b}/**` stays one pattern (T-GRAPH-1)
      (Req: Exclude path options)
- [x] 16.8 Extend the skills template test
      `packages/skills/test` (existing template test)
      Approach: assert no template contains a comma-joined `--file` list, and extend the assertion to `--spec` and `--add` (T-SKILL-1)
      (Req: workflow-automation file guidance)

## 17. Audit hardening: documentation and skills

- [x] 17.1 Update the CLI reference pages
      `docs/cli/cli-reference.md`, `docs/cli/changes.md`, `docs/cli/spec-deps.md`
      Approach: `--clear`/`--force`, repeated and variadic `--file`, `--exclude-path` without comma splitting, `--invalidation-policy` and `--config` in the `change edit`/`change create` synopsis, `specs deps` `initialized` output and the `remove` not-initialized no-op text, the `clear` confirmation wording, the `project init` workspace-id rule; `packages/cli/test/documentation-coverage.spec.ts` must pass
      (Req: Command signature; Mutation output reflects the real initialized state)
- [x] 17.2 Update the core docs
      `docs/core/overview.md`, `docs/core/services.md`, `docs/core/errors.md`
      Approach: strict `parseSpecId` contract and options, `parseSpecPattern`, `isValidWorkspaceName`, `GetChangeSpecDeps`, `UpdatePersistedSpecDeps` result `initialized`, `ReadOnlyWorkspaceError.forSpec`, `ArtifactParseError` on schema reassignment, `InvalidSpecIdError`/`InvalidSpecPatternError`/`InvalidSpecLockError`/`WorkspaceNotFoundError` (moved to domain), `SpecRepository.readPersistedState` `lenientDependsOn`
      (Req: core:spec-id-format; core:spec-repository-port)
- [x] 17.3 Update the SDK docs
      `docs/sdk/` page that lists kernel operations
      Approach: add `kernel.changes.getSpecDeps` and the `parseSpecId`/`isFullyQualifiedSpecId` re-exports
      (Req: Output shows the normalized spec ID)
- [x] 17.4 Update the guide pages
      `docs/guide/configuration.md`, `docs/guide/specs.md`, `docs/guide/workspaces.md`
      Approach: canonical spec ID format, two-or-more-character workspace names, bare IDs resolve to `default`; no SDK internals
      (Req: core:workspace; core:spec-id-format)
- [x] 17.5 Check skills docs and templates for comma lists
      `docs/skills/`, `packages/skills/templates/**`
      Approach: grep for comma-joined `--file`/`--add`/`--spec` values and replace with repeated options; confirm `specd-archive` and `specd-implement` templates match the amended `skills:workflow-automation` spec
      (Req: workflow-automation file guidance)

## 18. Audit hardening: final verification

- [x] 18.1 Build
      repository root
      Approach: `pnpm build`; fix any type errors from the constructor change in 13.15 and the new `initialized` field
      (Req: all)
- [x] 18.2 Typecheck
      repository root
      Approach: `pnpm typecheck` (run after the build so `code-graph` dist exists)
      (Req: all)
- [x] 18.3 Lint and format
      repository root
      Approach: `pnpm lint` and `pnpm format:check`; fix reported issues
      (Req: all)
- [x] 18.4 Run the full test suite
      repository root
      Approach: `pnpm test`; if `@specd/code-graph` fails only under turbo load, rerun `pnpm --filter @specd/code-graph test` alone and report both results
      (Req: all)
- [x] 18.5 Run the manual checks
      CLI at `packages/cli/dist/index.js`
      Approach: execute the manual checks 1–12 from design.md Testing (including `changes deps <change> auth/login`, `specs deps remove` on an uninitialized spec, `specs deps clear` in a non-TTY shell, `init --workspace nul` in a temp dir) and compare with the expected outputs
      (Req: all)
- [x] 18.6 Re-validate the change artifacts
      `node packages/cli/dist/index.js changes validate support-commas-in-names --artifact tasks --format text` and the `specs`/`verify` validation for every spec in the change
      Approach: all must pass with no `validation failed`
      (Req: all)

## 19. Post full-verify fix (compliance F1 / verify scenario)

- [x] 19.1 Modification text output uses normalized spec ID
      `packages/cli/src/commands/change/deps.ts` — modification branch text output
      Approach: print `result.specId` from `UpdateSpecDeps` in the text line (same as JSON/TOON), not the raw positional argument
      (Req: cli:change-deps Output shows the normalized spec ID)
- [x] 19.2 Align `change-deps` test with normalized text output
      `packages/cli/test/commands/change-deps.spec.ts`
      Approach: mock returns fully-qualified `default:auth/login`; expect `updated deps for default:auth/login` in text output
      (Req: cli:change-deps Output shows the normalized spec ID)
- [x] 19.3 Run targeted tests
      repository root
      Approach: `pnpm --filter @specd/cli test change-deps.spec.ts`
      (Req: cli:change-deps)

## 20. Compliance audit 20261106-175354 fixes

- [x] 20.1 Validate invalidation policy in EditChange
      `packages/core/src/application/use-cases/edit-change.ts`, domain constant next to the `Change` policy type
      Approach: one exported allowed-values constant; reject any other value with `InvalidInputError` (quote value, list allowed) before actor resolution or mutation
      (Req: core:edit-change Invalidation policy edits)
- [x] 20.2 Validate invalidation policy in CreateChange
      `packages/core/src/application/use-cases/create-change.ts`
      Approach: reuse the constant; reject before persistence, create nothing
      (Req: core:create-change Initial invalidation policy)
- [x] 20.3 CLI passes the policy string through unvalidated
      `packages/cli/src/commands/change/create.ts`, `packages/cli/src/commands/change/edit.ts`
      Approach: drop the `as 'none' | ...` casts; map `InvalidInputError` to exit code 1
      (Req: cli:change-create Duplicate name error; cli:change-edit Error cases)
- [x] 20.4 Case-aware tracked file comparison
      `packages/core/src/domain/services/` (new pure helper), `packages/core/src/application/use-cases/update-implementation-tracking.ts`
      Approach: `sameTrackedFile(a, b, platform)`; case-insensitive on win32/darwin, exact elsewhere; keep the first recorded spelling
      (Req: core:update-implementation-tracking File names are whole names)
- [x] 20.5 start validates a supplied specId
      `packages/core/src/application/use-cases/update-implementation-tracking.ts`
      Approach: run specId validation before the `start` early return
      (Req: core:update-implementation-tracking Input contract)
- [x] 20.6 EditChange persists nothing on a no-op
      `packages/core/src/application/use-cases/edit-change.ts`
      Approach: compare resulting specIds, description and policy with the persisted ones; return unchanged without `mutate`
      (Req: core:edit-change No-op when no spec changes requested)
- [x] 20.7 Schema compatibility source is out of scope
      `packages/core/src/application/use-cases/create-change.ts`, `packages/core/src/application/use-cases/edit-change.ts`
      Approach: no code change in this change; `compat` from the change's own schema, override validation and the legacy-spec rule are handled in `feat/lifecycle-transitions-ux` (`ResolveChangeSchema`)
      (Req: core:edit-change Schema compatibility guardrail)
- [x] 20.8 UpdatePersistedSpecDeps removes bare stored entries
      `packages/core/src/application/use-cases/update-persisted-spec-deps.ts`
      Approach: match `remove` entries against the raw string and the normalized form
      (Req: core:update-persisted-spec-deps Spec ID validation)
- [x] 20.9 Scope the lock repair hint to specs deps
      `packages/cli/src/handle-error.ts`, `packages/cli/src/commands/spec/deps.ts`
      Approach: move the hint out of the global handler into the `specs deps` command layer; keep it out of the JSON/TOON `message`
      (Req: cli:spec-deps Error mapping)
- [x] 20.10 change implementation start output
      `packages/cli/src/commands/change/implementation.ts`
      Approach: text prints name, tracking active, start timestamp; JSON/TOON carry `name`, `trackingActive`, `startedAt`
      (Req: cli:change-implementation)
- [x] 20.11 Tests for the new rules
      `packages/core/test/`, `packages/cli/test/commands/`
      Approach: invalid policy (create, edit, CLI); case-only names on win32/darwin vs linux; start with bad specId; EditChange no-op does not mutate; bare stored dependency removed; hint only on `specs deps`; start output in text and JSON
      (Req: scenarios added by this audit pass)
- [x] 20.12 Run typecheck and tests
      repository root
      Approach: `pnpm typecheck`, then `pnpm test`; re-run isolated any file that only timed out under load
      (Req: all)

## 21. Full-verification corrections (2026-11-09)

- [x] 21.1 Collapse case aliases within one new tracked-file batch
      `packages/core/src/application/use-cases/update-implementation-tracking.ts`: `UpdateImplementationTracking.execute` — deduplicate new entries using `sameTrackedFile` before validation and mutation.
      Approach: compare each normalized candidate with accepted entries; preserve persisted spelling first, otherwise the batch's first spelling; retain exact matching on Linux.
      (Req: core:update-implementation-tracking File names are whole names)
- [x] 21.2 Test new-batch case aliases across host platforms
      `packages/core/test/application/use-cases/update-implementation-tracking.spec.ts` — cover macOS/Windows collapse, first spelling and one link, Linux distinct paths.
      Approach: inject platform and existing file fixtures; assert one persisted mutation and the resulting tracked/link arrays.
      (Req: core:update-implementation-tracking File names are whole names)
- [x] 21.3 Validate the resolved default workspace
      `packages/core/src/domain/services/parse-spec-id.ts`: `parseSpecId` — validate explicit and defaulted workspace names alike.
      Approach: call existing `isValidWorkspaceName` for the resolved value before optional membership lookup; retain typed `InvalidSpecIdError` and `WorkspaceNotFoundError` boundaries.
      (Req: core:spec-id-format Single validator)
- [x] 21.4 Test invalid defaultWorkspace overrides
      `packages/core/test/domain/services/parse-spec-id.spec.ts` — cover empty, one-character, uppercase/space and device-name overrides with and without workspace membership.
      Approach: assert `InvalidSpecIdError` for invalid names and `WorkspaceNotFoundError` for a valid unknown name.
      (Req: core:spec-id-format Single validator)
- [x] 21.5 Preserve one-shot workspace iterable input
      `packages/core/src/application/use-cases/update-spec-deps.ts`: `UpdateSpecDeps` — materialize the iterable once in the constructor.
      Approach: retain the public `Iterable` parameter; store an array and reuse it for each `execute` call.
      (Req: core:update-spec-deps Input contract)
- [x] 21.6 Test repeated dependency mutation with Map.keys()
      `packages/core/test/application/use-cases/update-spec-deps.spec.ts` — execute twice on the same use case built with a one-shot map iterator.
      Approach: assert both calls validate workspaces and persist canonical dependency IDs.
      (Req: core:update-spec-deps Input contract)
- [x] 21.7 Include invalid dependency value in lock diagnostics
      `packages/core/src/domain/services/parse-spec-lock.ts`, `packages/core/src/domain/errors/invalid-spec-lock-error.ts` — include the offending string for a `dependsOn` Zod issue.
      Approach: retrieve the indexed string from parsed input, render it with `JSON.stringify`, retain owner/location/field/rule and existing error code; preserve other error shapes.
      (Req: core:spec-lock Invalid lock fails with a typed error)
- [x] 21.8 Test quoted lock value and lenient behavior
      `packages/core/test/domain/services/parse-spec-lock.spec.ts` — assert `Bad Id`, `dependsOn.0`, owner, location, rule and `INVALID_SPEC_LOCK` on strict read.
      Approach: keep invalid JSON and lenient repair cases passing without added command advice.
      (Req: core:spec-lock Invalid lock fails with a typed error)
- [x] 21.9 Correct change-deps mock values and text assertions
      `packages/cli/test/commands/change-deps.spec.ts` — replace bare mocked result IDs with canonical IDs.
      Approach: assert add/remove/set text retains `default:` and the add output contains both dependencies in Core order.
      (Req: cli:change-deps Command signature)
- [x] 21.10 Verify real Core-to-CLI dependency output
      `packages/cli/test/commands/change-deps.spec.ts` — exercise a real kernel-backed dependency mutation and inspect the CLI text output.
      Approach: pass bare IDs as CLI input and assert the rendered result contains fully-qualified IDs returned by Core.
      (Req: cli:change-deps Command signature)
- [x] 21.11 Add structured help schemas to implementation leaves
      `packages/cli/src/commands/change/implementation.ts` — add `JSON/TOON output schema:` blocks to all eight format-capable leaves.
      Approach: use `addHelpText('after', ...)` with TypeScript-style fields matching each leaf's actual JSON/TOON result.
      (Req: cli:entrypoint JSON/TOON output schema in help)
- [x] 21.12 Add structured help schemas to specs-deps leaves
      `packages/cli/src/commands/spec/deps.ts` — add the schema block to all five format-capable leaves.
      Approach: use the same header and one field per line, marking conditional fields optional.
      (Req: cli:entrypoint JSON/TOON output schema in help)
- [x] 21.13 Complete init and change-create help schemas
      `packages/cli/src/commands/project/init.ts`, `packages/cli/src/commands/change/create.ts` — add init's output schema and `changePath: string` to create's existing block.
      Approach: describe actual structured response fields without altering command execution.
      (Req: cli:entrypoint JSON/TOON output schema in help; cli:change-create JSON output includes changePath)
- [x] 21.14 Test affected command help surfaces
      `packages/cli/test/commands/change-implementation.spec.ts`, `packages/cli/test/commands/spec-deps.spec.ts`, `packages/cli/test/commands/project-init.spec.ts`, `packages/cli/test/commands/change-create.spec.ts` — assert the schema header and representative fields for the affected leaves.
      Approach: invoke built command tree help and check all eight implementation and five dependency leaves plus init and create.
      (Req: cli:entrypoint JSON/TOON output schema in help)
- [x] 21.15 Review CLI documentation for changed outputs
      `docs/cli/changes.md`, `docs/cli/spec-deps.md`, and affected `docs/guide/` pages — keep examples aligned with fully-qualified dependency output and help metadata.
      Approach: edit only conflicting examples, preserving the already documented whole-file option syntax.
      (Req: cli:change-deps Output; default:\_global/docs)
- [x] 21.16 Run final focused and package checks
      Core/CLI test suites, package TypeScript checks, build, lint on touched files and `git diff --check` — verify the corrected branches and integration.
      Approach: run focused tests first, then the required package checks; record any platform limits and leave Linux/Windows execution to the CI matrix.
      (Req: all full-verification corrections)

## 22. Metadata authority follow-up (2026-11-13)

- [x] 22.1 Replace consumer-owned dependency checks with metadata delegation
      `packages/core/src/application/use-cases/validate-specs.ts`: `ValidateSpecs` — replace `_validateMetadataConsistency` with `_validateMetadataMaterialization({ label, failures, warnings })`.
      Approach: call `GetSpecMetadata.execute({ specId: label })` once on full validation; remove `_extractDependsOn`, unused imports and its private dependency fields; retain constructor argument positions through unused compatibility parameters. Accept successful metadata without another lock comparison or extraction.
      (Req: Metadata materialization and validation)
- [x] 22.2 Propagate materialization warnings
      `packages/core/src/application/use-cases/validate-specs.ts`: `_validateMetadataMaterialization` — preserve warnings returned by the metadata authority.
      Approach: append `{ artifactId: 'metadata', description: "<kind> for '<specId>': <error>" }` for each warning; do not log again or introduce a failure. Retain the existing materialization-failure reason wrapper and prior artifact failures.
      (Req: Metadata materialization and validation)
- [x] 22.3 Invalidate outcomes from the superseded validation engine
      `packages/core/src/application/use-cases/_shared/validate-specs-cache-fingerprints.ts`: `VALIDATE_SPECS_ENGINE_VERSION` — bump `2 as const` to `3 as const`.
      Approach: retain fingerprint algorithms and cache-port behavior; the engine bucket prevents old mismatch failures or dropped warnings from being reused.
      (Req: Transparent validation result cache)
- [x] 22.4 Test delegation and absence of a second dependency model
      `packages/core/test/application/use-cases/validate-specs.spec.ts`: replace consumer-owned mismatch expectations with metadata-authority assertions.
      Approach: inject successful `GetSpecMetadata`, make independent repository metadata/dependency reads throw, assert one qualified-ID call, accept non-empty lock-less dependencies and metadata without extraction declarations, and retain missing/invalid/stale-cache success coverage.
      (Req: Metadata materialization and validation)
- [x] 22.5 Test lock-less extraction through the real metadata pipeline
      `packages/core/test/application/use-cases/validate-specs.spec.ts`: add an integration case with real GetSpecMetadata/materialization/generation and stubbed ports.
      Approach: omit the lock, declare schema dependency extraction, produce `core:storage`, and assert validation accepts the generated projection without modifying generator/materializer behavior.
      (Req: Metadata materialization and validation)
- [x] 22.6 Test delegated failure diagnostics
      `packages/core/test/application/use-cases/validate-specs.spec.ts`: cover materialization failures and authority-rejected dependency conflicts.
      Approach: assert one metadata failure preserving the reason for Error and non-Error rejections; assert no independent extraction or dependency comparison follows rejection.
      (Req: Metadata materialization and validation)
- [x] 22.7 Test materialization warning propagation
      `packages/core/test/application/use-cases/validate-specs.spec.ts`: cover successful metadata plus `metadata-cache-write-failed`.
      Approach: assert kind, spec identity and storage error in the entry warning, with no added failure or duplicate logging.
      (Req: Metadata materialization and validation)
- [x] 22.8 Test preservation of existing artifact failures
      `packages/core/test/application/use-cases/validate-specs.spec.ts`: combine successful materialization with structural/cross-artifact failure.
      Approach: assert the original failure survives and `passed` stays false.
      (Req: Metadata materialization and validation, Aggregated result)
- [x] 22.9 Test engine-bucket isolation and cached diagnostics
      `packages/core/test/application/use-cases/_shared/validate-specs-cache-fingerprints.spec.ts`, `packages/core/test/infrastructure/fs/fs-validation-result-cache.spec.ts`, `packages/core/test/application/use-cases/validate-specs.spec.ts`: verify version-3 cache behavior.
      Approach: reject a version-2 bucket under the new engine, assert current outcomes preserve warnings, and retain hard-hit bypass of metadata work.
      (Req: Transparent validation result cache)
- [x] 22.10 Update the ValidateSpecs documentation
      `docs/core/use-cases.md`: `ValidateSpecs` section — describe delegated metadata validity and diagnostics.
      Approach: explain acceptance of lock-less extracted dependencies and materialization warnings/failures without changing public inputs/results or constructor compatibility.
      (Req: Metadata materialization and validation; default:\_global/docs)
- [x] 22.11 Update the deferred-finding record with actual completion evidence
      `EXPLORATION_VERIFY_FOLLOWUPS.md`: CP2 and CP3 — record their return to this change and final implementation/test evidence.
      Approach: distinguish the 2026-11-13 decision from a completed fix; retain the other deferred items and change links. Only mark implementation complete after the corresponding tasks and tests pass.
      (Req: Metadata materialization and validation)
- [x] 22.12 Run focused metadata, validation, cache and health tests
      `packages/core/test/application/use-cases/` and the named cache/fingerprint suites — check new branches and direct consumers.
      Approach: run ValidateSpecs, GetSpecMetadata, materialization, generation, GetSpecsHealth, fingerprint and fs-validation-cache suites; require all to pass.
      (Req: Metadata materialization and validation, Transparent validation result cache)
- [x] 22.13 Run Core and CLI regression suites
      `packages/core` and `packages/cli` — exercise validation and project-health consumers.
      Approach: run both package test suites and inspect their validation/project-health assertions for preserved result shapes and propagated diagnostics; leave Linux/Windows execution to CI.
      (Req: Aggregated result; default:\_global/testing)
- [x] 22.14 Run workspace TypeScript checks
      Workspace packages — verify constructor compatibility and unchanged result contracts.
      Approach: run `pnpm typecheck` and resolve failures attributable to this correction.
      (Req: Config-based factory delegates through resolveValidateSpecsDeps; default:\_global/conventions)
- [x] 22.15 Build the workspace packages
      Workspace packages — verify production outputs compile with the new validation engine.
      Approach: run `pnpm build` and resolve failures attributable to this correction.
      (Req: Metadata materialization and validation)
- [x] 22.16 Run lint and diff checks
      Changed TypeScript and artifact/documentation files — complete the correction's quality checks.
      Approach: lint changed TypeScript files and run `git diff --check`; preserve task history and record only actually completed work.
      (Req: default:\_global/eslint, default:\_global/conventions)

## 23. Compliance-audit fixes (2026-11-13)

- [x] 23.1 Validate `action` at runtime in `UpdatePersistedSpecImplementation.execute`
      `packages/core/src/application/use-cases/update-persisted-spec-implementation.ts`, `packages/core/test/application/use-cases/update-persisted-spec-implementation.spec.ts`
      Approach: throw `InvalidInputError` if `input.action` is not `'add'` or `'remove'` before any repository access, and add a unit test.
      (Req: core:update-persisted-spec-implementation)
- [x] 23.2 Make `C:\x` test in `update-persisted-spec-implementation.spec.ts` cross-platform
      `packages/core/test/application/use-cases/update-persisted-spec-implementation.spec.ts`
      Approach: guard or parameterize the `C:\x` assertion by platform (`process.platform === 'win32'`) so it passes on both POSIX and Windows.
      (Req: default:\_global/testing, default:\_global/cross-platform)
- [x] 23.3 Add missing `@throws` JSDoc entries on `CreateChange.execute`, `GenerateSpecMetadata.execute`, and `ValidateSpecs.execute`
      `packages/core/src/application/use-cases/create-change.ts`, `packages/core/src/application/use-cases/generate-spec-metadata.ts`, `packages/core/src/application/use-cases/validate-specs.ts`
      Approach: document all thrown typed errors (`WorkspaceNotFoundError`, `InvalidInputError`, `SpecNotFoundError`, etc.) in `@throws` JSDoc tags per `default:_global/error-handling-conventions`.
      (Req: default:\_global/error-handling-conventions)
- [x] 23.4 Add remaining edge-case tests from the compliance audit
      `packages/core/test/composition/use-cases/update-persisted-spec-implementation.spec.ts`, `packages/core/test/composition/use-cases/update-persisted-spec-schema.spec.ts`, `packages/cli/test/commands/change-create.spec.ts`, `packages/cli/test/commands/change-edit.spec.ts`
      Approach: add `resolve*Deps` tests for `UpdatePersistedSpecImplementation` and `UpdatePersistedSpecSchema`, and `--format toon` output assertions in `change-create.spec.ts` and `change-edit.spec.ts`.
      (Req: core:update-persisted-spec-implementation, core:update-persisted-spec-schema, cli:change-create, cli:change-edit)
- [x] 23.5 Add `@throws {DependsOnOverwriteError}` JSDoc on `GenerateSpecMetadata.execute`
      `packages/core/src/application/use-cases/generate-spec-metadata.ts`
      Approach: document `DependsOnOverwriteError` in `GenerateSpecMetadata.execute` JSDoc per `default:_global/error-handling-conventions`.
      (Req: core:generate-metadata, default:\_global/error-handling-conventions)
