# Proposal: refactor-async-spec-reference-resolution

## Motivation

Spec dependency normalization is currently fragile across workspace boundaries. Relative links such as `../../_global/architecture/spec.md` can be normalized incorrectly, and the current transform model cannot use repository-backed resolution cleanly because extraction is synchronous.

## Current behaviour

Today `resolveSpecPath` resolves relative links from a lightweight logical origin context (`originWorkspace`, `originSpecPath`) using local path math. This can misclassify cross-workspace links and currently produces values such as `core:_global/architecture` instead of `default:_global/architecture` for specs under `specs/core/`.

The current implementation also hardcodes `_global -> default` behavior instead of deriving workspace and prefix semantics from repository-backed resolution. Because extractor transforms are synchronous, they cannot directly use async repository APIs such as `SpecRepository.resolveFromPath(...)`.

## Proposed solution

Redesign spec-reference normalization so metadata extraction and related fallback paths can use repository-backed resolution without assuming a filesystem-only storage model.

The design direction for this change is:

- make the extraction transform pipeline support async transform callbacks
- keep extraction generic and caller-injected, so the domain service stays pure and does not import repositories directly
- move cross-workspace dependency normalization to repository-backed orchestration rather than weak workspace-local path math and prefix hardcodes
- preserve the existing declarative schema model for `transform: resolveSpecPath`, while changing the runtime contract behind it

## Specs affected

### New specs

_none_

### Modified specs

- `core:core/content-extraction`: change the transform runtime contract so extractor and field transforms can resolve values asynchronously, enabling repository-backed normalization while keeping extraction generic and pure.
  - Depends on (added): none

- `core:core/generate-metadata`: change metadata extraction orchestration to await async extraction and treat repository-backed dependency normalization as the canonical `dependsOn` resolution path.
  - Depends on (added): `core:core/spec-repository-port`

- `core:core/spec-repository-port`: refine the repository path-resolution contract so callers can use it as the authoritative basis for cross-workspace spec-reference normalization during extraction.
  - Depends on (added): none

## Impact

- `packages/core/src/domain/services/content-extraction.ts`
- `packages/core/src/composition/extractor-transforms/resolve-spec-path.ts`
- `packages/core/src/application/use-cases/_shared/extractor-transform-context.ts`
- `packages/core/src/application/use-cases/generate-spec-metadata.ts`
- `packages/core/src/application/use-cases/compile-context.ts`
- `packages/core/src/application/use-cases/get-project-context.ts`
- `packages/core/src/application/use-cases/validate-artifacts.ts`
- `packages/core/src/application/ports/spec-repository.ts`
- `packages/core/src/infrastructure/fs/spec-repository.ts`
- unit and integration tests covering extraction, metadata generation, context fallback extraction, and spec path resolution

This change is internally high-impact because `resolveSpecPathTransform` and the extractor-transform context sit on a critical path used by metadata generation and multiple fallback extraction flows. The external user-visible goal remains stable: canonical `dependsOn` values should resolve correctly across workspaces without prefix-specific hacks.

## Technical context

- The current bug comes from `resolveSpecPath` treating `../../_global/architecture/spec.md` as still belonging to the origin workspace after consuming `..` segments from `originSpecPath`.
- The current transform only receives logical origin data and does not consult real workspace configuration.
- A filesystem-absolute fix was considered and rejected because it would effectively assume `SpecRepository` is fs-backed.
- `SpecRepository.resolveFromPath(...)` already models repository path resolution, but it is async and therefore cannot be used directly by the current synchronous transform pipeline.
- The agreed direction is to do this properly rather than patching the current path math. That means changing the extraction pipeline so caller-injected transforms can await repository-backed resolution while keeping the domain service free of direct port imports.
- This change should remove hardcoded `_global -> default` behavior from the normalization path and derive workspace semantics from repositories and their configured prefixes instead.

## Open questions

- None currently. The agreed direction is to support async extractor transforms and use repository-backed resolution rather than fs-specific path inference.
