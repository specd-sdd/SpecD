# Tasks: language-agnostic-member-symbol-references

## 1. Member semantics model

- [x] 1.1 Add member-semantics enums and types
      `packages/code-graph/src/domain/value-objects/symbol-reference.ts`: `MemberKind`, `MemberDispatch`, `MemberAccessor`, `MemberSemantics`, `SymbolPathSegment`, `StructuredSymbolReference`, `ParsedSymbolReference` — add the const objects and interfaces from the design
      Approach: `kind` is required on a member; `dispatch`, `accessor`, and `nativeKind` are optional. Instance getter is `{ kind: 'property', dispatch: 'instance', accessor: 'get' }`. Constructor is `{ kind: 'constructor' }` with no dispatch. Export the types from `src/index.ts` and `src/public.ts` with JSDoc
      (Req: Member semantics and symbol spaces)
- [x] 1.2 Replace `memberForm` on `LogicalSymbol`
      `packages/code-graph/src/domain/value-objects/symbol-reference.ts`: `LogicalSymbol` — remove `memberForm` and the `MemberForm` const. Add `memberSemantics?: MemberSemantics`
      Approach: non-members leave `memberSemantics` undefined. Do not add a package field or a qualified-path field. `SymbolKind` stays the closed enum
      (Req: Logical symbol and canonical reference model)
- [x] 1.3 Encode `logical|2|` ids
      `packages/code-graph/src/domain/value-objects/symbol-reference.ts`: `createLogicalSymbol`, `parseLogicalSymbol` — nine length-prefixed fields after the prefix `logical|2|`: workspace, surface, name, space, ownerId, memberKind, memberDispatch, memberAccessor, nativeKind
      Approach: empty string means absent. Reject any id that does not start with `logical|2|`, including the old six-field `logical|` form, by returning `undefined`. Do not split on `.` or `::`
      (Req: Logical symbol and canonical reference model)

## 2. Adapter contract

- [x] 2.1 Add parse, render, and re-export methods
      `packages/code-graph/src/domain/value-objects/language-adapter.ts`: `LanguageAdapter` — add optional `parseSymbolReference`, `renderSymbolReference`, and `linkReExports` with the signatures in the design
      Approach: parse and render are pure. `linkReExports` may read manifests. `resolutionManifests()` stays and still does no I/O
      (Req: Human reference parse and render, Re-export public bindings)
- [x] 2.2 Add the exact-lane predicate
      `packages/code-graph/src/domain/services/exact-lane-query.ts`: `isExactLaneQuery` — true for prefix `logical|2|`, for `::`, or for `/^[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*$/`
      Approach: this function does not resolve a member and is not called from CLI
      (Req: Semantic-first candidate lanes)

## 3. Language adapters

- [x] 3.1 Emit `MemberSemantics` from TypeScript
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: replace `typeScriptMemberForm` — map instance methods, static methods, getters, setters, and constructors to `MemberSemantics`
      Approach: drop a member whose owner is missing or cyclic. Do not emit `MemberForm`
      (Req: Member semantics and declaration parent)
- [x] 3.2 Set TypeScript `parentId` during analysis
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `analyzeFile` — set `SymbolNode.parentId` for nested declarations. Omit it on top-level functions
      Approach: the indexer will no longer assign parents
      (Req: Member semantics and declaration parent)
- [x] 3.3 Parse and render TypeScript references
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `parseSymbolReference`, `renderSymbolReference` — `EditChange.execute` becomes one owner-then-member candidate. Dynamic text returns no candidate. Do not parse a `logical|2|` id
      Approach: generic render joins owner simple names and the member with `.`. Native render for TypeScript equals the generic spelling
      (Req: Human reference parse and render)
- [x] 3.4 Emit `MemberSemantics` and `parentId` from Python
      `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`: replace `pythonMemberForm` and set `parentId` in `analyzeFile`
      Approach: same axes and the same cyclic-owner drop as TypeScript
      (Req: Member semantics and declaration parent)
- [x] 3.5 Parse and render Python dotted references
      `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`: `parseSymbolReference`, `renderSymbolReference`
      Approach: one dotted owner-then-member candidate. No guessed dynamic members
      (Req: Human reference parse and render)
- [x] 3.6 Emit Go member semantics and receiver parent
      `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`: replace any member-form helper. A method's `parentId` is the receiver declaration. A top-level function omits `parentId`
      Approach: Go must not depend on an indexer language allowlist
      (Req: Member semantics and declaration parent)
- [x] 3.7 Parse and render Go references
      `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`: `parseSymbolReference`, `renderSymbolReference`
      Approach: render the generic dotted spelling. Parse only syntax this adapter can prove
      (Req: Human reference parse and render)
- [x] 3.8 Emit PHP member semantics and `parentId`
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: replace `phpMemberForm` and set `parentId` in `analyzeFile`
      Approach: same cyclic-owner drop
      (Req: Member semantics and declaration parent)
- [x] 3.9 Parse PHP `::` and the generic dotted spelling to the same segments
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: `parseSymbolReference`, `renderSymbolReference`
      Approach: `ArchiveChange::execute` and `ArchiveChange.execute` yield the same owner-then-member segments. Native render uses `::`
      (Req: Human reference parse and render)
- [x] 3.10 Update shared reference-fact helpers
      `packages/code-graph/src/infrastructure/tree-sitter/reference-fact-helpers.ts`: `buildLogicalDeclarationFacts` and declaration descriptors — carry `MemberSemantics` instead of `MemberForm`
      Approach: keep the two-pass owner materialization. Drop a required-owner member when the owner is missing or cyclic
      (Req: Member semantics and declaration parent)

## 4. Package re-export bindings

- [x] 4.1 Resolve a package specifier to an indexed source file
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: private entry resolution used by `linkReExports` — `resolvePackageFromSpecifier`, then `packageToWorkspace`, then the target workspace `package.json` `exports` or `main`
      Approach: map `dist/X.js` to `src/X.ts`, then `src/X.tsx`, then `src/X/index.ts`, under the target workspace prefix. `@specd/code-graph` → `code-graph:src/public.ts`. `@specd/code-graph/internal` → `code-graph:src/index.ts`. Never return `sdk:src/@specd/code-graph.ts`
      (Req: Re-export public bindings)
- [x] 4.2 Copy entry-file bindings onto the re-exporting file
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `linkReExports` — relative specifiers use `resolveRelativeImportPath`. One indexed session file wins. Two indexed candidates emit nothing
      Approach: named export writes `exportedName`, including `export { A as B }`. Star export copies every non-default binding. If the entry has no binding, use the single same-file declaration. Do not call `findSymbolsByName(...)[0]`. Repeat until a pass adds nothing, capped at the session file count
      (Req: Re-export public bindings)
- [x] 4.3 Delete the indexer TypeScript linker and parent assigner
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: remove `linkTypeScriptReExports`, `TypeScriptReExport`, `TypeScriptReExportState`, and `assignParentIds`
      Approach: after same-file bindings exist and before `projectSpecCoverage`, call `adapter.linkReExports?.(session, packageToWorkspace)` for each registered adapter and merge the returned facts. Do not read `parserState.kind` or any language name
      (Req: Reference fact indexing, Cross-workspace package resolution)

## 5. Store and schema 11

- [x] 5.1 Replace `memberForm` on store lookups
      `packages/code-graph/src/domain/ports/graph-store.ts`: `LogicalSymbolLookup` — remove `memberForm`. Add optional `memberKind`, `memberDispatch`, `memberAccessor`, `nativeKind`
      Approach: an omitted axis does not filter. A provided axis is SQL equality and does not match a stored `NULL`
      (Req: Member-semantics persistence)
- [x] 5.2 Bump the SQLite schema to 11
      `packages/code-graph/src/infrastructure/sqlite/schema.ts`: `SQLITE_SCHEMA_VERSION` from 10 to 11. Drop `member_form`. Add nullable `member_kind`, `member_dispatch`, `member_accessor`, `native_kind`. Recreate `idx_logical_symbols_member_lookup` on those columns
      Approach: no `ALTER TABLE`. `public_bindings`, `resolution_steps`, `symbols.parent_id`, and `symbol_fts` keep their columns. A normalized qualified spelling is appended to existing `search_text`
      (Req: Reference schema upgrade)
- [x] 5.3 Update SQLite reads, writes, and the worker row
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`, `sqlite-worker.ts`, `sqlite-worker-protocol.ts`: insert and select the four new columns. Remove every `member_form` reference
      Approach: version other than 11 still throws `GraphSchemaIncompatibleError` with recovery `SCHEMA_INCOMPATIBLE`. Opening version 11 does not rebuild
      (Req: Reference schema upgrade)

## 6. Resolution, coverage, search, impact

- [x] 6.1 Resolve owner first
      `packages/code-graph/src/application/use-cases/resolve-symbol-reference.ts`: `normalizeRequest` and `resolvePrepared` — accept `memberSemantics`. Parse `logical|2|` before human text. Map a location-backed id to its current logical symbol
      Approach: human text is parsed only when an explicit language, `filePath`, or `publicSurface` identifies an adapter. Otherwise return `unresolved` and do not loop adapters. Then declaration, public binding (`publicSurface` + exported name + space), local binding, hierarchy. A known owner with a missing member is `unresolved`. Value and type with no space is `ambiguous`
      (Req: Structured reference input, Deterministic resolution precedence)
- [x] 6.2 Project coverage through the resolver
      `packages/code-graph/src/application/services/project-spec-coverage.ts`: `projectSpecCoverage` — stop comparing `symbol.name` to the stored string
      Approach: request `{ workspace, requested: symbol, filePath: file, publicSurface: file }`. One `resolved` id writes `COVERS_SYMBOL`. `ambiguous` → `SYMBOL_AMBIGUOUS`. `unresolved` or `missing` → `SYMBOL_NOT_FOUND`. Do not move the link to another file. Run only after re-export facts are stored
      (Req: Deterministic implementation coverage projection)
- [x] 6.3 Add the search exact lane
      `packages/code-graph/src/application/use-cases/search-code-graph.ts`: `executeSymbols` — when `isExactLaneQuery` is true, call the resolver. A single `resolved` target gets the exact-logical-identity tier and ranks first. `unresolved` and `ambiguous` add no proven target
      Approach: ordinary names still use the existing declaration, public-binding, and lexical tiers. Full-text rank is not identity proof. Kind, workspace, and path filters still apply after the exact lane
      (Req: Semantic-first candidate lanes)
- [x] 6.4 Start impact from the resolver
      `packages/code-graph/src/domain/services/analyze-impact.ts`: select the start id with `ResolveSymbolReference` before traversal
      Approach: one logical id traverses only that id. Unanchored qualified text does not start traversal. Ambiguous qualified text does not fall through to the terminal name. Bare multi-matches still analyze each. Traversal functions stay id-based and do not parse text
      (Req: Owner-qualified impact target)
- [x] 6.5 Pass one adapter registry into the provider
      `packages/code-graph/src/composition/create-code-graph-provider.ts`, `code-graph-provider.ts`: the registry constructed for `IndexCodeGraph` is the same object used by symbol resolution
      Approach: do not build a second registry and do not hardcode language names. Unanchored text stays `unresolved`
      (Req: Adapter-backed reference normalization)

## 7. CLI and SDK

- [x] 7.1 Keep graph search free of parsing
      `packages/cli` graph search command: pass the query string to the provider. Do not split `.` or `::` and do not open SQLite
      Approach: command flags and output formats stay. The provider decides the exact lane
      (Req: Semantic-first candidate lanes)
- [x] 7.2 Keep graph impact free of parsing
      `packages/cli` graph impact command: pass `--symbol` to the provider resolver
      Approach: unanchored `EditChange.execute` prints `No symbol found matching "EditChange.execute".` and exits 0. Ambiguous owner-qualified text reports ambiguity and does not analyze a guess. Three bare `validate` matches still print three reports. Empty selector stays `INVALID_GRAPH_SELECTOR`
      (Req: Symbol impact analysis)
- [x] 7.3 Forward stored review text unchanged
      `packages/sdk/src/orchestration/build-implementation-review.ts`: `buildResolutionRequests` — `requested` is the stored string and `filePath` is the link file when present
      Approach: one batch call. Preserve order. Do not parse, do not choose an adapter, and do not turn `@specd/sdk barrel` into a package lookup. Copy `unresolved` and `ambiguous` into the review row
      (Req: Unparsed stored symbol text)
- [x] 7.4 Update the CLI resolution test double
      `packages/cli/test/commands/change-implementation-tracking.spec.ts`: the fake logical target — replace `memberForm: 'instance'` with `memberSemantics`
      Approach: no CLI flag changes. This is the only CLI source of the old field name
      (Req: Unparsed stored symbol text)

## 8. Documentation

- [x] 8.1 Update the logical-symbol ADR
      `docs/adr/0024-logical-symbol-resolution.md`: replace the member-form sentence with `MemberSemantics` and the `logical|2|` id. State that schema 11 drops `member_form` and that `graph index` rebuilds derived storage
      Approach: do not edit other docs. None of them name `MemberForm`
      (Req: Logical symbol and canonical reference model)

## 9. Tests

- [x] 9.1 Unit-test canonical ids and member axes
      `packages/code-graph/test/domain/symbol-reference.spec.ts`: old six-field id is `undefined`. `logical|2|` round-trips all four axes. Value and type stay distinct. Instance and static getters differ. Constructor has no dispatch. `Execute` and `execute` differ. Line movement keeps the id. Display path `EditChange.execute` is rebuilt from `ownerId` and the symbol has no package field
      Approach: pure domain tests, no store
      (Req: Logical symbol and canonical reference model, Member semantics and symbol spaces)
- [x] 9.2 Test TypeScript parse, render, and re-exports
      `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`: dotted parse, dynamic text, canonical id not parsed, `resolutionManifests()` does no I/O, package root to `public.ts`, internal subpath to `index.ts`, relative `./public.js`, two candidates, missing name, unknown package, `export { A as B }`, star export skips default, value and type are two bindings
      Approach: use an in-memory session. Assert the binding surface is the re-exporting file and the target is the entry file's logical id
      (Req: Human reference parse and render, Re-export public bindings)
- [x] 9.3 Test Go and PHP parents and PHP spelling
      `packages/code-graph/test/infrastructure/tree-sitter/go-language-adapter.spec.ts` and `php-language-adapter.spec.ts`: Go method `parentId` is the receiver. Top-level Go function omits it. Anchored `ArchiveChange::execute` matches generic `ArchiveChange.execute`. A TypeScript file does not use the PHP parser
      Approach: adapter unit tests
      (Req: Member semantics and declaration parent, Human reference parse and render)
- [x] 9.4 Test resolver edges
      `packages/code-graph/test/application/use-cases/resolve-symbol-reference.spec.ts`: unanchored text unresolved. Explicit PHP language does not call TypeScript. Owner before member. `EditChange.missing` unresolved. Binding needs surface plus name. File path alone does not match. Value/type `MemberForm` ambiguous. Legacy occurrence id and `logical|2|` skip human parsing
      Approach: extend the existing resolver spec
      (Req: Structured reference input, Deterministic resolution precedence)
- [x] 9.5 Test schema 11
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`: versions 9, 10, and 12 throw `GraphSchemaIncompatibleError` and do not `ALTER TABLE`. Version 11 opens without rebuild. After reindex, `member_form` is gone, the four columns exist, old ids are gone, `public_bindings` and `symbol_fts` columns are unchanged, qualified text is inside `search_text`. Worker row uses the new columns. Instance dispatch does not return a static getter. A top-level function stores null axes. Lookup does not parse the canonical id
      Approach: extend the existing SQLite store spec
      (Req: Reference schema upgrade, Member-semantics persistence)
- [x] 9.6 Test index coverage and language-neutral linking
      `packages/code-graph/test/application/use-cases/index-project-graph-integration.spec.ts`: `EditChange.execute` on its file writes one `COVERS_SYMBOL`. The SDK barrel binding for `runIsolatedGraphIndex` exists before coverage and targets the code-graph id. `@specd/sdk barrel` and `Integration (real kernel)` are `SYMBOL_NOT_FOUND`. Value/type `MemberForm` is `SYMBOL_AMBIGUOUS`. A markdown link is `FILE_NOT_INDEXED`. Go `parentId` is present
      Approach: assert behavior, not the absence of a function name via source scan
      (Req: Deterministic implementation coverage projection, Reference fact indexing, Cross-workspace package resolution)
- [x] 9.7 Test search lanes
      `packages/code-graph/test/application/use-cases/search-code-graph.spec.ts`: `execute` does not use the owner-qualified resolver. `Change` and a public `run` binding keep their current tiers. Unanchored `EditChange.execute` proves nothing. Anchored, that member ranks first. Ambiguous `Owner.execute` adds no proven hit. `--kind variable` still filters. Unanchored `ArchiveChange::execute` proves nothing. Anchored to PHP, that member ranks first
      Approach: extend the existing search spec
      (Req: Semantic-first candidate lanes)
- [x] 9.8 Test one registry
      `packages/code-graph/test/composition/code-graph-provider.spec.ts`: indexing and resolution share one registry instance. Unanchored text is `unresolved`. A custom adapter on that registry is the one resolution uses
      Approach: extend the provider spec
      (Req: Adapter-backed reference normalization)
- [x] 9.9 Test CLI impact behavior
      `packages/cli/test` graph-impact specs: unanchored `EditChange.execute` prints the not-found line and exits 0. Ambiguous owner-qualified text reports ambiguity. Three bare `validate` matches still print three reports. The test double records no SQLite and no `package.json` access
      Approach: command tests through the existing CLI harness
      (Req: Symbol impact analysis)
- [x] 9.10 Test SDK review forwarding
      `packages/sdk/test` implementation-review specs: `EditChange.execute` is forwarded unchanged with its file. Three links keep order in one batch. A link with no file is forwarded with an empty file. `@specd/sdk barrel` stays unresolved. An ambiguous provider result stays ambiguous
      Approach: extend the existing review spec
      (Req: Unparsed stored symbol text)

## 10. Manual check

- [x] 10.1 Reindex and read the coverage diagnostics
      Run `node packages/cli/dist/index.js graph index --format text` twice
      Approach: the first run rebuilds schema 10 into 11. The second run is incremental. `EditChange.execute`, `TransitionChange.execute`, `UpdateImplementationTracking._validateMutation`, and `runIsolatedGraphIndex` linked at `sdk:src/index.ts` are absent from `SYMBOL_NOT_FOUND`. `@specd/sdk barrel` remains `SYMBOL_NOT_FOUND`. No `member_form` error is printed
      (Req: Reference schema upgrade, Deterministic implementation coverage projection)

## 11. Qualified-name exact lookup

Follow-up after review. Groups 1–10 stay as completed work. These tasks add stored `qualified_name` and make search and impact use it without dropping the original query.

- [x] 11.1 Store `qualifiedName` on the logical symbol
      `packages/code-graph/src/domain/value-objects/symbol-reference.ts`: `LogicalSymbol` — add `qualifiedName?: string`, absent when there is no owner, not encoded in `logical|2|`
      Approach: keep the nine-field canonical id. Set the field when the owner chain is known
      (Req: Logical symbol and canonical reference model)
- [x] 11.2 Add `qualifiedLookupText`
      `packages/code-graph/src/domain/services/exact-lane-query.ts`: `qualifiedLookupText` — dotted token unchanged, one `::` pair becomes `.`, anything else `undefined`
      Approach: do not split a single `:`
      (Req: Structured reference input)
- [x] 11.3 Persist and index `qualified_name` at schema 12
      `packages/code-graph/src/infrastructure/sqlite/schema.ts`: `SQLITE_SCHEMA_VERSION` 12, nullable `qualified_name`, `idx_logical_symbols_qualified_name`
      Approach: versions 10 and 11 throw `GraphSchemaIncompatibleError` with expected 12. No `ALTER TABLE`. Worker row includes the column
      (Req: Reference schema upgrade)
- [x] 11.4 Equality lookup on the store
      `packages/code-graph/src/domain/ports/graph-store.ts` and the SQLite store: return every logical symbol whose `qualified_name` equals the spelling
      Approach: equality, not FTS. `symbols.search_text` stays the bare name
      (Req: Member-semantics persistence)
- [x] 11.5 Write `qualified_name` while indexing
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: when writing a logical symbol, walk `ownerId` and join simple names with `.`
      Approach: no owner stores null. Do not treat FTS text as the exact copy
      (Req: Reference fact indexing)
- [x] 11.6 Resolve dotted and `::` text by equality
      `packages/code-graph/src/application/use-cases/resolve-symbol-reference.ts`: if `qualifiedLookupText` is defined, return every match; one is resolved, several are ambiguous, zero is unresolved. A file filters visibility. Do not pick an adapter for that branch
      Approach: other human text still needs a file, surface, or language
      (Req: Structured reference input, Deterministic resolution precedence)
- [x] 11.7 Search exact tokens without dropping the query
      `packages/code-graph/src/application/use-cases/search-code-graph.ts`: split on whitespace, exact-lookup each qualified token, and still call `searchSymbols` with the original query
      Approach: exact hits use `exact-logical-identity` and sort first. No match leaves the normal result. `execute` is not a qualified token. `GetStatus.execute otra cosa` keeps both lanes
      (Req: Semantic-first candidate lanes)
- [x] 11.8 Impact lists every equal qualified name
      `packages/code-graph/src/application/services/resolve-graph-selector.ts` and `packages/cli/src/commands/graph/impact.ts`: one `qualified_name` traverses; several print every candidate and do not analyze; zero prints `No symbol found` and does not search the terminal name
      Approach: bare multi-matches still analyze each. A file in the selector only filters
      (Req: Owner-qualified impact target, Symbol impact analysis)
- [x] 11.9 Update ADR schema text
      `docs/adr/0024-logical-symbol-resolution.md`: mention `qualified_name` and schema 12
      Approach: replace the schema 11 sentence. Do not add another doc
      (Req: Reference schema upgrade)
- [x] 11.10 Retest the new exact behavior
      Update the resolver, SQLite, indexer, search, provider, and CLI impact specs listed in the design Testing section so unanchored `EditChange.execute` and `ArchiveChange::execute` are exact hits, several `Owner.execute` values are all returned, `GetStatus.execute otra cosa` keeps the full-query search, and schema 12 is the open version
      Approach: replace the assertions that expected unanchored text to stay unproven
      (Req: Semantic-first candidate lanes, Symbol impact analysis, Reference schema upgrade)
