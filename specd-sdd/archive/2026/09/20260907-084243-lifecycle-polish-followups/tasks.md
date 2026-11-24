# Tasks: lifecycle-polish-followups

## 1. Core transition and lifecycle contracts

- [x] 1.1 Preserve parked approval repair precedence
      `packages/core/src/application/use-cases/transition-change.ts`: `TransitionChange._assertDrainAndGateTargets` — reject historic parked non-drain requests with the matching typed approval gate.
      Approach: perform the drain/gate guard before predicate evaluation and retain the documented drain targets.
      (Req: Historic parked approval repair precedence)
- [x] 1.2 Preserve predicate blocker artifact identity
      `packages/core/src/domain/services/lifecycle-verdict.ts`: `evaluateLifecycleVerdict` — project failed `workflow.requires` artifact IDs into `transitionBlockers.blocking`.
      Approach: derive IDs from the existing check details without adding I/O.
      (Req: Predicate blocker artifact identity)
- [x] 1.3 Add Core regression coverage
      `packages/core/test/application/use-cases/transition-change.spec.ts`, `packages/core/test/domain/services/lifecycle-verdict.spec.ts` — assert typed parked failures and blocker IDs.
      Approach: use in-memory change/check fixtures and assert exact reason fields.

## 2. Composition and CLI compatibility

- [x] 2.1 Share fallback archive snapshot state
      `packages/core/src/composition/use-cases/archive-change.ts`: `resolveArchiveBatchSnapshotPort` — reuse one lazy fallback snapshot instance.
      Approach: memoize its promise inside the composed port closure.
      (Req: Shared fallback batch snapshot lifetime)
- [x] 2.2 Add archive rollback regression
      `packages/core/test/composition/archive-batch-snapshot-port.spec.ts` — prove fallback restore removes a recorded created file.
      Approach: snapshot, record, restore through one port instance.
- [x] 2.3 Stabilize CLI status display
      `packages/cli/src/commands/change/status.ts`: `registerChangeStatus` — use display, effective, then canonical state fallback.
      Approach: apply the same nullish fallback for artifacts and files in text and structured renderers.
      (Req: Stable display status and drafted JSON compatibility)
- [x] 2.4 Add CLI compatibility regressions
      `packages/cli/test/commands/change/status.spec.ts` — assert no `undefined` and retain drafted JSON behavior.
      Approach: omit display state in mocked status results.

## 3. Fast-track template and verification

- [x] 3.1 Add Step 2 stop and dependents terminology
      `packages/skills/templates/skills/specd-fasttrack/SKILL.md.tpl` — require user mode selection before formal artifacts and use dependents wording.
      Approach: make Step 2 a terminal interactive gate and use `--direction dependents`.
      (Req: Fast-track Step 2 confirmation and dependents terminology)
- [x] 3.2 Add template regression coverage
      `packages/skills/test/template-workflow.spec.ts` — assert stop text and absence of downstream wording.
      Approach: inspect rendered template contract strings.
- [x] 3.3 Run focused verification
      Core, CLI, skills, archive snapshot suites and TypeScript typecheck — record green evidence.
      Approach: run targeted Vitest suites and workspace typecheck after edits.

## 4. Remaining specification hygiene

- [x] 4.1 Resolve lifecycle specification wording contradictions
      `core:hook-execution-model`, `core:schema-format`, `core:change`, `core:get-status`, `cli:change-archive`, `core:config-writer-port`, and `cli:change-artifact-instruction` — reconcile the seven governing contracts and add matching scenarios.
      Approach: make documentation-only deltas; retain `core:change` as an intentionally coordinated overlap with `implementation-snapshot`.
- [x] 4.2 Review merged-delta serialization before archive
      `specd-sdd/changes/20260907-084243-lifecycle-polish-followups/deltas/**` — confirm Markdown escaping normalization has no semantic or unrelated archival effect.
      Approach: inspect merged previews and treat renderer-only escaping normalization as non-semantic; no delta replacement is required.

## 5. Verification follow-ups added after compliance review

- [x] 5.1 Cover both top-level archive command spellings
      `packages/cli/test/commands/change/archive.spec.ts`: CLI registration integration — parse `changes archive <name>` and `change archive <name>` through the real root command.
      Approach: execute both spellings against the same Commander registration and assert they invoke the shared archive handler with identical inputs.
      (Req: Canonical archive command and compatibility alias)
- [x] 5.2 Cover production GetStatus overlap composition end-to-end
      `packages/core/test/composition/use-cases/get-status.spec.ts`: production dependency resolver — surface an active-change overlap through the resolved status projection.
      Approach: wire the production overlap detector with repository fixtures, then assert the public status check/blocker projection without a registry stub.
      (Req: Production overlap detection wiring)

## 5. Compliance follow-up corrections

- [x] 5.1 Emit an actionable degraded-schema blocker
      `packages/core/src/application/use-cases/get-status.ts`: `GetStatus.execute` — add a stable schema-resolution lifecycle blocker in the existing `SchemaNotFoundError` recovery branch.
      Approach: preserve the read-only degraded fields and empty available transitions; project the blocker only for the handled schema-not-found error, without broadening the catch or permitting mutation.
      (Req: Degraded schema-resolution status)
- [x] 5.2 Cover degraded-schema blocker projection
      `packages/core/test/application/use-cases/get-status.spec.ts` — assert the schema-not-found fixture returns the stable blocker and no available transitions.
      Approach: extend the existing degradation case with exact code/message assertions while retaining assertions that other schema errors propagate.
      (Req: Degraded schema-resolution status)
- [x] 5.3 Cover plugin metadata extraction rejection
      `packages/core/test/infrastructure/schema-yaml-parser.spec.ts` — add a schema-plugin fixture that declares `metadataExtraction`.
      Approach: assert the parser rejects the declaration and preserves transforms/resolved-layer plugin extension behavior.
      (Req: Metadata extraction and plugin boundaries)
- [x] 5.4 Correct schema-plugin user guidance
      `docs/guide/configuration.md`, `docs/config/config-reference.md` — state that a schema plugin cannot declare top-level `metadataExtraction` and identify supported configuration paths.
      Approach: replace the inaccurate capability claim with the parser-aligned restriction; preserve documentation for valid plugin merge layers and `schemaOverrides`.
      (Req: Metadata extraction and plugin boundaries)
