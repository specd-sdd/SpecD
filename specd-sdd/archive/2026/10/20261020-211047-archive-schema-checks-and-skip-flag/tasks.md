# Tasks: archive-schema-checks-and-skip-flag

## 1. Schema grammar types and parser

- [x] 1.1 Add the archive declaration type
      `packages/core/src/domain/value-objects/workflow-step.ts`: new `WorkflowStepArchiveCheckDeclaration` — typed shape of one `archiveChecks` entry.
      Approach: `interface { readonly id: string; readonly skippable?: boolean; readonly disabled?: boolean; readonly config?: Readonly<Record<string, unknown>> }` with JSDoc stating it is valid only on `archiving` and has no `onFailure` (design N1).
      (Req: Archive operation checks; Workflow step checks and skip-checks declarations)
- [x] 1.2 Add `archiveChecks` to `WorkflowStep`
      `packages/core/src/domain/value-objects/workflow-step.ts`: `WorkflowStep` — optional field for the new declarations.
      Approach: add `readonly archiveChecks?: readonly WorkflowStepArchiveCheckDeclaration[]`; update the interface JSDoc to list `archiveChecks` among the row extras.
      (Req: Step names reference domain lifecycle states)
- [x] 1.3 Export the new type
      `packages/core/src/domain/value-objects/index.ts`: export list — expose `WorkflowStepArchiveCheckDeclaration` next to `WorkflowStepCheckDeclaration`.
      Approach: add `type WorkflowStepArchiveCheckDeclaration` to the existing export block from `./workflow-step.js`; do not touch `public.ts`.
      (Req: Workflow)
- [x] 1.4 Add the strict Zod schema for archive declarations
      `packages/core/src/infrastructure/schema-yaml-parser.ts`: `WorkflowStepArchiveCheckZodSchema` — parser-level shape check.
      Approach: `z.object({ id: z.string(), skippable: z.boolean().optional(), disabled: z.boolean().optional(), config: z.record(z.unknown()).optional() }).strict()`, declared after `WorkflowStepSkipCheckZodSchema` (~line 278).
      (Req: Workflow)
- [x] 1.5 Wire `archiveChecks` into the workflow step Zod schema and transform
      `packages/core/src/infrastructure/schema-yaml-parser.ts`: `WorkflowStepZodSchema` — accept and carry the field.
      Approach: add `archiveChecks: z.array(WorkflowStepArchiveCheckZodSchema).optional()` and, in `.transform`, `...(ws.archiveChecks !== undefined ? { archiveChecks: ws.archiveChecks as WorkflowStepArchiveCheckDeclaration[] } : {})`.
      (Req: Workflow)
- [x] 1.6 Extend `WorkflowStepRaw`
      `packages/core/src/infrastructure/schema-yaml-parser.ts`: `WorkflowStepRaw` (~line 423) — typed raw step.
      Approach: add `readonly archiveChecks?: readonly WorkflowStepArchiveCheckDeclaration[]` and import the type.
      (Req: Workflow)

## 2. Schema layering and build validation

- [x] 2.1 Merge `archiveChecks` across layers
      `packages/core/src/domain/services/merge-schema-layers.ts`: `applyWorkflowMutations` — add an `archiveChecks` block in the "existing step" branch after `skipChecks` (~line 643).
      Approach: `step = { ...step, archiveChecks: addToArray(step.archiveChecks ?? [], entry.archiveChecks, 'id', position, layer, \`${opName}.workflow[${entry.step}].archiveChecks\`) }`; a repeated id throws via `addToArray`. Do not extend `RemoveWorkflowEntry`.
      (Req: Archive operation checks; Two-tier governance and confinement locks)
- [x] 2.2 Map `archiveChecks` in `buildSchema`
      `packages/core/src/domain/services/build-schema.ts`: workflow mapping (~line 701) — carry the field into `WorkflowStep`.
      Approach: `...(step.archiveChecks !== undefined ? { archiveChecks: step.archiveChecks } : {})`.
      (Req: Step names reference domain lifecycle states)
- [x] 2.3 Make the fallback registry know archive bindings
      `packages/core/src/domain/services/build-schema.ts`: `activeRegistry` (line 795) — governance locks must work without an injected registry.
      Approach: `registry ?? new CheckRegistry(Object.values(DOMAIN_CHECKS), [...TRANSITION_BINDINGS, ...ARCHIVE_BINDINGS])`; import `ARCHIVE_BINDINGS` from `./check-bindings.js`.
      (Req: Two-tier governance and confinement locks)
- [x] 2.4 Make `CheckRegistry` default bindings include archive
      `packages/core/src/domain/services/check-registry.ts`: constructor default `defaultBindings` — default must match composition.
      Approach: default `[...TRANSITION_BINDINGS, ...ARCHIVE_BINDINGS]`, importing `ARCHIVE_BINDINGS` from `./check-bindings.js`.
      (Req: Two-tier governance and confinement locks)
- [x] 2.5 Reject `archiveChecks` outside `archiving`
      `packages/core/src/domain/services/build-schema.ts`: semantic validation loop — step-name rule.
      Approach: for every `step` with `archiveChecks !== undefined` and `step.step !== 'archiving'` throw `SchemaValidationError(ref, "workflow step '<step>' cannot declare archiveChecks; archiveChecks is only valid on 'archiving'")`, even for an empty array.
      (Req: Workflow step checks and skip-checks declarations; Archive operation checks)
- [x] 2.6 Add the authoritative shape validation for archive declarations
      `packages/core/src/domain/services/build-schema.ts`: new module-private `assertArchiveCheckShape(ref, index, chk)` — covers merged layers that bypass Zod.
      Approach: require a non-null non-array object; allowed keys exactly `id`, `skippable`, `disabled`, `config`; `id` non-empty string; booleans for `skippable`/`disabled`; `config` a plain object; throw `SchemaValidationError(ref, "workflow step 'archiving': archiveChecks[<index>] <reason>")` with reasons like `has unsupported key 'onFailure'`.
      (Req: Archive operation checks)
- [x] 2.7 Extract the shared declaration governance helper
      `packages/core/src/domain/services/build-schema.ts`: new module-private `assertDeclarationGovernance(args)` — one implementation of placement, policy, disable, config locks.
      Approach: move the duplicated lock code of the `checks` and `skipChecks` loops into the helper (same errors, same messages, same order: embedding → policy(onFailure then skippable) → disable → config) and call it from both loops; if any existing `build-schema.spec.ts` message changes, revert to the inline code and keep the helper only for the archive loop.
      (Req: Two-tier governance and confinement locks)
- [x] 2.8 Add the archive declaration validation loop
      `packages/core/src/domain/services/build-schema.ts`: new loop after the `skipChecks` loop — per declaration validation.
      Approach: for each `archiveChecks` entry run in order: shape (2.6) → `UnknownCheckError` if `!activeRegistry.has(id)` → duplicate key `${id}::archive` in `checkCoordinateSet` → `DuplicateCheckBindingError(id, 'scope: archive')` → find `matchingBinding` with an `archive` applicability row → `assertDeclarationGovernance` with coordinate `scope: archive` (policy lock only compares `skippable`).
      (Req: Workflow step checks and skip-checks declarations; Two-tier governance and confinement locks)

## 3. Archive binding locks

- [x] 3.1 Lock `workspace.readOnly` on archive
      `packages/core/src/domain/services/check-bindings.ts`: `ARCHIVE_BINDING_SPECS` row `workspace.readOnly` — security boundary.
      Approach: set `allowBindingOverride: false`, `allowConfigOverride: false`, `allowDisable: false`, keep `skippable: false`; leave the transition row untouched.
      (Req: Two-tier governance and confinement locks)
- [x] 3.2 Lock `deps.consistent` on archive
      `packages/core/src/domain/services/check-bindings.ts`: `ARCHIVE_BINDING_SPECS` row `deps.consistent`.
      Approach: same three flags to `false`; `skippable: false`.
      (Req: Two-tier governance and confinement locks)
- [x] 3.3 Lock `impl.filesResolved` on archive
      `packages/core/src/domain/services/check-bindings.ts`: `ARCHIVE_BINDING_SPECS` row `impl.filesResolved`.
      Approach: same three flags to `false`; `skippable: false`; `impl.linksInScope` and `spec.overlap` rows stay as they are.
      (Req: Two-tier governance and confinement locks; Tracked implementation review guard)
- [x] 3.4 Document the archive exception
      `packages/core/src/domain/services/check-bindings.ts`: JSDoc of `ARCHIVE_BINDING_SPECS` — explain the exception and its reasons.
      Approach: state that only `spec.overlap` and `impl.linksInScope` are tunable on archive; the three locked rows keep Category C policy on transitions.
      (Req: Two-tier governance and confinement locks)

## 4. Binding resolver

- [x] 4.1 Add `operation` to the resolver input
      `packages/core/src/domain/services/transition-checks.ts`: `ResolveEffectiveBindingsInput` — new optional `operation?: 'archive' | undefined` with JSDoc.
      Approach: field is optional so existing callers compile unchanged.
      (Req: Dynamic runtime binding composition and cascaded config resolution)
- [x] 4.2 Guard the exclusivity rule
      `packages/core/src/domain/services/transition-checks.ts`: `resolveEffectiveBindings` — reject mixed inputs.
      Approach: at the start, when `operation === 'archive'` and (`targetStep !== undefined` or `bypassedSteps.length > 0`) throw `InvalidInputError("resolveEffectiveBindings: 'operation: archive' cannot be combined with 'targetStep' or 'bypassedSteps'")`.
      (Req: Dynamic runtime binding composition and cascaded config resolution)
- [x] 4.3 Introduce the shared overlay helper types
      `packages/core/src/domain/services/transition-checks.ts`: private `OverlayDeclaration` and `OverlayPlan<D>` — shape of one overlay pass.
      Approach: define as in design N3 (`declarations`, optional `declMatches`, `rowsOf`, `concrete`, optional `step`).
      (Req: Dynamic runtime binding composition and cascaded config resolution)
- [x] 4.4 Refactor the transition overlay onto the helper
      `packages/core/src/domain/services/transition-checks.ts`: `resolveEffectiveBindings` pass 1 — use `overlayDeclarations` with the existing parameters.
      Approach: `declMatches` uses `checkMatches` on `{from: chk.from ?? '*', to: targetStep, along: chk.along ?? 'forward'}`; `rowsOf` filters transition rows matching the attempt; output must be identical (run existing `transition-checks.spec.ts`).
      (Req: Dynamic runtime binding composition and cascaded config resolution)
- [x] 4.5 Refactor the step-skip overlay onto the helper
      `packages/core/src/domain/services/transition-checks.ts`: `resolveEffectiveBindings` pass 2 — same helper, per bypassed step.
      Approach: `rowsOf` keeps step-skip rows with `step === '*'` or the bypassed step; pass `step: bypassedStep` so wildcard remainders stay concrete.
      (Req: Dynamic runtime binding composition and cascaded config resolution)
- [x] 4.6 Add the archive overlay pass
      `packages/core/src/domain/services/transition-checks.ts`: `resolveEffectiveBindings` pass 3 — apply `archiveChecks`.
      Approach: when `operation === 'archive'`, `declarations = schema.workflowStep('archiving')?.archiveChecks ?? []`, `rowsOf = b => b.applicability.filter(a => a.scope === 'archive')`, `concrete = { scope: 'archive' }`; `disabled` drops the binding; unmatched, enabled declarations synthesize `{ skippable: chk.skippable ?? false, onFailure: 'abort', governance from registry (default false), effectiveConfig from the cascade }` appended in declaration order.
      (Req: Dynamic runtime binding composition and cascaded config resolution; Archive is an operation not an edge)
- [x] 4.7 Preserve assembly semantics
      `packages/core/src/domain/services/transition-checks.ts`: assembly step 3 — no behavioural change.
      Approach: keep split-by-edited-rows, residual rows and wildcard remainder logic; verify results for transition/step-skip inputs are byte-identical before and after the refactor.
      (Req: Dynamic runtime binding composition and cascaded config resolution)

## 5. Shared skip validation

- [x] 5.1 Create `validate-skip-checks.ts`
      `packages/core/src/application/services/validate-skip-checks.ts`: new `validateSkipChecks`, `ValidateSkipChecksInput`, `HOOK_CHECK_NOT_SKIPPABLE_REASON` — pure shared validation.
      Approach: implement exactly as design N2: dedupe preserving order; per id: unbound and unregistered → `UnknownCheckError`; bound effect → `CheckNotSkippableError(id, HOOK_CHECK_NOT_SKIPPABLE_REASON)`; bound non-skippable → `CheckNotSkippableError(id)`; registered unbound → accepted; case-sensitive `===`; first invalid id throws.
      (Req: Effective archive bindings and skip validation)
- [x] 5.2 Use the helper in `TransitionChange`
      `packages/core/src/application/use-cases/transition-change.ts`: `execute` inline skip loop (~lines 294-312) — replace with `validateSkipChecks`.
      Approach: call with `skipChecks: skipChecksList`, `effectiveBindings`, `checkRegistry: this._checkRegistry`; keep the returned list as `skipChecksList`; behaviour identical except the shared hook reason text.
      (Req: Effective archive bindings and skip validation)

## 6. Overlap error

- [x] 6.1 Add `skippable` to `SpecOverlapError`
      `packages/core/src/domain/errors/spec-overlap-error.ts`: constructor and getter — carry bypass availability.
      Approach: `constructor(entries, options: { readonly skippable?: boolean } = {})`, store `_skippable = options.skippable ?? true`, add `get skippable(): boolean`.
      (Req: Overlap guard; Error cases)
- [x] 6.2 Reword the overlap message
      `packages/core/src/domain/errors/spec-overlap-error.ts`: message and JSDoc — remove `--allow-overlap` wording.
      Approach: base `Cannot archive: specs [<ids>] are also targeted by other active changes.`; append ` Use --skip-checks spec.overlap to proceed.` only when `skippable`; update the class JSDoc to "and `spec.overlap` is not bypassed".
      (Req: Overlap guard)

## 7. ArchiveChange use case

- [x] 7.1 Replace the bypass fields of the input
      `packages/core/src/application/use-cases/archive-change.ts`: `ArchiveChangeInput` — drop `allowOverlap`/`allowOutOfScope`, add `skipChecks`.
      Approach: `readonly skipChecks?: readonly string[]` with JSDoc (canonical ids, validated before anything runs, default empty); update the interface JSDoc.
      (Req: Input)
- [x] 7.2 Accept the registry in the constructor
      `packages/core/src/application/use-cases/archive-change.ts`: `ArchiveChange` — optional trailing `checkRegistry?: CheckRegistry`.
      Approach: add `private readonly _checkRegistry?: CheckRegistry`, last constructor parameter after `resolveChangeSchema?`, store when defined, update the constructor JSDoc `@param`; add the `CheckRegistry` type import.
      (Req: Ports and constructor)
- [x] 7.3 Resolve effective bindings and validate skips in `execute`
      `packages/core/src/application/use-cases/archive-change.ts`: `execute` after the state guard and `workspaces` load — new steps C3-C5 of the design.
      Approach: `effectiveBindings = resolveEffectiveBindings({ baseBindings: this._archiveBindings, schema, operation: 'archive', ...(registry) })`; `skipChecks = validateSkipChecks({ skipChecks: input.skipChecks ?? [], effectiveBindings, ...(registry) })`; `overlapBypassed = skipChecks.includes('spec.overlap') && effectiveBindings.some(b => b.check.id === 'spec.overlap')`; delete the `effectiveSkipChecks` block.
      (Req: Effective archive bindings and skip validation; Input)
- [x] 7.4 Run the first predicate pass on effective bindings
      `packages/core/src/application/use-cases/archive-change.ts`: `execute` first `executeMatchingPredicates` (~line 324) — use resolved bindings and validated skips.
      Approach: pass `effectiveBindings`, `skipChecks` in the context and in the options; keep `failFastOn: 'schema.nameMatch'`.
      (Req: Archive checks share runners and wrap remaining preflight)
- [x] 7.5 Key overlap scan and invalidation on the bypass
      `packages/core/src/application/use-cases/archive-change.ts`: `needsOverlapScan` and invalidation condition (~lines 337-355).
      Approach: `needsOverlapScan = failed.some(c => c.id === 'spec.overlap') || (failed.length === 0 && overlapBypassed)`; invalidate peers only when `overlapBypassed && relevantOverlap.length > 0`.
      (Req: Overlap guard; Sovereign schema resolution)
- [x] 7.6 Pass bindings to the failure mapper
      `packages/core/src/application/use-cases/archive-change.ts`: `throwMappedArchiveFailure` signature and both call sites (first pass and re-run) — add `bindings: readonly CheckBinding[]`.
      Approach: new last parameter; callers pass `effectiveBindings`.
      (Req: Typed errors for archive failures)
- [x] 7.7 Give `spec.overlap` failures their skippability
      `packages/core/src/application/use-cases/archive-change.ts`: `throwMappedArchiveFailure` case `spec.overlap`.
      Approach: `throw new SpecOverlapError(overlapEntries, { skippable: bindings.find(b => b.check.id === 'spec.overlap')?.skippable === true })`.
      (Req: Overlap guard; Typed errors for archive failures)
- [x] 7.8 Map plugin and embedded failures to `CheckPredicateFailedError`
      `packages/core/src/application/use-cases/archive-change.ts`: `throwMappedArchiveFailure` default branch.
      Approach: `throw new CheckPredicateFailedError(check.id, check.label, check.code ?? 'CHECK_FAILED', check.message ?? \`Check '${check.id}' failed\`, check.command, check.details, bindings.find(b => b.check.id === check.id)?.skippable === true)`; import the error; leave every built-in `case` unchanged.
      (Req: Typed errors for archive failures)
- [x] 7.9 Run before-persist effects from effective bindings
      `packages/core/src/application/use-cases/archive-change.ts`: `matchingEffects(this._archiveBindings, ..., 'before-persist')` (~line 366).
      Approach: use `effectiveBindings`; remove `allowOverlap`/`allowOutOfScope` from the `buildCheckExecutionContext` call.
      (Req: Pre-archive hooks)
- [x] 7.10 Re-run predicates after hooks on effective bindings
      `packages/core/src/application/use-cases/archive-change.ts`: second `executeMatchingPredicates` (~line 416).
      Approach: `effectiveBindings`, `skipChecks` in context and options; failure path calls the mapper with `effectiveBindings`.
      (Req: Canonical validity archive preflight; Archive checks share runners and wrap remaining preflight)
- [x] 7.11 Run after-persist effects from effective bindings
      `packages/core/src/application/use-cases/archive-change.ts`: `matchingEffects(this._archiveBindings, ..., 'after-persist')` (~line 624).
      Approach: `effectiveBindings`; remove the two deprecated context fields.
      (Req: Post-archive hooks)
- [x] 7.12 Update the `execute` JSDoc and imports
      `packages/core/src/application/use-cases/archive-change.ts`: `execute` JSDoc and imports — document new throws and new dependencies.
      Approach: add `@throws {UnknownCheckError}`, `@throws {CheckNotSkippableError}`, `@throws {CheckPredicateFailedError}`; import `resolveEffectiveBindings`, `validateSkipChecks`, `CheckPredicateFailedError`.
      (Req: Typed errors for archive failures)
- [x] 7.13 Remove the deprecated context input fields
      `packages/core/src/application/services/execute-matching-predicates.ts`: `BuildCheckExecutionContextInput` — delete `allowOverlap` and `allowOutOfScope`.
      Approach: remove the two `@deprecated` fields (lines 54-56); fix any remaining usage in tests.
      (Req: Input)

## 8. Composition

- [x] 8.1 Add the registry to `ArchiveChangeDeps`
      `packages/core/src/composition/use-cases/archive-change.ts`: `ArchiveChangeDeps` — optional `checkRegistry`.
      Approach: `readonly checkRegistry?: CheckRegistry` with the type import; `isArchiveChangeDeps` unchanged.
      (Req: Config-based factory delegates through resolveArchiveChangeDeps)
- [x] 8.2 Resolve the registry in `resolveArchiveChangeDeps`
      `packages/core/src/composition/use-cases/archive-change.ts`: `resolveArchiveChangeDeps` — reuse the already computed `registry`.
      Approach: return `...(registry.checkRegistry !== undefined ? { checkRegistry: registry.checkRegistry } : {})`.
      (Req: Archive bindings not RunStepHooks on the use case; Config-based factory delegates through resolveArchiveChangeDeps)
- [x] 8.3 Pass the registry to the constructor
      `packages/core/src/composition/use-cases/archive-change.ts`: `createArchiveChangeFromNormalized` — destructure and forward.
      Approach: destructure `checkRegistry` and pass it as the new last argument of `new ArchiveChange(...)`.
      (Req: Ports and constructor)

## 9. GetStatus

- [x] 9.1 Resolve effective archive bindings for `archivable`
      `packages/core/src/application/use-cases/get-status.ts`: archive evaluation block (~line 646).
      Approach: when `change.state === 'archivable'` compute `effectiveArchiveBindings = resolveEffectiveBindings({ baseBindings: this._archiveBindings, schema, operation: 'archive', ...(this._checkRegistry !== undefined ? { registry: this._checkRegistry } : {}) })` and evaluate predicates over it with empty `skipChecks`.
      (Req: Execute matching predicates then project)
- [x] 9.2 Use effective bindings for blocker skippability
      `packages/core/src/application/use-cases/get-status.ts`: `_mergeBlockers` (~line 946) — add `archiveBindings` parameter.
      Approach: replace `this._archiveBindings` in the archive candidates (~line 960) with the parameter; pass `effectiveArchiveBindings` (or `this._archiveBindings` outside `archivable`).
      (Req: Execute matching predicates then project)
- [x] 9.3 Stop inventing an overlap bypass
      `packages/core/src/application/use-cases/get-status.ts`: `_nextActionAfterArchiveOverlap` (~line 1018).
      Approach: when `overlap.bypassFlag === undefined` return `reason: overlap.message` with no "Use ... to archive anyway." suffix; otherwise keep today's logic with `bypass = overlap.bypassFlag`.
      (Req: Execute matching predicates then project)

## 10. CLI

- [x] 10.1 Add the `--skip-checks` option and re-describe the aliases
      `packages/cli/src/commands/change/archive.ts`: `registerChangeArchive` options (~line 60).
      Approach: `.option('--skip-checks <ids>', 'comma-separated check identifiers to bypass (e.g. spec.overlap,impl.linksInScope)')`; `--allow-overlap`: `'alias of --skip-checks spec.overlap'`; `--allow-out-of-scope`: `'alias of --skip-checks impl.linksInScope'`.
      (Req: Command signature)
- [x] 10.2 Parse the skip list and translate aliases
      `packages/cli/src/commands/change/archive.ts`: action handler — build the `Set<string>` of ids.
      Approach: add `skipChecks?: string` to the opts type; same parsing as `transition.ts` lines 345-359 (`split(',')`, `trim`, `filter(Boolean)`); `--allow-out-of-scope` adds `impl.linksInScope`; `--allow-overlap` adds `spec.overlap`.
      (Req: Command signature)
- [x] 10.3 Call the use case with `skipChecks` only
      `packages/cli/src/commands/change/archive.ts`: `kernel.changes.archive.execute` call.
      Approach: pass `{ name, skipHookPhases, ...(set.size > 0 ? { skipChecks: [...set] } : {}) }`; remove `allowOverlap`/`allowOutOfScope` keys.
      (Req: Command signature)
- [x] 10.4 Show bypassed checks in progress output
      `packages/cli/src/commands/change/archive.ts`: `makeArchiveProgressRenderer` / `createCheckProgressPresenter` call.
      Approach: add an optional `skipChecks` argument and pass it as `options.skipChecks` to the presenter (supported in `_check-progress-presenter.ts:52,71`).
      (Req: Check progress rendering)
- [x] 10.5 Print the overlap hint only when skippable
      `packages/cli/src/commands/change/archive.ts`: `catch` branch for `SpecOverlapError`.
      Approach: keep the specs list; append `Use --skip-checks spec.overlap to proceed despite overlap.\n` only when `err.skippable`; exit code 1.
      (Req: Error cases)
- [x] 10.6 Render plugin check failures
      `packages/cli/src/commands/change/archive.ts`: new `catch` branch for `CheckPredicateFailedError`.
      Approach: text mode writes `error: <message>`, `  check:   <label> (<checkId>)`, `  command: <command>` when defined, and `  bypass:  Retry with --skip-checks <checkId> if an exception is granted` only when `err.skippable === true`, then exit 1; json/toon go through `handleError`; import the error from `@specd/sdk` (add the SDK re-export if missing).
      (Req: Error cases)
- [x] 10.7 Ensure status never builds a bypass locally
      `packages/cli/src/commands/change/status.ts` (and its presenters): bypass rendering.
      Approach: search for local bypass construction (`bypass`, `--skip-checks`); if any exists, render only `bypassFlag` from `GetStatus`; otherwise no code change.
      (Req: Archive bypass hints come from resolved bindings)

## 11. Core automated tests

- [x] 11.1 Parser tests for archive declarations
      `packages/core/test/infrastructure/schema-yaml-parser.spec.ts`: new cases.
      Approach: `archiveChecks` parsed; `onFailure` and unknown keys rejected (not stripped); wrong types rejected; empty array equals omitted; `checks`/`skipChecks`/`optional`/`disabled` still accepted.
      (Req: Workflow)
- [x] 11.2 Parser test for the standard schema
      `packages/core/test/infrastructure/schema-yaml-parser.spec.ts` (or schema-std load test): `@specd/schema-std` `archiving` entry has no `archiveChecks`.
      Approach: load the standard schema and assert absence.
      (Req: Workflow)
- [x] 11.3 Merge tests
      `packages/core/test/domain/services/merge-schema-layers.spec.ts`: new cases.
      Approach: append to an entry with none; collision across layers → `SchemaValidationError`; plugin layer adds `archiveChecks`; distinct ids from two layers coexist.
      (Req: Workflow)
- [x] 11.4 Build-schema shape and step tests
      `packages/core/test/domain/services/build-schema.spec.ts`: new cases.
      Approach: valid on `archiving`; rejected on another step (also empty array); not an array; entry without id; wrong field types; extra keys including `onFailure`; empty array equals omitted.
      (Req: Archive operation checks; Workflow step checks and skip-checks declarations)
- [x] 11.5 Build-schema registry and duplicate tests
      `packages/core/test/domain/services/build-schema.spec.ts`: new cases.
      Approach: unknown id → `UnknownCheckError`; duplicate id → `DuplicateCheckBindingError`; same id in `checks` and `archiveChecks` of `archiving` accepted; fallback registry includes archive bindings.
      (Req: Workflow step checks and skip-checks declarations)
- [x] 11.6 Build-schema governance tests for core checks
      `packages/core/test/domain/services/build-schema.spec.ts` and `check-registry.spec.ts`: new cases.
      Approach: disable each of the six Category A archive checks and the three locked checks → `CheckDisableForbiddenError`; `skippable` on `schema.nameMatch`/`impl.filesResolved` → `CheckBindingOverrideForbiddenError`; `config` on `deps.consistent` → `CheckConfigOverrideForbiddenError`; `approval.spec` → `CheckEmbeddingForbiddenError`; redundant `workspace.readOnly` `skippable: false` accepted; `spec.overlap`/`impl.linksInScope` tunable; transition-side disable of `workspace.readOnly` still accepted.
      (Req: Two-tier governance and confinement locks)
- [x] 11.7 Build-schema governance tests for plugin checks
      `packages/core/test/domain/services/build-schema.spec.ts` and `check-registry.spec.ts`: new cases.
      Approach: plugin archive binding policy lock, config lock, disable lock; plugin default archive binding tunable without embedding; plugin without archive binding and `allowSchemaEmbedding: false` → `CheckEmbeddingForbiddenError`; plugin `defaultConfig` merged under declaration config.
      (Req: Two-tier governance and confinement locks)
- [x] 11.8 Check-registry binding table tests
      `packages/core/test/domain/services/check-registry.spec.ts`: new cases.
      Approach: archive rows of the three locked checks have the three flags false; transition rows keep `true`; duplicate archive coordinate rejected; default constructor bindings include archive.
      (Req: Binding coordinate identity and duplicate prevention)
- [x] 11.9 Resolver tests for archive overlay
      `packages/core/test/domain/services/transition-checks.spec.ts`: new cases.
      Approach: disable removes only the archive binding; `skippable` overlays; embedded plugin check synthesized (default non-skippable, honours `skippable: true`); order after base and by declaration; base `onFailure` kept; config cascade once; redundant declaration keeps policy; absent/empty `archiveChecks` returns base bindings with cascaded config; disabled declaration with no base binding inert.
      (Req: Dynamic runtime binding composition and cascaded config resolution)
- [x] 11.10 Resolver tests for exclusivity and independence
      `packages/core/test/domain/services/transition-checks.spec.ts`: new cases.
      Approach: `operation: 'archive'` with `targetStep` or `bypassedSteps` → `InvalidInputError`; `checks` and `archiveChecks` for the same id on `archiving` are independent coordinates; archive resolution goes through the same resolver as transitions.
      (Req: Archive is an operation not an edge; Dynamic runtime binding composition and cascaded config resolution)
- [x] 11.11 Resolver regression run
      `packages/core/test/domain/services/transition-checks.spec.ts`: existing transition and step-skip cases.
      Approach: run unchanged; they must pass after the helper refactor (task 4.4/4.5).
      (Req: Dynamic runtime binding composition and cascaded config resolution)
- [x] 11.12 Skip validation helper tests
      `packages/core/test/application/services/validate-skip-checks.spec.ts` (new): full table.
      Approach: unknown id; hook id with `HOOK_CHECK_NOT_SKIPPABLE_REASON`; non-skippable; registered-unbound accepted; disabled-by-schema accepted; case sensitivity; duplicates collapse; empty; mixed valid/invalid rejects the whole request on the first invalid id.
      (Req: Effective archive bindings and skip validation)
- [x] 11.13 `SpecOverlapError` tests
      `packages/core/test/domain/errors/spec-overlap-error.spec.ts` (or the existing errors suite): `skippable` default true; message hint present/absent; entries preserved.
      Approach: construct with and without options and assert getter and message.
      (Req: Overlap guard)
- [x] 11.14 Update `ArchiveChange` fixtures
      `packages/core/test/application/use-cases/helpers.ts` and `archive-change.spec.ts`: constructor helpers and the 14 references to `allowOverlap`/`allowOutOfScope`.
      Approach: replace with `skipChecks: ['spec.overlap']` / `['impl.linksInScope']`, pass a `CheckRegistry` where scenarios need embedding, rename scenarios per verify (for example "No overlap with the bypass produces empty invalidatedChanges").
      (Req: Input; Overlap guard; Out-of-scope sidecar update guard)
- [x] 11.15 `ArchiveChange` input and constructor tests
      `packages/core/test/application/use-cases/archive-change.spec.ts`: new cases.
      Approach: input contract has no `allowOverlap`/`allowOutOfScope`; `skipChecks` default; constructor receives `CheckRegistry`; base bindings never executed directly and not mutated; composition returns `checkRegistry`.
      (Req: Ports and constructor; Archive bindings not RunStepHooks on the use case; Input)
- [x] 11.16 `ArchiveChange` skip validation tests
      `packages/core/test/application/use-cases/archive-change.spec.ts`: new cases.
      Approach: unknown id, hook id, locked id, case sensitivity, duplicates, empty array, registered-unbound id, disabled-by-schema id, mixed ids, passing check bypassed and audited; each failing case asserts no predicate, hook, or write ran; state guard and schema-mismatch precede validation; retry from `archiving`.
      (Req: Effective archive bindings and skip validation)
- [x] 11.17 `ArchiveChange` overlap tests
      `packages/core/test/application/use-cases/archive-change.spec.ts`: new cases.
      Approach: bypass archives and invalidates peers through the reconciler; bypass with no overlap; schema-disabled `spec.overlap` performs no scan and no invalidation; schema `skippable: false` → `CheckNotSkippableError`; bypassing overlap does not bypass `workspace.readOnly` or other failures; peers loaded only after predicates.
      (Req: Overlap guard; Sovereign schema resolution)
- [x] 11.18 `ArchiveChange` locked-check tests
      `packages/core/test/application/use-cases/archive-change.spec.ts`: new cases.
      Approach: `workspace.readOnly` and `impl.filesResolved` cannot be skipped; `impl.linksInScope` bypass does not bypass `impl.filesResolved`; schema disabling or hardening `impl.linksInScope`; schema cannot disable `workspace.readOnly`.
      (Req: ReadOnly workspace guard; Tracked implementation review guard; Out-of-scope sidecar update guard)
- [x] 11.19 `ArchiveChange` plugin and ordering tests
      `packages/core/test/application/use-cases/archive-change.spec.ts`: new cases.
      Approach: plugin archive check evaluated after built-ins; embedded checks in declaration order; schema without `archiveChecks` equals base order and policy; locked check redeclared unchanged accepted; disabled declaration without binding inert.
      (Req: Archive checks share runners and wrap remaining preflight)
- [x] 11.20 `ArchiveChange` typed error tests
      `packages/core/test/application/use-cases/archive-change.spec.ts`: new cases.
      Approach: plugin failure → `CheckPredicateFailedError` with id, label, code, message, command, details; `skippable` true/false from the binding; default code `CHECK_FAILED`; built-in failures keep their dedicated errors; unknown/locked skip ids → `UnknownCheckError`/`CheckNotSkippableError`.
      (Req: Typed errors for archive failures)
- [x] 11.21 `ArchiveChange` regression suites
      `packages/core/test/application/use-cases/archive-change-batch-restore.spec.ts` and the rest of `archive-change.spec.ts`: existing cases.
      Approach: run unchanged apart from the fixture updates; result shape unchanged.
      (Req: Result shape)
- [x] 11.22 `TransitionChange` skip validation regression
      `packages/core/test/application/use-cases/transition-change.spec.ts`: skip validation cases.
      Approach: assert unknown, hook, and non-skippable errors through the shared helper (error classes, hook reason text).
      (Req: Effective archive bindings and skip validation)
- [x] 11.23 `GetStatus` archive hint tests
      `packages/core/test/application/use-cases/get-status.spec.ts`: new cases.
      Approach: archivable change with overlap: disabled → no blocker; `skippable: false` → `OVERLAP_CONFLICT` without `bypassFlag` and reason without hint; locked `workspace.readOnly` → no flag; plugin archive check follows skippability; archive predicates evaluated with empty `skipChecks`; skippable overlap keeps the `--skip-checks spec.overlap` flag and "Use ... to archive anyway." reason.
      (Req: Execute matching predicates then project)
- [x] 11.24 Lifecycle verdict regression
      `packages/core/test/domain/services/lifecycle-verdict.spec.ts` (or equivalent): bypass scenario.
      Approach: update the scenario to bypass `spec.overlap` through `skipChecks`; assert `OVERLAP_CONFLICT` absent and the target permitted.
      (Req: Available steps and domain next hop)
- [x] 11.25 Kernel override-field conformance
      `packages/core/test/**` (search tests asserting the kernel "Allowed runtime override inputs" table): update.
      Approach: `ArchiveChange` allows `skipHookPhases`, `skipChecks`; `TransitionChange` allows `skipHookPhases`, `skipChecks`, `refreshImplementationTrackingBefore`; neither declares bypass booleans.
      (Req: Allowed runtime override inputs)
- [x] 11.26 Execution-context regression
      `packages/core/test/application/services/execute-matching-predicates.spec.ts`: existing cases.
      Approach: remove any use of the deleted `allowOverlap`/`allowOutOfScope` fields; assert bypass still yields `outcome: 'skip'` with `details.bypassedByUser`.
      (Req: Input)
- [x] 11.27 Change spec wording regression
      `packages/core/test/**` (search `spec-overlap-conflict` reason text assertions): update if any assert the `allowOverlap: true` wording.
      Approach: align messages with "archived with `spec.overlap` bypassed".
      (Req: History and event sourcing)

## 12. CLI automated tests

- [x] 12.1 Archive flag parsing tests
      `packages/cli/test/commands/change/archive.spec.ts`: new cases (13 existing references updated first).
      Approach: comma list; repeated flag; whitespace and empty entries; case sensitivity; duplicates with aliases collapse; singular alias command accepts the same flags; usage error without a value (exit 1, nothing archived); combination with `--skip-hooks all`.
      (Req: Command signature)
- [x] 12.2 Archive alias translation tests
      `packages/cli/test/commands/change/archive.spec.ts`: update existing alias cases.
      Approach: `--allow-overlap` → `skipChecks` contains `spec.overlap`; `--allow-out-of-scope` → `impl.linksInScope`; use case never receives `allowOverlap`/`allowOutOfScope`; CLI performs no skippability check.
      (Req: Command signature)
- [x] 12.3 Archive error case tests
      `packages/cli/test/commands/change/archive.spec.ts`: new cases.
      Approach: unknown id, non-skippable id, hook id (message mentions `--skip-hooks`), invalid state with flags, json structured error record, alias on a non-skippable check, case-sensitive id.
      (Req: Error cases)
- [x] 12.4 Archive overlap and plugin error output tests
      `packages/cli/test/commands/change/archive.spec.ts`: new cases.
      Approach: overlap error text with the `--skip-checks spec.overlap` hint when skippable and without any bypass suggestion when not; plugin failure text lines (check/command/bypass only when skippable); json record for the plugin failure.
      (Req: Error cases)
- [x] 12.5 Archive success output tests
      `packages/cli/test/commands/change/archive.spec.ts`: new cases.
      Approach: `--skip-checks spec.overlap` prints the invalidated peers section and json `invalidatedChanges`; help output lists `--skip-checks`, `--allow-overlap`, `--allow-out-of-scope` with alias descriptions.
      (Req: Output on success (extended); Command signature)
- [x] 12.6 Status hint tests
      `packages/cli/test/commands/change/status.spec.ts`: new cases.
      Approach: skippable overlap shows `--skip-checks spec.overlap`; several blockers each with their own flag; none for `workspace.readOnly` or hardened `spec.overlap`; plugin check follows skippability; json/toon `bypassFlag` equals text; disabled overlap shows no blocker; the CLI adds no flag when `GetStatus` supplies none.
      (Req: Archive bypass hints come from resolved bindings)
- [x] 12.7 Transition CLI regression
      `packages/cli/test/commands/change/transition.spec.ts`: 7 alias references.
      Approach: run unchanged; behaviour of `changes transition` aliases must not change.
      (Req: Command signature)

## 13. Skills templates

- [x] 13.1 Update the archive skill template
      `packages/skills/templates/skills/specd-archive/SKILL.md.tpl`: lines ~28-29, 167, 217-226 — teach the canonical bypass.
      Approach: replace `--allow-overlap`/`--allow-out-of-scope` instructions with `--skip-checks <checkId>` using the id shown by `specd changes status`; mention the `--allow-*` flags only as aliases; state that a blocker with no bypass flag in status cannot be skipped and name `workspace.readOnly`, `impl.filesResolved`, `deps.consistent` as never bypassable on archive.
      (Req: Overlap invalidation vs live archive overlap in templates)
- [x] 13.2 Update the design skill template
      `packages/skills/templates/skills/specd-design/SKILL.md.tpl`: lines ~45-46.
      Approach: keep the rule that invalidation overlap is `review.reason: spec-overlap-conflict` → `/specd-design` and is not bypassed with `--skip-checks spec.overlap` or `--allow-overlap`.
      (Req: Overlap invalidation vs live archive overlap in templates)
- [x] 13.3 Update the implement skill template
      `packages/skills/templates/skills/specd-implement/SKILL.md.tpl`: line ~25.
      Approach: same wording as 13.2.
      (Req: Overlap invalidation vs live archive overlap in templates)
- [x] 13.4 Update the new skill template
      `packages/skills/templates/skills/specd-new/SKILL.md.tpl`: line ~137.
      Approach: same wording as 13.2.
      (Req: Overlap invalidation vs live archive overlap in templates)
- [x] 13.5 Update the verify skill template
      `packages/skills/templates/skills/specd-verify/SKILL.md.tpl`: line ~26.
      Approach: same wording as 13.2.
      (Req: Overlap invalidation vs live archive overlap in templates)
- [x] 13.6 Update template workflow tests
      `packages/skills/test/template-workflow.spec.ts`: template assertions.
      Approach: archive template teaches `--skip-checks <checkId>` with aliases as aliases and names the never-bypassable checks; design/implement/verify/new templates do not teach the overlap bypass for `spec-overlap-conflict`.
      (Req: Overlap invalidation vs live archive overlap in templates)

## 14. Documentation, guides and release

- [x] 14.1 Document `archiveChecks` in the schema format guide
      `docs/schemas/schema-format.md`: workflow step fields table and a new "Archive operation checks" subsection.
      Approach: add the `archiveChecks` row, `archiving`-only rule, no `onFailure`, strict keys, and the YAML examples (tune core checks, embed a plugin check, rejected declarations).
      (Req: Workflow)
- [x] 14.2 Document archive checks for authors and hosts
      `docs/core/custom-checks.md`: sections 4.1, 5, and a new "Archive checks" subsection.
      Approach: add the archive exception for the three locked checks and the updated Category C text; show `registerCheck(..., [{ scope: 'archive', skippable: true }], ...)` and schema embedding/tuning through `archiveChecks`.
      (Req: Two-tier governance and confinement locks)
- [x] 14.3 Update the custom schemas guide
      `docs/guide/custom-schemas.md`: workflow section.
      Approach: describe archive as the third check surface next to `checks` and `skipChecks`, what a schema can and cannot do on archive (governance table).
      (Req: Archive operation checks)
- [x] 14.4 Update the workflow guide
      `docs/guide/workflow.md`: skippable/disabled steps and archive section.
      Approach: add archive checks, `--skip-checks` on archive, and the locked checks.
      (Req: Archive is an operation not an edge)
- [x] 14.5 Update the CLI reference
      `docs/cli/cli-reference.md`: `changes archive` options table and the paragraphs near lines 594-596.
      Approach: add `--skip-checks <ids>`, describe `--allow-overlap`/`--allow-out-of-scope` as aliases, update error messages, plugin failure output and exit codes.
      (Req: Command signature; Error cases)
- [x] 14.6 Add an archive example to the CLI guide
      `docs/guide/cli.md`: next to the transition example (~line 112).
      Approach: add `specd changes archive add-oauth --skip-checks spec.overlap` with a one-line explanation.
      (Req: Command signature)
- [x] 14.7 Add the ADR addendum
      `docs/adr/0030-open-check-registry-and-hook-failure-policies.md`: new addendum section.
      Approach: "Archive operation under the shared cascade": `archiveChecks`, aliases in the host, archive locks, removal of `ArchiveChangeInput.allowOverlap`/`allowOutOfScope`, plugin failures as `CheckPredicateFailedError`.
      (Req: Archive operation checks)
- [x] 14.8 Regenerate the bundled guides
      `packages/guide/src/infrastructure/generated/guides.ts`: tracked generated file.
      Approach: run `pnpm --filter @specd/guide run bundle:guides` after the docs edits and commit the regenerated file.
      (Req: Archive operation checks)
- [x] 14.9 Complete JSDoc for new and changed symbols
      `packages/core/src/**` touched files: JSDoc per `default:_global/docs`.
      Approach: ensure `ArchiveChangeInput`, `SpecOverlapError`, `ARCHIVE_BINDING_SPECS`, `WorkflowStep`, `WorkflowStepArchiveCheckDeclaration`, `resolveEffectiveBindings`, `validateSkipChecks`, the new `ArchiveChange` constructor parameter, and every new helper have complete JSDoc.
      (Req: Archive checks share runners and wrap remaining preflight)
- [x] 14.10 Add the changesets
      `.changeset/20261021-archive-schema-checks-and-skip-flag.md` and `.changeset/20261021-archive-schema-checks-and-skip-flag-specd.md`: release notes.
      Approach: first file front matter `"@specd/core": minor`, `"@specd/cli": minor`, `"@specd/skills": patch`; second file `'@specd/specd': patch`; body `20261021 - archive-schema-checks-and-skip-flag: <summary>` stating the breaking removal of `ArchiveChangeInput.allowOverlap`/`allowOutOfScope` and the migration (`skipChecks: ['spec.overlap']`), then `Specs affected:` listing the 12 specs (and `Modified packages:` in the metapackage file).
      (Req: Input)

## 14b. Review follow-up: impacted tests found by the blast-radius analysis

- [x] 14b.1 Update the binding table assertions
      `packages/core/test/domain/services/check-bindings.spec.ts`: skippable-set test (~line 23) and the per-spec governance loop (~line 46).
      Approach: keep `spec.overlap` and `impl.linksInScope` as the only skippable archive specs; assert the three locked archive rows have `allowBindingOverride`, `allowConfigOverride`, `allowDisable` all `false` while their transition rows stay `true`; adjust the loop's "category values" expectation to apply the archive exception.
      (Req: Two-tier governance and confinement locks)
- [x] 14b.2 Update the composition archive factory test
      `packages/core/test/composition/use-cases/archive-change.spec.ts`: dependency resolution cases.
      Approach: assert `resolveArchiveChangeDeps` returns `checkRegistry` from `resolveWorkflowCheckRegistry` and that `createArchiveChange` forwards it as the last constructor argument; deps-based construction without it still works.
      (Req: Config-based factory delegates through resolveArchiveChangeDeps)
- [x] 14b.3 Update the workflow check registry composition test
      `packages/core/test/composition/use-cases/workflow-check-registry.spec.ts`: archive bindings cases.
      Approach: assert plugin bindings with `scope: 'archive'` are appended after the built-in archive bindings and that the executable `checkRegistry` is returned with archive bindings known.
      (Req: Archive checks share runners and wrap remaining preflight)
- [x] 14b.4 Update the composition registry view test
      `packages/core/test/composition/composition-registries.spec.ts`: registry view cases.
      Approach: assert the registry exposes archive default bindings with the new locks and accepts a plugin archive binding.
      (Req: Two-tier governance and confinement locks)
- [x] 14b.5 Update the standard schema load test
      `packages/core/test/domain/services/schema-std-load.spec.ts`: `@specd/schema-std` load case.
      Approach: assert the loaded `archiving` workflow entry has no `archiveChecks` and that the schema still builds with the stricter archive locks.
      (Req: Workflow)
- [x] 14b.6 Update the lifecycle engine and verdict tests
      `packages/core/test/domain/services/lifecycle-engine.spec.ts` and `lifecycle-verdict.spec.ts`: bypass/blocker cases.
      Approach: express the overlap bypass through `skipChecks` (no `--allow-overlap` wording) and assert `bypassFlag` is `--skip-checks <checkId>` only for skippable resolved bindings.
      (Req: Available steps and domain next hop)
- [x] 14b.7 Satisfy the CLI documentation coverage test
      `packages/cli/test/documentation-coverage.spec.ts` and the `docs/cli/*.md` file it resolves for `changes archive`.
      Approach: run the spec after the CLI change; every new option (`--skip-checks`) must appear in the resolved documentation file in the form the test expects; update that file together with `docs/cli/cli-reference.md`.
      (Req: Command signature)
- [x] 14b.8 Check the SDK re-exports
      `packages/sdk/src/core-reexports.ts` and `packages/sdk/src/composition/host-context.ts`: exports used by the CLI.
      Approach: confirm `CheckPredicateFailedError` and `SpecOverlapError` are re-exported (add `CheckPredicateFailedError` if missing); `ArchiveChangeInput` re-export keeps working with the new shape.
      (Req: Typed errors for archive failures)

## 15. Final verification

- [x] 15.1 Typecheck all packages
      Repository root: `pnpm typecheck`.
      Approach: fix any caller of the removed `allowOverlap`/`allowOutOfScope` fields or of the changed `throwMappedArchiveFailure` and constructor signatures.
      (Req: Input)
- [x] 15.2 Lint all packages
      Repository root: `pnpm lint`.
      Approach: resolve JSDoc and architecture-rule findings (domain must not import infrastructure).
      (Req: Archive checks share runners and wrap remaining preflight)
- [x] 15.3 Run the full test suites
      Repository root: `pnpm test` (core, cli, skills, guide).
      Approach: all new and updated tests green, including the transition regression suites.
      (Req: Result shape)
- [x] 15.4 Manual E2E: archive with live overlap
      Built CLI `node packages/cli/dist/index.js` in a scratch project with an overlapping peer.
      Approach: `changes status` shows `OVERLAP_CONFLICT` with `--skip-checks spec.overlap`; `changes archive` exits 1 with the hint; `--skip-checks spec.overlap` and `--allow-overlap` exit 0 with the invalidated peers section.
      (Req: Overlap guard; Output on success (extended))
- [x] 15.5 Manual E2E: rejected bypasses
      Same scratch project.
      Approach: `--skip-checks workspace.readOnly` → exit 1 `CheckNotSkippableError`; `--skip-checks nope.check` → exit 1 `UnknownCheckError`; `--skip-checks hook.pre` → exit 1 mentioning `--skip-hooks`.
      (Req: Error cases)
- [x] 15.6 Manual E2E: schema variants
      Scratch project `specd.yaml` `schemaOverrides`.
      Approach: `spec.overlap` `skippable: false` → status without flag, archive error without hint, `--allow-overlap` fails; `disabled: true` → no blocker; `workspace.readOnly` `disabled: true` → schema load fails with `CheckDisableForbiddenError`; `onFailure: collect` → `SchemaValidationError`; `archiveChecks` on `implementing` → `SchemaValidationError`.
      (Req: Archive operation checks; Two-tier governance and confinement locks)
- [x] 15.7 Validate the change before leaving implementation
      Repository root: `node packages/cli/dist/index.js changes status archive-schema-checks-and-skip-flag --format text`.
      Approach: confirm tasks, artifacts, and implementation review are clean (resolve or ignore tracked files explicitly) before verification.
      (Req: Tracked implementation review guard)

## 16. Review follow-up: verification round 1 (decisions taken with the user)

- [x] 16.1 Make the `SpecOverlapError` message neutral
      `packages/core/src/domain/errors/spec-overlap-error.ts`: `SpecOverlapError` constructor — remove the CLI flag text from the core message.
      Approach: message `Cannot archive: specs [<specId> (<peer>, ...), ...] are also targeted by other active changes.` with no `--skip-checks`/`--allow-overlap`; keep `skippable` getter and `options.skippable`; update the class JSDoc.
      (Req: Overlap guard)
- [x] 16.2 Update the `SpecOverlapError` unit tests
      `packages/core/test/domain/errors/spec-overlap-error.spec.ts`: message cases.
      Approach: assert the message names the spec and peers and contains no `--skip-checks` for both `skippable` values; drop the assertion that the default message suggests the bypass.
      (Req: Overlap guard)
- [x] 16.3 Update the `ArchiveChange` overlap error tests
      `packages/core/test/application/use-cases/archive-change.spec.ts`: overlap error cases in the last describe.
      Approach: the error names `core:config`-style spec ids and the peer, exposes `skippable` true by default and false when the schema hardens it, and its message has no CLI flag text.
      (Req: Overlap guard)
- [x] 16.4 Keep the CLI hint in the host
      `packages/cli/src/commands/change/archive.ts`: `SpecOverlapError` catch branch.
      Approach: confirm it composes `Use --skip-checks spec.overlap to proceed despite overlap.` only when `err.skippable` (no change expected); adjust `packages/cli/test/commands/change/archive.spec.ts` if a test relies on the core message text.
      (Req: Error cases)
- [x] 16.5 Show the `bypass:` line in the status docs
      `docs/cli/cli-reference.md`: `changes status` text example.
      Approach: add `    bypass: --skip-checks spec.overlap` under a skippable blocker in the example, matching `status.ts` output; regenerate guides with `pnpm --filter @specd/guide run bundle:guides`.
      (Req: Archive bypass hints come from resolved bindings)
- [x] 16.6 Rewrite the ADR and docs mention of the error text if present
      `docs/adr/0030-open-check-registry-and-hook-failure-policies.md`, `docs/cli/cli-reference.md`: grep for `Use --skip-checks spec.overlap to proceed.` attributed to the core error.
      Approach: state that the core error is neutral and the CLI composes the hint; no change if absent.
      (Req: Overlap guard)
- [x] 16.7 Re-run the quality gates
      Repository root: `pnpm typecheck`, `pnpm lint`, `pnpm test`.
      Approach: all green; rebuild `@specd/core`, `@specd/sdk`, `@specd/cli` first so the CLI tests see the new error.
      (Req: Result shape)
- [x] 16.8 Resolve implementation tracking and re-verify
      `specd changes implementation list` / `resolve`, then `/specd-verify`.
      Approach: resolve or ignore any newly open file and start a fresh verification attempt against the final baseline.
      (Req: Tracked implementation review guard)

## 17. Review follow-up: compliance audit round 2

- [x] 17.1 Derive blocker skippability and bypass flag from resolved bindings in `lifecycle-verdict.ts`
      `packages/core/src/domain/services/lifecycle-verdict.ts` and `packages/core/test/domain/services/lifecycle-verdict.spec.ts`: `LifecycleVerdictInput`, `blockersFromFailedChecks`, `isBypassFlagActive`.
      Approach: accept optional `resolvedBindings` in `LifecycleVerdictInput` and fallback to resolving effective transition and archive bindings against `schema`; derive `isSkippable` and `bypassFlag` (`--skip-checks <checkId>`) from the resolved binding instead of hardcoding `spec.overlap` and `impl.linksInScope`; remove CLI-only `allow-overlap` / `--allow-overlap` and `allow-out-of-scope` / `--allow-out-of-scope` aliases from `isBypassFlagActive`; add test for non-skippable `spec.overlap` yielding `isSkippable: false` and no `bypassFlag`, assert `isPermitted === true` and absence of warnings on bypass, and rename stale test titles.
      (Req: Machine-readable blockers; Available steps and domain next hop)
- [x] 17.2 Strengthen `archive-change.spec.ts` coverage
      `packages/core/test/application/use-cases/archive-change.spec.ts`: disabled `impl.linksInScope`, dual failure (`spec.overlap` + `impl.linksInScope` with only overlap skipped), and two-schema single-instance archive test.
      Approach: remove `.catch(() => undefined)` on the disabled `impl.linksInScope` test and assert the archive succeeds; add a test where both `spec.overlap` and `impl.linksInScope` fail and only `spec.overlap` is bypassed (still throws out-of-scope); add a test archiving two changes with different sovereign schemas on the same `ArchiveChange` instance and verifying base bindings are not mutated.
      (Req: Effective archive bindings and skip validation; Out-of-scope sidecar update guard; Overlap guard)
- [x] 17.3 Harden non-array `archiveChecks` and add schema/registry/resolver tests
      `packages/core/src/domain/services/merge-schema-layers.ts`, `packages/core/src/domain/services/build-schema.ts`, `packages/core/test/domain/services/build-schema-archive-checks.spec.ts`, `packages/core/test/domain/services/merge-schema-layers.spec.ts`, `packages/core/test/domain/services/transition-checks.spec.ts`, `packages/core/test/infrastructure/schema-yaml-parser.spec.ts`.
      Approach: ensure non-array `archiveChecks` from plugin or `schemaOverrides` throws `SchemaValidationError` (not `TypeError`) in both `mergeSchemaLayers` and `buildSchema`; add tests for same id (`impl.linksInScope`) in `checks` and `archiveChecks` across both coordinates, resolving archive bindings without a registry, `schemaOverrides` attempting to relax a locked archive check after merge+build, plugin `defaultConfig` merging to `{ minSeverity: 'critical' }` through `buildSchema` + `resolveEffectiveBindings`, and parser omitting `archiveChecks` when only `checks` is present.
      (Req: Workflow; Two-tier governance and confinement locks; Dynamic runtime binding composition and cascaded config resolution)
- [x] 17.4 Expand `get-status` and CLI status/archive tests
      `packages/core/test/application/use-cases/get-status.spec.ts`, `packages/cli/test/commands/change/status.spec.ts`, `packages/cli/test/commands/change/archive.spec.ts`.
      Approach: assert `nextAction.reason` does not name `--skip-checks spec.overlap` when the binding is non-skippable; verify `status --format json` includes `bypassFlag` on stdout JSON; add hook-progress (`Running pre hooks`, `hook.pre`) test and exact `endsWith` assertion for the overlap hint in `archive.spec.ts`.
      (Req: Identifies blockers; Archive bypass hints come from resolved bindings; Check progress rendering; Error cases)
- [x] 17.5 Neutralize CLI flag mentions in core JSDoc comments
      `packages/core/src/application/services/validate-skip-checks.ts` and `packages/core/src/domain/errors/spec-overlap-error.ts`: JSDoc comments.
      Approach: remove mentions of CLI flags (`--skip-checks`, `--skip-hooks`) from JSDoc comments in core.
      (Req: Overlap guard; Effective archive bindings and skip validation)
- [x] 17.6 Verify untracked `archive-change-input.spec.ts` in git status and typecheck
      `packages/core/test/application/use-cases/archive-change-input.spec.ts`.
      Approach: confirm `git status` lists the file and `pnpm typecheck` covers it without committing.
      (Req: Allowed runtime override inputs)
- [x] 17.7 Regenerate bundled guides and check changesets if docs or public contracts changed
      `packages/guide/src/infrastructure/generated/guides.ts`, `.changeset/*.md`.
      Approach: run `pnpm --filter @specd/guide run bundle:guides` if docs changed; verify changeset accuracy.
      (Req: Input)
- [x] 17.8 Run local quality gates (`typecheck`, `lint`, `test`, `prettier`)
      Repository root: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm exec prettier --check`.
      Approach: build affected packages and run all four checks to green.
      (Req: Result shape)
- [x] 17.9 Run post-implementing hooks and drain implementation tracking
      `specd changes run-hooks` / `hook-instruction` and `specd changes implementation list` / `add` / `resolve` / `ignore`.
      Approach: ensure zero open files remain in implementation tracking and all tasks are `[x]`.
      (Req: Tracked implementation review guard)
