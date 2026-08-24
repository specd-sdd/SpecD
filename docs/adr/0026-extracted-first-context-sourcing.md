---
status: accepted
date: 2026-08-24
decision-makers: specd maintainer
consulted: '-'
informed: '-'
---

# ADR-0026: Extracted-First Context Sourcing for Change-Scoped Specs

## Context and Problem Statement

`CompileContext` assembled change context from two divergent sources: summary fields
(title/description) came from the persisted metadata cache — regenerated only from
canonical artifacts — while full-mode content came from the `PreviewSpec` merge of
persisted artifacts and in-flight deltas. The result was a bicéphalic view: catalogue
rows describing the pre-change state next to content blocks describing the post-delta
state. In the default summary mode the merged view was never consulted at all, so
agents designed against stale content without any indication, and specs that existed
only inside a change produced spurious "no metadata" warnings even though their merged
content was available.

We needed a single rule for where context truth comes from during a change's
lifecycle, one that keeps canonical state authoritative outside the change without
blinding agents to the work in flight.

## Decision Drivers

- **Single source per entry** — one spec entry must not mix pre-change and post-delta data
- **Format neutrality** — extraction must go through the schema's `metadataExtraction`
  engine (AST selectors), not markdown-specific heuristics
- **Canonical authority outside scope** — dependency and global specs keep reading the
  persisted, cache-backed projection; deltas must not leak into them
- **Actionable warnings only** — warnings must represent conditions an agent can act on;
  self-healing cache misses and expected-mid-change staleness are not actionable
- **No premature persistence** — merged-derived views are computed per load and never
  written into canonical caches

## Considered Options

1. **Status quo (metadata-first)** — keep cached metadata primary everywhere; reject:
   leaves the bicéphalic output, spurious warnings, and summary blindness in place.
2. **Persist merged-derived metadata** — regenerate caches from delta-applied content;
   rejected: pollutes canonical truth with non-canonical content that archive will
   supersede, complicating invalidation.
3. **Extracted-first with canonical fallback (chosen)** — scoped specs render from the
   merged preview set via schema-driven extraction; canonical metadata remains primary
   for everything outside the change scope.

## Decision Outcome

For every collected spec whose ID is in the change's `specIds`, the merged preview
artifact set is the primary content source in all display modes except `list`.
Fallback ladder: merged extraction → canonical `GetSpecMetadata` projection → base-file
extraction. Lock-owned LLM optimizations are never applied to change-scoped specs.
Optimization warnings distinguish `missing-optimization` from `stale-optimization` and
fire only outside the change scope. Metadata regeneration is provenance on the
structured result, never a warning. Traversal resolves manifest-declared dependencies
before any repository access and existence-checks discoveries before registration.

Consequences:

- Agents design against post-delta reality by default, with silent correctness instead
  of warning spam
- Extraction cost is paid per load for the few scoped specs (full mode already paid it)
- Legacy metadata caches without the `optimizationStatus` diagnostic type unknown as
  `missing` until first regeneration (self-healing)
- `PreviewSpec` remains the single delta-merge authority; consumers multiply but none
  reimplement merging

## Validation

Implemented in change `context-extracted-first` (specs `core:compile-context`,
`core:get-spec-context`, `core:get-project-context`); verified against the merged
scenarios with unit coverage across `CompileContext`, `GetSpecContext`,
`GetProjectContext`, and `traverseDependsOn`.
