# SDK Build Implementation Review

## Purpose

Delivery hosts need one implementation-review projection that combines Core's
persisted tracking with optional graph intelligence without duplicating resolution
policy. This spec defines the SDK orchestration used by CLI and future hosts.

## Requirements

### Requirement: Delivery-neutral orchestration

`buildImplementationReview(ctx, input)` SHALL obtain the raw review from
`ctx.kernel.changes.getImplementationReview`, open the graph through
`withOpenGraphProvider`, obtain canonical graph health, and resolve all symbol-level
links through `ResolveSymbolReference`.

The SDK SHALL NOT parse source language syntax, reimplement symbol matching, or
perform presenter formatting. Core SHALL remain the authority for stored tracking and
Code Graph SHALL remain the authority for resolution.

### Requirement: Stable review projection

The result SHALL retain every stored spec, file, and symbol value unchanged. Each
symbol-level link SHALL gain a structured resolution projection containing status,
reason code, graph health and coverage, canonical logical target, contributing
declarations, candidates, public/local binding provenance, and ordered resolution
path when available.

File-level links SHALL remain valid and SHALL NOT be forced through symbol resolution.
The workflow MUST NOT mutate active manifests, confirmed links, or archived sidecars.

### Requirement: One health snapshot and batch resolution

One invocation SHALL evaluate graph health once and SHALL resolve its symbol links
through the resolver's batch contract under one opened-provider lifecycle. It MUST
NOT open a provider or scan the complete graph independently for every link.

### Requirement: Graph availability behavior

Readable but non-current or incomplete graph state SHALL be represented through
per-link `unresolved` outcomes from the resolver. Provider availability, generation,
or lifecycle failures that prevent safe reads SHALL propagate through the SDK's
standard infrastructure error contract and SHALL NOT be rewritten as missing links.

### Requirement: Shared host behavior

All host workflows that present implementation review, including change implementation
commands and change status enrichment, SHALL consume this same projection. Hosts SHALL
NOT maintain independent same-file, rightmost-segment, or workspace-name fallbacks.

## Constraints

- The API returns structured data only.
- The orchestration depends on Core and Code Graph through their public APIs.
- Resolution diagnostics do not become verification or archive blockers in this
  change.

## Spec Dependencies

- `sdk:host-context` — shared kernel and graph provider factories
- `sdk:with-open-graph-provider` — provider lifecycle and cleanup
- `core:get-implementation-review` — authoritative persisted review input
- `code-graph:resolve-symbol-reference` — conservative reference resolution
- `code-graph:get-graph-health` — canonical freshness and coverage snapshot

## ADRs

- [ADR-0024: Logical symbol resolution](../../../docs/adr/0024-logical-symbol-resolution.md)
