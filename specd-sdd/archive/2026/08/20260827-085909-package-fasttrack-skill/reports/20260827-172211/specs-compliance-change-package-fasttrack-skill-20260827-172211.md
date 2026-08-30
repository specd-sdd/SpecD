# Spec compliance audit — `package-fasttrack-skill`

**Mode:** Specific change, full verification.

## Executive summary

All eight change specs conform to the inspected implementation, direct dependencies, and applicable global conventions. No functional or blocking discrepancy was found.

Installation verification passed through 71 focused automated tests across `@specd/skills` and the five agent plugins. An additional unmocked default-install check in temporary project roots confirmed the real canonical template installs correctly for OpenCode and Standard, including the required journal and capability gates.

## Summary counts

| Category                                       | Count |
| ---------------------------------------------- | ----: |
| Change specs audited                           |     8 |
| Functional or blocking discrepancies           |     0 |
| Focused automated tests passed                 |    71 |
| Unmocked default-install runtime checks passed |     2 |
| Non-blocking coverage improvements             |     3 |

## Findings

1. `specd-fasttrack` is canonically discovered from `@specd/skills`, resolved generically through `ResolveBundle`, and installed by all five plugins.
2. The generated skill requires the journal to be appended before advancing after every decision, scope or contract finding, source edit, implementation-tracking update, test/debug action, and audit. Final consolidation cannot replace these incremental entries.
3. Permanent unmocked default-install integration tests should be added for Claude, Copilot, and Codex so their adapter suites exercise the real template instead of fixture bundles.
4. Add a focused `ResolveBundle` + `specd-fasttrack` integration test covering project-relative shared paths, capabilities, frontmatter, and shared file behavior together.
5. Promote the successful OpenCode/Standard unmocked runtime check into a committed regression test.

## Detailed findings

The complete, batch-level audit findings are preserved verbatim in these traceable partial reports:

- [`_partial-skills.md`](_partial-skills.md) — template source, repository discovery, and generic bundle resolution; 48 tests passed; 0 discrepancies; 2 non-blocking coverage gaps.
- [`_partial-vendor-a.md`](_partial-vendor-a.md) — Claude, Copilot, and Codex installation paths, capabilities, and frontmatter; 13 tests passed; 0 discrepancies; one non-blocking real-template coverage gap.
- [`_partial-vendor-b.md`](_partial-vendor-b.md) — OpenCode and Standard installation paths, real-template temporary-project execution, capabilities, and frontmatter; 10 tests plus two unmocked runtime checks passed; 0 discrepancies; one non-blocking permanent-test gap.

The partial reports remain alongside this aggregate report for audit traceability and contain the complete requirement-by-requirement evidence, test coverage, dependency chains, and missing-test details.
