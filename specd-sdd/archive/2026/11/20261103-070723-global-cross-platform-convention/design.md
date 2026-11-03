# Design: global-cross-platform-convention

## Non-goals

- No source code changes in any package. Existing portability code (`packages/core/src/infrastructure/fs/path-platform.ts`, `packages/core/src/infrastructure/node/hook-runner.ts`, `packages/core/src/infrastructure/{git,hg,svn}/exec.ts`, `packages/code-graph/src/infrastructure/index-lock.ts`, `packages/code-graph/src/domain/services/split-workspace-identity.ts`) is not audited or modified here.
- No change to `.github/workflows/ci.yml`.
- No `dependsOn` edits to module specs (`core:vcs-adapter`, `core:spec-id-format`, `core:hook-runner-port`); a later change may add them.
- No new lint rule or automated check that detects violations; enforcement is tests plus the three-OS CI job.
- No edits to `docs/`: the three specs are internal conventions and no public contract, CLI command, or SDK symbol changes.

## Affected areas

Documentation-only change in the `default` workspace under `specs/_global/`.

- `specs/_global/testing/spec.md` (`default:_global/testing`)
  - Add requirement `### Requirement: Tests verify the cross-platform contract` after `### Requirement: Fixtures are valid on Windows`.
  - Modify `## Spec Dependencies` body: append `- [\`default:\_global/cross-platform\`](../cross-platform/spec.md) — production portability rules that these tests must verify`.
  - Risk: low. Overlap: `fs-decouple-00-storage-contract-suite` also targets this spec; its delta folder is empty and it plans a storage contract-suite requirement, so there is no textual conflict. Re-check before archive.
- `specs/_global/testing/verify.md`: add scenarios for the new requirement after `### Requirement: Fixtures are valid on Windows`.
- `specs/_global/continuous-integration/spec.md` (`default:_global/continuous-integration`)
  - Add requirement `### Requirement: The matrix enforces the cross-platform contract` after `### Requirement: Three operating systems`.
  - Modify `## Spec Dependencies` body: keep the existing `default:_global/testing` line and append `- [\`default:\_global/cross-platform\`](../cross-platform/spec.md) — the contract the three-operating-system job enforces`.
- `specs/_global/continuous-integration/verify.md`: add scenarios after `### Requirement: Three operating systems`.

Dependents (via spec graph): every spec that includes `default:*` globals in context sees the new requirements. No code depends on these specs.

## New constructs

- `specs/_global/cross-platform/spec.md` (`default:_global/cross-platform`), title `Cross-Platform Conventions`, with requirements:
  1. Portability is a baseline requirement
  2. Filesystem paths
  3. Case sensitivity
  4. Names valid on every platform
  5. Line endings and encoding
  6. Processes and shell
  7. Permissions and symlinks
  8. File locking, replacement, and path length
  9. Directories and environment
  10. Enforcement
  - Constraints section and `## Spec Dependencies` with `_none — this is a global constraint spec_`.
- `specs/_global/cross-platform/verify.md`: one or more scenarios per requirement, headings identical to spec.md.

## Data models & Contracts

None. The only contracts are the markdown specs and the delta files:

- Delta files use `op: added` (heading included in `content`, positioned `after` a named requirement under parent `Requirements`) and `op: modified` on the `Spec Dependencies` section (body only, full replacement body).
- Dependency graph registered in the change: `testing` → `cross-platform`, `continuous-integration` → `cross-platform`, `continuous-integration` → `testing`; `cross-platform` has no dependencies (direction chosen to avoid a cycle).

## Approach & Execution flow

1. Create `specs/_global/cross-platform/spec.md` and `verify.md` as full files in the change.
2. Write `spec.md.delta.yaml` and `verify.md.delta.yaml` for `testing` and `continuous-integration`.
3. Validate each artifact per spec; review merged diffs.
4. On approval and archive, specd merges deltas into `specs/_global/testing` and `specs/_global/continuous-integration` and copies the new spec to `specs/_global/cross-platform`.

The `cross-platform` spec states topic rules (paths, case, names, line endings/encoding, processes/shell, permissions/symlinks, locking/replacement/length, directories/environment) with the accepted technique per topic. `testing` keeps only test-specific rules and references it; `continuous-integration` names the matrix as the gate.

## Error handling & Edge cases

- Validation error on delta selectors: selectors match the exact headings `Requirements`, `Requirement: Fixtures are valid on Windows`, `Requirement: Three operating systems`, and `Spec Dependencies`; re-fetch outlines if headings change at rebase time.
- If `fs-decouple-00-storage-contract-suite` archives first and edits `Requirement` headings in `testing`, re-run `changes spec-preview` and adjust the `after` anchor.
- The `Spec Dependencies` modification replaces the whole body; the replacement text restates all existing lines to avoid dropping them.

## Key decisions

- **New global spec, not extending `testing`.** Production rules need a home independent of tests; testing and CI reference it. Rejected: put everything in `testing` (mixes production and test concerns) and put everything in CI (CI states mechanism, not rules).
- **Dependency direction `testing`/`CI` → `cross-platform`.** Avoids a cycle and makes the global context for tests and CI include the rules. Rejected: `cross-platform` depending on testing/CI.
- **Rules plus accepted technique per topic**, as the user requested a convention covering what to consider and how.
- **Proceed with overlap on `testing`**, confirmed by the user, since the other change is unrelated.

## Trade-offs

- Rules are normative but not machine-checked; mitigation: testing requirement forces tests of the platform-specific branch, and CI runs three operating systems.
- The new global spec is included in `default:*` context, adding tokens to every context load; mitigation: concise requirements.
- Existing code may violate the rules; mitigation: out of scope, tracked by future changes.

## Spec impact

- `default:_global/testing`: gains one requirement and one dependency; no existing requirement changes.
- `default:_global/continuous-integration`: gains one requirement and one dependency; no existing requirement changes.
- Transitive dependents of `testing` (currently `continuous-integration`) are unaffected beyond the added reference.
- No module spec requirement is changed.

## Dependency map

- `default:_global/cross-platform`: none
- `default:_global/testing`: `default:_global/architecture`, `default:_global/conventions`, `default:_global/cross-platform`
- `default:_global/continuous-integration`: `default:_global/testing`, `default:_global/cross-platform`

## Migration / Rollback

No data or code migration. Rollback is reverting the archived spec merge. Nothing else depends on the new requirements at runtime.

## Testing

Spec-only change; verification is structural and by review:

- `specd changes validate` for `specs` and `verify` of all three specs passes.
- Merged previews show only the intended additions (new requirement, new scenarios, one dependency line each).
- Every `cross-platform` requirement has at least one scenario in `verify.md` with a matching heading.
- Scenarios in the `testing` and `continuous-integration` verify deltas map to their added requirements.
- CI itself (macOS, Linux, Windows) remains the runtime check; no new tests are added.

Documentation: no `docs/` update is required (no public contract changes).

Global spec cross-check: `architecture`, `conventions`, `error-handling-conventions`, `logging`, `eslint` are not touched (no code); `docs` is satisfied (no public symbols or CLI added); `testing` is extended consistently.

## Open questions

None.
