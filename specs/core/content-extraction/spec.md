# Content Extraction

## Purpose

Multiple features — metadata generation, compliance gates, impact analysis — need to pull structured data from artifact files, but hard-coding extraction logic per feature would be brittle and duplicative. The content extraction engine solves this with a generic domain service that extracts structured data from artifact ASTs using declarative `Extractor` configurations. It is the foundation for deterministic metadata generation and is designed to be reused by future features.

## Requirements

### Requirement: Extractor value object

An `Extractor` is a first-class domain value object that declares how to extract content from an AST. It combines a `Selector` (which nodes to find) with post-processing directives (what to do with the matched nodes):

- `selector` (Selector, required) — identifies the AST node(s) to extract from, using the full selector model
- `extract` (`'content' | 'label' | 'both'`, optional, defaults to `'content'`) — what to pull from each matched node
- `capture` (string, optional) — regex applied to the extracted text; when present, the main extracted `value` becomes the first capture group (`$1`) and placeholder interpolation also exposes `$0` for the full regex match plus `$2`, `$3`, and higher groups when present
- `strip` (string, optional) — regex removed from labels/values
- `groupBy` (`'label'`, optional) — groups matched nodes by their label
- `transform` (string or object, optional) — named post-processing callback injected by the caller. The shorthand string form is the transform name (for example `'resolveSpecPath'`). The object form is `{ name: string, args?: string[] }`, where args are declarative string parameters that may reference capture placeholders such as `$0`, `$1`, `$2`, and so on.
- `fields` (record of string to `FieldMapping`, optional) — structured field mapping; when present, each matched node produces one object with the declared fields

`transform` is part of the generic extractor model. It is not limited to metadata generation and may be used by any feature that executes extractors.

### Requirement: FieldMapping value object

A `FieldMapping` declares how to extract a single field from within a matched AST node:

- `from` (`'label' | 'parentLabel' | 'content'`, optional, defaults to `'content'`) — source of the field value relative to the matched node
- `childSelector` (Selector, optional) — selector applied within the matched node to find child values
- `capture` (string, optional) — regex applied to the extracted text; when present, the main extracted field value becomes the first capture group (`$1`) and placeholder interpolation also exposes `$0` for the full regex match plus any higher groups
- `strip` (string, optional) — regex removed from the extracted text
- `followSiblings` (string, optional) — regex matching sibling nodes that follow a `childSelector` match; matched siblings are appended to the active field's result array until a non-matching sibling or another field's `childSelector` match is encountered
- `transform` (string or object, optional) — named post-processing callback applied to each extracted field value. It uses the same shorthand and object declaration forms as `Extractor.transform`.

`from` and `childSelector` are mutually exclusive modes. When `childSelector` is present, `from` is ignored.

### Requirement: Extract modes

The `extract` field on an `Extractor` controls what text is pulled from each matched node:

- `'label'` — returns `node.label` (e.g. the heading text of a section)
- `'content'` — renders the node's children only, skipping the node's own heading/label; for leaf nodes without children, renders the node itself
- `'both'` — returns the label followed by the full rendered subtree

### Requirement: Simple extraction

When an extractor has no `fields` and no `groupBy`, `extractContent` operates in simple mode:

1. Find all nodes matching `selector`.
2. For each match, extract text according to `extract` mode.
3. Apply `strip` if present.
4. If `capture` is absent, emit one extracted value from the text. If `capture` is present, emit one extracted value per regex match, where the emitted `value` is the first capture group (`$1`) and placeholder interpolation also exposes `$0` for the full match plus any higher groups.
5. Apply `transform` if present — the named callback is looked up from an injected transform registry and called once per emitted extracted value with the current `value`, interpolated args, and caller-provided context bag. If the callback returns a promise, extraction awaits it before continuing.
6. A transform that receives an emitted extracted value must return or resolve to a non-null string. If it cannot normalize that value, it must fail with an extraction error instead of silently omitting the value.
7. Return the result as `Promise<string[]>`.

### Requirement: Grouped extraction

When `groupBy` is `'label'`, matched nodes are grouped by their label (after applying `strip`). Each group produces a `GroupedExtraction` object with:

- `label` — the group key (the node's label after strip)
- `items` — an array of content strings; each matched node contributes one content block rendered from its children

### Requirement: Structured extraction

When `fields` is present, each matched node produces one `StructuredExtraction` object (a record of field name to string or string array). For each field entry:

- `from: 'label'` — takes `node.label`
- `from: 'parentLabel'` — walks the ancestor chain in reverse and takes the nearest ancestor's label
- `from: 'content'` — renders the matched node's subtree
- `childSelector` — finds children within the matched node matching the selector
- `capture` — when present, the field's main extracted value becomes the first capture group (`$1`) and placeholder interpolation also exposes `$0` plus higher groups
- `transform` — when present, applies to each extracted field value using the registered transform runtime. If the registered transform resolves asynchronously, extraction awaits it before the structured result is returned.

Ancestor tracking is required for `parentLabel` — the engine uses `findNodesWithAncestors` to obtain ancestor chains alongside matched nodes.

### Requirement: Follow siblings

When a `FieldMapping` declares `followSiblings`, the extraction engine switches to sequential sibling walk mode for all `childSelector` fields in that extractor. The walk processes the matched node's children in document order:

1. For each child, check if it matches any field's `childSelector`. If so, that field becomes the **active field** and the child's extracted value is added to it.
2. If the child does not match any field's `childSelector` but matches the active field's `followSiblings` pattern, it is appended to the active field's result array.
3. When `followSiblings` includes capture groups, the appended sibling value becomes the first capture group (`$1`). `$0` remains the full match, and higher groups remain available for any transform arg interpolation on that field. When `followSiblings` has no capture groups, the full node text is appended as-is.

This enables sequential grouping of continuation items (e.g. AND/OR items after GIVEN/WHEN/THEN in BDD scenarios) without requiring the continuation keyword to be part of any field's primary `childSelector`.

Fields without `childSelector` (e.g. `from: 'label'`) are extracted normally, outside the sequential walk.

### Requirement: SubtreeRenderer contract

The extraction engine depends on a `SubtreeRenderer` interface with a single method:

```typescript
interface SubtreeRenderer {
  renderSubtree(node: SelectorNode): string
}
```

This is satisfied by any `ArtifactParser` implementation. The engine never calls parsers directly — the caller provides the renderer, keeping the extraction engine decoupled from infrastructure.

### Requirement: Transform callbacks

Named transforms (for example `'resolveSpecPath'`) are injected by the caller through a shared extractor-transform registry keyed by transform name. The extraction engine does not define any concrete transforms — it resolves them from the registry at runtime.

Each registered transform has a fixed callable contract:

- `value` (`string`) — the main extracted string value for this invocation
- `args` (`readonly (string | undefined)[]`) — declarative transform args after placeholder interpolation (`$0`, `$1`, `$2`, ...\`)
- `context` (`ReadonlyMap<string, unknown>`) — opaque caller-provided key/value data describing the origin of the extraction
- return value — either a normalized `string` or a promise that resolves to one

The extraction engine treats `context` as opaque. It does not validate or interpret context keys. Each transform documents the minimum keys it requires, and each caller is responsible for supplying them.

Unknown transform names are runtime extraction errors — they are not ignored silently. A registered transform may also fail, throw, or reject when its required context keys are absent or invalid. Once a transform receives a value, it must return or resolve to a non-null string; inability to normalize the value is also an `ExtractorTransformError` extraction failure rather than a silent omission.

`ExtractorTransformError` is the contract error for transform resolution and execution failures. It is thrown when:

- the requested transform name is not registered in the runtime registry
- transform execution fails for an extractor-level transform
- transform execution fails for a field-level transform

The error identifies the transform name and whether the failure happened on an extractor-level or field-level transform. When the failure comes from a field-level transform, the error also identifies the field name.

The kernel owns the built-in transform registry and also allows external callers to register additional extractor transforms through the same additive composition model used for other kernel registries.

Built-in transforms may interpret declarative string args for behavior variants. `resolveSpecPath` specifically tries the primary extracted `value` first and then each interpolated arg in order, returning the first candidate that resolves to a canonical spec ID. This allows one extractor to support canonical dependency labels, relative `href` values, plain canonical dependency entries, and repository-backed normalization without introducing multiple extractors for `dependsOn`.

## Constraints

- The extraction engine itself performs no I/O and owns no side effects; any awaited work happens only inside caller-injected transforms
- `from` and `childSelector` on `FieldMapping` are mutually exclusive; when `childSelector` is present, `from` is ignored
- `followSiblings` is only meaningful when `childSelector` is also present; it has no effect on `from`-based field mappings
- When `followSiblings` is declared on any field in an extractor's `fields`, all `childSelector` fields in that extractor are processed via sequential walk — not independently
- Transform args are declarative strings; placeholder interpolation may resolve individual args to `undefined`
- The extraction engine does not validate or interpret transform context keys
- Unknown transform names, transform execution failures, rejected transform promises, and any attempt to return a null value after receiving an extracted value are `ExtractorTransformError` extraction errors
- The engine operates on `SelectorNode` — the generic node interface from selector matching — not on `ArtifactNode` directly

## Examples

```yaml
# Simple: extract title from first H1
selector: { type: section, level: 1 }
extract: label

# Simple with capture: extract spec dependency paths
selector: { type: section, matches: '^Spec Dependencies$' }
extract: content
capture: '\[.*?\]\(([^)]+)\)'
transform: resolveSpecPath

# Grouped: extract rules grouped by requirement
selector:
  type: section
  matches: '^Requirement:'
  parent: { type: section, matches: '^Requirements$' }
groupBy: label
strip: '^Requirement:\s*'
extract: content

# Structured with followSiblings: extract BDD scenarios
selector:
  type: section
  matches: '^Scenario:'
  parent: { type: section, matches: '^Requirement:' }
fields:
  name: { from: label, strip: '^Scenario:\s*' }
  requirement: { from: parentLabel, strip: '^Requirement:\s*' }
  given:
    childSelector: { type: list-item, matches: '^GIVEN\b' }
    capture: '^GIVEN\s+(.+)'
    followSiblings: '^(?:AND|OR)\b'
  when:
    childSelector: { type: list-item, matches: '^WHEN\b' }
    capture: '^WHEN\s+(.+)'
    followSiblings: '^(?:AND|OR)\b'
  then:
    childSelector: { type: list-item, matches: '^THEN\b' }
    capture: '^THEN\s+(.+)'
    followSiblings: '^(?:AND|OR)\b'
```

## Spec Dependencies

- [`core:core/selector-model`](../selector-model/spec.md) — the selector model used by extractors to identify AST nodes
- [`core:core/artifact-ast`](../artifact-ast/spec.md) — the normalized AST format that extractors operate on
