# Partial compliance: core-c (generate-metadata, validate-specs, preview-spec, spec-metadata)

Change: support-commas-in-names. Read-only audit. Note: `changes spec-preview` rejected `core:core/...` ids; used delta files in `deltas/core/<spec>/` plus code instead. Spec IDs for this change are `core:<name>` style paths (e.g. `core:generate-metadata`), the merged text was taken from the delta YAMLs.

Shared implementation: `packages/core/src/domain/services/parse-spec-id.ts:42-83` (`parseSpecId`: blank check, split at first `:`, workspace rule, empty cap path, `:` in path, per segment empty / Windows device / backslash / `[a-z0-9_][a-z0-9_-]*`, optional workspace-set check -> `WorkspaceNotFoundError`, returns `{workspace, capPath, specId}`); `isFullyQualifiedSpecId` at :91-100; rules in `spec-id-rules.ts`. A comma fails the segment regex, so `auth/a,b` -> `InvalidSpecIdError` whose message is `Invalid spec ID '<value>': ...` (`invalid-spec-id-error.ts:26-28`) i.e. quotes the full value.

---

## core:generate-metadata (Requirement: Spec resolution, modified)

### Requirements Summary

Validate/normalize `specId` with `parseSpecId` + configured workspaces; invalid -> `InvalidSpecIdError`; unknown workspace -> `WorkspaceNotFoundError`; spec missing -> `SpecNotFoundError`; adapters do no own validation.

### Implementation Status: COMPLIANT

- `generate-spec-metadata.ts:101-103` `listWorkspaces` then `parseSpecId(input.specId, { workspaces })`; `:105-110` repo lookup, `SpecNotFoundError` at `:110-112`.
- Parse happens before `specRepo.get`, satisfying "before any repository lookup".

### Scenarios and test coverage

| Scenario                                                         | Status                  | Evidence                                                                                                                                                                        |
| ---------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invalid spec ID rejected (`'Bad Id'`)                            | Covered (input differs) | `generate-spec-metadata.spec.ts:~633-645` uses `''` and asserts `repo.get` not called. `'Bad Id'` (space/uppercase segment path) not used                                       |
| Bare spec ID normalized (`_global/architecture` -> default)      | Partial                 | `:~652-668` bare `auth/login` resolves; asserts only that result exists, not workspace `default` / capPath explicitly. `:170-264` is a different (dependsOn normalization) test |
| Unknown workspace -> WorkspaceNotFoundError (existing behaviour) | Covered                 | `:671-686`                                                                                                                                                                      |

### Discrepancies

- LOW (test gap): scenario literal inputs `'Bad Id'` / `_global/architecture` not exercised; resolved workspace/capPath not asserted. Option A (test gap): tighten tests. Option B (spec drift): none, equivalent semantics.
- INFO: schema provider and `listWorkspaces` run before `parseSpecId` (`:93-103`), so an invalid id still pays schema load cost. Spec only requires parse before repository lookup; no violation.

### Missing tests

1. Explicit `'Bad Id'` case; 2. assertion of `default` / `_global/architecture` resolution.

---

## core:validate-specs (Requirement: Single spec validation mode, modified)

### Requirements Summary

`specPath` is `workspace:capPath` or bare (-> default). Steps: validate+normalize with parseSpecId (InvalidSpecIdError), repo lookup (WorkspaceNotFoundError), `repo.get` (SpecNotFoundError), validate single spec. No adapter validation.

### Implementation Status: COMPLIANT

- `validate-specs.ts:132-146`: `parseSpecId(input.specPath, { workspaces: this._specs.keys() })`, `specRepo = this._specs.get(workspace)!`, `SpecNotFoundError(specId)` at :142-144. Workspace unknown handled inside parseSpecId (same error class: `application/errors/workspace-not-found-error.ts` re-exports the domain one).
- `:593` second `parseSpecId(args.label)` is internal on an already-qualified label; fine.

### Scenarios and test coverage

| Scenario                     | Status                 | Evidence                                                                                                   |
| ---------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| Invalid specPath (`'ws:'`)   | MISSING for this input | `validate-specs.spec.ts:433-446` tests `''` and `'auth/a,b'`; `'ws:'` (empty capPath) not tested           |
| Bare specPath -> default     | Covered                | `:448-466` asserts totalSpecs 1, passed 1 (does not assert the entry id is `default:_global/architecture`) |
| Comma not split (`auth/a,b`) | Covered, weak          | `:445` asserts `InvalidSpecIdError` only; spec says "quoting `auth/a,b`" -> message/`value` not asserted   |
| Unknown workspace            | Covered                | `:~425-431`                                                                                                |
| SpecNotFound                 | Covered                | `:~468-475`                                                                                                |

### Discrepancies

- LOW (test gap): `'ws:'` untested; quoting of `auth/a,b` unasserted (code does quote via `InvalidSpecIdError.value`).

### Missing tests

1. `specPath: 'ws:'`; 2. assert `error.value === 'auth/a,b'` or message contains it; 3. assert entry resolves to `default:...`.

---

## core:preview-spec (Input, Spec ID validation, Spec Dependencies, modified)

### Requirements Summary

`specId` bare or qualified, normalized; validated "before any other work" with `parseSpecId` + configured workspaces (InvalidSpecIdError, WorkspaceNotFoundError quoting full original value); then must be in `change.specIds` else `SpecNotInChangeError`. Dependency on `core:spec-id-format` declared.

### Implementation Status: COMPLIANT

- `preview-spec.ts:101-103` parseSpecId is first statement; change lookup at :105; membership check at :112-114 uses normalized `specId`.
- Spec/delta dependency list: `core:spec-id-format` added by delta (spec text only).

### Scenarios and test coverage

| Scenario                               | Status                                       | Evidence                                                                       |
| -------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------ |
| Invalid specId before membership check | Covered (`''`, `'Core/Foo'`, not `'Bad Id'`) | `preview-spec.spec.ts:598-614`, also :651-659 asserts `changes.get` not called |
| Bare specId normalized then checked    | Covered                                      | `:616-629` asserts `result.specId === 'default:auth/login'`                    |
| Unknown workspace                      | Covered                                      | `:639-649` (also asserts change not loaded)                                    |
| SpecNotInChange (existing)             | Covered                                      | `:133`                                                                         |

### Discrepancies

- LOW (doc drift in code): `execute` TSDoc `@throws` (:92-96) lists ChangeNotFound/SchemaMismatch/SpecNotInChange but not `InvalidSpecIdError` / `WorkspaceNotFoundError`. Option A: code docs bug, add `@throws`. Option B: none (spec is correct).
- INFO: spec says error "quoting the full original value"; test does not assert quoting.

### Missing tests

Assertion of quoted original value; literal `'Bad Id'` (equivalent).

---

## core:spec-metadata (Requirement: Structural validation before persistence, modified)

### Requirements Summary

`PersistSpecMetadata` validates with `strictSpecMetadataSchema`; `dependsOn` and `implementation[].specId` must be fully-qualified per `core:spec-id-format`; schema does not keep own regex; failure -> typed error, no write. Lenient read path tolerates bare entries.

### Implementation Status: COMPLIANT

- `parse-metadata.ts:9-11` `qualifiedSpecIdString` refine using `isFullyQualifiedSpecId` (delegates to parseSpecId, no own regexes). Used at :91 (`dependsOn`), :124 (`implementation.files[].specId`), :132 (`symbols[].specId`).
- Lenient `specMetadataSchema` (:14-) uses plain `z.string()` for dependsOn (:19), so bare/empty entries read OK.
- `persist-spec-metadata.ts:33-38` `strictSpecMetadataSchema.safeParse` -> `MetadataValidationError`, no write.

### Scenarios and test coverage

| Scenario                               | Status                       | Evidence                                                                                                                             |
| -------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Bare dependsOn rejected on persistence | Covered                      | `persist-spec-metadata.spec.ts:~33-60` (typed error + `writeMetadataSnapshot` not called); schema level `parse-metadata.spec.ts:118` |
| Empty dependsOn entry rejected         | Covered at schema level only | `parse-metadata.spec.ts:126`; no PersistSpecMetadata-level test                                                                      |
| Existing bare entry still reads        | Covered                      | `parse-metadata.spec.ts:33-42`                                                                                                       |
| implementation specId strict           | Covered                      | `parse-metadata.spec.ts:210` (bare file specId); symbols specId not separately tested                                                |

### Discrepancies

- LOW (pre-existing spec drift, outside delta): bullet list in the requirement differs from `strictSpecMetadataSchema`: `keywords` regex `^[a-z][a-z0-9-]*$` (spec: "non-empty lowercase strings"), `contentHashes` values must match `sha256:<64 hex>` (spec: "hash string"), `scenarios` given/when optional and only `then` required non-empty (spec: all of requirement, name, when, then, given), `rules.rules` nonempty, plus undocumented `context`, `generatedBy`. Option A: update spec to match code. Option B: code too lenient/strict vs spec. Not introduced by this change.
- LOW (test gap): empty-entry scenario and `symbols[].specId` not tested via `PersistSpecMetadata`.

### Contradictions with dependency specs

None found. `core:spec-id-format` (`specs/core/spec-id-format/spec.md`) requires split on first colon, default workspace, unknown workspace rejection, Windows device names: all implemented in `parseSpecId`. Note: that spec as read does not explicitly list allowed characters (the segment regex and "no comma" rule live only in code and in this change's other specs); confirm another spec in the change covers them (not in my scope).

---

## Counts

Discrepancies: HIGH 0, MEDIUM 0, LOW 6 (generate-metadata test gap; validate-specs test gap; preview-spec TSDoc drift; spec-metadata pre-existing schema drift; spec-metadata test gap; plus quoting-not-asserted across 3 specs counted within them), INFO 3.
Implementation of all four specs: compliant; every scenario has at least partial test coverage; missing exact-input tests: generate-metadata `'Bad Id'`, validate-specs `'ws:'`, spec-metadata PersistSpecMetadata empty entry.
