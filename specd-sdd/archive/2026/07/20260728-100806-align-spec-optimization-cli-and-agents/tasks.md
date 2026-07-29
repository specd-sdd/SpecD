# Tasks: align-spec-optimization-cli-and-agents

## 1. CLI option normalization

- [x] 1.1 Add the private optimization option types
      `packages/cli/src/commands/spec/optimizations.ts`: `OptimizationField`, `SetOptimizationOptions`, and `ClearOptimizationOptions` — model the two supported fields and Commander option shapes.
      Approach: use strict private TypeScript types with readonly option properties, explicit optional fields, and complete JSDoc where required.
      (Req: Command signature)

- [x] 1.2 Implement set-form normalization
      `packages/cli/src/commands/spec/optimizations.ts`: `resolveOptimizationSet()` — normalize either JSON input or direct values into one typed Core `set` payload.
      Approach: reject missing input and `--input` mixed with either direct option through `cliError`; otherwise reuse `readInput()` and `parseOptimizationSetInput()` or map direct values without resolving CLI context.
      (Req: Set subcommand; No repeated CLI-owned mutation or freshness logic)

- [x] 1.3 Implement clear-form normalization
      `packages/cli/src/commands/spec/optimizations.ts`: `resolveOptimizationClear()` — normalize repeated fields or direct flags into unique `OptimizationField` values.
      Approach: reject missing selection, unsupported names, and `--field` mixed with either direct flag through `cliError`; preserve canonical field names and perform no I/O.
      (Req: Clear subcommand; No repeated CLI-owned mutation or freshness logic)

- [x] 1.4 Wire direct options into the set command
      `packages/cli/src/commands/spec/optimizations.ts`: `registerSpecOptimizations()` set registration/action — make `--input` optional and add `--optimized-description <text>` plus `--optimized-context <text>`.
      Approach: call `resolveOptimizationSet()` before `resolveCliContext`, then invoke `Kernel.specs.updatePersistedOptimizations.execute` exactly once and preserve existing text/JSON/TOON output.
      (Req: Command signature; Set subcommand; Error mapping)

- [x] 1.5 Wire direct flags into the clear command
      `packages/cli/src/commands/spec/optimizations.ts`: `registerSpecOptimizations()` clear registration/action — make repeated `--field` optional and add boolean `--optimized-description` plus `--optimized-context`.
      Approach: call `resolveOptimizationClear()` before `resolveCliContext`, then invoke `Kernel.specs.updatePersistedOptimizations.execute` exactly once and preserve existing output.
      (Req: Command signature; Clear subcommand; Error mapping)

## 2. Agent and workflow templates

- [x] 2.1 Correct the spec optimizer configuration gate
      `packages/skills/templates/agents/specd-spec-context-optimizer/SPECD-AGENT.md.tpl`: Process steps — replace the metadata-based gate with `specd project status --format toon` and its top-level `llmOptimizedContext`.
      Approach: require exact `true`, return `SKIPPED` otherwise, retain `specs context --no-optimized`, and state that `specs metadata` is not an effective-configuration source.
      (Req: Effective llmOptimizedContext gate; Optimizer agents; Agent prompt policy; Output density; Fallback behavior)

- [x] 2.2 Make spec optimizer persistence exclusivity explicit
      `packages/skills/templates/agents/specd-spec-context-optimizer/SPECD-AGENT.md.tpl`: Persist step — retain the direct set command and prohibit combining direct options with `--input`.
      Approach: permit one or both direct options in one command and retain the prohibition on metadata editing and post-write metadata generation.
      (Req: Persisted optimization writes replace metadata editors; Optimizer agent gating declared in templates)

- [x] 2.3 Correct the project optimizer configuration gate
      `packages/skills/templates/agents/specd-project-context-optimizer/SPECD-AGENT.md.tpl`: Process steps — make the project status command and top-level field explicit.
      Approach: run `specd project status --format toon`, proceed only for exact `llmOptimizedContext: true`, and leave project context loading, freshness, and persistence unchanged.
      (Req: Effective llmOptimizedContext gate; Agent template purity)

- [x] 2.4 Define the three spec read surfaces in shared guidance
      `packages/skills/templates/shared/shared.md.tpl`: Reading specs section — assign exact raw reads to `show`, semantic working context to `context`, and projection/materialization diagnostics to `metadata`.
      Approach: include filtering, dependency traversal, optimized preference, `source`, `regenerated`, and warnings; explicitly prohibit metadata as default context or effective project configuration.
      (Req: Spec read surface selection; Agent-facing command roles in templates)

- [x] 2.5 Correct archive optimization gating without removing diagnostics
      `packages/skills/templates/skills/specd-archive/SKILL.md.tpl`: Metadata materialization and LLM optimization steps — retain per-spec metadata diagnostics and replace `approvals.llmOptimized`.
      Approach: inspect `source`, `regenerated`, and warnings with `specs metadata`, then separately read/reuse top-level `llmOptimizedContext` from `project status --format toon`.
      (Req: Agent-facing command roles in templates; Context optimization policy)

## 3. CLI automated tests

- [x] 3.1 Add direct set delegation tests
      `packages/cli/test/commands/spec-optimizations.spec.ts`: set command tests — verify one direct value and both direct values produce exact payloads.
      Approach: use the mocked Kernel, assert exactly one mutation call, and assert atomic two-field mapping.
      (Req: Set subcommand)

- [x] 3.2 Add set exclusivity and empty-input tests
      `packages/cli/test/commands/spec-optimizations.spec.ts`: set validation tests — cover missing form, mixed `--input`/direct forms, and `{}`.
      Approach: assert exit code 1/error output and that neither `resolveCliContext` nor the Kernel mutation executes.
      (Req: Command signature; Set subcommand; Error mapping)

- [x] 3.3 Preserve JSON input validation coverage
      `packages/cli/test/commands/spec-optimizations.spec.ts`: compatibility set tests — cover file/stdin, malformed JSON, non-object JSON, unknown keys, and non-string values.
      Approach: keep valid legacy calls unchanged and assert invalid shapes stop before context resolution or Core.
      (Req: Set subcommand; Error mapping)

- [x] 3.4 Add direct clear delegation tests
      `packages/cli/test/commands/spec-optimizations.spec.ts`: clear command tests — cover one/both direct flags, repeated legacy fields, duplicate normalization, and removal of the last value.
      Approach: assert exact unique `clear` arrays, exactly one Kernel mutation, and unchanged output formatting.
      (Req: Clear subcommand)

- [x] 3.5 Add clear exclusivity and invalid-selection tests
      `packages/cli/test/commands/spec-optimizations.spec.ts`: clear validation tests — cover no selection, mixed forms, and unsupported legacy field names.
      Approach: assert exit code 1/error output and no context resolution or Kernel mutation.
      (Req: Command signature; Clear subcommand; Error mapping)

- [x] 3.6 Run unchanged get and output/error regressions
      `packages/cli/test/commands/spec-optimizations.spec.ts` and the CLI command suite — preserve get filtering, freshness, initialization, missing-field, structured-format, conflict, unknown-spec, and read-only behavior.
      Approach: run the focused and complete CLI tests with the mocked Kernel; add targeted assertions only if existing coverage is absent.
      (Req: Get subcommand; No repeated CLI-owned mutation or freshness logic; Error mapping)

## 4. Template contract and integration tests

- [x] 4.1 Strengthen optimizer template contract assertions
      `packages/skills/test/template-workflow.spec.ts`: optimizer template test — replace generic keyword checks with exact status command, top-level field, direct persistence, exclusivity, and no-regeneration assertions.
      Approach: inspect both canonical agent templates and assert the spec optimizer does not use `specs metadata` as its gate.
      (Req: Optimizer agent gating declared in templates; Persisted optimization writes replace metadata editors)

- [x] 4.2 Add exact shared and archive command-role assertions
      `packages/skills/test/template-workflow.spec.ts`: workflow template tests — verify the `show`/`context`/`metadata` mapping and archive’s separate diagnostic/configuration commands.
      Approach: assert exact command strings and field paths, including absence of `approvals.llmOptimized`, rather than keyword-only matches.
      (Req: Agent-facing command roles in templates; Spec read surface selection)

- [x] 4.3 Run the complete skills template regression suite
      `packages/skills/test/`: all template and rendering tests — confirm unchanged template layout, migration, metadata, capability rendering, frontmatter, graph terminology, snippet, implementation tracking, and self-healing contracts.
      Approach: run the full `@specd/skills` Vitest suite without snapshots and resolve only failures caused by canonical template changes.
      (Req: Template source location; Template migration; Template metadata contract (skills and agents); Capability-aware install-time rendering; Graph impact terminology in workflow templates; Graph search snippet guidance in workflow templates; Frontmatter source; Frontmatter injection; Agent frontmatter matrix; Why no frontmatter in skills package; Implementation tracking instructions in templates; Metadata self-healing guidance in workflow templates)

- [x] 4.4 Run all five agent-plugin regression suites
      `packages/plugin-agent-{claude,codex,copilot,opencode,standard}/test/`: install/uninstall tests — verify canonical template content still renders and installs through every supported runtime.
      Approach: run each package suite without changing plugin APIs, metadata, capability matrices, install paths, or uninstall behavior.
      (Req: Optimizer agents; Agent template purity; Fallback behavior)

- [x] 4.5 Run workflow automation regressions
      `packages/skills/test/`: workflow tests — confirm the new read policy does not regress existing lifecycle guidance.
      Approach: preserve diagnostic priority, structured extraction, outline retrieval, repair routing, canonical commands, command freshness, content review, traceability, and optimizer delegation/fallback scenarios.
      (Req: Diagnostic Priority; Data Extraction; On-demand outline retrieval; Repair Strategy; Canonical Command References; Command Necessity and Freshness; Structural Validation and Content Review; Implementation traceability policy; Context optimization policy)

## 5. Documentation and static validation

- [x] 5.1 Complete the spec optimizations CLI reference
      `docs/cli/spec-optimizations.md`: usage, workflow, and error sections — document legacy/direct set and clear forms plus their exclusions.
      Approach: include atomic two-field examples, empty/mixed-form failures, preserved output formats, and exit code 1 without documenting any new Core behavior.
      (Req: Command signature; Set subcommand; Clear subcommand; Error mapping)

- [x] 5.2 Run affected package typechecks and lint
      `packages/cli` and `packages/skills`: changed TypeScript and templates — verify strict types, ESM conventions, explicit return types, JSDoc, and formatting.
      Approach: run both package typechecks and applicable repository/package lint commands; do not suppress errors.
      (Req: No repeated CLI-owned mutation or freshness logic)

## 6. Manual and end-to-end verification

- [x] 6.1 Verify direct set and get end to end
      built CLI and a writable test spec — set both direct values and inspect them with `specs optimizations get --format toon`.
      Approach: confirm both values share one successful mutation/baseline update and output remains parseable.
      (Req: Set subcommand; Get subcommand)

- [x] 6.2 Verify compatibility input and direct clear end to end
      built CLI and a writable test spec — pipe a valid JSON object through `--input -`, then clear both values with direct flags.
      Approach: confirm legacy input still works and clearing the final fields leaves no persisted optimization values.
      (Req: Set subcommand; Clear subcommand)

- [x] 6.3 Verify invalid combinations leave state unchanged
      built CLI and a writable test spec — run missing set/clear forms and both mixed-form examples.
      Approach: capture pre/post persisted state, require exit code 1 plus `error:`, and confirm no mutation.
      (Req: Command signature; Set subcommand; Clear subcommand; Error mapping)

- [x] 6.4 Verify rendered agent guidance
      canonical rendered templates or a temporary plugin installation — inspect optimizer, shared, and archive output.
      Approach: confirm top-level project-status gating, exact three-surface read roles, retained archive metadata diagnostics, and no direct option combined with `--input`.
      (Req: Effective llmOptimizedContext gate; Persisted optimization writes replace metadata editors; Agent-facing command roles in templates; Spec read surface selection)

## 7. Follow-up: durable Core clear regression

- [x] 7.1 Add an explicit optimization deletion sentinel to persisted-state patches
      `packages/core/src/domain/services/apply-persisted-spec-state-patch.ts`: `PersistedSpecStatePatch.optimizations` and `applyPersistedSpecStatePatch()` — distinguish preservation from block deletion.
      Approach: widen the internal patch field to `PersistedSpecOptimizations | null`; omitted preserves existing state, a non-empty object normalizes/replaces it, and `null` returns state without `optimizations`. Never serialize `null`.
      (Req: Applying the mutation through the shared patch helper)

- [x] 7.2 Add isolated patch-helper deletion regression tests
      `packages/core/test/domain/services/apply-persisted-spec-state-patch.spec.ts`: optimization patch scenarios — protect all three patch states.
      Approach: assert omission preserves an existing block, an object replaces and normalizes it, and `null` removes it without producing `{ optimizations: {} }`; retain dependency, implementation, initial-state, and schema guard coverage.
      (Req: Applying the mutation through the shared patch helper)

- [x] 7.3 Make the optimization use case request explicit final-field deletion
      `packages/core/src/application/use-cases/update-persisted-spec-optimizations.ts`: `UpdatePersistedSpecOptimizations.execute()` — persist an empty computed optimization result as deletion.
      Approach: pass `{ optimizations: null }` when both computed fields are absent and pass the remaining non-empty object for set or partial clear; keep optimistic revision, result projection, and public input/output unchanged.
      (Req: Clear removes selected fields; Result contract; Conflict handling)

- [x] 7.4 Add stateful use-case round-trip tests for every clear edge
      `packages/core/test/application/use-cases/update-persisted-spec-optimizations.spec.ts`: clear scenarios — assert durable partial, absent-field, and final-field behavior.
      Approach: set both fields, clear one, and read repository state back; assert the remaining value and full baseline are unchanged. Then clear the final field and re-read state to assert the `optimizations` key is absent. Assert persisted state independently of the returned projection.
      (Req: Clear removes selected fields; Clear against missing persisted state is a no-op; Result contract)

- [x] 7.5 Run focused and complete Core regressions
      `packages/core`: domain service and application use-case suites — ensure the CRITICAL shared helper change does not alter existing callers.
      Approach: run focused patch-helper and update-optimization tests, then the complete Core test suite, typecheck, and lint; do not suppress failures.
      (Req: Applying the mutation through the shared patch helper; Set captures a fresh baseline per changed field; Set creates missing persisted state)

- [x] 7.6 Verify both CLI clear surfaces through a persisted read-back
      built CLI and a writable temporary spec — exercise direct partial clear and compatibility final clear.
      Approach: set both fields, clear `optimizedContext` with `--optimized-context`, run `get` and require only unchanged `optimizedDescription`; clear the final field with `--field optimizedDescription`, run `get` again, and require no persisted optimization values. The immediate clear result alone is not an acceptance signal.
      (Req: Clear subcommand; Clear removes selected fields; scenario: repository round trip preserves partial and final clear removals)

- [x] 7.7 Document durable clear semantics
      `docs/cli/spec-optimizations.md`: clear examples and result behavior — make post-clear persistence observable.
      Approach: state that partial clear preserves unselected fields and clearing the final field removes the optimization block; include a follow-up `get` example without exposing the internal `null` sentinel.
      (Req: Clear subcommand; Result contract)

## 8. Follow-up: authoritative Core Zod validation

- [x] 8.1 Define the strict runtime mutation schemas
      `packages/core/src/application/use-cases/update-persisted-spec-optimizations.ts`: `optimizationFieldNameSchema`, `optimizationSetSchema`, and `updatePersistedSpecOptimizationsInputSchema` — encode the complete Core input contract.
      Approach: use the existing Zod dependency; require non-empty `specId`, a strict non-empty record of the two string fields for `set`, or a non-empty array of those field names for `clear`; make the root strict and use `superRefine` to require exactly one operation.
      (Req: Input contract; Mutual exclusivity and minimum operation)

- [x] 8.2 Parse and map Zod failures before any Core collaborator
      `packages/core/src/application/use-cases/update-persisted-spec-optimizations.ts`: `parseUpdatePersistedSpecOptimizationsInput()` and `UpdatePersistedSpecOptimizations.execute()` — make runtime validation authoritative for every caller.
      Approach: call `safeParse`, format every issue as `<dot.path>: <message>` with `input` for an empty path, join with `; `, and throw `InvalidInputError`; assign the successful result to `validatedInput` as the first execute operation and use only it afterward.
      (Req: Input contract; Mutual exclusivity and minimum operation)

- [x] 8.3 Add table-driven malformed set and root payload tests
      `packages/core/test/application/use-cases/update-persisted-spec-optimizations.spec.ts`: runtime input validation tests — simulate untyped SDK and JavaScript callers.
      Approach: pass non-object input, unknown root/set keys, missing or empty `specId`, and non-string set values through a narrow test helper; require `InvalidInputError` with actionable text and collaborators configured to fail if any workspace, schema, artifact, or persisted-state work starts.
      (Req: Input contract; scenario: strict input validation rejects malformed untyped set payloads before I/O)

- [x] 8.4 Add table-driven malformed clear and operation-cardinality tests
      `packages/core/test/application/use-cases/update-persisted-spec-optimizations.spec.ts`: runtime input validation tests — cover clear structure and exactly-one-operation enforcement.
      Approach: test invalid clear names, non-array clear, non-string entries, missing operation, simultaneous operations, empty set, and empty clear; require `InvalidInputError` and zero collaborator calls for every case.
      (Req: Input contract; Mutual exclusivity and minimum operation; scenario: strict input validation rejects malformed untyped clear payloads before I/O)

## 9. Compliance follow-up: composition and CLI diagnostics

- [x] 9.1 Pin the persisted-optimization composition resolver contract
      `packages/core/test/composition/use-cases/update-persisted-spec-optimizations.spec.ts`: `resolveUpdatePersistedSpecOptimizationsDeps()` coverage — verify the config factory's exact lower-level dependency shape.
      Approach: create one controlled `CompositionResolver`, assert the returned `specRepositories`, `getActiveSchema`, `parsers`, `extractorTransforms`, and `contentHasher` identities, retain the generic factory smoke test, and prove no separate `initializePersistedSpecState` dependency is required.
      (Req: Config-based factory delegates through resolveUpdatePersistedSpecOptimizationsDeps; scenario: config factory derives exact dependencies through the resolver; scenario: initial state creation remains behind the shared service)

- [x] 9.2 Add initialized stale text-output coverage
      `packages/cli/test/commands/spec-optimizations.spec.ts`: `get` text formatting tests — verify a persisted stale optimization exposes the canonical stale marker and reasons.
      Approach: mock `getPersistedOptimizations.execute` with `initialized: true` and a stale field containing explicit reasons, run the text command, and assert the user-visible field status and reasons rather than only delegation.
      (Req: Get subcommand)

- [x] 9.3 Add uninitialized text-output coverage
      `packages/cli/test/commands/spec-optimizations.spec.ts`: `get` text formatting tests — verify an uninitialized spec prints the canonical diagnostic.
      Approach: mock `initialized: false`, run `specs optimizations get` in text mode, and assert the exact diagnostic branch without relying on JSON or TOON output.
      (Req: Get subcommand)

- [x] 9.4 Isolate selected missing-field text output
      `packages/cli/test/commands/spec-optimizations.spec.ts`: filtered `get` text formatting test — verify a selected missing field is reported without unrelated fields.
      Approach: request `--field optimizedContext`, return `freshness: 'missing'`, assert `optimizedContext: missing`, and assert `optimizedDescription` is absent from stdout.
      (Req: Get subcommand)

- [x] 9.5 Run focused Core and CLI regressions
      `packages/core/test/composition/use-cases/update-persisted-spec-optimizations.spec.ts` and `packages/cli/test/commands/spec-optimizations.spec.ts`: changed test suites — confirm the corrected verification contracts pass without production composition changes.
      Approach: run the focused Core composition and CLI command suites, then Core/CLI typecheck and lint; do not suppress failures or modify the factory dependency interface to satisfy tests.
      (Req: Config-based factory delegates through resolveUpdatePersistedSpecOptimizationsDeps; Get subcommand)

## 10. Compliance follow-up: optimizer persistence scopes

- [x] 10.1 Pin the project optimizer's project-scoped persistence contract
      `packages/skills/test/template-workflow.spec.ts`: optimizer template contract tests — prevent the project optimizer from being migrated to the spec-scoped persistence command.
      Approach: assert that `specd-project-context-optimizer/SPECD-AGENT.md.tpl` contains `specd project update-metadata --optimized-context`, does not contain `specd specs optimizations set`, retains the exact top-level `llmOptimizedContext` gate, and does not request spec metadata generation; run the focused template workflow suite and the complete `@specd/skills` test suite.
      (Req: Persisted optimization writes replace metadata editors; Optimizer agent gating declared in templates; scenario: project optimizer retains project-scoped persistence)

## 11. Verification follow-up: clear text projection

- [x] 11.1 Render and test the resulting optimization projection after clear
      `packages/cli/src/commands/spec/optimizations.ts` and `packages/cli/test/commands/spec-optimizations.spec.ts`: clear text output — expose remaining values or an explicit empty state.
      Approach: mirror the set projection for partial clears, print `optimizations: none` after the final clear, and cover partial clear, final clear, and clear-then-get behavior with focused tests.
      (Req: Clear subcommand; scenario: Compatibility clear persists a partial removal; scenario: Clear result may be empty when the last field is removed)
