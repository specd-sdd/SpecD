# Spec compliance report — deprecate-ladybug-store

**Mode:** full change audit. **Date:** 2026-08-20.

## Result

| Area                                                | Result                                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Code Graph: Ladybug retirement, composition, SQLite | No confirmed local discrepancy; one external-successor prerequisite cannot be verified from this workspace.         |
| CLI: impact, hotspots, search                       | No command-local discrepancy; all use the shared context/provider seam.                                             |
| CLI: graph context and stats                        | Three compliance gaps found; see below.                                                                             |
| Validation evidence                                 | `pnpm test`, `pnpm lint`, and `pnpm typecheck` passed. CLI: 79 files / 861 tests; Code Graph: 47 files / 604 tests. |

## Findings requiring follow-up

1. The configured `kernel` produced by `resolveGraphCliContext` is not passed into the shared provider lifecycle.
2. `graph stats` reconstructs/defaults parts of structured health rather than preserving canonical provider output unchanged.
3. Text health diagnostics do not explain the symbol-absence proof limits for dirty, excluded, unsupported, parse-failed, partial, or unknown coverage.

These are implementation/spec compliance gaps, not build failures. The full audit therefore does not recommend transition to `done`.

## Detailed audit records

- [\_partial-code-graph.md](_partial-code-graph.md)
- [\_partial-cli-lifecycle.md](_partial-cli-lifecycle.md)
- [\_partial-cli-commands.md](_partial-cli-commands.md)

The partial records are retained as the complete, independently produced evidence for this report.
