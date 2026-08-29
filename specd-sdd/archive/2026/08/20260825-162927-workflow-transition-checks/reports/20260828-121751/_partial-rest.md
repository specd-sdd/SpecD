# Spec-Compliance Audit — `workflow-transition-checks` (partial: "rest" slice)

- **Change:** `20260825-162927-workflow-transition-checks`
- **Repo:** `/Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux`
- **Report slice:** `_partial-rest`
- **Date:** 2026-08-28
- **Mode:** read-only audit (no code or spec files modified)

## Scope

Specs audited via `change spec-preview <change> <specId> --format text` (merged spec + verify,
deltas applied):

| Spec                            | Preview lines | Delta ops in this change                                                                                     |
| :------------------------------ | :------------ | :----------------------------------------------------------------------------------------------------------- |
| `core:config`                   | 1646          | 2 (`approvals.spec` in-place; depend on transition-checks)                                                   |
| `core:validate-artifacts`       | 1013          | 3 (DAG evaluate w/ empty `checksByTarget`; `ListWorkspaces` ports; depend on transition-checks)              |
| `core:get-artifact-instruction` | 256           | 5 (nextArtifact from DAG; purpose; deps; constraints; `templateExpander`)                                    |
| `core:schema-format`            | 1396          | 4 (workflow is lookup config; requires feeds engine DAG)                                                     |
| `core:storage`                  | 577           | 2 (DAG cascade owned by `LifecycleEngine`; depend on lifecycle-engine)                                       |
| `skills:skill-templates-source` | 557           | 5 (in-place gates; impl-tracking drain; archive pre-hooks; design review scope; depend on transition-checks) |

Globals consulted: `default:_global/conventions`, `default:_global/eslint` (both via `specs show`).
`default:_global/architecture` and `default:_global/testing` were referenced only indirectly through
the layer/lint rules already encoded in `eslint.config.js`; a full read of those two was **not**
performed in this slice.

Focus areas requested and covered:

1. Composition wiring — `ValidateArtifacts` / `ListWorkspaces`, `GetArtifactInstruction`.
2. `pending-parent-artifact-review` coercion in storage / change.
3. Skill templates vs pending hops, `--next`, overlap review.

Primary evidence sources: `specd graph search` for symbol resolution, direct file reads for
verification, `eslint --print-config` / `eslint` runs for lint-rule reality checks.

---

## Counts

| Severity                                    |  Count |
| :------------------------------------------ | -----: |
| High                                        |      3 |
| Medium                                      |      6 |
| Low                                         |      6 |
| Observations (no spec requirement violated) |      3 |
| **Total findings**                          | **18** |

| Verification outcome                           | Count |
| :--------------------------------------------- | ----: |
| Requirements spot-checked against code         |    34 |
| Confirmed compliant (see "Verified compliant") |    16 |
| Divergent / unimplemented                      |     9 |
| Spec-internal or cross-spec contradictions     |     4 |
| Test-coverage gaps                             |     2 |

---

## High severity

### H1 — `core:validate-artifacts` uses the permissive metadata schema where the spec mandates the strict one

**Requirement:** MetadataExtraction validation, step 3 — _"Validate the result against
`strictSpecMetadataSchema`."_

**Code:**

```583:593:packages/core/src/application/use-cases/validate-artifacts.ts
              const { permissiveSpecMetadataSchema } =
                await import('../../domain/services/parse-metadata.js')
              const validationResult = permissiveSpecMetadataSchema.safeParse(extracted.metadata)
              if (!validationResult.success) {
                failures.push({
                  artifactId: artifactType.id,
                  description: `MetadataExtraction validation failed: ${validationResult.error.message}`,
                  filename: validationFilename,
                })
                artifactFailed = true
              }
```

Both schemas exist and are exported (`packages/core/src/domain/services/parse-metadata.ts:93` and
`:165`). `strictSpecMetadataSchema` is the one used by `persist-spec-metadata.ts:33` and
`fs-spec-index-cache.ts:223`. `ValidateArtifacts` is the only consumer that reaches for the
permissive variant, so extracted metadata that would be rejected at persistence time can still pass
the validation gate and reach `markComplete`. This directly weakens the verify scenario _"Invalid
extracted metadata prevents completion"_.

**Impact:** an artifact can be marked `complete` with metadata that later fails strict validation
during persistence or index materialization.

---

### H2 — `core:validate-artifacts` "Policy-aware drift materialization" is not implemented in `ValidateArtifacts`

**Requirement:** _"When ValidateArtifacts compares the current file state to the validated baseline,
it SHALL treat any mismatch as drift evidence for that file. This includes changed content and file
absence."_ plus the verify scenarios _"Missing file can still carry hasDrift without rendering
complete-with-drift"_ and _"Policy none preserves complete while still marking drift"_.

**Code:** the only drift path inside `ValidateArtifacts` is gated on an active approval or signoff,
and it explicitly skips absent files:

```304:317:packages/core/src/application/use-cases/validate-artifacts.ts
    if (approval !== undefined || signoff !== undefined) {
      for (const artifactType of schema.artifacts()) {
        const changeArtifact = change.getArtifact(artifactType.id)
        if (
          changeArtifact === null ||
          changeArtifact.status === 'missing' ||
          changeArtifact.status === 'skipped'
        ) {
          continue
        }
        for (const [fileKey, file] of changeArtifact.files) {
          if (file.status === 'missing' || file.status === 'skipped') continue
          const artifactContent = await this._changes.artifact(change, file.filename)
          if (artifactContent === null) continue
```

Consequences:

- **File absence is never drift evidence.** A file that vanishes is filtered out twice (by
  `file.status === 'missing'` and by `artifactContent === null`), so it can never contribute to the
  grouped invalidation payload.
- **No approval, no drift.** With `approvals.spec` and `approvals.signoff` both off (the config
  default per `core:config` Requirement: Approvals), the whole block is skipped. Combined with the
  "Complete and skipped file bypass" requirement — which the code honours at lines 374–391 by
  `continue`-ing before ever reading the file — a persisted-`complete` file with changed content is
  never re-hashed by `ValidateArtifacts`.
- **The policy-`none` scenario is unsatisfiable through this use case:** `hasDrift` is never set by
  `ValidateArtifacts` at all; it is only read back from the manifest.

The behaviour the spec describes does exist, but it lives in the **fs adapter**, not the use case:

```1523:1569:packages/core/src/infrastructure/fs/change-repository.ts
      // Auto-invalidate if any previously validated file drifted from its stored hash.
      const driftedFilesByArtifact = new Map<string, Set<string>>()
      ...
          let drifted = false
          if (file.status === 'complete') {
            const derivedStatus = await this._deriveFileStatus(...)
            drifted = derivedStatus !== 'complete'
          } else {
            drifted = true
          }
      ...
        change.invalidate(
          'artifact-drift',
          SYSTEM_ACTOR,
```

`core:storage` does acknowledge repository-side drift invalidation (Requirement: Artifact status
derivation — _"drift invalidations must only be performed when the repository is fully initialized
with resolved artifact types"_), so this is not an undocumented architecture break. But it means
`core:validate-artifacts` Requirement "Policy-aware drift materialization" describes ownership that
the implementation does not have, and it uses a different actor (`SYSTEM_ACTOR` vs the resolved
`ActorResolver` identity that `ValidateArtifacts` passes at line 735).

**Impact:** the requirement as written is unimplementable by the named component; three verify
scenarios cannot pass against `ValidateArtifacts` in isolation. Either the requirement moves to
`core:storage`, or `ValidateArtifacts` gains a baseline (not approval-scoped) drift comparison.

---

### H3 — `default:_global/eslint` JSDoc enforcement is blanket-disabled on the change's central domain service

**Requirement:** _"All functions, methods, classes, type aliases, and interfaces in source files must
have a JSDoc comment. This includes internal helpers."_ The only exemption in Constraints is
_"Test files (`test/\*\*/_.spec.ts`) are exempt from JSDoc requirements."_ The verify scenario is
explicit: _"WHEN a class method (public or private) has no JSDoc block comment THEN [lint error]"\*.

**Code:** `lifecycle-engine.ts` — the service this whole change is organised around — opts out
file-wide, with no justification comment:

```1:1:packages/core/src/domain/services/lifecycle-engine.ts
/* eslint-disable jsdoc/require-jsdoc */
```

Undocumented members behind that disable include the **public** `findBlockingParent`, which is part
of the contract this change relies on (`ValidateArtifacts` line 349, `TransitionChange` line 394):

```317:323:packages/core/src/domain/services/lifecycle-engine.ts
  findBlockingParent(
    change: ArtifactGraphSource,
    schema: Schema,
    artifactId: string,
  ): { artifactId: string; status: ArtifactStatus } | null {
    return this._findBlockingParent(change, schema, artifactId, new Set())
  }
```

plus `_resolveTarget`, `_isStepPermitted`, `_effectiveStatus`, and `_findBlockingParent`.

I verified the rule is genuinely active for this path (`eslint --print-config` resolves
`jsdoc/require-jsdoc` to `[2, { contexts: [..., "MethodDefinition", ...] }]`), and that
`npx eslint packages/core/src/domain/services/lifecycle-engine.ts` exits clean **only** because of
the file-level disable.

Same pattern, also unjustified, in two other source files:

- `packages/core/src/composition/use-cases/archive-change.ts:1`
- `packages/cli/src/commands/change/spec-preview.ts:1`

For contrast, `packages/core/src/domain/read-only-change-view.ts:56` does the same thing _with_ an
inline rationale (`-- getters mirror {@link Change}; public contract is on view interfaces`), which
is the pattern the other three should follow if the exemption is intentional.

**Impact:** the documented lint contract silently does not hold for the most-read file in this
change. A reviewer running lint gets a false green.

---

## Medium severity

### M1 — `resolveValidateArtifactsDeps` field is `contentHasher`; spec and verify both say `hasher`

**Requirement:** `core:validate-artifacts` Requirement "Config-based factory delegates through
resolveValidateArtifactsDeps" lists `hasher: ContentHasher`. The constructor block in the same
requirement also names the parameter `hasher`. The verify scenario
_"createValidateArtifacts config form derives ValidateArtifactsDeps through
resolveValidateArtifactsDeps"_ repeats `hasher: ContentHasher`.

**Code:** the deps interface and resolver use `contentHasher`:

```22:32:packages/core/src/composition/use-cases/validate-artifacts.ts
export interface ValidateArtifactsDeps {
  readonly changes: ChangeRepository
  readonly listWorkspaces: ListWorkspaces
  readonly schemaProvider: SchemaProvider
  readonly parsers: ArtifactParserRegistry
  readonly actor: ActorResolver
  readonly contentHasher: ContentHasher
  readonly extractorTransforms: ExtractorTransformRegistry
  readonly workspaceRoutes: readonly SpecWorkspaceRoute[]
  readonly lifecycle: LifecycleEngine
}
```

The `isValidateArtifactsDeps` type guard also checks `'contentHasher' in value` (line 150), so an
object built from the spec literally would be routed to the config branch and crash. The class
constructor parameter _is_ `hasher` (line 144), so the divergence is purely at the composition
boundary — which is exactly the boundary the requirement governs.

Worth noting: **this change explicitly fixed the sibling naming issue** for
`GetArtifactInstruction` (delta op description: `'Factory field is templateExpander'`), but left the
parallel `hasher` / `contentHasher` mismatch in `core:validate-artifacts` untouched.

---

### M2 — `core:get-artifact-instruction` verify.md still says `templates:` after spec.md was changed to `templateExpander:`

The change's spec delta deliberately renames the field:

```
specd-sdd/.../deltas/core/get-artifact-instruction/spec.md.delta.yaml:52
  description: 'Factory field is templateExpander'
specd-sdd/.../deltas/core/get-artifact-instruction/spec.md.delta.yaml:65
  - `templateExpander: TemplateExpander`
```

There is **no corresponding op in `verify.md.delta.yaml`**, so the merged verification file still
asserts the old name:

```244:244:/tmp/preview_core_get-artifact-instruction.md
- `templates: TemplateExpander`
```

The code matches spec.md (`templateExpander`, `composition/use-cases/get-artifact-instruction.ts:29`
and `:135`), so verify.md is the stale artifact. This is an internal inconsistency introduced by
this change, and it is the kind of thing `crossArtifactValidations` between `specs` and `verify`
would not catch because both sides are prose inside a scenario bullet list.

---

### M3 — `core:get-artifact-instruction` says rules entries carry `text`; `core:schema-format` and the code say `instruction`

**Requirement (get-artifact-instruction):** _"**`rulesPre`** — if the artifact declares `rules.pre`,
collect all entries' `text` in declaration order."_ The verify scenario repeats it:
`rules.pre: [{ id: "r1", text: "Pre rule" }]`.

**Requirement (schema-format), which owns the shape:**

- _"`pre` (array, optional) — entries injected **before** the instruction. Each entry:
  `{ id: string, instruction: string }`."_
- Constraint: _"`artifact.rules.pre` and `artifact.rules.post` are optional arrays of
  `{ id, instruction }` entries."_

**Code** follows `core:schema-format`:

```129:131:packages/core/src/application/use-cases/get-artifact-instruction.ts
    const rulesPre = (artifactType.rules?.pre ?? []).map((r) =>
      this._templates.expand(r.instruction, contextVars),
    )
```

So the code is right and `core:get-artifact-instruction` (spec **and** verify) is wrong in two
places. Since `core:schema-format` is a declared dependency of `core:get-artifact-instruction`, this
is a dependency-direction contradiction, not merely a typo.

---

### M4 — `ValidateArtifacts` drift scan is not scoped to the current invocation

**Requirement:** Complete and skipped file bypass — _"Approval/signoff drift detection MUST still run
for files that are actually validated in the invocation; bypassing `complete`/`skipped` files reduces
unnecessary drift comparisons and **avoids spurious `artifact-drift` invalidation during batch
validation**."_

**Code:** the drift loop iterates `schema.artifacts()` — the full set — rather than
`artifactTypesToValidate`, and it runs before and independently of the per-artifact loop:

```305:305:packages/core/src/application/use-cases/validate-artifacts.ts
      for (const artifactType of schema.artifacts()) {
```

`artifactTypesToValidate` (line 240) is the invocation-scoped list and is correctly narrowed when
`input.artifactId` is provided, but the drift scan ignores it. So
`validate <change> --artifact verify` can invalidate the change because `proposal` drifted — the
precise "spurious invalidation during batch validation" the requirement is trying to prevent.

The scan also re-reads and re-hashes every non-missing file on every invocation, including
`complete` ones that the bypass requirement is meant to skip.

---

### M5 — "Recompute lifecycle interpretation after each persisted completion" is an in-memory verdict patch, and completions are not persisted mid-pass

**Requirement:** Dependency order check — _"When `ValidateArtifacts` validates more than one artifact
or file in a single `execute` invocation ... it MUST recompute lifecycle/effective-status
interpretation after each persisted completion so dependents processed later in the same invocation
observe parents completed in that pass. It MUST NOT rely on a lifecycle snapshot frozen only at
`execute` start."_

**Code:** the lifecycle is evaluated exactly once (line 224), and completions patch a local map:

```230:238:packages/core/src/application/use-cases/validate-artifacts.ts
    const markVerdictComplete = (artifactId: string): void => {
      const verdict = artifactVerdicts.get(artifactId)
      if (verdict === undefined) return
      artifactVerdicts.set(artifactId, {
        ...verdict,
        state: 'complete',
        effectiveStatus: 'complete',
      })
    }
```

Nothing is persisted until the single terminal `mutate()` at line 727, and
`this._lifecycle.evaluate` is never called a second time.

The direct-`requires` case works (the verify scenario _"Lifecycle snapshot refreshes after
markComplete in same execute"_ would pass), but the **cascade** does not: when `proposal` completes
mid-pass, artifacts that were downgraded to `pending-parent-artifact-review` _because of_ `proposal`
keep that stale effective status, because `_effectiveStatus`'s recursive review propagation
(`lifecycle-engine.ts:366-394`) is not re-run. A three-level DAG (`proposal → specs → verify`)
validated in one pass can therefore still report `verify` as dependency-blocked after `proposal` and
`specs` both succeeded in that same pass.

The wording _"after each **persisted** completion"_ is also literally unmet: nothing is persisted
until the end.

---

### M6 — `core:config` forbids entering `pending-spec-approval` via `change transition`; the guard only fires when the gate is off

**Requirement (`core:config`, Requirement: Approvals):** _"New work MUST NOT enter
`pending-spec-approval` via `change transition`."_ and _"New work MUST NOT enter `pending-signoff`
via `change transition`."_ — both stated unconditionally.

**Code:**

```343:363:packages/core/src/application/use-cases/transition-change.ts
    if (
      (requestedTarget === 'pending-spec-approval' || requestedTarget === 'spec-approved') &&
      !this._approvals.spec &&
      !isSpecDrain
    ) {
      throw new InvalidStateTransitionError(fromState, requestedTarget, {
        type: 'gate-not-required',
        gate: 'spec',
      })
    }
```

The guard is `!this._approvals.spec`. With `approvals.spec: true` — the only configuration where the
gate matters — `specd changes transition <name> pending-spec-approval` from `ready` is still
accepted. `LifecycleEngine._isStepPermitted` agrees (`lifecycle-engine.ts:334-339`: permitted when
`approvals.spec && isValidTransition`). The CLI also still advertises both states as valid positional
steps (`cli:change-transition` delta line 161).

The new `core:transition-checks` spec is narrower — it only says _"`TransitionChange` MUST NOT
**rewrite** `implementing` to `pending-spec-approval`"_ (line 211), which the code does satisfy. So
this is at minimum a spec-vs-spec disagreement about how hard the prohibition is, and at worst a
missing guard. Given `skills:skill-templates-source` invests heavily in teaching agents that pending
states are drain-only, leaving the transition itself reachable is a real hole in the story.

---

## Low severity

### L1 — No composition tests for either resolver named in this change

`core:validate-artifacts` and `core:get-artifact-instruction` each add a verify scenario asserting
the config-based factory derives deps through the named resolver and delegates to the canonical
factory. `packages/core/test/composition/use-cases/` holds 33 `.spec.ts` files, but neither
`validate-artifacts.spec.ts` nor `get-artifact-instruction.spec.ts` is among them. A repo-wide search
confirms `resolveValidateArtifactsDeps` and `resolveGetArtifactInstructionDeps` are referenced only
by `kernel.ts` and their own modules — no test asserts the resolved shape.

This also means the M1 `hasher` / `contentHasher` mismatch has nothing guarding it, and the verify
scenario _"Constructor receives ListWorkspaces / does not take a `ReadonlyMap` of `SpecRepository`"_
is unasserted (`listWorkspaces` does not appear anywhere in
`packages/core/test/application/use-cases/validate-artifacts.spec.ts`).

### L2 — Calling `ValidateArtifacts.execute` with neither `artifactId` nor `specPath` throws

```249:254:packages/core/src/application/use-cases/validate-artifacts.ts
    if (
      input.specPath === undefined &&
      artifactTypesToValidate.some((artifactType) => artifactType.scope === 'spec')
    ) {
      throw new SpecNotInChangeError('<specPath required>', input.name)
    }
```

Several verify scenarios are phrased as _"`ValidateArtifacts.execute` is called without
`artifactId`"_ with no mention of `specPath` (e.g. _"Skipped optional artifact does not cause
failure"_, _"Missing optional artifact does not cause failure"_). Against any schema containing a
spec-scoped artifact, those calls throw before reaching the behaviour under test. Either the
scenarios need `specPath` spelled out, or Requirement: Input needs to state the
`artifactId`-and-`specPath`-both-absent rule, which it currently does not.

Secondary nit: `SpecNotInChangeError('<specPath required>', ...)` fabricates a spec path to express
a missing-argument condition. `default:_global/conventions` Requirement: Error types requires a
machine-readable `code` and Actionable Messaging; a placeholder in the identifier slot works against
both.

### L3 — `resolveArtifactValidationFilename` keeps a legacy direct path that the spec says must not be accepted

```845:857:packages/core/src/application/use-cases/validate-artifacts.ts
function resolveArtifactValidationFilename(
  trackedFile: TrackedValidationFile | undefined,
  expectedFilename: string,
): string {
  if (trackedFile === undefined) return expectedFilename
  if (
    trackedFile.validatedHash === undefined &&
    isDeltaTrackedFilename(trackedFile.filename) !== isDeltaTrackedFilename(expectedFilename)
  ) {
    return expectedFilename
  }
  return trackedFile.filename
}
```

Once `validatedHash` is set, the tracked filename wins even if its representation class disagrees
with the expected one. Requirement: Expected file path validation says _"`ValidateArtifacts` MUST
validate that delta file and MUST NOT accept a direct artifact file at
`specs/<workspace>/<capability-path>/<artifact-filename>` as a fallback"_, and Result shape says
_"`ValidationFileResult.filename` MUST be the expected path used by validation. It MUST NOT report an
alternate file path."_ The escape hatch is deliberate (the doc comment says so) and probably correct
for migration, but it is undocumented in the spec.

### L4 — Dynamic `import()` inside the per-artifact loop

```583:585:packages/core/src/application/use-cases/validate-artifacts.ts
              const { permissiveSpecMetadataSchema } =
                await import('../../domain/services/parse-metadata.js')
```

Every other consumer of that module imports statically (`persist-spec-metadata.ts:4`,
`fs-spec-index-cache.ts:4`). Inside a loop over artifacts this is a per-iteration module-cache
lookup for no benefit, and it hides the dependency from the graph. No spec forbids it outright, so
this is a consistency issue rather than a violation — but it is the same line as H1, so both should
be fixed together.

### L5 — `core:schema-format` and `core:get-artifact-instruction` disagree on template interpolation

`core:schema-format` Requirement: Template resolution: _"Template content is plain text — no
interpolation or placeholder substitution is performed."_

`core:get-artifact-instruction` Requirement: Instruction resolution: _"Template variable expansion
(via `TemplateExpander`) MUST be applied to the template content using the same contextual variables
as `instruction`."_

The code implements the latter (`get-artifact-instruction.ts:140-143`). Both statements can be read
as compatible if you scope schema-format's sentence to _load time_ and get-artifact-instruction's to
_serve time_, but nothing in either spec says so.

Note: I initially suspected the code returned the template _path_ rather than its content. It does
not — `ArtifactType` resolves `template` to file content at load and keeps the path separately in
`templateRef` (`packages/core/src/domain/value-objects/artifact-type.ts:42-45`). No finding there.

### L6 — Duplicate `findBlockingParent` call in the dependency-blocked path

```347:351:packages/core/src/application/use-cases/validate-artifacts.ts
        const blockedByParent =
          blockedDep.status === 'pending-parent-artifact-review'
            ? (this._lifecycle.findBlockingParent(change, schema, artifactType.id) ??
              this._lifecycle.findBlockingParent(change, schema, blockedDep.reqId))
            : null
```

The first call already recurses through `blockedDep.reqId` (`_findBlockingParent` walks `requires`
transitively, `lifecycle-engine.ts:411-419`), so the `??` fallback is unreachable in practice. Each
call re-runs `_effectiveStatus` over the whole DAG with a fresh `visiting` set, so the fallback is a
latent O(n²) path for no behavioural gain. Behaviour is correct — the verify scenario _"Review-
propagation blocker includes recursive parent context"_ passes — so this is cleanup only.

---

## Observations (no spec requirement violated)

### O1 — `--next` exists in the CLI but no skill template teaches it

`specd changes transition <name> --next` is implemented
(`packages/cli/src/commands/change/transition.ts:203`, validated at `:112-128`, spec'd in the
`cli:change-transition` delta lines 126-162: _"the CLI MUST call `TransitionChange.execute` with
`to: 'next'` ... MUST NOT maintain a from→to routing table"_).

A search across `packages/skills/templates/**` returns **zero** occurrences of `--next`. Every
template still writes explicit targets (`transition <name> ready --skip-hooks all`, etc.).

No requirement in `skills:skill-templates-source` mandates teaching `--next`, so this is not a
violation. It is a discoverability gap: the change adds a Core-resolved happy-path hop specifically
to stop agents from hard-coding routing tables, and the agent-facing surface never mentions it.
Worth a follow-up decision — either add it to `shared.md.tpl` or record that it is deliberately
CLI-only.

### O2 — `changes check-overlap` is never referenced by any template

Templates handle overlap reactively: `shared.md.tpl:594-604` tells the agent to stop when
`changes create` / `changes edit` emits a `spec overlap detected` warning, and
`specd-archive/SKILL.md.tpl:147-157` handles `SpecOverlapError` with `--allow-overlap`. The
dedicated `changes check-overlap [name]` command is never suggested as a proactive check.

Again, no requirement demands it. Flagging because the audit brief called out "overlap review" and
the reactive-only posture means an agent only learns about overlap at create/edit/archive time.

### O3 — Drift invalidation is split across two actors

`FsChangeRepository.get()` invalidates with `SYSTEM_ACTOR`
(`change-repository.ts:1566`); `ValidateArtifacts` invalidates with the resolved `ActorResolver`
identity (`validate-artifacts.ts:735`). Both write the same `artifact-drift` cause into history.
Consumers reading change history will see two different attributions for what is conceptually the
same event. Neither `core:storage` nor `core:validate-artifacts` says which actor is canonical.

---

## Verified compliant

These were checked against code and found to match the merged specs. Listed so the next reviewer
does not re-walk them.

**Composition wiring**

1. `ValidateArtifacts` constructor takes `ListWorkspaces`, not a `ReadonlyMap<string, SpecRepository>`
   (`validate-artifacts.ts:138-148`); workspace lookup goes through `execute()` at line 263.
   Satisfies Requirement: Ports and constructor and the verify scenario
   _"Constructor receives ListWorkspaces"_. (Untested — see L1.)
2. `resolveValidateArtifactsDeps` resolves all nine dependencies from the shared
   `CompositionResolver`, and the config branch delegates to the canonical `createValidateArtifacts(deps)`
   rather than reconstructing fs wiring inline (`composition/use-cases/validate-artifacts.ts:40-57`,
   `:131-132`). Only the `hasher` field name diverges (M1).
3. `resolveGetArtifactInstructionDeps` resolves all six dependencies and delegates identically
   (`composition/use-cases/get-artifact-instruction.ts:40-53`, `:117-118`).
4. Both use cases call `LifecycleEngine.evaluate(change, schema, { checksByTarget: {} })`
   (`validate-artifacts.ts:224-226`, `get-artifact-instruction.ts:103-105`). Neither references
   `availableTransitions` or `executeChecksByLegalTargets` — grep returns zero hits in both files.
5. `gatherPredicateSnapshots` does not exist anywhere in `packages/`; the only occurrence is the
   negative assertion `expect('gatherPredicateSnapshots' in mod).toBe(false)` in
   `transition-checks.spec.ts:387`. Satisfies the "no snapshot bag" constraint in both specs.
6. `GetArtifactInstruction` builds `TemplateVariables` from `change.name` and `change.path` only —
   no `change.workspace`, no `change.workspaces[0] ?? 'default'` (`get-artifact-instruction.ts:124-126`).
   Satisfies the verify scenario _"Contextual variables built for expansion have no workspace key"_.
7. `delta.availableOutlines` is a plain `string[]` of spec IDs with no inline outline trees
   (`get-artifact-instruction.ts:162-180`); missing files are silently skipped via `continue`.
8. Auto-resolution uses `lifecycle.nextArtifact` and throws `ArtifactNotFoundError('(auto)', ...)`
   when it is `null` (`get-artifact-instruction.ts:106-109`).

**`pending-parent-artifact-review` coercion**

9. Load coerces the token to `in-progress` at file level
   (`change-repository.ts:1422-1424`) and at artifact level via `persistableArtifactStatus(raw.state ?? 'missing')`
   (`:1442`).
10. Save applies the same coercion to both file `state` (`:1718`) and artifact `state` (`:1727`).
11. `ArtifactFile` rejects the token in memory (`value-objects/artifact-file.ts:52-54`:
    _"pending-parent-artifact-review is engine-derived and cannot be persisted on a file"_).
12. The wire schema still accepts the legacy token so old manifests load
    (`infrastructure/fs/manifest.ts:311`) — which is what makes the "legacy sane" rewrite meaningful.
13. Covered by test: `change-repository.spec.ts:664` —
    _"given wire pending-parent-artifact-review, when get then save, then status ..."_, seeding both
    `artifacts[0].state` and `artifacts[0].files[0].state`.

Together these satisfy `core:storage` Requirement: Artifact dependency cascade in full.

**Skill templates**

14. **Pending hops.** `pending-spec-approval` / `pending-signoff` appear in exactly two templates,
    both correctly framed. `shared.md.tpl:386` — _"MAY appear only as **drain** for in-flight
    changes already in those states — not as the happy-path wait"_; `shared.md.tpl:504` — _"Do
    **not** list `pending-spec-approval` / `pending-signoff` as happy-path intermediates"_;
    `specd-new/SKILL.md.tpl:150,152` — both rows marked `Drain only:` with the matching `approve`
    command. `specd-design`, `specd-verify`, `specd-implement`, `specd-archive` and the `specd`
    router contain **zero** occurrences.
15. **Router purity.** `skills/specd/SKILL.md.tpl` matches neither `signoff` nor `approve` — zero
    hits. Satisfies the verify scenario _"specd entry skill does not teach signoff"_.
16. **Remaining template requirements**, each confirmed by direct grep:
    - `shared.md.tpl:376-389` — _"You MUST NEVER run `changes approve` yourself"_, stay-in-`ready`/`done` framing.
    - `specd-archive/SKILL.md.tpl:139,144,157,163` — `--skip-hooks pre`, never `all`, with the
      rationale _"Pre `run:` / `instruction:` already ran in step 4"_.
    - `specd-verify/SKILL.md.tpl:25-27, 62-64, 312-314` — drains `IMPLEMENTATION_STATE` in-skill,
      points at `shared.md`, explicitly _"Do **not** redirect to `/specd-implement` solely for open files"_.
    - `specd-implement/SKILL.md.tpl:272-274, 316` — requires _"zero open"_ tracked files before
      recommending `/specd-verify`; prefers top-level `--symbol` links (`:153, :169-172`).
    - `specd-design/SKILL.md.tpl:48-50` — review scope from `artifacts (details):` and
      `review.affectedArtifacts`, not a `review:` file list.

    Contract tests back all of these: `packages/skills/test/template-workflow.spec.ts:74, 83-84, 93,
99, 105, 123, 141, 149-151`.

**Other**

- `_dependencyBlockedDescription` (`validate-artifacts.ts:789-816`) distinguishes all four blocker
  classes as the spec requires: `pending-parent-artifact-review` with parent context,
  `pending-review` / `drifted-pending-review` as _"requiring review"_, and `missing` / `in-progress`
  as _"incomplete dependency"_ with the status always included. No generic-wording degradation.
- Artifact traversal uses `schema.artifactDag().topologicalOrder()` when no `artifactId` filter is
  present (`validate-artifacts.ts:243-247`).
- Delta eligibility is decided at artifact-file level: a missing base `verify.md` fails even when
  `spec.md` exists (`validate-artifacts.ts:479-487`). Satisfies Requirement: Delta eligibility uses
  artifact-level base existence.
- No-op delta bypass short-circuits `deltaValidations`, application preview, and structural
  validation, hashing the raw delta content (`validate-artifacts.ts:447-460`).
- Persistence goes through `ChangeRepository.mutate(name, fn)` operating on the fresh instance
  (`validate-artifacts.ts:727-752`). Satisfies Requirement: Save after validation.
- `npx eslint` is clean on `lifecycle-engine.ts`, `validate-artifacts.ts`, and
  `composition/use-cases/get-artifact-instruction.ts` — though see H3 for why that green is partly
  illusory. Layer-boundary `no-restricted-imports` rules are present in `eslint.config.js`
  (lines 125, 143, 163) as `default:_global/eslint` Requirement: Layer boundary enforcement requires.

---

## Suggested triage order

1. **H1** — one-line schema swap; smallest fix with the clearest correctness win.
2. **M1 / M2 / M3** — spec-vs-code naming and cross-spec contradictions. All three are documentation
   edits except M1, which needs a decision on which name is canonical.
3. **H2 / M4 / M5** — the drift and lifecycle-recompute cluster in `ValidateArtifacts`. These
   interact; fixing them piecemeal risks double-invalidation. Decide first whether drift ownership
   stays in `FsChangeRepository` (then move the requirement to `core:storage`) or moves into the use
   case (then implement baseline comparison and absence handling).
4. **H3** — either remove the blanket disables and write the JSDoc, or add rationale comments in the
   `read-only-change-view.ts` style and record the exemption in `default:_global/eslint`.
5. **M6** — needs a product decision before code: is `transition <name> pending-spec-approval` with
   the gate on legal or not? `core:config` and `core:transition-checks` currently disagree.
6. **L1** — add the two composition specs; they would have caught M1.
7. Remaining L2–L6 and O1–O3 as cleanup.

---

## Method notes and limits

- All spec text quoted is the **merged** preview (base + this change's deltas), produced with
  `node packages/cli/dist/index.js change spec-preview workflow-transition-checks <specId> --format text`.
- Symbol locations resolved with `specd graph search --symbols`; the graph was current for every
  lookup performed.
- Lint claims were verified by running `eslint` and `eslint --print-config` against the actual
  files, not inferred from `eslint.config.js` alone. The `--print-config` output required parsing
  through `node` because the shell wrapper truncates large JSON payloads.
- **Not covered in this slice:** full reads of `default:_global/architecture` and
  `default:_global/testing`; the `cli:*` deltas (`change-approve`, `change-archive`, `change-status`,
  `change-transition`) beyond the `--next` cross-reference; `core:lifecycle-engine`,
  `core:transition-change`, `core:get-status`, `core:change`, `core:workflow-model`,
  `core:hook-execution-model`, `core:approve-spec`, `core:approve-signoff`, `core:archive-change`;
  and the new spec `core:transition-checks` itself, which was read only where it bears on M6.
- No test suite was executed. Test-coverage findings (L1) are based on file inventory and symbol
  search, not on a coverage run.
