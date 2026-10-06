# Spec compliance report — sdk-development-guide

- Mode: change
- Generated: 2026-10-04 13:41:18 Europe/Madrid
- Change: `sdk-development-guide`
- Scope: 14 merged change specs, direct dependencies (depth 1), and applicable project-wide specs
- Verification evidence: `@specd/guide` 131/131 tests passed; `@specd/cli` 1098/1098 tests passed
- Compliance verdict: **not clean**

## Aggregate Summary

| Severity  | Findings |
| --------- | -------: |
| HIGH      |        8 |
| MEDIUM    |        9 |
| LOW       |        3 |
| **Total** |   **20** |

The implementation is broadly functional and its current suites pass, but the audit found behavioral, spec-alignment, documentation, manifest, and test-convention gaps. Per the full-verification workflow, transition is paused until the user chooses whether to update specs, fix implementation, do both, or explicitly proceed.

## Detailed Findings

# CLI compliance audit — `sdk-development-guide`

## Requirements Summary

Scope audited:

- Change specs: `cli:guide-sdk`, `cli:entrypoint`, `cli:guide`, and the change delta for `default:_global/docs`.
- Direct external dependencies: `core:config`, `default:_global/error-handling-conventions`, `default:_global/conventions`, and `default:_global/testing` where their cross-cutting constraints apply.
- Referenced guide contracts used by the CLI adapter: `guide:composition`, `guide:guide-model`, `guide:bundle-guides`, and `guide:errors`.
- Concrete surfaces: command registration in `packages/cli/src/program.ts`, the adapter in `packages/cli/src/commands/guide-sdk/index.ts`, shared guide formatting/listing helpers, guide discovery output, CLI docs and sidebar registration, and focused tests.

The merged requirements define these main contracts:

1. Register `guide-sdk` as a lazy top-level sibling of `guide`, backed specifically by `@specd/guide/sdk`.
2. Provide bounded catalog listing and index modes, independent `scope` and `collection` filters, stable ordering, structured pagination and collection extents, and explicit disclosure of hidden API topics.
3. Retrieve qualified topics, metadata, sections and line windows; preserve guide-domain error semantics and map them into standard CLI errors.
4. Search the whole SDK catalog with collection/topic filters, bounded hits, actionable read commands, and identifier-aware matching supplied by the guide engine.
5. Preserve actionable generated-topic import metadata while omitting repository declaration paths from generated-topic public output.
6. Surface SDK-guide discovery through the existing `guide` command in text, JSON and TOON without changing its existing listing envelope.
7. Follow entrypoint/global contracts for config discovery, output streams, exit codes, excess arguments, exact help schema documentation, typed errors, test naming and documentation placement.

## Implementation Status

Overall status: **partially compliant**. The core guide-sdk behavior is implemented and extensively tested, but four behavioral/dependency-contract discrepancies and two convention/documentation discrepancies remain.

Implemented and evidenced:

- `registerGuideSdkCommand` is registered at the root and the SDK engine is loaded lazily through `import('@specd/guide/sdk')` (`packages/cli/src/program.ts:267-270`).
- Default/docs/API/all listing, independent listing filters, pagination, grouped collection output, hidden-topic disclosure, metadata/index output, topic resolution, sections, line slicing, generated-topic import metadata, unknown-topic suggestions, bounded errors, search, JSON/TOON, and guide discovery all have focused assertions in `packages/cli/test/commands/guide-sdk/guide-sdk.spec.ts` and `packages/cli/test/commands/guide/guide.test.ts`.
- Generated topic metadata omits `file`, while hand-written metadata retains it (`packages/cli/src/commands/guide-sdk/index.ts:529-537`).
- The user guide listing includes the structured `sdkGuide` pointer and the documentation reference/sidebar files exist.
- Focused execution passed: **3 files, 136 tests** (`guide-sdk.spec.ts`, `guide.test.ts`, `documentation-coverage.spec.ts`).
- The code graph was current and complete (`coverageComplete: true`, no parse failures). Graph search resolved `registerGuideSdkCommand`, and graph impact classified it **CRITICAL** with 6 direct and 81 indirect dependents; relevant affected specs include `cli:entrypoint` and `cli:guide`.

## Discrepancies

### 1. HIGH — `guide-sdk` ignores configuration discovery and `--config`

**Requirements:**

- `cli:entrypoint / Guide SDK Command Registration`: the command MUST participate in normal config discovery and honor `--config` in global and local positions.
- `cli:entrypoint / Configuration discovery` and `core:config / Config file location and format`: an explicit missing config file must fail rather than be ignored.

**Implementation evidence:**

- The root defines `--config` and propagates it in `preAction` (`packages/cli/src/program.ts:110`, `:122-130`).
- `registerGuideSdkCommand` neither declares/reads config nor invokes a loader; its actions resolve only the guide engine (`packages/cli/src/commands/guide-sdk/index.ts:271-406`).
- Runtime probes using both positions succeeded with exit code 0 and emitted a catalog despite a definitely missing file:
  - `specd guide-sdk --config /definitely/missing/specd.yaml --page-size 1 --format json`
  - `specd --config /definitely/missing/specd.yaml guide-sdk --page-size 1 --format json`

**Interpretation options:**

- **Implementation bug:** wire the normal CLI/config bootstrap into the command before serving the static guide catalog and test both option positions plus missing/discoverable configs.
- **Spec drift:** if documentation commands are intentionally config-free/offline and `--config` should merely be accepted syntactically, revise `cli:entrypoint` and `core:config` with an explicit bootstrap exemption. The present specs explicitly require discovery, so current behavior cannot be considered compliant without that change.

### 2. HIGH — `guide-sdk search --collection` accepts unknown collections as successful empty results

**Requirements:**

- `cli:guide-sdk / Guide SDK Scope Validation`: an unrecognized `--collection` MUST exit 1 with `INVALID_GUIDE_COLLECTION`, report the rejected and valid values, and MUST NOT be conflated with a legitimate empty result.
- `cli:guide-sdk / Search`: collection filtering must be strict.

**Implementation evidence:**

- Listing calls `resolveCollection(options.collection, collections)` (`packages/cli/src/commands/guide-sdk/index.ts:496-503`).
- Search bypasses that validator and passes the raw string directly as `collections: [collection]` (`packages/cli/src/commands/guide-sdk/index.ts:387-393`).
- Runtime probe `specd guide-sdk search kernel --collection nope --format json` exited 0 and printed `[]`.

**Interpretation options:**

- **Implementation bug:** validate search collections against `engine.getCollections()` through the same resolver and map the typed error identically to listing.
- **Spec drift:** narrow the validation requirement explicitly to catalog listing and document search's empty-result semantics. This would weaken the current command-wide wording and the documented promise that an unrecognized collection fails.

### 3. MEDIUM — CLI trimming destroys the raw unknown-topic value required by `guide:errors`

**Requirements:**

- `guide:errors / GuideTopicNotFoundError`: `error.topic` MUST preserve the caller-supplied identifier before normalization, including whitespace and extension.
- `cli:guide-sdk / Error Mapping`: the adapter delegates to the guide engine and preserves stable guide-domain errors.

**Implementation evidence:**

- The action tests blankness with `topicArg.trim()` and then calls `runTopic(..., topicArg.trim(), ...)` (`packages/cli/src/commands/guide-sdk/index.ts:334-340`).
- Runtime probe with `"  core:does-not-exist  "` reported `Guide topic 'core:does-not-exist' not found`, proving the raw value had already been discarded before the domain error was created.
- Successful lookup normalization is correct, but it should occur inside the guide resolution path so failures retain the original input.

**Interpretation options:**

- **Implementation bug:** pass the raw nonblank argument to the engine; let the collection normalize internally while constructing errors from the supplied raw value.
- **Spec drift:** redefine the CLI boundary as owning normalization and permit adapters to report normalized values. That contradicts the current guide error contract and its explicit verification scenario.

### 4. MEDIUM — Help text violates the exact schema-header contract inherited from `cli:entrypoint`

**Requirements:**

- `cli:entrypoint / JSON/TOON output schema in help`: every command supporting structured formats MUST append a block starting exactly with `JSON/TOON output schema:` and show a TypeScript-style multiline shape.
- `cli:guide-sdk / Output Formats` and command registration depend on that entrypoint contract.

**Implementation evidence:**

- The command emits `Structured output schemas (JSON and TOON):` and compact one-line pseudo-shapes (`packages/cli/src/commands/guide-sdk/index.ts:325-329`).
- The focused test explicitly locks in the nonconforming header (`packages/cli/test/commands/guide-sdk/guide-sdk.spec.ts:546`).

**Interpretation options:**

- **Implementation/test bug:** use the exact shared header and multiline TypeScript-style shape, then update the assertion.
- **Spec drift:** relax the entrypoint requirement to permit equivalent headers and compact named envelopes. Because the dependency says “Start with a header line” and supplies exact text, the current variant is not conformant as written.

### 5. MEDIUM — Changed CLI tests do not conform to the global test-file naming/mirroring rule

**Requirements:**

- `default:_global/conventions` and `default:_global/testing`: test files MUST use `.spec.ts`, live under `test/` mirroring `src/`, and match the source filename.

**Implementation evidence:**

- New production source is `packages/cli/src/commands/guide-sdk/index.ts`, while its test is `packages/cli/test/commands/guide-sdk/guide-sdk.spec.ts`; the mirrored matching name would be `index.spec.ts` under the literal global rule.
- The change also modifies `packages/cli/test/commands/guide/guide.test.ts`, retaining the explicitly forbidden `.test.ts` suffix.
- Both files execute and pass, so this is a convention/maintainability failure rather than a functional failure.

**Interpretation options:**

- **Code-layout bug:** rename the focused tests to compliant mirrored `.spec.ts` paths (and update configuration/import references if needed).
- **Spec drift / established CLI exception:** CLI command folders widely use command-oriented names and legacy `.test.ts` files; if this pattern is intentional, codify a CLI exception rather than leaving the global MUST contradicted by active changed tests.

### 6. LOW — `InvalidGuideScopeError` JSDoc describes the obsolete collection-as-scope model

**Requirements:**

- `default:_global/docs` requires documentation to remain aligned with changed public contracts.
- `default:_global/error-handling-conventions` requires error-class JSDoc to describe the error and code accurately.
- `cli:guide-sdk` explicitly separates `scope` (`docs|api|all`) from `collection`.

**Implementation evidence:**

- `packages/cli/src/errors/invalid-guide-scope-error.ts:4-9` says the error is thrown for a value that is “neither a catalog collection nor a reserved listing scope” and that its valid set is derived from the catalog.
- Actual `resolveScope` accepts only the three hardcoded scope kinds; collections are handled by `resolveCollection`.

**Interpretation options:**

- **Documentation bug:** update the JSDoc to describe only `docs|api|all` and the separate collection error.
- **Code/spec drift:** restore collection values as valid scopes, which would conflict with the newly merged independent-dimension contract and is therefore not recommended.

## Test Coverage

Strong coverage exists for the central command behavior:

- Default and explicit scopes, collection composition, ordering, grouping, pagination and hidden counts.
- Text/JSON/TOON listing and index envelopes, single read hint, metadata and generated-topic import behavior.
- Topic normalization on successful lookup, nested topics, generated topics, title suggestions, bounded unknown-topic messages and structured candidate metadata.
- Numeric/text/slug section selection, missing sections, line slicing and line-number rendering.
- Generated-topic search, identifier constituent matching (through the real guide engine), topic/collection filters, limits and blank queries.
- Discovery field in all formats, root registration, help visibility and lazy engine resolution.
- Documentation coverage includes `guide-sdk`; the focused suite passed 136/136 tests.

Coverage is structurally connected: graph search identified the command, engine factory, formatters and guide discovery symbols; graph impact identified CLI tests and entrypoint/guide specs among dependents.

## Missing Tests

1. No integration test asserts that `guide-sdk` discovers config or rejects a missing explicit config in both global and local `--config` positions.
2. No test passes an unknown collection to the **search** subcommand and expects `INVALID_GUIDE_COLLECTION`/exit 1.
3. No test requests an unknown topic with leading/trailing whitespace (or `.md`) and asserts that structured/domain error metadata preserves the raw supplied topic.
4. The help test asserts the wrong header; there is no dependency-compliance assertion for the exact `JSON/TOON output schema:` block or its multiline shape.
5. No repository convention check prevented a changed `.test.ts` file or a non-mirrored test filename in this command area.
6. No documentation/JSDoc assertion detects the stale collection-as-scope description in `InvalidGuideScopeError`.

## Dependency Chain

```text
cli:guide-sdk
├── cli:entrypoint
│   ├── core:config
│   └── default:_global/error-handling-conventions
├── default:_global/docs
│   └── default:_global/conventions
├── guide:composition
│   ├── guide:guide-model
│   ├── guide:errors
│   │   └── default:_global/error-handling-conventions
│   ├── guide:list-guides
│   ├── guide:get-guide
│   ├── guide:get-guide-outline
│   ├── guide:slice-guide-content
│   └── guide:search-guides
├── guide:bundle-guides
│   ├── guide:conventions
│   └── guide:guide-model
└── cli:guide
    ├── cli:entrypoint
    ├── default:_global/docs
    ├── guide:composition
    └── guide:guide-model
```

Consistency notes:

- The lazy `@specd/guide/sdk` boundary and guide discovery field conform to the referenced guide composition/model contracts.
- The implementation is inconsistent with its `cli:entrypoint → core:config` dependency because config is accepted but not resolved.
- The adapter is inconsistent with `guide:errors` because it removes raw input before the domain layer can preserve it.
- The help implementation and its test are internally consistent with each other but inconsistent with the direct `cli:entrypoint` dependency.
- The `default:_global/docs` tombstone rule and SDK-collection frontmatter work coexist in the diff: `docs/core/sdk.md` is deleted, while `docs/core/index.md` is changed to add/repair frontmatter rather than to replace a link to the tombstone. This is not counted as a finding because the normative prose only forbids modifying it “to compensate for the deletion”; reviewers should retain that rationale when consolidating the change.

## Summary counts

| Category                     | Count |
| ---------------------------- | ----: |
| High discrepancies           |     2 |
| Medium discrepancies         |     3 |
| Low discrepancies            |     1 |
| Total discrepancies          |     6 |
| Focused test files run       |     3 |
| Focused tests passed         |   136 |
| Missing/incorrect test areas |     6 |

No additional CLI/global compliance discrepancies were found in registration, lazy SDK loading, main-guide discovery, generated-topic path omission, structured error routing, excess-argument rejection, docs placement/indexing, or sidebar reachability.

---

# Compliance audit — guide A

Scope: merged specs `guide:guide-model`, `guide:bundle-guides`, `guide:conventions`, `guide:list-guides`, and `guide:get-guide`, plus direct dependency `guide:errors` and the global error-contract implications referenced by it.

## Requirements Summary

| Spec                  | Requirements |   Pass | Partial |  Fail |
| --------------------- | -----------: | -----: | ------: | ----: |
| `guide:guide-model`   |            5 |      4 |       1 |     0 |
| `guide:bundle-guides` |            4 |      3 |       1 |     0 |
| `guide:conventions`   |            5 |      3 |       1 |     1 |
| `guide:list-guides`   |            2 |      1 |       1 |     0 |
| `guide:get-guide`     |            2 |      2 |       0 |     0 |
| **Total**             |       **18** | **13** |   **4** | **1** |

The implementation is broadly aligned: collection-aware domain records, JSON-only catalogs, recursive compilation, TypeDoc generation, package exports, catalog isolation, pagination, on-demand lookup, and structured errors are present. It is not clean: three high-severity and two medium-severity discrepancies remain.

## Implementation Status

### `guide:guide-model`

- `GuideTopic`, `GuideSection`, `GuideSummary`, `GuideOutline`, and `GuideSearchHit` contain the merged collection-aware fields. Source evidence: `packages/guide/src/domain/models/*.ts`.
- Real `sourcePath` values, generated-symbol package/import metadata, offsets, 1-indexed coordinates, and collection-derived read commands are represented and exercised by unit/integration tests.
- `qualifyTopic()` rejects `:` in collection and topic identifiers, and normalization preserves `/`. However, catalog construction itself does not enforce the reserved-delimiter invariant; see discrepancy D4.

### `guide:bundle-guides`

- `COLLECTIONS` configures `docs/guide`, `docs/sdk`, `docs/core`, `docs/code-graph`, `docs/skills`, and `docs/schemas`; collection traversal is recursive and ignores non-Markdown files by selecting only `.md`.
- Build output is exclusively `packages/guide/generated/guides.json` and `guides-sdk.json`; no runtime TypeScript catalog is consumed.
- TypeDoc is loaded as a library over the curated public-site entry points, with the public TypeDoc options, and generates per-symbol topics.
- Heading ranges, offsets, CRLF handling, deterministic ordering/indexing, source-root failures, isolation, package tarball loading, and absence of the legacy `src/infrastructure/generated` path have test evidence.
- Frontmatter parsing is hand-written and does not satisfy strict integer/YAML validation; see D1.

### `guide:conventions`

- Layer import scans found no domain-to-application/infrastructure/composition imports and no application-to-infrastructure/composition imports.
- `package.json` has only `minisearch` at runtime; TypeDoc tooling is in `devDependencies`. It declares `.`, `./internal`, and `./sdk`, and both builds run the bundler first.
- JSON assets are in `files`, and the extracted-tarball integration test loads both engines without repository docs.
- Error classes and the package-level error contract are covered by the package tests.
- The README is materially out of parity and contains a broken quick-start expression; see D3. The public entry boundary is also broader than the merged verification text permits; see D5.

### `guide:list-guides`

- `GuideCatalogPort` exposes `listGuides`, `getAllGuides`, `getCollections`, `getAllTopics`, and qualified `getGuide`.
- `ListGuidesQuery` filters before ordering, groups ordering by collection, sorts by order/topic using `Intl.Collator`, paginates, reports extents, and supports hand-written/generated scopes.
- Multi-value scopes are implemented incorrectly with `every`; see D2.

### `guide:get-guide`

- Normalization is trim, trailing `.md` removal, then lowercase, preserving qualified/nested identities.
- Blank input is rejected before port access and preserves the raw input in the error.
- Successful resolution is collection-aware. Unknown-topic alternatives are qualified and scoped, with intentional cross-collection title suggestions separated from directly resolvable candidates.
- Section bodies are extracted downstream from outline offsets; the catalog does not serialize duplicate section content.

## Discrepancies

### D1 — HIGH — Frontmatter validation accepts invalid numeric YAML and cannot report malformed YAML locations

Evidence:

- `packages/guide/scripts/guide-bundler.ts:66` uses `parseInt(rawPosition, 10)` and only checks `isNaN` or negativity. Values such as `1.5` and `1junk` are therefore accepted as `1`, contrary to the requirement that `sidebar_position` be an integer of valid type.
- The parser splits each non-comment line at its first colon instead of using a YAML parser. It cannot reliably reject malformed YAML or provide the required line/column parse error.
- `packages/guide/test/unit/infrastructure/bundle.test.ts` covers missing fields and `-3`, but has no decimal, partially numeric, malformed mapping, or tab-indentation case.

Resolution possibilities:

1. **Code fix:** use a real YAML parser (build-time dependency), validate the parsed value with `Number.isInteger(value) && value >= 0`, and preserve parser location details.
2. **Spec fix:** explicitly define the supported frontmatter as a restricted line-oriented subset and remove the malformed-YAML/line-column requirements. This would weaken compatibility with the current Docusaurus/YAML wording.

### D2 — HIGH — Multi-collection and multi-topic scopes cannot match

Evidence:

- The merged `guide:list-guides` requirement says scope may name “one or more collections”.
- `packages/guide/src/application/queries/list-guides-query.ts:322` uses `expected.every(...)` for collection arrays. A summary can equal every distinct requested collection only when the array contains one repeated value.
- The same defect exists for topic arrays at line 339 and qualified-topic arrays at line 367.
- Existing tests exercise a single string collection and generated boolean scopes, not arrays of two values.

Resolution possibilities:

1. **Code fix:** replace array `every` membership checks with `some`/`includes`, retaining `every` only for validation if desired.
2. **Spec fix:** remove multi-value scopes and type the API as a single selector. This conflicts with the current plural keys (`collections`, `topics`, `collectionTopics`) and stated requirement.

### D3 — HIGH — README violates catalog parity and documents stale/broken usage

Evidence:

- Generated `guides.json` contains 22 topics. The README table under `packages/guide/README.md:61` lists only 12, omits 11 real topics (`what-is-specd`, `index`, `installation`, `philosophy`, `specs`, `changes`, `project-structure`, `skills`, `artifacts`, `context-compilation`, `configuration-examples`) and lists nonexistent `templates`.
- `packages/guide/README.md:19` still claims an “immutable static TypeScript catalog”, contradicting the required and implemented JSON-only catalog.
- `packages/guide/README.md:118` calls `catalog.map(...)`, but `GuideEngine.listGuides()` returns `GuideListingResult`; the executable shape is `catalog.topics.map(...)`.
- No README/catalog parity test was found under `packages/guide/test`.

Resolution possibilities:

1. **Code/docs fix:** regenerate or update the table from `generated/guides.json`, state JSON assets, and correct the quick-start expression. Add a parity regression test.
2. **Spec fix:** remove exact parity and downgrade the table to examples. Even then, the nonexistent topic, stale TypeScript claim, and broken quick start remain documentation defects.

### D4 — MEDIUM — Reserved `:` invariant is not enforced when catalog topics are constructed

Evidence:

- `qualifyTopic()` correctly rejects delimiters, but `compileGuide()` assigns `collection` directly and derives `topic` from the relative path without calling validation.
- `compileCollections()` accepts arbitrary `CollectionConfig.collection`. A configuration or Markdown filename containing `:` can therefore create a catalog record that violates the model requirement before later qualification fails.
- Tests cover `qualifyTopic()` success but not rejection during catalog compilation.

Resolution possibilities:

1. **Code fix:** validate collection IDs and derived topics in `compileGuide`/`compileCollections`, failing the build with the offending root/file.
2. **Spec fix:** scope the invariant to externally addressable lookups and declare source/config values trusted. This is weaker than “MUST NOT appear in a collection or topic value”.

### D5 — MEDIUM — Public entry exports exceed the merged clean-boundary scenario

Evidence:

- Merged verification says the public entry exposes only the facade, `GuideEngine`, domain models, options, and error classes.
- `packages/guide/src/public.ts` additionally exports topic-identity helpers (line 12 onward), application ports/query types (line 30 onward), and application utilities (line 48 onward).
- Infrastructure adapters and raw catalogs are correctly absent from the public entry; the mismatch is limited to extra application/helper surface.

Resolution possibilities:

1. **Code fix:** move helper/port/utility exports to `./internal` if they are not intended as stable public API.
2. **Spec fix:** enumerate these exports as intentionally supported public API. This is plausible because SDK consumers may need the shared identity and slicing helpers.

## Test Coverage

- Executed `pnpm --filter @specd/guide test`: **10 files, 131 tests passed**.
- Domain model tests cover readonly shapes, UTF-8 byte length, CRLF line counts, section spans/offsets, source paths, and search-hit metadata.
- Bundler tests cover required frontmatter fields, heading fences, offsets, final boundaries, compiled topic shape, collection isolation, and output directory.
- Query tests cover sorting, pagination, generated/document scopes, normalization, blank input, qualified delegation, errors, outlines, sections, and searches.
- SDK integration tests cover configured collections, catalog isolation, qualified/nested lookup, generated symbols, real source paths, collection-filtered search, command derivation, JSON packaging, and extracted tarball imports.
- Error tests cover inheritance and structured fields relevant to `guide:errors` and the global error contract.

## Missing Tests

1. Reject decimal and partially numeric `sidebar_position` values.
2. Reject malformed YAML with file plus line/column evidence.
3. Select the union of two collections via `collections: ['core', 'schemas']`.
4. Select the union of multiple topics and multiple qualified topics.
5. Assert README topic-table parity against `generated/guides.json`.
6. Compile-time/build-time rejection of `:` in configured collections and derived topic paths.
7. Explicit public-entry export allowlist matching whichever boundary (code or revised spec) is chosen.
8. A README quick-start type/execution check, or at minimum an assertion of the `GuideListingResult.topics` shape used by documentation.

## Dependency Chain

```text
guide:conventions (global package/layer/runtime constraints)
├── guide:guide-model
│   ├── guide:bundle-guides
│   ├── guide:list-guides
│   └── guide:get-guide
└── guide:errors
    ├── guide:get-guide
    └── default:_global/error-handling-conventions
```

The highest-risk chain is `bundle-guides -> generated JSON -> PrebundledGuideCatalogAdapter -> ListGuidesQuery/GetGuideQuery -> public engines`. D1 can admit invalid catalog metadata at build time; D2 then affects every engine consumer that requests a plural scope. D3 affects users before runtime by advertising incorrect topics and an invalid code example.

## Summary counts

- Specs audited: **5 merged + 1 direct external dependency + 1 referenced global contract**.
- Requirements assessed in assigned merged specs: **18**.
- Pass: **13**.
- Partial: **4**.
- Fail: **1**.
- Discrepancies: **5** total — **3 HIGH**, **2 MEDIUM**, **0 LOW**.
- Test run: **131/131 passing**, but the suite does not exercise the five discrepancies above.

Verdict: **not clean; verification should fail until the high-severity frontmatter, plural-scope, and README-contract issues are resolved or the specs are deliberately revised.**

---

# Compliance Audit — Guide B

Scope: merged change previews for `guide:composition`, `guide:get-guide-outline`, `guide:search-guides`, `guide:slice-guide-content`, `guide:errors`, and `default:_global/docs`; direct dependencies `guide:conventions`, `guide:guide-model`, `guide:list-guides`, `guide:get-guide`, and `default:_global/error-handling-conventions`; global constraints `default:_global/architecture`, `default:_global/conventions`, `default:_global/testing`, and `default:_global/eslint`.

Method: change specs were read through `changes spec-preview sdk-development-guide <specId>`; external dependency/global specs through `specs show`; implementation discovery was graph-first after reindexing; linked source, tests, package manifest, documentation, and sidebar files were then inspected read-only. No production code or spec was changed.

## Requirements Summary

The implementation substantially covers the requested SDK guide collection: separate generated JSON catalogs, a dedicated `./sdk` package subpath, collection-aware topic resolution, real source paths, outline offsets, scoped BM25 search, section extraction, typed errors, guide-sdk documentation, and tombstone removal are present.

However, the merged contract is not fully compliant. There are three direct behavior/export violations, two dependency-spec conflicts, one manifest violation, and global test-naming/JSDoc violations. Several verification scenarios also lack focused tests.

Audited top-level requirement groups: 31.

- Fully compliant: 23
- Partially compliant or internally conflicted: 5
- Non-compliant: 3
- Clean areas: architecture layer direction, zero runtime dependency on core, dedicated package export map, outline source paths/offsets, collection isolation, search identifiers/read commands, line utilities, documentation discoverability, tombstone deletion, and SDK source-root exclusion.

## Implementation Status

### `guide:composition`

- `GuideEngine`, `GuideEngineOptions`, `assembleGuideEngine`, and `createGuideEngine` exist in `packages/guide/src/composition/guide-engine.ts`.
- The default engine uses `generated/guides.json`; `createGuideSdkEngine` uses `generated/guides-sdk.json`.
- The package export map correctly maps `.` to `dist/public.js`, `./internal` to `dist/index.js`, and `./sdk` to `dist/sdk.js`.
- `src/public.ts` is curated and does not expose SDK factory/catalog symbols.
- `src/sdk.ts` exposes the SDK factory as required.
- `src/index.ts` does expose `createGuideSdkEngine`, contrary to the merged composition spec.
- The implemented `GuideEngine.listGuides(options?)` returns `GuideListingResult`, not the `Promise<readonly GuideSummary[]>` signature still stated by the merged composition spec.

### `guide:get-guide-outline`

- `GetGuideOutlineQuery` delegates resolution to `GetGuideQuery`, preserving normalization and resolution errors.
- It returns `collection`, canonical topic, real `sourcePath`, counts, and the existing outline without copying section content.
- Section offsets are generated and carried through the domain model.
- Real SDK catalog integration tests cover top-level and nested source paths and generated TypeScript paths.
- Focused unit verification is incomplete for empty outlines, absence of serialized content, offset fidelity through the query, and error identity propagation.

### `guide:search-guides`

- The adapter indexes one document per section, with title/heading/content fields, boosts `5/3/1`, prefix search, fuzzy search, and collection-qualified IDs.
- Stored fields include collection, topic, source path, section index, level, and line bounds.
- Topic and collection filters are implemented; malformed query syntax is caught without throwing.
- Snippets are clamped to section bounds; source paths and collection-specific read commands are emitted correctly.
- Stop words affect snippet line selection only, not index membership.
- The code does not explicitly enforce that a document with an exact full-query substring outranks a document containing the terms separately. Exact-substring priority is only used to choose a line _inside each already-ranked hit_.
- Several normative scenarios have no direct tests (listed below).

### `guide:slice-guide-content`

- Numeric strings are digits-only after trimming; numeric selection is 1-indexed.
- Heading matching is case-insensitive, whitespace-tolerant, and slug-aware.
- Duplicate headings raise `GuideSectionAmbiguousError`; index selection disambiguates.
- Offset-based extraction includes nested headings and ends at the compiled section boundary.
- Line slicing and number formatting behavior is implemented and unit-tested, including CRLF, empty input, out-of-range starts, and count bounds.
- Ambiguity diagnostics do not satisfy the merged error contract: raw duplicate headings are supplied and the message gives only a generic placeholder.

### `guide:errors`

- `SpecdGuideError` directly extends native `Error`, duck-types `specd: true`, and imports no core runtime.
- Concrete codes are uppercase snake case and implemented as getter-only properties.
- Topic errors preserve the raw caller input, keep the catalog out of the message, and expose collection-qualified available topics when raised through `GetGuideQuery`.
- Section not-found diagnostics expose available values.
- Ambiguity diagnostics are incomplete relative to the merged requirements and verification scenarios.

### `default:_global/docs`

- `docs/cli/guide-sdk.md` exists and covers listing, topic reads, sections, metadata, scopes, collections, pagination, search, formats, and the distinction from `specd guide`.
- `docs/cli/index.md` indexes the command; `docs/guide/cli.md` contains scenario-oriented recipes; `apps/public-web/sidebars.ts` exposes `cli/guide-sdk`.
- `docs/core/sdk.md` is deleted and no live sidebar/Markdown reference to it was found.
- Host integration guidance remains under `docs/sdk/`.
- The SDK bundler source roots exclude `docs/cli/` and `docs/public-web/`; build-time frontmatter validation is implemented and covered in bundler tests.
- JSON catalogs are the runtime artifacts; deleted generated TypeScript catalogs are not used.

## Discrepancies

### 1. HIGH — SDK factory leaks from a forbidden root barrel

Evidence:

- Merged `guide:composition`: the SDK factory/catalog “MUST NOT be exported from either root barrel” and must be available only through `./sdk`.
- `packages/guide/src/index.ts:11` explicitly exports `createGuideSdkEngine`.
- Graph public-binding resolution confirms `createGuideSdkEngine` is reachable from `guide:src/index.ts` as well as `guide:src/sdk.ts`.
- `package.json` exposes `src/index.ts` output through the public `./internal` subpath.

Possible correction:

- Code: remove the SDK factory reexport from `src/index.ts`; keep it only in `src/sdk.ts`.
- Spec: if SDK access from `./internal` is intentional, relax the “both root barrels” prohibition and explicitly permit the internal barrel. This weakens the stated lazy-loading boundary and should be justified.

### 2. HIGH — `GuideEngine.listGuides` contradicts the merged composition contract

Evidence:

- Merged `guide:composition` still declares `listGuides(): Promise<readonly GuideSummary[]>`.
- `packages/guide/src/composition/guide-engine.ts:40-49` declares `listGuides(options?: ListGuidesOptions): Promise<GuideListingResult>` and also adds `getCollections()`.
- All current CLI and SDK tests consume the envelope (`topics`, `pagination`, `collections`), showing the implemented API is deliberate.
- Living direct dependency `guide:list-guides` still specifies an array-returning `ListGuidesQuery`, while the implementation returns a listing envelope.

Possible correction:

- Specs (preferred if the pagination work is accepted): update `guide:composition`, `guide:list-guides`, and their verification scenarios to the implemented envelope/options contract, including `getCollections` if public.
- Code: revert the facade/query to the array contract and move pagination/collection metadata to a separate API. This would conflict with the new CLI behavior and is likely the less suitable path.

### 3. HIGH — Ambiguous-section error lacks required candidate details and exact commands

Evidence:

- Merged `guide:errors` requires `matchingHeadings` to contain formatted section titles with line numbers.
- Verification requires the message to explicitly mention `--section 3` and `--section 8` (or the actual matching indices).
- `GetGuideSectionQuery` passes only `matches.map((s) => s.heading)`.
- `GuideSectionAmbiguousError` emits only `Use --section <number> to disambiguate.` and never interpolates the matching indices.
- Existing unit tests assert the generic placeholder, so they preserve rather than detect the mismatch.

Possible correction:

- Code: pass formatted candidates such as `[3] Examples (lines 20-35)` and construct the message from every index (`--section 3`, `--section 8`). Update focused tests.
- Spec: reduce the requirement to raw headings plus a generic placeholder. This would remove actionable detail explicitly added by the change and is not recommended.

### 4. MEDIUM — Exact-query preference is only implemented within a hit, not across hits

Evidence:

- Merged `guide:search-guides` says an exact full-query substring must take priority over partial term matches; its verification scenario compares two candidate sections.
- `findBestMatchLine()` adds exact-match priority only while choosing a snippet line inside one section.
- Result ordering remains MiniSearch score order; there is no post-ranking exact-substring boost or sort across documents.
- No focused test creates the required two-document exact-vs-separated-terms case.

Possible correction:

- Code: incorporate an exact-query boost into document ranking or stable post-ranking, then add the two-section regression test.
- Spec: clarify that the rule applies only to snippet-line selection. The current scenario says otherwise.

### 5. MEDIUM — Direct dependency `guide:conventions` conflicts with the new internal-barrel design

Evidence:

- `guide:conventions` says both `src/index.ts` and `src/public.ts` expose only the clean public facade/domain/options/errors, and that adapter mechanics are not leaked.
- Merged `guide:composition` now explicitly defines `src/index.ts` as a broader internal barrel and maps it to `./internal`.
- `src/index.ts` exports `PrebundledGuideCatalogAdapter`, `MiniSearchGuideEngineAdapter`, the entire application/domain surfaces, and `assembleGuideEngine`.

Possible correction:

- Spec: update `guide:conventions` in this change to distinguish curated `public.ts` from internal `index.ts`, matching the composition delta and export map.
- Code: make `src/index.ts` curated too and introduce a differently named internal entry point. This contradicts the new composition design.

### 6. MEDIUM — `package.json` omits manifest fields required by `guide:conventions`

Evidence:

- `guide:conventions` verification requires `main`, `types`, and `exports` to target `dist/`.
- `packages/guide/package.json` has a correct `exports` map but no top-level `main` or `types` fields.

Possible correction:

- Code/manifest: add `main` and `types` pointing to the curated build output, if compatibility fields remain required.
- Spec: explicitly define the modern conditional `exports` map as sufficient and remove the obsolete `main`/`types` requirement.

### 7. MEDIUM — Modified tests violate global naming and description conventions

Evidence:

- `default:_global/testing` requires `.spec.ts`, source-mirroring names, and behavior descriptions in `given…, when…, then…` form.
- This change modifies multiple `.test.ts` files, including `packages/guide/test/integration/guide-engine.test.ts`, `packages/guide/test/unit/application/queries.test.ts`, `packages/guide/test/unit/domain/errors.test.ts`, `packages/guide/test/unit/domain/models.test.ts`, `packages/guide/test/unit/infrastructure/bundle.test.ts`, `packages/guide/test/unit/infrastructure/search.test.ts`, and `packages/cli/test/commands/guide/guide.test.ts`; it also adds `expand-guide-terms.test.ts` and `workspace-package-roots.test.ts`.
- Most descriptions are concise action phrases rather than the mandated BDD form.
- Two new focused suites were correctly renamed to `.spec.ts`, but the remaining touched suites were not.

Possible correction:

- Code/tests: rename all touched/new `.test.ts` files to `.spec.ts`, update references/implementation links, and progressively convert changed behavior descriptions to the mandated form.
- Spec: grandfather legacy `.test.ts` files, but newly added files and changed tests would still need a clearly documented exception.

### 8. LOW — Use-case JSDoc does not enumerate all propagated typed errors

Evidence:

- `default:_global/error-handling-conventions` requires use cases to document errors with `@throws`.
- `GetGuideOutlineQuery.execute` propagates `GuideTopicNotFoundError` but has no `@throws` tag.
- `GetGuideSectionQuery.execute` documents section-not-found and ambiguity but not the propagated `GuideTopicNotFoundError`.

Possible correction:

- Code/docs: add the missing `@throws` tags.
- Spec: narrow the JSDoc requirement to directly constructed errors, though that would make propagated public failure modes harder to discover.

### 9. LOW — Available-heading diagnostic shape varies by selector mode

Evidence:

- Merged `guide:slice-guide-content` requires a documented, consistent available-heading shape.
- Numeric misses pass strings formatted as `"<index>: <heading>"`; named misses pass bare heading strings.
- Both are `readonly string[]`, but the semantic shape varies across error cases and is not documented in the public type beyond “list of valid section headings and indices”.

Possible correction:

- Code: use one descriptor format for both numeric and named misses.
- Spec: explicitly permit selector-dependent formatting and document it.

## Test Coverage

Strong coverage exists for:

- User/SDK catalog isolation and portable packed-package imports.
- Qualified and nested topic resolution.
- Generated API source paths and import metadata.
- Listing scope, collection filters, pagination, formats, and CLI error envelopes.
- Outline indices and source-path integration.
- Numeric/string/slug section selection and duplicate-heading rejection.
- Line slicing, numbering, empty input, bounds, and CRLF.
- Prefix/fuzzy search, topic scoping, limits, special-character safety, snippet boundaries, identifier expansion, and collection-specific read commands.
- Documentation registration and sidebar exposure.

The existing suites would not catch discrepancies 1–4: they import the composition factory directly or from `src/index.ts`, expect the envelope contract, assert the generic ambiguity placeholder, and do not test cross-document exact-query ordering.

No test command was executed by this partial auditor because the assignment restricted writes to this report; this section assesses source-level coverage. The implementation manifest and graph are current and complete after reindexing.

## Missing Tests

1. Import both compiled root barrels and assert `createGuideSdkEngine` is absent; import `./sdk` and assert it is present.
2. A type-level/API-contract test for the final accepted `GuideEngine.listGuides` signature.
3. Ambiguous heading with indices 3 and 8: assert formatted `matchingHeadings` with line spans and exact `--section 3` / `--section 8` guidance.
4. Search two sections where one contains the contiguous full query and one only separated terms; assert the exact hit ranks first.
5. Stop-word-only search (`the`, `of`) that proves results are not removed by preprocessing.
6. Emoji and non-ASCII query safety (the current special-character test is ASCII punctuation only).
7. Explicit stored-field assertions for `level`, `startLine`, and `endLine` without reparsing.
8. Snippet fallback to section start when no query term occurs on any line.
9. Search IDs with identical topic/section index in two collections, asserting neither overwrites the other.
10. `GetGuideOutlineQuery`: empty headings, absence of serialized section content, collection field, nested/generated source path, offsets that slice exactly, foreign-collection rejection, and identical propagated error object.
11. `GuideTopicNotFoundError`: code immutability in strict mode and every returned qualified topic resolving when passed back.
12. Test/package lint rule that rejects `.test.ts` under touched/new files if the global naming requirement remains strict.

## Dependency Chain

```text
default:_global/architecture
  -> guide:conventions
     -> guide:guide-model
     -> guide:list-guides
     -> guide:get-guide
     -> guide:get-guide-outline
     -> guide:search-guides
     -> guide:slice-guide-content
     -> guide:errors
     -> guide:composition

default:_global/error-handling-conventions
  -> guide:errors
     -> guide:slice-guide-content
     -> guide:composition

default:_global/conventions
  -> default:_global/docs
  -> default:_global/testing
  -> default:_global/eslint

guide:composition
  -> @specd/guide main export (src/public.ts)
  -> @specd/guide/internal (src/index.ts)
  -> @specd/guide/sdk (src/sdk.ts)
  -> CLI guide and guide-sdk delivery adapters
```

Key ripple: accepting the paginated listing envelope requires coordinated updates to `guide:list-guides`, `guide:composition`, model/public API documentation, and tests. Accepting the broader internal barrel requires updating `guide:conventions`; otherwise the change leaves two source-of-truth specs in direct conflict.

## Summary Counts

- Findings: 9
- HIGH: 3
- MEDIUM: 4
- LOW: 2
- Direct implementation violations: 3 (SDK root export, ambiguity diagnostics, exact-query cross-hit preference)
- Spec/API alignment conflicts: 2 (`listGuides`; internal barrel)
- Global/dependency convention violations: 4 (manifest fields, test naming/descriptions, JSDoc throws, diagnostic-shape consistency)
- Missing focused test scenarios: 12 groups
- Fully clean audited areas: 10 major areas listed in Requirements Summary

Conclusion: **not clean**. The feature is broadly implemented and documented, but it should not receive a clean compliance result until the three HIGH findings are resolved or the affected specs are deliberately revised. The most likely intended resolution is spec alignment for the listing envelope/internal barrel, plus code fixes for SDK factory isolation and actionable ambiguity diagnostics.
