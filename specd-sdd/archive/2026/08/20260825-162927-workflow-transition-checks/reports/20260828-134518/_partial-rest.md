# Partial Compliance Report — rest

- **Change:** `workflow-transition-checks` (`20260825-162927-workflow-transition-checks`)
- **Slice:** assigned specs besides core lifecycle/CLI/archive (FOCUS `core:validate-artifacts`)
- **Mode:** read-only; graph search succeeded once (`ValidateArtifacts` class at `packages/core/src/application/use-cases/validate-artifacts.ts:114`)
- **Spec source:** `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId> --format text`
- **Date:** 2026-08-28

Assigned specs: `core:validate-artifacts` (FOCUS), `core:get-artifact-instruction`, `core:schema-format`, `core:storage`, `core:config`, `skills:skill-templates-source`. Globals spot-checked: `default:_global/architecture`, `conventions`, `testing`, `eslint`.

Prior findings re-verified: **H1** (metadata schema), **H2** (drift materialization vs `FsChangeRepository`).

---

## 1. Requirements

### 1.1 `core:validate-artifacts` (FOCUS) — MetadataExtraction (exhaustive)

Merged spec **Requirement: MetadataExtraction validation** (delta in this change: _MetadataExtraction uses permissive schema for partial per-artifact extract_):

1. After merged preview, if `schema.metadataExtraction()` is defined, call extraction so **only fields sourced from the artifact under validation** are extracted (`extractMetadata(..., artifactType.id)` / `targetArtifactId`).
2. Validate that bag against **`permissiveSpecMetadataSchema`** (shape of fields that are present).
3. If validation fails, record a **validation failure** (not a throw); artifact is **not** `markComplete`.
4. **`strictSpecMetadataSchema` MUST NOT be used here.** It is the write schema for a complete `metadata.json` (persist/archive).
5. Rationale: fields are bound to `field.artifact`. Multi-file specs MAY be validated one artifact at a time. `title` / `description` / `contentHashes` MAY be produced only by an artifact that does not exist yet → extraction is a **partial bag**. Completeness belongs to persist/archive.
6. `transforms` = shared kernel registry; `transformContext` = caller-owned origin bag. Unknown transform or missing/invalid context → validation failure.
7. Extracted metadata is validated **only for the current artifact**, not all artifacts.

Verify scenarios for this requirement:

- _Metadata validation uses shared transform registry and origin context_
- _Unknown transform causes validation failure_
- **`Partial extracted metadata does not require title description or contentHashes`** (explicit: result validated against `permissiveSpecMetadataSchema`; missing those fields do not fail)

Related: **Requirement: MetadataExtraction validation failures are validation failures** (_Invalid extracted metadata prevents completion_).

This change’s delta **corrects** the previous spec text that named `strictSpecMetadataSchema` at step 3.

### 1.2 `core:validate-artifacts` — other change-relevant requirements

| Requirement                        | Intent                                                                                                                                                  |
| :--------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ports and constructor              | `ListWorkspaces` (not `ReadonlyMap<SpecRepository>`); `LifecycleEngine` for DAG only                                                                    |
| DAG lifecycle from engine evaluate | `evaluate(..., { checksByTarget: {} })`; no hop predicates; no `gatherPredicateSnapshots`                                                               |
| Dependency order                   | Engine effective status; refresh interpretation after each persisted completion in one `execute`                                                        |
| Policy-aware drift materialization | Baseline mismatch (content **and absence**) → focused `Change.invalidate('artifact-drift')` once; policy `none` still sets `hasDrift` without reopening |
| Approval invalidation              | Separate path: approval/signoff hash mismatch; still one invalidate per execute                                                                         |
| Complete/skipped bypass            | Do not re-read/re-validate `complete`/`skipped`; still validate review/drift states; drift detection only for files actually validated                  |
| Config factory                     | `resolveValidateArtifactsDeps` lists `hasher: ContentHasher` then `createValidateArtifacts(deps)`                                                       |
| Save after validation              | `ChangeRepository.mutate`; partial `markComplete` persisted                                                                                             |

### 1.3 `core:get-artifact-instruction`

Constructor includes `LifecycleEngine`. Auto-`artifactId` uses `LifecycleEngine.nextArtifact` / `evaluate` with empty `checksByTarget`. Template vars: `change.name` + `change.path` only. `rulesPre`/`rulesPost` from `rules.pre`/`rules.post` **`text`** (verify: `{ id, text }`). Factory field **`templateExpander`** in spec.md; verify.md still lists **`templates`**.

### 1.4 `core:schema-format` (this change)

`workflow[]` is lookup config on existing Change states, not a machine. Artifact `requires` feeds `LifecycleEngine.projectArtifacts` / `Schema.artifactDag()`. Rules entries: `{ id, instruction }`. Template resolution: _plain text — no interpolation at schema load_ (wording).

### 1.5 `core:storage` (this change)

DAG cascade is **not** `Change.effectiveStatus()`. Load/save rewrite persisted `pending-parent-artifact-review` → `in-progress`. Artifact status derivation + **drift invalidations** only when `artifactTypes.length > 0`. Hash/`validatedHash` status remains repository-owned.

### 1.6 `core:config` (this change)

`approvals.spec` / `approvals.signoff` are **in-place** gates on `ready` / `done`. **New work MUST NOT enter `pending-spec-approval` or `pending-signoff` via `change transition`** (unconditional wording).

### 1.7 `skills:skill-templates-source` (this change)

In-place gates (no happy-path `change transition` into pending). Verify drains `IMPLEMENTATION_STATE`; implement gates `/specd-verify` on zero open files. Archive `--skip-hooks pre` not `all`. Design review scope from DAG details, not `review:` file lists.

### 1.8 Globals (spot-check)

- **architecture:** application uses ports only; composition factories `createX(deps)` + config form through resolver; domain does not import infrastructure; **entities** own invariants; **use cases** orchestrate.
- **conventions:** typed `SpecdError`; no generic `Error` for expected failures; kebab-case; ESM.
- **testing:** every use case / invariant has a unit test with mocked ports; fs adapters have tmpdir integration tests.
- **eslint:** JSDoc on all source methods including private; layer `no-restricted-imports`.

---

## 2. Implementation

### 2.1 Metadata schemas (`parse-metadata.ts`)

Three Zod objects:

| Schema                         | Role in code                                                                                           | Completeness                                                                                             | Notable field rules                                                                                                                                                                             |
| :----------------------------- | :----------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `specMetadataSchema`           | lenient **read** of `metadata.json` (`parseMetadata`)                                                  | all fields optional                                                                                      | passthrough; `contentHashes` unvalidated format                                                                                                                                                 |
| `strictSpecMetadataSchema`     | **write** complete snapshot                                                                            | **`title` + `description` required `min(1)`**; **`contentHashes` required**, nonempty, `sha256:<64 hex>` | keywords hyphen regex; `dependsOn` spec-id; `rules[].rules` nonempty; `constraints` nonempty if present; `scenarios[].then` nonempty; **no `optimizationStatus`**                               |
| `permissiveSpecMetadataSchema` | JSDoc: _Used by ValidateArtifacts to verify extracted metadata is valid (not to enforce completeness)_ | **all completeness fields optional**                                                                     | present strings `min(1)`; `contentHashes` optional **without** nonempty refine; `rules[].rules` not `.nonempty()`; `scenarios` requirement/name **optional**; **includes `optimizationStatus`** |

Consumers of **strict**: `PersistSpecMetadata` (`persist-spec-metadata.ts:33`), `fs-spec-index-cache.ts:223`.  
Consumer of **permissive**: **only** `ValidateArtifacts` (dynamic import in the per-artifact loop).

This matches the **corrected** spec split: permissive = partial extract bag; strict = complete `metadata.json` write.

### 2.2 `ValidateArtifacts` metadata path (`validate-artifacts.ts` ~544–603)

- Runs only if local validation has not already failed.
- Skips unless extraction rules exist for **`artifactType.id`**.
- Calls `extractMetadataFromSpecArtifacts({ ..., targetArtifactId: artifactType.id, artifacts: [current file only] })`.
- `extractMetadata(..., input.targetArtifactId)` filters `field.artifact === targetArtifactId`.
- `permissiveSpecMetadataSchema.safeParse(extracted.metadata)`; failure → `failures[]` + `artifactFailed` → no `markComplete`.
- Transform throws → catch → same failure shape.
- `dependsOn` persisted via `setSpecDependsOn` only after success.

Constructor: `ListWorkspaces`, `LifecycleEngine` (default `new LifecycleEngine(...)` if omitted). `evaluate(change, schema, { checksByTarget: {} })` once at start; `markVerdictComplete` patches local map. Completions + drift invalidate in **one** terminal `mutate()`.

Approval/signoff drift scan: gated on `activeSpecApproval` / `activeSignoff`; skips `missing`/`skipped` files and `artifactContent === null`; hashes vs approval maps. **Does not** implement baseline/absence drift or policy `none`.

### 2.3 `FsChangeRepository` drift (`change-repository.ts` ~1523–1573)

When `artifactTypes.length > 0`, compares derived on-disk status to `validatedHash` for previously validated files; calls `change.invalidate('artifact-drift', SYSTEM_ACTOR, ...)`. This is the implementation of “policy-aware” / absence / complete-hash mismatch **at load**, not in `ValidateArtifacts`.

`pending-parent-artifact-review` coerced to `in-progress` on load (`:1422`) and via `persistableArtifactStatus` on save. `ArtifactFile` rejects the token in memory.

### 2.4 `GetArtifactInstruction`

`evaluate(..., { checksByTarget: {} })`; `nextArtifact` when `artifactId` omitted; `ArtifactNotFoundError('(auto)', ...)` if null. Rules use `r.instruction`. Template: `TemplateExpander.expand(artifactType.template, …)` where `template` is **already resolved file content** (`ArtifactType.template`), not a live `SchemaRegistry` read. Context: `{ change: { name, path } }` only. Factory: `templateExpander` on deps; config path through `resolveGetArtifactInstructionDeps`.

### 2.5 Composition

`resolveValidateArtifactsDeps` field name is **`contentHasher`**, not `hasher`. Guard requires `'contentHasher' in value`. Config branch delegates to `createValidateArtifacts(deps)`.

### 2.6 Skills

Templates and `packages/skills/test/template-workflow.spec.ts` implement in-place gates, drain-only pending rows, verify drain, archive `--skip-hooks pre`, design review wording.

### 2.7 Config vs transition

`TransitionChange` blocks `to: pending-spec-approval` only when **`!approvals.spec`** (and not drain). With `approvals.spec: true`, entering pending via `change transition` remains a permitted hop in engine/CLI.

---

## 3. Discrepancies

### Re-verify H1 — **CLOSED** (spec + code + scenario aligned)

**Previous HIGH:** code used `permissiveSpecMetadataSchema` while spec said `strictSpecMetadataSchema`.

**Current intended (delta + preview):** validate extracted bag with **permissive**; strict is write-only for complete `metadata.json`; multi-file specs may extract partial bags.

**Evidence of alignment:**

- Spec step 3 names `permissiveSpecMetadataSchema`; “MUST NOT” use strict here.
- Code `validate-artifacts.ts:583–585` `safeParse`s `permissiveSpecMetadataSchema`.
- `PersistSpecMetadata` still uses `strictSpecMetadataSchema`.
- Test title **`Partial extracted metadata does not require title description or contentHashes`** (`validate-artifacts.spec.ts:2241`): `artifactId: 'verify'` while `title`/`description` bound to `specs`; expects no `MetadataExtraction` failure and `passed: true`.

**Residual (not a reopen of H1):**

- The test never imports or names `permissiveSpecMetadataSchema`; it would also pass if the use case skipped schema validation entirely for empty bags.
- No test that a **present but invalid** field (empty `title`, bad keyword, bad spec-id `dependsOn`) fails permissive and blocks `markComplete` (_Invalid extracted metadata prevents completion_ is only weakly covered via transform throws).
- No test that **`strictSpecMetadataSchema` is not used** (e.g. spy/import assertion).
- `permissiveSpecMetadataSchema` has **no** `parse-metadata.spec.ts` suite (only `strictSpecMetadataSchema` is unit-tested). Permissive is looser than strict in more than optionality: empty `contentHashes` `{}` passes permissive and fails strict; `rules[].rules` empty array; optional scenario `requirement`/`name`.
- Dynamic `import()` of the schema inside the artifact loop (vs static import at persist/index-cache) hides the dependency from static analysis; behavior is still correct.

**Verdict:** H1 as originally filed is **resolved**. Completeness of _shape_ validation for present fields is **under-tested**, not mis-specified.

---

### Re-verify H2 — **OPEN (HIGH)**

**Requirement still in merged `core:validate-artifacts`:** Policy-aware drift materialization (not removed by this change’s validate-artifacts deltas). Verify: _One invalidate call carries the focused drift payload_; _Policy none preserves complete while still marking drift_; _Missing file can still carry hasDrift without rendering complete-with-drift_.

**`ValidateArtifacts` still:**

- Only scans drift when approval or signoff is **active**.
- Skips absent files (`file.status === 'missing'`, `artifactContent === null`).
- Does not set `hasDrift` itself; `invalidate` only for approval-hash mismatches.
- Combined with complete-file bypass (`trackedFile?.status === 'complete'` → `continue` without re-hash), a complete file with changed content and **gates off** is never compared in this use case.

**`FsChangeRepository._loadChange` still** materializes `artifact-drift` with `SYSTEM_ACTOR` when hashes diverge (including absence vs stored hash). `core:storage` Requirement: Artifact status derivation **does** require repository-side drift invalidation when artifact types are resolved.

**Cross-spec / architecture:**

- `core:validate-artifacts` assigns ownership to the use case; `core:storage` also describes load-time drift invalidation. Two owners, one implementation (fs adapter).
- Architecture: infrastructure adapters should not own lifecycle policy; `Change.invalidate` from the fs loader is domain mutation in the adapter, with a different actor than `ValidateArtifacts` (`ActorResolver` vs `SYSTEM_ACTOR`).
- Either move the requirement to `core:storage` (and delete/narrow validate-artifacts Policy-aware drift + those verify scenarios), or implement baseline drift in `ValidateArtifacts` and stop duplicating it on `get()`.

**Verdict:** H2 **stands**. Code is coherent with **storage** + Change entity policy tests (`change.spec.ts` _policy none does not reopen…_); it does **not** satisfy **validate-artifacts** as written.

---

### HIGH — none other in this slice besides H2

(Previous rest-slice H3 eslint on `lifecycle-engine.ts`: file still has `eslint-disable jsdoc/require-jsdoc` but **now includes a justification**. Global eslint still requires JSDoc on private methods. Downgraded to Low L-eslint; not a validate-artifacts finding.)

---

### M1 — `hasher` vs `contentHasher` (MEDIUM)

Spec + verify: `hasher: ContentHasher`. Deps interface / resolver / type guard: `contentHasher`. Literal spec-shaped deps would fail the guard and be treated as config. Constructor parameter remains `hasher`. Sibling `templateExpander` was renamed in this change; this was not.

### M2 — get-artifact-instruction verify still says `templates:` (MEDIUM)

spec.md factory list: `templateExpander`. Merged verify scenario still: `templates: TemplateExpander`. Code matches spec.md. Internal spec/verify drift introduced by incomplete delta.

### M3 — `rules.pre` `text` vs `instruction` (MEDIUM)

`core:get-artifact-instruction` spec+verify: collect **`text`**. `core:schema-format` (declared dependency) + `RuleEntry` + code: **`instruction`**. Code follows schema-format.

### M4 — Approval drift scan not scoped to the invocation (MEDIUM)

Bypass requirement: drift detection for files **actually validated**; avoid spurious invalidation in batch/`--artifact`. Code loops `schema.artifacts()` before the per-artifact loop, independent of `artifactTypesToValidate`. `--artifact verify` can invalidate because `proposal` drifted. Also re-hashes `complete` files for approval drift, contrary to “do not re-read complete files” (approval clause vs bypass clause conflict inside the same spec).

### M5 — Lifecycle “recompute after persisted completion” is an in-memory patch (MEDIUM)

`evaluate` once; `markVerdictComplete` only sets `complete`. Terminal `mutate` only. Direct `requires` same-pass works (`allows a child artifact to validate in the same execute after parent succeeds`). Recursive `pending-parent-artifact-review` cascade is not re-run. Spec’s “persisted” is literal-unmet.

### M6 — `core:config` unconditional “MUST NOT enter pending via change transition” (MEDIUM)

Config spec: new work MUST NOT enter pending via `change transition`. Implementation: guard only if the corresponding approval flag is **false**. With gates **on**, pending remains a legal target. Skills teach drain-only; CLI still accepts the hop. Possible interpretations: spec over-strong vs `core:transition-checks` (no rewrite of `implementing`→pending); or missing hard reject.

### M7 — Architecture vs storage drift (MEDIUM, related to H2)

Hexagonal architecture: use cases orchestrate ports; adapters persist. Load-time `Change.invalidate` in `FsChangeRepository` is business policy in infrastructure. Not forbidden by `core:storage`, but it contradicts validate-artifacts ownership **and** the spirit of “application layer uses ports only” (the adapter _calls_ the entity, which is allowed, but the _decision_ to invalidate lives in fs).

---

### L1 — No composition tests for `resolveValidateArtifactsDeps` / `resolveGetArtifactInstructionDeps`

`packages/core/test/composition/use-cases/` has no matching spec files. Testing spec: every use case wiring contract should be covered; verify scenarios for factories are unasserted. M1 unguarded.

### L2 — `execute` without `artifactId` and with spec-scoped artifacts requires `specPath`

Throws `SpecNotInChangeError('<specPath required>', ...)`. Several verify scenarios omit `specPath`. Placeholder path vs conventions (machine-readable, actionable).

### L3 — `resolveArtifactValidationFilename` can keep a tracked non-expected path once `validatedHash` is set

Conflicts with “MUST NOT accept a direct file as fallback” / “filename MUST be the expected path”.

### L4 — Dynamic import of `permissiveSpecMetadataSchema`

No spec violation; inconsistent with other consumers; graph-unfriendly.

### L5 — Template interpolation: schema-format “no interpolation” vs GetArtifactInstruction `TemplateExpander` on template content

Compatible if schema-format means load-time only; neither spec says so. Code expands at serve time. `GetArtifactInstruction` spec also says read via `SchemaRegistry`; constructor has no `SchemaRegistry` (content already on `ArtifactType`).

### L6 — Duplicate `findBlockingParent` call

Behavior OK; second call likely redundant.

### L7 — Stale GetArtifactInstruction input comment

Still says auto-resolve by **declaration order**; spec and engine use DAG/`nextArtifact`.

### L8 — Leftover `console.log` in `validate-artifacts.spec.ts` (2455–2456, 2692–2693)

Debug prints in unit tests; not a spec SHALL, but noisy vs testing hygiene.

### L-eslint — `lifecycle-engine.ts` file-level `jsdoc/require-jsdoc` disable

Now justified in-comment. Still blanket vs global eslint verify (private methods). `findBlockingParent` public API sits behind the disable.

---

### Skills / schema-format / storage (this change) — largely compliant

Skill templates + `template-workflow.spec.ts` match in-place gate, drain, archive pre-skip, design review, implementation drain requirements.

Storage cascade + wire coercion + `ArtifactFile` reject: compliant with this change’s storage delta (see §2.3). **Not** a fix for H2.

Schema-format workflow-as-lookup: not re-audited line-by-line against `SchemaRegistry` in this slice; no contradiction found with validate-artifacts DAG language. **Contradiction with get-artifact-instruction `text`** is M3.

---

## 4. Test coverage

### 4.1 MetadataExtraction (FOCUS)

| Scenario                                                  | Coverage                                                                                                    | Notes                                                          |
| :-------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------- |
| Partial bag / no title, description, contentHashes        | **Yes** — `Partial extracted metadata does not require title description or contentHashes`                  | Does not assert schema **name**; empty extract from `verify`   |
| Shared transform registry + origin context                | Partial — transform tests pass custom `Map` into constructor; origin context implicit for `resolveSpecPath` | No assertion that kernel builtin registry is used              |
| Unknown transform → failure                               | **Gap** — no test titled/structured for unregistered transform name                                         | Closest: transform **throws** on bad dependsOn                 |
| Invalid extracted metadata (schema) prevents complete     | **Gap** for Zod shape (empty title, bad keywords)                                                           | Transform rejection covers “extraction failed”                 |
| `strictSpecMetadataSchema` not used on validate           | **Gap**                                                                                                     | persist tests cover strict on write (`parse-metadata.spec.ts`) |
| `permissiveSpecMetadataSchema` unit cases                 | **Gap**                                                                                                     | only strict suite exists                                       |
| dependsOn persist / no sidecar hard-fail / transform drop | **Yes** — several tests in same describe                                                                    | includes leftover `console.log`                                |

### 4.2 Other validate-artifacts (this change)

| Scenario                                           | Coverage                                                                              |
| :------------------------------------------------- | :------------------------------------------------------------------------------------ |
| `evaluate` empty `checksByTarget`                  | Yes (`evaluates lifecycle with empty checksByTarget`)                                 |
| Same-execute parent then child                     | Yes (`allows a child artifact to validate in the same execute after parent succeeds`) |
| Review / `pending-parent-artifact-review` messages | Yes (dependency describe block)                                                       |
| Policy none / hasDrift via **ValidateArtifacts**   | **Gap** (entity tests in `change.spec.ts`; fs in `change-repository.spec.ts`)         |
| Factory `resolveValidateArtifactsDeps`             | **Gap**                                                                               |
| Constructor `ListWorkspaces` vs specs map          | **Gap** (wiring only)                                                                 |

### 4.3 GetArtifactInstruction

Empty `checksByTarget` tested. Factory verify `templates:` vs code untested at composition. Rules `text` vs `instruction` would fail if tests used spec YAML `text` without mapping.

### 4.4 Storage

`given wire pending-parent-artifact-review, when get then save, then status is in-progress` — covers this change’s cascade/coercion. Load-time artifact-drift covered in repository tests, not as ValidateArtifacts.

### 4.5 Config

In-place gates tested on `TransitionChange` / lifecycle (other slices). Unconditional “no transition into pending” **not** asserted when `approvals.spec === true`.

### 4.6 Skills

`template-workflow.spec.ts` asserts exact contracts for this change’s template requirements (keyword-only insufficient — tests use exact phrases). Compliant with skills verify.

### 4.7 Globals

Testing spec “every use case factory/invariant” not met for composition resolvers (L1). Architecture/eslint: composition factories match `createX(deps)` pattern (except hasher naming).

---

## 5. Summary counts

| Severity                | Count | IDs                               |
| :---------------------- | ----: | :-------------------------------- |
| High (open)             |     1 | H2 drift ownership                |
| High (closed this pass) |     1 | H1 metadata schema — **resolved** |
| Medium                  |     7 | M1–M7                             |
| Low                     |     9 | L1–L8 + L-eslint                  |
| Spec/verify internal    |     2 | M2, M3 (also counted as Medium)   |

| Outcome                                                                                                                    | Count |
| :------------------------------------------------------------------------------------------------------------------------- | ----: |
| Requirements reviewed (assigned + globals spot-check)                                                                      |   ~55 |
| Confirmed compliant (incl. H1, storage coercion, skills gates, DAG empty checks, ListWorkspaces ctor, persist uses strict) |    22 |
| Open implementation vs spec                                                                                                |     8 |
| Spec-vs-spec / spec-vs-verify                                                                                              |     4 |
| Test gaps (incl. permissive unit + unknown transform + factory)                                                            |     8 |

**H1:** spec was corrected; code and the named test match **permissive** for partial bags; strict remains write-only. Residual: weak assertions and no permissive unit tests.

**H2:** still **open** — Policy-aware drift remains specified on `ValidateArtifacts` and implemented on `FsChangeRepository` load.

**This slice’s change deltas** (DAG `evaluate`, `ListWorkspaces`, workflow-as-lookup, storage cascade, config in-place gates, skill templates) are largely implemented; leftover naming/verify drift (hasher, templates, rules `text`) and factory-test gaps remain.
