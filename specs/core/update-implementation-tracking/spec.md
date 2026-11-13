# UpdateImplementationTracking

## Purpose

Implementation tracking needs an application-level mutation primitive so delivery hosts can record file review state and confirmed implementation links without reimplementing change-manifest rules themselves. `UpdateImplementationTracking` is that primitive: it applies one implementation-tracking mutation to a change, enforces file-existence and tracked-entry rules at the core boundary, and persists the resulting implementation-tracking projection.

## Requirements

### Requirement: Input contract

`UpdateImplementationTracking.execute` SHALL accept:

- `name` — change name
- `action` — one of `add`, `remove`, `ignore`, `resolve`, `unresolve`, or `start`
- `file` — optional raw project-relative file path (required for `add`, `remove`, `ignore`, `resolve`, and `unresolve` unless `files` is given; optional for `start`)
- `files` — optional list of raw project-relative file paths for any action that takes `file` (`add`, `remove`, `ignore`, `resolve`, `unresolve`); each entry is one whole file name; duplicate names are collapsed to one
- `specId` — optional spec ID; required for `add` and `remove`. Whenever it is supplied, for any action, it is validated and normalized with `parseSpecId` and the workspaces configured for the project (`core:spec-id-format`) before any mutation, failing with `InvalidSpecIdError` or `WorkspaceNotFoundError`
- `symbols` — optional symbol refinements for link mutations

When both `file` and `files` are supplied, the effective list is `file` followed by the entries of `files`, with duplicates collapsed; neither is ignored.

The use case MUST always be constructed with the project's spec repositories (the configured workspaces); it has no mode in which `specId` workspace validation is skipped.

`add` or `remove` without `specId` MUST fail with `InvalidInputError` stating that `specId` is required, and MUST NOT leave the change modified.

### Requirement: File names are whole names

The use case MUST treat every `file` and every entry of `files` as one whole file name. It MUST NOT split a name on commas or any other character, and MUST NOT trim, case-fold, or otherwise alter a name that is recorded or reported: a name with a comma (`Análisis, dependencias.md`), leading or trailing spaces, quotes, or non-ASCII characters is recorded exactly as given, and names are stored in the change manifest as the same strings they were given. When two names are compared to decide whether they denote the same tracked file, the comparison follows the host platform's path rules (see `_global/cross-platform`): on Windows and macOS two names that differ only in letter case denote the same file and the already-recorded spelling is kept; on a case-sensitive host they are distinct. The comparison never changes the stored or reported spelling.

A failure caused by a name MUST quote the full original value exactly as the caller supplied it, for example `Implementation file "a,b.md" does not exist`. This includes Windows hosts: when `a\b.ts` is reported missing, the error quotes `a\b.ts`, not the separator-normalized `a/b.ts`; normalization is internal and never shown in an error. Hosts (CLI, MCP, SDK) pass arrays of names; any list syntax, such as splitting, is never the use case's concern.

### Requirement: Multi-file mutations are all-or-nothing

When `files` contains more than one name, the use case MUST validate every entry (existence on disk and tracked-entry rules for the requested action) before applying any of them. If any entry fails, it MUST throw the typed error for that entry and persist nothing, so a failing fourth file never leaves three applied.

### Requirement: Path separators are normalized on Windows hosts

Implementation file paths are logical, forward-slash identifiers (see `_global/cross-platform`: persisted and compared paths use `/`). On a Windows host the use case MUST convert every `\` in `file` and each entry of `files` to `/` before validating, comparing, or storing it, so that `packages\core\x.ts` and `packages/core/x.ts` name the same tracked file. On every other host the name is kept byte for byte, because `\` is a valid file name character there. The conversion is the only alteration ever applied to a name (no trimming, no splitting, no case folding), is applied in one isolated helper that takes the platform as a parameter, and is applied identically to every action and every host (CLI, MCP, SDK).

### Requirement: Add mutation creates or enriches implementation links

When `action = add`, the use case MUST require the target file to exist on disk.

The use case MUST require `input.specId` to be provided. If `input.specId` is not present in `change.specIds`, the use case MUST verify that the spec exists in the canonical `SpecRepository` for the spec's workspace. If the spec is not found in `change.specIds` and not found in `SpecRepository`, the use case MUST throw `SpecNotFoundError(input.specId)`.

It MUST create or enrich a confirmed implementation link for the given `specId + file` pair, using symbol refinements when provided. When the file is not already tracked, it MUST add a tracked implementation file entry with state `open`.

### Requirement: Remove mutation removes implementation links

When `action = remove`, the use case SHALL remove confirmed implementation links.

When symbols are provided, it MUST remove only those symbol refinements. When symbols are omitted, it MUST remove the whole `specId + file` link set.

### Requirement: Resolve mutation closes tracked-file review

When `action = resolve`, the use case MUST require the target file to exist on disk and already be tracked by the change.

It MUST move the tracked file into the `resolved` review state.

### Requirement: Unresolve mutation reopens tracked-file review

When `action = unresolve`, the use case MUST require the target file to exist on disk and already be tracked.

It MUST move `resolved` or `ignored` tracked files back to `open`. It MUST NOT reopen tracked files in the `removed` state; those may return to `open` only through refresh-driven resurrection.

### Requirement: Ignore mutation preserves tracked history

When `action = ignore`, the use case SHALL mark the tracked file as `ignored`.

It MAY ignore a missing file only when that file is already tracked. For an untracked file, physical existence MUST be validated before adding it as `ignored`. Confirmed implementation links for the file MUST be preserved.

### Requirement: Start mutation activates implementation tracking

When `action = start`, the use case SHALL activate implementation tracking for the change.

It MUST:

- invoke `Change.startImplementationTracking()` within the mutation boundary
- succeed idempotently if implementation tracking is already active
- not require a `file` path or `specId`

### Requirement: Change must exist

If no change with the given name exists, the use case MUST throw `ChangeNotFoundError`.

### Requirement: Missing-file validation uses typed errors

When a file-required mutation targets a file that is missing on disk or invalid for the requested transition, the use case MUST throw `ImplementationFileNotFoundError` rather than silently mutating state.

### Requirement: Persistence and result projection

The use case MUST persist mutations through `ChangeRepository.mutate`.

It MUST return the resulting `ImplementationTrackingProjection` after the mutation completes.

### Requirement: Config-based factory delegates through resolveUpdateImplementationTrackingDeps

The config-based `createUpdateImplementationTracking(config, options?)` form MUST derive `UpdateImplementationTrackingDeps` through `resolveUpdateImplementationTrackingDeps(resolver)` and then delegate to canonical `createUpdateImplementationTracking(deps)`.

`resolveUpdateImplementationTrackingDeps(resolver)` MUST resolve:

- `changes: ChangeRepository`
- `files: FileReader`
- `projectRoot: string`
- `specRepositories: ReadonlyMap<string, SpecRepository>` (required: the use case always validates `specId` workspaces, see "Input contract")

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Constraints

- `UpdateImplementationTracking` mutates only implementation-tracking state; it does not validate or transition lifecycle state.
- The use case operates on raw project-relative file paths during active-change authoring, which it never splits or trims.
- The use case does not perform autodetection of implementation candidates; that remains `RefreshImplementationTracking`.

## Spec Dependencies

- [`core:change`](../change/spec.md) — tracked implementation file and confirmed link semantics
- [`core:refresh-implementation-tracking`](../refresh-implementation-tracking/spec.md) — complementary autodetection-based refresh path
- [`core:composition-resolver`](../composition-resolver/spec.md) — normalized public composition path for the factory
