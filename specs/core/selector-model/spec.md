# Selector Model

## Overview

The selector model defines how nodes in an artifact AST are identified and addressed. Selectors are used across multiple specd mechanisms: delta entries target nodes for modification or removal, validation rules assert structural constraints, and context sections declare which nodes to extract. The selector model is format-agnostic — the same fields apply regardless of whether the target document is markdown, JSON, YAML, or plain text.

## Requirements

### Requirement: Selector fields

A selector is a YAML object with the following fields:

- `type` (string, required) — the node type; must be one of the values returned by `ArtifactParser.nodeTypes()` for the target file format
- `matches` (string, optional) — a regular expression matched case-insensitively against the node's `label` (heading text for markdown sections, key name for JSON/YAML pairs, etc.); a plain string like `"Login"` matches any label containing that text; anchors and special characters work as expected (`"^Requirement:"`, `"^Requirements$"`)
- `contains` (string, optional) — a regular expression matched case-insensitively against the node's `value` (paragraph text, scalar pair value, etc.); useful for finding leaf nodes by content rather than by identity
- `parent` (selector, optional) — constrains the search to nodes whose nearest ancestor matches this selector; used to disambiguate nodes with the same identifier at different nesting levels
- `index` (integer, optional) — for `array-item` and `sequence-item` nodes, targets the item at this zero-based index; mutually exclusive with `where`
- `where` (object, optional) — for `array-item` and `sequence-item` nodes where items are objects, targets the item whose fields match all key–value pairs in `where`; values are matched as case-insensitive regular expressions (same as `matches`); mutually exclusive with `index`

### Requirement: Node types by file format

All adapters normalize to the AST format defined in [`specs/core/artifact-ast/spec.md`](../artifact-ast/spec.md). The node types addressable by selectors are the same types produced by each adapter:

- Markdown: `document`, `section`, `paragraph`, `list`, `list-item`, `code-block`, `thematic-break`
- JSON: `document`, `object`, `property`, `array`, `array-item`
- YAML: `document`, `mapping`, `pair`, `sequence`, `sequence-item`
- Plain text: `document`, `paragraph`, `line`

The `label` field on a node is the identifying value evaluated by `matches`; the `value` field is the scalar content evaluated by `contains`.

### Requirement: Multi-match behaviour

When multiple nodes match a selector, the outcome depends on the calling context:

- In **delta entries** (`modified`, `removed`) — `apply` must reject with a `DeltaApplicationError`; selectors in delta operations must resolve to exactly one node.
- In **validation rules** and **context sections** — multiple matches are expected and each matched node is processed individually.

### Requirement: No-match behaviour

When a selector matches zero nodes:

- In **delta entries** — `apply` must reject with a `DeltaApplicationError` for `selector` on `modified` and `removed` entries. `position.after` and `position.before` selectors in `added` entries are warnings, not errors — insertion falls back to the end of the parent scope.
- In **validation rules** — a rule passes vacuously when it matches zero nodes (no error or warning is produced).

## Constraints

- `selector.index` and `selector.where` are mutually exclusive
- `type` must be one of the node types produced by `ArtifactParser.nodeTypes()` for the target file format; unknown types are a validation error at parse time
- `where` values are matched as case-insensitive regular expressions — the same semantics as `matches`
- `parent` is recursive — it is itself a full selector, including optional `parent`, enabling multi-level ancestry constraints

## Examples

```yaml
# Finds any section whose label contains "Login" (case-insensitive)
selector:
  type: section
  matches: "Login"

# Finds sections whose label starts with "Requirement:"
selector:
  type: section
  matches: "^Requirement:"

# Finds a YAML pair whose key ends with "_url"
selector:
  type: pair
  matches: "_url$"

# Disambiguates by ancestry — Requirement sections inside Requirements only
selector:
  type: section
  matches: "^Requirement:"
  parent:
    type: section
    matches: "^Requirements$"

# Targets a specific item in a YAML sequence by field value
selector:
  type: sequence-item
  parent:
    type: pair
    matches: workflow
  where:
    step: implementing

# Targets a sequence item by position
selector:
  type: sequence-item
  index: 0
```

**Identifying property pattern examples:**

| Value                                  | Behaviour                                                 |
| -------------------------------------- | --------------------------------------------------------- |
| `"Login"`                              | Matches any label containing `"Login"` (case-insensitive) |
| `"^Requirement: Login$"`               | Matches only the exact string `"Requirement: Login"`      |
| `"^Requirement:"`                      | Matches any label starting with `"Requirement:"`          |
| `"^Requirement: .+ \\(deprecated\\)$"` | Matches `"Requirement: Old thing (deprecated)"`           |

## Spec Dependencies

- [`specs/core/artifact-ast/spec.md`](../artifact-ast/spec.md) — normalized AST format; defines node types, `label`/`value` semantics
- [`specs/core/delta-format/spec.md`](../delta-format/spec.md) — uses selectors in delta entries and `position` hints
- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) — uses selectors in `validations`, `deltaValidations`, and `contextSections`
