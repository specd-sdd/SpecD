# Delta Format

## Purpose

Inline text diffs are fragile and format-unaware, making them unreliable for modifying structured artifacts like specs, configs, and schemas. Delta files solve this by expressing changes as a sequence of structured AST operations in separate YAML documents that address artifact nodes by type and identifying property. The `ArtifactParser` port abstracts parsing, delta application, and serialisation across all supported file types — markdown, JSON, YAML, and plain text.

## Requirements

### Requirement: ArtifactParser port

`ArtifactParser` is the domain port that abstracts all file-type-specific operations. Each supported file type has a corresponding infrastructure adapter implementing this port. The port is injected at the application layer — domain services never reference concrete parsers directly.

The port interface:

```typescript
interface NodeTypeDescriptor {
  type: string // e.g. "section", "property", "pair"
  identifiedBy: string[] // selector properties that identify a node, always ["matches"]
  description: string // human-readable description for LLM context generation
}

interface OutlineEntry {
  type: string
  label: string // identifying value, e.g. heading text or key name
  depth: number // nesting depth (0 = root children)
  children?: OutlineEntry[]
}

interface ArtifactParser {
  readonly fileExtensions: string[] // e.g. ['.md'] or ['.json']
  parse(content: string): ArtifactAST
  apply(ast: ArtifactAST, delta: DeltaEntry[]): ArtifactAST
  serialize(ast: ArtifactAST): string
  renderSubtree(node: ArtifactNode): string
  nodeTypes(): NodeTypeDescriptor[]
  outline(ast: ArtifactAST): OutlineEntry[]
  deltaInstructions(): string
  parseDelta(content: string): DeltaEntry[]
}
```

`nodeTypes()` returns a static description of all addressable node types for this file format. `CompileContext` calls `nodeTypes()` to inject a concise vocabulary into the LLM's context when generating a delta, so the LLM knows what node types and selector properties are valid for the target artifact.

`outline(ast)` returns a simplified, navigable summary of the artifact's addressable nodes — headings, keys, scenario titles, etc. — without full content.

Default mode uses compact parser subsets:

- markdown: `section`
- json: `property`, `array-item`
- yaml: `pair`
- plaintext: `paragraph`

Full selector-addressable coverage is available through full-detail retrieval mode.

When clients request hint metadata, hints are returned as a root-level type-keyed object with placeholders (for example `matches: "<value>"`, `contains: "<contains>"`, `level: "<level>"`) and are not duplicated in each outline node.

`deltaInstructions()` returns a format-specific, static text block that `CompileContext` injects verbatim into the LLM instruction when `delta: true` is active for the artifact. Each adapter implements this method to explain its selector vocabulary, the semantics of `content` vs `value` for that format, and a concrete example mapping an AST node to a delta entry. This separates format-level technical guidance (owned by the adapter) from domain-level guidance (owned by the schema's `deltaInstruction` field).

`renderSubtree(node)` serializes a single AST node and all its descendants back to the artifact's native format string. It is used by `ValidateArtifacts` (to evaluate `contentMatches` against a node's serialized subtree) and by the metadata extraction engine (to extract spec content via `metadataExtraction` when metadata is absent or stale, using `extract: 'content'` or `extract: 'both'`). The output is identical to calling `serialize` on a minimal AST containing only this node — the adapter is free to implement it that way or via a dedicated code path.

`parseDelta(content)` parses a YAML delta file's raw string content into a typed array of `DeltaEntry[]`. It is called by `ValidateArtifacts` and `ArchiveChange` on the YAML adapter to convert the raw delta file into entries before passing them to `apply()`. Only the YAML adapter is expected to return a non-empty result — other adapters may return an empty array. This method separates the concern of YAML deserialization from AST application so that callers do not need to depend on a YAML library directly.

`apply(ast, delta)` is the single entry point for all delta application. It resolves all selectors against the AST before applying any operation — if any selector fails to resolve (no match or ambiguous match), the entire application is rejected with a `DeltaApplicationError`.

`serialize(ast)` converts the AST back to a string representation. For YAML files, the serialiser must use a library that preserves comments and formatting (CST-level round-trip); for JSON files, formatting is normalised to two-space indentation.

### Requirement: Selector model

The selector model is defined in [`specs/core/selector-model/spec.md`](../selector-model/spec.md). Selectors are used in delta entries to target nodes for modification or removal, and in `position.after`/`position.before` hints for positioned insertion.

In the context of delta application, the following additional constraints apply to the selector model:

- When a `selector` in a `modified` or `removed` entry matches zero nodes — `apply` rejects with `DeltaApplicationError`.
- When a `selector` in a `modified` or `removed` entry matches more than one node — `apply` rejects with `DeltaApplicationError`.
- `position.after` and `position.before` selectors in `added` entries are warnings on no match, not errors — insertion falls back to the end of the parent scope.

**Array merge strategies:**

Delta entries targeting an array or sequence node (not an individual item) accept an optional `strategy` field:

- `replace` (default) — replaces the array value in its entirety with the supplied `value`
- `append` — appends the supplied `value` items to the end of the existing array
- `merge-by` — merges the supplied items into the existing array by matching objects on a key field; requires `mergeKey` to name the key field; items with a matching key are replaced, items with new keys are appended, existing items whose key does not appear in the supplied value are preserved

### Requirement: Delta file format

A delta file is a YAML document containing an array of delta entry objects. Its filename is `<artifact-output-filename>.delta.yaml` — e.g. `spec.md.delta.yaml`, `package.json.delta.yaml`. The system infers the target artifact from the filename prefix.

Delta files are located at `deltas/<workspace>/<capability-path>/<filename>.delta.yaml` within the change directory — e.g. `deltas/default/core/config/spec.md.delta.yaml`. This separates them from newly created artifacts, which live under `specs/<workspace>/<capability-path>/`. Delta files are never synced to permanent spec directories.

Each delta entry must include:

- `op` (string, required) — one of `added`, `modified`, `removed`, `no-op`
- `selector` (selector, required for `modified` and `removed`, not valid for `added` or `no-op`) — identifies the existing node to modify or remove; for `added` entries, use `position.parent` to scope the insertion; see Requirement: Selector model
- `position` (object, optional, `added` only) — declares where the new node is inserted. Contains:
  - `parent` (selector, optional) — scopes the insertion to the children of the matched node; if omitted, insertion happens at document root level
  - `after` (selector, optional) — inserts immediately after the matched sibling within the parent scope; if the selector resolves to no node, falls back to appending at the end of the parent scope with a warning
  - `before` (selector, optional) — inserts immediately before the matched sibling within the parent scope; if the selector resolves to no node, falls back to appending at the end of the parent scope with a warning
  - `first` (boolean, optional) — inserts as the first child of the parent scope (or document root if no `parent`); mutually exclusive with `after`, `before`, and `last`
  - `last` (boolean, optional) — inserts as the last child of the parent scope (or document root if no `parent`); mutually exclusive with `after`, `before`, and `first`; this is the default when no placement hint is given
  - `after`, `before`, `first`, and `last` are mutually exclusive
  - If only `parent` is specified (no placement hint), the new node is appended as the last child of the matched parent
  - If `position` is omitted entirely, the new node is appended at the end of the document
- `rename` (string, optional, `modified` only) — new value for the node's identifying property (e.g. new heading text for a `section`, new key for a `property` or `pair`); the selector still uses the current name to locate the node; if the rename target already exists as a sibling node, `apply` must reject with `DeltaApplicationError`
- `content` (string, optional) — the full new node content in the artifact's native format (e.g. markdown for `.md` files); for `added`, includes the identifying line (e.g. `### Heading` for markdown, key name for YAML/JSON) as the first line; for `modified`, contains only the body — the identifying line is preserved or replaced via `rename`; `apply` parses this string using `ArtifactParser.parse()` before inserting into the AST; mutually exclusive with `value`; not valid for `no-op`
- `value` (any, optional) — the node's value as a structured YAML value; used for structured nodes (e.g. JSON properties, YAML pairs); mutually exclusive with `content`; not valid for `no-op`
- `strategy` (`replace` | `append` | `merge-by`, optional, default `replace`) — array merge strategy; only valid when the selector targets an array or sequence node; see Requirement: Selector model; not valid for `no-op`
- `mergeKey` (string, optional) — key field for `merge-by` strategy; required when `strategy: merge-by`; not valid for `no-op`
- `description` (string, optional) — free-text description of what this delta entry does or why; ignored during application; valid on all operation types

**`no-op` operation:**

`no-op` explicitly declares that the artifact requires no changes for this spec. It is used when a change touches a spec but a particular artifact (e.g. `verify.md`) does not need updates — the existing content is already valid. The `no-op` entry MUST be the only entry in the delta array. If a `no-op` entry coexists with any other entry, `parseDelta` MUST throw a `SchemaValidationError` explaining that `no-op` cannot be mixed with other operations. A `no-op` entry MUST NOT contain `selector`, `position`, `rename`, `content`, `value`, `strategy`, or `mergeKey` — only `op` and optionally `description` are valid.

Example (`spec.md.delta.yaml`):

```yaml
# Modify body only
- op: modified
  selector:
    type: section
    matches: 'Requirement: Load config'
  content: |
    The system must load specd.yaml from the nearest ancestor directory...

# Rename and modify body in one operation
- op: modified
  selector:
    type: section
    matches: 'Requirement: Cache'
  rename: 'Requirement: Cache config'
  content: |
    The system must cache the resolved config in memory...

# Add new node inside "Requirements" after a specific sibling
- op: added
  position:
    parent:
      type: section
      matches: 'Requirements'
    after:
      type: section
      matches: 'Requirement: Validate config'
  content: |
    ### Requirement: Evict cache on change

    The system must evict the cache when specd.yaml changes.

- op: removed
  selector:
    type: section
    matches: 'Requirement: Old behaviour'
```

Example (`package.json.delta.yaml`):

```yaml
- op: modified
  selector:
    type: property
    matches: version
  value: '2.0.0'

- op: modified
  selector:
    type: property
    matches: keywords
  strategy: append
  value:
    - 'specd'
```

Example with `parent` and `where`:

```yaml
# Modify a nested YAML property
- op: modified
  selector:
    type: pair
    matches: model
    parent:
      type: pair
      matches: llm
  value: 'claude-opus-4-6'

# Modify a specific item in an array of objects
- op: modified
  selector:
    type: sequence-item
    parent:
      type: pair
      matches: steps
    where:
      name: 'Run tests'
  value:
    name: 'Run tests'
    run: 'pnpm test --coverage'
```

Example (`verify.md.delta.yaml` — no-op):

```yaml
# Existing verify scenarios remain valid — no changes needed
- op: no-op
  description: 'Constructor signature changed but all existing scenarios still apply'
```

### Requirement: Delta application

Delta entries are applied in declaration order after all selectors are validated. For each entry:

- `modified`: replace the targeted node body (`content`) and/or rename the identifying field (`rename`)
- `removed`: remove the targeted node
- `added`: insert new node(s) according to `position` semantics
  `apply` first resolves selectors against the original AST to guarantee atomicity. If any selector is invalid or ambiguous, `apply` fails with `DeltaApplicationError` and applies nothing.

`no-op` entries are never passed to `apply` — they are handled entirely by the caller (e.g. `ValidateArtifacts`). When the caller detects that all parsed delta entries are `no-op`, it MUST skip loading the base artifact, skip calling `apply`, skip `deltaValidations`, and skip structural `validations`. The caller proceeds directly to hash computation on the raw delta file content and calls `markComplete`. The `no-op` operation declares that the existing artifact content is already valid — there is nothing to parse, apply, or validate.

During `modified` operations on markdown artifacts, replacing node body content must not destroy inline formatting metadata for unaffected sibling/ancestor nodes. Implementations must preserve representable inline structure so serialization does not strip backticks or rewrite emphasis/strong markers in untouched nodes.

For markdown serialization after delta apply, list/emphasis/strong marker output should track source style when unambiguous. If the source is mixed/ambiguous for a construct, the serializer must choose deterministic project markdown conventions.

### Requirement: Delta conflict detection

`apply` must detect and reject conflicting delta entries before applying any changes:

- Two `modified` or `removed` operations whose selectors resolve to the same node — error
- A `rename` target that matches an existing sibling node's identifying property — error
- A `rename` target that matches another `modified` entry's `rename` value within the same parent scope — error
- An `added` entry with more than one of `position.after`, `position.before`, `position.first`, `position.last` — error
- An `added` entry with `position.parent` that resolves to no node — error
- `content` and `value` both present in the same entry — error
- `selector` on an `added` or `no-op` entry — error; use `position.parent` to scope insertion for `added`
- `rename` on an `added`, `removed`, or `no-op` entry — error
- `strategy: merge-by` without `mergeKey` — error
- `mergeKey` present without `strategy: merge-by` — error
- `strategy` on an entry whose selector targets a non-array node — error
- `position` on a `no-op` entry — error
- `content` or `value` on a `no-op` entry — error
- `strategy` or `mergeKey` on a `no-op` entry — error

### Requirement: Delta structural validation

The `deltaValidations` field on a schema artifact allows schema authors to define JSONPath-based structural constraints checked against the normalized YAML AST of the delta file before application. The delta file is parsed by the YAML adapter to produce a normalized AST; `ValidateArtifacts` then evaluates each rule's `selector` JSONPath expression against that AST — the same mechanism used for `validations` against the artifact AST. The full rule format is specified in [`specs/core/schema-format/spec.md` — Requirement: Delta validation rules](../schema-format/spec.md).

## Examples

### Example: Markdown spec — modify, add, and remove requirements

**Before (`spec.md`):**

```markdown
# Auth

## Requirements

### Requirement: Login

The system SHALL authenticate users with email and password.

### Requirement: Logout

The system SHALL invalidate the session on logout.

### Requirement: Remember me

The system SHALL keep the session alive for 30 days when the user opts in.
```

**Delta (`spec.md.delta.yaml`):**

```yaml
# Modify body only — identifier stays as-is
- op: modified
  selector:
    type: section
    matches: 'Requirement: Login'
  content: |
    The system SHALL authenticate users with email and password.
    Failed attempts SHALL be rate-limited to 5 per minute per IP.

# Add new section inside Requirements, after Logout
- op: added
  position:
    parent:
      type: section
      matches: 'Requirements'
    after:
      type: section
      matches: 'Requirement: Logout'
  content: |
    ### Requirement: Password reset

    The system SHALL allow users to reset their password via a time-limited email link.

- op: removed
  selector:
    type: section
    matches: 'Requirement: Remember me'
```

**After (`spec.md`):**

```markdown
# Auth

## Requirements

### Requirement: Login

The system SHALL authenticate users with email and password.
Failed attempts SHALL be rate-limited to 5 per minute per IP.

### Requirement: Logout

The system SHALL invalidate the session on logout.

### Requirement: Password reset

The system SHALL allow users to reset their password via a time-limited email link.
```

The `position.after` hint resolved successfully — "Password reset" appears immediately after "Logout" inside `Requirements`.

---

### Example: Markdown spec — rename a requirement

```yaml
- op: modified
  selector:
    type: section
    matches: 'Requirement: Login'
  rename: 'Requirement: Authentication'
  content: |
    The system SHALL authenticate users with email and password.
    Failed attempts SHALL be rate-limited to 5 per minute per IP.
```

Result: the section heading becomes `### Requirement: Authentication` and its body is updated. If a sibling section with identifier `"Requirement: Authentication"` already exists, `apply` rejects with `DeltaApplicationError` before applying any change.

---

### Example: Markdown spec — add a Scenario to an existing Requirement

To append a Scenario to an existing Requirement without replacing its body, use `op: added` with `position.parent` targeting the Requirement section. The `content` contains only the new Scenario — existing body content is untouched.

**Before (`spec.md`):**

```markdown
## Requirements

### Requirement: Login

The system SHALL authenticate users with email and password.
Failed attempts SHALL be rate-limited to 5 per minute per IP.
```

**Delta (`spec.md.delta.yaml`):**

```yaml
- op: added
  position:
    parent:
      type: section
      matches: 'Requirement: Login'
  content: |
    #### Scenario: Rate limit reached

    - **GIVEN** a user has already failed 5 login attempts in the last minute
    - **WHEN** they submit their credentials again
    - **THEN** the system rejects the attempt without checking credentials
```

**After (`spec.md`):**

```markdown
## Requirements

### Requirement: Login

The system SHALL authenticate users with email and password.
Failed attempts SHALL be rate-limited to 5 per minute per IP.

#### Scenario: Rate limit reached

- **GIVEN** a user has already failed 5 login attempts in the last minute
- **WHEN** they submit their credentials again
- **THEN** the system rejects the attempt without checking credentials
```

Using `op: modified` + `content` here would replace the entire body of `Requirement: Login`, discarding the existing prose. `op: added` with `position.parent` appends the new Scenario section as the last child of the Requirement, leaving everything else intact.

---

### Example: Markdown spec — after fallback when referenced node is gone

Same change, but this time "Logout" was removed by another delta earlier in the change. The `after` selector resolves to no node, so the system emits a warning and falls back to appending at the end.

**Before (`spec.md`) — "Logout" already removed:**

```markdown
# Auth

## Requirements

### Requirement: Login

The system SHALL authenticate users with email and password.
Failed attempts SHALL be rate-limited to 5 per minute per IP.

### Requirement: Remember me

The system SHALL keep the session alive for 30 days when the user opts in.
```

**Delta (`spec.md.delta.yaml`) — same delta as before:**

```yaml
- op: added
  position:
    parent:
      type: section
      matches: 'Requirements'
    after:
      type: section
      matches: 'Requirement: Logout' # no longer exists
  content: |
    ### Requirement: Password reset

    The system SHALL allow users to reset their password via a time-limited email link.
```

**After (`spec.md`) — fallback to end of parent, warning emitted:**

```markdown
# Auth

## Requirements

### Requirement: Login

The system SHALL authenticate users with email and password.
Failed attempts SHALL be rate-limited to 5 per minute per IP.

### Requirement: Remember me

The system SHALL keep the session alive for 30 days when the user opts in.

### Requirement: Password reset

The system SHALL allow users to reset their password via a time-limited email link.
```

> ⚠ Warning: `position.after` selector `{ type: section, matches: "Requirement: Logout" }` resolved to no node — node appended at end of parent scope (`Requirements`).

---

### Example: JSON — bump version and append a keyword

**Before (`package.json`):**

```json
{
  "name": "@specd/core",
  "version": "0.1.0",
  "keywords": ["specd", "spec-driven"]
}
```

**Delta (`package.json.delta.yaml`):**

```yaml
- op: modified
  selector:
    type: property
    matches: version
  value: '0.2.0'

- op: modified
  selector:
    type: property
    matches: keywords
  strategy: append
  value:
    - 'artifacts'
```

**After (`package.json`):**

```json
{
  "name": "@specd/core",
  "version": "0.2.0",
  "keywords": ["specd", "spec-driven", "artifacts"]
}
```

---

### Example: YAML — modify a nested value and update an array item by key

**Before (`specd.yaml`):**

```yaml
schema: spec-driven

llm:
  model: claude-sonnet-4-6
  maxTokens: 4096

workflow:
  - step: implementing
    hooks:
      pre:
        - run: pnpm lint
```

**Delta (`specd.yaml.delta.yaml`):**

```yaml
- op: modified
  selector:
    type: pair
    matches: model
    parent:
      type: pair
      matches: llm
  value: 'claude-opus-4-6'

- op: modified
  selector:
    type: sequence-item
    parent:
      type: pair
      matches: workflow
    where:
      step: implementing
  value:
    step: implementing
    hooks:
      pre:
        - run: pnpm lint
        - run: pnpm test
```

**After (`specd.yaml`):**

```yaml
schema: spec-driven

llm:
  model: claude-opus-4-6 # comment preserved
  maxTokens: 4096

workflow:
  - step: implementing
    hooks:
      pre:
        - run: pnpm lint
        - run: pnpm test
```

## Constraints

- `selector.index` and `selector.where` are mutually exclusive
- `position.after`, `position.before`, `position.first`, and `position.last` are mutually exclusive in an `added` entry
- `rename` is only valid on `modified` entries; using it on `added`, `removed`, or `no-op` is an error
- A `rename` value that collides with an existing sibling node or another `rename` in the same scope is a hard error checked during validation before any operation is applied
- Unresolved `after`/`before` selectors are warnings, not errors — the node is appended at the end of the parent scope; unresolved `selector` in `modified`/`removed` is always a hard error
- For `modified`, `content` is the node body only — the identifying line (heading, key name) is excluded and preserved or replaced via `rename`; for `added`, `content` must start with the identifying line (e.g. `### Heading` for markdown sections) followed by the body
- `delta.content` and `delta.value` are mutually exclusive
- `strategy: merge-by` requires `mergeKey`; `mergeKey` is invalid without `strategy: merge-by`
- `strategy` is only valid on entries whose selector targets an array or sequence node
- Delta files live at `deltas/<workspace>/<capability-path>/<filename>.delta.yaml` within the change directory and are never synced to permanent spec directories
- A `DeltaApplicationError` on any entry must abort the entire delta — no partial application
- Declaration order in the delta file is the execution order; no reordering is performed
- A `no-op` entry MUST be the sole entry in the delta array — `parseDelta` rejects mixed arrays with a `SchemaValidationError`
- A `no-op` entry accepts only `op` and `description`; all other fields (`selector`, `position`, `rename`, `content`, `value`, `strategy`, `mergeKey`) are invalid on `no-op`
- `description` is valid on all operation types and is ignored during application

## Spec Dependencies

- [`core:core/artifact-ast`](../artifact-ast/spec.md) — normalized AST format produced and consumed by all adapters; defines node types, `label`/`value` semantics, and round-trip contract
- [`core:core/selector-model`](../selector-model/spec.md) — selector fields, node type vocabulary, and multi/no-match semantics
- [`core:core/schema-format`](../schema-format/spec.md) — schema artifact configuration including `deltaValidations` rules for structural validation of delta files
