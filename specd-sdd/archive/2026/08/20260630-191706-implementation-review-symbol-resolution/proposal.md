# Proposal: implementation-review-symbol-resolution

## Motivation

Implementation links, symbol search, and impact analysis cannot currently identify
owner-qualified members, public exports, aliases, and inherited members with consistent
semantics. File impact also omits the specs that cover its target and affected graph
resources, while graph search cannot return arbitrary source-content matches without
falling back to an external filesystem scan. The result is false missing-symbol
diagnostics, incomplete blast-radius reports, duplicate semantic/text hits, and a
disconnected requirement view even when the graph is fresh.

This change establishes one conservative, language-agnostic reference model before
more consumers build on the current flat symbol names and file-local heuristics. It
also makes GitHub issues #58 and #52 explicit completion criteria rather than leaving
their remaining cases distributed across unrelated follow-up work.

## Current behaviour

Implementation review starts from Core's persisted file and symbol strings, then the
CLI enriches them by querying the graph. The CLI currently owns matching policy: it
tries the exact symbol in the stored file and, for composed strings such as `X.Y`,
`X#Y`, or `X::Y`, may retry the rightmost segment in that same file. This behavior:

- cannot follow a symbol through a barrel or package re-export;
- cannot distinguish a public export name from the canonical definition it exposes;
- cannot reliably address interface properties, accessors, fields, constructors,
  static members, or other member forms not represented by the current broad
  `SymbolKind`;
- cannot resolve a member inherited from a base type, interface, mixin, trait, or
  embedded type;
- may confuse an imprecise link with a genuinely deleted or renamed symbol; and
- places cross-package orchestration and graph policy in a delivery adapter.

The graph currently gives `SymbolNode` a location-based internal id, a simple `name`,
a broad `kind`, and an optional parent id. `EXPORTS` relates a file to a symbol, while
hierarchy is represented by `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES`. Those facts are
useful but insufficient to address a public binding such as “name `X` exported from
this module”, preserve an alias chain, or distinguish member forms sharing the same
owner-qualified name.

This also makes impact queries semantically misleading. File impact on a barrel may
have no dependents while the underlying definition has critical dependents. Conversely,
asking for the impact of one public export should not silently mean “all uses of the
underlying symbol through every public and private route”.

File impact already traverses symbols and imports, and the store already exposes reverse
`COVERS_FILE` and `COVERS_SYMBOL` lookups, but `FileImpactResult` and
`graph impact --file` do not project those links. Users therefore cannot see which
requirements cover the changed input or the wider blast radius. The existing reverse
lookups are singular, so calling one for every affected file and symbol would also add
an avoidable N+1 query pattern to a command that can return large result sets.

Indexed source files already retain their content, but the graph exposes search only
for symbols, specs, and documents. Symbol search indexes names and comments rather than
arbitrary code, so strings, comments, and other non-symbol text require `rg` or another
out-of-band scan. Conversely, naively adding whole-file snippets would duplicate a
symbol result such as `analyzeFileImpact`. Current symbol nodes persist only a start
line/column even though built-in parsers know the complete construct and declared-name
ranges, and current search `startLine`/`endLine` fields describe snippet windows rather
than symbol extent.

Dependency extraction has improved since issue #52 was opened: literal dynamic
imports, side-effect imports, scoped bindings, construction/type edges, and baseline
hierarchy edges exist. Coverage remains uneven around TypeScript project aliases,
real Python package layouts, Go package/member resolution, public binding provenance,
and hierarchy-aware member dispatch. The change must retain the completed cases while
closing the remaining deterministic gaps.

Implementation review found six remaining correctness gaps in the completed code:
built-in adapters derive member owners from absent or syntax-level `parentId` values
and advertise hierarchy support without emitting resolver evidence; exact canonical-id
search can discard a non-exported logical target; file-result pagination can apply the
limit before final semantic ranking; absence checks ignore an addressed public surface;
and graph-health inspection failures are misclassified as dirty instead of unknown.

## Proposed solution

### Outcome and ownership

Introduce a single Code Graph symbol-reference capability used by implementation
review, search, and impact:

- `@specd/code-graph` owns symbol identity, public/local binding facts, deterministic
  resolution, hierarchy-aware traversal, and resolution provenance.
- `@specd/sdk` owns the host workflow that combines Core's raw implementation review,
  canonical graph health, and Code Graph reference resolution.
- `@specd/core` remains the delivery- and graph-agnostic source of persisted
  implementation tracking. It does not acquire a Code Graph dependency.
- `@specd/cli` supplies selectors and renders SDK/Code Graph results. It does not
  implement fallback matching or open a parallel Core + Code Graph orchestration path.

The general language-adapter spec owns the shared port, capability, fact vocabulary,
determinism, unsupported-coverage, and third-party-adapter contract. Each built-in
`*-language-adapter` receives a complete language-specific spec covering its syntax,
identity rules, imports and bindings, owners and member forms, hierarchy/provenance,
relations, ranges, package/build context, unsupported cases, and failure behavior.
An adapter may advertise a capability only when its emitted facts can prove it.

### Reference vocabulary

The downstream specs SHALL use these concepts consistently:

- **Declaration occurrence**: one syntax-level declaration with a source range and the
  existing location-based graph id.
- **Logical symbol**: the language-defined semantic symbol formed by one or more
  declaration occurrences. TypeScript overload sets/declaration merging and equivalent
  language constructs are one logical symbol when the language says they are; genuinely
  competing declarations are separate candidates.
- **Canonical target**: the resolved logical symbol and all declaration occurrences
  that contribute to it. A target is not reduced to an arbitrarily selected overload.
- **Canonical reference**: a stable, human-facing selector rendered from structured
  workspace, module/package, declaring scope/owner, symbol space, simple name, and
  member form fields. Structured fields are authoritative; the rendered form has an
  escaping and round-trip contract and is not parsed by ad hoc delimiter splitting.
  “Stable” means independent of line/column movement; it does not survive an
  intentional owner/name rename as though nothing changed.
- **Symbol space**: the language-normalized namespace in which a name is looked up,
  such as value, type, namespace/module, function, or constant. The model preserves
  language distinctions such as TypeScript type/value merging and PHP class/function/
  constant lookup rather than assuming one global namespace.
- **Member form**: the language-normalized distinction needed to disambiguate methods,
  properties, getters, setters, constructors, fields, static methods/properties,
  interface/contract members, and equivalent supported forms.
- **Public binding**: a first-class addressable identity formed by public surface,
  exported name, and symbol space. It records its canonical target and any statically
  proven re-export chain. Two aliases or routes between the same graph endpoints remain
  distinct bindings and MUST NOT collapse because relation equality ignores metadata.
- **Local binding**: a scoped import or alias name used inside a consumer. It may
  resolve to a canonical symbol but is not thereby a public export. Its identity and
  provenance include lexical scope and source range so shadowed aliases do not merge.
- **Resolution path**: ordered evidence from the requested reference to the canonical
  symbol, such as direct definition, local alias, public export, re-export,
  inheritance, override, trait adaptation, or embedding.

The canonical reference is an additive semantic identity and lookup key. This change
does not require replacing the existing location-based `SymbolNode.id`, nor migrating
stored implementation-link strings to graph ids. Identifier comparison, case
sensitivity, and normalization follow the source language; workspace/path
normalization is a separate concern and no resolver globally lowercases symbol names.
Anonymous/default exports receive an addressable public-binding identity even when
their canonical declaration has no user-written simple name.

### Resolution contract

Resolution accepts a structured target context: workspace, optional intended file or
public surface, requested symbol/member text, and optional symbol-space, kind, or
member-form constraint. It returns the original request, graph health and index
coverage, one status, zero or one logical canonical target, its declaration
occurrences, candidate summaries when applicable, and the complete proven resolution
path. Stable machine-readable reason codes accompany non-resolved outcomes; prose is
presentation-only.

The statuses have the following exclusive meanings:

| Status       | Meaning                                                                                                                                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolved`   | Exactly one target is proven by an exact declaration, static local binding, static public export/re-export chain, or deterministic hierarchy path.                                                                                                                              |
| `ambiguous`  | More than one valid target remains after applying scope, member form, language precedence, and resolution evidence. No candidate is selected.                                                                                                                                   |
| `unresolved` | The reference is plausible but cannot be proven safely, including graph-not-current, partial/excluded/unsupported coverage, parse failure, insufficient qualification, missing build context, a unique same-name candidate without a connecting path, or runtime-only behavior. |
| `missing`    | A current, complete graph proves that the referenced file/public surface is gone, or that no declaration/binding compatible with the requested name, symbol space, and form exists in a successfully indexed target.                                                            |

Graph freshness, index coverage, and link status are separate. A matching VCS ref is
not sufficient when tracked or untracked working-tree content differs from the indexed
content. Canonical health must expose current-content freshness; at minimum the
resolver verifies the addressed file's persisted content hash against disk before
declaring absence. When health is unknown, VCS-stale, dirty/fingerprint-mismatched, or
the relevant file/package was excluded, unsupported, partially indexed, or failed
parsing, the resolver MUST NOT declare `missing`; it returns `unresolved` with a specific
reason. Index coverage/error facts required to make that decision must remain
queryable after indexing rather than existing only in the transient index command
result. Provider availability/generation errors that prevent safe reads continue to
propagate as infrastructure errors instead of being disguised as per-link outcomes.
Likewise, a unique same-name symbol elsewhere in the workspace does not become
`resolved` without a static path from the requested context.

Resolution precedence is deterministic:

1. exact declaration in the explicitly addressed owner/file, constrained by member
   form when supplied;
2. exact public binding in the explicitly addressed public surface;
3. statically proven scoped alias/import binding;
4. statically proven inheritance, interface, override, trait, mixin, or embedding path
   using the language's own precedence rules;
5. otherwise `ambiguous`, `unresolved`, or `missing` according to the table above.

Simple-name workspace search may supply diagnostics and candidates, but never proves
resolution by name alone. Cyclic export/alias/hierarchy paths terminate safely and do
not create duplicate candidates. Candidate and provenance ordering is stable across
backends and runs. Conditional/platform alternatives remain separate candidates unless
the caller supplies a build/runtime context that deterministically selects one.
Language constructs that intentionally combine declarations into one logical symbol
do not become `ambiguous` merely because they have multiple declaration occurrences.

### Public export and impact semantics

Public bindings are first-class query targets even when they ultimately reference an
existing canonical symbol rather than introducing a new declaration node.
Import, call, and re-export facts must retain enough binding provenance to prove which
public surface/name a consumer used; canonicalizing every edge directly to the
definition and discarding that route is insufficient for export-specific impact.

The CLI impact contract gains an explicit export target family:

```text
specd graph impact --export <public-name> --from <file-or-public-surface>
```

It is mutually exclusive with the existing file, symbol, and spec target families.
`--export` without `--from`, or `--from` without `--export`, is a usage error.

An export-target result reports two separate views:

1. **Public-binding impact**: consumers that reach the canonical symbol through that
   exact exported name and public surface, including statically proven downstream
   re-export chains.
2. **Canonical-symbol impact**: all known dependents of the underlying symbol,
   regardless of whether they use this export, another alias/export, a direct
   definition import, or a hierarchy relation.

The selected public binding, canonical target, and binding chain appear in text and
structured output. A normal `--symbol` query continues to mean canonical-symbol
impact. An export-star or equivalent construct that exposes multiple compatible
targets remains `ambiguous`; the command does not merge unrelated candidates and call
that one export.

File impact additionally projects reverse requirement coverage for the input file and
its defined symbols at depth `0`, and for files and symbols reached through the selected
blast-radius direction at depth `1..maxDepth`. `FileImpactResult.coveringSpecs` is a
deterministically ordered, spec-deduplicated collection. Each entry retains its minimum
impact depth and every distinct evidence item:

```ts
interface CoveringSpecImpact {
  readonly specId: string
  readonly minDepth: number
  readonly evidence: readonly {
    readonly kind: 'file' | 'symbol'
    readonly target: string
    readonly depth: number
  }[]
}
```

This structure distinguishes direct target coverage from blast-radius coverage without
duplicating a lossy flat list. Multi-file impact aggregates the same evidence across all
input targets; every input file and its defined symbols remain depth `0`. File coverage
is independently useful when no `COVERS_SYMBOL` relations exist, while symbol evidence
is included whenever such relations are present. Reverse coverage lookup is batched for
the deduplicated file and symbol sets rather than queried once per result.

Text output groups direct target coverage separately from blast-radius coverage.
JSON/TOON exposes the structured entries and evidence unchanged. Existing graph-health
warnings remain authoritative for whether the indexed coverage projection is globally
complete; traversal itself remains a read-only projection of the open graph store.

Search matches both simple names and canonical owner-qualified references. Symbol
results expose symbol space, member form, contributing declarations, and every public
binding summary so a user can discover the exact `--symbol` or `--export` target
without treating a re-export alias as a separate implementation. Results group
bindings under their logical canonical target while preserving each independently
addressable binding and route; no binding is lost or double-counted.

Canonical identifiers remain stable external identities in structured JSON/TOON and
provider results, but are not the primary human-facing text. Text output shows the
real declaration location. When the query matched a public export or barrel alias, it
shows the project/config-relative matched-export path and exported name followed by
the underlying declaration location. Other public bindings are summarized rather than
dumped by default. This avoids presenting a serialized canonical key as though it were
a directly reusable file or impact selector.

Unqualified symbol discovery uses two independent candidate lanes before grouping
and limiting: a semantic lane over logical symbols, public bindings, declarations,
owner-qualified identities, and structural identity components; and the existing
backend full-text/raw-symbol lane for local symbols, snippets, and broader textual
discovery. The merged order is exact logical identity, exact public binding, exact
declaration with matching case, exact declaration after language-appropriate case
normalization, logical prefix/component match, exact local symbol, then textual
relevance. Backend-native relevance orders candidates only within the same semantic
tier.

Exact case-sensitive name matches precede case-normalized, prefix, component, and
textual matches. Every non-exact result exposes its match tier so a prefix such as
`ValidateArtifact` matching `ValidateArtifacts` cannot be mistaken for an exact
declaration. Symbol impact does not reuse discovery's prefix or textual widening:
an unqualified selector first considers case-exact names, then case-insensitive exact
names only when no case-exact candidate exists. One exact candidate is selected;
multiple exact candidates produce a bounded ambiguity response rather than traversing
or merging hundreds of same-name nodes. Qualified and full occurrence selectors keep
their existing deterministic forms.

The requested limit is applied after logical grouping and lane merging, so common
locals cannot crowd a stronger logical result out of the response. Structured output
exposes a stable match tier and match reasons. Existing explicit kind, workspace, and
path filters remain authoritative. Searching `Change`, for example, must rank the
`Change` domain declaration before CLI/test variables or helper functions named
`change`, while `--kind variable` continues to expose those values.

### Source-content search and result orchestration

Code Graph adds a distinct `files` result category for arbitrary text in indexed source
content. The default search combines `symbols`, `files`, `specs`, and `documents`;
`--files` selects only source-content results, while the existing `--file <pattern>`
remains a path filter.

A Code Graph application use case owns the complete search. It constructs one shared
query plan, requests backend candidate lanes, merges semantic symbol identity, locates
precise source occurrences, removes duplicate file matches, ranks and groups every
category, and applies limits only after those operations. The CLI makes one provider
call with the requested categories and only renders the returned projection. Store
methods remain backend-neutral candidate primitives and MUST NOT duplicate orchestration
or result-merging policy.

The shared query plan reuses `expandSearchQuery`: it preserves the normalized complete
query, whitespace-delimited raw terms, and separator/CamelCase-expanded components.
Ranking prefers a contiguous complete-query match, then candidates containing all raw
terms, individual raw-term matches, and finally expanded-component-only matches.
Backends use a substring-capable trigram/n-gram source-content index to shortlist files
and a defined short-query fallback; Code Graph verifies candidate content to produce
exact occurrence ranges rather than treating an FTS snippet window as match evidence.

`SymbolNode` retains its existing location identity and adds the complete syntactic
construct range plus the exact declared-name `selectionRange`, both with start/end line
and column. File results group one or more precise content matches, record whether each
match came from the complete query, a raw term, or an expanded term, and include snippet
content only when requested.

Deduplication operates per occurrence. A file-content match is removed only when it
overlaps the `selectionRange` of a symbol result representing that same query match.
Being inside a function/class body is not sufficient: strings, comments, calls, and
other non-symbol occurrences remain visible. A file result disappears only when every
one of its matches was removed. File-category limits are applied after this suppression,
so duplicates do not consume result slots.

General and wildcard-path searches return at most ten visible content occurrences per
file and expose `totalMatches` and `omittedMatches` after symbol-overlap suppression.
Text renders the retained occurrences followed by `N more matches in this file` when
applicable. An exact single-file selector returns all occurrences. The exact selector
accepts the same canonical workspace-relative, config/project-relative, and absolute
path forms as file impact; wildcard selectors retain pattern semantics. Code Graph
normalizes and resolves these forms before querying candidate stores. The CLI only
passes the selector and renders the resulting projection.

### Structured persistence and lookup

Rendered canonical identifiers are compatibility-preserving external keys, not an
internal search corpus. Logical-symbol, declaration, binding, selector-resolution,
and ranking queries operate on structured persisted fields such as workspace, surface,
name, symbol space, owner, and member form. Backends must not derive lookup semantics
with substring, case-folding, or delimiter parsing over serialized canonical ids.

SQLite persists and indexes the structured columns required by those queries and may
use backend-local integer row identities for joins where that improves the physical
model without changing public ids. Ladybug stores equivalent structured properties
and indexes. Both backends expose identical case precedence, ambiguity, ranking,
binding provenance, exact-path normalization, and file-match counts through shared
contract tests. Canonical ids remain unique and round-trippable at the provider
boundary.

### Hierarchy and member semantics

Owner-qualified lookup first checks members declared by the requested owner. If none
matches, it follows only deterministic hierarchy facts:

- a locally declared/overriding member takes precedence over inherited members;
- `Interface.member` or an equivalent contract reference resolves to the contract
  member itself, while impact follows implementations and overrides;
- `Derived.member` may resolve to the inherited canonical declaration when no local
  declaration overrides it;
- multiple inheritance, mixins, traits, or embeddings use the source language's
  explicit precedence/adaptation rules;
- competing inherited candidates without a deterministic winner are `ambiguous`;
- getter/setter pairs or other same-name forms require a form constraint when the
  requested text alone cannot identify one;
- implicit relations, such as Go interface satisfaction, are emitted or traversed only
  when the relevant method sets make the relationship statically demonstrable;
- override direction is preserved explicitly, abstract/default contract members obey
  language precedence, and malformed hierarchy cycles terminate without a guessed
  winner; and
- generic specialization does not manufacture duplicate logical symbols unless the
  source language defines distinct addressable declarations.

Hierarchy affects both resolution and blast radius. Changing a contract member,
inherited declaration, override, trait member, or promoted member must reach the
deterministically related implementations/consumers through normalized graph
relations; it must not be approximated by global same-name matching.

### Built-in language matrix

All built-in adapters emit the common facts, but each retains its actual semantics:

| Language              | Public/local binding coverage                                                                                                                                                                                                                                                                                                                      | Hierarchy/member coverage                                                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript/JavaScript | named/default/namespace exports, static re-exports and barrels, `export *`, type-only bindings, CommonJS exports, static imports, literal `import()`, literal `require()`, side-effect imports, `tsconfig` inheritance/references and `baseUrl`/`paths`, package `exports`/`imports`, declaration files, and deterministic ESM/CommonJS conditions | classes, interfaces, declaration merging/augmentation, overload sets, accessors, fields, static/instance members, `extends`, `implements`, overrides, namespace/member calls |
| Python                | `import`, `from ... import`, aliases, package `__init__.py` exposure, statically determinable `__all__`, literal `importlib.import_module()`/`__import__()`, `.pyi`, `src/`, submodule, regular-package, and namespace-package layouts                                                                                                             | class members, properties/descriptors when statically declared, `self`/`cls`/`super`, overrides, multiple inheritance, deterministic MRO, and mixins                         |
| Go                    | package-qualified public declarations, standard/aliased/dot/blank imports, `go.mod`/workspace/replace resolution, build-context-aware package selection, selectors, and local package aliases; capitalization/internal-package visibility apply and Go visibility is not modelled as a JavaScript-style re-export chain                            | pointer/value receiver method sets, interfaces when satisfaction is provable, embedding, promoted methods, explicit-member precedence, and ambiguous promotions              |
| PHP                   | namespace-qualified declarations, `use X as Y` and group-use aliases in their class/function/constant spaces, Composer PSR-4/classmap/files resolution, and existing literal/framework loader facts; `use` is not inheritance or a public re-export                                                                                                | classes/interfaces, `extends`, `implements`, overrides, traits, trait aliases, and deterministic `insteadof`/adaptation precedence                                           |

Package-manager files, project configuration, build tags, and conditional export
branches are deterministic inputs only when present and supported. Unsupported
conditions or an absent caller build context yield `unresolved`/`ambiguous` rather
than selecting the host machine's incidental configuration.

Third-party adapters participate through the same emitted fact contract and declare
their binding, hierarchy, member, package-resolution, and build-context capabilities.
A missing adapter capability is reported as unsupported coverage; the generic resolver
does not guess or require adapter-specific branches.

Non-literal dynamic imports, reflection, monkey patching, runtime container identifiers,
runtime-computed aliases, and interprocedural value flow remain outside the
deterministic boundary. They produce no speculative persisted relation and resolve as
`unresolved` when encountered as a query target.

### Implementation review behavior

The SDK workflow obtains Core's raw review, opens the graph through the shared SDK
lifecycle helper, obtains freshness/coverage through the canonical graph-health use
case, and resolves symbol-level links without mutation. It uses a batch resolver
contract so one review does not perform one full graph scan per link.

Each reviewed link retains its stored spec/file/symbol values and gains a structured
resolution projection. `list`, `review`, and change-status presentations use that same
projection and therefore cannot disagree because of separate fallback implementations.
File-level links remain valid inputs and are not forced into symbol resolution.

`resolved`, `unresolved`, `ambiguous`, and `missing` remain review diagnostics. This
change does not make the mere presence of such diagnostics a new verification or
archive blocker, and it never rewrites active manifests or archived implementation
sidecars. The issue-closure gate below concerns whether the new behavior and its
verification matrix are complete, not whether a repository happens to contain zero
missing user-authored links.

Coverage links such as `COVERS_SYMBOL` resolve to logical-symbol identity rather than
an arbitrary declaration occurrence, so harmless source-range movement or overload
layout changes do not split coverage. Existing persisted user strings remain the
input; derived graph relations are rebuilt from them.

### Compatibility and exclusions

- Existing implementation-link storage and user-authored symbol strings remain valid
  inputs; no manifest or archived-sidecar migration is introduced.
- Persisted graph data is derived cache state. It is rebuilt rather than incrementally
  migrated when this change makes its physical or derivation format incompatible.
- The specd artifact schema is unrelated to Code Graph persistence. This change does
  not increment `@specd/schema-std`, change-manifest schema versions, or spec-lock
  schema identities.
- `CODE_GRAPH_VERSION` is the installed `@specd/code-graph` package semver, not a
  database schema number. The released package version for this feature must differ
  from the previous release so the existing project/workspace derivation fingerprints
  change. The exact semver is owned by the release process; no second duplicate
  package-version constant is introduced.
- Every built-in backend whose physical DDL changes must increment its own persisted
  schema version exactly once relative to the version current when implementation
  begins. With the versions observed during proposal review and no intervening change,
  this means SQLite `SQLITE_SCHEMA_VERSION` `5 -> 6` and Ladybug `SCHEMA_VERSION`
  `10 -> 11`.
- An incompatible backend schema must not be opened for normal reads as though it were
  current, and must not be silently replaced with an empty graph that appears valid.
  `graph index` is the repair path: it performs or requests a destructive full rebuild,
  reports schema/derivation incompatibility as the reason, and persists a fresh graph.
- Destructive schema recreation rotates the shared storage-generation marker so
  already-open providers fail as stale instead of continuing to serve the previous
  generation. Rebuilt full-text indexes must cover the new canonical/member/binding
  search fields before the store is considered ready.
- Every graph-store backend supported when this change is implemented must preserve
  and query the enriched fields consistently. A backend removed before implementation
  is not retained solely for this change; a backend still registered and supported is
  part of the compatibility matrix.
- Existing broad `SymbolKind` and CLI `--kind` behavior remain compatible. Symbol
  space, member form, logical identity, and declaration occurrences are additive
  dimensions; the implementation must not overload `kind` with incompatible meanings.
- Existing JSON/TOON fields remain additive where practical. New structured identity,
  health, coverage, reason-code, candidate, and provenance fields are versioned through
  the normal package/API compatibility policy, with deterministic ordering on every
  supported backend.
- Resolver, search, and traversal queries use indexed identity/binding lookups and
  cycle-safe bounded traversals. A conforming backend must not require loading or
  scanning the complete graph once per reference.
- No fuzzy-name, edit-distance, or “best candidate” auto-selection is introduced.
- Interactive suggestions or validation during `changes implementation add` remain
  outside scope.
- Runtime execution, language-server integration, type-checker integration, and
  whole-program/interprocedural inference remain outside scope.
- No new external runtime dependency is required by the proposal.

## Specs affected

### New specs

- `code-graph:resolve-symbol-reference`: Defines structured reference input, canonical
  targets, public/local binding resolution, hierarchy-aware precedence, statuses,
  candidates, provenance, addressed-file/public-surface freshness, and deterministic
  failure behavior.
  - Depends on: `code-graph:symbol-model`, `code-graph:graph-store`,
    `code-graph:language-adapter`, `code-graph:workspace-integration`
- `sdk:build-implementation-review`: Defines the delivery-neutral workflow combining
  Core implementation tracking, canonical graph health, provider lifecycle, and
  per-link symbol resolution.
  - Depends on: `sdk:host-context`, `sdk:with-open-graph-provider`,
    `core:get-implementation-review`, `code-graph:resolve-symbol-reference`,
    `code-graph:get-graph-health`
- `code-graph:typescript-language-adapter`: Complete TypeScript/JavaScript extraction
  contract for declarations, exports/imports, syntax-derived logical owners, members,
  hierarchy evidence, calls, ranges, module/build context, and unsupported constructs.
  - Depends on: `code-graph:language-adapter`, `code-graph:symbol-model`,
    `code-graph:workspace-integration`
- `code-graph:python-language-adapter`: Complete Python extraction contract for
  declarations, package/import aliases, syntax-derived owners, members, inheritance
  and MRO evidence, calls, ranges, package layouts, and unsupported runtime behavior.
  - Depends on: `code-graph:language-adapter`, `code-graph:symbol-model`,
    `code-graph:workspace-integration`
- `code-graph:go-language-adapter`: Complete Go extraction contract for packages,
  imports/selectors, receiver owners and method sets, embedding/promotion/interface
  evidence, calls, ranges, build context, and unsupported structural inference.
  - Depends on: `code-graph:language-adapter`, `code-graph:symbol-model`,
    `code-graph:workspace-integration`
- `code-graph:php-language-adapter`: Complete PHP extraction contract for namespaces,
  imports/aliases, declaring owners and member spaces, class/interface/trait hierarchy
  evidence, calls, ranges, Composer context, and unsupported dynamic behavior.
  - Depends on: `code-graph:language-adapter`, `code-graph:symbol-model`,
    `code-graph:workspace-integration`

### Modified specs

- `core:vcs-adapter-port`: Strengthens `modifiedFiles(baseRef)` as the
  backend-neutral source for repository content-diff fingerprints. Every concrete
  adapter must enumerate the complete repository-relative changed path set, including
  staged, unstaged, untracked, deleted, missing, and both sides of renames, without
  leaking backend-specific path or status behavior.
  - Depends on (added): none
  - Depends on (removed): none
- `core:vcs-implementation-detector`: Consumes the strengthened changed-path contract
  without dropping deleted or renamed implementation paths and preserves existing
  project-boundary and exclusion behavior.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:symbol-model`: Adds canonical references, owner/member-form vocabulary,
  normalized binding/provenance facts, complete construct and declared-name selection
  ranges, and the data needed to address public and inherited members without replacing
  internal location-based ids.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:language-adapter`: Retains the language-neutral adapter port and makes
  capability truthfulness, shared fact vocabulary, deterministic extraction,
  unsupported coverage, complete ranges, and third-party adapter obligations explicit;
  built-in language behavior moves into the four specific adapter specs.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:indexer`: Carries normalized member/public-binding facts through the
  two-pass session, persists per-file coverage/error facts atomically, resolves
  `COVERS_SYMBOL` against logical identity, and turns a detected schema/derivation
  incompatibility into a visible full-rebuild indexing path. Incremental indexing
  hydrates unchanged compact facts, recomputes only the affected dependency closure,
  builds relations with bounded work queues and indexes, carries symbol ranges and
  source content, and persists all chunks through one bulk session with one final
  semantic/source search-index rebuild.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:graph-store`: Persists, retrieves, filters, and searches canonical
  references, member forms, public bindings, and the edge metadata needed to derive
  resolution provenance consistently across supported backends; per-query resolution
  results remain derived rather than persisted. It also persists backend-neutral
  indexed-input observations and per-workspace/global freshness latches, exposes
  batch freshness, relation, reverse coverage, and source-content candidate operations,
  persists complete symbol ranges, and requires incompatible recreation to rotate
  storage generation.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:staleness-detection`: Clarifies that the installed Code Graph package
  version invalidates derivation fingerprints for this feature, keeps that concern
  separate from backend schema versions, owns current/stale/unknown assessment for
  indexed files, documents, specs, workspaces, and the aggregate graph, and reports
  schema/derivation rebuild reasons without treating an incompatible graph as fresh.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:sqlite-graph-store`: Adds the new physical symbol/binding/search fields,
  complete symbol ranges, a substring-capable source-content FTS index, indexed-input
  observations, freshness state, and set-based bulk relation writes; advances
  `SQLITE_SCHEMA_VERSION`, rejects incompatible normal reads, and rebuilds through the
  generation-rotating repair path.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:ladybug-graph-store`: Applies the equivalent DDL, structured identity
  properties/indexes, schema-version, symbol-range/source-content search,
  observation/freshness state, single-session bulk write, generation, selector
  precedence, and rebuild behavior. Ladybug remains a supported registered backend
  and must preserve behavioral parity with SQLite for this change.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:traversal`: Resolves canonical/public targets before impact, follows
  normalized hierarchy relations, returns separate public-binding and canonical-symbol
  impact views, and enriches file impact with provenance-preserving covering specs for
  direct targets and affected files/symbols.
  - Depends on (added): `code-graph:resolve-symbol-reference`
  - Depends on (removed): none
- `code-graph:composition`: Exposes the resolver, enriched impact operations, and one
  Code Graph-orchestrated multi-category search use case through the lifecycle-managed
  `CodeGraphProvider` and curated public surface.
  - Depends on (added): `code-graph:resolve-symbol-reference`
  - Depends on (removed): none
- `cli:change-implementation`: Replaces CLI-owned matching with the SDK review
  projection while preserving stored-link mutation semantics.
  - Depends on (added): `sdk:build-implementation-review`
  - Depends on (removed): `code-graph:symbol-model`
- `cli:graph-impact`: Adds the `--export` + `--from` target family, renders public
  binding provenance separately from canonical-symbol blast radius, applies exact-name
  and bounded-ambiguity selector policy owned by Code Graph, and groups direct versus
  blast-radius covering specs for file impact while preserving structured evidence in
  JSON/TOON.
  - Depends on (added): `code-graph:resolve-symbol-reference`
  - Depends on (removed): none
- `cli:graph-search`: Delegates one multi-category search to Code Graph, adds the
  `files`/`--files` source-content family without changing the `--file` path filter,
  and renders semantic-first symbol results plus deduplicated precise file matches,
  specs, and documents in text/JSON/TOON. Human text favors declaration locations and
  project-relative matched-export paths over serialized canonical ids, bounds general
  matches per file with omission summaries, and returns every match for an exact
  single-file selector. Exact logical-id targets participate even without text hits or
  public bindings, and every candidate page is semantically ranked before the final
  post-suppression file limit.
  - Depends on (added): `code-graph:resolve-symbol-reference`
  - Depends on (removed): none
- `cli:change-status`: Uses the same SDK implementation-review projection as
  `changes implementation review`, removing its independent CLI matching/fallback
  path.
  - Depends on (added): `sdk:build-implementation-review`
  - Depends on (removed): none
- `sdk:composition`: Exports `buildImplementationReview` through the curated SDK
  surface so CLI and other hosts use one supported orchestration entry point.
  - Depends on (added): `sdk:build-implementation-review`
  - Depends on (removed): none
- `code-graph:get-graph-health`: Reports current-content freshness, derivation/schema
  compatibility, persisted per-workspace and global latches, transient unknown state,
  partial-index state, per-resource coverage availability, and stable reasons needed
  to decide whether absence can prove `stale`. Read, discovery, stat, or hashing
  failures remain unknown and never manufacture dirty evidence.
  - Depends on (added): `core:vcs-adapter-port`
  - Depends on (removed): none
- `code-graph:workspace-integration`: Defines canonical cross-workspace module/package
  identity, configured resolution roots, language-sensitive case behavior, and
  deterministic invalidation when workspace resolution inputs change.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:index-project-graph`: Owns the indexing-use-case repair contract for
  incompatible schema/derivation state and exposes the full-rebuild reason/result
  without allowing ordinary read paths to recreate an empty graph.
  - Depends on (added): none
  - Depends on (removed): none
- `sdk:run-index-project-graph`: Carries the repair/full-rebuild request and result
  through the lifecycle-managed SDK path, including providers that cannot be opened
  for normal reads at the previous schema generation, and detects VCS freshness
  scopes through the configured adapter factory.
  - Depends on (added): `core:vcs-adapter`
  - Depends on (removed): none
- `cli:graph-index`: Presents incompatibility and full-rebuild reasons in text and
  structured output and remains the supported user repair path.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:graph-stats`: Exposes dirty/partial/unsupported/error coverage and schema/
  derivation incompatibility distinctly, so users can tell why resolution cannot
  prove `stale`.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

The change affects the Code Graph domain vocabulary, two-pass indexing session,
TypeScript/JavaScript, Python, Go, and PHP adapters, all supported store backends,
provider composition, health/coverage reporting, project reindex orchestration,
symbol search, traversal/impact results, SDK orchestration, and CLI rendering.

Primary code areas are:

- `packages/core/src/application/ports/vcs-adapter.ts`,
  `packages/core/src/infrastructure/{git,hg,svn,null}/`, and the VCS implementation
  detector for complete backend-neutral changed-path enumeration;
- `packages/code-graph/src/domain/` for reference, binding, result, and traversal
  semantics;
- `packages/code-graph/src/application/` for resolution and indexing orchestration;
- `packages/code-graph/src/infrastructure/tree-sitter/` for built-in adapter facts;
- graph-store backend implementations and search indexes;
- `packages/code-graph/src/composition/` and public exports;
- `packages/sdk/src/orchestration/` and the SDK public surface;
- `packages/cli/src/commands/change/` and `packages/cli/src/commands/graph/`.

Public/API changes are additive where possible: enriched symbol/search payloads,
logical-symbol and binding identities, coverage/health facts, new reference/result
types, resolver/provider operations, SDK review projection, and the CLI export target.
Structured CLI output changes require corresponding documentation and compatibility
tests. Backend schema-version bumps plus the released Code Graph package version/
fingerprint must force rebuilding old cached stores. No specd artifact-schema
migration is involved.

Documentation under `docs/sdk/` and `docs/cli/` must explain the SDK entry point,
status meanings, canonical versus public-export impact, selector examples, graph
freshness behavior, and the deterministic-analysis boundary.

The implementation touches highly connected graph and CLI surfaces, so verification
must include unit contracts, backend parity, adapter fixtures, cross-language
integration, provider/SDK orchestration, and end-to-end CLI text/JSON/TOON behavior.

## Technical context

### Architectural decisions

- The CLI was rejected as the long-term resolver owner because delivery hosts must
  depend on SDK rather than orchestrating Core and Code Graph independently.
- Core was rejected as the resolver owner because implementation tracking is persisted
  domain data while symbol resolution depends on optional, freshness-sensitive graph
  infrastructure.
- SDK owns only cross-subsystem orchestration; it does not parse language syntax or
  duplicate Code Graph resolution rules.
- Same-name workspace fallback is diagnostic evidence only. Treating uniqueness as
  proof was rejected because it silently links unrelated symbols.
- Reusing `schema-std` versioning for graph persistence was rejected because it
  versions change/spec artifacts, not the derived Code Graph database.
- Relying only on an additive `CREATE TABLE IF NOT EXISTS`/column definition was
  rejected because existing databases would not acquire or populate the required
  fields. Backend schema versions own physical compatibility, while installed package
  semver owns graph-derivation compatibility.
- Incrementally migrating old graph rows was rejected for this change because the
  required binding and hierarchy facts must be re-extracted from source; adding empty
  columns cannot reconstruct their semantics.
- Treating each syntax declaration as a distinct canonical symbol was rejected because
  overloads and language-defined declaration merging would create false ambiguity.
  Logical identity groups contributing declarations while retaining every occurrence.
- Encoding public aliases only as relation metadata was rejected because the current
  relation identity can collapse distinct routes with equal source, target, and type.
  Public-binding identity is independently addressable and preserved through storage.
- Treating a matching commit ref as proof of freshness was rejected because dirty
  working-tree content, excluded files, unsupported adapters, and parse failures can
  all make absence inconclusive.
- Adding a backend-specific fingerprint method to `VcsAdapter` was rejected. The
  existing `modifiedFiles(baseRef)` port operation already promises repository-relative
  paths that differ from the baseline; its built-in implementations must be corrected
  and tested to satisfy that contract. Code Graph owns graph-visibility filtering,
  current-content hashing, ordering, and fingerprint construction.
- Concrete VCS adapters must execute changed-path discovery with repository-root
  scope. Git must not omit deletions or untracked paths outside the detection `cwd`;
  Mercurial must include missing paths; SVN must not limit status to a nested working
  directory; and rename behavior must preserve both removed and added membership.
  Shared contract verification covers Git, Hg, SVN, null fallback, and external
  providers without adding a new abstract method.
- Local aliases, public exports, inheritance, and composition are distinct provenance
  steps. They may converge on one canonical symbol but are not collapsed into one
  language-neutral fiction.
- Resolution does not mutate links. Automatic link rewriting was rejected because a
  point-in-time graph inference must not silently alter source-of-truth manifests or
  archives.
- This change absorbs `file-impact-covering-specs`. A flat spec-id list was rejected
  because it loses whether coverage belongs to an input target, affected file, or
  affected symbol and at what impact depth. The structured evidence model preserves
  that distinction while still deduplicating specs.
- Reverse coverage queries must be set-based. Reusing only the existing singular
  lookups for each affected file and symbol was rejected because it introduces an N+1
  cost proportional to blast-radius size. Missing `COVERS_SYMBOL` data does not suppress
  valid `COVERS_FILE` results.
- Source-content search is orchestrated by Code Graph, not the CLI. The CLI-owned
  alternative was rejected because category merging, semantic/text deduplication,
  query expansion, ranking, and limit timing are domain/application policy shared by
  every host.
- A symbol needs both its complete construct range and its declared-name
  `selectionRange`. Deduplicating against the complete range was rejected because it
  would hide legitimate strings, comments, calls, and other text inside a function or
  class body.
- The existing `expandSearchQuery` plan is shared by every lane. Source retrieval uses
  the complete query, whitespace-delimited terms, and separator/CamelCase components,
  but complete and all-raw-term matches outrank individual/component matches. Backends
  shortlist with substring-capable indexes and Code Graph verifies precise occurrences;
  treating an FTS snippet window as the actual match range was rejected.
- Parsing or ranking serialized canonical ids inside a store query was rejected.
  Canonical ids are stable external identities; lookup and ranking use indexed
  structured symbol and binding fields on both SQLite and Ladybug.
- Reusing broad discovery widening for impact selectors was rejected. Impact accepts
  exact names or qualified identities, prefers case-exact candidates, and reports
  bounded ambiguity instead of silently traversing every case-insensitive match.
- Showing canonical ids and every public binding in default text output was rejected
  because it obscures the actionable declaration. Structured output retains the ids;
  text shows declarations and only the public export that caused the match.

### Issue #58 completion

Issue #58 is complete only when every supported member form has enough identity
metadata to distinguish simple name, owner-qualified canonical reference, symbol
space, form, logical symbol, contributing declarations, and public binding; those
fields survive indexing and each supported store; search exposes them; implementation
review resolves them; and impact accepts the resulting canonical or public target.
Interface/contract members must exist as addressable members rather than relying only
on a parent type or unrelated concrete method.

This issue does not require replacing all internal graph ids. Its stability requirement
is satisfied by the additive canonical reference used for linking/search/display while
the internal location id remains a storage identity.

### Issue #52 completion

Issue #52 is a full regression-and-gap matrix:

- TypeScript/JavaScript: static and side-effect imports, literal dynamic import and
  CommonJS require, member/namespace calls, package exports/conditions, project
  references, type-only/declaration-file resolution, and `tsconfig` path aliases;
- Python: static and literal dynamic imports, accessible local names, `src/`, regular
  package, submodule, `__init__.py`, namespace package, `.pyi`, receiver, inheritance,
  mixin, and deterministic MRO behavior;
- Go: useful file `IMPORTS`, imported/free/member `CALLS`, selectors, standard/alias/
  dot/blank imports, module/workspace/replace and build-context resolution, receiver
  method sets, embedding, promoted methods, and deterministically provable interface
  satisfaction;
- cross-cutting hierarchy: extraction and impact for `EXTENDS`, `IMPLEMENTS`, and
  `OVERRIDES`, plus language-equivalent normalization where it preserves meaning.

Already delivered cases are verified rather than reimplemented. Any matrix entry still
missing in code must be implemented in this change. PHP is included for built-in
adapter consistency even though issue #52 focused on non-PHP adapters: `use X as Y`
must resolve uses of `Y` to canonical `X` for impact without being treated as
inheritance or re-export, and traits/adaptations must participate in deterministic
member resolution.

### Archival exit criteria

The change may be archived only after:

1. every new or modified spec and paired verification artifact covers the semantics
   above;
2. all deterministic #58 and #52 matrix scenarios pass against the implementation;
3. all supported graph-store backends pass the same persistence/search behavior;
4. each changed physical backend advances its then-current schema version, detects the
   previous version, rotates storage generation, and completes a full reindex without
   serving old or silently empty data;
5. the released `@specd/code-graph` version changes the graph derivation fingerprint,
   while `schema-std` and implementation-link persistence remain unchanged;
6. implementation review, graph search, canonical symbol impact, and public export
   impact agree on target identity and provenance;
7. logical declaration groups, symbol spaces, case behavior, anonymous/default
   exports, shadowed aliases, and multiple bindings between the same endpoints retain
   distinct, round-trippable identities;
8. dirty, graph-not-current, partial, excluded, unsupported, and parse-failed cases
   never produce false `missing`, and their reason codes are observable through health,
   review, and graph stats;
9. ambiguous, conditional-without-context, and runtime-only cases never produce
   guessed relations or targets;
10. resolver/search/traversal ordering is backend-independent, cycles terminate, and
    batch review does not degrade into a full-graph scan per link;
11. single- and multi-file impact return deterministic, provenance-preserving covering
    specs through batched reverse lookups, including valid file coverage when symbol
    coverage is empty;
12. source-content search finds multi-term and expanded-token occurrences without a
    repository scan, suppresses only occurrences represented by returned symbol
    selection ranges, applies limits after suppression, and retains non-symbol text
    inside symbol bodies;
13. symbol construct and selection ranges survive every built-in adapter and supported
    backend with start/end line and column; and
14. exact, partial, public-export, and case-conflicting symbol searches and impact
    selectors have deterministic precedence, bounded ambiguity, and backend parity;
15. file-content results normalize exact file selectors, cap general/wildcard matches
    per file after suppression, expose total/omitted counts, and return all matches for
    an exact single-file selector;
16. SQLite and Ladybug resolve and rank through indexed structured fields rather than
    parsing serialized canonical ids while retaining those ids as external identities;
    and
17. CLI and SDK documentation describes the observable contract.

Only then may the archived change be cited as evidence to close GitHub issues #58 and
#52. Archival need not automatically mutate GitHub issue state.

The separate archived-spec overlap reported for `cli:change-implementation`, and active
scope overlaps with other graph changes, are acknowledged but intentionally excluded
from this proposal decision per user instruction. They will be reconciled when those
changes progress and do not weaken the requirements above.

## Follow-up: graph and file freshness caching

This change absorbs the freshness scope previously explored by
`graph-staleness-dirty-fingerprint`. The original full-content health implementation
is not the intended final design: canonical health must not read and hash every
graph-visible file on every call.

### Separate global, file, and symbol concerns

Freshness has three separate responsibilities:

- Graph health reports whether the graph is globally known stale since the last
  successful index.
- Resource freshness reports whether the physical inputs that produced one indexed
  file, document, or spec still represent their current source state.
- Symbol resolution queries persisted declarations, bindings, and hierarchy only
  after establishing freshness for the files whose evidence it uses.

`stale` is persisted for physical indexed inputs and for per-workspace/global graph
latches, not for symbols. There is no persisted "stale symbol" entity. When a current,
completely indexed file does not contain the requested symbol, resolution reports the
symbol/link as missing; when a required file is stale or cannot be checked, resolution
remains unresolved.

A globally stale graph does not imply that every indexed file is stale. Targeted
resolution may still validate the requested file and the contributing declaration
files and use them when they are current.

### Global health cache

Graph metadata persists a monotonic `knownStaleSinceLastIndex` latch. Health first
reads this latch:

- when true, health returns stale without inspecting scopes, files, or symbols;
- when false, health evaluates freshness scopes and stops at the first stale scope;
- the first stale result atomically sets the latch to true; and
- only a successful reindex clears the latch.

Each workspace persists the equivalent monotonic latch. Global state is
`stale > unknown > current`: any known stale workspace or project-global input sets
the global latch, while a transient inability to assess one input reports `unknown`
without modifying any latch. Content assessment failures use `CONTENT_UNKNOWN`;
`DERIVATION_UNKNOWN` is reserved for unavailable or invalid derivation/version/config
evidence. Targeted resolution that depends on unknown evidence remains `unresolved`
with a stable `freshness-unknown` reason, and a later call retries the assessment.

Structured health returns the aggregate state, reasons, global latch, and every
workspace's state, reasons, latch, and `vcs | filesystem | hybrid` assessment mode.
Text output reports the aggregate and only non-current workspaces. It does not expose
absolute workspace or VCS roots. A project-global derivation/input failure may make
the aggregate non-current without falsely attributing it to a workspace.

This conservative latch intentionally remains stale even if a user later reverts the
working-tree change. Reindexing is preferred over repeatedly trying to prove that a
previously stale graph became current again.

VCS-backed workspaces are grouped at runtime by shared VCS root. Persisted scope
identity is derived from sorted workspace names and must not contain or hash absolute
user filesystem paths. Each VCS group captures its indexed base ref and a normalized,
sorted diff fingerprint over `{ path, state: 'present' | 'missing', contentHash }`.
Health compares the current ref first, then the current diff fingerprint when refs
match. A mismatch marks the affected workspace latch and the global latch without
scanning and hashing the complete indexed file set.

`VcsAdapter.modifiedFiles(baseRef)` remains the backend-neutral primitive and returns
normalized VCS-root-relative paths independently of construction cwd. It includes
staged, unstaged, untracked, deleted/missing paths and both rename sides; `ref()`
returns only the stable revision without a dirty suffix. Code Graph, not the adapter,
owns visibility filtering, presence checks, content hashing, ordering, and fingerprint
construction. VCS failures yield `unknown`. Hosts create adapters per detected root
and share one diff evaluation among workspaces in that root. A workspace configured
with `respectGitignore: false` uses hybrid assessment so ignored untracked graph inputs
cannot escape detection.

For a workspace with no resolvable VCS, health compares the current graph-visible path
membership and persisted file observations. Matching mtime and size require no content
read. When either stamp differs, health hashes that file: equal content refreshes the
observed stamps and continues, while different content sets only the global stale
latch and exits immediately. A missing indexed path or a newly discovered
graph-visible path also makes the graph globally stale. Health does not mark the
particular file stale when performing this aggregate check.

### Graph input inventory and exclusion semantics

Indexing records the physical inputs that produced graph resources for source files,
documents, and specs. Source files and documents normally have one physical input.
A spec is an aggregate resource and may have multiple physical inputs, including its
content artifacts, metadata, and persisted state; one mtime/size pair on `SpecNode`
cannot represent that aggregate. Workspace freshness covers all three resource kinds,
while a shared VCS root remains only an evaluation scope that lets health obtain and
normalize one repository diff for several workspaces. The graph also retains its
global monotonic stale latch above the workspace states.

`VcsAdapter.modifiedFiles()` returns the complete backend-neutral repository diff.
Code Graph filters those paths before reading content or constructing the normalized
diff fingerprint. The filter must reuse the same effective graph visibility rules as
indexing: global and workspace `excludePaths`, `allowedPaths`, `respectGitignore`,
default exclusions, and the explicit code/document/spec discovery channels. It must
not introduce an independent ignore list.

A path excluded from every applicable graph-input channel is irrelevant to graph
health. Its addition, modification, deletion, or rename:

- does not enter the VCS diff fingerprint;
- does not mark any workspace stale;
- does not set `knownStaleSinceLastIndex`; and
- is not read, filesystem-statted, or content-hashed by health.

This rule applies equally to VCS-backed filtering and non-VCS membership discovery.
In a mixed diff, only graph-visible paths contribute to freshness. Channel ownership
remains explicit: for example, a spec root may be synthetically excluded from generic
code/document discovery while its artifacts remain visible through `SpecRepository`.
Conversely, an excluded change manifest that belongs to no graph-input channel must
not make the graph stale. A change to the effective discovery configuration itself,
including a change to `excludePaths`, is detected by the separate derivation
fingerprint rather than by treating excluded content as visible.

Downstream requirements and verification artifacts must cover excluded additions,
modifications, deletions, and renames; excluded-only and mixed VCS diffs; equivalent
non-VCS membership checks; explicit-channel inputs such as specs; shared-repository
workspace attribution; and derivation invalidation when the exclusion configuration
changes.

### Indexed-input and targeted freshness cache

The store persists backend-neutral observations separately from semantic graph nodes:

```ts
interface IndexedInputObservation {
  readonly workspace: string
  readonly resourceKind: 'file' | 'document' | 'spec'
  readonly resourceId: string
  readonly inputKind: 'filesystem' | 'repository'
  readonly inputLocator: string
  readonly indexedContentHash: string
  readonly lastObservedMtime?: number
  readonly lastObservedSize?: number
  readonly lastObservedRevision?: string
  readonly stale: boolean
}
```

Input locators are logical/workspace-relative and never absolute. A file or document
normally maps to one observation; a spec maps to all artifacts, metadata, and
persisted-state inputs that produced the aggregate node. Repository observations
support non-filesystem `SpecRepository` implementations through stable revisions or
fingerprints.

Indexing records the current evidence with `stale: false`. A targeted filesystem
assessment applies the same algorithm for VCS-backed and non-VCS inputs:

1. a persisted `stale: true` result is returned without filesystem work;
2. a missing input is marked stale;
3. matching mtime and size prove the cached observation is still current;
4. changed stamps trigger a content-hash comparison;
5. an equal hash refreshes mtime and size while retaining `stale: false`; and
6. a different hash atomically changes `stale` from false to true.

Input staleness is monotonic between successful index runs. Ordinary assessment cannot
clear `stale: true`; only reindexing replaces the indexed evidence and resets the
flag. Read/stat/hash/repository failures return transient `unknown` and do not mutate
the stale flag or graph latches.

### Store and use-case boundary

The store contract adds batch lookup and semantic cache mutations rather than generic
boolean setters:

```ts
getIndexedInputObservations(
  resources: readonly IndexedResourceKey[],
): Promise<readonly IndexedInputObservation[]>
markIndexedInputsStale(
  updates: readonly MarkIndexedInputStaleInput[],
): Promise<void>
updateIndexedInputObservations(
  updates: readonly UpdateIndexedInputObservationInput[],
): Promise<void>
markWorkspacesAndGraphStaleSinceLastIndex(
  workspaces: readonly string[],
): Promise<void>
```

Mutations include the expected indexed content hash/revision so a check started before
a concurrent reindex cannot mark or update newly indexed evidence. Marking an input
stale is one-way; updating observations is allowed only while the row is not stale.

An internal batch-capable `AssessIndexedResourceFreshness` application use case owns
resource lookup, observation/revision reads, selective hashing, aggregation, and
semantic store updates. A resource is stale when any input is stale and unknown when
no input is stale but at least one cannot be assessed.

`ResolveSymbolReference` consumes this use case rather than embedding I/O or
persistence logic. One resolution batch deduplicates addressed and contributing
declaration files. Exact file/document/spec lookup may use current targeted evidence
despite unrelated global staleness. Corpus-wide search, absence, uniqueness, ranking,
or workspace fallback cannot claim completeness from validating only returned
resources; those operations retain global stale/unknown diagnostics and resolution
remains unresolved when completeness is required.

`GetGraphHealth` does not use the targeted resource assessor to inspect every symbol
or mark individual inputs. It owns the aggregate VCS-group/non-VCS scope algorithms
and the workspace/global latches. Both paths may share pure stamp/hash comparison
helpers without sharing their cache mutation semantics.

### Incremental relation performance

Incremental indexing persists the compact per-file semantic facts required to hydrate
unchanged files. A content change re-analyzes only changed files and the deterministically
affected dependency closure; it must not expand into a whole-project semantic refresh.
Re-export/public-binding propagation uses an indexed work queue instead of repeated
global passes. Enclosing-symbol, ownership, hierarchy, and relation endpoint lookups
use run-scoped indexes and batch store operations rather than per-fact sorting or
per-relation queries.

All staged graph chunks are written through one bulk session:

```text
begin -> append chunks -> commit -> rebuild FTS once
```

Relations are deduplicated across chunks before persistence. SQLite uses one
transaction with set-based endpoint validation; Ladybug uses bounded `COPY` batches
inside one session. Progress and diagnostics report separate timings and counts for
import resolution, dependency facts, adapter relations, re-export propagation,
hierarchy/override derivation, persistence, and search-index rebuilding.

Verification must prove that an isolated edit does not re-analyze the full project,
re-export work is bounded by affected routes rather than files squared, store calls
are batched rather than relation-shaped, one indexing run commits one bulk session and
rebuilds FTS once, full and incremental results are equivalent, and measured work
grows linearly with the files, facts, and relations actually processed.

## Open questions

None. Global/workspace/input freshness, unknown-state semantics, targeted resource
assessment, VCS scope behavior, exclusion filtering, semantic-first symbol search,
incremental relation performance, and provenance-aware file-impact covering specs were
reviewed and accepted before downstream artifact revision. Source-content result
semantics, shared multi-term/component query planning, symbol-aware occurrence
deduplication, complete/selection ranges, and Code Graph-owned orchestration were also
reviewed and accepted.
