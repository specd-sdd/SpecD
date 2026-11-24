# Partial audit: cli:change-archive, cli:change-status, skills:skill-templates-source + globals

Change: archive-schema-checks-and-skip-flag. Read-only audit. Core-owned behaviours (UnknownCheckError / CheckNotSkippableError, hook-check message, bypassFlag derivation, next-action reason text) are in core and audited in other batches; they are only cross-referenced here.

## 1. cli:change-archive

### Requirements Summary (changed/added)

1. Command signature: `--skip-checks <ids>` (repeatable, comma-separated), `--allow-overlap` / `--allow-out-of-scope` as strict aliases, CLI translates to single `skipChecks`, no other bypass field, no CLI-side skippability validation, dedupe/trim/case-sensitive, missing value = usage error.
2. Output on success (extended): invalidated peers also reported with `--skip-checks spec.overlap`.
3. Errors: UnknownCheckError / CheckNotSkippableError exit 1 (incl. hook ids), CheckPredicateFailedError output (+ bypass line only when skippable), SpecOverlapError message with `Use --skip-checks spec.overlap ...` only when skippable.
4. Usage examples.

### Implementation Status

| Requirement                                                                                                                                                     | Code                                                         | Status                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------- |
| Option declarations, repeatable accumulator, help text                                                                                                          | archive.ts:66-73                                             | Conformant                                           |
| Split on comma, trim, drop empties, Set dedupe, exact case                                                                                                      | archive.ts:104-112                                           | Conformant                                           |
| Alias translation to `spec.overlap` / `impl.linksInScope`, no `allowOverlap`/`allowOutOfScope` fields passed                                                    | archive.ts:113-119, 126-130                                  | Conformant                                           |
| No local skippability validation                                                                                                                                | archive.ts (none present)                                    | Conformant                                           |
| `--skip-checks` without value = usage error exit 1                                                                                                              | commander default (missing option-argument -> exit 1)        | Conformant (relies on commander)                     |
| `--skip-hooks` independent of `--skip-checks`                                                                                                                   | archive.ts:99-102 vs 104-112                                 | Conformant                                           |
| Invalidated peers section with spec.overlap bypass                                                                                                              | archive.ts:141-148 (independent of how bypass was requested) | Conformant                                           |
| SpecOverlapError: lists specs/peers, ends with `Use --skip-checks spec.overlap to proceed despite overlap.` only if `err.skippable`                             | archive.ts:166-181                                           | Conformant                                           |
| CheckPredicateFailedError text: id, label, message, command, `bypass:  Retry with --skip-checks <id> if an exception is granted` only when `skippable === true` | archive.ts:183-193                                           | Conformant                                           |
| CheckPredicateFailedError in json/toon -> structured record via handleError                                                                                     | archive.ts:194 -> handle-error.ts                            | Conformant (code not verified here)                  |
| Unknown / NotSkippable / hook messages                                                                                                                          | thrown by core `validateSkipChecks`; CLI -> handleError      | Conformant (CLI side); message content is core batch |
| Progress presenter marks bypassed ids as skipped by `--skip-checks`                                                                                             | archive.ts:48, \_check-progress-presenter.ts:71              | Conformant (extra, not in spec)                      |

### Discrepancies

| #   | Sev  | Detail                                                                                                                                                                                                                                                                          | Spec wrong?             | Code wrong?                                 |
| --- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------- |
| A1  | Low  | Text-mode CheckPredicateFailedError branch tests `opts.format === 'text'` (archive.ts:183) rather than the parsed `fmt`; `--format` is validated by `parseFormat` earlier but an invalid/undefined value would fall to handleError. Behaviour equals spec for all valid values. | n/a                     | Cosmetic; use `fmt`.                        |
| A2  | Low  | SpecOverlapError is written as plain text to stderr for ALL formats (archive.ts:166-181), including `--format json`; spec says only "prints to stderr", no scenario demands structured output for overlap. Pre-existing behaviour.                                              | Spec silent; consistent | Could emit structured record; not required. |
| A3  | Info | Text bypass line is in an indented multi-line block (`  check:` / `  bypass:`). Spec literal `bypass:  Retry with ...` (two spaces after colon) matches code line (`  bypass:  Retry...`) modulo leading indent.                                                                | Fine                    | Fine                                        |

No High/Medium discrepancies.

### Test Coverage (packages/cli/test/commands/change/archive.spec.ts)

| Scenario                                                         | Test                                                            |
| ---------------------------------------------------------------- | --------------------------------------------------------------- |
| comma list                                                       | `accepts a comma-separated --skip-checks list` (463)            |
| repeatable                                                       | `accumulates a repeated --skip-checks flag` (468)               |
| --allow-overlap translation (no other field)                     | 443, 456                                                        |
| --allow-out-of-scope translation                                 | 450                                                             |
| CLI does not validate skippability / non-skippable forwarded     | 546 (`non-skippable check id, also through an alias`)           |
| whitespace / empty                                               | 478, 483                                                        |
| duplicates collapse                                              | 488                                                             |
| singular alias                                                   | 498                                                             |
| missing value usage error                                        | 509                                                             |
| combine with --skip-hooks                                        | 503                                                             |
| help documents flags                                             | 519                                                             |
| Unknown check id                                                 | 534                                                             |
| Non-skippable check id                                           | 546                                                             |
| Hook check id (message points to --skip-hooks)                   | partially (546 generic); no explicit hook.pre test              |
| Overlap error suggests / not suggests bypass                     | 584, 600                                                        |
| Skippable / non-skippable plugin failure                         | 631, 646                                                        |
| Plugin failure json                                              | 657                                                             |
| Case-sensitive                                                   | 493 (forwarded untouched; Unknown error itself comes from core) |
| Structured error CheckNotSkippable json                          | 559                                                             |
| Invalid state with skip flags                                    | 669                                                             |
| Alias for non-skippable check fails                              | 546                                                             |
| --skip-checks spec.overlap reports invalidated peers (text+json) | 684                                                             |

### Missing Tests

- Hook check id (`--skip-checks hook.pre`) with message pointing at `--skip-hooks` (only generic NotSkippable covered).
- Explicit assertion that `--allow-overlap` with a non-skippable `spec.overlap` yields no bypass suggestion beyond 600 (covered by 600 for SpecOverlapError).

### Summary counts

Requirements/scenarios audited: 4 requirement groups, 27 scenarios. Conformant 27, discrepancies 3 (0 high, 0 med, 2 low, 1 info). Scenarios without a dedicated test: 1 (hook id).

## 2. cli:change-status

### Requirements Summary

New requirement "Archive bypass hints come from resolved bindings": CLI renders `bypassFlag` exactly as provided by GetStatus, never constructs/removes one; none for non-skippable; next-action reason suffix `Use --skip-checks spec.overlap to archive anyway.` (core-derived); JSON/TOON carry `bypassFlag` exactly when text shows one.

### Implementation Status

| Requirement                                                                                       | Code                                                          | Status     |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------- |
| Render `bypass: <flag>` under blocker only when `bypassFlag !== undefined`, no local construction | status.ts:270-273                                             | Conformant |
| Structured output carries `bypassFlag`                                                            | status.ts:455 area (passes `bypassFlag` through when defined) | Conformant |
| Next-action reason text / flag derivation from bindings                                           | core get-status.ts:987-1013, 1038                             | Core batch |
| Disabled spec.overlap -> no blocker                                                               | core                                                          | Core batch |

### Discrepancies

| #   | Sev        | Detail                                                                                                                                                                                                                                                                                          |
| --- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Low (docs) | `docs/cli/cli-reference.md` documents the status `bypass:` line only for archive (line ~600); the status command section does not show the `bypass:` line in its text-output example. Spec: docs global requires CLI doc to describe output. Spec does not demand it; docs-wrong/omission only. |

### Test Coverage (status.spec.ts, describe `archive bypass hints come from resolved bindings`)

| Scenario                                                  | Test                                                                            |
| --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Skippable overlap shows canonical bypass                  | `renders the projected bypass flag under a skippable blocker in text`           |
| Several blockers own flag / hardened mixed with skippable | `gives every skippable blocker its own flag and none to a locked one`           |
| CLI never builds bypass                                   | `never builds a bypass when GetStatus supplies none`                            |
| Disabled spec.overlap                                     | `shows no overlap blocker when the schema disabled spec.overlap`                |
| Locked / schema-hardened overlap (no flag)                | indirectly via the "gives every..." and "never builds" tests (CLI only renders) |
| Shown flag accepted by archive                            | not a CLI unit test (covered by archive.spec 463/468 plus core)                 |

### Missing Tests

- No CLI test asserting JSON/TOON include `bypassFlag` exactly when text does ("Structured output includes the same hints"); only the passthrough code exists (status.ts ~455).
- No plugin-archive-check (`@security.code-scan`) status scenario at CLI level (core get-status tests cover derivation).
- No next-action reason assertion at CLI level (rendered from core).

### Summary counts

1 new requirement, 10 scenarios: Conformant 10, discrepancies 1 (low, docs). Tests: 6 of 10 covered directly in CLI; 4 core-delegated or missing (structured output, plugin check, shown-flag-accepted, locked check).

## 3. skills:skill-templates-source

### Requirements Summary

Overlap requirement revised: `--skip-checks spec.overlap` is the live-overlap bypass; design/implement/verify/new must not list OVERLAP_CONFLICT as a typical blocker and must not teach `--skip-checks spec.overlap` / `--allow-overlap` for `spec-overlap-conflict` review; `specd-archive` may list OVERLAP_CONFLICT, teaches `--skip-checks <checkId>` as canonical (id from status), aliases only as aliases, blocker without a bypass flag cannot be skipped, and names `workspace.readOnly`, `impl.filesResolved`, `deps.consistent` as never bypassable.

### Implementation Status

| Requirement                                                                                                                                                               | Code                                                                             | Status                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| design/implement/verify/new: review reason routed to /specd-design, never bypassed with `--skip-checks spec.overlap` or `--allow-overlap`                                 | specd-design:42-47, specd-implement:22-26, specd-verify:23-27, specd-new:134-139 | Conformant (these templates mention the flags only in the negative form)                               |
| Design template mentions `--skip-checks spec.overlap` as bypass of live archive overlap in a parenthetical (design:42) while also not listing OVERLAP_CONFLICT as typical | specd-design/SKILL.md.tpl:42-44                                                  | Conformant to prior text; see D1                                                                       |
| Archive teaches `--skip-checks <checkId>` using status-shown id                                                                                                           | specd-archive:25-31, ~216-222                                                    | Conformant                                                                                             |
| Aliases only as aliases                                                                                                                                                   | specd-archive ~228-231                                                           | Conformant                                                                                             |
| Blocker without `bypass:` flag cannot be skipped                                                                                                                          | specd-archive:28-29, ~224-227                                                    | Conformant                                                                                             |
| Names workspace.readOnly, impl.filesResolved, deps.consistent never bypassable                                                                                            | specd-archive ~224-226                                                           | Conformant (also lists verification.current and schema/archivable/task-completion checks, beyond spec) |
| Archive: OVERLAP_CONFLICT listed as typical blocker; `--skip-checks spec.overlap` only for live overlap, never spec-overlap-conflict                                      | specd-archive:25-31                                                              | Conformant                                                                                             |

### Discrepancies

| #   | Sev  | Detail                                                                                                                                                                                                                                                                                                                                                                                                  | Spec wrong                                     | Code wrong                                           |
| --- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| D1  | Low  | specd-design/SKILL.md.tpl:42 says OVERLAP_CONFLICT blocker is "bypassed with `--skip-checks spec.overlap`" in the design template, which teaches a live-archive bypass inside a skill that spec says must not list OVERLAP_CONFLICT as typical. It appears as an exclusion note, same as pre-change text (`--allow-overlap`), and the spec scenario only forbids teaching it as the response to review. | Spec scenario ambiguous (flag mention allowed) | Mild: could drop the positive mention                |
| D2  | Info | Archive template extra claim: verification.current and schema/archivable/task-completion checks "never bypassable on archive". Beyond spec; depends on core locks. Verify against core:archive-change/transition-checks (other batch).                                                                                                                                                                  | -                                              | Potentially over-specific if schema lock set differs |

### Test Coverage (packages/skills/test/template-workflow.spec.ts)

- Overlap vs invalidation (design/implement/verify/new): updated assertion on `never bypassed with \`--skip-checks spec.overlap\` or \`--allow-overlap\``.
- Archive: lists OVERLAP_CONFLICT, contains `--skip-checks spec.overlap`, `spec-overlap-conflict`, `never bypass it`.
- `teaches the canonical check bypass on archive, with --allow-* only as aliases`.
- `names the archive checks that can never be bypassed and the missing-flag rule`.
  All four spec scenarios covered.

### Missing Tests

None for spec scenarios. Negative assertion that design/implement/verify/new do NOT list `OVERLAP_CONFLICT` as typical is pre-existing.

### Summary counts

3 changed requirement areas, 4 scenarios (2 reworded, 2 new): Conformant 4/4; discrepancies 2 (1 low, 1 info). Missing tests 0.

## 4. Global constraints (all changed/added code, tests, docs)

Method: scanned `git diff HEAD` added lines plus untracked package files for `any`, `eslint-disable`, `@ts-`, `console.`, default exports, extensionless relative imports, node/infrastructure imports in domain/application, missing JSDoc on new exports/functions/interfaces.

| Spec                                                                          | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| architecture (layers, domain purity, application ports only)                  | No violation found. Domain files changed (build-schema, check-bindings, check-registry, merge-schema-layers, transition-checks, workflow-step, spec-overlap-error) import no node:/infrastructure modules. New `application/services/validate-skip-checks.ts` imports only domain modules. `schema-yaml-parser.ts` is infrastructure and imports a domain type: allowed.                                                                                                                                                                                                                    |
| conventions (ESM, named exports, `.js` extensions, JSDoc, no default exports) | No violation found. All new exports have JSDoc (heuristic scan; only hits were type re-exports in value-objects/index.ts:76 and a type import in schema-yaml-parser.ts:8, not declarations). `validate-skip-checks.ts` JSDoc has `@param`, `@returns`, `@throws`. CLI helper `makeArchiveProgressRenderer` JSDoc updated with new `@param skipChecks`.                                                                                                                                                                                                                                      |
| error-handling-conventions                                                    | No violation found. `SpecOverlapError` adds `skippable`, still extends `SpecdError` with a code; new errors reuse check-registry-errors. CLI error output on stderr with `error:` prefix.                                                                                                                                                                                                                                                                                                                                                                                                   |
| eslint                                                                        | No `any`, `eslint-disable`, `@ts-ignore` in added lines. (Lint/typecheck not executed.)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| logging                                                                       | No `console.*` added; CLI uses process.stderr/output helpers as before.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| testing                                                                       | New tests live in `test/` mirroring `src/` (e.g. core/test/application/services/validate-skip-checks.spec.ts, core/test/domain/errors/spec-overlap-error.spec.ts) with `.spec.ts`. No snapshots. Low: packages/cli/test/commands/change/archive.spec.ts uses hardcoded POSIX-looking mock paths (`/project/.specd/archive/...`, lines ~109, 131, 165) in mocked results; pre-existing pattern, not introduced by this change, and the CLI only calls `path.relative` on them (spec requires remapping with `path.resolve` when compared with host path APIs). Not flagged as new violation. |
| docs                                                                          | docs/guide/workflow.md, schema-format.md, custom-schemas.md, cli.md, core/custom-checks.md, cli-reference.md, ADR-0030 addendum updated; ADR change is an addendum to existing ADR 0030 (acceptable under ADR numbering rules; no new ADR). Gap (low): docs/cli/cli-reference.md status section does not show the `bypass:` line in the status text output example (see S1). `docs/guide/*` frontmatter not touched. Generated `packages/guide/src/infrastructure/generated/guides.ts` regenerated (708 lines churn): derived artefact, not reviewed line by line.                          |
| Changesets                                                                    | Two changesets (`.changeset/20261022-archive-schema-checks-and-skip-flag{,-specd}.md`) with consistent spec lists; BREAKING note present. Informational: the `-specd` one lists `@specd/specd: patch` and the other lists core/cli minor and skills patch; fine.                                                                                                                                                                                                                                                                                                                            |

Global violations total: 0 high, 0 medium; 2 low observations (hardcoded POSIX mock paths pre-existing in archive.spec.ts; missing status `bypass:` doc example).
