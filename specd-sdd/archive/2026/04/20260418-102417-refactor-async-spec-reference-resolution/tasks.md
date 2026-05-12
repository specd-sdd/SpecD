# Tasks: refactor-async-spec-reference-resolution

## 1. Async extraction runtime

- [x] 1.1 Make extractor transforms awaitable in the domain runtime
      `packages/core/src/domain/services/content-extraction.ts`: `ExtractorTransform`, `ExtractorTransformResult`, `executeRegisteredTransform()`, `executeTransform()`, `resolveCapturedValues()`, `extractContent()` — change the transform contract from `string` to `string | Promise<string>` and propagate `await` through simple, grouped, and structured extraction paths.
      Approach: add the explicit `ExtractorTransformResult` alias from the design, convert the transform execution helpers to `async`, and keep the domain service pure by awaiting only caller-injected callbacks.
      (Req: Simple extraction, Structured extraction, Transform callbacks)

- [x] 1.2 Convert metadata extraction orchestration to async
      `packages/core/src/domain/services/extract-metadata.ts`: `extractMetadata()`, `extractSingle()`, `extractArray()`, `extractMultiEntryArray()`, `extractMultiEntryGrouped()`, `extractMultiEntryStructured()` — await `extractContent()` consistently so every metadata field shape honors async transforms.
      Approach: keep the existing extraction branching intact, but make each helper `async` and return concrete extracted values after all transform promises settle.
      (Req: Metadata extraction)

- [x] 1.3 Update exported service signatures for the new async contract
      `packages/core/src/domain/services/index.ts`: service exports — keep the public domain-services barrel aligned with the async `extractContent()` / `extractMetadata()` signatures and the new transform result type.
      Approach: export the new type alias and ensure downstream imports resolve the updated async contracts without duplicate local type definitions.
      (Req: Transform callbacks, Metadata extraction)

## 2. Repository-backed spec reference resolution

- [x] 2.1 Add a shared async spec-reference resolver for extractor contexts
      `packages/core/src/application/use-cases/_shared/spec-reference-resolver.ts`: new `SpecReferenceResolver`, `SpecWorkspaceRoute`, `createSpecReferenceResolver()` — implement repository-backed same-workspace resolution via `resolveFromPath()` and cross-workspace resolution via `crossWorkspaceHint`, workspace routes, and `repo.get()` existence checks.
      Approach: follow the design algorithm exactly: origin-repo resolve first, then route escaped hints by configured prefix segments or explicit workspace names, refusing ambiguous hints instead of guessing.
      (Req: dependsOn resolution)

- [x] 2.2 Inject the shared resolver into extractor transform context
      `packages/core/src/application/use-cases/_shared/extractor-transform-context.ts`: `createExtractorTransformContext()` — add optional context options carrying `resolveSpecReference`.
      Approach: extend the opaque context bag without making the domain runtime aware of repositories; preserve the existing origin keys and add only the optional resolver key needed by `resolveSpecPath`.
      (Req: Transform callbacks)

- [x] 2.3 Rewrite the built-in `resolveSpecPath` transform to delegate relative resolution
      `packages/core/src/composition/extractor-transforms/resolve-spec-path.ts`: `resolveSpecPathTransform`, candidate resolution helpers — keep canonical spec-ID normalization local, but move relative-path normalization to the injected async resolver and remove hardcoded workspace-prefix rules.
      Approach: preserve the current candidate order (`value` first, then args), aggregate failure messages as before, and replace workspace-local path math with `context.get('resolveSpecReference')`.
      (Req: Transform callbacks, dependsOn resolution)

## 3. Propagate the async runtime through metadata callers

- [x] 3.1 Update metadata generation to build resolver-aware contexts and await extraction
      `packages/core/src/application/use-cases/generate-spec-metadata.ts`: `GenerateSpecMetadata.execute()` — build `SpecWorkspaceRoute[]`, create one resolver per origin spec, pass it into per-artifact transform contexts, and await `extractMetadata()`.
      Approach: use the shared resolver factory from task 2.1, keep all repository access in the application layer, and accept extracted `dependsOn` as final without post-extraction repair logic.
      (Req: Metadata extraction, dependsOn resolution)

- [x] 3.2 Update context-compilation fallback extraction paths
      `packages/core/src/application/use-cases/compile-context.ts`: `_renderExtractedSectionsFromFiles()`, `_extractDependsOnFallback()`; `packages/core/src/application/use-cases/_shared/depends-on-traversal.ts`: `extractDependsOnFromContent()` — await fallback extraction and use the shared resolver context for dependency normalization.
      Approach: reuse the same resolver builder used by `GenerateSpecMetadata` so stale/missing metadata fallbacks normalize dependencies identically across compile-time flows.
      (Req: Metadata extraction, dependsOn resolution)

- [x] 3.3 Update project-context and artifact-validation fallback extraction paths
      `packages/core/src/application/use-cases/get-project-context.ts`: `_extractionFallback()`; `packages/core/src/application/use-cases/validate-artifacts.ts`: metadata-extraction validation block — await extraction and pass resolver-aware context maps.
      Approach: keep the parser/AST assembly logic unchanged, but ensure every fallback caller uses the shared resolver and handles async transform failures as explicit validation/extraction errors.
      (Req: Metadata extraction, dependsOn resolution)

- [x] 3.4 Wire workspace routes through composition and use-case constructors
      `packages/core/src/composition/use-cases/compile-context.ts`, `packages/core/src/composition/use-cases/get-project-context.ts`, `packages/core/src/composition/use-cases/validate-artifacts.ts`, `packages/core/src/composition/use-cases/generate-spec-metadata.ts`, `packages/core/src/composition/kernel-registries.ts`, `packages/core/src/composition/extractor-transforms/index.ts` — pass logical workspace prefix metadata into the affected use cases without changing the repository port.
      Approach: derive `SpecWorkspaceRoute[]` from resolved workspace config at composition time, thread it through constructors, and keep the built-in transform registry additive and unchanged from the caller perspective.
      (Req: Metadata extraction, dependsOn resolution)

## 4. Tests

- [x] 4.1 Convert domain extraction tests to async and add transform-promise coverage
      `packages/core/test/domain/services/extract-metadata.spec.ts`: `extractContent` / `extractMetadata` describes — update existing assertions to `await`, add cases for awaited extractor transforms, awaited field transforms, rejected promises, and strict non-string rejection after awaiting.
      Approach: keep the current AST fixtures, but register promise-returning transform doubles so the suite exercises all updated verification scenarios from `core:core/content-extraction`.
      (Req: Simple extraction, Structured extraction, Transform callbacks)

- [x] 4.2 Add focused tests for the shared spec-reference resolver
      `packages/core/test/application/use-cases/_shared/spec-reference-resolver.spec.ts`: new resolver suite — cover same-workspace success, `_global` prefix routing, no-prefix workspace-name routing, missing-target failure, and ambiguous escaped hints returning `null`.
      Approach: use fake `SpecRepository` instances with async `resolveFromPath()` / `get()` behavior to verify the exact routing algorithm documented in `design.md`.
      (Req: dependsOn resolution)

- [x] 4.3 Update metadata-generation and fallback use-case tests
      `packages/core/test/application/use-cases/generate-spec-metadata.spec.ts`, `packages/core/test/application/use-cases/compile-context.spec.ts`, `packages/core/test/application/use-cases/get-project-context.spec.ts`, `packages/core/test/application/use-cases/validate-artifacts.spec.ts`, `packages/core/test/application/use-cases/helpers.ts` — add async resolver coverage and the regression case for `../../_global/architecture/spec.md`.
      Approach: keep existing parser fixtures where possible, add a cross-workspace `core/actor-resolver-port` scenario that must yield `default:_global/architecture`, and update SUT builders to accept workspace-route inputs.
      (Req: Metadata extraction, dependsOn resolution)

## 5. Docs and verification

- [x] 5.1 Document the async extraction contract and repository-backed resolution semantics
      `docs/core/services.md`, `docs/core/overview.md`, `docs/core/errors.md`, `docs/core/ports.md`, `docs/schemas/schema-format.md`, `docs/guide/selectors.md` — update the public docs so they describe promise-returning transforms, awaited extraction, and `crossWorkspaceHint` consumption accurately.
      Approach: keep the schema DSL unchanged in docs, but replace stale sync-only signatures and mention rejected transform promises as `ExtractorTransformError` causes.
      (Req: Transform callbacks, Metadata extraction)

- [x] 5.2 Run targeted regression and manual verification commands
      `packages/core/test/...` and CLI smoke path — run the focused core test suites plus `node packages/cli/dist/index.js spec generate-metadata core:core/actor-resolver-port --format json` and confirm the generated dependency is `default:_global/architecture`.
      Approach: execute the exact verification commands from `design.md`, then use `rg` over `docs/core docs/schemas docs/guide` to catch any stale sync-only extractor documentation before closing implementation.
      (Req: Metadata extraction, dependsOn resolution)
