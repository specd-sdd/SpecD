---
title: Code graph
sidebar_position: 4
---

# Code graph

Package reference for `@specd/code-graph` — indexing, search, impact analysis, and graph health.

> **Hosts:** start at [SDK](../sdk/index.md) and import `@specd/sdk` only. Use this section when you need graph package semantics or are extending graph behaviour inside the monorepo.

## Logical references

Code Graph owns semantic symbol identity and resolution. A `LogicalSymbol` groups the
declaration occurrences that the source language defines as one target while retaining
their existing location-backed `SymbolNode` identities. Its canonical identity uses
structured workspace, surface, owner, name, symbol-space, and member-form fields; it
is delimiter-safe, case-preserving, round-trippable, and independent of source ranges.

`PublicBinding` and `LocalBinding` are first-class routes to logical targets. They keep
public aliases, re-export chains, lexical scope, shadowing, and ordered
`ResolutionStep` provenance instead of collapsing routes into relation metadata.

The provider exposes single and batch logical-reference operations:

```typescript
const result = await provider.resolveSymbolReference({
  workspace: 'core',
  requested: 'createKernel',
  publicSurface: 'core:src/public.ts',
})

const results = await provider.resolveSymbolReferences(requests)
```

A result preserves the request and reports graph health, relevant index coverage, a
stable reason code, zero or one canonical target, deterministic candidates, and the
proven path. Status has conservative semantics:

| Status       | Meaning                                                                        |
| ------------ | ------------------------------------------------------------------------------ |
| `resolved`   | Exactly one target is proven by declaration, binding, or hierarchy evidence.   |
| `ambiguous`  | Multiple valid targets remain; none is selected.                               |
| `unresolved` | Evidence is stale, incomplete, unsupported, runtime-only, or otherwise unsafe. |
| `missing`    | Current targeted input and complete coverage prove the reference is absent.    |

Resolution never promotes a same-name search hit, fuzzy match, or delimiter-split
suffix into a target. Stable reason families include `GRAPH_*`, `COVERAGE_*`,
`REFERENCE_*`, `AMBIGUOUS_*`, and `RUNTIME_UNSUPPORTED`. Infrastructure and storage
generation failures throw instead of masquerading as link outcomes.

For inherited members, hierarchy edges lead from the addressed owner to ancestor
owners. The resolver looks up the requested member beneath each reached owner and
uses the nearest depth that provides evidence; reaching an owner is not itself member
evidence. Equal-precedence inherited members remain ambiguous, and cycles are bounded.

The built-in TypeScript, Python, Go, and PHP adapters derive declaring owners from
language syntax before constructing member identities; parser-local IDs and optional
`SymbolNode.parentId` values are never canonical owners. Each adapter owns its language
rules for base clauses, receiver types, interface satisfaction, namespaces, and
unsupported build-dependent choices. An adapter advertises hierarchy support only for
syntax for which it emits matching hierarchy facts and ordered resolution steps.
Imported hierarchy relations are translated to the same logical-owner model during the
indexing session, while uncertain MRO, method-set, trait-conflict, or build-context
choices remain unresolved.

## Public and canonical impact

After conservative reference resolution selects a canonical target,
`getExactPublicBinding` retrieves its public route by the complete surface, exported
name, symbol space, and target identity. This lookup uses structured binding indexes;
it is not ranked, paginated discovery search, so a common export name cannot hide the
selected route behind a result limit. `analyzePublicBindingImpact` then returns both
`bindingImpact` (consumers of that route) and `canonicalImpact` (all consumers of the
logical implementation), plus the binding, target, and path. Ordinary symbol impact
resolves the canonical target first and deduplicates traversal by logical identity.
Ambiguous targets are surfaced rather than merged.

Surface, exported name, and symbol space identify a public export slot. Individual
route IDs additionally include the proven canonical target, so two modules exposing
the same slot remain separate bindings and resolution reports both instead of keeping
the last indexed route.

## Unified search

`CodeGraphProvider.search(input)` is the authoritative host-facing operation for
symbols, indexed source files, specs, and documents. Code Graph expands the query,
fetches bounded backend candidates, applies workspace/path/kind filters, ranks
case-exact structured identities and bindings before normalized, prefix, component,
or generic content matches, groups declarations by
logical target, suppresses duplicate declaration-name occurrences, refills file
limits, and returns deterministic category order. Hosts do not combine the
compatibility-level category methods themselves.

Source matches are located from persisted content and preserve the original text plus
a zero-based, half-open occurrence range. An optional snippet and its range are
separate. Same-range provenance collapses in the order `full-query`, `raw-token`,
`expanded-token`. Code Graph applies the symbol-category limit before suppression.
Suppression compares only the `selectionRange` of symbol groups that remain visible;
a symbol omitted by the limit does not hide its source occurrence. Calls, comments,
strings, and other matches inside a visible symbol's complete construct range remain.

`SourceFileSearchResult` groups ordered `SourceContentMatch` values under one canonical
file and reports `totalMatches` plus `omittedMatches` from the complete visible match
set. After suppression, general and wildcard searches order occurrences by
`full-query`, `raw-token`, and `expanded-token`, then by source range inside each tier;
only then do they retain ten occurrences per file. An exact canonical,
config-relative, or absolute file selector is normalized by Code Graph, retains every
occurrence, and orders the exhaustive result by source range for file inspection.
Symbol groups keep every public binding for structured discovery
and separately identify only the bindings directly matched by the query. The public
semantic tiers reserve declaration matches for proven logical targets; a case-exact
targetless hit is reported as `exact-local-symbol` after logical-component matches.
The result exposes curated semantic/search contracts; backend candidate
pages, cursors, and trigram details remain internal Store concerns. Search remains a
discovery API and does not itself prove resolution.

An exact canonical logical ID is also a direct semantic candidate, including for a
non-exported target with no text hit. For source files, Code Graph consumes the complete
stable candidate cursor, applies suppression and final semantic scoring to every visible
file, and only then applies the requested file limit; an earlier weak page therefore
cannot hide a later full-query match.

Impact selector resolution is a separate exact operation. It returns `resolved`,
`ambiguous`, or `missing`; bare names try case-sensitive exact lookup and then
case-insensitive exact lookup only when necessary. Ambiguity is sorted, capped at ten
displayed candidates with a total count, and never initiates traversal. Prefix and
substring discovery results cannot become impact targets.

## File-impact coverage

File and multi-file impact include ordered `coveringSpecs`. Code Graph batches reverse
file and symbol coverage, assigns each affected resource its shallowest traversal
depth, and folds one spec with its minimum depth and distinct evidence. Depth zero is
direct coverage; larger depths are blast-radius coverage. File-only evidence remains
valid when no `COVERS_SYMBOL` relation exists.

## Coverage, health, and repair

Indexing persists an `IndexCoverage` outcome for every considered source target:
`indexed`, `excluded`, `unsupported`, `parse-failed`, or `partial`, with content hash,
reason, and adapter capabilities. It also persists generation-tagged observations for
files, documents, aggregate specs, and repository inputs.

Health assesses graph-visible inputs by workspace and reports mode, state, latch, and
stable reasons:

- `vcs` groups workspaces by repository and evaluates normalized visible staged,
  unstaged, untracked, deleted, and rename-side changes once
- `filesystem` uses persisted membership and mtime/size stamps, hashing only changed
  stamps and refreshing equal-content metadata
- `hybrid` adds filesystem observation for configured inputs outside VCS-ignore
  visibility

Graph exclusions, workspace allowed paths, gitignore policy, and explicit input
channels share one visibility service. Excluded-only changes do not stale a workspace.
States use stale-over-unknown-over-current precedence. Stale workspace and aggregate
latches are monotonic within a generation and clear only after successful indexing;
unknown transient failures remain retryable. Targeted reference assessment reads only
the addressed file or public surface plus every declaration file contributing to a candidate,
in one deduplicated batch. Absence becomes `missing` only with current complete
evidence and otherwise remains `unresolved`. Aggregate health reads persisted coverage
counts by status. Indexed, excluded, and explicitly unsupported targets are terminal
aggregate outcomes; parse-failed or partial evidence makes the aggregate proof boundary
non-current instead of inferring completeness from an index timestamp. Targeted
resolution still retains the exact excluded or unsupported outcome for its addressed file.
Discovery, metadata, read, or hashing failures are unknown evidence, not content
differences: health reports `CONTENT_UNKNOWN` and does not set stale latches unless an
independent proven mismatch exists.

Derivation fingerprints include normalized content hashes for package/build inputs
such as package/tsconfig, Python project, Go module/workspace, and Composer manifests.
Changing one therefore invalidates resolution evidence even when source files do not.

## Bulk indexing

One `IndexWriteSession` owns each index generation. Indexing prebuilds lookup maps,
writes bounded chunks of nodes, facts, observations, and deduplicated relations,
validates endpoints in batches, rebuilds semantic and source-content indexes once,
then atomically commits. Failure rolls back the session and leaves the prior
generation readable; no partially indexed state or prematurely cleared freshness
latch is exposed.

`IndexResult.phaseMetrics` reports counts and elapsed milliseconds for import
resolution, dependency facts, adapter relations, re-exports, hierarchy/overrides,
persistence, and the final search-index rebuild. Coverage hashes participate in the
incremental diff even for non-text targets without File/Document nodes. A fully
unchanged run processes no files, constructs no relations, and skips the FTS rebuild.
Matching persisted mtime/size observations reuse the indexed content hash; a stamp
change triggers hashing, and equal content remains skipped after the observation refresh.
When content changes, the indexer hydrates unchanged persisted symbols and reference
facts, then re-extracts only the changed target and its transitive importer, dependency,
hierarchy, and public-route closure. Unrelated files are not parsed. Persistence timing
includes only non-search transactional work; search-index timing is zero when no rebuild
is requested.

Normal provider `open()` is read-only with respect to incompatible storage. The
indexing-specific lifecycle may recreate derived storage, rotate its generation,
re-extract sources, and rebuild search indexes. `IndexResult.fullRebuild` and
`IndexResult.fullRebuildReason` explain that recovery directly. Long-lived providers opened against the old generation must
close and reopen.

SQLite and Ladybug persist and query semantic identity through structured workspace,
surface, name, space, owner, member-form, and exported-name fields rather than parsing
serialized canonical ids. Both backends version these physical/index contracts;
opening a previous version for normal reads is incompatible, while `graph index`
owns generation rotation and a full rebuild.

Code Graph does not read or mutate change implementation tracking. The
[SDK](../sdk/index.md) combines raw Core tracking with these APIs; delivery hosts only
render that projection.

- [Use cases](./use-cases.md)
- [Services](./services.md)
