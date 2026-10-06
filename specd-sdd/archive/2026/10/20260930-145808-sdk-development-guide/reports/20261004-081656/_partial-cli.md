# Full compliance audit — CLI batch (`sdk-development-guide`)

## Requirements Summary

Audited the current merged `spec.md` and `verify.md` artifacts for:

- `cli:guide-sdk`: SDK catalog/listing, independent scope and collection filtering,
  pagination and structured output, metadata/index/topic reads, section and line
  slices, unknown-topic diagnostics, identifier search, and public generated-topic
  metadata policy.
- `cli:guide`: existing user-guide behavior plus the structured discovery pointer to
  `specd guide-sdk`, compatible listing envelope, help text, and index behavior.
- `cli:entrypoint`: root Commander registration, lazy loading of the SDK guide engine,
  output/error conventions, help, configuration propagation, and exit behavior.

The merged verify artifacts contain 22 requirements / 101 scenarios for
`cli:guide-sdk`, 18 / 63 for `cli:guide`, and 33 / 95 for `cli:entrypoint`. The
last two include inherited broad CLI scenarios; review scope is restricted to behavior
reached by this change and its direct dependencies.

## Implementation Status

The command implementation is substantially complete and correctly wired.

- `packages/cli/src/program.ts` registers `guide-sdk` next to `guide`, with a
  memoized `import('@specd/guide/sdk')`; this satisfies the intended lazy catalog
  boundary for invocations that do not run the SDK command.
- `packages/cli/src/commands/guide-sdk/index.ts` implements list, index, topic read,
  metadata, slices and search; validates `--scope` / `--collection`; uses shared
  pagination and formatting; and maps guide-domain errors through CLI error handling.
- `packages/cli/src/commands/guide/index.ts` and
  `packages/cli/src/commands/guide/formatters.ts` emit the structured `sdkGuide`
  discovery field and the shared listing-envelope structure.
- `formatGuideIndex` correctly produces one `readHint` and renders no per-topic
  command. A real `guide-sdk --meta --page-size 2 --format json` invocation confirms
  exactly that envelope shape.
- The generated-source-path policy is now aligned: current merged requirements and
  scenarios say source paths must be withheld for generated topics; `runTopic` and
  `toPublicSearchHit` implement that omission while retaining the path for
  hand-written documents.

## Discrepancies

### 1. BLOCKING artifact contradiction: catalog-index retrieval command

`cli:guide-sdk` merged requirements require a _single_ literal retrieval hint,
`specd guide-sdk <topic>`, exactly once, and explicitly prohibit per-topic commands.
The merged verify artifact still includes the incompatible scenario **“Index reports
the page and a retrieval command per topic”**, which requires every topic to carry a
copy-pasteable retrieval command. Its immediately following scenario requires the
opposite. The implementation follows the merged requirement and the latter scenario:
the JSON index contains `readHint` once and each row carries only the fully qualified
topic identifier.

Classification: artifact/verification defect, not an implementation defect. It needs
design review before the change can truthfully pass all scenarios.

### 2. `cli:entrypoint` requires a `Guide error:` prefix that the command does not emit

The merged entrypoint verify scenario **“Command uses the standard domain error
prefix”** requires `Guide error:`. Actual execution of
`node packages/cli/dist/index.js guide-sdk core:prot --format text` exits 1 and emits
`error: [UNKNOWN_GUIDE_TOPIC] Guide topic 'core:prot' not found.` The common CLI error
prefix is present, but `Guide error:` is not.

This is a compliance failure against the current merged scenario. The `Guide error:`
wording also conflicts with the project-wide standard error convention (`error:` plus
machine-readable code), so this should be resolved as an artifact decision rather than
blindly changing the implementation.

### 3. `guide-sdk --help` does not document JSON and TOON schemas

The merged entrypoint scenario **“Command help declares its json and toon schemas”**
requires both output schemas in help. Actual `guide-sdk --help` lists the
`--format <format>` option and examples but has no `JSON/TOON output schema:` section
or equivalent schema declaration.

Classification: implementation and test gap against the current merged scenario.

No discrepancy remains for the previously stale `ArtifactDag` example: help now uses
`sdk:classes/ArtifactDag`, and a focused test asserts the old interface path is absent.

## Test Coverage

Executed:

```text
pnpm --filter @specd/cli test -- test/commands/guide-sdk/guide-sdk.test.ts \
  test/commands/guide/guide.test.ts test/entrypoint.spec.ts
```

Result: **87 test files passed, 1,097 tests passed**.

Focused coverage includes SDK default suppression, scope/collection composition,
invalid flags, catalog envelopes and pagination, index `readHint`, metadata, generated
source-path omission, topic errors/suggestions, sections/slices, search, user-guide
discovery in text/JSON/TOON, and the canonical `ArtifactDag` help example. Root help
was also exercised directly: it lists `guide-sdk` as a top-level sibling of `guide`.

## Missing Tests

- A negative index assertion that individual index topic objects never expose a
  retrieval-command property; current coverage checks the single `readHint` but does
  not explicitly protect against reintroduction of per-row commands.
- A root `createProgram()` integration test that invokes `guide-sdk` through the real
  registration and verifies the SDK factory is lazy. Existing SDK tests register the
  command directly; `entrypoint.spec.ts` has no `guide-sdk` assertion.
- Tests for the exact desired domain-error convention. The current suite checks
  structured unknown-topic output but does not reconcile the `Guide error:` scenario
  with the standardized `[UNKNOWN_GUIDE_TOPIC]` output.
- A help-contract test (and implementation) for JSON/TOON schema documentation, if
  that entrypoint requirement remains intended.

## Dependency Chain

```text
cli:entrypoint
  -> packages/cli/src/program.ts
     -> registerGuideCommand (cli:guide)
        -> guide/index.ts -> guide/formatters.ts -> @specd/guide
     -> registerGuideSdkCommand (cli:guide-sdk)
        -> guide-sdk/index.ts
           -> listing-options.ts / guide/formatters.ts / CLI errors
           -> lazy @specd/guide/sdk -> GuideEngine
```

Graph analysis marks `cli:src/commands/guide-sdk/index.ts` HIGH risk. Its direct
affected surface includes the shared formatters, pagination, error mapping, root
program, focused SDK tests, and covering specs `cli:entrypoint` and `cli:guide`.
The direct spec dependency chain also includes `guide:composition`, `guide:guide-model`,
`guide:bundle-guides`, `guide:conventions`, `default:_global/docs`, and the CLI error
handling conventions.

## Counts

| Item                                 |      Count |
| ------------------------------------ | ---------: |
| Audited CLI spec IDs                 |          3 |
| Merged requirement totals reviewed   |         73 |
| Merged scenario totals reviewed      |        259 |
| Focused test command runs            |          1 |
| Vitest files passed                  |         87 |
| Vitest tests passed                  |      1,097 |
| Implementation-compliance failures   |          1 |
| Artifact/verification contradictions | 1 blocking |
| Policy/contract decision required    |          1 |
| Missing-test areas                   |          4 |
