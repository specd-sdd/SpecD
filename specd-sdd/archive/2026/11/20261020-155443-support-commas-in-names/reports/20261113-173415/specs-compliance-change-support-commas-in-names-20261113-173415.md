# Spec Compliance Audit Report — support-commas-in-names

- **Timestamp:** 2026-11-13 17:34:15
- **Change:** `support-commas-in-names`
- **Previous Audit:** [specs-compliance-change-support-commas-in-names-20261113-165734.md](file:///Users/monki/Documents/Proyectos/specd/specd-sdd/changes/20261020-155443-support-commas-in-names/reports/20261113-165734/specs-compliance-change-support-commas-in-names-20261113-165734.md)
- **Specs Audited:** 31
- **Code Graph:** Indexed (`1332` files, `300` specs, `0` errors)
- **Summary of Findings:**
  - **HIGH:** 0 (down from 1 — `cli:project-init` resolved)
  - **MEDIUM:** 1 (down from 6 — only pre-existing `core:generate-metadata` early-return spec drift remains)
  - **LOW:** 3 (down from 10 — only 3 pre-existing minor items remain)

---

## Verification of Fixes Since Prior Audit (16:57:34)

| Prior Finding                                                                                                                                                                       | Severity      | Resolution Verified                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli:project-init` — _Two-character workspace id accepted_ verify scenario vs `workspaces.default`                                                                                  | HIGH          | Resolved in `deltas/cli/project-init/verify.md.delta.yaml`; `spec-preview` confirms scenario asserts `initProject` receives `workspaceId: 'ab'` without conflicting with `ConfigLoader` (`workspaces.default`).                                                                                                                                                                                                                                                                                                                                |
| `core:update-persisted-spec-implementation` — Missing runtime `action` validation                                                                                                   | MEDIUM        | Resolved in [`update-persisted-spec-implementation.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/update-persisted-spec-implementation.ts#L77-L92): validates `input.action === 'add' \|\| input.action === 'remove'` and throws `InvalidInputError` with `@throws {InvalidInputError}` JSDoc; verified in `update-persisted-spec-implementation.spec.ts` (23/23 passed).                                                                                                                          |
| `core:update-persisted-spec-implementation` — Non-cross-platform `C:\x` test assertion                                                                                              | MEDIUM        | Resolved in `packages/core/test/application/use-cases/update-persisted-spec-implementation.spec.ts` using `process.platform === 'win32'`; 23/23 passed.                                                                                                                                                                                                                                                                                                                                                                                        |
| `core:validate-specs` — `ValidateSpecsDeps.getMetadata` type drift (`ReadonlyMap` vs single `GetSpecMetadata`)                                                                      | MEDIUM        | Resolved in `deltas/core/validate-specs/spec.md.delta.yaml` & `verify.md.delta.yaml`; `spec-preview` aligns with composition implementation.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `core:get-persisted-spec-optimizations` — `specRepositories` + `getActiveSchema` composition drift                                                                                  | MEDIUM        | Resolved in `deltas/core/get-persisted-spec-optimizations/spec.md.delta.yaml`; `spec-preview` matches [`get-persisted-spec-optimizations.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/get-persisted-spec-optimizations.ts#L16-L36).                                                                                                                                                                                                                                                              |
| `core:update-persisted-spec-implementation` — composition collaborator drift                                                                                                        | MEDIUM        | Resolved in `deltas/core/update-persisted-spec-implementation/spec.md.delta.yaml`; `spec-preview` matches implementation, and `resolveUpdatePersistedSpecImplementationDeps` tests added (4/4 passed).                                                                                                                                                                                                                                                                                                                                         |
| `core:update-persisted-spec-schema` — composition collaborator drift                                                                                                                | MEDIUM        | Resolved in `deltas/core/update-persisted-spec-schema/spec.md.delta.yaml`; `spec-preview` matches [`update-persisted-spec-schema.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/update-persisted-spec-schema.ts#L19-L48), and `resolveUpdatePersistedSpecSchemaDeps` tests added (4/4 passed).                                                                                                                                                                                                     |
| `core:get-persisted-spec-{deps,implementation,schema}`, `core:update-persisted-spec-deps` — `specRepositories` / collaborator drift                                                 | LOW (x4)      | Resolved in their respective `spec.md.delta.yaml` files; `spec-preview` outputs match composition implementations.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| JSDoc `@throws` omissions in `CreateChange.execute`, `GenerateSpecMetadata.execute`, `ValidateSpecs.execute`                                                                        | LOW (x3)      | Resolved in [`create-change.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/create-change.ts#L103) (`IncompatibleSchemaError`), [`generate-spec-metadata.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/generate-spec-metadata.ts#L93-L94) (`SpecNotFoundError`, `SchemaNotFoundError`), and [`validate-specs.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/validate-specs.ts#L117) (`SpecNotFoundError`). |
| Task `23.4` test coverage gaps (`resolveUpdatePersistedSpecImplementationDeps`, `resolveUpdatePersistedSpecSchemaDeps`, `change-create --format toon`, `change-edit --format toon`) | Missing Tests | Added and verified: `@specd/core` (31/31 passed across 3 files) and `@specd/cli` (22/22 in `change-create.spec.ts`, 18/18 in `change-edit.spec.ts`).                                                                                                                                                                                                                                                                                                                                                                                           |

---

## Remaining Findings (Pre-Existing Outside Change Scope)

### 1. [MEDIUM] `core:generate-metadata` — Spec drift on schema with no `metadataExtraction`

- **Evidence:** `core:generate-metadata` spec (`Schema resolution`) states that if the resolved schema has no `metadataExtraction` declarations, the use case returns `{ metadata: {}, hasExtraction: false }` immediately. In [`generate-spec-metadata.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/generate-spec-metadata.ts#L96-L110), `execute` still loads artifacts and computes `contentHashes`, `provenance`, and `sourceState` even when `hasExtraction` is `false` (asserted by `generate-spec-metadata.spec.ts#L668-L670`).
- **Assessment:** Pre-existing spec drift unrelated to `support-commas-in-names` requirements.

### 2. [LOW] `core:update-implementation-tracking` — `verify.md` `specRepositories?` optionality marker

- **Evidence:** `core:update-implementation-tracking` `verify.md` still shows `specRepositories?: ReadonlyMap<string, SpecRepository>`, whereas `spec.md` and `packages/core/src/composition/use-cases/update-implementation-tracking.ts` require `specRepositories`.
- **Assessment:** Minor pre-existing verify-doc drift.

### 3. [LOW] `core:update-spec-deps` — "Change lookup" wording vs `ChangeRepository.mutate`

- **Evidence:** "Change lookup" section in `core:update-spec-deps` references `ChangeRepository.get`, while implementation and "Persistence and output" use `ChangeRepository.mutate`.
- **Assessment:** Minor pre-existing wording drift.

### 4. [LOW] `core:generate-metadata` — `GenerateSpecMetadata.execute` JSDoc omits `@throws {DependsOnOverwriteError}`

- **Evidence:** [`generate-spec-metadata.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/generate-spec-metadata.ts#L91-L95) documents `InvalidSpecIdError`, `WorkspaceNotFoundError`, `SpecNotFoundError`, and `SchemaNotFoundError`, omitting `DependsOnOverwriteError`.
- **Assessment:** Minor JSDoc omission per `default:_global/error-handling-conventions`.

---

## Validation & Test Summary

- `node packages/cli/dist/index.js specs validate --all --format text`: **300 passed, 0 failed**
- `node packages/cli/dist/index.js changes validate support-commas-in-names --all --format text`: **65/65 steps passed**
- `implementing` post-hooks (`pnpm test`, `pnpm lint`, `pnpm typecheck` across workspace): **3/3 passed**
- Targeted Vitest runs after final edits:
  - `@specd/core` (`update-persisted-spec-implementation.spec.ts`, composition `update-persisted-spec-implementation.spec.ts`, composition `update-persisted-spec-schema.spec.ts`): **31/31 passed**
  - `@specd/cli` (`change-create.spec.ts`, `change-edit.spec.ts`): **40/40 passed**
