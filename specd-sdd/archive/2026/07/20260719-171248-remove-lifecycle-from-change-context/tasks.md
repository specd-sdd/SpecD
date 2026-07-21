# Tasks: remove-lifecycle-from-change-context

## 1. Core context contract

- [x] 1.1 Remove lifecycle projections from the CompileContext result
      `packages/core/src/application/use-cases/compile-context.ts`:
      `AvailableStep`, `CompileContextResult`, and `CompileContext.execute()` — remove
      lifecycle fields and result assembly while retaining context entries and warnings.
      Approach: delete `AvailableStep`, `stepAvailable`, `blockingArtifacts`, and
      `availableSteps`; return only fingerprint, status, projectContext, specs, and warnings.
      (Req: Ports and constructor, Structured result assembly, Result shape)

- [x] 1.2 Remove lifecycle evaluation from context compilation
      `packages/core/src/application/use-cases/compile-context.ts`:
      `CompileContext` constructor and `execute()` — remove `LifecycleEngine` wiring,
      evaluation, and lifecycle logging without changing context collection.
      Approach: retain `input.step` only for existing effective section selection;
      do not evaluate workflow readiness or derive blockers.
      (Req: Input, Ports and constructor)

- [x] 1.3 Make the fingerprint context-only
      `packages/core/src/application/use-cases/_shared/compile-context-fingerprint.ts`:
      `FingerprintInput` and `compileContextFingerprint()` — remove lifecycle fields
      from the input type and canonical JSON payload.
      Approach: keep only inputs that change emitted context; preserve resolved
      sections so a step changes the hash only when it changes rendered content.
      (Req: Context fingerprint)

- [x] 1.4 Remove the composition dependency on LifecycleEngine
      `packages/core/src/composition/use-cases/compile-context.ts`:
      `CompileContextDeps`, `resolveCompileContextDeps()`, factory overload wiring,
      and `isCompileContextDeps()` — remove the lifecycle dependency.
      Approach: pass the remaining explicit dependencies to the reduced constructor;
      do not alter global lifecycle resolver ownership.
      (Req: Ports and constructor)

## 2. CLI projection

- [x] 2.1 Remove lifecycle fields from command help and structured output contract
      `packages/cli/src/commands/change/context.ts`:
      `registerChangeContext()` help text — document only the context-only result.
      Approach: remove `stepAvailable`, `blockingArtifacts`, and `availableSteps` from
      the JSON/TOON schema while retaining fingerprint, status, context entries, specs, and warnings.
      (Req: Output)

- [x] 2.2 Remove lifecycle-specific text and stderr rendering
      `packages/cli/src/commands/change/context.ts`:
      command action — remove unavailable-step warnings and `## Available steps` output.
      Approach: keep refresh-before-compile, context warning emission, fingerprint-first
      text rendering, and all spec-mode rendering unchanged.
      (Req: Output, Context warnings)

## 3. Automated tests

- [x] 3.1 Update CompileContext result and fingerprint tests
      `packages/core/test/application/use-cases/compile-context.spec.ts` and the
      fingerprint helper test file: remove lifecycle fixtures and assert context-only results.
      Approach: create equivalent contexts with different lifecycle state/blockers and
      assert identical fingerprints; retain tests that emitted specs, warnings, depth,
      traversal, or resolved sections change the fingerprint.
      (Req: Result shape, Context fingerprint)

- [x] 3.2 Update CompileContext composition tests
      `packages/core/test/composition/use-cases/compile-context.spec.ts` and related
      factory tests: remove the LifecycleEngine dependency expectation.
      Approach: construct the factory from the reduced dependency set and verify all
      context dependencies remain wired.
      (Req: Ports and constructor)

- [x] 3.3 Update CLI context command tests
      `packages/cli/test/commands/change-context.spec.ts`:
      mock result fixtures and text/JSON/TOON assertions.
      Approach: assert changed and unchanged outputs omit lifecycle fields, text emits
      no availability section or lifecycle warning, and context warnings still reach stderr.
      (Req: Output, Context warnings)

## 4. Documentation and verification

- [x] 4.1 Update context-compilation guidance
      `docs/guide/_sections/getting-started/context-compilation.md`: document that
      change context is context-only and that lifecycle information comes from change status.
      Approach: update command-output examples and migration wording without changing
      unrelated context options.
      (Req: Output)

- [x] 4.2 Update the Core use-case reference
      `docs/core/use-cases.md`: revise the CompileContext result description.
      Approach: remove lifecycle availability fields and state the reduced public contract.
      (Req: Result shape)

- [x] 4.3 Run focused and end-to-end verification
      `packages/core`, `packages/cli`, and the built CLI: run focused Vitest suites,
      lint/type checks, and command-level fingerprint verification.
      Approach: capture a context fingerprint, change only lifecycle state, then use
      `changes context --fingerprint` to confirm unchanged; query `changes status`
      separately to confirm lifecycle state and blockers remain available.
      (Req: Context fingerprint, Output)
