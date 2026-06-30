# Spec Compliance Audit

Mode: `--change improve-identity-ranking`

Change path: `/Users/monki/Documents/Proyectos/specd/specd-sdd/changes/20260618-081459-improve-identity-ranking`

Timestamp: `20260619-093245`

## Scope

Change specs:

- `cli:graph-search`
- `code-graph:graph-store`
- `code-graph:sqlite-graph-store`
- `code-graph:ladybug-graph-store`

Project-wide constraints considered:

- `default:_global/architecture`
- `default:_global/conventions`
- `default:_global/docs`
- `default:_global/eslint`
- `default:_global/spec-layout`
- `default:_global/testing`

Direct dependencies considered during verification/compliance review:

- `cli:entrypoint`
- `core:config`
- `code-graph:composition`
- `code-graph:document-model`
- `code-graph:symbol-model`
- `code-graph:staleness-detection`
- `code-graph:workspace-integration`

## Summary

- Specs reviewed: `4`
- Compliance findings: `1`
- Spec/code contradictions found: `0`
- Verified green test runs:
  - `packages/cli/test/commands/graph-search.spec.ts`
  - `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`
  - `packages/code-graph/test/infrastructure/ladybug/ladybug-graph-store-multi-kind.spec.ts`
- Additional direct smoke verification:
  - Ladybug identity-priority smoke check returned expected top hits for `ArchiveChange`, `core:change`, and `docs/architecture.md`
  - Ladybug token-strength smoke check returned expected ordering: `change`, `changeLog`, `prechange`, `exchangeRate`

## Findings

### 1. Ladybug backend verification is behaviorally correct but the automated acceptance path is unstable

Status: `ISSUE`

Impact:

- `code-graph:ladybug-graph-store` scenarios are only partially backed by a clean automated suite run
- The changed ranking behavior itself appears compliant, but the verification path is not robust enough to serve as a dependable regression gate

Evidence:

- The focused CLI suite passed: `packages/cli/test/commands/graph-search.spec.ts` (`11/11`)
- The focused SQLite backend suite passed: `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts` (`85/85`)
- The focused Ladybug multi-kind suite passed: `packages/code-graph/test/infrastructure/ladybug/ladybug-graph-store-multi-kind.spec.ts` (`1/1`)
- Running the broader Ladybug suite via Vitest failed at the runner/runtime layer rather than with assertion failures:
  - worker-pool failure: `ERR_IPC_CHANNEL_CLOSED`
  - thread-pool fallback: `SIGSEGV`
- Direct adapter smoke execution outside Vitest still produced expected results before native teardown failure:
  - identity-priority smoke output:
    - `symbolTop = ArchiveChange`
    - `specTop = core:change`
    - `documentTop = core:docs/architecture.md`
  - token-strength smoke output:
    - `["change","changeLog","prechange","exchangeRate"]`

Interpretation:

- Code/spec alignment for the changed Ladybug ranking logic looks correct
- The remaining gap is test/runtime stability around Ladybug-backed verification, not a visible mismatch between the spec and current implementation

Likely resolution path:

- Treat this as an implementation/test-hardening issue, not a spec-update issue
- Stabilize the Ladybug verification execution path so the full Ladybug suite can run cleanly under normal automation

## Per-Spec Notes

### `cli:graph-search`

Result: `COMPLIANT`

- Command registration, option parsing, kind validation, document routing, text formatting, snippet rendering, structured output fields, and `--spec-content` gating all align with the merged spec
- The dedicated CLI suite covers command signature, output grouping, invalid kind rejection, lock checking, document rendering, and text snippet normalization

### `code-graph:graph-store`

Result: `COMPLIANT`

- The abstract contract and in-memory/SQLite/Ladybug-backed usage remain aligned with the merged requirements around identity-prioritized ranking, snippets, line ranges, and token-strength ordering
- The contract scenarios relevant to this change are exercised through the backend suites

### `code-graph:sqlite-graph-store`

Result: `COMPLIANT`

- Source inspection confirms SQL-based identity-tier, token-hit, and match-strength ordering over FTS candidates
- The focused SQLite suite passes the changed ranking scenarios, including:
  - specd-shaped token expansion
  - CamelCase token expansion
  - exact/prefix/suffix/substring ordering
  - path/spec-id/name identity preference over body/comment-only matches
  - hyphenated and operator-like query sanitization

### `code-graph:ladybug-graph-store`

Result: `COMPLIANT WITH VERIFICATION-STABILITY GAP`

- Source inspection confirms the same identity-strength ladder and token expansion semantics required by the merged spec
- Direct smoke checks produced expected ranking outputs for the changed behavior
- Full automated suite coverage is currently weakened by native runtime instability during test execution/teardown

## Recommended Next Action

Because this audit found an implementation/test verification issue, the standard workflow should not auto-transition.

Recommended route:

- `Fix Implementation` — `/specd-implement improve-identity-ranking`

Reason:

- The specs appear correct
- The changed behavior appears implemented correctly
- The remaining gap is stabilizing Ladybug-backed verification so the full acceptance path is trustworthy
