# Spec Compliance Report — extract-fs-config-loader (verify cycle)

**Mode:** change (full verify)  
**Timestamp:** embedded in path  
**State:** verifying → designing (artifact failure)

## Executive Summary

Verification found that the `core:config` `metadataPath` ownership delta **does not apply** to the merged spec. Other drift fixes (`schemasPath`, `createDefaultConfigLoader`, composition/architecture) apply correctly and match code.

| Metric                                      | Result                                  |
| ------------------------------------------- | --------------------------------------- |
| Implementation vs drift intents             | Pass (code already correct)             |
| Merged `core:config-loader`                 | Pass (`.specd/schemas`, factory naming) |
| Merged `core:composition` / architecture    | Pass                                    |
| Merged `core:config` metadataPath paragraph | **FAIL — delta ineffective**            |

## Critical finding

`deltas/core/config/spec.md.delta.yaml` uses a paragraph `contains` selector + `value` update intended to reassign absent-`metadataPath` derivation to kernel composition. `changes validate` reports structural pass, but `changes spec-preview` still shows the base wording (“the config loader auto-derives…”). Inline validate diff only shows unrelated `_`/`*` emphasis renorm.

**Interpretation:** Delta selector/application bug or mismatch — artifact must be rewritten (prefer modifying the parent `Requirement: Workspaces` body or a more robust selector), not a code fix.

## Other specs

Aligned with code; loader tests 124/131 focused suites green; verifying pre-hooks test/lint/typecheck green.

## Recommendation

Return to `/specd-design` and rewrite the `core:config` specs delta so merged preview shows kernel ownership of absent `metadataPath`.
