# Spec Compliance Report — extract-fs-config-loader

**Mode:** change  
**Date:** 2026-07-23  
**Verification:** full (post metadataPath fix)

## Summary

| Severity | Count |
| -------- | ----- |
| Critical | 0     |
| Major    | 0     |
| Minor    | 1     |
| Info     | 1     |

Explicit `metadataPath` retain/prefer is implemented and covered by tests. Prior Major (dropped fs `metadataPath`) is resolved.

## Findings

### MINOR-1 — Verify NOTE still cites `kernel-internals.ts`

**Spec:** `core:config-loader` verify scenarios for absent `metadataPath` still say “see `kernel-internals.ts`” while specs/design point at composition-resolver.

**Interpretation:** Cosmetics only; behaviour notes correctly attribute derivation to composition. Optional cleanup on archive or a tiny follow-up delta.

### INFO-1 — Change goals satisfied

| Requirement                                   | Evidence                                                                   |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| Purpose / factory `createDefaultConfigLoader` | Merged Purpose + constraints; composition/architecture deltas              |
| Default `.specd/schemas`                      | Loader `_buildConfig` + scenario + test                                    |
| Retain explicit `metadataPath` on fs binding  | `resolveAdapterBinding` copies into `normalizedConfig`; loader test        |
| Prefer explicit in composition                | `resolveMetadataPathForWorkspace` early return; composition-resolver tests |
| Absent path still derived                     | Same helper + derive test; VCS walk unchanged                              |
| Public barrel excludes `FsConfigLoader`       | barrel.spec                                                                |

Focused tests: config-loader + composition-resolver + barrel — **136 pass**.

## Recommendation

Audit is clean enough to proceed to `archivable`. Optional: fix MINOR-1 NOTE wording later.
