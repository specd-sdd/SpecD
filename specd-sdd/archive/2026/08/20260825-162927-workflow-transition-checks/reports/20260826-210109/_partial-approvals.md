# Batch: approvals (stay-in-ready/done, `approval.spec` wildcard, post `along=forward`, template drain)

Audit mode: change `workflow-transition-checks`. Graph: `stale: false` (`contentFresh: true`) at ref `2948f1a2`. Spec content from `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId> --format toon` (merged deltas). Implementation via `graph search` then file reads. **No code or spec files were modified.**

Focus for this batch:

- Stay-in-`ready` / stay-in-`done` on human approval (no pending parking on the happy path).
- Engine `approval.spec`: `from=ready`, `to=*`, `along=forward`.
- Transition `hook.post` effects only when `along=forward`.
- Skill templates: pending states drain-only.

---

## Spec dependency chain (depth 1)

| Spec                            | Direct deps (from merged preview)                                                                                                                                                                                                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core:approve-spec`             | `core:change`, `core:schema-format`, `core:composition`, `core:kernel`, `core:composition-resolver`, **`core:transition-checks`** (`from` for `approval.spec` from engine bindings)                                                                                                                      |
| `core:approve-signoff`          | same pattern; **`core:transition-checks`** for `approval.signoff`                                                                                                                                                                                                                                        |
| `core:config`                   | `core:vcs-adapter-port`, `default:_global/architecture`, **`core:transition-checks`** (in-place gates, not pending hops)                                                                                                                                                                                 |
| `core:hook-execution-model`     | `core:workflow-model`, `core:schema-format`, `core:hook-runner-port`, `core:transition-change`, `core:archive-change`, `core:run-step-hooks`, `core:get-hook-instructions`, `core:config`, `cli:change-transition`, `cli:change-archive`, **`core:transition-checks`** (`from`/`to`/`along` for effects) |
| `skills:skill-templates-source` | `skills:skill`, `cli:spec-optimizations`, `skills:workflow-automation`, **`core:transition-checks`**                                                                                                                                                                                                     |

Consistency with `core:transition-checks` (not in this batch, but binding source of truth): `TRANSITION_BINDING_SPECS` in `packages/core/src/domain/services/check-bindings.ts`.

---

## Per spec

### `core:approve-spec`

**Implementation map**

| Area       | Location                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------- |
| Use case   | `packages/core/src/application/use-cases/approve-spec.ts` (`ApproveSpec.execute` L70–101)    |
| Bindings   | `boundFromStates('approval.spec')` — `check-bindings.ts` L167–168                            |
| Engine row | `approval.spec`: `{ from: 'ready', to: '*', along: 'forward' }` (`check-bindings.ts` L56–60) |
| Factory    | `packages/core/src/composition/use-cases/approve-spec.ts` (`ApproveSpecDeps.contentHasher`)  |
| Tests      | `packages/core/test/application/use-cases/approve-spec.spec.ts`, composition factory tests   |

#### Requirements summary

1. **Gate guard** — `approvals.spec === false` → `ApprovalGateDisabledError('spec')`, no repo I/O; then load change, actor, schema, mismatch.
2. **Change lookup** — missing name → `ChangeNotFoundError`.
3. **Artifact hash computation** — skip `missing`/`skipped`; load `artifact()`; skip `null`; cleanup + hash; keys `type:key`.
4. **Approval recording and state transition** — `recordSpecApproval`; when state is bound `from` for `approval.spec` (currently `ready`), MUST NOT `transition('spec-approved')` or `transition('pending-spec-approval')`; drain `pending-spec-approval` → `spec-approved` MAY.
5. **Persistence** — `ChangeRepository.mutate`; same stay-in-bound-`from` / drain rules; return mutated `Change`.
6. **Input** — `name` + `reason` only; no gate flags.
7. **Gate baked at construction** — `approvals: ApprovalGates`.
8. **Config factory** — `resolveApproveSpecDeps` then canonical `createApproveSpec(deps)`.

#### Implementation status

- **Stay-in-`ready` (conforms).** Happy path: `recordSpecApproval` only; `transition('spec-approved')` runs **only** if `freshChange.state === 'pending-spec-approval'` (L96–98). No call to `transition('pending-spec-approval')`.
- **Allow-list is engine-driven (conforms).** `consentFrom = boundFromStates('approval.spec')`; drafting (and any non-consent, non-drain state) throws `InvalidStateTransitionError`. Tests assert `boundFromStates('approval.spec') === ['ready']`.
- **Residual hardcode (error argument only):** `InvalidStateTransitionError(change.state, consentFrom[0] ?? 'ready')`. Allow-list is not hardcoded; `'ready'` is empty-binding fallback for the expected-state field.
- Gate / lookup / mutate / input / constructor gates: match.
- Hashes computed **inside** `mutate` on the fresh instance (compatible with “before recording” on the persisted instance). Unchanged hash bullets still mention `SchemaRegistry` per file; code uses `SchemaProvider.get()` + `buildCleanupMap` once.

#### Discrepancies

1. **Hash wording vs code (pre-existing spec drift).** Requirement still says resolve schema from `SchemaRegistry` per file and empty cleanup if unresolved. Code uses `SchemaProvider` (also used in gate). **Likely spec should say SchemaProvider**; code matches gate-guard and composition.
2. **`resolveApproveSpecDeps` field name.** Spec/verify list `hasher: ContentHasher`; composition type is `contentHasher`. Wiring is correct. **Likely spec should say `contentHasher`.**
3. **Purpose vs recording requirement.** Purpose says stay in `ready`; recording says “state bound as `from` (currently `ready`)”. Aligned today because bindings yield `['ready']`.
4. **Archived workspace spec (graph index)** still describes transitioning into `spec-approved` as the happy path. That is **pre-delta** `specs/core/approve-spec`. Preview/deltas are the source of truth until archive.

#### Test coverage

| Verify scenario (merged)                   | Status                                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Gate disabled, no repo access              | Covered                                                                                             |
| Change does not exist                      | Covered                                                                                             |
| Cleanup rules spec vs verify               | **Missing** in this suite                                                                           |
| Artifact load null skipped                 | Indirect; no assertion key absent from map                                                          |
| SchemaProvider.get throws before hash      | **Missing**                                                                                         |
| Ready: `spec-approved` event, stay `ready` | Partial: `state === 'ready'` + `activeSpecApproval.reason`; no history event shape / hashes / actor |
| Drain pending → `spec-approved`            | Covered                                                                                             |
| Drafting → `InvalidStateTransitionError`   | Covered (describe title still says “not in pending-spec-approval”)                                  |
| Persist via `mutate`, return `ready`       | Ready returns `ready`; **`mutate` spy only on drain path**                                          |
| Input name/reason only                     | Type-level only                                                                                     |
| Factory passes `config.approvals`          | Composition tests `instanceof` only                                                                 |
| Enabled gate drain to `spec-approved`      | Covered (verify still uses pending GIVEN — drain, valid)                                            |
| Schema mismatch before mutate              | Covered                                                                                             |

#### Missing tests

- Ready path: `mutate` called; history `type: 'spec-approved'` with reason, hashes, actor; **no** `transitioned` to pending/`spec-approved`.
- Hash key `type:key`; cleanup applied vs not; skip `missing`/`skipped`.
- `SchemaProvider.get()` rejection in gate.
- Factory: deps include `contentHasher` + `approvals` from `config.approvals`.

#### Counts (`core:approve-spec`)

- Requirements: **8**
- Implemented (conforming): **8** (hash/registry wording is spec-side; behavior matches intended hashing)
- Discrepancies: **4** (2 spec-wording, 1 purpose/bindings tightness, 1 archived-spec lag)
- Verify scenarios covered / partial / missing: **7 / 2 / 4** (of 13 listed in merged verify)

---

### `core:approve-signoff`

**Implementation map**

| Area       | Location                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| Use case   | `packages/core/src/application/use-cases/approve-signoff.ts` (mirror of ApproveSpec)                                      |
| Engine row | `approval.signoff`: `{ from: 'done', to: 'archivable', along: 'forward' }` (`check-bindings.ts` L61–65) — **not** `to: *` |
| Tests      | `packages/core/test/application/use-cases/approve-signoff.spec.ts`                                                        |

#### Requirements summary

Same eight-requirement skeleton as ApproveSpec, with signoff names: stay in bound `from` (**currently `done`**); MUST NOT `transition('signed-off')` or `transition('pending-signoff')` on that path; drain `pending-signoff` → `signed-off` MAY.

#### Implementation status

- **Stay-in-`done` (conforms).** `recordSignoff` only; `transition('signed-off')` iff `freshChange.state === 'pending-signoff'`.
- **`boundFromStates('approval.signoff')` → `['done']`** (tested).
- Same `contentHasher` vs `hasher` naming, SchemaProvider vs SchemaRegistry wording, and `consentFrom[0] ?? 'done'` error fallback as ApproveSpec.

#### Discrepancies

1. Same hash/`SchemaRegistry` and `hasher` vs `contentHasher` wording as ApproveSpec.
2. **`approval.signoff` is `to: 'archivable'` not `to: *`.** Spec for this use case does not require wildcard `to`; config says `done` cannot go to `archivable` until consent. Engine is narrower than `approval.spec`’s `to: *`. **Not a bug** vs this spec; note if a future forward leave of `done` other than `archivable` should also wait on signoff.
3. Archived workspace spec still describes parking into `signed-off` as the happy path.

#### Test coverage / missing

Mirror of ApproveSpec: stay-in-`done` + drain covered; persist `mutate` spy only on drain; describe title still “not in pending-signoff”; hash cleanup / schema throw / factory field list missing.

#### Counts (`core:approve-signoff`)

- Requirements: **8**
- Implemented: **8**
- Discrepancies: **3** (wording ×2, archived-spec lag)
- Verify: **7 covered / 2 partial / 4 missing** (same pattern)

---

### `core:config`

Delta only rewrites **Requirement: Approvals** (+ spec deps). Other requirements (file location, privacy, workspaces, storage, context, logging, plugins, graph, …) are unchanged by this change.

#### Requirements summary (Approvals — in scope)

- `approvals.spec` / `approvals.signoff` default `false`; independent.
- **`spec: true`:** change in `ready` cannot go to `implementing` until `ApproveSpec` records consent; **stays in `ready`**; `approval.spec` fails `APPROVAL_REQUIRED` until then; when `false`, `ready → implementing` is free (`approval.spec` skips). **New work MUST NOT enter `pending-spec-approval` via `change transition`.**
- **`signoff: true`:** stay in `done` until `ApproveSignoff`; when `false`, `done → archivable` is free. **New work MUST NOT enter `pending-signoff` via `change transition`.**

Verify add: _Spec gate on does not require pending-spec-approval in the graph_.

#### Implementation status

- Loader: `config-loader.ts` L616 `approvals: { spec: data.approvals?.spec ?? false, signoff: data.approvals?.signoff ?? false }`; `SpecdConfig.approvals` in `specd-config.ts`. Tests parse booleans (`config-loader.spec.ts`).
- In-place wait is **not** encoded in YAML; it is engine `approval.spec` + `ApproveSpec` stay-in-`ready`. Protocol: `isValidTransition('ready', 'pending-spec-approval') === false` and `isValidTransition('done', 'pending-signoff') === false` (`change-state.spec.ts`).

#### Discrepancies

1. **Config Approvals text vs engine `to: *` (spec incomplete vs engine).** Merged config says the spec gate blocks **`ready → implementing`**. Engine binds `approval.spec` as `from: 'ready', to: '*', along: 'forward'`. Tests: `ready → verifying` **matches**; `ready → designing` (redesign) **does not**. If implementing is omitted from workflow, `ready → verifying` still requires spec consent. **Either** config should say “any forward leave of `ready`” **or** the engine should list explicit `to` states. Evidence favors documenting `to: *` (test named “approval.spec wildcard”).
2. **Archived `specs/core/config/spec.md` L481** still documents the **pending hop** (`ready` → `pending-spec-approval` → `spec-approved` → `implementing`). That contradicts this change’s merged Approvals requirement. Expected until archive; **do not treat workspace spec as current.**
3. **Verify scenario “does not require pending in the graph”** has no config-package test; coverage lives in `change-state.spec.ts` protocol edges.

#### Test coverage

| Scenario                                               | Status                                    |
| ------------------------------------------------------ | ----------------------------------------- |
| Parse `approvals.spec` / `signoff` booleans            | Covered (`config-loader.spec.ts`)         |
| Spec gate on → wait is `approval.spec` not pending hop | Engine/lifecycle tests, not config-loader |
| New work cannot `transition` to pending                | Covered (`isValidTransition` false)       |

#### Missing tests

- Config-level documentation/contract test that enabled spec gate does **not** imply a pending state in help/schema comments (optional; behavior is elsewhere).
- Explicit assertion that `ready → verifying` (forward, `to: *`) is gated when `approvals.spec` is on (lives in lifecycle-engine / transition-change, not `core:config` tests).

#### Counts (`core:config` — Approvals delta)

- Requirements in delta: **1** (Approvals), plus ~20 unchanged headings not re-litigated
- Approvals implemented: **yes** (flags + engine/protocol)
- Discrepancies: **3** (config vs `to: *`; archived pending copy; verify not in config tests)
- Unchanged config requirements: **not claimed failing** in this batch

---

### `core:hook-execution-model`

Delta: default selection uses `from`/`to`/`along`; **post only forward**; skipHooks skips effects; post-failure abort before persist on transitions; entity does not run hooks.

#### Requirements summary (delta-touched)

1. **Default execution** — `TransitionChange` selects effects with same matcher as predicates; `phase`/`onFailure` from binding; no private “always source.post on any exit”; no branch on check id for launching `RunStepHooks`.
2. **skipHooks** — `skipHookPhases`; predicates still run; skills that skip auto-hooks MUST apply the same `along` filter (no source.post on backward / redesign / recovery).
3. **Post-hook failure** — binding `onFailure`; transition post `abort` + `before-persist`; archive post `collect` + `after-persist`.
4. **Constraints** — “Transition source.post … **only when `along = forward`**”.
5. **Change entity does not execute hooks** — TransitionChange/ArchiveChange do.
6. **Two execution modes** — TransitionChange uses binding `onFailure`, not “every post is fail-soft”.

Unchanged (still in spec): two hook types, external entries, instruction passive, pre-hook fail-fast, ordering, template expansion.

#### Implementation status

- **Post `along=forward` only (conforms).** `TRANSITION_BINDING_SPECS` `hook.post`: `{ from: '*', to: '*', along: 'forward' }`, `phase: 'before-persist'`, `onFailure: 'abort'` (`check-bindings.ts` L66–71). `hook.pre` uses `along: '*'` with `exceptAlong: ['recovery']`.
- Selection: `matchingEffects` filters `bindingMatches(..., along)` (`execute-hook-effect.ts`). Redesign `implementing → designing` omits `hook.post`, keeps `hook.pre` (`matching-effects.spec.ts`).
- `TransitionChange` test `skips source.post on redesign into designing`.
- Matcher unit: `hook.post` does not match `ready → designing`; does match `implementing → verifying`.

#### Discrepancies

1. **Backward / recovery not asserted at use-case level.** Matcher + redesign covered. No `matchingEffects` / `TransitionChange` test that **`verifying → implementing` (backward)** or **recovery** omits `hook.post`. Implementation should omit them because `along !== 'forward'`. **Gap is tests, not an observed code bug.**
2. **Manual skip-hooks `along` filter in templates** is skill-side (`shared.md.tpl`); hook-execution-model requires skills to apply it — see `skills:skill-templates-source`.

#### Test coverage

| Verify scenario (merged)                        | Status                                                                                       |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Transition source.post skipped on redesign      | Covered (`matching-effects` + `transition-change`)                                           |
| skip all still enforces predicates              | Covered (`still fails incomplete tasks when skipHookPhases is all`)                          |
| Transition source.post failure does not persist | Covered (`throws HookFailedError when source.post hook fails`)                               |
| Archive post collect vs transition abort        | Covered (`matching-effects` archive after-persist collect; transition post abort on binding) |
| TransitionChange auto-runs matching run effects | Covered                                                                                      |
| Post-hooks before persist                       | Covered (ordering tests)                                                                     |

#### Missing tests

- `matchingEffects` / TransitionChange: **backward** omits `hook.post`.
- Recovery omits both `hook.pre` (`exceptAlong`) and `hook.post` (`along=forward`).
- Explicit `along: 'forward'` snapshot on the `hook.post` binding row (phase/onFailure already snapshotted; `along` inferred via matcher tests).

#### Counts (`core:hook-execution-model`)

- Requirements (full spec headings): **12**
- Delta-critical (post forward / skip / failure / entity): **implemented**
- Discrepancies: **1** (test gap on backward/recovery post skip)
- Focus verify: **6/6 covered** for added scenarios; extra along cases missing

---

### `skills:skill-templates-source`

Delta adds **Requirement: In-place approval gates in workflow templates**.

#### Requirements summary (new)

Templates (`specd`, `specd-new`, `specd-design`, `specd-implement`, `specd-verify`, `specd-archive`) and `shared.md.tpl`:

- MUST describe gates as in-place on `ready` / `done`.
- MUST NOT teach `change transition` into `pending-spec-approval` / `pending-signoff` as happy path.
- **`shared.md.tpl`:** never run `changes approve`; stay in `ready`/`done`; pending **drain only**; hook list MUST NOT treat pending as happy-path intermediates; skip-hooks MUST NOT run `source.post` on backward/redesign/recovery.
- **`specd-design`:** stay in `ready`; stop for human `approve spec`.
- **`specd-implement`:** MUST NOT `transition implementing` while spec gate on and no approval.
- **`specd-verify`:** stay in `done`; MUST NOT “routes to `pending-signoff`”; still owns `done → archivable` after consent.
- **`specd-new`:** pending rows drain-only; `ready`/`done` with unsatisfied gate → approve, not parking.
- Template contract tests MUST assert absence of happy-path parking copy.

Other headings (template location, frontmatter, optimizer, graph snippets, …) unchanged.

#### Implementation status

- **`shared.md.tpl` (conforms):** “MUST NEVER run `changes approve`”; “**stays** in `ready` or `done`”; pending MAY appear only as drain; hook section lists delivery states without pending as intermediates; explicit “MUST NOT run `source.post` on `along` backward, redesign, or recovery”.
- **`specd-implement` (conforms):** stay in `ready`; do not `transition implementing`.
- **`specd-verify` (conforms):** stay in `done`; “Do not `change transition` into `pending-signoff`”.
- **`specd-new` (conforms):** `ready` / `done` rows suggest approve when gate unsatisfied; `pending-*` rows labeled **Drain only**; `spec-approved` drain-only on implement row.
- **`specd-design` (conforms for stay-in-ready):** spec=on → tell user `approve spec`, stop; no pending hop. Does **not** use the words “stay in `ready`” (implement does).
- **`specd` entry + `specd-archive`:** **no** in-place gate copy and **no** pending parking copy. Satisfies MUST NOT teach parking; **weak** on MUST **describe** gates (requirement lists those templates by name).

Tests: `packages/skills/test/template-workflow.spec.ts` `does not teach pending parking as the happy-path wait` covers verify, implement, shared, new. **No** specd-design / specd / specd-archive assertions in that test.

#### Discrepancies

1. **Listed templates vs copy (`specd`, `specd-archive`).** Spec names them as MUST describe in-place gates. They are silent. **Either** add a short in-place paragraph **or** narrow the spec to the templates that actually own the gate UX (`shared`, design, implement, verify, new). Neither-side: silence does not teach parking.
2. **`specd-design` not in contract test** despite being named in the requirement and having stay-in-ready behavior.

#### Test coverage

| Verify scenario                                                                | Status                                   |
| ------------------------------------------------------------------------------ | ---------------------------------------- |
| Verify skill does not route to pending-signoff; stay in done + approve signoff | Covered                                  |
| Implement does not hop implementing; stay in ready                             | Covered                                  |
| Shared: never approve; stay ready/done; not “reaches pending-spec-approval”    | Covered                                  |
| Shared hook list not pending intermediates                                     | Covered (`Do **not** list pending...`)   |
| New-skill pending drain-only                                                   | Covered (`Drain only:` + ready gate row) |
| Design stay-in-ready / no pending hop                                          | **Missing** as a dedicated assertion     |
| specd / specd-archive                                                          | **Missing**                              |

#### Missing tests

- `specd-design/SKILL.md.tpl`: no `pending-spec-approval` happy-path; spec=on stop + `approve spec`.
- Optional: `specd` / `specd-archive` do not contain `routes to pending-*` / `reaches pending-*`.
- Assert `shared.md.tpl` forbids `source.post` on backward/redesign/recovery (copy exists; test does not grep that sentence).

#### Counts (`skills:skill-templates-source`)

- New requirement: **1** (with 5 verify scenarios)
- Happy-path parking: **absent** in inspected templates
- Drain-only pending: **present** in shared + specd-new
- Discrepancies: **2** (silent specd/archive vs MUST describe; missing design contract test)
- Verify: **5 covered / 0 partial / 2 extra gaps** (design; specd/archive)

---

## Cross-cutting: `approval.spec` `from=ready` `to=*` `along=forward`

| Claim             | Evidence                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| Binding           | `check-bindings.ts` L56–60: `from: 'ready', to: '*', along: 'forward'`, `reportSkipWhenUnmatched: true`             |
| `boundFromStates` | `['ready']`; `boundToStates('approval.spec')` **`[]`** (wildcard omitted)                                           |
| Matcher           | `ready → verifying` matches; `ready → designing` does not (`transition-checks.spec.ts`)                             |
| Predicate         | `approval-spec.ts`: skip if gate off; pass if `activeSpecApproval`; else `APPROVAL_REQUIRED` “before leaving ready” |
| ApproveSpec stay  | Consent in `ready` without leaving `ready` so the next **forward** bound edge can pass                              |

**Config spec vs this binding:** config still names only `implementing` as the blocked `to`. Engine + tests encode wildcard `to` + forward-only `along`. Flagged under `core:config`.

**`approval.signoff` is not `to: *`:** `from: 'done', to: 'archivable', along: 'forward'`. Symmetric stay-in-`done`, narrower `to`.

---

## Summary counts (this batch)

| Spec                            | Reqs (focus / full headings) | Conforming impl             | Discrepancies | Missing tests (material)                                           |
| ------------------------------- | ---------------------------- | --------------------------- | ------------- | ------------------------------------------------------------------ |
| `core:approve-spec`             | 8 / 8                        | Yes (stay-in-ready + drain) | 4             | Ready `mutate`/history; hash cleanup; schema throw; factory fields |
| `core:approve-signoff`          | 8 / 8                        | Yes (stay-in-done + drain)  | 3             | Same pattern as spec                                               |
| `core:config`                   | 1 delta / ~20                | Flags + protocol            | 3             | Config verify “no pending in graph” not in config tests            |
| `core:hook-execution-model`     | 4 delta / 12                 | Post `along=forward`        | 1             | Backward/recovery omit `hook.post`                                 |
| `skills:skill-templates-source` | 1 new / 15                   | Drain-only in shared/new    | 2             | Design (and specd/archive) contract tests                          |

**Totals (this batch):** ~26 requirement headings fully listed; **focus items implemented**; **13 discrepancy notes** (several are spec-wording / archive lag / test gaps, not stay-in-state bugs); **material missing tests ~12**.

**Verdict on asked focus**

- Stay-in-`ready` / stay-in-`done`: **code and primary use-case tests match merged specs.**
- `approval.spec` `from=ready to=* along=forward`: **engine + matcher tests match**; config Approvals prose is **narrower** (`implementing` only).
- Post hooks `along=forward` only: **binding + redesign tests match**; backward/recovery **untested at use-case**.
- Skill templates drain-only pending: **shared, new, implement, verify match**; `specd`/`specd-archive` silent; design untested.
