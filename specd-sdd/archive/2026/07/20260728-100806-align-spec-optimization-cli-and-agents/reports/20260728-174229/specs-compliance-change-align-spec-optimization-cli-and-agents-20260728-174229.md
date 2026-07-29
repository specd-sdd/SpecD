# Compliance Audit: align-spec-optimization-cli-and-agents

## Scope

Change specs:

- `cli:spec-optimizations`
- `skills:agents`
- `skills:skill-templates-source`
- `skills:workflow-automation`
- `core:update-persisted-spec-optimizations`

Direct dependencies reviewed:

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

Relevant global constraints reviewed:

- `default:_global/architecture`
- `default:_global/conventions`
- `default:_global/docs`
- `default:_global/error-handling-conventions`
- `default:_global/eslint`
- `default:_global/spec-layout`
- `default:_global/testing`

The code graph was current (`stale: false`, current ref `1ac9a555`). Merged change previews, rather than raw deltas, were used as the normative change-spec surface.

## Requirements Summary

### cli:spec-optimizations

The implementation provides the `specs optimizations get|set|clear` surface, supports file/stdin and direct set inputs, supports repeated-field and direct clear selections, rejects mixed or missing forms before resolving the Kernel, delegates exactly once to the corresponding Kernel use case, supports text/JSON/TOON formatting, and retains typed error handling. The focused CLI suite exercises direct and JSON forms, malformed inputs, missing forms, mixed forms, formatting, delegation, and typed errors.

Status: **Implemented and covered**.

### core:update-persisted-spec-optimizations

The application use case now validates untyped input strictly with Zod before workspace, schema, artifact, or persisted-state I/O. It preserves unchanged field baselines, captures fresh baselines for changed fields, creates initial state through `resolveInitialPersistedDependsOn`, uses optimistic expected revisions, propagates conflicts, and uses an explicit `null` patch value to remove the final optimization block. The composition factory continues to resolve established dependencies and delegates to the canonical factory.

Status: **Implemented and covered**.

### skills:agents

Both optimizer templates gate work on top-level `llmOptimizedContext` from `specd project status --format toon`. The spec optimizer reads semantic context without optimized fields and persists through direct `specs optimizations set` options without metadata regeneration. The project optimizer keeps its project-scoped metadata read/write surface.

Status: **Implemented with one specification ambiguity/contradiction**. See finding C-01.

### skills:skill-templates-source

Template guidance distinguishes `specs show`, `specs context`, and `specs metadata`; rejects metadata as an effective-configuration source; uses project status for the optimization gate; and keeps archive metadata diagnostics separate from optimizer gating. Contract tests assert the exact commands and fields.

Status: **Implemented and covered**, subject to C-01's missing distinction test.

### skills:workflow-automation

Shared guidance accurately assigns raw authoring reads to `specs show`, semantic dependency-aware context to `specs context`, and projection diagnostics to `specs metadata`. Effective configuration is sourced from project configuration/status rather than metadata. This is consistent with the relevant CLI dependency specs and global workflow constraints.

Status: **Implemented and covered**.

## Implementation Status

| Spec                                       | Requirements assessed | Implemented | Partial / ambiguous | Missing |
| ------------------------------------------ | --------------------: | ----------: | ------------------: | ------: |
| `cli:spec-optimizations`                   |                     6 |           6 |                   0 |       0 |
| `core:update-persisted-spec-optimizations` |                    12 |          12 |                   0 |       0 |
| `skills:agents`                            |                     7 |           6 |                   1 |       0 |
| `skills:skill-templates-source`            |                    15 |          15 |                   0 |       0 |
| `skills:workflow-automation`               |                     9 |           9 |                   0 |       0 |
| **Total**                                  |                **49** |      **48** |               **1** |   **0** |

## Discrepancies

### C-01: The plural optimizer persistence requirement conflicts with the project optimizer contract

Severity: **Medium**

Spec evidence:

- The merged `skills:agents` requirement "Persisted optimization writes replace metadata editors" says, without limiting the subject to the spec optimizer, that "Optimizer agents MUST persist generated optimized content through `specd specs optimizations set <spec-id> ...`".
- The same changed spec defines two optimizer agents, including `specd-project-context-optimizer`, which produces project-level `optimizedContext` and has no target `<spec-id>`.
- The merged `skills:skill-templates-source` wording is more precise: only "Spec optimizer templates" must use the direct lock-owned CLI options.

Implementation evidence:

- `packages/skills/templates/agents/specd-project-context-optimizer/SPECD-AGENT.md.tpl:22` persists project-level output through `specd project update-metadata --optimized-context ...`.
- `packages/skills/templates/agents/specd-spec-context-optimizer/SPECD-AGENT.md.tpl:27` persists spec-level fields through `specd specs optimizations set ...`.

Assessment:

- **Spec-drift interpretation:** The implementation is likely correct because project optimization and per-spec lock-owned optimization are separate scopes, and `skills:skill-templates-source` explicitly limits the new persistence contract to the spec optimizer. Under this interpretation, `skills:agents` should say "The spec optimizer agent" rather than "Optimizer agents".
- **Implementation-bug interpretation:** If the plural language is intentional, the project optimizer violates the changed requirement. However, applying a spec-scoped command to project context is underspecified because no spec identity exists, so the requirement cannot be implemented coherently as written.
- **Combined interpretation:** The intended split is present in code but insufficiently explicit in one spec. This risks a future cleanup replacing the valid project command with an invalid spec-scoped flow.

Recommended resolution:

- Clarify `skills:agents` so the lock-owned `specs optimizations set` requirement applies only to `specd-spec-context-optimizer`.
- Add an explicit companion statement that `specd-project-context-optimizer` retains its project-scoped persistence command.
- Add a template contract assertion for the project optimizer's persistence command so the scope split cannot regress.

## Test Coverage

Focused verification command:

```text
pnpm exec vitest run \
  packages/cli/test/commands/spec-optimizations.spec.ts \
  packages/core/test/application/use-cases/update-persisted-spec-optimizations.spec.ts \
  packages/core/test/composition/use-cases/update-persisted-spec-optimizations.spec.ts \
  packages/core/test/domain/services/apply-persisted-spec-state-patch.spec.ts \
  packages/skills/test/template-workflow.spec.ts
```

Result:

- 5 test files passed.
- 59 tests passed.
- CLI behavior, core validation/mutation, composition, final-field removal, and changed workflow-template contracts are covered.

Coverage quality:

- `cli:spec-optimizations`: strong focused behavioral coverage, including no-Kernel-call boundary failures.
- `core:update-persisted-spec-optimizations`: strong unit coverage plus repository round-trip coverage for partial/final clears and composition dependency coverage.
- Template policies: exact gate/read/persistence strings are asserted for the spec optimizer and archive/shared roles.
- Residual gap: no assertion fixes the project optimizer's project-scoped persistence command, allowing the C-01 ambiguity to regress unnoticed.

## Missing Tests

### MT-01: Project optimizer persistence scope

Severity: **Low**

Add a contract test that `specd-project-context-optimizer/SPECD-AGENT.md.tpl`:

- contains `specd project update-metadata --optimized-context`;
- does not contain `specd specs optimizations set`;
- still refuses all optimization work unless top-level `llmOptimizedContext` is exactly `true`.

## Spec Dependency Chain

- `cli:spec-optimizations` delegates reads to `core:get-persisted-spec-optimizations` and writes to `core:update-persisted-spec-optimizations`, preserving the CLI/core adapter boundary required by global architecture.
- `core:update-persisted-spec-optimizations` uses the repository port, canonical spec identity parsing, shared optimization baseline model, and shared initial-state dependency resolver. No direct filesystem I/O was introduced in domain/application mutation logic.
- `skills:agents` consumes the CLI optimization contract through templates and relies on `skills:workflow-automation` for context-selection policy.
- `skills:skill-templates-source` and `skills:workflow-automation` agree on the raw/context/metadata command roles and on project status as the effective configuration gate.
- No contradiction was found with global ESM, strict TypeScript, error handling, documentation, or testing constraints beyond C-01's internal scope wording.

## Summary

| Severity | Count |
| -------- | ----: |
| Critical |     0 |
| High     |     0 |
| Medium   |     1 |
| Low      |     1 |

Overall verdict: **Substantially compliant, with one medium specification-scope inconsistency and one associated low-severity test gap.** The implementation behavior exercised by the focused suites is green.
