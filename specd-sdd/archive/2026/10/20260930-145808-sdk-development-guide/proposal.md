# Proposal: sdk-development-guide

## Motivation

Extension developers and integrators have no offline, token-efficient way to discover the
`@specd/sdk` public surface or the extension contracts it re-exports. `specd guide` solves
this for CLI _users_; nothing solves it for _integrators_. `@specd/sdk` re-exports hundreds of
symbols from `@specd/core` through a 625-line barrel
(`packages/sdk/src/core-reexports.ts`), and that surface has no navigable, agent-optimized
reference at all.

## Current behaviour

`specd guide` serves exactly one catalog, compiled at build time from a single flat
directory:

- `packages/guide/scripts/bundle-guides.ts:252` hardcodes `docsDir = docs/guide`.
- Topic identity is `path.basename(filePath, '.md').toLowerCase()` (line 181), and
  `readdirSync` is flat with `e.isFile()` filtering (lines 206-210) — **no recursion**, no
  subdirectories.
- `bundleGuides(docsDir, outputFile)` emits a self-contained `GUIDES_CATALOG` +
  `GUIDES_INDEX` (lines 230-238). Calling it a second time **overwrites** rather than
  merges, so a second catalog has no representation today.
- `@specd/guide` has **no** namespace/collection concept anywhere in `src/` or `scripts/` —
  the catalog is flat, and `order` (frontmatter `sidebar_position`) is already non-unique
  across the 22 existing topics, so the alphabetical tie-break at lines 220-223 is
  load-bearing.

Four things block a second collection:

1. **Topic collision.** `index.md` exists in `docs/guide/`, `docs/sdk/`, `docs/core/` and
   `docs/code-graph/`. `indexMap[t.topic] = idx` (line 228) **silently last-wins**, so three
   of the four are already dropped from the index today.
2. **The search adapter hardcodes three single-collection assumptions**, all in
   `packages/guide/src/infrastructure/adapters/minisearch-guide-engine-adapter.ts`:
   - line 81 — `id: \`${guide.topic}#${section.index}\``with no uniqueness scope; the`this.documents`map is keyed by`id`and`ms.addAll` needs global uniqueness, so two
     catalogs sharing a topic name silently overwrite.
   - line 290 — `file: \`${doc.topic}.md\``, a synthesized filename, not a real path.
   - line 298 — `readCommand: \`specd guide ${doc.topic} --section ${doc.sectionIndex}\``,
which embeds the literal `specd guide`and would emit a **non-existent command** for
SDK hits. The same literal is pinned in`guide:search-guides/verify.md:73`and`guide:guide-model/{spec,verify}.md`.
3. **`GuideOutline.file` has the same defect** at
   `packages/guide/src/application/queries/get-guide-outline-query.ts:38`.
4. **18 of the 22 candidate source documents have no frontmatter at all**, and the four
   that do are all incomplete — `docs/sdk/index.md` lacks `description`, `docs/core/sdk.md`
   lacks both `description` and `sidebar_position`. `parseFrontmatter` rejects them
   (lines 46-72).

`default:_global/docs` already forbids the alternative fix: developer-internal
documentation "MUST NOT live under `docs/guide/`" and "SHALL be placed in their respective
package reference directories". Folding SDK/core reference material into the user guide is
not available.

## Proposed solution

Add a **second compiled catalog** and a **root-level `specd guide-sdk` command** that serves
it, addressed as `collection:topic`. `@specd/guide` gains a `collection` concept;
`bundle-guides.ts` gains multi-directory recursive compilation and a second generated
artifact; the CLI gains a command that mirrors `specd guide`'s flags and formats.

- **Collection** — a `collection` field on the guide domain models; the catalog key becomes
  `collection:topic`. This reuses specd's own `workspace:capability-path` vocabulary and
  resolves the four-way `index` collision legibly (`core:ports`, `sdk:index`).
- **Bundling** — `bundleGuides` compiles a list of source roots, recursing into
  subdirectories, deriving `topic` as the collection-relative path so `examples/` content is
  reachable as `core:examples/implementing-a-port`.
- **Generated API surface** — TypeDoc is invoked **programmatically as a library** from
  `packages/guide/scripts/`, using the **same curated entry-point list the website already
  declares** (`apiPackageEntryPoints` in `apps/public-web/src/lib/public-docs-config.ts`:
  `sdk` → `packages/sdk/src/index.ts`, `core` → `packages/core/src/public.ts`,
  `code-graph` → `packages/code-graph/src/public.ts`) so the CLI surface and the website
  surface cannot diverge. Each documented symbol becomes its own addressable topic
  (`sdk:classes/ArtifactDag`, `core:classes/Change`), following the kind grouping that
  `apps/public-web/api-sidebars.ts` already applies.
- **Catalog isolation** — the SDK catalog is a **third tsup entry** behind a new
  **`@specd/guide/sdk` subpath** (`dist/sdk.js`), parallel to the existing `"."`
  (`dist/public.js`) and `"./internal"` (`dist/index.js`). It is emitted as a **separate
  package-root JSON asset**, `generated/guides-sdk.json`, alongside
  `generated/guides.json`. These JSON files are the sole generated catalog format read by
  source and compiled runtimes and included in the published package; generated TypeScript
  catalog modules are not restored. This is a
  size requirement, not cosmetics: the current catalog is **464,9 KB for 22 topics**, and
  `packages/cli/src/commands/guide/index.ts:8` imports `@specd/guide` **statically**, so
  anything reachable from the main barrel is parsed on every `specd guide` invocation. Adding
  ~6,1 MB of API content there would tax every user of the user guide.
- **Command** — `specd guide-sdk [topic]` with the same `--meta`, `--section`,
  `--start-line`, `--lines`, `--line-numbers`, `--format` and `search` surface as
  `specd guide`, backed by its own `GuideEngine` over its own catalog and importing
  `@specd/guide/sdk`. The existing `createGuideEngine({ catalogPort })` override seam is reused
  rather than reinvented.
- **Discovery** — a **structured field in all three `--format` values** (not a text-only
  footer) announcing the sibling guide in `specd guide`'s catalog listing, plus doc updates
  in `docs/guide/index.md`, `docs/guide/cli.md`, `docs/cli/guide-sdk.md` and
  `docs/cli/index.md`.
- **Website** — one sidebar line: `cli/guide-sdk` added to the CLI category in
  `apps/public-web/sidebars.ts`. No other site change is needed: `sidebars.ts` uses explicit
  `items` arrays, so the `sidebar_position` added to the ~18 docs is inert for site ordering,
  and `docs/core/sdk.md` was never listed in any sidebar.
- **Collateral fix** — refresh `packages/guide/README.md` (its topic table measures 12 rows
  against a real 22-topic catalog, and names a `templates` topic that does not exist).

Behaviour of the existing `specd guide` command, its flags, its error codes and its topic
names is **unchanged**; the catalog note is the only additive difference.

This change also repairs eight **pre-existing** spec defects found while optimizing spec
context (a stale `Purpose` paragraph, an unsatisfiable `package.json` scenario, a port
missing a member, a verify scenario using a nonexistent field, an unimplemented `MUST`, an
incorrect verify scenario, and two underspecified output fields). Those are recorded in the
change's exploration context and folded into the relevant deltas.

## Specs affected

### New specs

- `cli:guide-sdk`: Contract for the `specd guide-sdk [topic]` command and its `search`
  subcommand — catalog listing with `--scope` and pagination, topic inspection, `--meta`,
  section and window slicing, `--format text|json|toon`, error mapping to
  `UNKNOWN_GUIDE_TOPIC` / `UNKNOWN_GUIDE_SECTION` / `AMBIGUOUS_GUIDE_SECTION` with exit code
  1, delegation to `@specd/guide`, and the structured discovery field that `specd guide`
  emits in its catalog listing.
  - Depends on: `cli:entrypoint`, `default:_global/docs`, `guide:composition`,
    `guide:guide-model`, `guide:bundle-guides`, `default:_global/architecture`

### Modified specs

- `cli:guide`: Add a structured cross-reference field to the "Guide Catalog Listing Command"
  requirement so `specd guide` surfaces the sibling SDK guide in every `--format`, instead of
  leaving discovery to chance. The requirement's existing `topic`/`title`/`description` and
  ordering contract is unchanged.
  - Depends on (added): none
  - Depends on (removed): none
- `guide:guide-model`: Add `collection` to `GuideTopic`, `GuideSummary` and
  `GuideSearchHit`; make `GuideOutline.file` / `GuideSearchHit.file` a real collection-relative
  source path instead of a synthesized `${topic}.md`; state the search document id's
  uniqueness scope; document `sections` offsets and BM25 `score`. Also fixes the
  `readCommand` examples pinned to the literal `specd guide`.
  - Depends on (added): none
  - Depends on (removed): none
- `guide:bundle-guides`: Generalize "all Markdown files in `docs/guide/*.md`" to a configured
  set of source roots; require recursive subdirectory traversal with `/` retained inside the
  topic segment; require strict frontmatter across the SDK collection; require
  collection-qualified topic derivation; require invoking TypeDoc as a library over
  `apiPackageEntryPoints` to emit one addressable topic per documented symbol; and require
  emitting the SDK catalog as a **separate generated artifact** with the user catalog left
  unchanged.
  - Depends on (added): none
  - Depends on (removed): none
- `guide:composition`: Add the SDK-collection engine factory alongside `createGuideEngine()`,
  make the default-catalog rule collection-aware, and reconcile the documented public export
  surface with reality (add `GuideSectionAmbiguousError`, `SpecdGuideError`, both ports, the
  standalone utilities and `GuideEngineOptions`; state that `src/index.ts` is the `./internal`
  escape hatch while `src/public.ts` is the curated barrel and that the SDK catalog is
  reachable only through a separate `./sdk` subpath).
  - Depends on (added): none
  - Depends on (removed): none
- `guide:conventions`: Anchor the package deliverable requirement to the actual manifest
  (`exports` only — the manifest declares neither `main` nor `types`, so the current scenario
  is unsatisfiable); document the three-subpath layout (`.`, `./internal`, `./sdk`), the
  `bundle:guides` script and the `typedoc` devDependency; add a README requirement pinning
  catalog parity so a stale topic table cannot pass verification again.
  - Depends on (added): none
  - Depends on (removed): none
- `guide:list-guides`: Document `GuideCatalogPort.getAllGuides()`, which the port declares but
  the spec omits; specify collection-scoped listing with `--scope` and pagination; and
  correct "alphabetical" to the locale-sensitive collation the code actually uses. Ordering
  is **per collection**; the two catalogs are listed independently and never interleave, which
  makes the 6 already-duplicated `sidebar_position` values harmless.
  - Depends on (added): none
  - Depends on (removed): none
- `guide:get-guide`: Specify collection-qualified topic resolution and the error payload;
  correct the empty/whitespace-topic scenario, which asserts `error.topic` is empty while the
  code stores the untrimmed input; document the empty-topic guard and the extension-stripping
  normalization split across query and adapter.
  - Depends on (added): none
  - Depends on (removed): none
- `guide:get-guide-outline`: Specify that `file` is the real source path within its collection
  rather than a synthesized filename; correct the error-ownership implication, since the query
  propagates `GuideTopicNotFoundError` from `GetGuideQuery` rather than throwing it locally;
  add `startOffset` / `endOffset` to the documented section shape.
  - Depends on (added): none
  - Depends on (removed): none
- `guide:search-guides`: Require collection-namespaced search document ids, require
  `readCommand`'s command name to derive from the collection instead of the hardcoded
  `specd guide`, and specify `file` construction. Correct the stop-words-filtering `MUST`,
  which the code does not implement — the `STOP_WORDS` set is private and used only for
  snippet line selection, where it belongs — and document `level` / `startLine` / `endLine`
  as indexed fields.
  - Depends on (added): none
  - Depends on (removed): none
- `guide:slice-guide-content`: Specify section extraction under collection-qualified topics;
  correct the scenario that calls the query with a `sectionHeading` field the input interface
  does not declare; document both `availableHeadings` shapes.
  - Depends on (added): none
  - Depends on (removed): none
- `guide:errors`: Correct the `Purpose` paragraph, which omits `GuideSectionAmbiguousError`
  even though the class is specified as a requirement, exported from `public.ts`, and handled
  by the CLI as `AMBIGUOUS_GUIDE_SECTION`.
  - Depends on (added): `default:_global/error-handling-conventions`
  - Depends on (removed): none
- `cli:entrypoint`: Register `guide-sdk` as a top-level command alongside `guide`, with the
  same config discovery, stdout/stderr routing and exit-code contract.
  - Depends on (added): none
  - Depends on (removed): none
- `default:_global/docs`: Require full frontmatter on every document in the SDK guide
  collection; require the SDK guide's discoverability note in `specd guide`, `docs/guide/index.md`,
  `docs/guide/cli.md`, `docs/cli/guide-sdk.md` and `docs/cli/index.md`; require
  `cli/guide-sdk` to be listed in the CLI category of `apps/public-web/sidebars.ts`; state the
  collection membership rule that keeps package-reference docs out of `docs/guide/`; and
  **remove `docs/core/sdk.md`**, whose body is only a tombstone pointing at
  `../sdk/index.md` and whose continued existence contradicts the same rule.
  - Depends on (added): none
  - Depends on (removed): none
- `default:_global/architecture`: Permit `@specd/cli` to depend directly on
  `@specd/guide` as a delivery-adapter exception, including the lazy
  `@specd/guide/sdk` subpath used to keep the generated SDK catalog opt-in.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

## Verification follow-up

The implementation is re-aligned after a full compliance audit. Published JSON remains
the only runtime catalog format: normal builds must refresh the exact package-root assets
that npm publishes and the engines load. Generated API topics omit repository-internal
source paths, while unknown-topic candidates remain available only in structured output so
large catalogs do not flood human-facing errors. The follow-up also corrects bounded search
snippets, direct catalog-port lookup and blank-input rejection, the canonical ArtifactDag
help example, JSDoc coverage, and portable packed-artifact regression coverage. It also
removes obsolete graph exclusions, enforces the repository's `.spec.ts` test naming, and
requires a final consumer audit so obsolete source files and the former
`packages/guide/src/infrastructure/generated` directory do not survive the migration.

A subsequent full verification found three remaining contract gaps that this follow-up
must close: qualified lookup errors must keep `availableTopics` inside the requested
collection while exposing sibling title matches only through dedicated structured fields;
outline responses must omit optional section body content even when a catalog port provides
it; and the guide landing page must point integrators to `specd guide-sdk`. The associated
spec and verification updates make those boundaries explicit and add regression coverage.

That verification also found a format-contract mismatch: the CLI accepts only `text`,
`json`, and `toon`, while older listing prose still named Markdown. This follow-up aligns
the `cli:guide` and `cli:guide-sdk` requirements with the implemented three-format
contract; it deliberately adds no Markdown formatter or code change.

The final compliance review also confirmed that `GetGuideQuery` intentionally preserves an
unqualified topic as backwards-compatible shorthand when its catalog has exactly one
collection. The `guide:get-guide` contract must state that narrow exception while retaining
`collection:topic` as mandatory whenever more than one collection is available; this is a
specification and verification clarification only, with no implementation change.

`specd graph impact` over the eight planned implementation targets returns
**`riskLevel: CRITICAL`** — 21 affected files, 53 direct dependents, 83 transitive
dependents. This is the highest-risk area touched by any recent change, driven almost
entirely by `guide:scripts/bundle-guides.ts` (15 affected files on its own).

Planned targets and what each needs:

| Target                                                                           | Change                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/guide/scripts/bundle-guides.ts`                                        | Multi-root + recursive source discovery; collection-qualified topic derivation; TypeDoc-as-library invocation emitting per-symbol topics; refresh the package-root `generated/guides.json` and `generated/guides-sdk.json` assets |
| `packages/guide/src/domain/models/guide-topic.ts`                                | Add `collection`                                                                                                                                                                                                                  |
| `packages/guide/src/domain/models/guide-summary.ts`                              | Add `collection`                                                                                                                                                                                                                  |
| `packages/guide/src/domain/models/guide-search-hit.ts`                           | Add `collection`; `file` becomes a real path                                                                                                                                                                                      |
| `packages/guide/src/composition/guide-engine.ts`                                 | SDK-collection factory                                                                                                                                                                                                            |
| `packages/guide/src/infrastructure/adapters/prebundled-guide-catalog-adapter.ts` | Catalog source injected per collection and loaded from the canonical JSON assets (constructor already accepts it)                                                                                                                 |
| `packages/guide/src/infrastructure/adapters/minisearch-guide-engine-adapter.ts`  | Namespaced ids; collection-aware `file` and `readCommand`                                                                                                                                                                         |
| `packages/guide/src/application/queries/get-guide-outline-query.ts`              | `file` becomes a real path                                                                                                                                                                                                        |
| `packages/cli/src/commands/guide/index.ts` (new `guide-sdk/` sibling)            | New command + formatters, importing `@specd/guide/sdk`                                                                                                                                                                            |
| `packages/cli/src/program.ts`                                                    | Register `guide-sdk`                                                                                                                                                                                                              |
| `packages/guide/package.json`                                                    | Third `exports` subpath `./sdk` + third tsup entry + `typedoc` devDependency                                                                                                                                                      |
| `apps/public-web/sidebars.ts`                                                    | Add `cli/guide-sdk` to the CLI category (one line)                                                                                                                                                                                |

### The API reference already exists — and why we do not consume it directly

`apps/public-web` already runs TypeDoc (`scripts/generate-api-docs.mjs`, `typedoc.json`,
`typedoc-plugin-markdown`) into `.generated/api/`:

| Package             | Generated files | Size       |
| ------------------- | --------------- | ---------- |
| `@specd/sdk`        | 668             | 2,8 MB     |
| `@specd/core`       | 591             | 2,5 MB     |
| `@specd/code-graph` | 189             | 800 KB     |
| **Total**           | **1448**        | **6,1 MB** |

Pointing the bundler at that directory would be free content, but four concrete blockers make
it the wrong dependency:

1. **`apps/public-web/.generated/` is gitignored** (`.gitignore:9`) — absent from a clean clone
   and from the published `@specd/guide` tarball.
2. **The root build excludes the workspace**: `turbo build --filter=!@specd/public-web`
   (also `build:dev`, `typecheck`). `generate:api` therefore **never** runs during
   `preflight:build`, so the input would be absent in CI.
3. **The bundler runs inside the guide package's build, so the guide build already depends
   on it** (`packages/guide/package.json` `build` and `build:dev` both run
   `tsx scripts/bundle-guides.ts`; only the `dev --watch` script omits it). Pointing it at
   another workspace's artifact would make the guide build additionally depend on a
   workspace outside the declared dependency graph — a different and worse coupling than
   the one it already has.
4. **None of the 1448 files carry frontmatter** (`readme: none`, no frontmatter plugin), so
   the strict-frontmatter rule would reject every one.

Invoking TypeDoc as a library from `packages/guide/scripts/` avoids all four while keeping a
single source of truth for the analysis, and costs `typedoc` as a **devDependency** only —
no runtime coupling, which satisfies the `guide:conventions` prohibition.

The invocation reuses `apiPackageEntryPoints` from
`apps/public-web/src/lib/public-docs-config.ts` verbatim. Note that the `sdk` entry is the
barrel `packages/sdk/src/index.ts` itself, so the `core-reexports.ts` surface is reached
transitively — which is why the 668 existing SDK topics already cover the core re-exports.

### Enforced doc touchpoints

`packages/cli/test/documentation-coverage.spec.ts` introspects `createProgram()` and asserts,
for every top-level command, that: (1) `docs/cli/<name>.md` exists; (2) that file names every
subcommand; (3) `docs/guide/cli.md` mentions `specd <name>`; (4) `docs/cli/index.md` lists it.
Registering `guide-sdk` **fails this test** unless all four are written — which
independently confirms the `default:_global/docs` requirement that every command has a doc
file.

### Tests that will need attention

`packages/cli/test/commands/guide/guide.test.ts` (real engine, 12 asserted topics),
`packages/guide/test/unit/infrastructure/bundle.test.ts` (imports the bundler directly at
line 3), `packages/guide/test/integration/guide-engine.test.ts:11` (title says "12
prebundled guides", actual 22), plus `queries.test.ts`, `search.test.ts`, `models.test.ts`
and the new `documentation-coverage` assertions. None use `registerGuideCommand`'s
`engineOverride` seam, which is currently unused in production and is the natural injection
point for a second engine.

### Data model and API

New domain field `collection` on three value objects/entities; a second generated JSON asset
(`generated/guides-sdk.json`) behind a third package subpath (`./sdk`) alongside
`generated/guides.json`; one new
root command and its formatters; one build-time generator that invokes TypeDoc over the shared
entry-point list; one line in `apps/public-web/sidebars.ts`. No change to the `@specd/core`,
`@specd/code-graph` or `@specd/sdk` public APIs — `@specd/sdk` is a **read-only generation
input** for this change.

`graph hotspots --min-risk HIGH` surfaces no guide-package symbols; the only HIGH-risk entries
are `cli:test/commands/helpers.ts` test infrastructure. The CRITICAL rating reflects fan-out
inside one small package, not cross-package coupling.

## Technical context

The CLI is an approved direct consumer of `@specd/guide` for this guide-delivery
adapter. This exception preserves the existing thin-adapter boundary and permits the
lazy `@specd/guide/sdk` subpath without introducing an SDK facade solely for CLI
documentation delivery.

**The query layer needs no change for `collection:topic`.** `GetGuideQuery` normalizes with
only `trim()` → strip a trailing `.md` → `toLowerCase()`. There is no slugification, no `:`
splitting and no prefix matching, so `core:ports` reaches the adapter verbatim and hits the
existing flat `this.index[normalized]` O(1) lookup. `--section` is a separate destructured
input and its numeric detection is `/^\d+$/` anchored on the trimmed string, so a topic's `:`
can never be confused with a section selector. **The work is in the generator and the search
adapter, not the query layer.**

**`:` is already safe as a delimiter.** It appears nowhere in guide topic handling today, and
`/` is retained verbatim inside the topic segment (`core:examples/implementing-a-port`),
which keeps `examples/` as a subgroup of its collection rather than a fourth collection.

**Four-way collision is a pre-existing latent bug, not just a naming inconvenience.** Because
`indexMap[t.topic] = idx` last-wins, three of the four `index.md` files are already missing
from the index today. The fix makes existing silent data loss explicit.

**Per-symbol topics require a bounded default listing.** With 1448 generated topics plus ~22
hand-written ones, an unbounded `specd guide-sdk` listing would return on the order of 40-50k
tokens and defeat the purpose of the guide. Listing is therefore scoped: `--scope` selects a
collection (or `all`) and results are paginated, while **every symbol remains individually
addressable** — `specd guide-sdk sdk:interfaces/ArtifactDag` and its `--section` behave
exactly like a hand-written topic. Addressability and listing volume are decoupled.

**Alternatives evaluated and ruled out** (all discussed with the user during discovery):

- _Merge into `docs/guide/` as `sdk-_`topics* — violates`default:\_global/docs`, which
forbids developer-internal docs under `docs/guide/`.
- _New hand-written `docs/guide-sdk/` directory_ — duplicates prose already in `docs/sdk` and
  `docs/core`, and the copies drift. Re-bundle chosen instead.
- _`specd guide sdk [topic]` subcommand_ — `sdk` collides with the existing `search`
  subcommand guard at `commands/guide/index.ts:138-141`, and mixes a flat catalog with a
  collection.
- _`specd guide --collection sdk` flag_ — dirties a contract `cli:guide` already fixes as two
  invocations.
- _Flat topic prefix (`sdk-core-domain-model`)_ — verbose to type and ugly in `readCommand`.
- _Flat topic with per-collection `index`_ — ambiguous; `ports` exists in more than one
  collection.
- _Lenient frontmatter (derive title from H1, description from first paragraph)_ — carves an
  exception into `guide:bundle-guides` and makes `--meta` untrustworthy. Adding real
  frontmatter also improves the Docusaurus site as a side effect.
- _Consuming `apps/public-web/.generated/api/` directly_ — gitignored, excluded from the root
  build, and frontmatter-free. See Impact for the full argument.
- _A TypeScript-compiler-API extractor_ — reimplements what TypeDoc already does well
  (inheritance, generics, signatures) for no benefit.
- _A curated handful of addressable API topics (e.g. only `sdk:api`) with symbols
  search-only_ — rejected in favour of full per-symbol addressability, with listing bounded by
  `--scope` and pagination instead.
- _An MCP surface_ — not viable. `packages/mcp/src/index.ts` is a single comment line, and a
  repo-wide search for `registerTool|server.tool|McpServer|ListToolsRequestSchema` finds
  nothing. There is no tool-name convention to match, so it is greenfield and out of scope.

**Existing seams this change reuses rather than rebuilds:** `createGuideEngine({ catalogPort })`
at `guide-engine.ts:51-74` already accepts an injected catalog; `PrebundledGuideCatalogAdapter`'s
constructor already accepts an injected catalog and index; `registerGuideCommand(program, engineOverride?)`
already accepts an engine and no production caller uses it; `typedoc.json` already encodes
the TypeDoc options (`skipErrorChecking`, `excludePrivate`, `excludeInternal`) that should be
carried over; and `apiPackageEntryPoints` already curates the exact entry points the
generator must process.

**Catalog size forces the subpath split.** `generated/guides.json` is
**464,9 KB for 22 topics**; the SDK catalog adds ~1450 topics carrying ~6,1 MB. Because
`commands/guide/index.ts:8` imports `@specd/guide` statically, reaching the SDK catalog from
the `"."` barrel would make every `specd guide` run parse the whole API reference. The third
tsup entry keeps that cost opt-in.

**Adding frontmatter is site-neutral.** `apps/public-web/sidebars.ts` uses explicit `items`
arrays rather than autogenerated categories, so the `sidebar_position` added to the ~18 docs
does not reorder any existing page. Only two `_category_.json` files exist among the bundled
directories (`docs/sdk`, `docs/core`, plus `docs/schemas/examples`), and the bundler globs
`*.md` only.

**Hard constraint carried from `guide:conventions`:** `@specd/guide` must not declare a runtime
dependency on `@specd/core`, `@specd/cli` or `@specd/mcp`. TypeDoc is a **devDependency** used
at build time, which satisfies this; the generated catalog must remain self-contained.

### Compliance reconciliation

The full compliance review found that the feature is functional but that its accepted
pagination and subpath design was not consistently reflected in older guide contracts. This
follow-up keeps the delivered architecture: `GuideEngine.listGuides(options)` returns the
bounded listing envelope used by both guide commands, and `src/index.ts` remains the explicit
`./internal` entry while `src/public.ts` stays curated. The corresponding specs and scenarios
will be aligned to those intentional public boundaries.

The following are implementation defects, not changes of direction, and must be fixed after
the artifacts are revised: validate explicit CLI configuration and search collections; preserve
raw unknown-topic input until the domain layer; remove `createGuideSdkEngine` from the internal
root barrel; validate YAML frontmatter and reserved delimiters; implement union semantics for
plural listing selectors; make ambiguous-section diagnostics list concrete indices and spans;
prioritize exact full-query search hits; and restore README/catalog parity. Regression tests
must cover each repaired contract and use the repository's `.spec.ts` convention for new or
renamed focused suites.

For an unknown topic, the direct catalog lookup remains the authority for resolution. After a
miss, the query may enumerate the in-memory catalog solely to construct the existing bounded,
structured candidate payload. A qualified miss may include a title-similar candidate from a
sibling collection; this improves discovery without resolving the requested topic across
collections or expanding the human-facing error message.

**Ordering fact worth recording:** `sidebar_position` is not unique even today — 6 of 13
populated values are duplicated across the 22 existing guides. Ordering is therefore specified
**per collection**; the two catalogs are listed independently and never interleave.

## Open questions

**None.** Every question raised during discovery has been resolved with the user, and nothing
is deferred to `design.md`. Recorded here for traceability:

| #   | Question                                   | Resolution                                                                                                                                                    |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Nested separator for `core/examples/*.md`  | `core:examples/implementing-a-port` — `:` is the collection delimiter, `/` is retained inside the topic                                                       |
| 2   | Shape of the `specd guide` discovery note  | Structured field in `text`, `json` **and** `toon`; `cli:guide` gains a delta so its catalog-listing requirement covers it                                     |
| 3   | Source of the generated API reference      | TypeDoc invoked as a **library** from `packages/guide/scripts/` over the shared `apiPackageEntryPoints` list, not consumed from `apps/public-web/.generated/` |
| 4   | Granularity of API topics                  | **Every documented symbol is an addressable topic** (`sdk:interfaces/ArtifactDag`)                                                                            |
| 5   | Volume control for ~1450 topics            | Default listing is scoped via `--scope` plus pagination; addressability is unaffected                                                                         |
| 6   | Cross-collection `order`                   | Per collection, independently listed; never interleaved                                                                                                       |
| 7   | `docs/core/sdk.md` tombstone               | **Deleted** via `delta` REMOVE in `default:_global/docs`                                                                                                      |
| 8   | Stop-words `MUST` in `guide:search-guides` | **Spec corrected** — the `MUST` is removed; `STOP_WORDS` is documented as snippet-line selection only                                                         |
| 9   | Entry point for the SDK catalog            | **New `@specd/guide/sdk` subpath** → `dist/sdk.js`, a third tsup entry, imported only by `commands/guide-sdk/`                                                |
| 10  | Shape of the generated artifacts           | **Two package-root JSON files** — `generated/guides.json` (user catalog) and `generated/guides-sdk.json` (SDK catalog); no generated TypeScript catalogs      |
| 11  | `apps/public-web/sidebars.ts`              | **One line** — add `cli/guide-sdk` to the CLI category. No other site change is needed or wanted                                                              |
