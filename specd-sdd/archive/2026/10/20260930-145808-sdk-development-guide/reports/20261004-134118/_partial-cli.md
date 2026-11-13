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
