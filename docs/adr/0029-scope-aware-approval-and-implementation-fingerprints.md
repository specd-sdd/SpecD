---
status: accepted
date: 2026-09-25
decision-makers: specd maintainer
consulted: '-'
informed: '-'
---

# ADR-0029: Scope-Aware Approval and Whole-File Implementation Fingerprints

## Context and Problem Statement

An approval is meaningful only for the exact change content and scope that was
reviewed. Previously, a spec approval did not retain the canonical set of specs
it covered, and a sign-off did not retain the implementation surface. A later
scope edit or implementation change could therefore be handled through broad
invalidation rules rather than an explicit comparison with the reviewed inputs.

We need deterministic evidence that is independent of link ordering and platform
path syntax, catches a changed linked file, and does not require language parsers
or semantic equivalence engines.

## Decision Drivers

- An approval must prove both what was reviewed and which specs it authorized.
- Sign-off and verification must detect implementation drift without making
  symbol locations part of the content identity.
- Formatting-only line-ending and trailing-whitespace changes should not
  invalidate evidence, while meaningful source changes must.
- Legacy evidence must remain readable without being treated as newly provable.

## Considered Options

1. **Fingerprint artifacts only** — rejected because it cannot prove a spec
   scope or detect implementation drift.
2. **Fingerprint linked symbol ranges** — rejected because range resolution is
   language-specific and a change outside a linked range can still affect the
   implementation.
3. **Use parser or formatter normalization** — rejected because it adds
   language-specific semantics and may hide meaningful changes.
4. **Fingerprint canonical scope plus complete linked files** — chosen.

## Decision Outcome

Spec approval fingerprints include the sorted, deduplicated canonical `specIds`
as well as non-task change artifacts. Sign-off and completed verification include
that artifact view plus a deterministic map of in-scope, confirmed implementation
file paths to complete-file hashes. The comparison includes the entire path set:
added, removed, renamed, unlinked, unreadable, and changed files are observable
differences.

Symbol links remain precise attribution metadata, but never narrow a file's
fingerprinted content. Files are normalized project-relative POSIX paths. Text
uses `text-v1` normalization (BOM removal, newline normalization, trailing
horizontal-whitespace removal, whitespace-only-line normalization, and one final
newline); binary input uses byte-for-byte `bytes-v1` hashing. No parser, formatter,
AST transform, or repository-wide unlinked file participates.

An observed empty implementation map is valid evidence for a change with no
linked implementation files. A missing implementation snapshot is legacy-unknown
evidence and cannot authorize a new required gate. Returning a file to identical
bytes does not automatically restore stale or revoked approval or verification:
human approval or successful verification must be renewed.

### Consequences

- Good, because scope changes and implementation drift have explicit,
  explainable differences.
- Good, because the model is deterministic and language-neutral.
- Good, because incidental line-ending or trailing-whitespace cleanup does not
  invalidate evidence.
- Bad, because sign-off and verification hash complete linked files, including
  changes outside a linked symbol.
- Neutral, because legacy approvals and evidence must be renewed before they can
  authorize a required gate.

### Confirmation

This decision is confirmed when canonical scope ordering and duplicate links do
not affect fingerprints; meaningful file or path-set changes do; supported
text-only normalization differences do not; binary input remains byte-sensitive;
and legacy missing snapshots fail closed until renewed.

## More Information

This ADR complements ADR-0028, which defines the materialized projections and
central reconciliation path that consume these fingerprints.

### Spec

- [`core:change`](../../specs/core/change/spec.md)
- [`core:approve-spec`](../../specs/core/approve-spec/spec.md)
- [`core:approve-signoff`](../../specs/core/approve-signoff/spec.md)
- [`core:invalidate-verification`](../../specs/core/invalidate-verification/spec.md)
- [`cli:change-verification`](../../specs/cli/change-verification/spec.md)
