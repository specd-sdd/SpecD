# Proposal: language-agnostic-member-symbol-references

## Motivation

Code Graph already records logical symbols, owners, declarations, bindings, hierarchy, and partial member forms, but it cannot reliably resolve the owner-qualified references that users and implementation tracking naturally store, such as `VcsAdapter.rootDir`, `ArchiveChange.execute`, or `CodeGraphProvider.analyzeSpecImpact`. This leaves valid symbol links vulnerable to false `stale`, `missing`, or broad textual matches and prevents every Code Graph consumer from relying on one precise member identity contract.

The gap should be closed now because symbol-level implementation tracking, graph search, graph impact, coverage, SDK orchestration, and future API/MCP surfaces all need the same answer. Fixing only one delivery surface would create divergent parsing and resolution policies; the capability must therefore belong to `@specd/code-graph` itself and remain language-neutral above its adapters.

## Current behaviour

Code Graph has strong foundations but no complete owner-qualified reference path:

- Logical symbols have deterministic, line-independent IDs and expose workspace, surface, simple name, symbol space, optional `ownerId`, and optional `memberForm`. Declaration occurrences retain source locations and broad `SymbolKind` metadata.
- TypeScript, Python, Go, and PHP adapters emit reference facts and already prove some member distinctions, including constructors, static/instance methods, interface signatures, and selected getter/setter forms. Coverage is incomplete and the current `MemberForm` combines several independent semantic concerns.
- `ResolveSymbolReference` can resolve a member when the caller already supplies its structured `ownerId` and member constraints. It does not parse a human reference such as `ArchiveChange.execute` into an owner lookup followed by a member lookup; only the opaque logical ID format is normalized structurally.
- `buildImplementationReview` correctly leaves syntax policy outside the SDK, but today it forwards the stored string unchanged. Consequently `Owner.member` is queried as one simple symbol name rather than as a structured path.
- Symbol impact and other exact consumers have their own selector entry paths. Although their requirements are conservative, exact selection is not yet expressed through one provider-owned pipeline shared by all consumers.
- Search query expansion intentionally preserves the normalized full token and also splits code-like separators and CamelCase. `ArchiveChange.execute` therefore produces the full token plus components such as `archive`, `change`, and `execute`. SQLite joins expanded tokens with FTS `OR`, which improves discovery recall but can rank unrelated `ArchivedChange`, `createArchiveChange`, owner-only, comment-only, or unrelated `execute` matches without proving the owner/member relationship.
- FTS tokenization cannot be relied upon to preserve `.` or language-native separators such as PHP `::`. Textual relevance can retrieve candidates, but it cannot establish canonical symbol identity.

As a result, the same text may be treated differently by search, impact, and implementation review, and future transports would be forced either to repeat that inconsistency or invent their own parsers.

## Proposed solution

Make owner-qualified member identity and resolution a first-class, backend-neutral Code Graph capability:

1. Extend the language-neutral symbol model so member targets retain a simple name, structured owner relationship, normalized member semantics, a stable canonical reference, and presentation-ready qualified identity without making any language delimiter authoritative.
2. Extend each language adapter to emit every member fact it can prove and to translate supported human/native reference syntax into a common structured selector. Dynamic or ambiguous syntax remains unresolved rather than guessed.
3. Introduce one provider-owned exact-resolution pipeline for canonical logical references, legacy occurrence IDs, structured selectors, public bindings, owner-qualified human references, and existing simple names. Resolution proceeds owner-first and member-second, preserves existing precedence and health semantics, and returns the existing conservative outcome family with evidence.
4. Provide bounded GraphStore queries and SQLite indexes for structured owner/member selection. Derived schema incompatibility is repaired through the existing provider-owned rebuild path rather than caller-managed migration.
5. Route graph impact and implementation review through the shared Code Graph resolution contract. CLI and SDK remain thin adapters and do not parse language syntax or reproduce selection policy. The same provider surface becomes the contract for future APIs and MCP tools.
6. Keep lexical expansion and FTS for discovery. Graph search runs an exact structured lane independently from the lexical lane, merges and deduplicates both result sets, ranks a proven exact member first, and preserves broader related results afterward. Exact operations never use FTS as identity proof.
7. Preserve user-facing CLI commands, flags, filters, output formats, lifecycle behaviour, stored human implementation-link strings, location-backed occurrence IDs, simple-name selectors, and the conservative resolution outcome family. The internal member model is **not** dual-written: `MemberForm` is replaced in this change by independent `MemberSemantics` axes, and the opaque logical-ID encoding is revised in the same cut. Derived graph storage is repaired by the existing provider-owned rebuild path; there is no deprecation window where both member models or both logical encodings remain canonical.

This solution addresses issue #58 as a reusable Code Graph feature rather than an implementation-tracking exception.

## Specs affected

### New specs

None. The capability extends existing Code Graph, CLI, and SDK contracts.

### Modified specs

- `code-graph:symbol-model`: define structured qualified symbol identity and normalized, language-neutral member semantics while preserving deterministic logical and legacy occurrence identities.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:language-adapter`: require adapters to emit proven owner/member semantics and parse/render supported language-native member reference syntax as common structured selectors without moving language logic into the indexer.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:resolve-symbol-reference`: accept canonical, legacy, structured, simple, and human owner-qualified references through one conservative owner-first resolution policy, including adapter selection, ambiguity, provenance, freshness, hierarchy, and batch behaviour.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:graph-store`: add backend-neutral persistence and bounded indexed lookups for qualified identity, owner/member semantics, exact reference aliases or projections, and search identity fields without parsing serialized canonical IDs.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:sqlite-graph-store`: define the SQLite schema, equality indexes, FTS projection, ranking, rebuild compatibility, and backend contract needed to keep exact resolution separate from lexical discovery.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:indexer`: persist complete adapter-emitted member/reference facts incrementally and rebuild incompatible derived storage while remaining free of language-specific resolution logic.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:composition`: expose and own the unified single/batch symbol-resolution surface used by every delivery channel, with provider lifecycle, availability, health, and backend independence intact.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:traversal`: require symbol impact to select exactly one canonical logical member through the shared resolver before traversal, preserving exact, ambiguity, hierarchy, public-binding, and legacy-selector semantics.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:graph-search`: add a provider-owned exact structured-reference lane ahead of lexical ranking while preserving the command signature, filters, FTS discovery, snippets, category merging, structured formats, and thin-CLI constraint.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:graph-impact`: route every symbol selector through the unified Code Graph resolver and preserve current command, error, ambiguity, traversal, formatting, and availability contracts.
  - Depends on (added): none
  - Depends on (removed): none
- `sdk:build-implementation-review`: resolve stored owner-qualified implementation symbols through the unified provider API in one batch/lifecycle while preserving raw stored values and keeping syntax parsing and matching out of the SDK.
  - Depends on (added): none
  - Depends on (removed): none

`cli:change-implementation` is an affected consumer but does not currently require a delta: its existing contract already mandates using `sdk:build-implementation-review`, rendering the four conservative outcomes, and avoiding independent fallback policy. `code-graph:workspace-integration` supplies existing workspace/file/language context but does not require a changed requirement unless design determines that adapter selection needs a new workspace-level contract. No current MCP graph-resolution spec exists; future MCP/API delivery surfaces are covered by requiring them to delegate to the public provider contract rather than by inventing a speculative transport contract in this change.

## Impact

- **Domain model:** logical symbol/reference value objects, canonical reference round-trip, structured paths, member classification, resolution requests/results, reason codes, and additive public presentation fields.
- **Language adapters:** TypeScript/JavaScript, Python, Go, and PHP extraction and reference syntax support, plus shared adapter contracts for future languages. Unsupported dynamic forms remain explicitly unproven.
- **Persistence:** GraphStore port, SQLite schema/worker protocol, indexes, bulk reference-fact writes, search identity projections, storage generation compatibility, and deterministic backend-equivalent queries.
- **Application and composition:** indexing/reference-fact hydration, exact single/batch resolution, provider facade, graph selector consolidation, search candidate merging, and impact target selection.
- **Consumers:** graph search and impact CLI behaviour, SDK implementation review, change implementation review/status consumers, coverage materialization paths that depend on canonical symbol selection, and future API/MCP callers.
- **Compatibility:** existing raw stored implementation symbols and sidecars are not rewritten (they remain human `Owner.member` text). Location-backed occurrence IDs, public bindings, simple-name selection, search categories, output formats, and provider lifecycle remain supported. Current `MemberForm` and the current `logical|...` encoding that embeds it are replaced in one shot; callers and persistence must use the new member-semantics axes and the new versioned logical identity after rebuild. No dual-read of old logical IDs is required beyond rebuild.
- **Performance:** exact selection uses bounded equality/index queries and shared batch health/lookups. It must not scan the full graph, run one store call per candidate/member, or turn FTS result pages into exact selectors.
- **Risk:** the symbol reference model is a critical hotspot with broad direct and transitive coupling. The change overlaps active `code-graph-symbol-semantic-context` on `code-graph:symbol-model`, `code-graph:language-adapter`, and `code-graph:indexer`; sequencing or consolidation is required before implementation.
- **External dependencies:** none are intended. Existing parsers, SQLite facilities, adapter registry, provider lifecycle, and rebuild mechanisms should be extended.

## Technical context

### Verified implementation baseline

The analysis was performed against a current Code Graph index with 1,086 code files, 37,564 logical symbol declarations, 273 specs, and no stale, partial, parse-failed, fingerprint-mismatch, schema-generation, or coverage warnings. The current repository index only contains JavaScript/TypeScript source because those are the languages used by this repository; the installed Code Graph implementation nevertheless includes built-in TypeScript/JavaScript, Python, Go, and PHP adapters whose contracts and tests must remain supported.

The current implementation already contains most of the semantic building blocks, but they do not yet form a human qualified-reference pipeline:

- `packages/code-graph/src/domain/value-objects/symbol-reference.ts` defines `SymbolSpace` (`value`, `type`, `namespace`, `property`), `MemberForm` (`instance`, `static`, `constructor`, `getter`, `setter`, `signature`), `LogicalSymbol`, declaration occurrences, public/local bindings, hierarchy facts, resolution steps, adapter capabilities, resolver input/output, and the four conservative statuses `resolved`, `ambiguous`, `unresolved`, and `missing`.
- `LogicalSymbol` currently stores `id`, `workspace`, `surface`, case-preserving simple `name`, `space`, optional `ownerId`, and optional `memberForm`. Declaration locations remain in `DeclarationOccurrence`, so the logical ID is stable across line movement while the legacy location-backed `symbolId` remains available.
- `createLogicalSymbol` creates the opaque `logical|...` ID from six length-prefixed fields: workspace, surface, name, symbol space, owner ID, and member form. `parseLogicalSymbol` validates and round-trips exactly that encoding. This is already delimiter-safe and proves why `.` or `::` must not become the canonical identity delimiter.
- `ReferenceFacts` currently transports declarations, public bindings, local bindings, hierarchy, resolution steps, and capability flags. It does not yet carry a first-class qualified path, normalized multi-axis member semantics, or generic/native reference aliases.
- `LanguageAdapter` currently exposes language/extension discovery, synchronous pure file analysis, import resolution, relation building, and optional package/qualified-name helpers. It has no method for parsing a human symbol reference or rendering a generic/native reference.
- `ResolveSymbolReferenceInput` currently contains `workspace`, raw `requested`, and optional `filePath`, `publicSurface`, `symbolSpace`, legacy `kind`, `logicalId`, `ownerId`, `memberForm`, `scopeId`, and `buildContext`. This API can already express a structured member only when the caller knows the canonical owner ID.
- `packages/code-graph/src/application/use-cases/resolve-symbol-reference.ts` batches requests with one graph-health read, bulk logical/public/local binding lookups, bounded resolution-step loading, hierarchy lookup, declaration hydration, coverage, and addressed-resource freshness checks. Resolution paths are bounded by `MAX_PATH_DEPTH = 32`, results are correlated with input order, and candidate ordering is deterministic.
- `normalizeRequest` only recognizes and decomposes the existing opaque logical ID. For a human input such as `ArchiveChange.execute`, no owner path is extracted: the whole value remains `requested`, and `toLogicalLookup` asks the store for a simple symbol with that complete name.
- The resolver already supports hierarchy lookup when `ownerId` is present: it follows proven resolution steps from the owner and selects the minimum-depth member candidates with matching simple name, space, and member form. The missing feature is therefore parsing/resolving the owner path before entering this existing structured machinery, not replacing the machinery.
- `CodeGraphProvider` already exposes `resolveSymbolReference` and batched `resolveSymbolReferences`, alongside `resolveSymbolSelector`, `analyzeImpact`, traversal, search, and graph-health operations. The target architecture should converge these exact selector paths without deleting or bypassing the existing public methods.

### Explicit reuse plan: extend the current wheel

The implementation should be an evolution of the current semantic-reference stack, not a parallel subsystem:

- **Keep `LogicalSymbol` as the canonical entity.** Replace `memberForm` with `MemberSemantics` on that entity in this change; do not create a second qualified-symbol aggregate or duplicate legacy `SymbolNode`. `DeclarationOccurrence` remains the bridge to location-backed IDs and source ranges.
- **Keep `ReferenceFacts` as the adapter-to-indexer payload.** Extend `AdapterDeclarationDescriptor`, `createAdapterDeclarationDescriptor`, and `buildLogicalDeclarationFacts` so the existing two-pass owner materialization also carries richer member semantics/qualified projections. Its current conservative behaviour—dropping a required-owner member when the owner is missing or cyclic—must remain.
- **Keep the current hierarchy pipeline.** Reuse `buildHierarchyReferenceFacts`, `ResolutionStep`, and the resolver's bounded path traversal rather than creating a member-specific inheritance graph.
- **Extend `LanguageAdapter`; do not introduce a separate language-parser plugin family.** Qualified-reference parse/render methods belong on the existing adapter interface. Reuse the single `AdapterRegistry` created by `createCodeGraphProvider`, including its dynamic `languages()`, `extensions()`, `getAdapterForFile`, `getLanguageForFile`, and `getAdapters` behaviour. The registry contains no hardcoded extension map and already supports additive custom adapters.
- **Inject the existing registry into provider resolution.** Today `createCodeGraphProvider` builds one registry, registers the four built-ins plus configured custom adapters, and passes it only to `IndexCodeGraph`; `CodeGraphProviderImpl` receives the store and indexer but not the registry. Composition should pass that same instance through the `AdapterRegistryPort` instead of building a second registry. If explicit language selection is required, extend the port with the concrete registry's already-existing language lookup/capability operations rather than duplicating maps.
- **Extend `CodeGraphProviderImpl.normalizeResolutionInputs`.** It already deduplicates file-selector resolution, canonicalizes project/config-relative paths, and corrects workspace when the file selection is unambiguous. Adapter selection and text-to-structured normalization should build on this method or a cohesive extracted service used by it, so file/workspace normalization is not repeated elsewhere.
- **Keep `ResolveSymbolReference` and its single/batch APIs.** Replace `memberForm` on `ResolveSymbolReferenceInput` / lookup types with `MemberSemantics` (and parsed structured paths) in the same revision. Do not replace `resolveSymbolReference(s)` with differently named public methods. Preserve one health snapshot, bulk queries, exact resource freshness, deterministic order, evidence paths, and result cardinality.
- **Converge, but retain, `resolveSymbolSelector`.** The current selector service supports direct legacy symbol IDs; `<file>:<kind>:<name>:<line>:<column>`; `<file>:<kind>:<name>`; `<file>:<name>`; then case-sensitive and case-insensitive simple-name fallback. Those grammars and the public `resolved`/`ambiguous`/`missing` projection must continue to work. Internally, owner-qualified semantic selection should delegate to the shared resolver and adapt its result, while legacy file-qualified/location selectors can retain their exact optimized path.
- **Keep traversal target APIs ID-based.** `analyzeImpact`, `getUpstream`, and `getDownstream` already operate efficiently on a proven symbol ID. Qualified selector resolution belongs immediately before traversal; the traversal algorithms do not need to learn human syntax.
- **Keep `SearchCodeGraph` and its semantic tiers.** Extend `executeSymbols` with an exact resolver result lane and merge it into the existing logical/declaration/binding grouping. Do not build a second search use case, replace current FTS APIs, or duplicate ranking in CLI.
- **Extend `GraphStore` bulk lookups and `ReferenceFactsWrite`.** Reuse `findLogicalSymbols`, `findLogicalSymbolsByIds`, binding/step/declaration queries, `beginBulkIndexSession`, and atomic `writeReferenceFacts`. Add only the structured columns/lookups actually required after the open model decisions; do not query the SQLite implementation from application code.
- **Extend the current SQLite tables and indexes.** `logical_symbols`, its owner/member lookup index, bindings, declarations, steps, and `symbol_fts` already model the required separation. Add columns/indexes or a justified alias projection in the same schema; do not create a parallel graph database or serialize qualified identity into an FTS-only document.
- **Reuse index generation and repair.** `IndexCodeGraph` already collects all session logical symbols/declarations/bindings/steps/coverage into one `ReferenceFactsWrite`, commits it atomically, and rebuilds search indexes when semantic or source state requires it. Schema changes should use the existing generation compatibility, `openForIndexing`, full derived-code-graph replacement, and incompatible-schema repair path.
- **Leave SDK orchestration structurally unchanged.** `buildImplementationReview` already does exactly one Core read, provider lifecycle, health read, and resolver batch while preserving stored values and order. The Code Graph enhancement should make its current requests resolve; SDK should only change if an additive input/result projection is required.
- **Keep delivery adapters thin.** `graph search`, `graph impact`, change implementation review, future API, and MCP should consume the provider; none needs its own adapter registry, delimiter parser, owner query, FTS fallback, or storage access.

This reuse boundary also avoids accidental circular design: adapters emit/parse syntax, the application resolver orchestrates structured evidence through the `GraphStore` port, composition owns registry/provider lifecycle, and delivery packages only project provider results.

### Verified built-in adapter coverage

The adapters already emit additive `ReferenceFacts` and partially classify owned members. The proposal must preserve this work and extend it through a shared contract rather than treating every adapter as empty:

| Adapter               | Proven owner/member facts today                                                                                                                                            | Important gaps for this change                                                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript/JavaScript | Class/interface owner IDs; constructors; interface method signatures; `static`; getters; setters; default instance methods; local hierarchy through `extends`/`implements` | Broader property/field/member coverage, complete syntax-aware qualified-reference parsing, generic/native rendering, and distinctions that cannot fit one `MemberForm` value |
| Python                | Class ownership; `__init__`/`__new__` constructors; `@staticmethod` and `@classmethod` mapped to static; `@property`; `.setter`; default instance methods                  | Preserve classmethod/native nuance, cover supported fields/properties, parse qualified references conservatively, and avoid claiming dynamic monkey-patched/runtime members  |
| Go                    | Methods associated with named or pointer receiver owners; interface methods marked as signatures; interface embedding/implementation facts where statically proven         | Receiver-aware textual parsing/rendering, supported struct fields, and preservation of receiver/native distinctions without introducing Go-specific domain enums             |
| PHP                   | Class/interface/trait ownership; `__construct`; statically declared methods; default instance methods; existing namespace/qualified-name helpers                           | Native `Class::member` parsing/rendering, properties/accessors where provable, trait/interface nuance, and no inference from dynamic loader/runtime behaviour                |

The adapter boundary remains synchronous, deterministic, stateless for parsing, and evidence-based. Each adapter may only emit or parse semantics that the source grammar and indexed context prove. Unknown, dynamic, reflective, generated, conditional, macro-like, or otherwise ambiguous members remain unresolved or ambiguous with explicit evidence; a consumer must never silently downgrade them to a textual match.

### Identity model explored

The authoritative identity remains structured and delimiter-safe. A visible spelling such as `ArchiveChange.execute` is a generic display/human reference, not the sole canonical identity: it can collide across workspaces, files, module/package surfaces, symbol spaces, nested owners, overload or merged-declaration groups, accessors, constructors, and static/instance forms.

The explored model separates three concerns:

1. **Canonical logical identity:** opaque, deterministic, versionable, round-trippable, and independent of presentation delimiters.
2. **Structured qualification:** an ordered owner/member path whose segments retain simple case-preserving names and optional semantic roles.
3. **Presentation:** a stable generic display spelling plus an optional language-native spelling rendered by the selected adapter.

The following structures were discussed as conceptual inputs for later specs/design, not as finalized names:

```ts
interface SymbolPathSegment {
  readonly name: string
  readonly role?: 'namespace' | 'type' | 'value' | 'member'
}

interface StructuredSymbolSelector {
  readonly path: readonly SymbolPathSegment[]
  readonly space?: SymbolSpace
  readonly member?: Partial<MemberSemantics>
}

interface MemberSemantics {
  readonly kind: MemberKind
  readonly dispatch?: 'instance' | 'static'
  readonly accessor?: 'get' | 'set' | 'read-write'
  readonly nativeKind?: string
}
```

`MemberKind` was explored with at least `method`, `property`, `field`, `constructor`, `signature`, `indexer`, `operator`, `event`, and an extensible `other`/native form. This separates declaration kind, dispatch, and accessor role, which the current single-axis `MemberForm` cannot express simultaneously: for example, an instance getter is both a property/accessor and instance-dispatched, while a static getter is static and an accessor. `nativeKind` can retain proven language nuance without making the shared domain depend on TypeScript, Python, Go, PHP, or future-language enums.

**Closed:** replace `MemberForm` with `MemberSemantics` in this change. Do not keep `MemberForm` on `LogicalSymbol`, resolver inputs, GraphStore lookups, or SQLite columns alongside the new axes. Adapters, indexer, store, and public provider projections switch in one revision. `SymbolKind` on declaration occurrences stays the closed broad enum and is not a substitute for member semantics.

Possible presentation examples are generic `ArchiveChange.execute`, PHP-native `ArchiveChange::execute`, and receiver-qualified Go notation. Different renderings may map to the same structured selector and canonical target. No renderer output is authoritative unless it round-trips through the adapter and resolver to the same logical target.

### Adapter parsing and selection explored

The adapter contract may gain operations conceptually equivalent to:

```ts
parseSymbolReference(
  input: AdapterSymbolReferenceInput,
): readonly StructuredSymbolSelector[]

renderSymbolReference?(
  input: AdapterSymbolReferenceRenderInput,
): string
```

Parsing must return zero, one, or multiple explicit structured candidates rather than a guessed winner. Canonical and already-structured requests bypass textual parsing. For text, adapter selection should prefer, in order of available proof, an explicitly supplied language, the language of an anchored indexed `filePath`, indexed public/module surface metadata, or another uniquely proven context. An unanchored ambiguous spelling must not be interpreted by an arbitrary default adapter. TypeScript/Python dotted syntax, PHP `::`, Go receiver notation, nested owners, escaping, and future delimiters are adapter concerns; core orchestration only handles structured candidates.

### Owner-first exact-resolution pipeline explored

For `ArchiveChange.execute`, the proposed exact lane is:

1. Normalize request shape and preserve the original stored/user value byte-for-byte.
2. Detect canonical or legacy identity before attempting human syntax parsing.
3. Select a language adapter from proven context and parse the text into one or more structured paths.
4. Resolve `ArchiveChange` inside the addressed workspace, file, surface, lexical scope, public binding, symbol space, and build context.
5. Obtain the canonical logical owner ID and query child `execute` by `ownerId`, simple name, and any proven member-semantic constraints.
6. Repeat owner resolution for nested paths; retain hierarchy, alias, export, and binding evidence at every hop.
7. Apply freshness and completeness evidence to distinguish `missing` from `unresolved`; return `ambiguous` when multiple equally proven targets survive; preserve deterministic candidate ordering and the complete resolution path.

The pipeline must not search globally for only the terminal `execute` segment and infer its owner from BM25 score. It must also preserve existing declaration, exact public binding, exact local binding, hierarchy precedence, case semantics, legacy occurrence IDs, and canonical logical-ID behaviour.

The compatibility precedence explored is additive:

1. Exact canonical logical identity.
2. Legacy location-backed occurrence ID.
3. Exact public/local binding under its existing scope rules.
4. Structured owner/member reference, including adapter-parsed human/native syntax.
5. Existing simple-name resolution.
6. Textual ranking only for discovery operations, never for exact resolution.

The public provider remains the single semantic boundary. CLI owns arguments, errors, exit codes, and rendering; SDK owns cross-package provider lifecycle; a future HTTP API or MCP server owns transport and schema projection only. All call Code Graph with text/canonical/structured input and return its conservative outcome and evidence. No delivery layer may split delimiters, resolve aliases, query SQLite directly, or manufacture a fallback target.

### GraphStore and SQLite baseline and direction

`GraphStore` already defines `LogicalSymbolLookup` with workspace, optional surface, simple name, optional space, optional `ownerId`, and optional `memberForm`, plus bulk logical ID, declaration, binding, step, coverage, and source-search operations. `ReferenceFactsWrite` is committed inside the existing atomic index write session together with code graph generations.

SQLite currently persists:

- `logical_symbols(id, workspace, surface, name, space, owner_id, member_form)`;
- separate `logical_declarations`, `public_bindings`, `local_bindings`, `resolution_steps`, and `index_coverage` tables;
- `idx_logical_symbols_lookup(workspace, surface, name, space)`;
- `idx_logical_symbols_member_lookup(workspace, surface, name, space, owner_id, member_form)`;
- binding and resolution-step indexes; and
- `symbol_fts(id, search_text, comment)` using the Porter tokenizer.

The current SQL lookup already performs equality filtering over workspace, surface, name, space, owner ID, and member form. Storage work should replace `member_form` with independent member-kind/dispatch/accessor/native-kind columns in the same schema generation bump, plus a justified indexed normalized qualified projection. Do not keep a `member_form` column beside the new axes. Structured facts remain authoritative even if projections accelerate retrieval.

The store contract must remain backend-neutral and deterministic: SQLite decides physical schema and indexes, while future stores must return equivalent semantic outcomes. Schema incompatibility belongs to the existing derived-cache storage-generation/rebuild flow; raw source, implementation sidecars, and archived spec data must not require mutation or caller-managed migrations.

Performance constraints discussed:

- exact owner/member resolution uses equality/index queries, never a whole-graph scan;
- a batch shares graph health, prepared lookups, declarations, hierarchy steps, coverage, and freshness work;
- nested path work is bounded and must not create one store round trip per candidate per segment when queries can be deduplicated/batched;
- an FTS result page must not become a list of targets to try as exact identity;
- ordering must remain stable across backends and repeated runs.

### Splitter, FTS, and ranking analysis

`packages/code-graph/src/domain/services/expand-search-query.ts` deliberately preserves each normalized original whitespace token, then adds components split on `:`, `/`, `_`, `.`, `-`, lower-to-upper CamelCase transitions, acronym boundaries, and letter/number boundaries. Thus `ArchiveChange.execute` keeps `archivechange.execute` and adds `archive`, `change`, and `execute` in stable deduplicated order.

`packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts` passes those expanded tokens to `sanitizeFtsQuery`, which quotes each token and joins them with `OR`. This is desirable for recall and related-code discovery, but it allows owner-only, member-only, comment-only, `ArchivedChange`, `createArchiveChange`, and unrelated `execute` hits. The observed current query returned broad textual matches and the `ArchiveChange` owner rather than proving and ranking its exact `execute` child.

`SearchCodeGraph` already has semantic ranking tiers ordered as exact logical identity (7), exact public binding (6), exact declaration (5), normalized declaration (4), logical component (3), exact local symbol (2), and textual (1). Source match kinds are weighted full query (3), raw token (2), and expanded token (1). However, `executeSymbols` currently asks the store for textual hits, an exact public binding named by the complete query, and a logical ID equal to the complete query; it does not run owner-qualified parsing/resolution.

The splitter therefore stays. Search gains a separate exact structured-reference lane and keeps the lexical lane unchanged. It merges by canonical logical ID, deduplicates declarations/bindings, ranks a proven owner/member target before current tiers, and retains broader lexical results after it. A qualified projection may aid equality ranking, but FTS tokenization and BM25 are never identity evidence because punctuation such as `.` and `::` may be removed, tokenized, stemmed, or handled differently by another backend.

Exact operations—including `resolveSymbolReference(s)`, `graph impact --symbol`, implementation-link review, and symbol coverage materialization—must never fall back to FTS. `ArchiveChange.missing` cannot resolve merely because the owner and an unrelated `missing` symbol are independently searchable.

### Current consumer flow and compatibility obligations

`packages/sdk/src/orchestration/build-implementation-review.ts` currently reads the authoritative Core implementation review once, builds requests in stable link/symbol order, opens one provider lifecycle, reads graph health once, invokes `resolveSymbolReferences` once, verifies result cardinality, and correlates results without rewriting stored values. `buildResolutionRequests` intentionally does no syntax parsing: it derives workspace from the spec ID and forwards `{ workspace, requested: symbol, filePath: link.file }`. This is the correct layer boundary; once Code Graph understands qualified text, SDK behaviour improves without an SDK parser.

The change must preserve:

- the existing four resolution statuses, reason codes, health/freshness/completeness distinction, evidence paths, deterministic candidates, and raw requested value;
- current `CodeGraphProvider` open/index/close lifecycle and single/batch method behaviour;
- existing CLI commands and flags for graph search and graph impact, including category filters, kind/file/workspace filters, limits, snippets, text/JSON/TOON projections, errors, exit semantics, and graph availability handling;
- legacy symbol occurrence IDs, public bindings, local bindings, hierarchy, existing simple-name queries, and public selector behaviour (file-qualified and location-backed grammars);
- the new versioned opaque logical identity after rebuild — not the pre-change `logical|...` encoding that embedded `memberForm`;
- the word splitter and broad FTS discovery results;
- backend parity and the provider-owned rebuild path; and
- existing implementation tracking values and sidecars without rewriting them.

Future API/MCP compatibility is architectural rather than speculative: when those transports expose graph resolution/search/impact, they must delegate to the same `CodeGraphProvider` methods and project the same result semantics. This proposal does not create an unused transport endpoint or an MCP-only parser.

### Verification evidence expected downstream

The later specs and verification artifacts should cover shared adapter contracts, GraphStore backend contracts, resolver unit/integration behaviour, SQLite rebuild/index behaviour, and cross-consumer agreement. The concrete examples discussed are `VcsAdapter.rootDir`, `ArchiveChange.execute`, and `CodeGraphProvider.analyzeSpecImpact`.

For each representative qualified reference, implementation review must identify the expected logical member; graph search must place the proven target before lexical relatives while retaining discovery results; graph impact must select only that member or report deterministic ambiguity; and provider, SDK, and CLI results must agree. PHP native and generic spellings should reach the same target when the adapter proves equivalence. Tests must also cover nested owners, overloaded or merged declarations, constructors, interface signatures, getters/setters, static versus instance dispatch, inheritance, aliases/re-exports, case rules, unknown languages, stale/partial indexes, absent members, and multi-candidate ambiguity.

### Risk, overlap, and sequencing evidence

Graph impact for `code-graph:src/domain/value-objects/symbol-reference.ts` is **CRITICAL**: 61 direct dependents, 147 indirect dependents, 92 transitive dependents, and 81 affected files. Covering specs reported by the graph include `code-graph:composition`, `code-graph:graph-store`, `code-graph:sqlite-graph-store`, and `code-graph:traversal`. The affected surface also includes adapter tests, resolver tests, SQLite worker/protocol/lifecycle tests, traversal and impact tests, SDK review tests, and public barrel exports.

The active `code-graph-symbol-semantic-context` change is also in `designing` and overlaps `code-graph:symbol-model`, `code-graph:language-adapter`, and `code-graph:indexer`. Those deltas and eventual implementation edits cannot safely proceed independently. The explored implementation order is: resolve overlap; finalize identity/member semantics; finalize adapter extraction/parsing/rendering; extend GraphStore and SQLite with rebuild compatibility; update indexer/reference-fact persistence; implement all built-in adapters and contract tests; consolidate exact provider resolution; route impact and implementation review; add the independent exact lane to search; then verify compatibility across all public surfaces.

### Rejected alternatives

- **Split every qualified input on `.` in core:** rejected because `.` is language/presentation syntax, is ambiguous with namespaces and nested constructs, does not cover PHP `::` or Go receiver notation, and cannot safely address escaping or future adapters.
- **Use `Owner.member` as the canonical ID:** rejected because the spelling is not globally unique and cannot encode workspace, surface, symbol space, nested owners, accessors, overload/merged declarations, or dispatch without becoming another fragile serialization.
- **Remove or weaken the word splitter:** rejected because it is valuable for discovery, code-shaped tokens, related results, and file/content search.
- **Let FTS/BM25 prove resolution:** rejected because textual relevance, stemming, punctuation tokenization, and OR expansion cannot prove semantic ownership or identity.
- **Parse in SDK, CLI, API, or MCP:** rejected because every consumer would drift and backend/provider methods would still remain inconsistent.
- **Implement only an implementation-review exception:** rejected because graph search, impact, coverage, SDK, CLI, and future transports need the same identity semantics.
- **Infer dynamic members through runtime reflection or fuzzy/edit-distance matching:** rejected by the existing conservative evidence contract and because indexing must be deterministic and offline.
- **Keep `MemberForm` and the current logical-ID encoding during a deprecation period:** rejected. The current logical ID already embeds `memberForm`; a one-shot `MemberSemantics` model requires a one-shot identity encoding and derived-graph rebuild. Dual canonical identities would recreate the inconsistency this change exists to remove.
- **Rewrite stored human implementation-link strings or drop location-backed occurrence selectors:** rejected. Those remain compatibility surfaces. CLI command signatures stay. Internal domain/store/provider member fields and logical IDs do not need a coexistence window.

## Closed decisions

Recorded during proposal review. Remaining open questions still block spec deltas.

- **One-shot internal model:** no deprecation window for dual member models or dual logical encodings. Graph rebuild is the migration.
- **`MemberForm`:** replaced by `MemberSemantics` (`kind`, `dispatch`, `accessor`, optional `nativeKind`) in this change.
- **Canonical identity:** replace the current `logical|...` encoding (which embeds `memberForm`) with one versioned, delimiter-safe canonical reference that includes the new member-semantics axes. Do not wrap and keep the old ID unchanged. Location-backed occurrence IDs remain a separate legacy selector.
- **`SymbolKind`:** stays the closed broad enum (`function`, `class`, `method`, `variable`, `type`, `interface`, `enum`). Namespace/module is a path-segment role and `surface`/owner identity, not a new kind.
- **Namespace/module:** qualification hop (`SymbolPathSegment.role`), not a first-class impact/search kind and not `graph impact --package` in this change.

## Open questions

The following decisions must be resolved during proposal review before writing spec deltas because they affect downstream contracts:

1. **Overlap sequencing:** should this change absorb/coordinate the member-ownership portions of `code-graph-symbol-semantic-context`, or explicitly wait for that change and build on its final model? The same three specs cannot be implemented independently without conflict. Proposed: this change owns logical owner + member identity; the other change narrows to ranges/`declarationText` and waits or rebases.
2. **Qualified projection:** should qualified paths be reconstructed authoritatively from `ownerId` and only denormalized for search, or persisted as first-class structured data with validation against owner relationships? Proposed: reconstruct from `ownerId`; denormalize only for search/index.
3. **Reference aliases:** should generic display and language-native spellings be modelled as a backend-neutral alias entity/table, or generated on demand with only an indexed normalized qualified projection? Proposed: on demand + indexed projection; no alias table unless later proven necessary.
4. **Unanchored text:** when no file, public surface, or explicit language identifies an adapter, should Code Graph run every capable adapter parser and return deterministic ambiguity, or accept only generic/canonical structured syntax and otherwise return unresolved?
5. **Search activation:** should every symbol search attempt the exact-reference lane, or only queries recognized as canonical/qualified selectors? Either choice must retain the lexical lane and rank a proven exact target first. Proposed: exact lane only for recognizably qualified/canonical queries.
6. **Scope confirmation:** should `cli:change-implementation` and `code-graph:workspace-integration` remain contextual consumers with no deltas as proposed, or do the chosen presentation/adapter-selection decisions introduce new observable requirements that require adding them to change scope? Proposed: no extra deltas.
