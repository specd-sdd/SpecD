# Content Extraction

## Purpose

Multiple features — metadata generation, compliance gates, impact analysis — need to pull structured data from artifact files, but hard-coding extraction logic per feature would be brittle and duplicative. The content extraction engine solves this with a generic domain service that extracts structured data from artifact ASTs using declarative `Extractor` configurations. It is the foundation for deterministic metadata generation and is designed to be reused by future features.

## Requirements

### Requirement: Extractor value object

An `Extractor` is a first-class domain value object that declares how to extract content from an AST. It combines a `Selector` (which nodes to find) with post-processing directives (what to do with the matched nodes):

- `selector` (Selector, required) — identifies the AST node(s) to extract from, using the full selector model
- `extract` (`'content' | 'label' | 'both'`, optional, defaults to `'content'`) — what to pull from each matched node
- `capture` (string, optional) — regex with capture group applied to the extracted text; all matches are collected
- `strip` (string, optional) — regex removed from labels/values before output
- `groupBy` (`'label'`, optional) — groups matched nodes by their label
- `transform` (string, optional) — named post-processing callback injected by the caller (e.g. `'resolveSpecPath'`)
- `fields` (record of string to `FieldMapping`, optional) — structured field mapping; when present, each matched node produces one object with the declared fields

### Requirement: FieldMapping value object

A `FieldMapping` declares how to extract a single field from within a matched AST node:

- `from` (`'label' | 'parentLabel' | 'content'`, optional, defaults to `'content'`) — source of the field value relative to the matched node
- `childSelector` (Selector, optional) — selector applied within the matched node to find child values
- `capture` (string, optional) — regex with capture group applied to the extracted text
- `strip` (string, optional) — regex removed from the extracted text
- `followSiblings` (string, optional) — regex matching sibling nodes that follow a `childSelector` match; matched siblings are appended to the active field's result array until a non-matching sibling or another field's `childSelector` match is encountered; if the pattern contains a capture group, the captured text is used; otherwise the full node text is returned as-is

`from` and `childSelector` are mutually exclusive modes. When `childSelector` is present, `from` is ignored.

### Requirement: Extract modes

The `extract` field on an `Extractor` controls what text is pulled from each matched node:

- `'label'` — returns `node.label` (e.g. the heading text of a section)
- `'content'` — renders the node's children only, skipping the node's own heading/label; for leaf nodes without children, renders the node itself
- `'both'` — returns the label followed by the full rendered subtree

### Requirement: Simple extraction

When an extractor has no `fields` and no `groupBy`, `extractContent` operates in simple mode:

1. Find all nodes matching `selector`
2. For each match, extract text according to `extract` mode
3. Apply `strip` if present
4. Apply `capture` if present — when capture is global, all capture group matches are collected
5. Apply `transform` if present — the named callback is looked up from an injected transform map and called with the full result array
6. Return the result as `string[]`

### Requirement: Grouped extraction

When `groupBy` is `'label'`, matched nodes are grouped by their label (after applying `strip`). Each group produces a `GroupedExtraction` object with:

- `label` — the group key (the node's label after strip)
- `items` — an array of content strings; each matched node contributes one content block rendered from its children

### Requirement: Structured extraction

When `fields` is present, each matched node produces one `StructuredExtraction` object (a record of field name to string or string array). For each field entry:

- `from: 'label'` — takes `node.label`
- `from: 'parentLabel'` — walks the ancestor chain in reverse and takes the nearest ancestor's label
- `from: 'content'` — renders the matched node's subtree
- `childSelector` — finds children within the matched node matching the selector; applies `capture` to each child's text

Ancestor tracking is required for `parentLabel` — the engine uses `findNodesWithAncestors` to obtain ancestor chains alongside matched nodes.

### Requirement: Follow siblings

When a `FieldMapping` declares `followSiblings`, the extraction engine switches to sequential sibling walk mode for all `childSelector` fields in that extractor. The walk processes the matched node's children in document order:

1. For each child, check if it matches any field's `childSelector`. If so, that field becomes the **active field** and the child's text (after `capture`) is added to it.
2. If the child does not match any field's `childSelector` but matches the active field's `followSiblings` pattern, it is appended to the active field's result array.
3. If the `followSiblings` pattern contains a capture group, the captured text is used. Otherwise the full node text is returned as-is.

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

Named transforms (e.g. `'resolveSpecPath'`) are injected by the caller via a `ReadonlyMap<string, (values: string[]) => string[]>`. The extraction engine does not define any transforms — it only invokes them by name. This keeps the engine pure and domain-level while allowing application-layer logic (like resolving relative spec paths to spec IDs) to be composed in.

## Constraints

- `extractContent` is a pure function — no I/O, no side effects
- `from` and `childSelector` on `FieldMapping` are mutually exclusive; when `childSelector` is present, `from` is ignored
- `followSiblings` is only meaningful when `childSelector` is also present; it has no effect on `from`-based field mappings
- When `followSiblings` is declared on any field in an extractor's `fields`, all `childSelector` fields in that extractor are processed via sequential walk — not independently
- `transform` callbacks are optional and looked up by name; an unknown transform name is silently ignored (no error)
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

- [`specs/core/selector-model/spec.md`](../selector-model/spec.md) — the selector model used by extractors to identify AST nodes
- [`specs/core/artifact-ast/spec.md`](../artifact-ast/spec.md) — the normalized AST format that extractors operate on
