# Spec Compliance — change support-commas-in-names (audit 5, focused re-audit)

Mode: change (read-only). Scope: 31 change specs + project-wide specs and direct dependencies. Follow-up to audit 20261105-105014. Inline single auditor (no subagents); no code or spec files were modified.

## Summary

| Result     | Count                               |
| ---------- | ----------------------------------- |
| Specs PASS | 31                                  |
| Specs FAIL | 0                                   |
| CRITICAL   | 0                                   |
| HIGH       | 0                                   |
| MEDIUM     | 0                                   |
| LOW        | 3 (F2, F3, F4 — carried, unchanged) |
| INFO       | 3 (F5, F6 carried; F7 new)          |

Previous F1 (`cli:change-deps` text output prints normalized ID): **CLOSED**.

## Method

- `changes status` for scope; graph stats showed `stale: null` (no re-index needed).
- Files changed since audit 20261105-105014 (by mtime under `packages/`): only `packages/cli/src/commands/change/deps.ts` and `packages/cli/test/commands/change-deps.spec.ts` (plus turbo logs). All other findings and per-spec results are carried from audit 20261105-105014 (no code touched after it).
- Re-read `deps.ts` in full, the merged `cli:change-deps` spec + verify (`changes spec-preview`), and the test file.
- Ran `vitest run test/commands/change-deps.spec.ts`: PASS 32, FAIL 0. Existing turbo logs: cli typecheck clean; cli test suite 90 files / 1279 tests passed (13:39). Lint was not re-run.

## Closure of F1

Spec `cli:change-deps`, requirement "Output shows the normalized spec ID": in every output format the command MUST show the fully-qualified ID returned by the use case.

Code (`packages/cli/src/commands/change/deps.ts`):

- Modification, text (L170-171): `output(\`updated deps for ${result.specId} in change ${name}\n...\`)`— uses`result.specId`. Fixed.
- Modification, JSON/TOON (L176): `specId: result.specId`.
- Display, text (L100-101) and JSON/TOON (L110): `shown.specId`.
- No `parseSpecId`/spec ID parser import or call in the file (display scenario "holds no spec ID parser" satisfied); raw positional `specId` forwarded to `getSpecDeps` / `updateSpecDeps`.
- Only the `--clear` confirmation prompt (L144) quotes the raw typed ID. This is a prompt, not command output, and the spec text covers "output" formats; not a finding.

Tests (`packages/cli/test/commands/change-deps.spec.ts`):

- "Add deps to a spec in the change" (L40-66): mock now returns `specId: 'default:auth/login'` and asserts `updated deps for default:auth/login in change add-auth` — the masking mock is fixed.
- "Display dependencies for a specific spec via GetChangeSpecDeps" (L272-294): asserts normalized `default:auth/login` in the text header and `getSpecDeps` called with the raw `auth/login`.
- "forwards the raw bare specId untouched" (L441+) covers the forwarding scenario.

Status: **CLOSED**.

## Remaining findings

No CRITICAL, HIGH or MEDIUM findings.

### F2 — LOW (A, carried) — `cli:change-deps` Constraints stale

Delta constraint (`deltas/cli/change-deps/spec.md.delta.yaml:67`) still says "Listing and display modes use `GetStatus` or direct repository access"; display mode now uses the core `getSpecDeps` operation (`GetChangeSpecDeps`). Update the sentence.

### F3 — LOW (A, carried) — `core:update-spec-deps` error text names CLI flags

`UpdateSpecDeps` messages mention `--set/--add/--remove/--clear`; the sibling `UpdatePersistedSpecDeps` uses host-neutral wording. Consider aligning.

### F4 — LOW (B, carried, pre-existing) — `UpdateImplementationTracking` with no files

Empty `files: []` throws `ImplementationFileNotFoundError('')`; `InvalidInputError` would be more accurate. Spec silent.

### F5 — INFO (carried) — unrelated working-tree modifications

Unrelated `spec-lock.json` modifications, exploration files at the repo root, and `AGENTS.md`/`CLAUDE.md` edits should not be committed with this change.

### F6 — INFO (carried) — `--skip-hooks` comma list

Closed-vocabulary comma list; compliant; add to the design's non-goals list for completeness.

### F7 — INFO (new) — JSON test mocks still return an unqualified ID

`change-deps.spec.ts` JSON test (L145: `expect(parsed.specId).toBe('auth/login')`) and the remove/set text tests use mocks returning unqualified `auth/login`. They only verify pass-through of `result.specId`, so they are not wrong, but updating the mocks to `default:auth/login` would make all modification tests consistent with the real use-case return shape.

## Per-spec results

All 31 specs PASS. `cli:change-deps` moved FAIL → PASS (re-verified: code, tests, merged spec/verify). The other 30 are unchanged from audit 20261105-105014 (code under them untouched since).

## Consistency with project-wide specs

No new contradictions. `deps.ts` stays delivery-only (no ID parsing, delegates to use cases), named exports, JSDoc present, ESM imports with `.js` — compliant with architecture/conventions/docs.

## Limits

- Lint not re-run. Full test/typecheck status for the rest of the monorepo comes from existing turbo logs (cli) and the previous audit (core, skills).
- Specs other than `cli:change-deps` were not re-read line by line in this audit (carried).
