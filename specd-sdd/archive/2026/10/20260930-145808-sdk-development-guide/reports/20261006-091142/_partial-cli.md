# CLI compliance audit

## Requirements Summary

Audited the merged requirements for `cli:guide-sdk`, `cli:guide`, and
`cli:entrypoint`. The CLI must expose `guide-sdk` as a top-level sibling of
`guide`; lazily load the `@specd/guide/sdk` catalog; preserve normal config,
format, error, and exit-code conventions; support bounded, scoped catalog and
metadata/topic inspection; and expose a structured discovery pointer from the
main guide. The current merged contract supports exactly `text`, `json`, and
`toon` output formats. Repository documentation must live in the global
documentation layout.

## Implementation Status

- `packages/cli/src/program.ts:260-270` registers `guide-sdk` at the root and
  resolves the SDK engine through a cached dynamic import of `@specd/guide/sdk`.
  Root help confirms it is a sibling of `guide`.
- `packages/cli/src/commands/guide-sdk/index.ts:272-409` declares the command,
  catalog filters, pagination, body slicing, structured formats, help schema,
  and `search`; `runListing` validates and composes `--scope` with
  `--collection` at lines 499-518.
- `packages/cli/src/commands/guide/formatters.ts:11-35` constrains the shared
  guide formatter to `text | json | toon`. Manual execution of
  `guide-sdk --format markdown` exits 1 with the expected allowed formats;
  Markdown is no longer advertised or accepted as an output encoding.
- `packages/cli/src/commands/guide/index.ts:28-35` and the shared formatter
  add the structured `sdkGuide` discovery payload to the main `guide` listing.
  A real `guide --format json` run produced command, description, and the five
  SDK collections.
- `docs/cli/guide-sdk.md` documents the command under the required `docs/cli`
  path and matches the scoped/structured output contract.

## Discrepancies

None found in this scope.

The prior Markdown-format mismatch is resolved by the merged contract and the
implementation: code rejects Markdown, while the remaining “Generated
Markdown Is Formatted Consistently” requirement concerns generated _document
content_, not CLI output encoding.

## Test Coverage

- `packages/cli/test/commands/guide-sdk/guide-sdk.spec.ts` covers default
  generated-topic withholding, `--scope`/`--collection` composition and
  validation, structured envelope fields, index semantics, help text, topic
  normalization and metadata, slicing, unknown-topic errors, search output,
  invalid format handling, registration, and lazy engine resolution.
- The change's full verification run already passed the repository test suite
  (CLI: 1099 tests; Guide: 135 tests). This audit additionally exercised the
  compiled CLI: root help, `guide-sdk --format json`, `guide --format json`,
  invalid Markdown format, invalid scope, generated topic metadata, and a
  section/line-number window.

## Missing Tests

No compliance-blocking gap found. Existing command-level tests and the manual
compiled-CLI smoke checks cover the changed output-format contract, including
Markdown rejection. A process-level integration assertion for local and global
`--config` positions would be useful regression coverage, but source wiring
uses the shared root `preAction` propagation and this is not a discrepancy with
the merged spec.

## Dependency Chain

`createProgram()` → `registerGuideSdkCommand()` → lazy
`import('@specd/guide/sdk')` → `createGuideSdkEngine()` → shared GuideEngine;
the command shares listing/metadata/search formatters and error handling with
`guide`. The graph impact analysis identifies those CLI formatters, pagination,
config/error helpers, the SDK engine composition, and the corresponding CLI
test as direct dependents. This supports the lazy-boundary and shared-envelope
implementation rather than a duplicate catalog implementation.

## Summary Counts

- Requirements assessed: 3 merged CLI specs plus relevant global docs contract
- Implemented and evidenced: 3
- Discrepancies: 0 (critical 0, high 0, medium 0, low 0)
- Test gaps: 0 blocking; 1 optional regression-coverage observation

## Audit Note

`project status --context --graph` reported `stale: false` but also
`fingerprintMismatch: true`. Graph findings were used for impact discovery and
cross-checked against the current source files; this environment/index signal
does not establish a code-vs-spec discrepancy in the audited CLI surface.
