# Spec Compliance — change support-commas-in-names

Mode: change (read-only). Scope: 31 change specs + project-wide specs (`default:_global/*`) and direct dependencies for consistency checks. Audit 4 of this change; follow-up to audit 20261104-103701.

## Summary

| Result     | Count                 |
| ---------- | --------------------- |
| Specs PASS | 30                    |
| Specs FAIL | 1 (`cli:change-deps`) |
| CRITICAL   | 0                     |
| HIGH       | 0                     |
| MEDIUM     | 1 (F1)                |
| LOW        | 3 (F2, F3, F4)        |
| INFO       | 2 (F5, F6)            |

All findings of audit 20261104-103701 (M1–M6, L1–L14) are closed in code. The one new MEDIUM: `changes deps <change> <spec> --add/...` prints the typed spec ID in text output instead of the fully-qualified ID returned by the use case; the existing test masks it with a mock that returns an unqualified ID.

Limits: tests, typecheck and lint were not re-run; 17 of 31 specs were verified by carry-over from the previous audit plus artefact presence checks (see per-spec table).

## Detailed Findings

# Partial compliance audit (inline, single auditor) — change `support-commas-in-names`

Scope: the 31 change specs (see report header). Mode `change`; read-only. No subagents were used (the auditor was itself a subagent), so all batches are merged into this one partial.

Method: `changes status` for scope; merged deltas read from `deltas/<ws>/<spec>/{spec,verify}.md.delta.yaml`; code read in `packages/{core,cli,skills}/src`; test presence and titles checked in `packages/*/test`; docs checked in `docs/`. Compared against audit 20261104-103701 and its design section "Audit hardening" (M1–M6, L1–L14). Test suites, lint and typecheck were NOT re-run in this audit (execution was not authorised); test-coverage statements below are by source inspection only.

Legend: severity HIGH (behaviour contradicts a requirement) / MEDIUM (requirement partly met or cross-spec contradiction) / LOW / INFO. (A) = spec drift is likely, (B) = code bug is likely.

Verification depth: **V** = code re-read in this audit; **C** = carried from audit 20261104-103701 plus presence checks of the code/test/doc artefacts named by the hardening design (no contradicting evidence found).

---

## Closure of the previous audit's findings (audit 20261104-103701)

| ID  | Item                                                                               | Status             | Evidence                                                                                                                                                                                                                                                                                  |
| --- | ---------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | `change deps` display no longer parses IDs in the CLI                              | CLOSED (V)         | `cli/src/commands/change/deps.ts` has no `parseSpecId`/`listWorkspaces`; display calls `kernel.changes.getSpecDeps.execute({ name, specId })`; `core/src/application/use-cases/get-change-spec-deps.ts` validates, normalizes, checks `change.specIds`; composition factory + tests exist |
| M2  | `project init` uses `isValidWorkspaceName`, no private regex                       | CLOSED (V)         | `cli/src/commands/project/init.ts:63,201`; guard test at `cli/test/commands/project-init.spec.ts:379`                                                                                                                                                                                     |
| M3  | `specs deps` renders returned `initialized`; clear wording; repair hint            | CLOSED (V)         | `cli/src/commands/spec/deps.ts` (`renderDepsResult(result, …)`, "nothing was removed", `clearing requires confirmation; pass --force to skip it`); `cli/src/handle-error.ts:196-209` hint is exactly the three repair commands, only for `dependsOn` field paths                          |
| M4  | Schema reassignment verifies artifacts parse                                       | CLOSED (V by grep) | `update-persisted-spec-schema.ts:118,157-175` `_loadParsedArtifacts` throws `ArtifactParseError`                                                                                                                                                                                          |
| M5  | codeRoot confinement via `path.relative`, qualifier only when valid workspace name | CLOSED (V)         | `update-persisted-spec-implementation.ts` `_normalizeFile`; existence check runs after confinement and before `readPersistedState`                                                                                                                                                        |
| M6  | fs-level tests for lenient reads                                                   | CLOSED (V by grep) | `core/test/infrastructure/fs/spec-repository.spec.ts:1324-1346`                                                                                                                                                                                                                           |
| L1  | `UpdateImplementationTracking` four deviations                                     | CLOSED (V)         | original vs logical entries, `file`+`files` union, `InvalidInputError` guard for missing `specId`, mandatory `specRepositories`                                                                                                                                                           |
| L2  | `EditChange` dedup removals, lazy actor                                            | CLOSED (V)         | `edit-change.ts` `[...new Set(removeNormalized)]`, `resolveActor`                                                                                                                                                                                                                         |
| L4  | `ReadOnlyWorkspaceError.forSpec`                                                   | CLOSED (V)         | used in the four persisted-state use cases and `initialize-persisted-spec-state.ts`                                                                                                                                                                                                       |
| L5  | dead `WorkspaceNotFoundError` branches                                             | CLOSED (V by grep) | none left in `get-persisted-spec-schema.ts`, `update-persisted-spec-deps.ts`                                                                                                                                                                                                              |
| L6  | `workspacesFromSpecIds` uses `parseSpecId`                                         | CLOSED (V)         | `domain/archived-change-index-entry.ts:35-41`                                                                                                                                                                                                                                             |
| L9  | `change edit` usage check before config resolution                                 | CLOSED (V)         | `cli/src/commands/change/edit.ts`                                                                                                                                                                                                                                                         |
| L10 | `collectString` removed                                                            | CLOSED (V)         | `change/implementation.ts` imports `collect`                                                                                                                                                                                                                                              |
| —   | comma splitting removed from file/spec/path lists                                  | CLOSED (V)         | remaining `split(',')` in `cli/src` are closed-vocabulary only (`graph impact --type`, `parse-file-categories`, `parse-comma-values` for `--status`/`--kind`/`--skip-hooks`); no comma-joined `--file/--spec/--add` examples in `packages/skills/templates`                               |
| —   | docs updated                                                                       | CLOSED (V by grep) | `docs/cli/{changes,spec-deps,cli-reference}.md`, `docs/core/{errors,overview,ports,services,use-cases}.md`, `docs/sdk/index.md`, `docs/guide/*` contain the new constructs                                                                                                                |

---

## New findings

### F1 — MEDIUM (B, test masks it) — `cli:change-deps`: mutation text output prints the typed spec ID, not the normalized one

Spec: `cli:change-deps` requirement "Output shows the normalized spec ID": "In every output format the command MUST show the fully-qualified spec ID returned by the use case (`default:auth/login` for a typed `auth/login`), never the raw typed value, so text, JSON, and TOON agree."

Code: `packages/cli/src/commands/change/deps.ts` (modification branch, text format):

```ts
output(`updated deps for ${specId} in change ${name}\ndependsOn: ${depsStr}`, 'text')
```

uses the raw positional `specId`, while the JSON/TOON branch right below uses `result.specId`. `bare` input `auth/login` therefore prints `updated deps for auth/login …` in text but `"specId":"default:auth/login"` in JSON/TOON. The display branch (`shown.specId`) is correct. The `--clear` confirmation prompt also quotes the raw ID (acceptable: it is a prompt, not output).

Why the test does not catch it: `cli/test/commands/change-deps.spec.ts:40-66` ("Add deps to a spec in the change") mocks `updateSpecDeps.execute` to return `specId: 'auth/login'` (unqualified, unlike the real use case) and asserts `updated deps for auth/login in change add-auth`, so it pins the raw-ID behaviour.

(B) Fix: print `result.specId`; make the mock return `default:auth/login` and assert it. (A) alternative: narrow the spec wording to "display mode and structured output" — not recommended, the design (finding M1) states text and JSON must agree.

### F2 — LOW (A) — `cli:change-deps` Constraints still say listing/display use `GetStatus` or direct repository access

Delta constraint: "Listing and display modes use `GetStatus` or direct repository access to retrieve dependencies." Display mode now goes through the new `GetChangeSpecDeps` use case (which wraps `GetStatus`). Behaviour is what the amended requirement above it describes; the constraint line is stale. Update the line to mention the core operation.

### F3 — LOW (A) — `core:update-spec-deps` error text names CLI flags

`UpdateSpecDeps` (core) throws `InvalidInputError('--set is mutually exclusive with --add, --remove, and --clear')` and `'at least one of --add, --remove, --set, or --clear must be provided'`. A core use case is host-neutral (`_global/architecture`: adapters are delivery-only; hosts include MCP/SDK). Not contradicted by the change spec text as far as read (spec lists the error condition, not the wording); the same wording is duplicated in the CLI as fast-fail. Consider host-neutral wording (`set`, `add`, `remove`, `clear`) as the sibling `UpdatePersistedSpecDeps` already does (`'set is mutually exclusive with add, remove, and clear'`). Inconsistent between the two sibling use cases.

### F4 — LOW (B, pre-existing) — `UpdateImplementationTracking` with no files

`entries.length === 0` throws `ImplementationFileNotFoundError('')` (message `Implementation file "" does not exist`). An empty `files: []` is an input-shape error, not a missing file; `InvalidInputError` would be the accurate type. Spec silent.

### F5 — INFO — workspace contains unrelated modifications

`git status` shows 16 modified `specs/**/spec-lock.json` files outside this change's scope (dated Nov 3) and several untracked exploration files at the repository root (`EXPLORATION_*.md`, a `SpecD — Análisis …md`, `dev/scripts/*-poc*`). Not part of the change; flagged only so they are not committed with it. `AGENTS.md`/`CLAUDE.md` are also modified.

### F6 — INFO — `--skip-hooks` comma list is not in the design's closed-vocabulary list

Design "Non-goals" enumerates `--type`, `--category`, `--status`, `--kind`; `change archive/transition --skip-hooks` also uses `parseCommaSeparatedValues` over a closed set (`VALID_*_HOOK_PHASES`), so it cannot contain a comma-bearing name. Compliant; add it to the list for completeness. `graph impact --workspace/--exclude-workspace` values are trimmed (`normalizeRepeatedValues`) — these are workspace names (cannot contain spaces/commas under `isValidWorkspaceName`), so no conflict with "names are whole names".

---

## Per-spec results (31 specs)

Depth: V = re-read here; C = carried from the previous audit with presence checks.

| #   | Spec                                      | Depth    | Result   | Notes                                                                                                                                                             |
| --- | ----------------------------------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | core:update-implementation-tracking       | V        | PASS     | L1 items closed; F4 (LOW)                                                                                                                                         |
| 2   | cli:change-implementation                 | V        | PASS     | `--file <paths...>` variadic + repeatable on resolve/unresolve/ignore, raw forwarding, `collect` for `--symbol`                                                   |
| 3   | core:edit-change                          | V        | PASS     | validation, readOnly lines, dedup, lazy actor                                                                                                                     |
| 4   | cli:change-edit                           | V        | PASS     | no ownership logic in CLI; usage check before config                                                                                                              |
| 5   | core:spec-id-format                       | V        | PASS     | `parseSpecId`, `spec-id-rules.ts`, `SpecPath._validateSegments`, `isFullyQualifiedSpecId` match the spec; `InvalidSpecIdError`/`WorkspaceNotFoundError` in domain |
| 6   | core:update-spec-deps                     | V        | PASS     | F3 (LOW)                                                                                                                                                          |
| 7   | cli:change-deps                           | V        | **FAIL** | F1 (MEDIUM), F2 (LOW)                                                                                                                                             |
| 8   | core:update-persisted-spec-deps           | V/C      | PASS     | remove-before-add, `initialized` result, `forSpec`                                                                                                                |
| 9   | cli:spec-deps                             | V        | PASS     | returned `initialized` rendered, clear wording, `--force`                                                                                                         |
| 10  | core:spec-lock                            | V        | PASS     | strict `isFullyQualifiedSpecId` refine, lenient `dependsOn` option, `InvalidSpecLockError` conversion                                                             |
| 11  | core:workspace                            | C        | PASS     | two-or-more-character rule shared via `isValidWorkspaceName`                                                                                                      |
| 12  | core:create-change                        | C        | PASS     | behaviour already correct per design L3; tests present                                                                                                            |
| 13  | cli:graph-index                           | C        | PASS     | `--exclude-path <glob...>` no split; docs updated                                                                                                                 |
| 14  | skills:workflow-automation                | C        | PASS     | templates free of comma-joined lists; template test extended                                                                                                      |
| 15  | core:generate-metadata                    | C        | PASS     |                                                                                                                                                                   |
| 16  | core:validate-specs                       | C        | PASS     |                                                                                                                                                                   |
| 17  | core:preview-spec                         | C        | PASS     |                                                                                                                                                                   |
| 18  | core:config                               | C        | PASS     | `InvalidSpecPatternError` / `parseSpecPattern` present                                                                                                            |
| 19  | core:get-persisted-spec-deps              | C        | PASS     |                                                                                                                                                                   |
| 20  | core:get-persisted-spec-implementation    | C        | PASS     |                                                                                                                                                                   |
| 21  | core:get-persisted-spec-optimizations     | C        | PASS     |                                                                                                                                                                   |
| 22  | core:get-persisted-spec-schema            | C        | PASS     | dead branch removed                                                                                                                                               |
| 23  | core:update-persisted-spec-implementation | V        | PASS     | M5 closed                                                                                                                                                         |
| 24  | core:update-persisted-spec-optimizations  | C        | PASS     |                                                                                                                                                                   |
| 25  | core:update-persisted-spec-schema         | V (grep) | PASS     | M4 closed                                                                                                                                                         |
| 26  | core:spec-metadata                        | C        | PASS     |                                                                                                                                                                   |
| 27  | core:config-loader                        | C        | PASS     |                                                                                                                                                                   |
| 28  | cli:change-create                         | C        | PASS     |                                                                                                                                                                   |
| 29  | cli:project-init                          | V        | PASS     | M2 closed                                                                                                                                                         |
| 30  | core:spec-repository-port                 | C        | PASS     | lenient read/revision documented (`docs/core/ports.md`)                                                                                                           |
| 31  | core:archived-change-index-entry          | V        | PASS     | L6 closed                                                                                                                                                         |

Totals: PASS 30, FAIL 1. Findings: CRITICAL 0, HIGH 0, MEDIUM 1, LOW 3, INFO 2.

## Consistency with project-wide specs (default:\_global/\*)

- architecture: CLI no longer imports `parseSpecId`/`SpecPath` (grep of `cli/src` finds none); `confirm.ts` is a delivery helper; new use case in application layer with composition factory — compliant. F3 notes host-specific wording in a core error.
- conventions / eslint / docs: new public symbols reviewed carry JSDoc with `@throws`; named exports only; kebab-case files — compliant in the files read.
- cross-platform: `toLogicalFilePath` isolated with injected platform; confinement uses `node:path` — compliant.
- error-handling-conventions: new errors extend `SpecdError` (`InvalidSpecIdError`, `InvalidSpecLockError`, `InvalidSpecPatternError`) — compliant.
- testing: no snapshot usage seen; F1 shows one test whose mock deviates from the real use-case return shape.

## Not done / limits

- `pnpm test`, `typecheck` and `lint` were not executed in this audit; statements about passing suites come from audit 20261104-103701 only.
- Specs marked C were not re-read line by line; confidence in them rests on the previous audit and on presence checks of every artefact named in the hardening design.
- Graph was stale at start (`CONTENT_KNOWN_STALE`); `specd graph index` was run once (writes only the graph store) before the audit.
