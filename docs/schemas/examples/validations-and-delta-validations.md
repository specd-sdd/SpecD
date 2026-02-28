# Example: Validations and delta validations

## When to use validations

`validations` and `deltaValidations` let you enforce structural constraints on your artifact files and delta files respectively. Without them, SpecD accepts any well-formed file as valid. Add them when your team has conventions that the AI should not be able to violate — for example, that every spec must have a Requirements section, or that every delta must include at least one new scenario.

Both fields use the same rule format. The difference is what they operate on:

- **`validations`** — checked against the artifact content after delta application
- **`deltaValidations`** — checked against the delta file's AST before application; only valid with `delta: true`

## Identifying nodes: two approaches

Every rule identifies nodes using one of two mutually exclusive approaches.

### Selector fields

The selector approach uses the same fields as delta entries: `type`, `matches`, `contains`, `parent`, `index`, `where`. It is readable, concise, and sufficient for most structural checks.

```yaml
validations:
  # Assert the artifact has a Requirements section.
  - type: section
    matches: '^Requirements$'
    required: true

  # Assert the Requirements section contains at least one Requirement: subsection.
  # `children` evaluates each rule with the matched parent node as the new root.
  - type: section
    matches: '^Requirements$'
    required: true
    children:
      - type: section
        matches: '^Requirement:'
        required: true

  # Assert each Requirement: section contains at least one Scenario: subsection.
  # Rules nest as deeply as needed.
  - type: section
    matches: '^Requirement:'
    required: true
    children:
      - type: section
        matches: '^Scenario:'
        required: true
```

### JSONPath (`path`)

The `path` approach evaluates a JSONPath expression (RFC 9535) against the normalised artifact AST. Use it when the structural query requires more expressive power than the selector fields provide — for example, checking relative positions, counting nodes, or expressing conditions that cross nesting levels.

```yaml
validations:
  # Assert there is at least one level-2 section in the document.
  - path: '$..children[?(@.type=="section" && @.level==2)]'
    required: true
```

`path` and selector fields are mutually exclusive within the same rule.

## Additional rule fields

Both approaches support the same additional fields:

| Field            | Type    | Default | Description                                                                                                                                                      |
| ---------------- | ------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `required`       | boolean | `true`  | When `true`, absence of a matching node is an error. When `false`, it is a warning.                                                                              |
| `contentMatches` | string  | —       | Regex matched case-insensitively against the serialised text of the matched node's full subtree. Used to assert that a section's content contains expected text. |
| `children`       | array   | —       | Sub-rules evaluated with each matched node as root. Each entry is a full validation rule.                                                                        |

**`contentMatches` detail** — SpecD serialises the matched node's full subtree back to the artifact's native format before matching. This means the regex operates on the rendered text (headings, paragraphs, list items), not on the internal AST structure.

**Vacuous pass** — a rule that matches zero nodes always passes, regardless of `required`. This allows rules to assert properties of nodes that must exist elsewhere — the existence check and the property check are expressed as separate rules.

## validations examples

### Enforcing spec structure (markdown)

```yaml
artifacts:
  - id: specs
    scope: spec
    output: 'specs/**/spec.md'
    validations:
      # Required: a Purpose section must exist
      - type: section
        matches: '^Purpose$'
        required: true

      # Required: a Requirements section must exist
      - type: section
        matches: '^Requirements$'
        required: true

      # Required: Requirements must contain at least one Requirement: subsection
      - type: section
        matches: '^Requirements$'
        children:
          - type: section
            matches: '^Requirement:'
            required: true

      # Warning: each Requirement: section should use normative language
      # required: false means absence is a warning, not an error
      - type: section
        matches: '^Requirement:'
        contentMatches: 'SHALL|MUST'
        required: false

      # Required: each Requirement: section must have at least one Scenario:
      - type: section
        matches: '^Requirement:'
        children:
          - type: section
            matches: '^Scenario:'
            required: true
```

### Enforcing verify.md structure (markdown)

```yaml
- id: verify
  scope: spec
  output: 'specs/**/verify.md'
  validations:
    - type: section
      matches: '^Requirements$'
      required: true
      children:
        - type: section
          matches: '^Requirement:'
          required: true
          children:
            # Every requirement group must have at least one scenario
            - type: section
              matches: '^Scenario:'
              required: true
```

### Enforcing JSON structure

```yaml
- id: openapi
  scope: spec
  output: 'specs/**/openapi.json'
  format: json
  validations:
    # The document must have an "info" property
    - type: property
      matches: '^info$'
      required: true

    # The info object must have a "title" property
    - type: property
      matches: '^info$'
      children:
        - type: property
          matches: '^title$'
          required: true

    # Every path item must declare at least one operation
    - path: '$.paths.*'
      required: true
      children:
        - path: '$[?(@=="get" || @=="post" || @=="put" || @=="delete")]'
          required: true
```

### Enforcing YAML structure

```yaml
- id: config
  scope: spec
  output: 'specs/**/config.yaml'
  format: yaml
  validations:
    # The document must have a "version" key
    - type: pair
      matches: '^version$'
      required: true

    # Warning if no "description" key is present
    - type: pair
      matches: '^description$'
      required: false
```

## deltaValidations examples

`deltaValidations` checks rules against the delta file's YAML AST before application. The delta file is a YAML sequence of operation entries. When parsed, each entry becomes a `sequence-item` containing a `mapping` with `pair` nodes for `op`, `selector`, `content`, `position`, and other fields.

The `where` field on `sequence-item` rules is especially useful here: it matches items whose fields satisfy all key–value pairs, allowing correlated checks on the same entry.

### Require new scenarios in any spec delta

```yaml
- id: specs
  scope: spec
  output: 'specs/**/spec.md'
  delta: true
  deltaValidations:
    # At least one added or modified operation must include a Scenario heading
    # in its content. This ensures verify.md is updated alongside spec changes.
    - type: sequence-item
      where:
        op: 'added|modified'
      contentMatches: '#### Scenario:'
      required: true
```

### Warn when a delta only adds without removing anything

```yaml
deltaValidations:
  # Warning if no entry removes content — may indicate an incomplete delta
  # that adds without cleaning up superseded content
  - type: sequence-item
    where:
      op: 'removed'
    required: false # false → warning only, not an error
```

### Require that every removed operation has a reason comment

This uses `contentMatches` against the entry's serialised YAML to check for the presence of a comment field. Because comments are not part of the YAML data model, this technique works on a convention where `reason` is a data field, not a YAML comment.

```yaml
deltaValidations:
  # Every removed entry must include a reason field
  - type: sequence-item
    where:
      op: 'removed'
    children:
      - type: pair
        matches: '^reason$'
        required: true
```

### Combined: require adds/modifies to target the Requirements section

```yaml
deltaValidations:
  # Every added or modified entry must have a position.parent or selector
  # that targets the Requirements section — preventing accidental top-level edits
  - type: sequence-item
    where:
      op: 'added'
    children:
      - type: pair
        matches: '^position$'
        required: true
```

## Combining validations with contextSections

`validations` and `contextSections` work off the same node type vocabulary and selector model. A pattern you use to validate that a section exists can be reused to extract that section into AI context:

```yaml
- id: specs
  scope: spec
  output: 'specs/**/spec.md'
  validations:
    - type: section
      matches: '^Requirements$'
      required: true
  contextSections:
    # Extract the same Requirements section for context injection
    - selector:
        type: section
        matches: '^Requirements$'
      role: rules
      contextTitle: Spec Requirements
```

This keeps the validation constraint and the context extraction declaration aligned — if you add a new section to validate, you can decide whether it also belongs in AI context.
