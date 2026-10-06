# Design

## Summary

This change extends the `@specd/guide` package to support multi-collection documentation catalogs (user guide + SDK/extension development guide) and adds the `specd guide-sdk` command to the CLI. The SDK collection is compiled at build time from `docs/sdk`, `docs/core`, `docs/code-graph`, `docs/skills`, `docs/schemas`, together with a generated API reference for the public surfaces of `@specd/sdk`, `@specd/core` and `@specd/code-graph`. Generated API topics are emitted as collection-qualified, addressable symbols and both the domain model and catalog ports are made collection-aware. The `specd guide` catalog listing gains a structured discovery field pointing to `specd guide-sdk`.

## Architecture

### Multi-collection catalog model

- Introduce `collection` as a first-class field on domain types (`GuideTopic`, `GuideSummary`, `GuideOutline`, `GuideSearchHit`, `GuideSection` unchanged for fields except it belongs to a collection).
- Topic identity is canonicalized as `collection:topic`. The `:` is a reserved delimiter and `topic` may contain `/` to represent nested paths. Collection-qualified resolution applies across all queries.
- The catalog port serves one catalog (possibly containing multiple collections). A dedicated port serves the SDK collection via the `@specd/guide/sdk` subpath so the user guide catalog is not loaded when the SDK engine is used.
- Two engine instances are produced: the default `createGuideEngine()` uses the user guide catalog; `createGuideSdkEngine()` (exported from `./sdk`) uses the SDK catalog.

### Build-time bundling (`bundle:guides`)

- The bundler compiles all configured collection roots:
  - User: `docs/guide/`
  - SDK sources: `docs/sdk/`, `docs/core/`, `docs/code-graph/`, `docs/skills/`, `docs/schemas/`
- Nested directories are traversed recursively; only `.md` files are compiled. `_category_.json` and non-markdown assets are ignored.
- Frontmatter is strictly validated (title/description/sidebar_position). For generated API topics, frontmatter is synthesized from TypeDoc reflections.
- Generated catalog artifacts:
  - `generated/guides.json` – user collection (preserved byte-for-byte when SDK collection added)
  - `generated/guides-sdk.json` – SDK collection (separate file)
- Both catalog assets serialize immutable catalog arrays and index maps, with outline entries carrying `startOffset` and `endOffset` but no serialized section `content` strings. They are package assets: runtime may load them but never documentation source roots, Markdown, frontmatter, or TypeDoc output. The published package must include both JSON assets alongside the entry points that load them.
- `packages/guide/package.json` build scripts run the bundler before compilation (`build` and `build:dev`). The bundler invokes TypeDoc as a library using the public site's curated `apiPackageEntryPoints` (`@specd/sdk`, `@specd/core`, `@specd/code-graph`) rather than reading `.generated/` artifacts. TypeDoc options mirror the public site's `typedoc.json`. SDK re-exports from the barrel are reachable transitively.
- The bundler emits SDK collection entries such that each documented symbol becomes an addressable topic (e.g. `sdk:classes/ArtifactDag`). A generated topic keeps its `sourcePath` as internal provenance, used to resolve a symbol's declaring package, but the path is withheld from the published body and metadata.
- Error messages name offending files; empty source roots produce explicit, non-zero errors.

### Generated topic shape (`sdk-api-generator.ts`)

- A generated topic is written to be usable by a caller who has no copy of the source. It carries the declaration's signature with parameters and return types, the class constructor, its methods and fields, each interface method and field, each enumeration member with its declared value, a usage sketch, and links to the types it references.
- Rendering is dispatched on the TypeDoc reflection kind and reads `signatures`, `children` and `getSignature`, so an interface that declares only signatures and a class that declares fields are both fully described rather than one of them collapsing to a bare name.
- A declaration's related types are resolved against the whole catalog, and a re-exported symbol is documented from the entry of the package that declares it, so `sdk:classes/HookResult` links to `core:classes/HookResult` rather than to an unresolvable name.
- **Inherited members:** TypeDoc resolves the full inheritance chain, so a class also carries members inherited from the standard library's `Error` and `Object`. A member is kept when its declaration lies inside a package of the workspace, and dropped otherwise; the rule is applied once where reflections are collected, so the sections, the usage sketch and the related-type scan all agree.
- **Workspace membership** is read from `pnpm-workspace.yaml` (`packages:` globs, expanded and kept when they hold a `package.json`), not from the curated `apiPackageEntryPoints`. The curated list decides which packages get a collection; membership decides what counts as this repository's own code. Deriving both from the curated list would drop a member inherited from a package that publishes no collection of its own, and would drop the entire body of every re-exported symbol, whose declarations carry the paths of the package that declares them.
- **Comment fidelity:** a comment reaches the generator as a sequence of inline runs of one paragraph, where an inline code span or link is a run of its own. Runs are concatenated using the spacing they carry, and trimmed only at the end, so `a ` + `` `run:` `` + ` hook` renders as one sentence instead of three paragraphs. Block tags follow the same rule, and an `@example` keeps the line structure and fence the author wrote.
- **Formatting:** a generated body is passed through Prettier with the repository's own configuration before its metrics and outline are computed, so a member table is aligned the way a hand-written document would be. Hand-written documents are never passed through it, and a formatting failure is not allowed to fail the bundle. No line width is imposed: Prettier's default wrapping is accepted as-is.
- **Declaration path:** withheld from the body, from `--meta` in every format, and from search hits. The import statement is what reaches the symbol for a caller. A hand-written document keeps reporting its source path, because for it the path is the only thing saying where the content came from.

### Package exports and deliverables

- Manifest: `@specd/guide`, type `module`. Entry points declared via `exports` only (no `main`/`types` required as delivery mechanism): `.` -> main entry; `./internal` -> internal escape hatch; `./sdk` -> SDK collection entry. Build-time tooling is in `devDependencies`.
- The SDK subpath exports only the SDK collection engine and its catalog; the main entry must not export or load the SDK catalog.
- The README's topic catalog remains in parity with the generated user catalog (synchronized at build time). The package delivers generated catalog files so dependents do not access source documentation roots.

### Composition and ports

- `GuideCatalogPort` serves exactly one catalog. It exposes `listGuides()`, `getAllGuides()` and `getCollections()`. Topic resolution uses a collection-qualified key whenever the port exposes multiple collections; a port exposing exactly one collection accepts an unqualified backwards-compatible shorthand and never crosses catalogs.
- `createGuideEngine()` defaults to the user catalog; SDK engine uses the dedicated subpath/catalog.
- `ListGuidesQuery` supports scope filtering (by collection(s) or category) and pagination; filtering before ordering; ordering per collection (by `order` asc, tie-break by `topic` locale-sensitive). Default listings avoid unbounded generated entry sets.
- `GetGuideQuery` rejects an empty or whitespace-only topic before any catalog access. For non-empty input it normalizes (trim → strip trailing `.md` → lowercase) and delegates the qualified key directly to `GuideCatalogPort.getGuide()`. On failure it obtains collection-scoped, collection-qualified `availableTopics` only for the error payload. `GetGuideOutlineQuery` delegates resolution to `GetGuideQuery`.
- Section extraction uses `startOffset`/`endOffset` spans; numeric section selectors require digits-only trimmed values. Ambiguity among duplicate headings throws `GuideSectionAmbiguousError` without silent fallback.
- The in-memory search engine indexes section locations (`level`, `startLine`, `endLine`), produces collection-derived `readCommand` (`specd guide` vs `specd guide-sdk`), and uses namespaced document IDs per collection. Snippet windows are clamped to the matched section's `startLine` and `endLine`, never the whole document. Stop-word handling only affects snippets/term processing and does not empty results. Search does not crash on punctuation/metacharacters.
- A search hit's `file` is internal provenance, kept on the domain model, and projected at the CLI boundary: a hit on a generated API topic publishes without it, a hit on a hand-written document publishes with it. The key is removed rather than set to `undefined`, which under `exactOptionalPropertyTypes` would serialize as `null`.

### Errors

- Domain errors live in `@specd/guide` with no dependency on `@specd/core`: `SpecdGuideError` (base, `specd` flag, upper-snake-case `code`), `GuideTopicNotFoundError` (collection-scoped, collection-qualified available topics; `topic` preserves raw input), `GuideSectionNotFoundError` and `GuideSectionAmbiguousError`. `GuideTopicNotFoundError.message` names the rejected topic but remains host-agnostic and never enumerates the catalog; candidates remain available through the structured `availableTopics` field. The CLI adapter adds bounded guidance naming `guide-sdk` listing, metadata-index, and search operations and renders the result as `error: [<CODE>] <message>`.

### CLI

- `@specd/cli` registers `guide-sdk` as a top-level command, sibling to `guide`. It uses the SDK engine via `@specd/guide/sdk`, supports `--scope` and pagination, and inherits configuration discovery, `--config` (global/local), output routing (stdout/stderr), exit codes (0 success, 1 domain), standard `error: [<CODE>]` rendering, `--format`, and rejection of excess positional arguments. `guide-sdk --help` explicitly documents the stable JSON and TOON envelope fields for listings, topic metadata, search hits, and errors.
- Both guide commands accept exactly `--format text`, `--format json`, and `--format toon`. `markdown` is document content, not a CLI output format; neither command exposes nor needs a Markdown formatter.
- The package graph explicitly permits this delivery-adapter edge: `@specd/cli` MAY depend directly on `@specd/guide` only to delegate guide catalog operations. It MUST use the lazy `@specd/guide/sdk` subpath for SDK catalog operations and MUST NOT reproduce guide-domain or application logic in the CLI.
- `specd guide` listing includes a structured discovery field present in all formats, naming `specd guide-sdk`. The existing listing contract remains unchanged.
- `specd guide <topic> --meta` returns `topic`, `collection`, `file` (real collection-relative source path), `lines`, `bytes`, `outline` with `index`, `heading`, `level`, `startLine`, `endLine`, `lines`, `startOffset`, `endOffset`. For a generated API topic, `file` is withheld and `packageName`, `importStatement` and `scope` are reported instead.

### Documentation

- `docs/cli/guide-sdk.md` added and indexed in `docs/cli/index.md`; `docs/guide/cli.md` gains recipes for `specd guide-sdk`. Sidebar in `apps/public-web/sidebars.ts` adds the `cli/guide-sdk` entry.
- `docs/core/sdk.md` is deleted (tombstone); no dangling references. SDK collection sources under `docs/sdk`, `docs/core`, `docs/code-graph`, `docs/skills`, `docs/schemas` must carry valid frontmatter (title/description/sidebar_position).

## Verification follow-up implementation contract

- The five primary implementation targets have `CRITICAL` aggregate graph impact: 19 affected files, 17 direct dependents, 9 indirect dependents, and 110 transitive dependents across `guide` and `cli`. The highest-risk target is `prebundled-guide-catalog-adapter.ts`, whose catalog loader feeds both engine factories and both CLI guide commands. Changes MUST remain localized and retain the existing public types and command contracts.
- `packages/guide/scripts/bundle-guides.ts` MUST write the final runtime assets directly to `packages/guide/generated/guides.json` and `packages/guide/generated/guides-sdk.json`, or copy them there atomically before the build succeeds. No second authoritative copy under `src/infrastructure/generated/` may be required by runtime or packaging.
- `packages/guide/src/infrastructure/adapters/prebundled-guide-catalog-adapter.ts` MUST document `loadCatalog` with JSDoc and continue resolving package-root `generated/` assets relative to `dist`.
- `packages/guide/src/application/queries/get-guide-query.ts` MUST short-circuit blank input before calling a port, and successful resolution MUST call `GuideCatalogPort.getGuide()` with the normalized qualified key rather than scanning `getAllTopics()`.
- `packages/guide/src/infrastructure/adapters/minisearch-guide-engine-adapter.ts` MUST clamp snippet context to section bounds.
- `packages/cli/src/commands/guide-sdk/index.ts` help examples MUST use `sdk:classes/ArtifactDag`.
- `docs/cli/guide-sdk.md`, `docs/guide/cli.md`, and `packages/guide/README.md` MUST use the canonical `sdk:classes/ArtifactDag` route and contain no stale `sdk:interfaces/ArtifactDag` example.
- `specd.yaml` MUST remove graph exclusions for the deleted `src/infrastructure/generated/guides.ts` and `src/infrastructure/generated/guides-sdk.ts` files.
- The implementation MUST finish with a graph-based consumer audit of every production source file added or materially changed by this change. Unreferenced implementation files or exports that are not intentional public API MUST be removed; intentional public exports MUST be justified by package exports or documented consumers.
- `packages/guide/src/infrastructure/generated` MUST not exist after implementation. Git cannot track an empty directory, but the filesystem verification MUST also confirm that the legacy directory was removed rather than merely emptied.

## Testing follow-up

- Add a portable integration test that builds/packs `@specd/guide`, extracts the tarball into an `os.tmpdir()` directory, imports `dist/public.js` and `dist/sdk.js`, and proves both engines load without repository documentation roots.
- Add a build-output assertion that the package-root JSON assets are the freshly emitted catalogs used by the entry points.
- Add unit tests for snippet matches on the first and last line of a section, asserting adjacent-section text is absent.
- Add `GetGuideQuery` tests with a spy port: normalized success calls `getGuide()`; blank input calls no port method.
- Add a CLI help assertion for `sdk:classes/ArtifactDag` and retain assertions that generated metadata/body/search output omit source paths.
- Rename `packages/guide/test/integration/sdk-catalog.test.ts` and `packages/cli/test/commands/guide-sdk/guide-sdk.test.ts` to `.spec.ts`; all new and renamed tests MUST follow the repository convention and no import/config reference may retain the old names.
- Add a catalog-index assertion that the global `read: specd guide-sdk <topic>` hint appears exactly once and that no topic row carries a retrieval command.
- Add a root `createProgram()` assertion for `guide-sdk` registration and lazy SDK catalog loading, plus assertions for the exact standard error rendering and the JSON/TOON help-schema descriptions.
- Add repository hygiene checks for the removed graph exclusions, absence of `packages/guide/src/infrastructure/generated`, absence of generated catalog `.ts` files, and absence of unconsumed production files identified by the graph audit.
- Run `pnpm --filter @specd/guide test`, the focused CLI guide suites, build, and a real `npm pack` extraction smoke test.

## Migration and rollback

No data migration is required. Rollback consists of reverting the code changes while retaining the JSON catalog format and the previously published `generated/` package assets. Generated TypeScript catalogs are not a rollback path.

## Compliance reconciliation implementation contract

- `GuideOutline.file` and `GuideSearchHit.file` SHALL always be real collection-relative source paths: `.md` for hand-written guides and the TypeScript declaration path for generated API topics. Neither the CLI nor package APIs may expose absolute repository paths.
- `ListGuidesQuery` SHALL replace `every()` with union (`some()`) semantics for array-valued `collections`, `topics`, and `collectionTopics`, retaining scalar behavior and the `GuideListingResult` envelope. This CRITICAL symbol has eight affected files, including both engines and both guide command suites.
- The catalog compiler SHALL reject malformed YAML syntax, non-integer `sidebar_position`, and `:` in collection/topic identities. Adapter and query errors SHALL preserve raw caller input before normalization.
- `GuideSectionAmbiguousError` SHALL render `[index] heading (lines start-end)` candidates and every concrete `--section index` choice. `src/index.ts` SHALL not re-export `createGuideSdkEngine`; only `src/sdk.ts` may export it.
- `registerGuideSdkCommand` SHALL use standard configuration discovery, reject an unknown `--collection` with `INVALID_GUIDE_COLLECTION`, and use the exact help heading `JSON/TOON output schema:`.
- README parity SHALL compare the user catalog's actual topics (`catalog.topics`) against its table; it shall omit templates and never claim generated TypeScript catalogs. All touched guide and CLI tests SHALL use `.spec.ts` and focused regression assertions.

## Candidate and search-ranking reconciliation

`GetGuideQuery.execute(input: GetGuideInput): Promise<GuideTopic>` keeps direct catalog
resolution as its only success path. It derives `collection` from the normalized reference
(or from the sole available collection), calls `catalog.getGuide(qualifyTopic(collection,
topic))`, and returns only that result. It MUST NOT resolve a title match or a sibling
collection candidate. Only after that direct lookup returns `null` may it call
`catalog.getAllTopics()` to construct `GuideTopicNotFoundError`'s structured metadata. For a
qualified miss, `availableTopics` contains only candidates in the requested collection. If
there is no exact title match there, `titleMatches` can contain collection-qualified matches
from sibling collections and `crossCollection` is `true`; the human message stays bounded to
those title suggestions and never lists the catalog. Blank input performs no port call.

`MiniSearchGuideEngineAdapter.search(query, options)` filters raw MiniSearch results first,
then partitions them before `slice(0, limit)`: hits whose indexed `title`, `heading`, or
section `content` contains the trimmed query case-insensitively come first; BM25 score keeps
its existing descending order inside each partition. The adapter then generates snippets for
the limited ordered hits. This is separate from `findBestMatchLine`, which already prioritizes
an exact whole-query line for snippet placement. Add unit coverage in
`packages/guide/test/unit/application/queries.spec.ts`,
`packages/guide/test/unit/domain/errors.spec.ts`, and
`packages/guide/test/unit/infrastructure/search.spec.ts` proving direct lookup is not
enumerative, cross-collection title suggestions do not resolve, and exact full-query hits win
even when a partial-only BM25 hit would otherwise consume the final result slot.

The impact analysis for these three files is CRITICAL: 24 affected files, 31 direct, 36
indirect, and 121 transitive dependents. Preserve the existing public query signatures and
exercise outline, section, composition, both CLI commands, integration engines, and focused
unit tests after any change.

## Final compliance fixes

`GetGuideQuery` MUST construct `GuideTopicNotFoundError` with the requested collection's
bounded candidates as `availableTopics`. A sibling identifier found by title is passed only
as `titleMatches`; it MUST never be prepended to or otherwise leaked into `availableTopics`.
The query unit test must assert both that `sdk:classes/ArtifactDag` is absent from
`availableTopics` for a `core:ArtifactDag` miss and that a direct hit does not call
`getAllTopics()`.

`GetGuideOutlineQuery` MUST create new section metadata objects instead of returning
`guide.outline` by reference. Each result preserves `index`, `heading`, `level`,
`startLine`, `endLine`, `lines`, `startOffset`, and `endOffset`, and omits `content` even
when the catalog-provided `GuideSection` contains it. The query test fixture must include
section bodies and assert their absence from the outline while the on-demand section query
continues to expose the requested body.

`docs/guide/index.md` MUST add a concise integrator callout linking to `specd guide-sdk` and
the `docs/cli/guide-sdk.md` reference, and explicitly distinguish it from the user-focused
`specd guide` collection. Documentation coverage must assert this landing-page link.

## Output-format contract alignment

No production source, public API, generated catalog, or documentation file changes for this
follow-up. The implementation's accepted format union is already `text | json | toon` for
both `specd guide` and `specd guide-sdk`; the discrepancy was confined to stale requirement
and verification wording that named `markdown` as a supported output format.

Fresh graph impact over `packages/cli/src/commands/guide/formatters.ts` and
`packages/cli/src/commands/guide-sdk/index.ts` is `CRITICAL` (16 affected files, 13 direct,
29 indirect, and 21 transitive dependents). This follow-up therefore MUST NOT alter either
file: narrowing the written contract to the already implemented union avoids a high-risk
formatter change and preserves every dependent command and test surface.

The `cli:guide` catalog-listing requirement and its discovery/pagination scenarios now refer
only to `text`, `json`, and `toon`. The new `cli:guide-sdk` specification and its listing
scenarios likewise restrict human-readable table rendering and pagination delimiters to
`text`; generated Markdown remains governed solely by the generated-topic formatting
requirement and is unrelated to CLI serialization. Existing formatter and command tests
remain sufficient because this follow-up does not change accepted inputs or rendered output.

Manual regression checks, when verification is re-run, are `node packages/cli/dist/index.js
guide --format text|json|toon` and `node packages/cli/dist/index.js guide-sdk --format
text|json|toon`; each invocation must retain its existing successful output behavior. Passing
`--format markdown` remains an unsupported-format validation error and is not a supported
scenario.

## Single-collection identity compatibility

No production source or public API change is required for this reconciliation. `GetGuideQuery`
already accepts an unqualified normalized topic when `GuideCatalogPort.getCollections()` yields
exactly one collection. The behavior is intentionally retained as backwards compatibility for
the pre-collection user-guide catalog.

The contract is: callers MUST use `collection:topic` when a catalog exposes more than one
collection; when it exposes exactly one, a bare topic is accepted and resolves only in that
sole collection. A bare topic MUST NOT enumerate, select, or redirect to a sibling collection.
Qualified keys continue to pass unchanged to the port after trim, a single trailing `.md`
removal, and lowercasing. The existing direct-lookup and no-cross-collection invariants remain
unchanged.

The verification suite must retain explicit coverage for `workflow`, `GETTING-STARTED`, and
`configuration.md` against a one-collection catalog, plus a focused scenario proving that the
shorthand cannot select another collection. Multi-collection scenarios continue to require
`collection:topic`.

## Open questions

None.
