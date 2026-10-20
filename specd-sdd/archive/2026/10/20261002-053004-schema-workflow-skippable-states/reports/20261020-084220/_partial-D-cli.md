# Batch D audit — CLI (attempt 17, change-lite)

Read-only audit. Specs covered: cli:change-status, cli:change-transition, cli:change-validate, cli:change-artifacts, cli:change-spec-preview.

## cli:change-artifacts (prior MEDIUM — RESOLVED)

Prior finding: artifacts.ts swallowed schema resolution failures and SchemaProviderIdentityMismatchError in a bare `catch {}`, exit 0, delta rows silently dropped.

### Resolution

- ✅ packages/cli/src/commands/change/artifacts.ts:184-186 now `catch (err) { handleError(err, opts.format) }`; SchemaProviderIdentityMismatchError maps to exit 3 via handle-error.ts:178-186. Failures reported as errors with non-zero exit; no silent drop of delta rows.
- ✅ schema warnings surfaced via formatSchemaAdvisories.

## Remaining CLI specs

### cli:change-status / cli:change-transition / cli:change-validate / cli:change-spec-preview

- ✅ Projections (allowed, availableTransitions, nextAction) come from check-registry evaluation.
- ✅ change-transition validates isWorkflowTransitionLegal; enter-ready/approve gates as checks, not pending-\* transitions.
- ✅ validate --all with zero specIds exits 0 before resolving schema (advisory drift).
- ✅ spec-preview reads change spec deltas.

### Discrepancies / LOW (non-blocking)

- Presenter labels hook skips as `--skip-hooks` whenever any phase flag is passed (transition.ts:377).
- FsChangeRepository caches an unresolvable-schema `null` for repository lifetime.
- invalidate-verification.ts keeps its own boundary list (out of scope per design).
- Missing tests for `--all` drift advisory and single-spec exit 3 without `--artifact`.

### Summary

Prior MEDIUM resolved; 0 HIGH, 0 MEDIUM, several LOW (non-blocking).
