# Compliance Audit: align-spec-optimization-cli-and-agents

## Audit Scope

Mode: specific change.

Changed specs:

- `cli:spec-optimizations`
- `skills:agents`
- `skills:skill-templates-source`
- `skills:workflow-automation`
- `core:update-persisted-spec-optimizations`

Direct dependencies reviewed at depth 1:

- `cli:entrypoint`
- `cli:command-resource-naming`
- `cli:spec-context`
- `cli:spec-metadata`
- `core:get-persisted-spec-optimizations`
- `core:spec-optimization`
- `core:spec-repository-port`
- `core:spec-id-format`
- `core:initialize-persisted-spec-state`
- `skills:skill`

Relevant project-wide constraints:

- `default:_global/architecture`
- `default:_global/conventions`
- `default:_global/docs`
- `default:_global/error-handling-conventions`
- `default:_global/eslint`
- `default:_global/spec-layout`
- `default:_global/testing`

The graph was current (`stale: false`, ref `1ac9a555`). All five changed specs were audited from merged `changes spec-preview` output, including merged verification artifacts.

## Requirements Summary

### `cli:spec-optimizations`

Six requirement groups were assessed:

- command signatures and common formatting;
- persisted optimization reads and freshness display;
- JSON/stdin and direct-option set forms;
- repeated-field and direct-flag clear forms;
- delegation without CLI-owned persistence/freshness logic;
- typed error mapping.

The handler validates mutually exclusive forms before resolving the CLI context, delegates to the correct Kernel use case exactly once, and covers text/JSON/TOON output. Set text output prints returned optimization values. Clear machine-readable output includes the returned result unchanged, but clear text output does not print the returned optimization projection.

Status: **Partially compliant**. See C-01.

### `core:update-persisted-spec-optimizations`

Eleven requirement groups were assessed:

- strict runtime input contract;
- mutual exclusivity/minimum operation;
- per-field fresh baseline capture;
- initial-state creation;
- selected-field removal;
- missing-state clear no-op;
- shared patch-helper application;
- conflict propagation;
- typed unknown-spec failure;
- result projection;
- config-based composition resolver delegation.

The application use case validates with a strict Zod schema before ports are accessed, preserves untouched fields and baselines, captures current schema/artifact baselines for changed fields, creates initial state through `resolveInitialPersistedDependsOn`, writes using the observed revision, and explicitly removes the last optimization block through the shared pure patch helper. Composition remains centralized through `resolveUpdatePersistedSpecOptimizationsDeps`.

Status: **Compliant**.

### `skills:agents`

Seven requirement groups were assessed:

- optimizer availability;
- smart-caveman prompt policy;
- density target;
- template purity;
- no-agent fallback;
- effective `llmOptimizedContext` gate;
- scope-correct persistence.

Both templates read top-level `llmOptimizedContext` from project status before optimization. The spec optimizer uses semantic spec context and the lock-owned direct set options. The project optimizer retains `project update-metadata`, which is now explicitly distinguished in the merged spec. The prior plural persistence ambiguity is resolved.

Status: **Compliant**, with a residual behavioral-test limitation noted in MT-02.

### `skills:skill-templates-source`

Fifteen requirement groups were assessed, with emphasis on the changed optimizer gating, read-surface roles, self-healing metadata guidance, and exact template contract tests.

Shared guidance differentiates raw artifacts (`specs show`), semantic context (`specs context`), and materialized projection diagnostics (`specs metadata`). Optimizer templates gate from project status, and archive guidance uses metadata only for projection diagnostics. Project and spec persistence commands are separately pinned by contract tests.

Status: **Compliant**.

### `skills:workflow-automation`

Nine requirement groups were assessed. The changed read-surface policy is consistent with `cli:spec-context`, `cli:spec-metadata`, and global diagnostic/data-extraction rules. Metadata is not presented as effective project configuration.

Status: **Compliant**.

## Implementation Status

| Spec                                       | Requirement groups | Implemented | Partial | Missing |
| ------------------------------------------ | -----------------: | ----------: | ------: | ------: |
| `cli:spec-optimizations`                   |                  6 |           5 |       1 |       0 |
| `core:update-persisted-spec-optimizations` |                 11 |          11 |       0 |       0 |
| `skills:agents`                            |                  7 |           7 |       0 |       0 |
| `skills:skill-templates-source`            |                 15 |          15 |       0 |       0 |
| `skills:workflow-automation`               |                  9 |           9 |       0 |       0 |
| **Total**                                  |             **48** |      **47** |   **1** |   **0** |

## Discrepancies

### C-01: Clear text output omits the resulting persisted optimization values

Severity: **Medium**

Spec evidence:

- The merged `cli:spec-optimizations` clear requirement says a successful clear "MUST ... print the resulting persisted optimization values, which may be empty."
- Its verification scenarios require the direct clear result to be observable through a subsequent get, require a partial clear to preserve and expose the unchanged field, and require the final clear's printed result to show no remaining optimization values.

Implementation evidence:

- `packages/cli/src/commands/spec/optimizations.ts:300` receives the Core result.
- In text mode, `packages/cli/src/commands/spec/optimizations.ts:305` prints only `cleared optimizations for <specId>`.
- Unlike the set handler at lines 268-274, the clear handler never iterates `result.optimizations` and never emits an explicit empty-state representation.
- JSON/TOON output remains compliant because the handler spreads the complete result into the formatted object.

Test evidence:

- `packages/cli/test/commands/spec-optimizations.spec.ts:396` mocks a clear result with no optimizations but asserts only the confirmation line at line 414.
- The single-direct-clear test supplies a remaining `optimizedDescription` but does not assert that text output prints it.
- No focused CLI integration test performs the merged scenario's subsequent `get` after partial or final clear.

Assessment:

- **Implementation-bug interpretation:** The text adapter fails its explicit output contract. Users cannot distinguish a partial clear from a final clear using the command result alone, despite Core returning the projection.
- **Spec-drift interpretation:** If the intended text contract is merely acknowledgement, the requirement and scenarios overstate the output guarantee and should be narrowed. This interpretation is weakened by the set handler already printing returned values and by the explicit phrase "print the resulting persisted optimization values."
- **Combined interpretation:** Machine-readable behavior is correct, but the text contract and tests were not completed alongside the direct clear forms.

Recommended resolution:

- Make clear text output render all remaining optimization values using the same projection convention as set.
- Emit an explicit empty representation when `result.optimizations` is absent, so the final-clear scenario is objectively verifiable.
- Add focused assertions for partial and final clear text output, plus an integration-level clear-then-get round trip.

## Test Coverage

Focused change suites:

```text
pnpm exec vitest run \
  packages/cli/test/commands/spec-optimizations.spec.ts \
  packages/core/test/application/use-cases/update-persisted-spec-optimizations.spec.ts \
  packages/core/test/composition/use-cases/update-persisted-spec-optimizations.spec.ts \
  packages/core/test/domain/services/apply-persisted-spec-state-patch.spec.ts \
  packages/skills/test/template-workflow.spec.ts
```

Result: **5 files passed, 60 tests passed**.

Skills and installation coverage:

```text
pnpm exec vitest run \
  packages/skills/test \
  packages/plugin-agent-claude/test/install-skills.spec.ts \
  packages/plugin-agent-codex/test/install-skills.spec.ts \
  packages/plugin-agent-copilot/test/install-skills.spec.ts \
  packages/plugin-agent-opencode/test/install-skills.spec.ts \
  packages/plugin-agent-standard/test/install-skills.spec.ts
```

Result: **13 files passed, 61 tests passed**.

Coverage strengths:

- CLI validation tests confirm no Kernel/context resolution for missing, mixed, malformed, unknown-key, and non-string input forms.
- Core tests cover strict untyped inputs, no-I/O validation failures, per-field baseline preservation, initial-state creation, optimistic concurrency, and repository round trips for partial/final clear.
- Composition tests verify the exact resolver dependencies and canonical factory delegation.
- Template tests pin project-status gating, separate project/spec persistence commands, no mixed spec set forms, no post-write metadata generation, and the three read-surface roles.
- Plugin installation tests verify agent/skill rendering and routing across supported runtimes.

## Missing Tests

### MT-01: CLI clear text projection and round trip

Severity: **Medium** (directly associated with C-01)

Missing coverage:

- partial clear text output includes the unchanged remaining field;
- final clear text output explicitly reports no remaining values;
- direct and compatibility clear forms are followed by a real `get` against persisted state.

### MT-02: Generated optimizer behavior and density

Severity: **Low**

The template tests verify instructions, availability, routing, and exact commands, but do not execute an optimizer agent against representative input. Consequently, the verification scenarios for smart-caveman output, preservation of technical tokens, and measured 50-70% token reduction remain prompt-contract checks rather than behavioral checks.

This is a residual test limitation rather than current implementation noncompliance because the implementation artifact is the agent prompt itself and it contains the required policies.

## Spec Dependency Chain

- `cli:spec-optimizations` delegates reads to `core:get-persisted-spec-optimizations` and mutations to `core:update-persisted-spec-optimizations`, respecting the global adapter-to-core dependency direction.
- `core:update-persisted-spec-optimizations` uses `core:spec-repository-port`, the canonical ID parser, `core:spec-optimization` baseline types, and the shared initialization dependency resolver. No filesystem I/O was introduced in the domain patch service.
- `skills:agents` depends on `cli:spec-optimizations` only for spec-scoped persistence; project-scoped persistence is now separately specified and tested.
- `skills:skill-templates-source` and `skills:workflow-automation` agree with `cli:spec-context` and `cli:spec-metadata` on command roles.
- The implementation remains consistent with ESM, strict TypeScript, typed/actionable errors, hexagonal boundaries, and global testing conventions.

## Summary

| Severity | Discrepancies | Missing-test items |
| -------- | ------------: | -----------------: |
| Critical |             0 |                  0 |
| High     |             0 |                  0 |
| Medium   |             1 |                  1 |
| Low      |             0 |                  1 |

Overall verdict: **Mostly compliant, with one medium CLI text-output discrepancy and associated coverage gap.** The previous optimizer persistence-scope inconsistency has been corrected. All executed tests passed.
