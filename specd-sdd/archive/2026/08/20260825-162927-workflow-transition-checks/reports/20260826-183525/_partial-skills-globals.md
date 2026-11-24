# Batch: skills-globals

**Mode:** change `workflow-transition-checks` (read-only compliance)
**Assigned:** `skills:skill-templates-source` (spec-preview), `default:_global/architecture`, `default:_global/conventions`, `default:_global/testing` (`specs show`)
**CLI:** `node packages/cli/dist/index.js`
**Graph:** `stale: false` (indexed `2026-08-26T16:29:52.129Z`, `currentRef` `2948f1a2`)
**Neither spec nor code is assumed correct.** Findings present spec-drift vs implementation-bug vs both.

---

## Per spec

### `skills:skill-templates-source`

**Sources:** `changes spec-preview workflow-transition-checks skills:skill-templates-source`; deltas `spec.md.delta.yaml` / `verify.md.delta.yaml` (both explicit **no-op**); templates under `packages/skills/templates/`; contract tests `packages/skills/test/template-workflow.spec.ts`.

**Delta contract:** _“Skill template entry states are out of this change; implement/verify templates later.”_ Proposal/tasks/design agree: skill template entry-state rewrites are **out of this change**. Own spec body is unchanged (14 requirements: template location, migration, metadata contract, Handlebars rendering, graph impact/search wording, frontmatter, implementation tracking, metadata self-healing, optimizer gating, command roles).

#### Requirements vs own spec (preview)

| Requirement                                                                        | Status vs templates/code                                                                              |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Template source location / `.md.tpl` / meta files                                  | Implemented (`templates/skills/*`, `templates/agents/*`, `skill.meta.json` / `specd-agent.meta.json`) |
| No `specd-metadata/` skill; shared consumer index not SOT                          | Implemented (no `templates/skills/specd-metadata/`)                                                   |
| Capability-aware Handlebars; `@{{sharedFolder}}/shared.md`                         | Implemented in skill templates                                                                        |
| Graph impact dependents/dependencies; no `--changes`                               | Not re-audited line-by-line this batch; prior contract tests do not cover this                        |
| Graph search `--snippet` opt-in                                                    | Same                                                                                                  |
| Frontmatter injection / runtime matrix                                             | Plugin + renderer path; unchanged by this change                                                      |
| Implementation tracking / metadata self-healing / optimizer gating / command roles | Covered by `template-workflow.spec.ts` string contracts                                               |

Own-spec requirements are **not contradicted** by the no-op delta. The gap is **cross-spec**: installed workflow templates still describe the **old** approval routing, which **does** contradict sibling change specs (`core:transition-checks`, `core:lifecycle-engine`, `core:approve-spec`, `core:change`).

#### Lifecycle vs templates (assigned check)

Happy-path in this change: gates are predicates on `ready → implementing` / `done → archivable`. `TransitionChange` MUST NOT rewrite into `pending-spec-approval` / `pending-signoff`. Pending states are **drain-only**. `nextAction` on failed `approval.spec` recommends `specd changes approve spec`, not a hop to pending.

**Templates still treat pending states as the normal wait:**

1. **`specd-verify` happy-path signoff (high)**  
   `packages/skills/templates/skills/specd-verify/SKILL.md.tpl` (and installed `.claude/skills/specd-verify/SKILL.md`): after `transition … done`, **“If signoff=on: transition routes to `pending-signoff`.”**
   - Spec-correct (new lifecycle): stay in `done`; human `approve signoff`; then `done → archivable`.
   - Code/engine: requesting `pending-signoff` from `done` is not a legal happy-path edge.
   - **Both:** template is stale relative to engine; change spec correctly deferred template rewrite. Agents following verify will **expect a route that no longer happens**.

2. **`shared.md` “Approvals are human-only” (high)**  
   `templates/shared/shared.md.tpl`: “When a change **reaches** `pending-spec-approval` or `pending-signoff`, your only job is to tell the user [approve commands].”
   - Drain-only reading: still valid for in-flight changes already in those states.
   - Happy-path reading: implies the change **arrives** there. New model: change **stays** in `ready`/`done`.
   - Spec of templates-source does not mention this; contradiction is vs **lifecycle** specs.

3. **`specd-new` routing table (medium)**  
   `templates/skills/specd-new/SKILL.md.tpl`: `targetStep` rows for `pending-spec-approval` and `pending-signoff` as primary suggestions. After this change, `nextAction.targetStep` from `ready` with gate on should be approve-in-place / stay `ready`, not pending. Drain rows are still useful if engine ever reports those states. Table over-weights pending as **normal** `nextAction` keys.

4. **Hook “states you pass through” (medium)**  
   `shared.md.tpl`: “Execute hooks for every state the change **passes through**, including intermediate ones (`pending-spec-approval`, `spec-approved`, … `pending-signoff`, …).” Happy path no longer passes through pending. Drain still needs those hook step ids. Wording teaches agents to **walk** pending as intermediates.

5. **`specd-implement` entry (medium)**  
   Accepts `ready` / `implementing` / `spec-approved`; from `ready` always `transition … implementing`. No stay-in-ready + `approve spec` when the spec gate is on. Failed-transition section says follow Repair Guide (engine can recover), but the **happy path does not mention the gate**.
   - Spec-wrong if templates were in scope.
   - Implementation-ok for this change because delta is no-op.
   - Runtime: transition fails with `APPROVAL_REQUIRED` until human approve; agent may still try the hop first.

**Not a happy-path pending hop:** `specd` entry skill defers to CLI `nextAction` (aligned). `specd-new` `ready` row (“Review artifacts, then `/specd-implement` if approved”) is closer to in-place approval than pending routing.

**Possible resolutions (do not implement here):** update templates in a follow-on change (as this change already declared); or treat pending copy as drain-only with explicit “in-flight only” language; or keep templates and revert engine (rejected by this change’s specs).

#### Test coverage

- `template-workflow.spec.ts` asserts optimizer gating, command roles, archive metadata wording. **Does not** assert absence of “routes to `pending-signoff`” / “reaches `pending-spec-approval`”.
- No missing tests **for the no-op delta**. Missing tests **for lifecycle alignment** are deferred with the templates (verify delta: “verify scenarios deferred with the templates themselves”).

#### Spec dependency chain

Preview `dependsOn`: `skills:skill`, `cli:spec-optimizations`, `skills:workflow-automation`. No-op does not contradict those. **Does** contradict **this change’s** lifecycle specs until templates are updated (acknowledged out-of-scope).

#### Summary (this spec)

| Metric                                 |                            Count |
| -------------------------------------- | -------------------------------: |
| Requirements reviewed (own spec)       |                               14 |
| Implemented vs own spec                |         14 (baseline; unchanged) |
| Partial vs sibling lifecycle specs     | 1 (whole template set; deferred) |
| Missing vs own spec                    |                                0 |
| Discrepancies (lifecycle vs templates) |                                5 |
| Missing tests (lifecycle wording)      |                     1 (deferred) |
| Missing tests (own spec / this change) |                                0 |

---

### `default:_global/architecture`

**Source:** `specs show default:_global/architecture` (not in the change). Lens: domain I/O, ports, tests vs adapters.

#### Change specs/code (this change)

- New/moved check engine lives in `packages/core/src/domain/` (`transition-checks`, check runners). **No `node:fs` / net / child_process in `packages/core/src/domain`.** Engine evaluates `PredicateSnapshots`; I/O stays in application/infrastructure. **Conforms** to “domain layer is pure” and “application uses ports.”
- `core:transition-checks` depends on `default:_global/architecture`. Change specs do **not** instruct domain I/O. **No spec↔global contradiction.**

#### `@specd/skills` (package that owns templates; not modified by this change)

Architecture: any package with domain logic uses `domain` / `application` / `infrastructure`; domain has zero I/O; application talks only through ports; public `"."` MUST NOT export concrete adapters.

| Finding                         | Evidence                                                                                                                     | Spec vs code                                                                                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Domain I/O                      | `packages/skills/src/domain/templates/index.ts` imports `existsSync` from `node:fs` and probes absolute template paths       | Spec: domain pure. Code: filesystem in domain. **Code (and placement) wrong** _or_ this helper should live in infrastructure. Pre-existing; **not introduced by this change**. |
| Application I/O without ports   | `application/specd-block-manager.ts`, `json-config-manager.ts`, `render-base-agent-instruction.ts` import `node:fs/promises` | Spec: application uses ports only. Code: direct fs. **Code wrong** _or_ these modules should be infrastructure adapters. Pre-existing.                                         |
| Adapter export                  | `packages/skills/src/index.ts` exports `createSkillRepository` from infrastructure                                           | Spec: concrete adapters not on public `"."`. Skills is not `@specd/core`, but it **has** a domain layer. Pre-existing.                                                         |
| Use cases that **do** use ports | `ResolveBundle` / `GetSkill` / `ListSkills` take `SkillRepository`                                                           | Conforms for those use cases.                                                                                                                                                  |

Architecture also says “Currently `@specd/core` is the only such package” for the three-layer layout, **and** “any future package with domain logic must follow the same structure.” Skills already has three layers but **does not** fully obey purity/ports. Ambiguous spec vs incomplete adoption.

**Adapter packages contain no business logic** lists CLI/MCP/plugins, not `@specd/skills`. No finding that skills must be logic-free.

#### Summary (this spec)

| Metric                                           |         Count |
| ------------------------------------------------ | ------------: |
| Requirements reviewed                            |            13 |
| Change core domain vs globals                    | Conform (I/O) |
| Skills-package discrepancies (pre-existing)      |             3 |
| Contradictions introduced by this change’s specs |             0 |
| Missing tests (this batch / this change)         |             0 |

---

### `default:_global/conventions`

**Source:** `specs show default:_global/conventions`. Lens: ESM, naming, errors.

| Requirement                       | This change / skills                                                                                                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ESM only                          | `@specd/skills` `"type": "module"`; tsup `--format esm`; no `require()` / `module.exports` / `export default` under `packages/skills`. Core change files remain ESM/`NodeNext`. **Pass.** |
| `strict` via `tsconfig.base.json` | `packages/skills/tsconfig.json` extends `../../tsconfig.base.json`. **Pass.**                                                                                                             |
| kebab-case sources                | Skills sources kebab-case. **Pass.**                                                                                                                                                      |
| Named exports                     | Skills public API named exports. **Pass.**                                                                                                                                                |
| Errors extend `SpecdError`        | `SpecdSkillsError extends SpecdError`. **Pass.**                                                                                                                                          |
| Lazy list vs content              | `SkillRepository.list()` is metadata; `get`/`getBundle` load content. Aligns with lazy-loading convention. **Pass.**                                                                      |

Change specs do not reintroduce CommonJS or `any`. **No contradiction** between this change and conventions.

#### Summary (this spec)

| Metric                |                                       Count |
| --------------------- | ------------------------------------------: |
| Requirements reviewed |                                           9 |
| Implemented           | 9 (for audited skills + change ESM surface) |
| Partial               |                                           0 |
| Missing               |                                           0 |
| Discrepancies         |                                           0 |
| Missing tests         |                                           0 |

---

### `default:_global/testing`

**Source:** `specs show default:_global/testing`. Lens: Vitest, unit tests with **mocked ports**, no fs in unit tests, typed full mocks, no snapshots.

#### Skills package

| Requirement                                     | Evidence                                                                                                                                                                                                                                                                                                                                                                               | Verdict                             |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Vitest, `test/` mirror, `.spec.ts`              | `package.json` `"test": "vitest run"`; tests under `test/`                                                                                                                                                                                                                                                                                                                             | **Pass**                            |
| No snapshots                                    | No `toMatchSnapshot` / `toMatchInlineSnapshot` in skills                                                                                                                                                                                                                                                                                                                               | **Pass**                            |
| Unit tests mock ports, no fs                    | `test/resolve-bundle.spec.ts`: `SkillRepository` object with all four methods (`list`, `get`, `getBundle`, `listSharedFiles`) — **good**. Unused methods are `vi.fn()` not `throw new Error('not implemented')` — **soft miss** vs letter of the spec.                                                                                                                                 | Partial                             |
| Domain/application unit tests must not touch fs | `test/template-workflow.spec.ts` uses `readFileSync` on real templates (fixture contract test). `test/domain/skill.spec.ts` uses `os.tmpdir()` + `createSkillRepository` (real adapter) under **domain** path — **integration test mis-filed**. `specd-block-manager.spec.ts` / `json-config-manager.spec.ts` hit real temp files because those modules **are** fs (see architecture). | Pre-existing layering/test-type mix |

#### This change’s core tests (globals lens, not a skills-package edit)

- `packages/core/test/domain/services/transition-checks.spec.ts`: pure Vitest, **no filesystem**. Matches “domain unit tests with no I/O.”
- `packages/core/test/application/use-cases/transition-change.spec.ts` / `get-status.spec.ts`: `{ execute } as unknown as RefreshImplementationTracking` (and similar `CountTasks` casts). Testing spec **forbids** `as unknown as Port` for **ports**. These are **use-case class** stubs, not port interfaces.
  - If spec is read narrowly: **not a Port violation**.
  - If spec is read as “no partial typed casts of collaborators”: **spirit miss**. Prefer a tiny fake implementing the execute contract without `as unknown as`.

Composition tests `createX(deps as unknown as SpecdConfig)` are pre-existing overload-testing, not new port-mock style.

#### Summary (this spec)

| Metric                                            |                                                   Count |
| ------------------------------------------------- | ------------------------------------------------------: |
| Requirements reviewed                             |                                                       6 |
| Skills: hard fails vs this change                 |                                                       0 |
| Skills: pre-existing test-boundary issues         | 2 (`template-workflow` fs; domain spec using real repo) |
| Soft mock-contract issue                          |                       1 (`vi.fn()` unused port methods) |
| Change engine unit tests vs I/O rule              |                                                 Conform |
| Discrepancies to treat as this-change regressions |                                                       0 |
| Missing tests for deferred template lifecycle     |                      1 (same as skill-templates-source) |

---

## Batch totals

| Metric                                                                                      |            Count |
| ------------------------------------------------------------------------------------------- | ---------------: |
| Specs in batch                                                                              |                4 |
| Own-spec requirements reviewed (`skill-templates-source`)                                   |               14 |
| Global requirements reviewed (architecture + conventions + testing)                         |               28 |
| Discrepancies: templates vs **new lifecycle** (deferred, still real for agents)             |                5 |
| Discrepancies: this change **specs vs globals** (domain I/O / ESM / mocked ports)           |                0 |
| Discrepancies: **pre-existing** skills architecture (domain/application fs, adapter export) |                3 |
| Discrepancies: **pre-existing** skills testing boundaries                                   | 2 (+1 soft mock) |
| Missing tests attributable to **this change’s no-op**                                       |                0 |
| Missing tests for **lifecycle template language** (explicitly deferred)                     |                1 |

**Batch verdict:** Change specs and core engine **do not** contradict globals on domain I/O, ESM, or port-mocked engine tests. `skills:skill-templates-source` is an honest **no-op**; workflow templates **still describe `pending-spec-approval` / `pending-signoff` as happy-path waits**, especially `specd-verify` “transition routes to `pending-signoff`”. That is a **known deferred** mismatch with this change’s lifecycle, not a failed implementation of the no-op delta. Skills-package hexagonal/testing issues are **pre-existing** and out of this change’s task list.
