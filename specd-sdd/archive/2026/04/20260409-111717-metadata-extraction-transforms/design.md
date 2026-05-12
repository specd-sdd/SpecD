# Design: metadata-extraction-transforms

## Non-goals

- Add arbitrary object-valued transform outputs. This change keeps extractor transforms string-oriented: the primary value remains a string and field-level array aggregation continues to be owned by the extractor pipeline.
- Turn transforms into independent application use cases. They are registry-backed extractor callbacks integrated into kernel composition, not workflow objects with their own lifecycle.
- Change how persisted `metadata.json` is parsed. The problem being solved is extraction from artifacts before persistence, not the parsing of already-written metadata.
- Generalize placeholder interpolation beyond regex capture output. This change only standardizes `$0`, `$1`, `$2`, ... derived from extractor `capture`.

## Affected areas

- `packages/core/src/domain/value-objects/extractor.ts`
  Change: expand the extractor model so both `Extractor` and `FieldMapping` can declare transforms with shorthand and object syntax. Risk: HIGH because this is the schema-facing contract used by all structured and simple extraction flows.

- `packages/core/src/infrastructure/schema-yaml-parser.ts`
  Change: accept the new transform declaration shape on both extractor levels and keep validation strict enough to reject malformed declarations early. Risk: HIGH because bad parsing here would make schema-declared transforms ambiguous or silently ignored.

- `packages/core/src/domain/services/content-extraction.ts`
  Change: redesign the extraction pipeline around capture groups, placeholder interpolation, field-level transform execution, and explicit typed transform errors. This is the core runtime change. Risk: HIGH because every metadata extraction path and future extractor consumer depends on it.

- `packages/core/src/domain/services/extract-metadata.ts`
  Change: replace the old `ReadonlyMap<string, (values: string[]) => string[]>` shortcut with a generic extractor-transform registry plus per-call context bag. Risk: HIGH because all artifact-to-metadata orchestration flows through this service.

- `packages/core/src/composition/kernel-registries.ts`
  Change: add a new additive registry family for extractor transforms and merge it with the same conflict semantics already used for parsers and storage factories. Risk: HIGH because this defines the public extension point and collision behavior.

- `packages/core/src/composition/kernel-internals.ts`
  Change: construct the built-in extractor transform registry by importing dedicated built-in transform modules instead of embedding implementations inline. Risk: HIGH because the built-ins must be available uniformly to all use cases built from the kernel.

- `packages/core/src/composition/extractor-transforms/*`
  Change: add one dedicated file per built-in extractor transform, starting with `resolve-spec-path.ts`, plus an index/registry assembly module for future built-ins. Risk: MEDIUM-HIGH because this becomes the extensibility surface for future built-in transforms and must stay easy to grow without bloating kernel composition files.

- `packages/core/src/composition/kernel.ts`
  Change: thread the merged extractor transform registry into `GenerateSpecMetadata`, `ValidateArtifacts`, `CompileContext`, and `GetProjectContext`. Risk: HIGH because missed wiring would recreate today's inconsistent runtime behavior.

- `packages/core/src/composition/kernel-builder.ts`
  Change: expose fluent external registration of extractor transforms and surface duplicate-name conflicts before build. Risk: MEDIUM-HIGH because this is the user-facing composition API for plugins and advanced callers.

- `packages/core/src/application/use-cases/generate-spec-metadata.ts`
  Change: stop repairing `dependsOn` after extraction and instead pass origin context plus transform registry into `extractMetadata()`. Risk: HIGH because this is the canonical metadata generation path and currently contains one of the hardcoded `dependsOn` branches.

- `packages/core/src/application/use-cases/validate-artifacts.ts`
  Change: validate extracted metadata with the shared transform runtime and remove the dedicated `_extractDependsOn()` repair path. Risk: HIGH because this is the user-visible failure path that motivated the change, and it overlaps an active change targeting the same spec.

- `packages/core/src/application/use-cases/compile-context.ts`
  Change: use the same registry/context during missing-metadata fallback extraction and `dependsOn` traversal fallback. Risk: HIGH because stale metadata fallback must produce the same normalized values as metadata generation and validation.

- `packages/core/src/application/use-cases/get-project-context.ts`
  Change: use the same registry/context during project-level fallback extraction. Risk: MEDIUM-HIGH because this path renders summaries and must stay consistent with the rest of the extractor runtime.

- `packages/core/src/application/use-cases/_shared/depends-on-traversal.ts`
  Change: pass registry/context through fallback extraction rather than returning raw filesystem paths. Risk: HIGH because traversal correctness depends on normalized spec IDs.

- `packages/core/test/domain/services/*`, `packages/core/test/application/use-cases/*`, and `packages/core/test/composition/*`
  Change: add or update tests around capture semantics, transform execution, kernel registration, and the removal of `dependsOn` repair passes. Risk: HIGH because the behavioral shift is broad and needs direct regression coverage.

- `docs/schemas/` and `docs/core/`
  Change: document the new transform declaration shape, placeholder interpolation, context expectations, and kernel registration API. Risk: MEDIUM because the public feature would otherwise remain undiscoverable and misleading.

## New constructs

- `ExtractorTransformDeclaration` in `packages/core/src/domain/value-objects/extractor.ts`
  Shape:

  ```ts
  export interface ExtractorTransformDeclaration {
    readonly name: string
    readonly args?: readonly string[]
  }
  ```

  Responsibility: normalized in-memory form shared by `Extractor.transform` and `FieldMapping.transform`.
  Relationships: produced by schema parsing, consumed by `content-extraction.ts`.

- `ExtractorTransformContext` in `packages/core/src/domain/services/content-extraction.ts`
  Shape:

  ```ts
  export type ExtractorTransformContext = ReadonlyMap<string, unknown>
  ```

  Responsibility: opaque caller-owned context bag forwarded untouched to transform callbacks.
  Relationships: assembled in application use cases, interpreted only by specific transform implementations.

- `ExtractorTransform` in `packages/core/src/domain/services/content-extraction.ts`
  Shape:

  ```ts
  export type ExtractorTransform = (
    value: string,
    args: readonly (string | undefined)[],
    context: ExtractorTransformContext,
  ) => string
  ```

  Responsibility: fixed callback contract for all extractor transforms.
  Relationships: registered in kernel composition, invoked by content extraction for extractor-level and field-level declarations.

- `ExtractorTransformRegistry` in `packages/core/src/domain/services/content-extraction.ts`
  Shape:

  ```ts
  export type ExtractorTransformRegistry = ReadonlyMap<string, ExtractorTransform>
  ```

  Responsibility: lookup table for transform execution.
  Relationships: exposed through `KernelRegistryView`, passed into every runtime extraction caller.

- `ExtractorTransformError` in `packages/core/src/domain/errors/extractor-transform-error.ts`
  Shape:

  ```ts
  export class ExtractorTransformError extends SpecdError {
    readonly transformName: string
    readonly extractorOwner: 'extractor' | 'field'
    readonly fieldName?: string
  }
  ```

  Responsibility: typed failure for unknown transform names, invalid transform wiring, and transform callback failures during extraction.
  Relationships: raised from `content-extraction.ts`, surfaced by application use cases as regular extraction/validation failures without falling back to generic `Error`.

- `CapturedValue` internal helper in `packages/core/src/domain/services/content-extraction.ts`
  Shape:

  ```ts
  interface CapturedValue {
    readonly value: string
    readonly fullMatch?: string
    readonly groups: readonly string[]
  }
  ```

  Responsibility: represent the extracted primary value together with `$0` and remaining capture groups before interpolation.
  Relationships: stays internal to extraction helpers; not part of the public transform contract.

- Built-in `resolveSpecPath` registration in `packages/core/src/composition/extractor-transforms/resolve-spec-path.ts`
  Responsibility: normalize canonical dependency labels and filesystem-style relative paths into canonical spec IDs by trying the primary extracted `value` first and then fallback args in order.
  Relationships: uses `originWorkspace`, `originSpecPath`, `artifactId`, and `artifactFilename` from the context bag; exported through a small composition-level registry module and replaces the current hardcoded `dependsOn` repair branches.

## Approach

The implementation keeps the existing extractor-centric architecture, but it makes transforms first-class runtime participants instead of a partially wired optional shortcut.

### 1. Normalize transform declarations at the value-object boundary

`Extractor.transform` and `FieldMapping.transform` should both accept:

```yaml
transform: resolveSpecPath
```

and

```yaml
transform:
  name: join
  args: ['$3', '/', '$2', '/', '$1']
```

The parser should normalize both forms into `ExtractorTransformDeclaration` immediately so the domain and runtime do not need to branch on schema syntax.

### 2. Redesign capture around a primary value plus placeholders

The extractor currently collapses capture to the first group in some paths and to repeated first-group matches in others. That is too lossy for generic transforms.

The new rule is:

- without `capture`, the extracted primary `value` is the stripped text produced by the current pipeline
- with `capture`, the primary `value` becomes `$1`
- `$0` is the full regex match
- `$2`, `$3`, ... are additional groups
- unresolved placeholder references interpolate to `undefined`

This keeps `resolveSpecPath` ergonomic because it receives the captured path as `value` without forcing `args: ['$1']`, while still letting other transforms access the full match or additional groups through args.

### 3. Keep placeholder semantics inside the extractor, not inside transforms

Transforms stay string-oriented and should not need to know regex internals. `content-extraction.ts` is responsible for:

- running the regex
- building `{ value, $0, $1... }`
- interpolating transform args before callback invocation

That means a transform sees:

- `value`
- already-resolved `args: readonly (string | undefined)[]`
- an opaque context bag

This keeps the callback contract small and stable.

### 4. Apply transforms at both extractor levels

The runtime must support:

- extractor-level transforms for simple and grouped extraction
- field-level transforms for structured extraction via `FieldMapping`

This matches the schema format deltas and avoids creating a misleading contract where structured extraction can capture and reshape values but not normalize them through the same mechanism.

Grouped extraction remains string-based: transforms apply to the extracted item values, not to the grouped object as a whole. This avoids introducing object-valued transform contracts in the same change.

### 5. Make transform failures explicit

The current behavior silently ignores unknown transform names because no registry is passed or no function is found. That is incompatible with a schema-declared extension point.

The new rule is:

- unknown transform name => extraction error
- transform throws => extraction error
- transform returns a non-null normalized string when it receives a value
- missing placeholder group => arg becomes `undefined`; the transform decides whether that is acceptable

`content-extraction.ts` should own the normalization of these failures into typed `SpecdError` subclasses so callers such as `ValidateArtifacts` and `GenerateSpecMetadata` surface a consistent failure message without introducing generic untyped errors into domain/application code.

### 6. Promote extractor transforms to a kernel registry

The kernel already owns additive registries for parsers, storages, VCS providers, actor providers, and external hooks. Extractor transforms should use the same pattern.

Design choice:

- `KernelRegistryInput` gets `extractorTransforms?: Readonly<Record<string, ExtractorTransform>> | ExtractorTransformRegistry`
- `KernelRegistryView` exposes `extractorTransforms: ExtractorTransformRegistry`
- `createBuiltinKernelRegistry()` registers built-ins
- `createKernelRegistryView()` merges built-in and external registrations with `RegistryConflictError` on duplicates
- `createKernelBuilder()` adds `registerExtractorTransform(name, fn)`

This keeps registration semantics aligned with the rest of the kernel and gives plugin authors a stable extension point.

The built-in side should also stay modular:

- each built-in extractor transform lives in its own file under `packages/core/src/composition/extractor-transforms/`
- one small composition module assembles the built-in registry consumed by `createBuiltinKernelRegistry()`

That keeps `kernel-internals.ts` from becoming a dumping ground for unrelated transform logic and makes future built-ins straightforward to add.

### 7. Replace hardcoded `dependsOn` repair with one built-in transform module

Today the codebase has three different behaviors:

- `GenerateSpecMetadata` extracts raw values and then repairs `dependsOn`
- `ValidateArtifacts` validates raw values and separately re-extracts/re-resolves `dependsOn`
- fallback extraction in context compilation returns raw values when metadata is absent

All three should converge on the same built-in extractor transform exported from its own module:

```ts
resolveSpecPath(value, args, context) => canonicalSpecId
```

The transform implementation lives in composition, not in schema parsing or the generic extraction engine. It is defined in a dedicated file and closes over the spec repositories supplied by the kernel. It reads the following context keys:

- `originWorkspace`
- `originSpecPath`
- `artifactId`
- `artifactFilename`

`originWorkspace` and `originSpecPath` are the real minimum required inputs. `artifactId` and `artifactFilename` are included because they are already part of the agreed contract surface and make future artifact-aware transforms possible without another contract change.

The built-in should resolve the first candidate that is semantically valid:

1. try `value` as a canonical spec ID
2. if that fails, try `value` as a relative spec path
3. if that fails, try each interpolated arg in order using the same canonical-id / relative-path rules
4. if nothing resolves, fail with `ExtractorTransformError`

That keeps dependency extraction compatible with:

- canonical linked entries such as ``[`core:core/config`](../config/spec.md)``
- canonical unlinked entries such as `` `core:core/config` ``
- legacy labels where the `href` is the only resolvable candidate

### 7.1 Temporary schema/template alignment already completed

While redesigning this change, `packages/schema-std/schema.yaml` and
`packages/schema-std/templates/spec.md` were updated immediately so artifact
validation could continue against the current runtime:

- `Spec Dependencies` authoring instructions now require canonical visible labels
  and the mandatory section semantics from `default:_global/spec-layout`
- the standard template now shows the canonical linked format and `_none_`
  fallback rules
- the temporary schema wiring currently passes canonical labels directly to
  `resolveSpecPath`

This temporary schema adjustment is intentionally narrower than the final
runtime design. Once `resolveSpecPath` supports the full candidate-order logic
above, the schema will be tightened again so linked entries can pass the
captured `href` as an actual fallback candidate instead of relying on temporary
canonical-label passthrough behavior.

### 8. Introduce one small application helper for extraction inputs

Several use cases now need to assemble the same extraction ingredients:

- ASTs by artifact
- renderers by artifact
- extractor transform registry
- origin context bag

To avoid repeating that wiring in four or five places, add a shared helper under `packages/core/src/application/use-cases/_shared/` that builds an `ExtractorTransformContext` from:

- the current spec workspace/path
- the artifact type id
- the resolved filename

This helper should stay narrow and synchronous. It is not a service layer; it only standardizes the context keys and reduces duplicated assembly code across use cases.

### 9. Update every runtime extraction caller in the same change

The change is only coherent if all runtime paths stop diverging.

The required caller updates are:

- `GenerateSpecMetadata`
  - pass registry/context to `extractMetadata()`
  - remove the manual `resolveFromPath()` post-pass
- `ValidateArtifacts`
  - pass registry/context to metadata validation extraction
  - delete `_extractDependsOn()` and reuse transformed extraction output for `change.specDependsOn`
- `CompileContext`
  - pass registry/context to stale-metadata fallback extraction
  - pass registry/context into dependsOn traversal fallback
- `GetProjectContext`
  - pass registry/context to fallback extraction
- `_shared/depends-on-traversal.ts`
  - accept the registry/context inputs needed for fallback extraction

This is the point of the change: one runtime, one normalization path.

### 10. Keep docs and tests aligned with the new public surface

This feature is user-facing in two places:

- schema authors can now declare transforms with args on both extractor levels
- kernel consumers can now register custom extractor transforms

That means docs need to cover both declaration and registration, not just the internal `resolveSpecPath` use case.

## Requirement mapping

Every modified requirement from the spec deltas maps to concrete implementation work:

- `core:core/content-extraction`
  - `Extractor value object`
    - `packages/core/src/domain/value-objects/extractor.ts`
    - `packages/core/src/infrastructure/schema-yaml-parser.ts`
  - `FieldMapping value object`
    - `packages/core/src/domain/value-objects/extractor.ts`
    - `packages/core/src/infrastructure/schema-yaml-parser.ts`
  - `Simple extraction`
    - `packages/core/src/domain/services/content-extraction.ts`
    - `packages/core/src/domain/services/extract-metadata.ts`
  - `Structured extraction`
    - `packages/core/src/domain/services/content-extraction.ts`
  - `Follow siblings`
    - `packages/core/src/domain/services/content-extraction.ts`
  - `Transform callbacks`
    - `packages/core/src/domain/services/content-extraction.ts`
    - `packages/core/src/composition/kernel-registries.ts`
    - `packages/core/src/composition/kernel-internals.ts`
    - `packages/core/src/composition/kernel.ts`
    - `packages/core/src/composition/kernel-builder.ts`
  - `Constraints`
    - `packages/core/src/domain/services/content-extraction.ts`
    - `packages/core/src/infrastructure/schema-yaml-parser.ts`

- `core:core/schema-format`
  - `Metadata extraction`
    - `packages/core/src/infrastructure/schema-yaml-parser.ts`
    - docs in `docs/schemas/`

- `core:core/generate-metadata`
  - `Metadata extraction`
    - `packages/core/src/application/use-cases/generate-spec-metadata.ts`
    - `packages/core/src/domain/services/extract-metadata.ts`
  - `dependsOn resolution`
    - `packages/core/src/composition/kernel-internals.ts`
    - `packages/core/src/application/use-cases/generate-spec-metadata.ts`

- `core:core/validate-artifacts`
  - `MetadataExtraction validation`
    - `packages/core/src/application/use-cases/validate-artifacts.ts`
  - `Automatic dependsOn extraction`
    - `packages/core/src/application/use-cases/validate-artifacts.ts`

- `core:core/compile-context`
  - `dependsOn resolution order`
    - `packages/core/src/application/use-cases/compile-context.ts`
    - `packages/core/src/application/use-cases/_shared/depends-on-traversal.ts`
  - `Staleness detection and content fallback`
    - `packages/core/src/application/use-cases/compile-context.ts`

- `core:core/get-project-context`
  - `Supports dependsOn traversal when followDeps is true`
    - `packages/core/src/application/use-cases/_shared/depends-on-traversal.ts`
  - `Falls back to extraction when metadata is stale or absent`
    - `packages/core/src/application/use-cases/get-project-context.ts`

## Key decisions

- **Use a kernel registry for extractor transforms instead of per-use-case local maps.**
  Rationale: the feature is part of extractor runtime semantics, not one metadata workflow. Central registration keeps behavior consistent and matches the architecture already used for parsers and adapters.
  Alternatives rejected: local ad hoc maps inside each use case. Rejected because that would recreate the current divergence and make external extension impossible.

- **Keep built-in extractor transforms in dedicated files, not embedded inside kernel assembly.**
  Rationale: `resolveSpecPath` is only the first built-in; dedicated modules keep each transform independently testable and make it easy to add future built-ins without inflating `kernel-internals.ts`.
  Alternatives rejected: implement built-ins inline inside `createBuiltinKernelRegistry()` or `kernel-internals.ts`. Rejected because it concentrates unrelated behavior in composition assembly code and scales poorly as the built-in set grows.

- **Keep the transform contract fixed at `(value, args, context)` with `context` as an opaque bag.**
  Rationale: the caller decides what runtime context exists; the extractor should not hardcode a closed context schema.
  Alternatives rejected: a fixed `TransformContext` interface with repository-specific fields. Rejected because it couples the generic extractor to one current transform and makes future callers less flexible.

- **With `capture`, define the primary value as `$1`.**
  Rationale: this keeps basic transforms ergonomic, especially `resolveSpecPath`, and avoids forcing schema authors to write `args: ['$1']` just to pass the captured value through.
  Alternatives rejected: keep `value` as the full text and expose only `$1` through args. Rejected because it makes the common captured-value case unnecessarily awkward.

- **Interpolate placeholders before calling the transform and pass missing groups as `undefined`.**
  Rationale: interpolation is extractor semantics, while deciding whether a missing arg is valid belongs to the transform implementation.
  Alternatives rejected: make placeholder mismatches immediate extractor errors. Rejected because that pushes business rules into the generic pipeline and removes flexibility from transform implementations.

- **Reject silent omission from transforms once a value has been extracted.**
  Rationale: returning `null` after a value was found collapses two very
  different cases: "there was no data" and "data existed but transform
  execution discarded it". The redesign is specifically meant to remove that
  ambiguity.
  Alternatives rejected: preserve `null` as an omission signal. Rejected
  because it hides extraction bugs and allows valid dependencies to disappear
  without a typed failure.

- **Make `resolveSpecPath` try `value` first and then fallback args in order.**
  Rationale: `Spec Dependencies` entries now need to support canonical labels,
  optional relative links, and legacy labels during migration. A candidate-order
  resolver keeps the transform generic without introducing multiple extractors.
  Alternatives rejected: path-only resolution plus explicit passthrough flags,
  or multiple dedicated `dependsOn` extractors. Rejected because the former
  makes linked canonical entries awkward while the latter expands the change
  scope too far.

- **Remove hardcoded `dependsOn` normalization from use cases and replace it with the built-in `resolveSpecPath` transform.**
  Rationale: schema declarations should describe the real runtime behavior. Leaving manual repair paths in place would preserve two sources of truth.
  Alternatives rejected: keep post-processing for `dependsOn` while also wiring transforms. Rejected because it would hide bugs, create ordering ambiguity, and defeat the purpose of the feature.

- **Fail fast on duplicate transform registrations.**
  Rationale: the existing kernel registry model already treats duplicate registrations as configuration errors, and transforms should follow the same predictability rule.
  Alternatives rejected: last-write-wins override. Rejected because it makes plugin behavior order-dependent and hard to debug.

- **Represent transform failures with typed `SpecdError` errors instead of generic runtime errors.**
  Rationale: the global conventions require typed errors in domain and application code, and transform failures are part of extractor runtime semantics rather than incidental exceptions.
  Alternatives rejected: throwing bare `Error` from the extractor pipeline. Rejected because it weakens programmatic handling and conflicts with repository-wide error conventions.

## Trade-offs

- `[Broader extractor churn]` -> `capture`, `followSiblings`, simple extraction, and structured extraction all move together.
  Mitigation: implement and pin the domain-level extraction semantics first with focused tests before wiring use cases.

- `[Composition surface grows]` -> kernel options and builder APIs gain one more registry family.
  Mitigation: mirror the existing parser/storage patterns exactly instead of inventing a bespoke composition API.

- `[Overlapping change risk]` -> `validate-artifacts.ts` is also targeted by active change `drifted-artifact-status`.
  Mitigation: keep this change scoped to extraction wiring and dependency normalization, avoid unrelated state-transition edits, and rebase carefully during implementation.

- `[Cross-workspace resolution remains opinionated]` -> the built-in `resolveSpecPath` still needs to choose how to probe other repositories for cross-workspace hints.
  Mitigation: preserve today's observable behavior during the initial implementation and only change resolution policy in a dedicated follow-up if needed.

## Testing

Every modified verify scenario maps to a concrete test area:

- `core:core/content-extraction`
  - shorthand and object transform declarations
    - parser + extraction unit tests in `packages/core/test/domain/services/`
  - field mapping transform declarations
    - structured extraction unit tests in `packages/core/test/domain/services/`
  - args interpolation from capture groups
    - extraction unit tests covering `$0/$1/$2` and missing-group `undefined`
  - field-level transform execution
    - structured extraction unit tests covering `FieldMapping.transform`
  - followSiblings capture-to-value semantics
    - extraction unit tests for sequential sibling walk
  - unknown transform failure
    - extraction unit tests that assert explicit error instead of silent ignore
  - missing context handled by transform
    - extraction unit tests with a throwing transform implementation

- `core:core/schema-format`
  - extractor transform shorthand accepted
  - field transform object syntax accepted
    - schema parser tests in `packages/core/test/infrastructure/`

- `core:core/generate-metadata`
  - metadata extraction uses transform registry and context
  - dependsOn normalization is transform-driven
    - use-case tests in `packages/core/test/application/use-cases/`

- `core:core/validate-artifacts`
  - metadataExtraction validation uses transformed values
  - validated spec dependsOn updates persist transformed IDs
    - use-case tests in `packages/core/test/application/use-cases/`

- `core:core/compile-context`
  - traversal fallback uses transformed dependsOn IDs
  - stale metadata fallback renders transformed extracted sections
    - use-case tests in `packages/core/test/application/use-cases/`

- `core:core/get-project-context`
  - fallback extraction uses shared transform runtime
    - use-case tests in `packages/core/test/application/use-cases/`

- Kernel registration behavior
  - built-in `resolveSpecPath` exists in the registry
  - `createKernel()` merges external transforms
  - builder `registerExtractorTransform()` rejects duplicates
    - composition tests in `packages/core/test/composition/`
  - dedicated built-in transform module is unit-tested in isolation
    - targeted tests in `packages/core/test/composition/` or a nearby focused suite

## Docs updates

Implementation should update docs in these areas:

- `docs/schemas/`
  - document `transform` on `Extractor` and `FieldMapping`
  - document shorthand vs object syntax
  - document `$0/$1/$2` placeholder interpolation and missing-group behavior

- `docs/core/`
  - document the extractor transform callback contract
  - document kernel-level external registration via `createKernel()` and `createKernelBuilder()`

- If schema-std examples are referenced in docs, update them to show `resolveSpecPath` as a real built-in runtime transform rather than an aspirational field.

## Global spec alignment

- `specs/_global/architecture/spec.md`
  - respected by keeping the generic extractor pure and moving runtime dependencies to composition-built callbacks instead of embedding repositories inside domain services.

- `specs/_global/conventions/spec.md`
  - respected by reusing existing registry/conflict patterns and keeping new public names explicit (`registerExtractorTransform`, `ExtractorTransformRegistry`, etc.).

- `specs/_global/testing/spec.md`
  - respected by mapping every changed requirement and verify scenario to targeted domain, application, and composition tests rather than relying on one end-to-end check.

- `specs/_global/docs/spec.md`
  - respected by explicitly planning public docs updates for schema authors and kernel integrators.
