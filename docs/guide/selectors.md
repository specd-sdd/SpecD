# Selectors, Extractors, and Validation Rules

SpecD schemas work with the content of your artifact files — not just their existence. To do that, schemas need a way to describe exactly which part of a file they care about: a heading, a list item, a YAML key, a specific sequence entry. That is what selectors do.

Selectors, extractors, and validation rules are three layers that build on each other:

- A **selector** identifies one or more nodes in a file's parsed structure.
- An **extractor** wraps a selector with post-processing instructions: what text to pull out, how to clean it up, and optionally how to map it into structured objects.
- A **validation rule** wraps a selector with a structural assertion: does this node exist? does its content match a pattern?

All three are used across schemas — in `validations`, `deltaValidations`, and `metadataExtraction`. Understanding selectors is the foundation for all of them.

---

## How artifacts are parsed

When SpecD reads an artifact file, it parses it into a tree of typed nodes — an Abstract Syntax Tree (AST). Each node has a **type**, a **label** (the identifying text), and a **value** (the content).

The node types available depend on the file's format:

| Format     | Node types                                                                              |
| ---------- | --------------------------------------------------------------------------------------- |
| Markdown   | `document`, `section`, `paragraph`, `list`, `list-item`, `code-block`, `thematic-break` |
| JSON       | `document`, `object`, `property`, `array`, `array-item`                                 |
| YAML       | `document`, `mapping`, `pair`, `sequence`, `sequence-item`                              |
| Plain text | `document`, `paragraph`, `line`                                                         |

The **label** is what `matches` is tested against: the heading text for a Markdown `section`, the key name for a YAML `pair` or JSON `property`. The **value** is what `contains` is tested against: the paragraph text for a Markdown `paragraph`, the scalar value for a YAML `pair`.

### Markdown example

Given this Markdown:

```markdown
## Requirements

### Requirement: Authentication

Users must be able to log in with email and password.
```

The AST contains:

- A `section` node with `label: "Requirements"` at level 2
  - A `section` node with `label: "Requirement: Authentication"` at level 3
    - A `paragraph` node with `value: "Users must be able to log in with email and password."`

### YAML example

Given this YAML:

```yaml
workflow:
  - name: Run tests
    command: pnpm test
  - name: Deploy
    command: ./deploy.sh
```

The AST contains:

- A `mapping` at document root
  - A `pair` with `label: "workflow"`
    - A `sequence` containing:
      - A `sequence-item` (an object) with child pairs
        - A `pair` with `label: "name"`, `value: "Run tests"`
        - A `pair` with `label: "command"`, `value: "pnpm test"`
      - A `sequence-item` (an object) with child pairs
        - A `pair` with `label: "name"`, `value: "Deploy"`
        - ...

---

## Selectors

A selector is an object that describes the nodes to match. All selector fields are optional except `type`.

### Selector fields

| Field      | Type     | Description                                                                                                                                                                                           |
| ---------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`     | string   | The node type to match. Required. Must be one of the type names for the target format (see table above).                                                                                              |
| `matches`  | string   | Regex matched **case-insensitively** against the node's `label`. Plain strings match anywhere in the label — use anchors for exact matches.                                                           |
| `contains` | string   | Regex matched **case-insensitively** against the node's `value`. Useful for finding leaf nodes by content rather than name.                                                                           |
| `parent`   | selector | Constrains the search to nodes whose nearest ancestor matches this selector. Used to disambiguate nodes with the same label at different levels.                                                      |
| `index`    | integer  | For `array-item` and `sequence-item` nodes: targets the item at this zero-based position. Mutually exclusive with `where`.                                                                            |
| `where`    | object   | For `array-item` and `sequence-item` nodes that are objects: targets the item whose fields all match the given key–value pairs. Values are case-insensitive regexes. Mutually exclusive with `index`. |
| `level`    | integer  | For Markdown `section` nodes only: matches sections at exactly this heading level (1 = `#`, 2 = `##`, etc.).                                                                                          |

### Matching with `matches`

`matches` is a case-insensitive regular expression tested against the node's label. Without anchors, it matches anywhere in the label text.

| Pattern                        | What it matches                                                         |
| ------------------------------ | ----------------------------------------------------------------------- |
| `'Login'`                      | Any label containing `Login` (e.g. `Login`, `User Login`, `Login flow`) |
| `'^Requirements$'`             | Exactly the string `Requirements`                                       |
| `'^Requirement:'`              | Any label starting with `Requirement:`                                  |
| `'_url$'`                      | Any label ending with `_url`                                            |
| `'^Scenario: .+ \(skipped\)$'` | Labels like `Scenario: Login (skipped)`                                 |

### Narrowing with `parent`

When the same heading appears at multiple levels of a document, `parent` disambiguates. Without `parent`, all matching nodes are returned regardless of where they appear.

```yaml
# Matches every section whose label starts with "Requirement:"
# anywhere in the document — including sections nested under other headings
selector:
  type: section
  matches: '^Requirement:'

# Matches only those sections nested directly under the Requirements section
selector:
  type: section
  matches: '^Requirement:'
  parent:
    type: section
    matches: '^Requirements$'
```

### Targeting by position with `index`

For ordered collections (`array-item`, `sequence-item`), `index` selects a specific item by its zero-based position:

```yaml
# The first item in a sequence
selector:
  type: sequence-item
  index: 0
```

### Targeting by field values with `where`

For object-typed sequence or array items, `where` matches items whose named fields satisfy all conditions. Values are case-insensitive regexes:

```yaml
# The sequence item whose "op" field matches "added" or "modified"
selector:
  type: sequence-item
  where:
    op: 'added|modified'

# The sequence item whose "name" field is exactly "Run tests"
selector:
  type: sequence-item
  where:
    name: '^Run tests$'
```

### Targeting by heading level with `level`

In Markdown, `level` restricts a `section` selector to a specific heading depth:

```yaml
# Only the H1 heading (the document title)
selector:
  type: section
  level: 1

# Only H3 headings — not H2 or H4
selector:
  type: section
  level: 3
```

---

## Practical selector examples

These examples come directly from the standard schema (`schema-std`).

### Selecting the document title (H1 heading)

```yaml
selector:
  type: section
  level: 1
```

Matches the first (and typically only) H1 heading in a Markdown spec file.

### Selecting a section by exact heading name

```yaml
selector:
  type: section
  matches: '^Purpose$'
```

Matches a section whose heading is exactly `Purpose`. Case-insensitive, so `purpose` and `PURPOSE` also match.

### Selecting all Requirement sections under Requirements

```yaml
selector:
  type: section
  matches: '^Requirement:'
  parent:
    type: section
    matches: '^Requirements$'
```

Matches every `### Requirement: ...` heading that is a direct child of the `## Requirements` section. Without the `parent` constraint, this would also match any `Requirement:` heading that appears elsewhere in the document.

### Selecting list items within a section

```yaml
selector:
  type: list-item
  parent:
    type: section
    matches: '^Constraints$'
```

Matches every bullet point under a `## Constraints` heading.

### Selecting a YAML sequence item by field value

```yaml
selector:
  type: sequence-item
  where:
    op: 'added|modified'
```

Matches every sequence item (object) whose `op` field is `added` or `modified`. Used in `deltaValidations` to assert that modified delta entries meet structural requirements.

---

## Extractors: pulling data from the AST

An extractor pairs a selector with instructions for what to do with the matched nodes. Extractors are used in `metadataExtraction` to pull structured content out of artifact files.

Every extractor has a `selector` field plus a post-processing pipeline. The pipeline runs in this order:

1. **Select** nodes using `selector`
2. **Extract** text using `extract`
3. **Strip** unwanted patterns using `strip`
4. **Capture** a portion of the text using `capture`
5. **Transform** the result using a named callback with `transform`
6. **Group** results using `groupBy`

Or, for complex structured data:

- **Map to objects** using `fields`

### Extract modes

The `extract` field controls what text is pulled from each matched node:

| Value       | What it returns                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------- |
| `'content'` | The full rendered text of the node's subtree (default). For a Markdown section, this is everything below the heading. |
| `'label'`   | Only the node's identifying text: the heading text, key name, or item label.                                          |
| `'both'`    | The label followed by the content, separated.                                                                         |

### Simple extraction: a section's content

```yaml
extractor:
  selector:
    type: section
    matches: '^Purpose$'
  extract: content
```

Returns the full text of everything inside the `Purpose` section — paragraphs, lists, everything below the heading.

### Extracting just the label

```yaml
extractor:
  selector:
    type: section
    level: 1
  extract: label
```

Returns the heading text of the H1 section — the document title — without any of the section's content.

### Stripping a prefix from labels

When labels contain a structured prefix you want to remove:

```yaml
extractor:
  selector:
    type: section
    matches: '^Requirement:'
    parent:
      type: section
      matches: '^Requirements$'
  extract: label
  strip: '^Requirement:\s*'
```

Each matched label (`Requirement: Authentication`, `Requirement: Session expiry`) has the `Requirement: ` prefix removed, leaving `Authentication` and `Session expiry`.

### Capturing a portion of the text

`capture` is a regex with a capture group. Only the captured portion is kept:

```yaml
extractor:
  selector:
    type: section
    matches: '^Spec Dependencies$'
  extract: content
  capture: '\[.*?\]\(([^)]+)\)'
  transform: resolveSpecPath
```

This extracts the content of the `Spec Dependencies` section, then uses a regex to capture only the link targets from Markdown links like `[auth/login](auth/login)`. The `transform: resolveSpecPath` callback then normalises each path into a fully-qualified spec ID.

### Grouping results by label

`groupBy: label` groups matched nodes by their label (after `strip` is applied). This is useful when the same heading pattern repeats and you want the results keyed by name:

```yaml
extractor:
  selector:
    type: section
    matches: '^Requirement:'
    parent:
      type: section
      matches: '^Requirements$'
  groupBy: label
  strip: '^Requirement:\s*'
  extract: content
```

Instead of returning a flat array of content strings, this returns an object keyed by stripped label:

```json
{
  "Authentication": "Users must be able to log in...",
  "Session expiry": "Sessions expire after 30 minutes..."
}
```

---

## Structured extraction with `fields`

For complex data like BDD scenarios, a single matched node needs to produce a structured object with multiple named fields. The `fields` option does this: each key in `fields` declares how to populate one property of the output object.

Each field mapping can use:

| Field            | Description                                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `from`           | Source of the value: `'label'` (the matched node's label), `'parentLabel'` (the parent node's label), or `'content'` (the rendered subtree). |
| `childSelector`  | A selector applied within the matched node to find child nodes for this field.                                                               |
| `capture`        | Regex with a capture group applied to the extracted text.                                                                                    |
| `strip`          | Regex removed from the extracted text.                                                                                                       |
| `followSiblings` | Regex matching sibling nodes that follow a `childSelector` match. Enables sequential grouping — see below.                                   |

### Example: extracting BDD scenarios

The standard schema extracts structured scenario objects from `verify.md` files. Each scenario section (`#### Scenario: ...`) under a requirement section needs to produce an object with `name`, `requirement`, `given`, `when`, and `then` fields.

The `verify.md` looks like this:

```markdown
### Requirement: Authentication

#### Scenario: Valid login

- GIVEN the user is on the login page
- WHEN the user enters valid credentials
- AND the user submits the form
- THEN the user is redirected to the dashboard
- AND a session cookie is set
```

The extractor:

```yaml
extractor:
  selector:
    type: section
    matches: '^Scenario:'
    parent:
      type: section
      matches: '^Requirement:'
  fields:
    name:
      from: label
      strip: '^Scenario:\s*'
    requirement:
      from: parentLabel
      strip: '^Requirement:\s*'
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

Each matched `Scenario:` section produces one object. For the example above:

```json
{
  "name": "Valid login",
  "requirement": "Authentication",
  "given": ["the user is on the login page"],
  "when": ["the user enters valid credentials", "the user submits the form"],
  "then": ["the user is redirected to the dashboard", "a session cookie is set"]
}
```

### The `followSiblings` pattern

`followSiblings` enables collecting `AND`/`OR` continuation lines that follow a primary clause. When a `childSelector` matches a node (e.g. `WHEN the user enters valid credentials`), `followSiblings` matches the subsequent sibling nodes that belong to that clause (`AND the user submits the form`). The matched siblings are appended to the preceding field's result array.

If `followSiblings` contains a capture group, only the captured portion is used. Without a capture group, the full node text is returned. The collection stops when a sibling does not match `followSiblings` or when another field's `childSelector` matches.

---

## Validation rules

Validation rules assert structural constraints on artifact content. They appear in `validations` (checked against the artifact) and `deltaValidations` (checked against delta files before application).

### Validation rule fields

| Field            | Type     | Description                                                                                                                                          |
| ---------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | string   | Optional identifier for this rule. Useful for error messages and for targeting with overrides.                                                       |
| `selector`       | selector | Identifies the node(s) to validate.                                                                                                                  |
| `path`           | string   | JSONPath expression for targeting a value in JSON or YAML artifacts. Alternative to `selector`.                                                      |
| `required`       | boolean  | Whether the matched node must exist. Defaults to `true`. When `false`, the rule produces a warning rather than a hard failure if the node is absent. |
| `contentMatches` | string   | Regex the rendered node content must match.                                                                                                          |
| `children`       | array    | Nested validation rules evaluated against the matched node's children.                                                                               |

### Asserting a section exists

```yaml
validations:
  - id: has-purpose
    selector:
      type: section
      matches: '^Purpose$'
    required: true
```

Fails if no `Purpose` section is found in the artifact.

### Asserting nested structure

`children` rules are evaluated within each node matched by the parent rule. This is how you assert that a section not only exists but also contains the right structure:

```yaml
validations:
  - id: has-requirements
    selector:
      type: section
      matches: '^Requirements$'
    required: true
    children:
      - id: has-requirement-block
        selector:
          type: section
          matches: '^Requirement:'
        required: true
        children:
          - id: has-scenario
            selector:
              type: section
              matches: '^Scenario:'
            required: true
```

This enforces the full structure: a `Requirements` section must exist, it must contain at least one `Requirement:` subsection, and that subsection must contain at least one `Scenario:` subsection.

### Asserting content with `contentMatches`

```yaml
deltaValidations:
  - id: added-has-scenario
    selector:
      type: sequence-item
      where:
        op: 'added|modified'
    contentMatches: '#### Scenario:'
    required: true
```

Every delta entry with `op: added` or `op: modified` must have content that includes a `#### Scenario:` heading. This is how the standard schema enforces that verification scenarios are included when specs change.

### `required: false` for warnings

When `required: false`, the absence of a matching node produces a warning rather than blocking validation:

```yaml
validations:
  - id: has-spec-dependencies
    selector:
      type: section
      matches: '^Spec Dependencies$'
    required: false
```

Use this for recommended but not mandatory structure.

---

## Metadata extraction configuration

`metadataExtraction` is a top-level field in `schema.yaml` that wires extractors to named metadata categories. SpecD uses these declarations to pull structured information from artifact files — for context compilation, impact analysis, and tooling.

The configuration is keyed by category name:

**Scalar categories** (single extractor entry):

| Category      | Description                                           |
| ------------- | ----------------------------------------------------- |
| `title`       | The spec title, typically the H1 heading.             |
| `description` | A prose description, typically the Purpose section.   |
| `dependsOn`   | Dependency spec paths extracted from link references. |
| `keywords`    | Keyword terms.                                        |

**Array categories** (one or more extractor entries):

| Category      | Description                                           |
| ------------- | ----------------------------------------------------- |
| `rules`       | Structured rule groups extracted from the spec.       |
| `constraints` | Constraint strings.                                   |
| `scenarios`   | Structured scenario objects from the verify artifact. |
| `context`     | Always-included context content.                      |

Each entry has three fields:

| Field       | Required | Description                                                                                |
| ----------- | -------- | ------------------------------------------------------------------------------------------ |
| `id`        | no       | Identifier for this entry. Used by `schemaOverrides` to target the entry for modification. |
| `artifact`  | yes      | The artifact type ID to extract from (e.g. `'specs'`, `'verify'`).                         |
| `extractor` | yes      | The extraction configuration — a `selector` plus post-processing fields.                   |

### Complete example: the standard schema's `metadataExtraction`

This is the full `metadataExtraction` configuration from `schema-std`, with explanations:

```yaml
metadataExtraction:
  # Pull the spec title from the H1 heading — label only, no content
  title:
    artifact: specs
    extractor:
      selector: { type: section, level: 1 }
      extract: label

  # Pull the spec description from the Purpose section's content
  description:
    artifact: specs
    extractor:
      selector: { type: section, matches: '^Purpose$' }
      extract: content

  # Extract dependency spec paths from Markdown links in Spec Dependencies
  # capture pulls only the link targets, transform normalises them to spec IDs
  dependsOn:
    artifact: specs
    extractor:
      selector: { type: section, matches: '^Spec Dependencies$' }
      extract: content
      capture: '\[.*?\]\(([^)]+)\)'
      transform: resolveSpecPath

  # Extract all Requirement sections, keyed by requirement name
  # strip removes the "Requirement: " prefix from each key
  rules:
    - id: spec-requirements
      artifact: specs
      extractor:
        selector:
          type: section
          matches: '^Requirement:'
          parent: { type: section, matches: '^Requirements$' }
        groupBy: label
        strip: '^Requirement:\s*'
        extract: content

  # Extract bullet points from the Constraints section
  constraints:
    - id: spec-constraints
      artifact: specs
      extractor:
        selector:
          type: list-item
          parent: { type: section, matches: '^Constraints$' }
        extract: label

  # Extract structured scenario objects from the verify artifact
  scenarios:
    - id: verify-scenarios
      artifact: verify
      extractor:
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

  # Always include the Purpose section in compiled context
  context:
    - id: spec-overview
      artifact: specs
      extractor:
        selector: { type: section, matches: '^Purpose$' }
        extract: content
```

---

## Where to go next

- [Schema format reference](../schemas/schema-format.md) — complete technical reference for `schema.yaml`, including `validations`, `deltaValidations`, and `metadataExtraction` field-by-field
- [Validations and delta validations example](../schemas/examples/validations-and-delta-validations.md) — annotated examples showing selector patterns in validation rules
- [Delta files example](../schemas/examples/delta-files.md) — how selectors are used inside delta file entries to target nodes for modification
