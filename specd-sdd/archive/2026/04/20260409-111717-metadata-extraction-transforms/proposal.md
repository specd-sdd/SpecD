# Proposal: metadata-extraction-transforms

## Motivation

Schema-declared metadata transforms exist as part of the extraction model, but
they are not wired consistently in production runtime. This makes schema
behavior misleading and blocks changes that rely on transformed extracted values
instead of hardcoded application logic.

## Current behaviour

The content extraction engine supports named `transform` callbacks, but the main
artifact-extraction flows do not consistently pass runtime transforms into
`extractMetadata(...)`. As a result, extraction from artifact content is not
actually generic at runtime.

`dependsOn` currently works through special-case logic in some flows rather than
through the schema-declared transform mechanism. In `change validate`, this
ordering is broken enough that extracted filesystem-style dependency paths from
deltas can fail metadata validation before the later `dependsOn` repair path
runs. Other schemas with other transforms are affected too, because they do not
have equivalent hardcoded postprocessing.

There is also a formatting mismatch in existing specs: older `Spec
Dependencies` sections often use labels such as `specs/core/config/spec.md` or
plain path-like text because canonical `specId` labels did not exist when those
specs were first written. Newer specs should instead prefer canonical labels
such as ``[`core:core/config`](../config/spec.md)``. The extraction model must
therefore support both linked and non-linked dependency listings while the repo
converges on the canonical format.

## Proposed solution

Make extractor transforms a real runtime capability for artifact extraction by
moving them out of the current metadata-specific framing and wiring them
consistently across the extraction use cases. The extraction model should treat
`transform` as part of the generic `Extractor` contract, not as a
`metadataExtraction` special case.

The runtime model is:

- schemas declare extractor transforms by name, with optional declarative args
- the extraction engine resolves those names through a shared runtime registry
- each transform receives the extracted string value, declared args, and an
  opaque caller-provided context bag
- application-layer callers decide which context keys to provide for their own
  extraction flow
- the kernel owns the baseline registry but also allows external callers to
  register additional extractor transforms, following the same extensibility
  pattern already used for adapters such as `ChangeRepository`, `Authors`, and
  `VcsAdapter`

This keeps transforms generic enough for path resolution, string concatenation,
date normalization, and similar future uses without baking any one use case
into the extraction engine.

`dependsOn` normalization should move to that generic transform path so that
schema-declared behavior becomes the single source of truth and the current
hardcoded repair paths can be removed.

The canonical authoring format for dependency listings should be:

- ``[`<workspace>:<capability-path>`](../relative/path/spec.md)`` when a
  relative artifact link exists
- `` `<workspace>:<capability-path>` `` when only the canonical spec ID should
  be shown without a link

To support both forms without widening the change beyond its current scope, the
schema and transform runtime should keep a single extractor but make it more
expressive:

- `capture` should extract both the visible dependency label and the optional
  relative `href`
- `resolveSpecPath` should try the primary extracted `value` first, then each
  interpolated arg in order, returning the first candidate that resolves to a
  canonical spec ID

That keeps the extractor model contained while still supporting old artifacts,
new canonical-label artifacts, and dependency listings written without links.

The transform contract also needs to be tightened. If a transform receives an
extracted value, it must either return a non-null normalized value or fail with
an explicit typed error. Silent omission via `null` is not acceptable because
it hides cases where extraction found data but transform execution discarded it.
For `resolveSpecPath`, support for already-canonical spec IDs can be expressed
through declarative args rather than by silently dropping those values.

## Specs affected

### New specs

- _none_

### Modified specs

- `core:core/content-extraction`: extend transform execution so callbacks can
  receive the runtime context needed to normalize extracted values without
  breaking the engine's generic extraction model.
  - Depends on (added): none

- `core:core/schema-format`: clarify what `metadataExtraction.extractor.transform`
  means at runtime and what contextual information transformed extraction may
  rely on.
  - Depends on (added): none

- `core:core/generate-metadata`: replace the ad hoc `dependsOn` repair path with
  generic transform-backed extraction and keep metadata generation
  deterministic.
  - Depends on (added): none

- `core:core/validate-artifacts`: make metadata extraction validation and
  post-validation dependency extraction use the same runtime transform path,
  eliminating the current special handling for `dependsOn`.
  - Depends on (added): none

- `core:core/compile-context`: ensure stale-metadata fallback and dependency
  traversal use transformed extraction consistently instead of relying on raw
  extracted values.
  - Depends on (added): none

- `core:core/get-project-context`: ensure project-level stale-metadata fallback
  uses the same transformed extraction runtime as the other metadata consumers.
  - Depends on (added): none

- `default:_global/spec-layout`: define the preferred `Spec Dependencies`
  authoring format so specs converge on canonical `specId` labels with
  optional relative links.
  - Depends on (added): none

## Impact

Affected areas are concentrated in `packages/core`, especially the metadata
extraction engine and the use cases that extract metadata from artifacts:
`generate-spec-metadata`, `validate-artifacts`, `compile-context`,
`get-project-context`, and shared dependency traversal helpers. The standard
schema in `packages/schema-std/schema.yaml` is also directly affected because it
already declares `transform: resolveSpecPath` and must start emitting the new
dependency-list format in artifact instructions.

This change also has test impact across core unit tests and use-case tests, and
it now modifies the global spec-layout contract for `Spec Dependencies`
sections. No external dependency or storage format change is expected.

## Technical context

The user explicitly separated two concerns that should not be conflated:
reading already-written `metadata.json` versus extracting metadata from artifact
content. The problem is in the extraction path, not the metadata read path.

Current investigation found:

- `extractContent(...)` supports `transform`, but production callers do not
  wire transform maps consistently.
- `dependsOn` has special-case handling in multiple use cases instead of
  relying on schema-declared transforms.
- `change validate` currently validates extracted metadata before its later
  `dependsOn` repair path, which explains failures when extracted values are
  still filesystem paths.
- no equivalent hardcoded repair path was confirmed for other extracted
  metadata fields, which makes `dependsOn` an outlier rather than the model to
  follow.

The design direction clarified during exploration is:

- `transform` belongs to the generic `Extractor` contract, not to a
  metadata-specific transform API
- transforms operate on one extracted string at a time rather than on the full
  extracted array
- transforms are looked up from a shared runtime registry with a fixed
  callable contract
- the shared registry should participate in kernel composition so external
  callers can register additional transforms without modifying core extraction
  code
- transform configuration should support both a shorthand string form
  (`transform: resolveSpecPath`) and an explicit object form with args
  (`transform: { name: prepend, args: ['prefix-'] }`)
- the same transform declaration model should be available on both `Extractor`
  and `FieldMapping`, so simple extraction and structured field extraction use
  one consistent mechanism
- transform args should remain structured data in schema, not be encoded into a
  delimited transform name string such as `prepend|prefix-`
- transform context should remain opaque to the extraction engine and be passed
  through as caller-defined key/value data rather than a fixed core-owned
  context type
- `capture` should expose all regex capture groups rather than collapsing
  immediately to group 1; downstream features such as `followSiblings`,
  `FieldMapping`, and transform argument interpolation can then decide which
  groups to use
- that revised capture behavior is not transform-only scope: it may change the
  semantics of existing extractor features that already depend on capture, such
  as `followSiblings` handling and structured field extraction
- transform args may reference capture groups using placeholders such as `$0`,
  `$1`, `$2`, and so on; those placeholders should be interpolated before the
  transform function is invoked
- when an interpolated placeholder references a group that does not exist, the
  resolved arg should be `undefined` rather than triggering an extractor-level
  error; the transform implementation decides whether that is acceptable or
  whether execution should fail
- if a transform receives a value, it must return a non-null normalized string
  or fail with an explicit typed error; the runtime should not treat `null` as
  a silent "drop this extracted value" signal
- the transform callable contract should stay minimal: the function receives the
  extracted `value`, the interpolated args array, and the opaque caller-owned
  context bag — nothing else from the extraction pipeline is passed as a
  dedicated parameter
- the value and args received by a transform may be influenced by other
  extractor configuration fields such as `extract`, `strip`, `capture`, and
  structured field mapping rules; transform execution therefore sits
  downstream of the extraction pipeline rather than operating as an isolated
  string rewrite step
- when `capture` is not present, `value` is the extracted text after upstream
  steps such as `extract` and `strip`
- when `capture` is present, `value` becomes the first capture group (`$1`).
  `$0` remains available as the full regex match for placeholder interpolation,
  while `$2`, `$3`, and higher placeholders refer to additional capture groups.
  This makes transforms such as `resolveSpecPath` work naturally without
  requiring synthetic args like `['$1']` just to pass the main captured value
- the first runtime transforms should document their minimum required context
  keys explicitly. For `resolveSpecPath`, the agreed minimum is:
  `originWorkspace`, `originSpecPath`, `artifactId`, and `artifactFilename`
- the extractor itself does not validate or interpret those context keys; each
  transform documents what it needs, and each caller is responsible for
  supplying the relevant values
- external transform registration should follow the existing additive kernel
  registry model: `createKernel(...)` accepts extra transform registrations,
  the kernel builder exposes a dedicated registration method, and duplicate
  names fail fast with a registry conflict error rather than silently
  overriding an existing transform
- built-in transforms can use declarative args to expose behavior variants
  without changing the generic runtime contract. For example, `resolveSpecPath`
  may treat a string arg such as `"true"` as enabling passthrough of already
  canonical spec IDs instead of resolving only relative filesystem paths
- for dependency extraction specifically, `resolveSpecPath` should try the
  extracted `value` first and then any interpolated args in order. This makes
  it compatible with the desired dependency-list format where the visible label
  is the canonical spec ID and the optional `href` remains available as a
  fallback candidate
- the schema's `dependsOn` extractor must support both dependency listings with
  links and listings without links, because the repo currently contains both
  styles and the change should help it converge rather than forcing a second
  extractor model into scope

For relative spec-link resolution, the key contextual input is the origin spec
path rather than a precomputed spec ID. For example, extracting
`../entrypoint/spec.md` from `specs/cli/archive-show/spec.md` requires the
origin location (`cli/archive-show`) to resolve the relative path to the
canonical target spec ID `cli:entrypoint`. Passing the resolved spec ID itself
into the transform would be circular and would defeat the purpose of the
transform.

The intended architectural direction is to keep schema behavior declarative:
schema authors declare transforms, runtime extraction executes them, and use
cases consume transformed values instead of field-specific postprocessing.
