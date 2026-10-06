# Tasks

## Overview

Implement the SDK development guide feature end-to-end. This includes extending the guide domain model to be collection-aware, building out a multi-collection build-time bundler (with TypeDoc integration), creating an SDK collection engine exposed via `@specd/guide/sdk`, registering the `specd guide-sdk` CLI command, updating generated catalogs and README, and adding the necessary documentation and sidebars. All changes must satisfy the updated specs and pass validation.

## Tasks

### 1. Update domain model (guide-model)

- [x] Add `collection` field to `GuideTopic`, `GuideSummary`, `GuideOutline`, `GuideSearchHit`, `GuideSection` types as needed and update their JSDoc.
- [x] Enforce collection-qualified identity semantics (canonical `collection:topic`, reserved `:`, `/` preserved).
- [x] Update type exports and maintain immutability contracts.

### 2. Update bundler to support multi-collection (bundle-guides)

- [x] Extend bundler configuration to accept multiple collection roots (user + SDK sources). Traverse recursively and filter for `.md` only.
- [x] Add strict frontmatter validation with clear file names in errors. Validate title/description/sidebar_position for hand-written docs.
- [x] Add TypeDoc invocation as a library using curated API entry points (`@specd/sdk`, `@specd/core`, `@specd/code-graph`) and public-site typedoc options. Generate SDK collection topics from reflections (synthesized frontmatter; each symbol addressable).
- [x] Emit separate JSON catalogs: `generated/guides.json` (user) and `generated/guides-sdk.json` (SDK). Preserve byte-for-byte identity for the user catalog when adding SDK. Include offsets `startOffset`/`endOffset` without serializing section `content`, and serialize catalog arrays plus index maps.
- [x] Handle empty roots with explicit errors. Handle generated topics' `file` paths (TypeScript declarations for API symbols, Markdown paths for hand-written).
- [x] Update `package.json` scripts so `build` and `build:dev` run bundler before compilation.

### 3. Update composition and ports (list/get/outline/search/slice/errors)

- [x] Update `GuideCatalogPort` to expose `getAllGuides()` and `getCollections()` and enforce one-catalog-per-port with collection-qualified resolution.
- [x] Update queries: ListGuidesQuery supports scope + pagination, filtering before ordering, locale-sensitive tie-breaks. GetGuide/GetGuideOutline apply normalization and propagate errors with collection-scoped qualified `availableTopics`. Section extraction uses offsets, numeric selector digits-only, ambiguity throws `GuideSectionAmbiguousError`.
- [x] Update search adapter to use namespaced IDs per collection, emit real paths and collection-derived `readCommand`, index `level/startLine/endLine`, and adjust stop-word behavior (no prefilter emptying results).
- [x] Update errors to carry collection-scoped available topics and preserve raw inputs. Remove dependency assumptions on `@specd/core` where specified.

### 4. Composition factories and subpath exports

- [x] Add SDK collection engine factory; expose via `./sdk` subpath. Ensure main entry does not load/export SDK catalog.
- [x] Update exports in package.json to declare `.`, `./internal`, `./sdk` with import/types pairs. Ensure build tooling remains in devDependencies.
- [x] Ensure generated files are built and committed so dependents do not access source roots.

### 5. README and catalog parity

- [x] Update `packages/guide/README.md` to keep topic catalog in parity with generated user catalog. Document SDK collection entry point and architecture notes.
- [x] Regenerate catalogs as part of build process.

### 6. CLI: guide-sdk command

- [x] Register `guide-sdk` as top-level command in `@specd/cli` (alongside `guide`). Wire to SDK engine from `@specd/guide/sdk`.
- [x] Implement catalog listing with `--scope` and pagination; default listing excludes generated API topics. Include collection-qualified fields.
- [x] Implement topic inspection, `--meta` (with collection, real paths, offsets), section extraction, line slicing, and search subcommand with collection-derived `readCommand`.
- [x] Inherit standard CLI contracts: config discovery (global/local), stdout/stderr, exit codes (0/1), domain error prefix, `--format` json/toon with schemas in help, reject excess args. Lazy-load SDK catalog.
- [x] Update `specd guide` catalog to include structured discovery field naming `specd guide-sdk` in all formats; preserve existing contract.

### 7. Documentation

- [x] Add `docs/cli/guide-sdk.md` documenting the command, search, flags, formats, and difference from `specd guide`.
- [x] Update `docs/cli/index.md` to index `guide-sdk`.
- [x] Update `docs/guide/cli.md` with scenario-based recipes for `specd guide-sdk`.
- [x] Add `cli/guide-sdk` entry to `apps/public-web/sidebars.ts`.
- [x] Delete `docs/core/sdk.md` (tombstone) with no dangling references; verify `docs/core/index.md` unchanged.
- [x] Ensure SDK collection source docs (`docs/sdk`, `docs/core`, `docs/code-graph`, `docs/skills`, `docs/schemas`) carry valid frontmatter where needed; no command references (`docs/cli/`, `docs/public-web/`) in SDK collection roots.
- [x] Update `docs/cli/` references and global docs as required by new conventions.

### 8. Verification

- [x] Run all unit/integration tests in affected packages (`@specd/guide`, `@specd/cli`) and ensure they pass.
- [x] Run lint and typecheck for affected packages.
- [x] Rebuild packages so generated catalogs are up to date.
- [x] Execute `node packages/cli/dist/index.js changes validate sdk-development-guide --all --format text` and ensure validation passes with no blocking errors (only expected structural notes, if any).
- [x] Spot-check CLI behavior: `specd guide-sdk --help`, listing with/without scope, reading a known topic and a generated API topic symbol, search producing correct `readCommand`.

### 9. Catalog discoverability and pagination UX

- [x] Return a listing result from `ListGuidesQuery` carrying `topics`, `pagination`, per-collection `collections` extents, and the count of `withheld` generated topics.
- [x] Emit the shared listing envelope (`topics`, `pagination`, `collections`) from both `specd guide` and `specd guide-sdk`, preserving the structured `sdkGuide` discovery field on `specd guide`.
- [x] Report `page N of M` and the returned/total counts in `text` only when the result spans more than one page, and delimit each collection with its own header carrying its topic count and page range.
- [x] Report withheld generated API topics in the default listing, with the exact `specd guide-sdk --scope api` command that reveals them; document the same in `specd guide-sdk --help`.
- [x] Validate `--scope` against the collections the active catalog serves and exit `1` with `INVALID_GUIDE_SCOPE` instead of returning an empty listing; make `--scope api` select generated topics across every collection.
- [x] Serve `--meta` without a topic as a bounded catalog index reporting per-collection extents plus each topic's page, line count, byte length, and copy-pasteable metadata command.
- [x] Reject `--section`, `--start-line`, and `--lines` without a topic argument with exit code `1` and `MISSING_GUIDE_TOPIC`, naming the flags that require a topic.
- [x] Point `specd guide --help` at `specd guide-sdk`, and add `--page`/`--page-size` to `specd guide`.
- [x] Add guide/CLI tests for the envelope, pagination, collection extents, index, scope validation, flag validation, and help text; update `docs/cli/guide.md`, `docs/cli/guide-sdk.md`, `docs/guide/cli.md`, and `docs/cli/index.md`.

### 10. Index ergonomics: single read hint and entry scope

- [x] Replace the per-topic metadata command in the catalog index with a single `read: specd guide-sdk <topic>` hint, and print each entry's topic fully qualified so the copied value needs no rewriting; remove the `READ` column and the per-entry `readCommand` from the index.
- [x] Add a `scope` of `docs` or `api` to every listed and indexed entry, and to topic metadata, under every output format.
- [x] Report the count of withheld generated API topics and the exact `specd guide-sdk --scope api` command in the index, matching the listing.
- [x] Add guide/CLI tests for the hint, the entry scope, and the withheld-topics note; update `docs/cli/guide.md` and `docs/cli/guide-sdk.md`.

### 11. Identifier-aware search and title-match suggestions

- [x] Add `expandGuideTerms` to `@specd/guide`, splitting camelCase, PascalCase, acronym runs, letter/digit boundaries, and separators, and emitting the joined lowercase form alongside the words so a lowercased query still matches.
- [x] Tokenize both the indexed text and the query with it in `MiniSearchGuideEngineAdapter`, and use it to select the snippet's match line so an expanded query returns its matching line.
- [x] Report a canonical identifier as a suggestion when the catalog holds a topic titled exactly like the request: in the error message, at the head of the available-topic list, and under `metadata.suggestedTopics` for structured callers; scope the title search to a collection-qualified request's collection and never resolve the request silently.
- [x] Fix the `getAllTopics` test mock, which returned summaries and failed `tsc` in `@specd/guide`.
- [x] Add unit tests for term expansion and adapter matching, query tests for title suggestions, and CLI tests for the suggested-topic contract; document identifier matching in `docs/cli/guide-sdk.md`.

### 12. Separate topic kind from collection, and make generated symbols importable

- [x] Restrict `--scope` to the topic kinds `docs`, `api` and `all`, and add `--collection` as an independent option that composes with any scope, so `--scope api --collection code-graph` narrows on both dimensions at once.
- [x] Add `INVALID_GUIDE_COLLECTION` with its own class for an unrecognised collection, and make an unrecognised scope name `--collection` so a caller who passed a collection to `--scope` is pointed at the flag that accepts collections.
- [x] Carry `packageName` and `importStatement` on generated topics, emitting a type-only import for interfaces and type aliases and a value import for classes, enumerations, functions and variables, so the statement compiles wherever it is pasted.
- [x] Surface the package and import in the topic metadata (`--meta`, text/JSON/TOON) and in the generated body, keeping `file` as the secondary declaration path rather than the only route to the symbol; omit both fields for hand-written topics.
- [x] Add CLI tests for scope/collection composition, both validation errors, and the import contract; update `docs/cli/guide-sdk.md` and `docs/guide/cli.md`.

### 13. Shorten the unknown-topic error to the fix and the way to browse

- [x] Drop the bounded topic window, the omitted-count note and the similarity prose from `GuideTopicNotFoundError`, leaving a one-line message that names the request and, when one exists, the canonical identifier that fixes it.
- [x] Replace the pasted window with a `browseHint` in the CLI error detail: how many topics are registered and the three commands that find them, so the error teaches the catalog instead of dumping it.
- [x] Offer a title match even when the request names the wrong collection, mark the message and `metadata.suggestionScope` so the caller can tell a wrong collection from a wrong symbol, and still refuse to resolve the request.
- [x] Compare titles against the request's last path segment so a kind directory no longer blocks the match, and restore similarity ranking for the structured `availableTopics` payload, comparing by full topic path unless the request carries a directory.
- [x] Add guide tests for the message variants, `crossCollection`, directory-prefixed matching and candidate ordering; add CLI tests for `browseHint`, `suggestionScope` and the cross-collection message; update `spec.md`, `verify.md` and `docs/cli/guide-sdk.md`.

### 14. Make generated API topics usable without the source

- [x] Carry the whole declaration shape out of TypeDoc instead of reducing each reflection to a name and a summary: signatures, parameters, member types, flags, comments, block tags and inherited types.
- [x] Render per reflection kind, so a class documents its constructor, methods and fields, an interface documents its fields with optionality, and a function, enumeration, type alias and variable each document their own shape.
- [x] Add a `Related types` table resolving referenced names against the whole catalog, generated in a second pass once every entry point is converted, and tie-break a name reached through several collections to the collection that declares it rather than the one that re-exports it.
- [x] Add a `Usage` section that prefers a declared `@example`, reading the signature's comment because that is where TypeDoc attaches a function's JSDoc, and otherwise deriving a skeleton that binds the declared parameter names.
- [x] Read a getter's type from its accessor signature: a member's own `type` is empty for accessors, which silently dropped every getter in the catalog.
- [x] Withhold the declaration's source path from a generated topic's body and from every metadata format, keeping the published package and import statement as the route to the symbol, while hand-written topics keep reporting their path.
- [x] Drop members whose declaration lies outside every package of the repository, so an error class no longer documents `Error`'s `message`, `name`, `stack` and `stackTraceLimit` as if it declared them; retain members TypeDoc reports no source for.
- [x] Format generated bodies with the repository's own Prettier config, resolved at build time and applied before the line, byte and outline counts are derived, best-effort so one unparseable body cannot fail the bundle, and never applied to hand-written topics.
- [x] Replace the four CLI asserts that expected `Declared in` or a `file` field; add coverage for the absent path in JSON and TOON, the retained path on hand-written topics, the documented call shape, the declared member set, and the declaring-package tie-break.
- [x] Add requirements and scenarios for the call shape, the inherited-member filter and the Markdown formatting; update `docs/cli/guide-sdk.md`.

### 15. Fill the gaps a reader without the source cannot cross

- [x] Rejoin a comment's inline runs using the spacing they carry instead of trimming each run and separating them with blank lines, which rendered `a ` + "`run:`" + ` hook` as three paragraphs; apply the same rule to block tags and keep an example's indentation.
- [x] Render an interface's methods with their parameters and return types, sharing the method renderer with classes, because an interface declaring only signatures had been documented as a bare name.
- [x] Judge standard-library exclusion against every workspace package rather than against the entry point's own, so a symbol declared in one package and re-exported by another keeps its constructor, methods and fields.
- [x] Read an enumeration member's value from `value` or `defaultValue` rather than from `type`, which is empty for enum members, and leave a value reported as an object unprinted rather than stringifying it to `[object Object]`.
- [x] Cover all four with CLI tests: the re-exported class, the interface's methods, the inline-span summary and the verbatim example.

### 16. Make "this repository's own code" mean the workspace, and the output mean it too

- [x] Resolve the package roots that decide inherited-member membership from `pnpm-workspace.yaml` instead of the curated `apiPackageEntryPoints`, which covered three of sixteen packages; a member inherited from a package that publishes no collection of its own was being discarded as if it were the standard library. The list is now read, its globs expanded, and an unreadable or empty workspace file fails the build rather than filtering with an empty root list, which would keep every inherited `Error` member.
- [x] Cover the workspace reader with tests for the real repository, for multiple globs, for a directory without a `package.json`, and for a workspace file whose next key also holds a list.
- [x] Withhold the declaration path from search hits on generated API topics, as `--meta` already did, keeping it for hand-written documents; the spec had required both behaviours at once, and a response that names the declaration in one command and hides it in the other is the inconsistency a caller notices first.
- [x] Remove the key rather than assigning `undefined`, which under `exactOptionalPropertyTypes` serializes as `null`, and cover both topic kinds with a single query that reaches each.

### 17. Publish generated JSON catalogs

- [x] Include `generated/guides.json` and `generated/guides-sdk.json` in the `@specd/guide` package artifact, and prove an installed package can load both engines without source documentation directories.

### 18. Verification and compliance follow-up

- [x] 18.1 Make the guide build refresh the published JSON assets
      `packages/guide/scripts/bundle-guides.ts`: catalog output paths — emit or atomically copy both catalogs into package-root `generated/`, the location consumed by runtime and npm packaging.
      Approach: keep JSON as the sole runtime format and remove any dependency on a second authoritative generated copy.
      (Req: Static Catalog Generation)
- [x] 18.2 Clamp search snippets to section bounds
      `packages/guide/src/infrastructure/adapters/minisearch-guide-engine-adapter.ts`: `generateSnippet()` — prevent context lines from crossing into adjacent sections.
      Approach: clamp the lower/upper window to the matched section's start/end lines rather than document bounds.
      (Req: MiniSearch Engine Adapter)
- [x] 18.3 Delegate qualified lookup through the catalog port
      `packages/guide/src/application/queries/get-guide-query.ts`: `GetGuideQuery.execute()` — reject blank input before port access and call `GuideCatalogPort.getGuide()` for normalized non-empty keys.
      Approach: use `getAllTopics()` only to populate a not-found error after direct lookup fails.
      (Req: Guide Lookup, Topic Not Found Handling)
- [x] 18.4 Align catalog error documentation and CLI help
      `packages/guide/src/infrastructure/adapters/prebundled-guide-catalog-adapter.ts`: `loadCatalog` — add required JSDoc; `packages/cli/src/commands/guide-sdk/index.ts`: help examples — use `sdk:classes/ArtifactDag`.
      Approach: preserve bounded human errors, structured candidates, and generated-path suppression.
      (Req: GuideTopicNotFoundError, Guide SDK Topic Inspection Command)
- [x] 18.5 Add focused regression tests
      `packages/guide/test/` and `packages/cli/test/commands/guide-sdk/guide-sdk.test.ts` — cover fresh JSON propagation, packed-artifact loading, section-bounded snippets, port delegation, blank-input short-circuit, and canonical help output.
      Approach: use portable `os.tmpdir()` fixtures and real extracted package entry points; do not depend on documentation roots at runtime.
      (Req: Static Catalog Generation, MiniSearch Engine Adapter, Guide Lookup, Commander CLI Integration)
- [x] 18.6 Run follow-up verification
      `@specd/guide` and `@specd/cli` — run focused tests, build, npm-pack inspection, and extracted-artifact engine smoke test.
      Approach: confirm both JSON assets ship and initialize 22 user topics and the complete SDK catalog without generated TypeScript modules.
      (Req: all follow-up scenarios)

### 19. Full-audit contract and repository hygiene follow-up

- [x] 19.1 Remove the contradictory per-topic index command expectation
      `packages/cli/test/commands/guide-sdk/guide-sdk.spec.ts`: catalog-index assertions — require the global `read: specd guide-sdk <topic>` hint exactly once and reject a retrieval command on individual rows.
      Approach: rename the existing `.test.ts` file first, then assert the final structured and text projections rather than preserving the stale scenario.
      (Req: Guide SDK Catalog Index)
- [x] 19.2 Use the standard CLI error contract
      `packages/cli/src/commands/guide-sdk/index.ts`: `handleGuideSdkError()` — render expected failures as `error: [<CODE>] <message>` and add bounded `guide-sdk` browse/index/search guidance at the adapter boundary.
      Approach: keep `GuideTopicNotFoundError` host-agnostic and keep complete candidates only in structured metadata.
      (Req: Error Mapping, Guide SDK Command Registration, GuideTopicNotFoundError)
- [x] 19.3 Document structured schemas in command help
      `packages/cli/src/commands/guide-sdk/index.ts`: command help — describe stable JSON and TOON fields for listings, topic metadata, search hits, and errors.
      Approach: add concise Commander help text and test each named envelope without loading the SDK catalog eagerly.
      (Req: Guide SDK Output Formats, Guide SDK Command Registration)
- [x] 19.4 Add root registration and laziness coverage
      `packages/cli/test/commands/guide-sdk/guide-sdk.spec.ts` and `packages/cli/test/documentation-coverage.spec.ts`: `createProgram()` coverage — prove top-level registration and that unrelated commands do not load `@specd/guide/sdk`.
      Approach: inspect a fresh program tree and use a resolver spy/module boundary rather than parsing the process entry point.
      (Req: Command Registration, Guide SDK Command Registration)
- [x] 19.5 Rename guide integration tests to the repository convention
      `packages/guide/test/integration/sdk-catalog.spec.ts`: rename from `sdk-catalog.test.ts` and update any explicit references.
      Approach: preserve test contents and verify no configuration, script, or import retains the former filename.
      (Req: global testing conventions)
- [x] 19.6 Automate the published-package portability regression
      `packages/guide/test/integration/sdk-catalog.spec.ts`: packed-artifact scenario — build and pack `@specd/guide`, extract into a unique `os.tmpdir()` fixture, import `dist/public.js` and `dist/sdk.js`, and compare both topic inventories with the repository build.
      Approach: use Node filesystem/tar APIs or portable package tooling, clean up the fixture in every test, and require both package-root JSON assets without documentation source roots.
      (Req: Static Catalog Artifact Generation)
- [x] 19.7 Correct canonical ArtifactDag documentation routes
      `docs/cli/guide-sdk.md`, `docs/guide/cli.md`, and `packages/guide/README.md`: replace `sdk:interfaces/ArtifactDag` with `sdk:classes/ArtifactDag`.
      Approach: keep help and all documentation examples identical to the generated catalog identifier.
      (Req: Guide SDK Topic Inspection Command, SDK guide documentation and discoverability)
- [x] 19.8 Remove obsolete graph exclusions
      `specd.yaml`: guide workspace graph exclusions — delete entries for `src/infrastructure/generated/guides.ts` and `src/infrastructure/generated/guides-sdk.ts`.
      Approach: retain only exclusions that resolve to current intentional files or patterns.
      (Req: Static Catalog Artifact Generation)
- [x] 19.9 Remove the legacy generated-source directory
      `packages/guide/src/infrastructure/generated`: filesystem residue — ensure the directory and every obsolete generated TypeScript/catalog file beneath it are absent.
      Approach: keep `packages/guide/generated/*.json` as the only catalog assets and verify the legacy path does not exist after build and tests.
      (Req: Build-Time Compilation Script, Static Catalog Artifact Generation)
- [x] 19.10 Audit production files and exports for consumers
      `packages/guide/src`, `packages/guide/scripts`, and `packages/cli/src/commands/guide-sdk`: changed production surface — remove unreferenced implementation files, symbols, and exports unless they are intentional package API.
      Approach: use graph impact/search for every added or materially changed production file; justify retained zero-internal-consumer symbols through `package.json` exports or documented external API, and rerun the graph after deletion.
      (Req: Package Deliverables and Configuration, Public API Export Surface)
- [x] 19.11 Run the full hygiene and behavior verification
      `@specd/guide`, `@specd/cli`, repository build/config, and package artifact — run focused tests, lint/typecheck/build, the portable pack test, canonical-route checks, empty-directory checks, generated-TypeScript absence checks, and the final graph consumer audit.
      Approach: fail completion if `.test.ts` names, stale graph exclusions, `src/infrastructure/generated`, generated catalog `.ts` files, stale ArtifactDag routes, or unjustified dead production files remain.
      (Req: all full-audit follow-up scenarios)

### 20. Compliance reconciliation follow-up

- [x] 20.1 Make list filter arrays select their union
      `packages/guide/src/application/queries/list-guides-query.ts`: `matchesCollection`, `matchesTopic`, `matchesCollectionTopic` — replace impossible `every()` predicates with `some()` while retaining scalar matching.
      Approach: preserve filter-before-sort and the existing `GuideListingResult` envelope; add unit cases for two collections/topics.
      (Req: ListGuidesQuery Implementation)
- [x] 20.2 Enforce strict compiler validation
      `packages/guide/scripts/bundle-guides.ts`: frontmatter and identity validation — reject malformed YAML, non-integer positions, and reserved `:` delimiters.
      Approach: surface source location and raw offending value; do not coerce malformed numeric values.
      (Req: Mandatory Frontmatter Validation, GuideTopic Entity)
- [x] 20.3 Make ambiguity errors executable
      `packages/guide/src/domain/errors/guide-section-ambiguous-error.ts`: `GuideSectionAmbiguousError` — emit indexed heading/line-span descriptors and every concrete selection flag.
      Approach: carry section spans from the query and format `[N] Heading (lines S-E)` consistently in metadata and message.
      (Req: GuideSectionAmbiguousError)
- [x] 20.4 Restore the package export boundary
      `packages/guide/src/index.ts`: root barrel — remove `createGuideSdkEngine` export.
      Approach: retain the factory exclusively in `packages/guide/src/sdk.ts` and assert both root entries cannot import it.
      (Req: Public API Export Surface)
- [x] 20.5 Repair guide-sdk integration contracts
      `packages/cli/src/commands/guide-sdk/index.ts`: command initialization, collection validation, and help schema heading.
      Approach: route through standard config discovery, throw `INVALID_GUIDE_COLLECTION` for unknown collections, and print exactly `JSON/TOON output schema:`.
      (Req: Guide SDK Command Registration, Error Mapping)
- [x] 20.6 Correct README catalog parity
      `packages/guide/README.md`: topic table and generation wording.
      Approach: derive/check entries against `catalog.topics`, omit templates, and state JSON assets are the only runtime catalog format.
      (Req: Package README)
- [x] 20.7 Add and rename focused regression coverage
      `packages/guide/test/**/*.spec.ts`, `packages/cli/test/commands/guide-sdk/**/*.spec.ts`: regressions for strict YAML, union filters, ambiguity candidates, config/collection failures, help heading, exports, and README parity.
      Approach: rename residual `.test.ts` files and update references; keep BDD-style `describe`/`it` structure.
      (Req: all compliance reconciliation scenarios)
- [x] 20.8 Re-run full verification and dead-code audit
      `packages/guide`, `packages/cli`, and graph index: build, lint, typecheck, tests, packed-package smoke, and graph consumer scan.
- [x] 20.9 Record the CLI guide delivery-adapter exception
      `default:_global/architecture`: allow `@specd/cli` to depend directly on `@specd/guide` only as a thin guide-delivery adapter, with SDK catalog loading confined to `@specd/guide/sdk`.
      (Req: CLI guide delivery adapter dependency)
      Approach: fail if legacy generated directories/files, stale TS catalog references, or unjustified production exports remain.
      (Req: all)

### 21. Audit reconciliation: candidates and exact-result ranking

- [x] 21.1 Preserve non-resolving cross-collection title suggestions
      `packages/guide/src/application/queries/get-guide-query.ts`: `GetGuideQuery.execute()` — keep direct `getGuide()` resolution authoritative and construct title suggestions only after a miss.
      Approach: retain requested-collection `availableTopics`; when it has no title-equivalent entry, expose sibling matches through `titleMatches` with `crossCollection: true`, never by returning the sibling topic.
      (Req: GetGuideQuery Implementation, Topic Not Found Handling, GuideTopicNotFoundError)
- [x] 21.2 Add candidate-resolution regressions
      `packages/guide/test/unit/application/queries.spec.ts` and `packages/guide/test/unit/domain/errors.spec.ts`: query/error scenarios — prove direct hits do not enumerate the catalog and a qualified wrong-collection title match remains structured and non-resolving.
      Approach: use spy ports with distinct `core` and `sdk` fixtures; assert `getAllTopics()` is skipped for a hit and `availableTopics`, `titleMatches`, and `crossCollection` have their distinct contracts after a miss.
      (Req: Topic Not Found Handling, GuideTopicNotFoundError)
- [x] 21.3 Promote exact full-query search hits before limiting
      `packages/guide/src/infrastructure/adapters/minisearch-guide-engine-adapter.ts`: `search()` — reorder filtered MiniSearch results before applying `slice(0, limit)`.
      Approach: partition results by a case-insensitive exact trimmed-query substring in indexed title, heading, or section content; preserve descending BM25 order within each partition, then generate snippets for the limited list.
      (Req: Contextual Snippet and Read Command Generation)
- [x] 21.4 Add exact-ranking regression coverage
      `packages/guide/test/unit/infrastructure/search.spec.ts`: search ordering suite — prove an exact full-query hit wins with `limit: 1` over a partial-only BM25 result and retains exact-line snippet placement.
      Approach: use two indexed sections whose BM25 scores favor the partial result, then assert returned order and numbered snippet content.
      (Req: Contextual Snippet and Read Command Generation)
- [x] 21.5 Verify reconciled guide behavior
      `packages/guide`: focused query/error/search suites and package test run — validate candidate metadata, cross-collection non-resolution, exact-first ranking, and existing CLI/integration consumers.
      Approach: run the focused `.spec.ts` files first, then `pnpm --filter @specd/guide test`; investigate any impact on outline, section, composition, and CLI guide consumers before marking complete.
      (Req: all audit reconciliation scenarios)

### 22. Final compliance-audit corrections

- [x] 22.1 Keep cross-collection matches out of ordinary topic candidates
      `packages/guide/src/application/queries/get-guide-query.ts`: `GetGuideQuery.execute` — pass only requested-collection candidates as `availableTopics`.
      Approach: retain sibling title-equivalent identifiers exclusively in the `titleMatches` argument and preserve `crossCollection`; never prepend them to the scoped array.
      (Req: Topic Not Found Handling, GuideTopicNotFoundError)
- [x] 22.2 Cover scoped candidates and non-enumerative direct lookup
      `packages/guide/test/unit/application/queries.spec.ts`: `GetGuideQuery` tests — assert sibling titles are absent from `availableTopics` and a direct hit does not call `getAllTopics`.
      Approach: use a spy catalog port with a successful normalized qualified lookup and a cross-collection title fixture.
      (Req: Topic Not Found Handling)
- [x] 22.3 Project outlines to metadata-only sections
      `packages/guide/src/application/queries/get-guide-outline-query.ts`: `GetGuideOutlineQuery.execute` — omit optional `GuideSection.content` in returned outlines.
      Approach: map each catalog section to a fresh metadata object preserving index, heading, level, line spans and offsets; do not return `guide.outline` by reference.
      (Req: GetGuideOutlineQuery Implementation)
- [x] 22.4 Cover metadata-only outlines with populated catalog sections
      `packages/guide/test/unit/application/queries.spec.ts`: outline-query tests — assert `content` is absent from the outline while on-demand section retrieval remains body-bearing.
      Approach: reuse a fixture with section bodies and assert property absence plus preserved metadata fields.
      (Req: GetGuideOutlineQuery Implementation)
- [x] 22.5 Add SDK-guide discovery to the guide landing page and coverage
      `docs/guide/index.md`, `packages/cli/test/documentation-coverage.spec.ts`: integrator callout and regression assertion.
      Approach: link `specd guide-sdk` and `docs/cli/guide-sdk.md`, distinguish it from `specd guide`, and test the landing-page text.
      (Req: SDK guide documentation and discoverability)
- [x] 22.6 Run focused and full validation for final compliance fixes
      `packages/guide`, `packages/cli`: query, outline, documentation, lint, typecheck and test gates.
      Approach: execute focused suites first, then repository-required gates; record failures before returning to verification.
      (Req: all final compliance requirements)

## 23. Output-format contract reconciliation (spec-only)

- [x] 23.1 Align guide command format requirements with the implemented formatter union
      `specs/cli/guide-sdk/spec.md` and `deltas/cli/guide/spec.md.delta.yaml`: catalog-listing and discovery/pagination requirements — remove `markdown` as a CLI output format while retaining `text`, `json`, and `toon`.
      Approach: keep generated Markdown as document content under its separate formatting requirement; do not add a formatter or modify production code.
      (Req: Guide SDK Catalog Listing Command, Guide SDK Output Formats, Guide Catalog Listing Command)
- [x] 23.2 Align output-format verification scenarios with the three accepted formats
      `specs/cli/guide-sdk/verify.md` and `deltas/cli/guide/verify.md.delta.yaml`: listing, delimiter, pagination, and discovery scenarios — assert only `text`, `json`, and `toon` output behavior.
      Approach: preserve the existing successful-format scenarios and treat `--format markdown` as unsupported input rather than a required rendering path.
      (Req: Guide SDK Catalog Listing Command, Guide SDK Output Formats, Guide Catalog Listing Command)

## 24. Single-collection identity compatibility (spec-only)

- [x] 24.1 Document and verify the one-collection shorthand exception
      `deltas/guide/get-guide/spec.md.delta.yaml` and `deltas/guide/get-guide/verify.md.delta.yaml`: `GetGuideQuery` identity contract — require `collection:topic` for multi-collection catalogs while accepting a bare topic only when the catalog exposes exactly one collection.
      Approach: retain direct normalized lookup and prohibit a shorthand request from selecting or redirecting to another collection; add an explicit sole-collection scenario without changing implementation.
      (Req: GetGuideQuery Implementation)
