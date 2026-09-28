# Proposal: language-agnostic-member-symbol-references

## Motivation

Code Graph already records logical symbols, owners, declarations, bindings, hierarchy, and partial member forms, but it cannot reliably resolve the owner-qualified references that users and implementation tracking naturally store, such as `VcsAdapter.rootDir`, `ArchiveChange.execute`, or `CodeGraphProvider.analyzeSpecImpact`. This leaves valid symbol links vulnerable to false `stale`, `missing`, or broad textual matches and prevents every Code Graph consumer from relying on one precise member identity contract.

The gap should be closed now because the same stored strings are already failing during graph indexing. A fresh index on 2026-09-26 still reports `SYMBOL_NOT_FOUND` for qualified links such as `EditChange.execute`, `TransitionChange.execute`, and `UpdateImplementationTracking._validateMutation`. Symbol-level implementation tracking, graph search, graph impact, index-time spec coverage, SDK orchestration, and future API/MCP surfaces all need the same answer. Fixing only one delivery surface would create divergent parsing and resolution policies; the capability must therefore belong to `@specd/code-graph` itself and remain language-neutral above its adapters.

## Current behaviour

Code Graph has strong foundations but no complete owner-qualified reference path:

- Logical symbols have deterministic, line-independent IDs and expose workspace, surface, simple name, symbol space, optional `ownerId`, and optional `memberForm`. Declaration occurrences retain source locations and broad `SymbolKind` metadata.
- TypeScript, Python, Go, and PHP adapters emit reference facts and already prove some member distinctions, including constructors, static/instance methods, interface signatures, and selected getter/setter forms. Coverage is incomplete and the current `MemberForm` combines several independent semantic concerns.
- `ResolveSymbolReference` can resolve a member when the caller already supplies its structured `ownerId` and member constraints. It does not parse a human reference such as `ArchiveChange.execute` into an owner lookup followed by a member lookup; only the opaque logical ID format is normalized structurally.
- `buildImplementationReview` correctly leaves syntax policy outside the SDK, but today it forwards the stored string unchanged. Consequently `Owner.member` is queried as one simple symbol name rather than as a structured path.
- Index-time spec coverage does not use that resolver at all. `projectSpecCoverage` in `packages/code-graph/src/application/services/project-spec-coverage.ts` keeps a link only when some `SymbolNode.name` in the anchored file is exactly equal to the stored string, then maps that declaration to one logical id. Zero matches become `SYMBOL_NOT_FOUND`; two or more logical ids become `SYMBOL_AMBIGUOUS`. A stored `EditChange.execute` therefore misses the indexed `execute` method of `EditChange`. A re-export that exists only as a public binding in the anchored file is also missed, because coverage never consults bindings.
- Symbol impact and other exact consumers have their own selector entry paths. Although their requirements are conservative, exact selection is not yet expressed through one provider-owned pipeline shared by all consumers.
- Search query expansion intentionally preserves the normalized full token and also splits code-like separators and CamelCase. `ArchiveChange.execute` therefore produces the full token plus components such as `archive`, `change`, and `execute`. SQLite joins expanded tokens with FTS `OR`, which improves discovery recall but can rank unrelated `ArchivedChange`, `createArchiveChange`, owner-only, comment-only, or unrelated `execute` matches without proving the owner/member relationship.
- FTS tokenization cannot be relied upon to preserve `.` or language-native separators such as PHP `::`. A live `symbol_fts` row stores the literal `GetStatus.execute` inside `search_text`, but FTS5 Porter splits on `.` and `MATCH 'GetStatus.execute'` is a syntax error. The exact identity lane compares `symbols.name`, which is the bare member (`execute`) or the bare type (`GetStatus`). `symbols.search_text` stores only the expanded bare name and is not read by search.
- After the member-identity cut, an unanchored `GetStatus.execute` or `ArchiveChange.execute` still does not select the member. The exact lane recognizes the dotted or `::` spelling and then returns unproven when the request has no file, public surface, or language. File-anchored search and impact can resolve that member. A bare `execute` still matches every method of that name.

As a result, the same text may be treated differently by search, impact, and implementation review, and future transports would be forced either to repeat that inconsistency or invent their own parsers.

## Proposed solution

Make owner-qualified member identity and resolution a first-class, backend-neutral Code Graph capability:

1. Extend the language-neutral symbol model so member targets retain a simple name, structured owner relationship, normalized member semantics, a stable canonical reference, and presentation-ready qualified identity without making any language delimiter authoritative.
2. Extend each language adapter to emit every member fact it can prove and to translate supported human/native reference syntax into a common structured selector. Dynamic or ambiguous syntax remains unresolved rather than guessed.
3. Introduce one provider-owned exact-resolution pipeline for canonical logical references, legacy occurrence IDs, structured selectors, public bindings, owner-qualified human references, and existing simple names. Resolution proceeds owner-first and member-second, preserves existing precedence and health semantics, and returns the existing conservative outcome family with evidence.
4. Provide bounded GraphStore queries and SQLite indexes for structured owner/member selection. Derived schema incompatibility is repaired through the existing provider-owned rebuild path rather than caller-managed migration.
5. Route graph impact, implementation review, and index-time spec coverage through the shared Code Graph resolution contract. `projectSpecCoverage` must stop using raw `symbol.name` equality as its identity proof and must project a single resolved logical target into `COVERS_SYMBOL`. CLI and SDK remain thin adapters and do not parse language syntax or reproduce selection policy. The same provider surface becomes the contract for future APIs and MCP tools. Ambiguous and unresolved results stay diagnostics; coverage must not guess. Unanchored `Tipo.miembro` and `Tipo::miembro` are exact lookups, not unproven text: every logical symbol whose stored qualified spelling equals that spelling is a hit. One hit is that member. Several hits are all returned. Impact lists them and does not traverse a guess. Search extracts every whitespace token that is itself `Tipo.miembro` or `Tipo::miembro` and looks each one up by equality. It does not remove those tokens from the query. The original query still runs through the existing symbol search, including FTS and bare-name identity. Exact hits, when any exist, rank ahead of that unchanged result set. If none exist, the result is only the normal search. A supplied file only filters the exact hits.
6. Keep `IndexCodeGraph` free of hardcoded language names, parser-state kinds, manifests, and syntax rules. It selects an adapter and persists the facts that adapter returns. `linkTypeScriptReExports` and `assignParentIds` leave the indexer: the first reads a TypeScript parser state, and the second only assigns parents for a hardcoded language set that omits Go. The language adapter resolves each re-export specifier, including a package specifier, and emits the public bindings and resolution steps that must be stored. The indexer persists that adapter payload through the existing reference-facts write. It does not read `package.json`, `exports`, `main`, relative-path rules, or TypeScript re-export routes, and it does not copy bindings itself. Symbols are not stamped with a package. The file id already carries the workspace. `@specd/code-graph` resolves through `exports["."]` to `code-graph:src/public.ts`; `@specd/code-graph/internal` resolves to `code-graph:src/index.ts`. The emitted binding keeps the re-exporting file as `surface` and the already published logical id as `targetId`, including when that id lives in another workspace. Those facts are stored before spec-coverage projection. The adapter does not pick the first same-named symbol anywhere in the target workspace.
7. Keep lexical expansion and FTS for discovery on the original query, unchanged. Graph search additionally extracts `Tipo.miembro` and `Tipo::miembro` tokens and proves them by equality on an indexed qualified spelling stored on `logical_symbols`. Nothing is dropped from the FTS query. Exact hits are merged and deduplicated with the normal hits. Every exact qualified hit ranks ahead of textual relatives. If no qualified token matches, only the normal search remains. Exact operations never use FTS as identity proof. Impact uses the same equality when its selector is a qualified spelling.
8. Preserve user-facing CLI commands, flags, filters, output formats, lifecycle behaviour, stored human implementation-link strings, location-backed occurrence IDs, simple-name selectors, and the conservative resolution outcome family. The internal member model is **not** dual-written: `MemberForm` is replaced in this change by independent `MemberSemantics` axes, and the opaque logical-ID encoding is revised in the same cut. Derived graph storage is repaired by the existing provider-owned rebuild path; there is no deprecation window where both member models or both logical encodings remain canonical.

This solution addresses issue #58 as a reusable Code Graph feature rather than an implementation-tracking exception.

## Specs affected

### New specs

None. The capability extends existing Code Graph, CLI, and SDK contracts.

### Modified specs

- `code-graph:symbol-model`: define structured qualified symbol identity and normalized, language-neutral member semantics while preserving deterministic logical and legacy occurrence identities.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:language-adapter`: require adapters to emit proven owner/member semantics and `parentId`, parse/render supported language-native member reference syntax as common structured selectors, and resolve relative and package re-exports into the public bindings and resolution steps that get stored. `resolutionManifests()` stays. The adapter owns `package.json` `name`, `exports` / `main`, and source-extension mapping.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:resolve-symbol-reference`: accept canonical, legacy, structured, simple, and human owner-qualified references through one conservative owner-first resolution policy, including adapter selection, ambiguity, provenance, freshness, hierarchy, and batch behaviour.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:graph-store`: add backend-neutral persistence and bounded indexed lookups for qualified identity, owner/member semantics, exact reference aliases or projections, and search identity fields without parsing serialized canonical IDs.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:sqlite-graph-store`: replace `logical_symbols.member_form` with the `MemberSemantics` columns, add an indexed `qualified_name` equality column on `logical_symbols`, and increment `SQLITE_SCHEMA_VERSION` from 10 to 12. Version 11 is the in-progress member-semantics schema without `qualified_name`; opening it must rebuild. Exact qualified lookup stays separate from lexical FTS. `public_bindings`, `resolution_steps`, `symbols.search_text`, and `symbol_fts` keep their current columns.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:indexer`: persist complete adapter-emitted member/reference facts incrementally, including the public bindings and owner links the adapter already resolved, project spec-lock symbol links through the shared resolver instead of exact declaration-name equality, and rebuild incompatible derived storage. The indexer hardcodes no language name, parser-state kind, manifest, or syntax rule. Coverage runs after the adapter facts are stored.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:composition`: expose and own the unified single/batch symbol-resolution surface used by every delivery channel, with provider lifecycle, availability, health, and backend independence intact.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:traversal`: require symbol impact to select canonical logical members through the shared exact lookup before traversal. One qualified hit traverses that member. Several equal `Tipo.miembro` hits are all reported and none is traversed. Bare-name, hierarchy, public-binding, and legacy-selector behaviour stays.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:graph-search`: from a query such as `GetStatus.execute otra cosa`, exact-match each `Tipo.miembro` or `Tipo::miembro` token and also run the existing full-query symbol search, including FTS, without removing any token. Exact hits rank first. No exact hit leaves the normal search as it is today. Command signature, filters, snippets, and thin-CLI stay.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:graph-impact`: resolve unanchored `Tipo.miembro` and `Tipo::miembro` by the same exact qualified spelling. One hit analyzes that member. Several hits print every candidate and do not analyze a guess. Bare multi-matches and the current ambiguity text stay.
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
- **Consumers:** graph search and impact CLI behaviour, SDK implementation review, change implementation review/status consumers, index-time `projectSpecCoverage` (`COVERS_SYMBOL` plus `coverageDiagnostics`), and future API/MCP callers.
- **Compatibility:** existing raw stored implementation symbols and sidecars are not rewritten (they remain human `Owner.member` text). Location-backed occurrence IDs, public bindings, simple-name selection, search categories, output formats, and provider lifecycle remain supported. Current `MemberForm` and the current `logical|...` encoding that embeds it are replaced in one shot; callers and persistence must use the new member-semantics axes and the new versioned logical identity after rebuild. No dual-read of old logical IDs is required beyond rebuild.
- **Performance:** exact selection uses bounded equality/index queries and shared batch health/lookups. It must not scan the full graph, run one store call per candidate/member, or turn FTS result pages into exact selectors.
- **Risk:** the symbol reference model is a critical hotspot with broad direct and transitive coupling. The change overlaps active `code-graph-symbol-semantic-context` on `code-graph:symbol-model`, `code-graph:language-adapter`, and `code-graph:indexer`; sequencing or consolidation is required before implementation.
- **External dependencies:** none are intended. Existing parsers, SQLite facilities, adapter registry, provider lifecycle, and rebuild mechanisms should be extended.

## Technical context

### Verified implementation baseline

Re-checked on 2026-09-26 against ref `920b80d4`. `graph index` discovered 1,485 files, indexed 1,187 code files, left 298 unsupported with reason `no-language-adapter`, and reported 43,943 symbols and 290 specs. The run was incremental (`filesIndexed: 0`), schema-compatible, and free of parse failures. The repository index still contains only JavaScript/TypeScript source; the installed implementation still includes TypeScript/JavaScript, Python, Go, and PHP adapters, and each adapter now also declares `resolutionManifests()` for fingerprinting. That method must be preserved when the adapter contract gains reference parse/render. The same index emitted 43 `coverageDiagnostics`. Those diagnostics are the live link failures, and they are not one problem:

| Reason                                                      | Count | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                      | In scope                                                                                                                                                                                               |
| ----------------------------------------------------------- | ----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SYMBOL_NOT_FOUND` for `Owner.member`                       |     3 | `EditChange.execute`, `TransitionChange.execute`, `UpdateImplementationTracking._validateMutation`. The member can be indexed while the stored qualified string never equals `SymbolNode.name`.                                                                                                                                                                                                                                                 | Yes                                                                                                                                                                                                    |
| `SYMBOL_NOT_FOUND` for a name absent from the anchored file |     9 | Includes `runIsolatedGraphIndex` and `GraphIndex*` errors linked at `sdk:src/index.ts`. The SDK barrel does re-export them from `@specd/code-graph`, but `linkTypeScriptReExports` only calls `resolveRelativeImportPath`, so the package specifier never becomes `code-graph:src/public.ts` and no binding is written on `sdk:src/index.ts`. The same bucket also contains labels such as `Integration (real kernel)` and `@specd/sdk barrel`. | Yes for a package re-export whose specifier resolves to exactly one indexed entry file that publishes that name. Labels stay out. Qualified-member parsing still does not move a link to another file. |
| `SYMBOL_AMBIGUOUS`                                          |     7 | `MemberForm`, `SymbolSpace`, `IndexCoverageStatus`, and `resolveSymbolReferences` each have more than one logical id for the same spelling, typically value and type.                                                                                                                                                                                                                                                                           | Report ambiguity. Do not pick a winner. Replacing `MemberForm` does not by itself collapse a value/type pair.                                                                                          |
| `FILE_NOT_INDEXED`                                          |    24 | Markdown, YAML, JSON, templates, `package.json`, wrong workspace paths such as `default:packages/core/...`, and unindexed files such as the Ladybug store.                                                                                                                                                                                                                                                                                      | No. The file never enters the code index.                                                                                                                                                              |

Issue [#52](https://github.com/specd-sdd/SpecD/issues/52) (missing `IMPORTS` / `CALLS`, including `obj.method()` and Go relations) stays out of scope. This change does not emit those edges. The adapter resolving a package re-export and emitting the stored public binding is in scope; it is not an `IMPORTS` edge.

The current implementation already contains most of the semantic building blocks, but they do not yet form a human qualified-reference pipeline:

- `packages/code-graph/src/domain/value-objects/symbol-reference.ts` defines `SymbolSpace` (`value`, `type`, `namespace`, `property`), `MemberForm` (`instance`, `static`, `constructor`, `getter`, `setter`, `signature`), `LogicalSymbol`, declaration occurrences, public/local bindings, hierarchy facts, resolution steps, adapter capabilities, resolver input/output, and the four conservative statuses `resolved`, `ambiguous`, `unresolved`, and `missing`.
- `LogicalSymbol` currently stores `id`, `workspace`, `surface`, case-preserving simple `name`, `space`, optional `ownerId`, and optional `memberForm`. Declaration locations remain in `DeclarationOccurrence`, so the logical ID is stable across line movement while the legacy location-backed `symbolId` remains available.
- `createLogicalSymbol` creates the opaque `logical|...` ID from six length-prefixed fields: workspace, surface, name, symbol space, owner ID, and member form. `parseLogicalSymbol` validates and round-trips exactly that encoding. This is already delimiter-safe and proves why `.` or `::` must not become the canonical identity delimiter.
- `ReferenceFacts` currently transports declarations, public bindings, local bindings, hierarchy, resolution steps, and capability flags. It does not yet carry a first-class qualified path, normalized multi-axis member semantics, or generic/native reference aliases.
- `LanguageAdapter` currently exposes language/extension discovery, synchronous pure file analysis, import resolution, relation building, optional package/qualified-name helpers, and `resolutionManifests()` for adapter-sourced fingerprint inputs. It still has no method for parsing a human symbol reference or rendering a generic/native reference.
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
- **Route index coverage through the same resolver.** `projectSpecCoverage` is the writer behind `graph index` `coverageDiagnostics`. It currently proves identity with `symbol.name === storedString` inside the anchored file. That check has to become a call into the shared exact resolver, still anchored to the link file, still requiring exactly one logical target before writing `COVERS_SYMBOL`.
- **Keep the indexer language-neutral.** `IndexCodeGraph` selects an adapter from the registry and persists the facts that adapter returns. It hardcodes no language name, parser-state kind, manifest, or syntax rule. Two current violations leave the indexer in this change. `linkTypeScriptReExports` and the `TypeScriptReExport` types read TypeScript parser state and copy bindings; the TypeScript adapter resolves relative and package specifiers (`name`, `exports` / `main`, `.js` to source) and returns those public bindings and resolution steps. `assignParentIds` skips every language outside a hardcoded set (`typescript`, `tsx`, `javascript`, `jsx`, `python`, `php`) and then assigns method parents itself; the adapter that analyzed the file emits `parentId` / owner instead. The indexer writes both through the existing generic `writeReferenceFacts` path. It does not add a package field to `LogicalSymbol`. Store the facts before `projectSpecCoverage`. Do not reuse the current package-import fallback that takes `findSymbolsByName(...)[0]` inside the workspace prefix.
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

Parsing must return zero, one, or multiple explicit structured candidates rather than a guessed winner. Canonical and already-structured requests bypass textual parsing. For text, adapter selection should prefer, in order of available proof, an explicitly supplied language, the language of an anchored indexed `filePath`, indexed public/module surface metadata, or another uniquely proven context. An unanchored `Tipo.miembro` or `Tipo::miembro` does not pick an adapter. It matches `qualified_name`. Adapter parsing remains for anchored or language-proven structured selectors. An unanchored spelling must not be interpreted by an arbitrary default adapter. TypeScript/Python dotted syntax, PHP `::`, Go receiver notation, nested owners, escaping, and future delimiters are adapter concerns; core orchestration only handles structured candidates.

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

### Database changes

`SQLITE_SCHEMA_VERSION` in the working tree is **11** (`packages/code-graph/src/infrastructure/sqlite/schema.ts`). Published storage before this change is version 10. The DDL uses `CREATE TABLE IF NOT EXISTS`, so an existing database does not gain or drop columns on open. `ensureSchemaVersion` compares `meta.schemaVersion` with that constant and throws `GraphSchemaIncompatibleError` on any other value. That error is recovered as `SCHEMA_INCOMPATIBLE`, which recreates derived storage on reindex. There is no `ALTER TABLE` migration and no dual-read of the old row shape.

This change **must increment the constant to 12** in the same revision as the DDL. Version 11 replaces `member_form` and re-encodes `logical_symbols.id`, but it has no exact qualified spelling. Local indexes already at 11, and any version-10 file, rebuild when opened by version 12.

`logical_symbols` in version 12:

| Column                                                    | Change                                                                                                                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`, `workspace`, `surface`, `name`, `space`, `owner_id` | Unchanged columns. `id` remains the primary key. Stored id text is the new encoding; old ids are discarded by the rebuild.                                               |
| `member_form`                                             | Removed. Not kept beside the new axes.                                                                                                                                   |
| `member_kind`                                             | Added, nullable `TEXT`. `MemberSemantics.kind`.                                                                                                                          |
| `member_dispatch`                                         | Added, nullable `TEXT`. `MemberSemantics.dispatch`.                                                                                                                      |
| `member_accessor`                                         | Added, nullable `TEXT`. `MemberSemantics.accessor`.                                                                                                                      |
| `native_kind`                                             | Added, nullable `TEXT`. `MemberSemantics.nativeKind`.                                                                                                                    |
| `qualified_name`                                          | Added, nullable `TEXT`. Generic dotted spelling rebuilt from the owner chain, such as `GetStatus.execute`. Null when the symbol has no owner. Not a second canonical id. |

`idx_logical_symbols_member_lookup` is recreated on `(workspace, surface, name, space, owner_id, member_kind, member_dispatch, member_accessor, native_kind)`. `idx_logical_symbols_lookup` stays `(workspace, surface, name, space)`. A new equality index covers `qualified_name`. Inserts, selects, and the worker row shape use the new columns in the same revision. `LogicalSymbolLookup` replaces `memberForm` with the same four axes and can match `qualified_name` by equality.

These tables do **not** change columns. The version bump still recreates their rows:

| Table                                                                   | What version 12 stores                                                                                                                                                         |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `public_bindings`                                                       | Same columns (`id`, `surface`, `exported_name`, `space`, `target_id`). New rows are the package and relative re-export bindings the adapter emits.                             |
| `resolution_steps`                                                      | Same columns. New rows record those re-export routes.                                                                                                                          |
| `symbols.parent_id`                                                     | Column already exists. The adapter fills it. The indexer no longer derives it from a language list.                                                                            |
| `logical_declarations`, `local_bindings`, `index_coverage`, `relations` | Same columns.                                                                                                                                                                  |
| `symbol_fts`                                                            | Same columns (`id`, `search_text`, `comment`). The qualified spelling may still appear inside `search_text` for discovery. It is not the exact-match key. No extra FTS column. |
| `symbols.search_text`                                                   | Unchanged. Expanded bare `symbols.name` only. Search does not read it, and it is not the qualified spelling.                                                                   |

Raw implementation-link sidecars, spec files, and source files are not rewritten. The only durable graph change is the recreated SQLite derived store at version 12. SQLite owns the physical columns; another `GraphStore` backend must return the same member axes and the same lookup results.

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

The splitter therefore stays. Search and impact gain an equality lookup on `logical_symbols.qualified_name`. `GetStatus.execute` and `GetStatus::execute` compare as the same generic dotted spelling. The lookup does not require a file. One row is that member. Every equal row is returned. A file selector only filters the set. Search extracts each whitespace token that is wholly `Tipo.miembro` or `Tipo::miembro` and looks it up by equality. The original query, including `GetStatus.execute otra cosa`, still goes through the current symbol search unchanged: FTS plus bare-name identity. No token is removed from that path. Results merge by canonical logical ID. Every exact qualified hit ranks before the normal hits. If the extracted spelling matches nothing, the normal search is the whole result. A bare name such as `execute` has no qualified token and stays on that normal path only. FTS tokenization and BM25 are never identity evidence because punctuation such as `.` and `::` may be removed, tokenized, stemmed, or handled differently by another backend.

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

For each representative qualified reference, implementation review must identify the expected logical member. Unanchored graph search for `GetStatus.execute`, `GetStatus::execute`, and `GetStatus.execute otra cosa` must return that member ahead of the normal full-query hits, which still include the `GetStatus` type and the other words. The full query must still be searched. No token is dropped. A bare `execute` must still return the methods of that name. When several logical symbols share `GetStatus.execute`, search returns all of them and impact lists all of them without traversing one. Provider, SDK, and CLI results must agree. Tests must also cover nested owners, overloaded or merged declarations, constructors, interface signatures, getters/setters, static versus instance dispatch, inheritance, aliases/re-exports, case rules, unknown languages, stale/partial indexes, absent members, and multi-candidate ambiguity.

### Risk, overlap, and sequencing evidence

Graph impact for `code-graph:src/domain/value-objects/symbol-reference.ts` on 2026-09-26 is **CRITICAL**: 36 direct dependents, 150 indirect dependents, 96 transitive dependents, and 86 affected files. The affected surface includes the indexer, `projectSpecCoverage`, resolver, search, provider, GraphStore, SQLite worker/protocol, all four language adapters, traversal, graph-health fingerprinting, adapter resolution-manifest tests, SDK review tests, and public barrels.

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

Recorded during proposal review. The review decisions below are closed.

- **One-shot internal model:** no deprecation window for dual member models or dual logical encodings. Graph rebuild is the migration.
- **`MemberForm`:** replaced by `MemberSemantics` (`kind`, `dispatch`, `accessor`, optional `nativeKind`) in this change.
- **Canonical identity:** replace the current `logical|...` encoding (which embeds `memberForm`) with one versioned, delimiter-safe canonical reference that includes the new member-semantics axes. Do not wrap and keep the old ID unchanged. Location-backed occurrence IDs remain a separate legacy selector.
- **`SymbolKind`:** stays the closed broad enum (`function`, `class`, `method`, `variable`, `type`, `interface`, `enum`). Namespace/module is a path-segment role and `surface`/owner identity, not a new kind.
- **Namespace/module:** qualification hop (`SymbolPathSegment.role`), not a first-class impact/search kind and not `graph impact --package` in this change.
- **Indexer stays language-neutral:** `IndexCodeGraph` hardcodes no language. Adapters resolve syntax and emit the facts that are stored, including re-export public bindings and owner/parent links. The indexer only persists that payload. No package mark on the symbol. Cross-workspace is allowed when the adapter's target file id is in the session. `IMPORTS` / `CALLS` edges remain out of scope.
- **SQLite schema:** `SQLITE_SCHEMA_VERSION` goes to 12. `logical_symbols.member_form` is replaced by `member_kind`, `member_dispatch`, `member_accessor`, and `native_kind`. `logical_symbols.qualified_name` stores the generic dotted owner path and is indexed for equality. `symbols.search_text` and `symbol_fts` keep their columns and do not prove that path. Version 10 and version 11 both rebuild. No `ALTER TABLE` and no dual schema.

## Gaps found in the previous proposal

Reviewed against the 2026-09-26 index and the current coverage writer. These are now incorporated above:

- The baseline counts (1,086 files, 37,564 symbols, 273 specs) were stale, and the blast-radius counts were stale.
- The proposal treated implementation review as the primary failing consumer. The diagnostics the index prints come from `projectSpecCoverage`, which never calls `ResolveSymbolReference`.
- It did not separate the 43 diagnostics into qualified-member misses, ambiguous value/type pairs, wrong-file or label links, and files the indexer cannot parse. Treating every diagnostic as in scope would expand this change into file-type support and spec-lock cleanup.
- It did not record `LanguageAdapter.resolutionManifests()`, added by `adapter-sourced-resolution-fingerprint`. New adapter methods must keep that contract.
- It did not state that issue #52 call/import edges stay out of scope.
- It described the SDK-barrel misses as names absent from the anchored file. The source does re-export them from `@specd/code-graph`. The indexer linker drops them because it only resolves relative specifiers, so the binding never lands on `sdk:src/index.ts`. The adapter now resolves that specifier and emits the stored binding. The indexer does not keep a TypeScript re-export pass.

## Resolved review decisions

Closed before spec deltas:

1. **Overlap sequencing:** this change owns logical owner and member identity. `code-graph-symbol-semantic-context` narrows to ranges and `declarationText`.
2. **Qualified projection:** store the generic dotted path on `logical_symbols.qualified_name` and index it for equality. `symbol_fts.search_text` may still contain that text for discovery. It is not the exact key. `symbols.search_text` stays the bare name.
3. **Reference aliases:** one stored generic spelling joined with `.`. A query that uses `::` compares as that same spelling. No alias table.
4. **Unanchored text:** `Tipo.miembro` and `Tipo::miembro` resolve by `qualified_name` equality with no file, surface, or language. One row resolves. Every equal row is returned. Search shows them all as exact hits. Impact lists them all and does not traverse a guess. A file, when present, only filters. Do not run every language adapter to interpret the spelling.
5. **Search activation:** each whitespace token that is wholly `Tipo.miembro`, `Tipo::miembro`, or a canonical `logical|2|` id is an additional exact qualified lookup. The original query always runs through the existing symbol search, including FTS and bare-name identity. No token is removed from that search. Exact hits rank first. No exact hit leaves the normal result unchanged. A bare name such as `execute` is not a qualified token.
6. **Scope:** `cli:change-implementation` and `code-graph:workspace-integration` stay contextual consumers. No extra spec deltas.

## Open questions

None. The 2026-09-27 review closed unanchored `Tipo.miembro` lookup: exact equality on `logical_symbols.qualified_name` for each qualified token found in the query, every equal hit returned, and the original query still searched in full by the existing symbol/FTS path. Nothing is removed from that path.
