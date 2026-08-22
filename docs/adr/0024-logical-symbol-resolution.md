---
status: accepted
date: 2026-07-29
decision-makers: specd maintainer
consulted: '-'
informed: '-'
---

# ADR-0024: Logical Symbol Resolution

## Context and Problem Statement

Implementation links, symbol search, and impact analysis addressed syntax-level
declarations by location and name. That model could not reliably distinguish a public
export from its implementation, preserve alias and re-export routes, group overloads
or merged declarations, or prove inherited members. Delivery code consequently grew
fallback matching rules, and incomplete graph evidence could be mistaken for a
deleted symbol.

The graph needs one multi-language reference model that remains deterministic across
backends, preserves public routes, and reports uncertainty without guessing.

## Decision Drivers

- **Conservative correctness** — absence is stale only when current, complete coverage
  proves it
- **Stable semantic identity** — source movement must not change the logical target
- **Public-route precision** — an exported binding and its canonical implementation
  require distinct impact views
- **Cross-language consistency** — adapters provide language facts while shared graph
  services own resolution policy
- **Dependency direction** — Core must remain independent of Code Graph
- **Recoverability** — incompatible derived data must be rebuilt from source
- **One search policy** — semantic and source-content results must share ranking,
  filtering, range, grouping, and suppression rules
- **Scoped freshness** — VCS, non-VCS, and hybrid workspaces must assess only graph-
  visible indexed inputs and remain monotonic until a successful index
- **Bounded indexing** — derived facts must be committed atomically without per-
  relation Store round trips

## Considered Options

1. Continue location/name matching in each CLI consumer
2. Canonicalize every reference directly to a declaration and discard its route
3. Add first-class logical symbols and bindings with conservative shared resolution

## Decision Outcome

Chosen option: **"Add first-class logical symbols and bindings with conservative
shared resolution"**, because it provides one evidence-based policy without erasing
the public or lexical route by which a target is reached.

### The rule

- A **declaration occurrence** keeps the existing location-backed graph identity.
- A **logical symbol** identifies the semantic target from structured workspace,
  surface, owner, symbol-space, name, and member-form fields. Its canonical reference
  is delimiter-safe, round-trippable, case-preserving, and independent of source
  ranges.
- **Public bindings** and **local bindings** are first-class identities. They retain
  aliases, scopes, shadowing, anonymous/default exports, and ordered provenance rather
  than relying only on relation metadata.
- Resolution uses exact declarations, exact public bindings, scoped local bindings,
  and deterministic hierarchy paths in that order. It returns `resolved` only for one
  proven target, `ambiguous` for competing targets, `unresolved` when evidence is
  unsafe or incomplete, and `missing` only when current complete coverage proves
  absence. No fuzzy or same-name fallback selects a candidate.
- Built-in language adapters derive logical declaring owners from their syntax and
  advertise hierarchy support only when they emit matching ordered hierarchy and
  provenance facts. Shared helpers construct owner identities before members and
  translate syntax-level or imported relations without making build-dependent guesses.
- Code Graph owns logical identity, binding facts, coverage, resolution, and public
  versus canonical impact. SDK owns cross-package orchestration. Core stores and
  returns raw implementation tracking without a graph dependency. CLI supplies
  selectors and presents SDK/Code Graph results without matching policy.
- Code Graph also owns the unified search plan. One provider request selects symbols,
  source files, specs, and documents; applies category/path/workspace filters; ranks
  semantic candidates before generic content; locates exact half-open source ranges;
  and suppresses only a declaration-name occurrence already represented by a symbol.
  Whole declaration bodies are never suppressed because calls, strings, comments, and
  body text remain valid source matches.
- Search ranks case-exact structured names and exported names before normalized,
  prefix, component, and content lanes. Text output presents matched public exports
  and declarations without serialized canonical ids; structured output retains the
  complete identity and all routes. General source results keep ten occurrences per
  file with total/omitted counts, while an exact normalized file selector is exhaustive.
  Exact canonical IDs enter the semantic result set directly, and source-file ranking
  consumes all stable backend candidate pages before applying the final file limit.
- Symbol impact uses a distinct exact selector result: resolved, ambiguous, or missing.
  Bare names try case-exact lookup before case-insensitive exact fallback, never widen
  to prefixes, and never traverse an ambiguous candidate set.
- `--files` selects the source-file category. `--file <pattern>` is only a path filter
  over the selected categories. The CLI neither performs category searches separately
  nor merges, ranks, deduplicates, or refills result pages.
- File impact includes covering-spec evidence computed by Code Graph from both
  `COVERS_FILE` and `COVERS_SYMBOL` relations. One spec is retained at its shallowest
  direct or blast-radius depth with ordered, deduplicated evidence.
- Freshness is derived from persisted observations of graph-visible indexed inputs.
  VCS mode evaluates normalized visible repository changes once per repository;
  filesystem mode compares stamps and hashes without requiring VCS; hybrid mode adds
  filesystem membership when configured graph visibility extends beyond VCS-ignore
  visibility. Excluded-only changes do not stale the graph.
- Workspace and aggregate stale latches are monotonic for a storage generation: stale
  dominates unknown, which dominates current, and only a successful indexing commit
  clears stale state. Targeted resolution assesses the addressed file or public surface
  rather than scanning every input. A missing symbol or export is reported as `missing` only after current,
  complete evidence proves absence; stale, unknown, or partial evidence stays
  `unresolved`. Content discovery and read failures remain unknown and cannot set a
  stale latch without independent mismatch evidence.
- Indexing writes nodes, facts, observations, and relations through one bulk session.
  Backends validate endpoints in batches, write bounded chunks, deduplicate relations,
  rebuild semantic and source search indexes once, and atomically commit one
  generation. Failure rolls the generation back without exposing partial data.
- Normal graph reads never repair storage. When schema, derivation, or generation is
  incompatible, indexing recreates the derived store, rotates its generation, and
  re-extracts source facts. User-authored manifests and implementation links are not
  rewritten.
- SQLite queries structured semantic columns and rebuilds its
  versioned semantic indexes; canonical ids are external identities, not strings to
  parse for ranking.

### Consequences

- Good, because aliases, overloads, merged declarations, members, and public routes
  retain their distinct meaning
- Good, because implementation review, search, and impact share deterministic
  resolution semantics
- Good, because incomplete coverage produces actionable uncertainty instead of false
  stale diagnostics
- Good, because package ownership preserves the Core → Code Graph/SDK → CLI dependency
  direction
- Good, because all hosts receive identical search ordering, source ranges, covering
  specs, and freshness decisions
- Good, because targeted assessment and one bulk transaction bound filesystem, Store,
  and search-index work
- Neutral, because structured output gains additive targets, paths, candidates,
  coverage, and health fields
- Bad, because persistence, indexing, adapters, and backend contract tests become more
  complex
- Bad, because incompatible graph upgrades require a potentially expensive full
  reindex
- Bad, because dynamic or runtime-only behavior intentionally remains unresolved

### Confirmation

This decision is confirmed when:

- canonical references round-trip and remain stable after source-range movement
- parallel public routes and scoped aliases persist without collapsing
- ambiguous, unsupported, partial, dirty, and runtime-only cases never become guessed
  resolutions
- export impact exposes separate binding and canonical views
- SDK implementation review reads Core once, uses one graph lifecycle and one batch
  resolution, and does not mutate stored links
- incompatible graph storage rejects normal reads and `graph index` reports the full
  rebuild reason after recreating it
- unified search returns four ordered categories from one provider request, preserves
  exact occurrence and optional snippet ranges, and refills limits after declaration-
  name suppression
- VCS, filesystem, and hybrid freshness ignore non-visible changes and retain stale
  state until a successful bulk index
- file impact presents direct and blast-radius covering-spec evidence without extra
  CLI queries
- one indexing session commits one generation and rebuilds each search index once

## Pros and Cons of the Options

### Continue location/name matching in each CLI consumer

- Good, because it requires little shared infrastructure
- Bad, because resolution differs by command and delivery adapter
- Bad, because re-exports, aliases, hierarchy, and merged declarations cannot be
  proven consistently
- Bad, because a same-name fallback can create false resolved or stale outcomes

### Canonicalize every reference directly to a declaration

- Good, because canonical traversal and deduplication are simple
- Bad, because consumers of one public export cannot be separated from all consumers
  of the implementation
- Bad, because alias and re-export provenance is lost
- Bad, because relation deduplication can collapse distinct public routes

### Add first-class logical symbols and bindings with conservative shared resolution

- Good, because semantic identity and syntax locations coexist
- Good, because exact binding impact and canonical implementation impact remain
  independently queryable
- Good, because one evidence policy works across implementation review, search, and
  impact
- Bad, because adapters must declare capabilities and emit more structured facts
- Bad, because derived stores require new indexed structures and rebuild handling

### Rejected follow-up placements and algorithms

- **CLI-orchestrated search** was rejected because category-specific calls make ranking,
  post-suppression limits, and output semantics delivery-dependent.
- **All-file health scans** were rejected because unchanged stamps, VCS-visible diffs,
  repository grouping, and targeted observations allow bounded assessment.
- **Whole-body source suppression** was rejected because a declaration construct can
  legitimately contain calls, strings, comments, and other searchable occurrences.
- **Per-relation Store validation and writes** were rejected because they create
  unbounded query counts and repeated search-index maintenance during reindexing.

## More Information

## Amendment — Ladybug ownership transfer (2026-08-20)

Ladybug-specific graph-store implementation, native integration, tests, and
normative requirements moved to the source-preservation repository
`specd-plugin-graphstore-ladybug`. SQLite is the sole integrated backend in
SpecD. The external repository is not a runtime plugin: stable plugin loading
and a public `GraphStore` contract remain deferred to a dedicated change.

### Spec

- [`code-graph:symbol-model`](../../specs/code-graph/symbol-model/spec.md)
- [`code-graph:resolve-symbol-reference`](../../specs/code-graph/resolve-symbol-reference/spec.md)
- [`sdk:build-implementation-review`](../../specs/sdk/build-implementation-review/spec.md)
