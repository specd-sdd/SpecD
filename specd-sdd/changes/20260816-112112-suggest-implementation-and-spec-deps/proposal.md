# Proposal: suggest-implementation-and-spec-deps

## Motivation

Spec authors need deterministic, static-analysis-driven suggestions for implementation links and inter-spec dependencies without manual correlation or LLM cost. The first implementation proved the capability, but verification exposed architectural, persistence, validation, CLI-help, and test-contract gaps that must be resolved before the feature can be archived.

## Current behaviour

- Suggestion commands can discover and apply relationships, but the SDK public surface exposes concrete filesystem cache adapters and its documented topology contradicts the repository-wide hexagonal architecture.
- Dependency application interprets a nonexistent `ValidateSpecsResult.issues` field, so genuinely invalid specs can be reported as valid and no alignment change is created.
- Alignment changes write `.specd-exploration.md` outside the change repository contract.
- Exploration has no lazy read/write contract or cheap existence metadata equivalent to artifacts.
- Affected CLI leaves omit the JSON/TOON help schema required by `cli:entrypoint`.
- The compliance audit identified observable-reason, validation-ordering, and coverage gaps.

## Proposed solution

- Keep suggestion classes as application use cases, one per file, receiving abstract dependencies only; move workflow assembly, config-based resolution, and concrete cache construction into SDK composition.
- Align dependency validation with the real `{ entries, totalSpecs, passed, failed }` result and its per-entry failures/warnings, validate collaborators before mutation, and always return an explicit post-apply diagnostic.
- Extend `CreateChange` with optional `explorationContent` and delegate its initial persistence to `ChangeRepository`.
- Add explicit lazy exploration read/write operations. `get()` exposes only optional `explorationMeta { lastModified, size }`, never content.
- Make `FsChangeRepository` solely responsible for mapping exploration content to `.specd-exploration.md`; other adapters use their native representation.
- Keep infrastructure implementations out of the SDK root API, return `AdapterRegistryPort` from the built-in registry factory, and export that factory through the code-graph composition surface.
- Resolve every actionable compliance finding in CLI help, validation, scoring, mutation ordering, repository observation/error semantics, and tests.

## Specs affected

### New specs

- `sdk:suggest-implementation-links`: deterministic implementation-link suggestions and additive application.
  - Depends on: `code-graph:symbol-model`, `code-graph:traversal`, `code-graph:language-adapter`, `core:get-persisted-spec-implementation`, `core:update-persisted-spec-implementation`
- `sdk:suggest-spec-dependencies`: deterministic dependency suggestions, mandatory validation, and alignment changes.
  - Depends on: `sdk:suggest-implementation-links`, `code-graph:traversal`, `core:get-persisted-spec-deps`, `core:update-persisted-spec-deps`, `core:create-change`

### Modified specs

- `cli:spec-implementation`: align structured help and tests with `cli:entrypoint`.
  - Depends on (added): `sdk:suggest-implementation-links`
  - Depends on (removed): none
- `cli:spec-deps`: cover validation diagnostics, alignment creation, and non-interactive machine formats.
  - Depends on (added): `sdk:suggest-spec-dependencies`
  - Depends on (removed): none
- `sdk:composition`: define the SDK as a hexagonal package whose composition layer owns concrete dependency wiring while application use cases depend on ports; infrastructure is internal and concrete adapters are not root exports.
  - Depends on (added): `sdk:suggest-implementation-links`, `sdk:suggest-spec-dependencies`
  - Depends on (removed): none
- `core:create-change`: accept optional initial exploration content.
  - Depends on (added): `core:change-repository-port`
  - Depends on (removed): none
- `core:change-repository-port`: define exploration metadata, lazy reads/writes, and initial persistence.
  - Depends on (added): none
  - Depends on (removed): none
- `core:fs-change-repository`: materialize optional exploration in filesystem storage.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:language-adapter`: expose built-in registry construction through composition while returning the domain port rather than the concrete registry.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:graph-store`, `core:fs-spec-repository`, and `core:spec-repository-port`: retain the scoped-query and cheap metadata requirements supporting the feature, aligned with the current `includeMeta` contract and shared observation path.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- `@specd/sdk`: orchestration inputs/results and composition wiring.
- `@specd/core`: `CreateChange`, `ChangeRepository`, filesystem change storage, projections, factories, and tests.
- `@specd/cli`: structured help and complete suggestion-command coverage.
- Existing changes remain compatible: absent exploration yields `explorationMeta: null` and lazy reads return `null`.

## Technical context

- Application use cases coordinate workflows through ports; composition selects concrete adapters and assembles use cases. "Orchestration" describes behaviour, not a separate architectural layer synonymous with composition.
- The SDK may contain domain, application, infrastructure, composition, presentation, and shared code as required by the global architecture. Only composition imports SDK infrastructure; the root entrypoint exposes curated use cases, ports, models, and factories rather than concrete filesystem adapters.
- `createBuiltinAdapterRegistry` is a composition factory whose public return contract is `AdapterRegistryPort`; callers must not depend on `AdapterRegistry`.
- Canonical `createX(deps)` construction remains dependency-based; config construction delegates through SDK composition.
- `explorationContent?: string` is semantic input. Core never knows the filesystem filename.
- Exploration content is not hydrated by `get()`. Optional `{ lastModified, size }` metadata reports existence without reading content.
- `readExploration()` and `writeExploration()` are explicit operations. Revision/conflict tokens are deferred.
- Absent or empty initial exploration creates no exploration. Supplied content must not leave a partially created alignment change.
- `FsSpecRepository` uses `includeMeta`, not the obsolete `includeMetadataStatus`; artifact metadata must reuse the shared observation/hash path.
- Required observers must be injected explicitly, and update/apply failures must remain observable rather than being swallowed. Tier-2 fallback wording must distinguish continuing after an empty strategy from stopping once adequate candidates are found.
- The compliance report is binding design input: all critical/high/medium findings and missing tests must be addressed.

## Open questions

None. Architecture, optionality, lazy loading, filesystem ownership, and deferred revision semantics were resolved with the user.
