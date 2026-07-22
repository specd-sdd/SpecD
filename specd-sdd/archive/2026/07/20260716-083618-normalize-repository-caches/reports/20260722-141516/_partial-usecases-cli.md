# Spec Compliance Audit — Batch: use-cases-cli

Change: `normalize-repository-caches`
Scope: `core:list-changes`, `core:list-drafts`, `core:list-discarded`, `core:list-archived`, `core:list-specs`, `core:get-project-summary`, `core:config-writer-port`, `cli:change-list`, `cli:drafts-list`, `cli:discarded-list`, `cli:archive-list`, `cli:spec-list`, `cli:storage-reindex`, `cli:project-init`

Method: merged spec preview via `changes spec-preview normalize-repository-caches <specId> --format text`, cross-referenced against implementation (`packages/core/src`, `packages/cli/src`), tests, and `docs/`. One finding was empirically reproduced with a live CLI run.

---

## Findings

### 1. `core:get-project-summary` — stale dependency contract in spec (CONFIRMED CANDIDATE)

**Severity:** HIGH
**Classification:** SPEC drift (spec is internally inconsistent; code is correct)

The spec's own **"Orchestrates existing list use cases"** requirement is explicit and unambiguous:

> `GetProjectSummary` MUST obtain change counts without materializing full list results ... It MUST NOT call `ListChanges.execute()`, `ListDrafts.execute()`, or `ListDiscarded.execute()` solely to measure `.length`.

And **"Constructor accepts orchestration dependencies"** correctly describes count-capable deps (`ChangeRepository.count()`/`countDrafts()`/`countDiscarded()`, `ArchiveRepository.count()` or `ListArchived`, `ListWorkspaces`).

But the later **"Config-based factory delegates through resolveGetProjectSummaryDeps"** requirement (and its matching `verify.md` scenario) contradicts the rest of the same document:

> `resolveGetProjectSummaryDeps(resolver)` MUST resolve:
>
> - `listChanges: ListChanges`
> - `listDrafts: ListDrafts`
> - `listDiscarded: ListDiscarded`
> - `listArchived: ListArchived`
> - `listWorkspaces: ListWorkspaces`

**Code evidence** (`packages/core/src/composition/use-cases/get-project-summary.ts:16-34`):

```16:34:packages/core/src/composition/use-cases/get-project-summary.ts
export interface GetProjectSummaryDeps {
  readonly changes: ChangeRepository
  readonly archive: ArchiveRepository
  readonly listWorkspaces: ListWorkspaces
}
...
export function resolveGetProjectSummaryDeps(resolver: CompositionResolver): GetProjectSummaryDeps {
  return {
    changes: resolver.getChangeRepository(),
    archive: resolver.getArchiveRepository(),
    listWorkspaces: resolver.getListWorkspaces(),
  }
}
```

`GetProjectSummary`'s actual constructor (`packages/core/src/application/use-cases/get-project-summary.ts:31-39`) takes `(changes: ChangeRepository, archive: ArchiveRepository, listWorkspaces: ListWorkspaces)` and `execute()` calls `changes.count()/countDrafts()/countDiscarded()`, `archive.count()`, never `ListChanges`/`ListDrafts`/`ListDiscarded`/`ListArchived` instances.

**Test evidence** confirms code is intentional, not accidental: `packages/core/test/composition/use-cases/get-project-summary.spec.ts:98-109` constructs `GetProjectSummaryDeps` with `{ changes, archive, listWorkspaces }` only.

**Verdict:** the "Config-based factory delegates through resolveGetProjectSummaryDeps" requirement section in `spec.md` (and matching scenario in `verify.md`) is stale — left over from an earlier design where the summary literally wired the four list use cases. The refactor that made it count-only (this change's likely intent, given `normalize-repository-caches`) updated the code and most of the spec, but missed this one requirement section. **Recommend: update spec.md/verify.md's `resolveGetProjectSummaryDeps` requirement to match the actual `{ changes, archive, listWorkspaces }` shape** — do not change the code, which is correct and matches the majority of the spec's own text.

---

### 2. `core:list-specs` — identical stale-dependency pattern (NEW, same shape as #1)

**Severity:** HIGH
**Classification:** SPEC drift

The **"Config-based factory delegates through resolveListSpecsDeps"** requirement states:

> `resolveListSpecsDeps(resolver)` MUST resolve:
>
> - `listWorkspaces: ListWorkspaces`
> - `hasher: ContentHasher`
> - `yaml: YamlSerializer`

Matching `verify.md` scenario ("createListSpecs config form derives ListSpecsDeps through resolveListSpecsDeps") repeats the same three-dependency list.

**Code evidence** (`packages/core/src/composition/use-cases/list-specs.ts:14-29`):

```14:29:packages/core/src/composition/use-cases/list-specs.ts
export interface ListSpecsDeps {
  /** Workspace enumeration use case. */
  readonly listWorkspaces: ListWorkspaces
}

export function resolveListSpecsDeps(resolver: CompositionResolver): ListSpecsDeps {
  return {
    listWorkspaces: resolver.getListWorkspaces(),
  }
}
```

`ListSpecsDeps` has exactly one field. There is no `hasher`/`yaml` anywhere in this file, and `ListSpecs`'s actual constructor (`packages/core/src/application/use-cases/list-specs.ts:27-37`) takes only `(listWorkspaces: ListWorkspaces)`. `ContentHasher`/`YamlSerializer` are real ports elsewhere in the codebase (used by e.g. `generate-spec-metadata`, `validate-specs`) but are not part of `ListSpecs`'s dependency graph at all — grep across `packages/core` confirms no association between `ListSpecsDeps` and `ContentHasher`/`YamlSerializer`.

**Verdict:** this requirement/scenario pair in `core:list-specs` is stale, almost certainly copy-drift from an earlier `ListSpecs` design (or a mis-copy from a different use case's deps list) that was never reconciled after the workspace-orchestration refactor. **Recommend: update `spec.md`/`verify.md` to state `resolveListSpecsDeps` resolves only `listWorkspaces: ListWorkspaces`.**

---

### 3. `cli:spec-list` — `--workspace` filter omits non-matching workspaces from JSON/toon output, contradicting spec text and example (CONFIRMED via live run)

**Severity:** HIGH
**Classification:** BOTH — spec's documented contract vs. code + locked-in test disagree; needs a deliberate decision, not a silent drift

`spec.md`'s **"Output format"** requirement is explicit:

> When `--workspace` filters are applied in JSON/toon mode, the `workspaces` array contains entries for all configured workspace names; filtered-out workspaces appear with an empty `specs` array and zeroed `meta`.

And the spec's own **Example** block demonstrates it concretely:

```
$ specd spec list --workspace default --format json
{"workspaces":[{"name":"default","specs":[...]},{"name":"billing","specs":[]}]}
```

**Empirical reproduction** (built CLI, two-workspace project `default` + `billing`, one spec each):

```
$ specd specs list --workspace default --format json
{"workspaces":[{"name":"default","specs":[{"path":"default:auth","title":"auth"}],"meta":{"total":1,"count":1,"limit":100,"page":1}}]}
```

`billing` is completely absent — not present with an empty `specs` array as required.

**Code evidence** (`packages/cli/src/commands/spec/list.ts:210-217, 254-276`):

```210:217:packages/cli/src/commands/spec/list.ts
const workspaces = await kernel.project.listWorkspaces.execute()
const workspaceNames = workspaces.map((w) => w.name)
const workspaceFilter = opts.workspace.length > 0 ? new Set(opts.workspace) : null
const visibleWorkspaces =
  workspaceFilter !== null
    ? workspaceNames.filter((n) => workspaceFilter.has(n))
    : workspaceNames
```

The JSON/toon branch (`output({ workspaces: visibleWorkspaces.map(...) }, fmt)`) iterates only `visibleWorkspaces` — the filtered subset — for _both_ text and JSON modes, even though the spec only requires the filtered/collapsed view for **text** mode (verify.md "Single workspace filter in text mode" scenario) and requires the **full** workspace list for JSON/toon mode.

**Test evidence locks in the current (spec-contradicting) behavior:** `packages/cli/test/commands/spec-list.spec.ts:389-406`:

```389:406:packages/cli/test/commands/spec-list.spec.ts
await program.parseAsync([... 'spec', 'list', '--workspace', 'alpha', '--format', 'json'])

const json = JSON.parse(stdout())
expect(json.workspaces).toHaveLength(1)
expect(json.workspaces[0].name).toBe('alpha')
```

**Verdict:** this is a real, load-bearing contradiction — not a copy/paste artifact. The spec's JSON "show all workspaces, zero out filtered ones" behavior was either (a) an intentional design goal never implemented, or (b) a design that was deliberately simplified away in code+tests without updating the spec. Either way it needs a decision: update `spec.md`/`verify.md`'s Output-format requirement + Example (and the "When `--workspace` filters are applied..." line) to match the simpler "only matching workspaces appear" behavior that both text and JSON modes currently share — **or** fix the CLI to include zeroed entries for non-matching workspaces in JSON/toon mode and add/update the test. Recommend flagging to the change owner for an explicit choice; do not resolve silently.

---

### 4. `docs/core/use-cases.md` — widespread staleness for change/spec list use cases

**Severity:** MEDIUM
**Classification:** DOCS drift

Several use-case doc entries predate the pagination + count-only refactor this change area covers:

- **`ListChanges`/`ListDrafts`/`ListDiscarded`/`ListArchived`** (`docs/core/use-cases.md:347-392`): documented as `Input: none`, `Returns: Promise<Change[]>` / `Promise<ArchivedChange[]>`. Actual signatures take an options object (`ActiveChangeListOptions`, etc.) and return `Promise<ListResult<XxxListEntry>>` — a paginated envelope of row-shape entries, not raw `Change`/`ArchivedChange` entities. The doc's "oldest first" ordering claim is also wrong for `ListDrafts`/`ListDiscarded`/`ListArchived`, which are `draftedAt`/`discardedAt`/`archivedAt` **descending** (newest first) per spec and code — only `ListChanges` is oldest-first ascending.
- **`ListSpecs`** (`docs/core/use-cases.md:707-732`): documented constructor `new ListSpecs(specRepos: ReadonlyMap<string, SpecRepository>, hasher: ContentHasher, yaml: YamlSerializer)` and `Returns: Promise<SpecListEntry[]>`. Actual constructor is `new ListSpecs(listWorkspaces: ListWorkspaces)` and it returns `Promise<ListSpecsResult>` (`{ items, meta, byWorkspace }`), not a bare array. This mirrors finding #2's stale-dependency shape, suggesting docs were generated from the same outdated design.
- **`GetProjectSummary`** (`docs/core/use-cases.md:1109-1144`): documented constructor is `(listChanges, listDrafts, listDiscarded, listArchived, listWorkspaces)` — the same stale shape as finding #1. Worse, the doc states: _"Change counts derive from `ListChanges`, `ListDrafts`, and `ListDiscarded` result lengths"_ — this is precisely the anti-pattern the spec's own "Orchestrates existing list use cases" requirement forbids, and does not match the actual `count()`/`countDrafts()`/`countDiscarded()` based implementation.

**Recommend:** regenerate/update these `docs/core/use-cases.md` sections to match current signatures, return shapes, and ordering — likely a mechanical follow-up once findings #1 and #2 are resolved in the specs, since the docs appear to have been written against the same stale design.

---

### 5. `docs/cli/cli-reference.md` — `project init` `--plugin` option missing `@specd/plugin-agent-standard`

**Severity:** LOW
**Classification:** DOCS drift

`cli:project-init`'s spec ("Known plugin options" requirement, and verify.md "Wizard includes standard agent plugin" scenario) requires 5 known agent plugins, including `@specd/plugin-agent-standard`. The CLI code's `AVAILABLE_AGENT_PLUGINS` (`packages/cli/src/commands/project/init.ts:13-19`) correctly lists all 5. But `docs/cli/cli-reference.md:1029` only lists 4:

```1029:docs/cli/cli-reference.md
| `--plugin <name>`           | Install skills for this agent plugin. Repeatable. Valid values include `@specd/plugin-agent-claude`, `@specd/plugin-agent-copilot`, `@specd/plugin-agent-codex`, `@specd/plugin-agent-opencode`. |
```

`@specd/plugin-agent-standard` is missing. **Recommend:** add it to the docs table.

---

### 6. `cli:archive-list` spec — stale Example contradicts its own Requirement

**Severity:** LOW
**Classification:** SPEC drift (example only; normative requirement text is correct and matches code)

The "Output format — JSON" requirement is explicit: _"List entries MUST NOT include `artifacts` — artifact detail belongs on `get`."_ — and this matches the actual `ArchiveListEntry` shape and `packages/cli/src/commands/archive/list.ts` output (`name`, `archivedName`, `archivedAt`, `specIds`, `schemaName`, `schemaVersion`, `archivedBy`).

But the spec's own **Examples** section shows:

```103:packages/../specd-sdd/.../cli/archive-list/spec.md (preview)
$ specd archive list --format json
[{"name":"add-oauth-login","archivedName":"20240115-120000-add-oauth-login","workspace":"default","archivedAt":"2024-01-15T12:00:00.000Z","archivedBy":{"name":"alice","email":"alice@example.com"},"artifacts":["spec"]}]
```

This example includes `workspace` and `artifacts` fields that (a) directly contradict the requirement two paragraphs above it in the same document, and (b) don't match the actual output shape. It also uses a bare JSON array instead of the `{ items, meta }` envelope described in the same requirement. This is a leftover/stale example predating the current envelope + `ArchiveListEntry` shape. **Recommend:** update the example to match the documented JSON schema (`{ items: [...], meta: {...} }`, no `workspace`/`artifacts`).

---

### 7. `cli:project-init` — interactive-mode flag detection uses default-value comparison (OBSERVATION, not confirmed as a bug)

**Severity:** LOW / INFO
**Classification:** CODE (potential edge case) — no test evidence either way

The spec's "Interactive mode" requirement says the wizard triggers only when, among other things, "No configuration flags (`--schema`, `--workspace`, `--workspace-path`, `--plugin`) are provided." The implementation (`packages/cli/src/commands/project/init.ts:74-79`) detects this by comparing resolved option values to their Commander defaults:

```74:79:packages/cli/src/commands/project/init.ts
const hasFlags =
  opts.schema !== undefined ||
  opts.workspace !== 'default' ||
  opts.workspacePath !== 'specs/' ||
  opts.plugin.length > 0
```

Because `--workspace` and `--workspace-path` have Commander-level defaults (`'default'`, `'specs/'`), a user who explicitly passes `--workspace default` (same value as default) with a TTY and no other flags would still be treated as having "no configuration flags provided" and routed into the interactive wizard — technically a flag _was_ provided. This is an inherent limitation of Commander's default-value mechanism rather than a deliberate divergence, and no test in `project-init.spec.ts` exercises this exact edge case in either direction, so it cannot be confirmed as a real defect — flagging for awareness only, not as an actionable finding.

---

## Areas checked with no findings

- `core:list-changes`, `core:list-drafts`, `core:list-discarded`, `core:list-archived` — use case bodies, composition factories (`resolveList*Deps`), and kernel wiring (`kernel.changes.list/listDrafts/listDiscarded/listArchived`) all match spec exactly (pure delegation, no re-sort/filter/paginate, correct default limit inheritance from repository).
- `core:config-writer-port` — `FsConfigWriter.initProject/addPlugin/removePlugin/listPlugins` match the port contract; `AlreadyInitialisedError`/`force` guard, storage-block omission, `.gitignore` append, and `{configPath}/tmp/.gitignore` (via shared `ensureTmpGitignore`, consistently invoked from `change-repository.ts`, `archive-repository.ts`, `spec-repository.ts`, and `config-writer.ts`) all check out.
- `cli:change-list`, `cli:drafts-list`, `cli:discarded-list`, `cli:archive-list` — flag mapping, pagination mutual-exclusivity (`parseListPaginationFlags`), table rendering (global fixed widths via `colWidth`/`renderTable`, wrap overflow, truncation hint), and JSON/toon envelopes match spec.
- `cli:storage-reindex` — flag combinability, port-only delegation (`kernel.changes.repo.reindex()`, `ws.specRepo.reindex()`, `kernel.changes.archiveRepo.reindex()`), and text/JSON output shapes match spec; no per-bucket reindex methods called.
- `cli:project-init` — git-root resolution, `createConfigWriter().initProject()` delegation (no `InitProject`/`kernel.project.init` usage), plugin install pipeline, and already-initialised handling all match spec (aside from the low-confidence observation in #7).

---

## Summary table

| #   | Spec(s)                                    | Severity | Type                         | Status                          |
| --- | ------------------------------------------ | -------- | ---------------------------- | ------------------------------- |
| 1   | `core:get-project-summary`                 | HIGH     | SPEC drift                   | Confirmed (known candidate)     |
| 2   | `core:list-specs`                          | HIGH     | SPEC drift                   | Confirmed (new)                 |
| 3   | `cli:spec-list`                            | HIGH     | BOTH — needs decision        | Confirmed via live repro + test |
| 4   | `docs/core/use-cases.md`                   | MEDIUM   | DOCS drift                   | Confirmed                       |
| 5   | `docs/cli/cli-reference.md` (project init) | LOW      | DOCS drift                   | Confirmed                       |
| 6   | `cli:archive-list` spec example            | LOW      | SPEC drift (example only)    | Confirmed                       |
| 7   | `cli:project-init` interactive detection   | LOW/INFO | CODE (unconfirmed edge case) | Observation only                |
