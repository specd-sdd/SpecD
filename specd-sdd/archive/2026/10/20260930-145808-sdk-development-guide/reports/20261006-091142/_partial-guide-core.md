# Guide core compliance audit

## Scope

Audited merged-change requirements for `guide:guide-model`, `guide:bundle-guides`, `guide:composition`, `guide:conventions`, and `guide:errors` against the current `packages/guide` implementation and tests.

## Requirements Summary

- The guide domain has collection-qualified, source-path-aware topic, outline, summary, section, and search-hit models; offsets and line coordinates are build-time data.
- The package compiles user and SDK catalogs into package-root JSON assets during the build, validates hand-written frontmatter, discovers nested Markdown deterministically, and generates API topics from the public TypeDoc entry-point configuration.
- The public package facade is separated from `./internal` and `./sdk`; runtime lookup uses only packaged JSON and has no `@specd/core`, CLI, or MCP runtime dependency.
- Domain errors must duck-type the SpecD error contract without importing core, preserve raw failed input, and provide structured candidates / disambiguation data.

## Implementation Status

Compliant in the audited scope.

- Domain interfaces in `packages/guide/src/domain/models/` expose the required collection/topic identity, real `sourcePath`/`file`, byte and line metadata, section offsets, and lightweight summary projection. `GetGuideOutlineQuery` deliberately strips section content while retaining coordinates; `GetGuideSectionQuery` rehydrates it from catalogued offsets.
- `scripts/bundle-guides.ts` configures the user plus SDK, core, code-graph, skills, and schemas roots and emits only `generated/guides.json` and `generated/guides-sdk.json`. `guide-bundler.ts` validates all required frontmatter fields, rejects colon-bearing identifiers, preserves nested paths, calculates UTF-8 byte size, normalizes CRLF-aware line boundaries, and deterministically orders catalog records.
- `scripts/sdk-api-generator.ts` is invoked by the bundle entrypoint; package scripts run bundling before `tsup`. The emitted assets are listed in `package.json` `files`, and `PrebundledGuideCatalogAdapter` loads package-root JSON from either source or compiled layout rather than reading docs or parsing Markdown at runtime.
- `package.json` exports the intended `.`, `./internal`, and `./sdk` surfaces. `public.ts` omits adapters, generated assets, the SDK factory, and the internal composition assembly function. The only runtime dependency is `minisearch`; build-time TypeDoc tooling is in `devDependencies`.
- `SpecdGuideError` extends native `Error` and exposes the `specd` discriminator without a core import. The three concrete errors expose the required machine-readable codes and preserve structured missing-topic, missing-section, and ambiguous-section information. The ambiguity message enumerates every usable `--section N` choice.
- `README.md` documents the architecture, zero-core design, entrypoints, schemas, quick starts, and all 22 current user catalog topics. Its user-topic table matches `generated/guides.json` on this audit.

## Discrepancies

None found (0 critical, 0 high, 0 medium, 0 low).

The prior Markdown output-format mismatch is outside this core package scope and is no longer represented here: Guide's package contracts operate on Markdown document content, while the revised CLI output-format contract limits structured/text renderers separately.

## Test Coverage

- `test/unit/infrastructure/bundle.test.ts` exercises frontmatter failure cases, UTF-8 byte lengths, CRLF normalization, nested topics, section offsets, heading hierarchy, catalog isolation, and generated catalog boundaries.
- `test/unit/domain/models.test.ts` covers representative model shapes and multibyte lengths; `test/unit/domain/errors.spec.ts` covers the error hierarchy, structured fields, messages, names, and explicit ambiguity choices.
- `test/unit/application/queries.spec.ts` and `test/unit/application/slicing.test.ts` cover topic normalization, qualified lookup behavior, outline/section projection, and line slicing.
- `test/integration/guide-engine.test.ts` and `test/integration/sdk-catalog.spec.ts` cover the public and SDK engines, generated topic paths, collection isolation, package tarball loading without repository docs, ordering, and read-command derivation.
- The parent verification run reported the full test suite passing, including the Guide package suite.

## Missing Tests

No uncovered requirement was observed as an implementation defect. The following are non-blocking test-hardening opportunities:

- Add an automated README-to-`generated/guides.json` parity assertion. The table currently matches by inspection, but the requirement is durable enough to benefit from a machine check.
- Add direct unit assertions that assignment to each concrete error's `code` fails in strict mode and that its code matches `UPPER_SNAKE_CASE`; the implementation's getter-only contract satisfies this, but the current error test focuses on values rather than immutability.
- Add an explicit fenced-code-block heading test and a level-6 extraction test in the bundler suite if they are not covered indirectly by fixtures.

## Dependency Chain

`bundle-guides.ts` -> `generated/guides*.json` -> `PrebundledGuideCatalogAdapter` -> query handlers -> `assembleGuideEngine` -> `createGuideEngine` / `createGuideSdkEngine` -> CLI guide commands.

Graph impact for `guide:src/composition/guide-engine.ts` reports four direct and 35 indirect dependents, including both CLI commands and their integration tests; this confirms the audited facade is a critical boundary and that downstream coverage exists.

## Summary Counts

| Category                       |         Count |
| ------------------------------ | ------------: |
| Requirements assessed          |       5 specs |
| Discrepancies                  |             0 |
| Critical / High / Medium / Low | 0 / 0 / 0 / 0 |
| Test-hardening opportunities   |             3 |
