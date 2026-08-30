# Partial audit: remaining specs (recorte 26)

**Batch:** remaining (`skills:skill-templates-source`, `core:approve-spec`, `core:approve-signoff`, `core:config`, `core:schema-format`, `core:storage`)  
**Mode:** change (`workflow-transition-checks`) via `changes spec-preview`  
**Auditor:** read-only; neither spec nor code treated as truth  
**Graph:** not re-indexed this batch (parent: may be stale). Navigation via spec-preview + targeted reads.  
**CLI:** `node packages/cli/dist/index.js`  
**Workspace:** `/Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux`  
**Do not treat as source of truth:** implementation vs previewed spec vs `default:_global/architecture` (no delta of architecture in this change).

**Recorte 26 focus:**

- storage/change saneo: wire `pending-parent-artifact-review` → `in-progress` on load/save; Zod MUST accept the wire token; `ArtifactFile` still rejects in memory
- ApproveSpec describe titles not pending-centric if spec says so
- skill templates stay-in-state; archive `--skip-hooks pre`

---

## Method

- Spec content: `changes spec-preview workflow-transition-checks <specId> --format text`
- Architecture: `specs show default:_global/architecture --format text` (baseline, no change delta)
- Deltas: `deltas/core/{storage,schema-format,approve-spec,approve-signoff,config}` and `deltas/skills/skill-templates-source`
- Implementation:
  - `packages/core/src/infrastructure/fs/manifest.ts` (`artifactStatusSchema`)
  - `packages/core/src/infrastructure/fs/change-repository.ts` (load coerce ~1422, `persistableArtifactStatus` ~1700)
  - `packages/core/src/domain/value-objects/artifact-file.ts`
  - `packages/core/src/domain/entities/change-artifact.ts`
  - `packages/core/src/application/use-cases/approve-spec.ts`, `approve-signoff.ts`
  - `packages/core/src/composition/use-cases/approve-spec.ts`, `approve-signoff.ts`
  - `packages/core/src/infrastructure/fs/config-loader.ts` (`approvals` defaults)
  - `packages/core/src/domain/services/build-schema.ts` / `build-schema.spec.ts`
  - `packages/skills/templates/skills/*/SKILL.md.tpl`, `templates/shared/shared.md.tpl`
- Tests: `change-repository.spec.ts`, `artifact-file.spec.ts`, `approve-spec.spec.ts`, `approve-signoff.spec.ts`, composition factory specs, `template-workflow.spec.ts`, `config-loader.spec.ts`, `lifecycle-engine.spec.ts`

---

## Recorte 26 focus (executive)

| Focus                                                    | Verdict                                    | Evidence                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wire `pending-parent-artifact-review` saneo on load/save | **Compliant** (with intra-spec tension D1) | Load: `if (status === 'pending-parent-artifact-review') status = 'in-progress'` before `new ArtifactFile`. Save: `persistableArtifactStatus` remaps artifact and file `state`. Test `given wire pending-parent-artifact-review, when get then save, then status is in-progress`. |
| Zod accepts the wire token                               | **Compliant**                              | `artifactStatusSchema` includes `'pending-parent-artifact-review'`. Without that, the integration test would fail at parse, not at coerce. No isolated Zod unit test (MT3).                                                                                                      |
| `ArtifactFile` rejects token in memory                   | **Compliant**                              | Constructor throws `InvalidChangeError`. `artifact-file.spec.ts` `rejects persist of pending-parent-artifact-review`.                                                                                                                                                            |
| ApproveSpec describe titles not pending-centric          | **Compliant**                              | Happy-path `describe('given the spec approval gate is enabled and change is in ready')`. Drain is explicitly labelled `(drain)`. Signoff mirrors `…change is in done`.                                                                                                           |
| Skill templates stay-in-state                            | **Compliant**                              | Templates + `template-workflow.spec.ts`: stay in `ready`/`done`; no happy-path `pending-*`; new-skill drain-only rows; entry skill does not teach signoff.                                                                                                                       |
| Archive `--skip-hooks pre`                               | **Compliant**                              | Archive examples use `--skip-hooks pre`; test forbids `archive <name> --skip-hooks all` and post `run-hooks … --phase post`; still requires `hook-instruction … --phase post`.                                                                                                   |

---

## Requirements Summary

### skills:skill-templates-source (18 requirements)

Change deltas add four requirements; the rest are unchanged template-contract rules.

| #   | Requirement                                                   | Normative gist (preview)                                                                                                         |
| --- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| K1  | Template source location                                      | `.tpl` under `packages/skills/templates`; install drops suffix                                                                   |
| K2  | Template migration                                            | Migrated tree complete; obsolete metadata skill absent                                                                           |
| K3  | Template metadata contract                                    | kind + requirements; capability catalogue                                                                                        |
| K4  | Capability-aware install-time rendering                       | Branch on capabilities; `sharedFolder` vars; no absolute shared paths                                                            |
| K5  | Graph impact terminology                                      | dependents vs downstream; `--file`                                                                                               |
| K6  | Graph search snippet guidance                                 | `--snippet` opt-in                                                                                                               |
| K7  | Frontmatter source                                            | Canonical contracts                                                                                                              |
| K8  | Frontmatter injection                                         | Filter by runtime; shared files get none                                                                                         |
| K9  | Agent frontmatter matrix                                      | Known runtime fields                                                                                                             |
| K10 | Why no frontmatter in skills package                          | Value-driven metadata                                                                                                            |
| K11 | Implementation tracking instructions                          | add + review-state before archive                                                                                                |
| K12 | Metadata self-healing                                         | No metadata-status scans; generate-metadata forced-rebuild only                                                                  |
| K13 | Optimizer agent gating                                        | `project status` gate                                                                                                            |
| K14 | Agent-facing command roles                                    | show/context/metadata roles; archive diagnostics                                                                                 |
| K15 | **In-place approval gates in workflow templates**             | Stay-in-`ready`/`done`; no `change transition` into pending; drain-only mentions; no `source.post` on backward/redesign/recovery |
| K16 | **Implementation tracking in verify and implement templates** | Shared cookbook; verify drains open files; implement zero-open before `/specd-verify`                                            |
| K17 | **Archive skill skips only pre hooks**                        | `changes archive --skip-hooks pre` not `all`; no post `run-hooks`; MAY `hook-instruction` post                                   |
| K18 | **Design skill review scope without review file lists**       | Do not list files under text `review:`; scope from `artifacts (details):` / `affectedArtifacts`                                  |

Direct deps (preview): `skills:skill`, `cli:spec-optimizations`, `skills:workflow-automation`, `core:transition-checks`.

### core:approve-spec (8 requirements)

| #   | Requirement                             | Normative gist                                                                                                                                                        |
| --- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Gate guard                              | `approvals.spec: false` → `ApprovalGateDisabledError` before I/O                                                                                                      |
| P2  | Change lookup                           | Missing name → `ChangeNotFoundError`                                                                                                                                  |
| P3  | Artifact hash computation               | Schema once from `SchemaProvider.get()`; skip missing/skipped; skip null load; cleanup then hash; keys `type:key`                                                     |
| P4  | Approval recording and state transition | `recordSpecApproval`; stay in bound `from` (`ready`); MUST NOT transition to pending or `spec-approved` on that path; drain `pending-spec-approval` → `spec-approved` |
| P5  | Persistence and return value            | `mutate`; no pending/`spec-approved` hop from bound from; return updated `Change`                                                                                     |
| P6  | Input contract                          | `name` + `reason` only                                                                                                                                                |
| P7  | Approval gate baked at construction     | `approvals: ApprovalGates`; not per-call flags                                                                                                                        |
| P8  | Config-based factory                    | `resolveApproveSpecDeps` → canonical `createApproveSpec(deps)`; `contentHasher`                                                                                       |

Direct deps: `core:change`, `core:schema-format`, `core:composition`, `core:kernel`, `core:composition-resolver`, `core:transition-checks`.

### core:approve-signoff (8 requirements)

Symmetric to ApproveSpec: stay in `done`; drain `pending-signoff` → `signed-off`; `resolveApproveSignoffDeps`.

### core:config (25 requirements)

Unchanged except **Approvals**: `approvals.spec` / `approvals.signoff` are in-place checks; new work MUST NOT enter pending via `change transition`; redesign `ready → designing` MUST NOT require spec gate; verify scenario “Spec gate on does not require pending-spec-approval in the graph”.

Other requirements (location, privacy, env, local override, cascade, schema ref, invalidation, workspaces, graph, storage, named adapters, configPath, templates, plugins, overrides, context, contextMode, instructions, logging, LLM, plugin declarations, ConfigWriter, startup validation, legacy warnings) are not delta’d in this change.

Direct deps: `core:vcs-adapter-port`, `default:_global/architecture`, `core:transition-checks`.

### core:schema-format (22 requirements)

Delta focus:

| #   | Requirement                       | Delta gist                                                                                                                                  |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Schema file structure             | `workflow` is lookup rows on existing Change states, not a state-machine definition                                                         |
| F2  | Schema kind field                 | schema vs plugin                                                                                                                            |
| F3  | Schema extends                    | chains, cycles                                                                                                                              |
| F4  | Array entry identity              | unique ids                                                                                                                                  |
| F5  | Artifact definition               | `requires` cascade via `LifecycleEngine.projectArtifacts`; no `Change.effectiveStatus()`; review parents → `pending-parent-artifact-review` |
| F6  | Schema artifact DAG API           | `artifactDag()`                                                                                                                             |
| F7  | Canonical artifact DAG derivation |                                                                                                                                             |
| F8  | preHashCleanup                    |                                                                                                                                             |
| F9  | taskCompletionCheck               |                                                                                                                                             |
| F10 | Template resolution               |                                                                                                                                             |
| F11 | Validation rules                  |                                                                                                                                             |
| F12 | Delta validation rules            |                                                                                                                                             |
| F13 | Cross-artifact validation rules   |                                                                                                                                             |
| F14 | Per-spec approval                 |                                                                                                                                             |
| F15 | Metadata extraction               |                                                                                                                                             |
| F16 | Artifact scope                    |                                                                                                                                             |
| F17 | Workflow                          | lookup + axis; omitted step does not delete protocol state; unknown `step` → `SchemaValidationError` at `buildSchema`                       |
| F18 | Explicit external hook entries    |                                                                                                                                             |
| F19 | Schema plugin kind                |                                                                                                                                             |
| F20 | Schema resolution                 |                                                                                                                                             |
| F21 | Schema validation on load         |                                                                                                                                             |
| F22 | verify.md format                  |                                                                                                                                             |

### core:storage (21 requirements)

Delta: **Artifact dependency cascade** only.

| #      | Requirement                                                                                                                                       | Notes                                                                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1     | Change directory naming                                                                                                                           | Unchanged                                                                                                                                               |
| T2     | Change directory listing order                                                                                                                    | Unchanged                                                                                                                                               |
| T3     | Artifact status derivation                                                                                                                        | Status derived from hash/file; **“must not be stored directly in the manifest”** — conflicts with T4 + actual `state` field (D1)                        |
| T4     | **Artifact dependency cascade**                                                                                                                   | Engine owns cascade; load/save MUST rewrite file token `pending-parent-artifact-review` → `in-progress`; `ArtifactFile` MUST NOT accept token in memory |
| T5–T21 | ValidateArtifacts sole complete path, archive pattern, indexes, manifest format, confinement, staged archive, logging, locks, fs-cache, gitignore | Unchanged this recorte                                                                                                                                  |

Direct deps: architecture, `core:change`, `core:change-manifest`, logging, `core:lifecycle-engine`, `core:schema-format`.

---

## Implementation Status

### Recorte 26 (this batch)

| Area                        | Status                | Notes                                                                                                              |
| --------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Zod wire token              | Implemented           | `packages/core/src/infrastructure/fs/manifest.ts` `artifactStatusSchema` includes `pending-parent-artifact-review` |
| Load coerce                 | Implemented           | `change-repository.ts` ~1422–1424, before `ArtifactFile` construction                                              |
| Save coerce                 | Implemented           | `persistableArtifactStatus` on file `state` and aggregate `artifact.status`                                        |
| ArtifactFile reject         | Implemented           | Constructor `InvalidChangeError`                                                                                   |
| ApproveSpec stay-in-ready   | Implemented           | `recordSpecApproval` then `transition` only if `pending-spec-approval`                                             |
| ApproveSignoff stay-in-done | Implemented           | Symmetric                                                                                                          |
| boundFromStates             | Implemented           | Use cases read engine bindings; drafting throws `InvalidStateTransitionError`                                      |
| Composition factories       | Implemented           | `resolveApprove*Deps` + `contentHasher`; config form via `createCompositionResolver`                               |
| Skill stay-in-state copy    | Implemented           | design/implement/verify/new/archive/entry/shared                                                                   |
| Archive skip pre            | Implemented           | `--skip-hooks pre` examples; post `hook-instruction` only                                                          |
| schema-format unknown step  | Implemented           | `build-schema.spec.ts` rejects `step: reviewing`                                                                   |
| schema-format cascade copy  | Implemented in engine | `lifecycle-engine.ts` `_effectiveStatus`; not on `Change`                                                          |
| config approvals defaults   | Implemented           | `config-loader.ts` `?? false`                                                                                      |

### Unchanged requirements in these specs

Treated as **implemented / not re-litigated** except where they contradict the delta (D1) or architecture (below). Storage T3 vs T4 is the only material intra-spec clash in this batch.

### Architecture alignment (no architecture delta)

| Architecture rule                                                  | This batch                                                                                  | Verdict                                                                                                                                                                                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain layer is pure                                               | Coerce lives in fs repository; `ArtifactFile` throw is domain                               | **Aligned**                                                                                                                                                                                                                     |
| YAML/JSON validated at infrastructure boundary then domain objects | Zod accepts wire token; coerce **before** `new ArtifactFile`                                | **Aligned** with recorte 26. If Zod rejected the token, load would throw — that would violate storage T4.                                                                                                                       |
| Rich domain entities own transitions                               | `Change.transition` still entity-enforced; stay-in-place approvals do not call `transition` | **Aligned**. `recordSpecApproval` / `recordSignoff` append history with **no** state guard (policy is in the use case + `boundFromStates`). That is application policy from `core:transition-checks`, not a missing entity hop. |
| Use cases do not duplicate entity invariants                       | From-state for approve is **not** an entity invariant today                                 | **Not a contradiction**. Moving the guard onto `Change` would be a design choice, not required by the change specs.                                                                                                             |
| Workflow is not the protocol machine                               | schema-format F1/F17 + Change `VALID_TRANSITIONS`                                           | **Aligned** with architecture (entity owns the machine).                                                                                                                                                                        |
| Adapter packages contain no business logic                         | Skills templates encode agent procedure                                                     | Skills are **not** listed as adapter packages in architecture (`cli`/`mcp`/`plugin-*`). **No contradiction.**                                                                                                                   |
| No `Change.effectiveStatus()`                                      | Grep: no method on `Change`; engine `projectArtifacts`                                      | **Aligned**                                                                                                                                                                                                                     |

---

## Discrepancies

Neither side assumed true. Each item lists spec evidence, code evidence, and both interpretations.

### D1 — Medium — `core:storage` T3 vs T4 (and vs code)

**Spec A (T3 Artifact status derivation, unchanged):** artifact status `missing` / `in-progress` / `complete` / `skipped` **must be derived at load** and **must not be stored directly in the manifest**. Manifest stores only `validatedHash`.

**Spec B (T4 Artifact dependency cascade, this change):** if a **persisted file token** is `pending-parent-artifact-review`, load/save MUST rewrite it to `in-progress`. That presupposes a persisted `state` token.

**Code:** `manifest.json` files and artifacts have `state`; Zod validates it; serialize writes `state: persistableArtifactStatus(...)`.

**Interpretations:**

1. **Spec T3 is stale; T4 + code are right** (compatibility `state` plus hash derivation). Recorte 26 / design.md / `core:change` saneo text support this.
2. **T3 is right; T4 and code are wrong** — drop `state` from the wire; never persist status; then saneo is unnecessary.
3. **Both partially right** — derive when hash/file disagree; keep `state` only as a legacy hint that must be coerced.

**Architecture:** validating JSON at the fs boundary then constructing domain objects **favors T4+code** (coerce then `ArtifactFile`). Architecture does **not** require “never persist status.” T3 is the outlier vs architecture + this change.

**This change does not delta T3**, so the contradiction is inherited and newly sharpened by T4.

### D2 — Low — `core:storage` verify.md omits saneo scenario

**Spec.md T4** requires load/save rewrite. **verify.md** cascade scenarios only cover engine `projectArtifacts` (upstream edited / skipped) — **no** WHEN wire token THEN `in-progress` scenario. Code test exists (`change-repository.spec.ts`).

**Interpretations:** verify artifact lag vs spec.md (spec incomplete); or saneo is implementation-only and should not be in storage verify (then spec.md T4 over-specifies storage verify).

### D3 — Low — `ChangeArtifact` JSDoc vs `ArtifactFile` invariant

**Code:** `_recomputeStatus` JSDoc still ranks `pending-parent-artifact-review` among **file** states. There is **no** `if (states.some === 'pending-parent-artifact-review')` branch; `ArtifactFile` cannot hold the token, so aggregate cannot recompute it from files.

**Interpretations:** comment drift (code/spec T4 right); or aggregate should still accept the token in memory (spec T4 / ArtifactFile reject would be wrong).

### D4 — Low — ApproveSpec/ApproveSignoff persist spy only on drain path

**verify.md (this change):** Persistence GIVEN successful approval **from `ready` / `done`**, THEN `mutate` was called AND returned state is `ready` / `done`.

**Code tests:** ready/done tests assert `result.state` and active approval. `mutate` spy lives under pending drain describes only.

**Interpretations:** implementation is fine, tests incomplete (likely); or persist-from-ready is unproven if the fake repo’s `execute` path skipped `mutate` (the fake `makeChangeRepository` typically implements `mutate` — residual risk is coverage, not a demonstrated bug).

### D5 — Low — `core:config` verify scenario is not a config-loader assertion

**verify:** GIVEN `approvals.spec: true`, WHEN ready evaluated for `implementing`, THEN wait is `approval.spec` AND config MUST NOT be documented as requiring a pending hop.

**config-loader tests:** parse booleans only. Graph/wait behavior is `LifecycleEngine` / `approval.spec` check (other specs). “MUST NOT be documented” is docs/skill copy, not YAML load.

**Interpretations:** scenario belongs on `core:transition-checks` / `core:config` docs (spec placement); or config package should own a documentation contract test (missing test).

### D6 — Low — schema-format “omitted workflow step” has no dedicated resolve test

**verify:** GIVEN `workflow[]` omits `implementing`, WHEN schema resolved, THEN `implementing` remains a valid Change lifecycle state AND workflow only attaches extras to listed steps.

**Code:** `ChangeState` union always includes `implementing`. `build-schema.spec.ts` rejects unknown `reviewing`. Engine test: omit implementing → no extras row. No `buildSchema` test whose `workflow` array lacks `implementing` and then asserts `isValidTransition(..., 'implementing')` still true.

**Interpretations:** scenario is protocol-true by construction (no test needed); or verify wants an explicit schema fixture (missing test).

### D7 — Info — ApproveSpec hashes inside `mutate`

**spec P5:** “After computing artifact hashes, the use case MUST record the approval through `mutate`.” **Code:** hashes computed **inside** the mutate callback on `freshChange`. Safer for serialization; wording implies hash-then-mutate.

**Interpretations:** spec prose order vs implementation order; both intend one serialized mutation. Not counted as a defect unless a reviewer wants literal sequencing.

---

## Test Coverage

| Requirement / recorte 26 item     | Tests                                                               | Adequacy                                                                     |
| --------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Zod accepts wire token            | Implicit in change-repository load test (parse would throw first)   | Partial — no `artifactStatusSchema.parse` unit                               |
| Load/save coerce                  | `change-repository.spec.ts` get-then-save                           | Adequate                                                                     |
| ArtifactFile reject               | `artifact-file.spec.ts`                                             | Adequate                                                                     |
| Engine cascade pending-parent     | `lifecycle-engine.spec.ts`; get-status drafted dependents           | Adequate (engine spec, not storage verify)                                   |
| ApproveSpec ready stay            | `approve-spec.spec.ts` `records consent and stays in ready`         | Adequate for state; persist spy gap (D4)                                     |
| ApproveSpec drain                 | pending describe + `spec-approved`                                  | Adequate                                                                     |
| ApproveSpec gate/lookup/mismatch  | disabled, not-found, schema mismatch                                | Adequate                                                                     |
| ApproveSpec factory               | `composition/use-cases/approve-spec.spec.ts`                        | Partial — does not assert `resolveApproveSpecDeps` / `contentHasher` by name |
| ApproveSignoff                    | symmetric                                                           | Same as spec                                                                 |
| Config approvals defaults/enabled | `config-loader.spec.ts` `parses approvals booleans`                 | Adequate for YAML; D5 for graph wait                                         |
| Unknown workflow step             | `build-schema.spec.ts` `reviewing`                                  | Adequate                                                                     |
| Omitted workflow step             | engine extras-row test only                                         | Partial (D6)                                                                 |
| Skill stay-in-state               | `template-workflow.spec.ts` `does not teach pending parking…`       | Adequate                                                                     |
| Archive skip pre                  | `archive skips only pre hooks…`                                     | Adequate                                                                     |
| Design review header              | `design skill does not treat the text review header as a file list` | Adequate                                                                     |
| Impl tracking templates           | `verify drains open…`                                               | Adequate                                                                     |

---

## Missing Tests

1. **storage verify.md scenario** for wire `pending-parent-artifact-review` → load/save `in-progress` (behavior already tested in code).
2. **Isolated Zod test** that `artifactStatusSchema` / `manifestArtifactFileSchema` **accept** `pending-parent-artifact-review` and **reject** unknown tokens (proves recorte 26 “do not throw on wire JSON” at the schema, not only via repository).
3. **ApproveSpec / ApproveSignoff** `mutate` spy on the **ready / done** happy path (verify Persistence).
4. **config** contract that enabled `approvals.spec` does not imply a pending hop — only if the scenario stays on `core:config` (otherwise move the scenario).
5. **schema-format** fixture: `workflow[]` without `implementing` still resolves; `implementing` remains `ChangeState` / protocol-legal.
6. **Factory** tests that config `createApproveSpec(config)` goes through `resolveApproveSpecDeps` and `contentHasher` (verify factory scenario is currently only “returns instance”).

---

## Spec Dependency Chain

```
default:_global/architecture          (no delta; constraint baseline)
        ↑
core:config ──→ core:transition-checks, architecture
core:schema-format ──→ (lifecycle-engine / change via prose)
core:storage ──→ architecture, change, change-manifest, logging, lifecycle-engine, schema-format
core:approve-spec ──→ change, schema-format, composition, kernel, composition-resolver, transition-checks
core:approve-signoff ──→ (same)
skills:skill-templates-source ──→ skill, spec-optimizations, workflow-automation, transition-checks
```

**Contradiction vs architecture (no architecture delta):** none that reverse hexagonal rules for this recorte. The live clash is **storage T3 vs T4/code**, and T3 is the side that is **less** aligned with architecture’s “validate at boundary, then construct domain.” Stay-in-state approvals and workflow-as-lookup **match** architecture (entity owns `VALID_TRANSITIONS`; schema does not).

---

## Summary counts

| Spec                          | Requirements (preview) | Implemented              | Partial / gaps                            | Discrepancies touching spec |
| ----------------------------- | ---------------------- | ------------------------ | ----------------------------------------- | --------------------------- |
| skills:skill-templates-source | 18                     | 18                       | 0                                         | 0                           |
| core:approve-spec             | 8                      | 8                        | persist spy (D4), hash-inside-mutate (D7) | D4, D7                      |
| core:approve-signoff          | 8                      | 8                        | persist spy (D4)                          | D4                          |
| core:config                   | 25                     | 25 (approvals delta yes) | D5 scenario placement                     | D5                          |
| core:schema-format            | 22                     | 22                       | omitted-step fixture (D6)                 | D6                          |
| core:storage                  | 21                     | 20 + T3/T4 clash         | verify saneo (D2), Zod unit (MT2)         | D1, D2, D3                  |

**Totals for this partial:** requirements checked **102**; recorte-26 focus items **6/6 compliant in code**; discrepancies **7** (1 medium, 5 low, 1 info); missing tests **6**.
