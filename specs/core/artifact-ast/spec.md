# Artifact AST

## Purpose

Parsers, the delta engine, selectors, and validation rules all operate on artifact content, and without a shared tree format each would depend on parser internals, making them tightly coupled to specific file types. The normalized AST solves this by defining a plain JSON-serializable tree of nodes that every `ArtifactParser` adapter must produce and consume. This format is the contract between all these components; adapter internals (which parsing library is used, how the native AST is built) are not specified here.

## Requirements

### Requirement: Common node schema

Every node in the normalized AST is a plain object with the following fields:

- `type` (string, required) — the node type; values are format-specific and defined per format below
- `label` (string, optional) — the identifying value of the node; this is the field evaluated by `matches` in selectors; present on nodes that have a primary identifier (section heading text, pair key name, etc.)
- `value` (string | number | boolean | null, optional) — the scalar content of a leaf node; mutually exclusive with `children`
- `children` (array, optional) — ordered child nodes; mutually exclusive with `value`

A node may have neither `value` nor `children` (e.g. a thematic break). A node may not have both.

### Requirement: Markdown AST

A markdown adapter must normalize to the following node types:

- `document` — root node; no `label`; has `children`
- `section` — a heading and all content until the next heading of equal or lesser depth; `label` is the heading text without leading `#` characters and surrounding whitespace (e.g. `"Requirement: Login"`); has `level` (integer 1–6) reflecting the heading depth; has `children`
- `paragraph` — a prose block; no `label`; has `value` (the paragraph text as plain markdown inline content)
- `list` — a bullet or numbered list; no `label`; has `ordered` (boolean); has `children`
- `list-item` — an individual list entry; `label` is the item text; may have `children` for nested lists (in which case `label` holds the item text and `children` holds the nested list nodes)
- `code-block` — a fenced or indented code block; `label` is the language identifier if present; has `value` (the code content)
- `thematic-break` — a horizontal rule; no `label`; no `value`; no `children`

Sections nest by relative heading depth: each section becomes a child of the nearest preceding section whose `level` is strictly lower. Levels need not be contiguous — a `level: 4` section becomes a child of the nearest preceding `level: 1`, `level: 2`, or `level: 3` section, whichever appears last.

Example — the following markdown:

```markdown
## Requirements

### Requirement: Login

The system must authenticate users.

- Email and password
- Rate-limited to 5 attempts
```

Normalizes to:

```json
{
  "type": "document",
  "children": [
    {
      "type": "section",
      "label": "Requirements",
      "level": 2,
      "children": [
        {
          "type": "section",
          "label": "Requirement: Login",
          "level": 3,
          "children": [
            {
              "type": "paragraph",
              "value": "The system must authenticate users."
            },
            {
              "type": "list",
              "ordered": false,
              "children": [
                { "type": "list-item", "label": "Email and password" },
                { "type": "list-item", "label": "Rate-limited to 5 attempts" }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

### Requirement: YAML AST

A YAML adapter must normalize to the following node types:

- `document` — root node; no `label`; has `children` (the top-level mapping's pairs, or a single sequence)
- `mapping` — a YAML mapping; no `label`; has `children` (array of `pair` nodes)
- `pair` — a key–value entry; `label` is the key name as a string; has `value` for scalar values, or `children` containing a single `mapping` or `sequence` node for nested structures
- `sequence` — a YAML sequence; no `label`; has `children` (array of `sequence-item` nodes)
- `sequence-item` — an item in a sequence; no `label`; has `value` for scalar items, or `children` containing a single `mapping` or `sequence` node for structured items

Example — the following YAML:

```yaml
schema: spec-driven
llm:
  model: claude-opus-4-6
  maxTokens: 4096
```

Normalizes to:

```json
{
  "type": "document",
  "children": [
    { "type": "pair", "label": "schema", "value": "spec-driven" },
    {
      "type": "pair",
      "label": "llm",
      "children": [
        {
          "type": "mapping",
          "children": [
            { "type": "pair", "label": "model", "value": "claude-opus-4-6" },
            { "type": "pair", "label": "maxTokens", "value": 4096 }
          ]
        }
      ]
    }
  ]
}
```

### Requirement: JSON AST

A JSON adapter must normalize to the following node types:

- `document` — root node; no `label`; has `children` containing a single root node
- `object` — a JSON object; no `label`; has `children` (array of `property` nodes)
- `property` — a key–value entry; `label` is the key name; has `value` for scalar values, or `children` containing a single `object` or `array` node
- `array` — a JSON array; no `label`; has `children` (array of `array-item` nodes)
- `array-item` — an item in an array; no `label`; has `value` for scalar items, or `children` containing a single `object` or `array` node

### Requirement: Plaintext AST

A plaintext adapter must normalize to the following node types:

- `document` — root node; no `label`; has `children`
- `paragraph` — a block of text separated by blank lines; no `label`; has `value`
- `line` — a single line of text; no `label`; has `value`

### Requirement: Round-trip fidelity

Each adapter must be able to serialize a normalized AST back to the artifact's native format. The round-trip contract:

- All `label`, `value`, and `children` content is preserved exactly
- For markdown: heading levels, list types (`ordered`), code block languages, and nesting structure are preserved
- For markdown: inline formatting intent represented in AST node metadata (such as inline code, emphasis, strong, and link structure) is preserved across parse/apply/serialize for nodes not explicitly modified by delta entries
- For markdown: serializer style markers (`bullet`, `emphasis`, `strong`) should follow the source document when unambiguous; when ambiguous, output follows deterministic project markdown conventions
- For YAML: key order within mappings is preserved; comments are preserved where the underlying library supports it (CST-level round-trip)
- For JSON: key order is preserved; formatting is normalized to two-space indentation
- Content not representable in the normalized format (e.g. inline markdown formatting such as bold or italic) is preserved as-is within `value` strings — the adapter does not decompose inline nodes

## Constraints

- `value` and `children` are mutually exclusive on any node
- `label` is only present on node types that have a primary identifier; it is absent on `document`, `paragraph`, `list`, `sequence`, `array`, `object`, `thematic-break`
- All field values must be JSON-serializable — no functions, no circular references, no class instances
- The adapter is the only component that may parse or serialize the native format; all other components operate exclusively on the normalized AST

## Spec Dependencies

- [`core:core/delta-format`](../delta-format/spec.md) — delta application, ArtifactParser port
- [`core:core/selector-model`](../selector-model/spec.md) — selector model that operates over this AST format
