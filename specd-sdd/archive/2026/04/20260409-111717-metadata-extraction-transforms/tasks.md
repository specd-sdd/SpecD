# Tasks: metadata-extraction-transforms

## 1. Extractor contract

- [x] 1.1 Extend extractor value objects to model transform declarations
      `packages/core/src/domain/value-objects/extractor.ts`: `Extractor`, `FieldMapping`, `ExtractorTransformDeclaration` — add shared transform declaration support to both extractor levels so schema and runtime use one normalized contract
      Approach: introduce a normalized `{ name, args? }` declaration type, use it for both `Extractor.transform` and `FieldMapping.transform`, and keep the rest of the extractor model generic rather than metadata-specific
      (Req: Extractor value object, FieldMapping value object)

- [x] 1.2 Parse shorthand and object transform syntax at the YAML boundary
      `packages/core/src/infrastructure/schema-yaml-parser.ts`: `FieldMappingZodSchema`, `ExtractorZodSchema` — accept `transform: string` and `transform: { name, args }` and normalize them before domain/application code sees them
      Approach: keep YAML validation at the infrastructure boundary and normalize both syntax forms immediately so runtime code never branches on raw schema syntax
      (Req: Extractor value object, FieldMapping value object, Metadata extraction)

- [x] 1.3 Introduce the typed transform failure contract
      `packages/core/src/domain/errors/extractor-transform-error.ts`: `ExtractorTransformError` — define the contract error for unknown transform names and transform execution failures, including transform name and failing owner information
      Approach: add a typed `SpecdError` subclass with enough data for extractor-level and field-level failures, including optional `fieldName` for field transforms
      (Req: Transform callbacks)

## 2. Extraction engine

- [x] 2.1 Redesign capture helpers around semantic value plus placeholders
      `packages/core/src/domain/services/content-extraction.ts`: capture helpers and internal captured-value model — make `value` resolve to `$1` when capture is present while preserving `$0`, `$2`, and higher groups for interpolation
      Approach: replace the current first-group-only helpers with an internal captured-value representation that can drive simple extraction, field extraction, and follow-sibling extraction consistently
      (Req: Extractor value object, FieldMapping value object, Simple extraction)

- [x] 2.2 Apply transforms per emitted value in simple and grouped extraction
      `packages/core/src/domain/services/content-extraction.ts`: `extractContent`, grouped/simple extraction branches — execute registered transforms per produced string value and require a non-null returned string once a value has been extracted
      Approach: keep transforms string-oriented, interpolate args before invocation, treat grouped extraction as item-value transformation rather than object-level transformation, and surface typed failures instead of silently omitting transformed values
      (Req: Simple extraction, Transform callbacks)

- [x] 2.3 Apply capture and transforms in structured field extraction
      `packages/core/src/domain/services/content-extraction.ts`: `extractStructured`, `extractField`, `extractChildText`, `extractFieldsWithFollowSiblings`, `extractFollowSiblingText` — make field-level extraction use the same capture semantics and transform runtime as simple extraction
      Approach: run field capture first, derive the semantic field value as `$1` when capture exists, then invoke `FieldMapping.transform` with interpolated args and propagate `ExtractorTransformError` on failure
      (Req: Structured extraction, Follow siblings, Transform callbacks)

- [x] 2.4 Enforce explicit transform lookup and error propagation
      `packages/core/src/domain/services/content-extraction.ts`: transform lookup/execution path — stop silently ignoring unknown transforms and normalize all transform failures to `ExtractorTransformError`
      Approach: resolve transform names from the injected registry, throw `ExtractorTransformError` for missing registrations, wrap callback failures with transform and field metadata, and keep context opaque to the extractor
      (Req: Transform callbacks, Constraints)

- [x] 2.5 Thread the new registry/context contract through metadata orchestration
      `packages/core/src/domain/services/extract-metadata.ts`: `extractMetadata`, `extractSingle`, `extractArray`, `extractMultiEntryArray`, `extractMultiEntryGrouped`, `extractMultiEntryStructured` — replace the old `string[] -> string[]` transform shortcut with the generic extractor-transform registry and context bag
      Approach: extend orchestration signatures to pass both registry and per-call context through to `extractContent` without making metadata extraction the owner of transform semantics
      (Req: Metadata extraction, Metadata extraction, MetadataExtraction validation)

## 3. Kernel registry and built-ins

- [x] 3.1 Add extractor transform registration to kernel registries
      `packages/core/src/composition/kernel-registries.ts`: `KernelRegistryInput`, `KernelRegistryView`, `createKernelRegistryView` — add extractor transform registry support with the same additive merge and duplicate-conflict behavior as other kernel registries
      Approach: model extractor transforms as another merged registry family and reuse `RegistryConflictError` rather than inventing override semantics
      (Req: Transform callbacks)

- [x] 3.2 Implement modular built-in transform files
      `packages/core/src/composition/extractor-transforms/resolve-spec-path.ts`, `packages/core/src/composition/extractor-transforms/index.ts` — move built-ins into dedicated files so future transforms can be added without bloating kernel assembly
      Approach: export one built-in transform per file, starting with `resolveSpecPath`, and provide a small registry-assembly module consumed by kernel internals
      (Req: dependsOn resolution, dependsOn resolution order, Automatic dependsOn extraction)

- [x] 3.3 Register built-ins and expose external registration APIs
      `packages/core/src/composition/kernel-internals.ts`, `packages/core/src/composition/kernel.ts`, `packages/core/src/composition/kernel-builder.ts` — wire built-in extractor transforms into kernel construction and expose `registerExtractorTransform(name, fn)` for external callers
      Approach: import the built-in registry from the dedicated composition module, merge it through `createBuiltinKernelRegistry()`, thread the merged registry through `createKernel()`, and mirror existing builder registration patterns with duplicate-name rejection
      (Req: Transform callbacks)

## 4. Runtime wiring

- [x] 4.1 Add a shared origin-context helper for extraction callers
      `packages/core/src/application/use-cases/_shared/`: new extraction-context helper — centralize creation of `originWorkspace`, `originSpecPath`, `artifactId`, and `artifactFilename` so all use cases pass the same context keys to transforms
      Approach: add a small synchronous helper that assembles the opaque `ReadonlyMap<string, unknown>` context bag from current spec/artifact information instead of duplicating ad hoc maps across use cases
      (Req: MetadataExtraction validation, dependsOn resolution order, Falls back to extraction when metadata is stale or absent)

- [x] 4.2 Remove manual dependsOn repair from metadata generation
      `packages/core/src/application/use-cases/generate-spec-metadata.ts`: `GenerateSpecMetadata.execute()` — pass extractor transforms and origin context into `extractMetadata()` and delete the repository-driven post-pass that repairs `dependsOn`
      Approach: rely on built-in `resolveSpecPath` during extraction so generated metadata is already normalized when the final metadata object is assembled
      (Req: Metadata extraction, dependsOn resolution)

- [x] 4.3 Make artifact validation and specDependsOn updates fully transform-backed
      `packages/core/src/application/use-cases/validate-artifacts.ts`: constructor, metadata validation path, automatic dependency extraction path — use the shared registry/context for metadata validation and delete `_extractDependsOn()` plus any field-specific repair logic
      Approach: validate extracted metadata with transforms enabled, treat transform failures as validation failures, and persist already-transformed dependency IDs through `change.setSpecDependsOn(...)`
      (Req: MetadataExtraction validation, Automatic dependsOn extraction)

- [x] 4.4 Make context compilation fallbacks use the shared transform runtime
      `packages/core/src/application/use-cases/compile-context.ts`, `packages/core/src/application/use-cases/_shared/depends-on-traversal.ts`, `packages/core/src/application/use-cases/get-project-context.ts` — thread extractor transforms and origin context into stale-metadata fallback rendering and dependency traversal fallback
      Approach: use the shared extraction-context helper in every fallback path so `dependsOn` traversal and rendered fallback content observe the same transform-normalized values as metadata generation and validation
      (Req: dependsOn resolution order, Staleness detection and content fallback, Supports dependsOn traversal when followDeps is true, Falls back to extraction when metadata is stale or absent)

## 5. Tests and docs

- [x] 5.1 Add domain-level extraction tests for capture, transforms, and typed failures
      `packages/core/test/domain/services/content-extraction.spec.ts` and nearby extraction suites — cover shorthand/object transform declarations, capture placeholder interpolation, field-level transforms, follow-sibling capture behavior, and `ExtractorTransformError`
      Approach: pin the extractor semantics first with focused unit tests that exercise `$0/$1/$2`, `undefined` args, unknown transform names, and field-level error metadata
      (Req: Extractor value object, FieldMapping value object, Simple extraction, Structured extraction, Follow siblings, Transform callbacks)

- [x] 5.2 Add schema-parser and composition tests for transform registration
      `packages/core/test/infrastructure/schema-yaml-parser.spec.ts`, `packages/core/test/composition/*` — verify transform syntax parsing, built-in registry assembly, external registration through kernel options/builder, and duplicate-name conflicts
      Approach: add narrow tests for normalized parsing and for kernel composition behavior instead of relying only on end-to-end use-case coverage
      (Req: Metadata extraction, Transform callbacks)

- [x] 5.3 Add use-case tests for transform-backed metadata flows
      `packages/core/test/application/use-cases/generate-spec-metadata.spec.ts`, `validate-artifacts.spec.ts`, `compile-context.spec.ts`, `get-project-context.spec.ts` — verify that all runtime extraction callers use the shared registry/context and no longer rely on manual `dependsOn` repair
      Approach: cover one canonical `resolveSpecPath` path in each use case, cover the explicit arg-driven behavior for already-canonical spec IDs, assert transformed spec IDs are persisted/rendered, and assert transform failures surface as use-case failures where required
      (Req: Metadata extraction, dependsOn resolution, MetadataExtraction validation, Automatic dependsOn extraction, dependsOn resolution order, Staleness detection and content fallback, Supports dependsOn traversal when followDeps is true, Falls back to extraction when metadata is stale or absent)

- [x] 5.4 Update schema and core docs for the new transform runtime
      `docs/schemas/`, `docs/core/` — document transform declaration syntax, `$0/$1/$2` interpolation, context-bag expectations, `ExtractorTransformError`, and kernel/builder registration APIs
      Approach: treat transforms as a public authoring and integration feature, documenting both schema-side declaration and composition-side registration with examples based on `resolveSpecPath`
      (Req: Metadata extraction, Transform callbacks)

## 6. Review follow-up: non-null transform contract

- [x] 6.1 Tighten the runtime transform contract to reject silent value loss
      `packages/core/src/domain/services/content-extraction.ts`, `packages/core/src/domain/value-objects/extractor.ts`, `packages/core/src/domain/errors/extractor-transform-error.ts` — remove the remaining `null` omission semantics so any transform that receives a value must return a non-null string or fail explicitly
      Approach: preserve the existing transform pipeline and typed error path, but change the callback contract and execution checks so extracted values cannot degrade to absence after transform execution
      (Req: Simple extraction, Structured extraction, Transform callbacks, Constraints)

- [x] 6.2 Make `resolveSpecPath` explicit about canonical-ID passthrough
      `packages/core/src/composition/extractor-transforms/resolve-spec-path.ts`, `packages/core/src/composition/extractor-transforms/index.ts` — support already-canonical spec IDs only when enabled through declarative args and fail explicitly otherwise
      Approach: keep path-to-spec resolution as the default behavior, add arg-driven canonical passthrough handling, and route non-resolvable or disallowed canonical values through `ExtractorTransformError` instead of returning `null`
      (Req: dependsOn resolution, dependsOn resolution order, Automatic dependsOn extraction)

- [x] 6.3 Propagate the stricter contract through metadata flows and regression coverage
      `packages/core/src/application/use-cases/generate-spec-metadata.ts`, `packages/core/src/application/use-cases/validate-artifacts.ts`, `packages/core/src/application/use-cases/compile-context.ts`, `packages/core/src/application/use-cases/get-project-context.ts`, `packages/core/test/**`, `docs/schemas/`, `docs/core/` — align callers, tests, and docs with the reviewed rule that found dependency values may not be silently discarded
      Approach: thread the non-null/fail semantics through every transform-backed fallback path, add regression tests for dropped `dependsOn` values and arg-controlled canonical IDs, and document the revised contract so review-driven work stays visible as follow-up rather than being folded into the original completed plan
      (Req: Metadata extraction, MetadataExtraction validation, Automatic dependsOn extraction, dependsOn resolution order, Falls back to extraction when metadata is stale or absent, Transform callbacks)

## 7. Review follow-up: canonical dependency-entry format

- [x] 7.1 Align `schema-std` and the spec template with canonical dependency labels
      `packages/schema-std/schema.yaml`, `packages/schema-std/templates/spec.md` — update authoring instructions and the default spec template so `## Spec Dependencies` is mandatory, uses canonical visible spec IDs, and prefers the linked form ``[`<workspace>:<capability-path>`](../relative/path/spec.md)``
      Approach: make the global spec-layout rule explicit in the standard schema/template now so new and modified artifacts stop emitting legacy `specs/.../spec.md` labels during the redesign
      (Req: Metadata extraction, Spec Dependencies section)

- [x] 7.2 Replace the temporary schema passthrough wiring with final fallback-candidate extraction
      `packages/schema-std/schema.yaml`, `packages/core/src/composition/extractor-transforms/resolve-spec-path.ts`, `packages/core/test/**` — once `resolveSpecPath` supports trying `value` and then interpolated args in order, update the standard `dependsOn` extractor to pass the captured `href` as a real fallback candidate instead of relying on temporary canonical-label passthrough
      Approach: keep the current schema change only as a compatibility step for in-progress artifact validation, then tighten it to the final capture-plus-fallback design when the built-in transform is ready
      (Req: Metadata extraction, Transform callbacks, Spec Dependencies section)
