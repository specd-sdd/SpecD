# Example: Delta files

## What a delta file is

A delta file is a YAML document that expresses changes to an existing spec as a sequence of AST operations. Instead of replacing the entire spec file, the agent produces a `.delta.yaml` that says precisely which sections to add, modify, or remove. SpecD applies the delta deterministically — no LLM is involved in the application step.

Delta files are only produced when `delta: true` is declared on an artifact in the schema. They are only valid for `scope: spec` artifacts.

## File naming and location

A delta file's filename is the target artifact's filename with `.delta.yaml` appended:

| Target artifact | Delta filename            |
| --------------- | ------------------------- |
| `spec.md`       | `spec.md.delta.yaml`      |
| `verify.md`     | `verify.md.delta.yaml`    |
| `openapi.json`  | `openapi.json.delta.yaml` |
| `config.yaml`   | `config.yaml.delta.yaml`  |

Delta files live inside the change directory at:

```
deltas/<workspace>/<spec-path>/<delta-filename>
```

For example, a delta targeting `specs/core/config/spec.md` in the `default` workspace lives at:

```
.specd/changes/<change-name>/deltas/default/core/config/spec.md.delta.yaml
```

Delta files are never synced to permanent spec directories — they remain in the change directory as part of its record.

## Delta entry structure

A delta file is a YAML sequence. Each entry is one delta operation.

| Field         | Required for                   | Description                                                                                                                                               |
| ------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `op`          | all                            | Operation type: `added`, `modified`, `removed`, or `no-op`.                                                                                               |
| `selector`    | `modified`, `removed`          | Identifies the existing node to target. Not valid on `added` or `no-op`.                                                                                  |
| `position`    | `added` (optional)             | Where to insert the new node. See [Position](#position). Not valid on `no-op`.                                                                            |
| `rename`      | `modified` (optional)          | New label for the node's identifying property (heading text, key name). Only valid on `modified`.                                                         |
| `content`     | `added`, `modified` (optional) | New node content in the artifact's native format. Mutually exclusive with `value`. Not valid on `no-op`.                                                  |
| `value`       | `added`, `modified` (optional) | Node value as a structured YAML value. For JSON/YAML structured nodes. Mutually exclusive with `content`. Not valid on `no-op`.                           |
| `strategy`    | optional                       | Array merge strategy: `replace` (default), `append`, or `merge-by`. Only valid when the selector targets an array or sequence node. Not valid on `no-op`. |
| `mergeKey`    | required with `merge-by`       | Key field used to match objects in `merge-by` strategy. Not valid on `no-op`.                                                                             |
| `description` | optional on all                | Free-text explanation of what this entry does or why. Ignored during application. Valid on all operation types including `no-op`.                         |

## The four operations

### modified — change an existing node

`modified` updates the body of an existing node identified by `selector`. The node's identifying property (its heading, key name) is preserved unless `rename` is also specified.

`content` contains only the body — the identifying line is not repeated. SpecD parses it and replaces the node's existing body.

```yaml
# Change the body of an existing requirement section
- op: modified
  selector:
    type: section
    matches: 'Requirement: Load config'
  content: |
    The system must load specd.yaml from the nearest ancestor directory
    that contains the file, stopping at the git repo root.

# Rename the section and update its body in one operation
- op: modified
  selector:
    type: section
    matches: 'Requirement: Cache'
  rename: 'Requirement: Cache resolved config'
  content: |
    The system must cache the resolved config object in memory for the
    duration of a single command invocation.

# Update a JSON property value
- op: modified
  selector:
    type: property
    matches: version
  value: '2.0.0'

# Update a YAML pair value
- op: modified
  selector:
    type: pair
    matches: model
    parent:
      type: pair
      matches: llm
  value: 'claude-opus-4-6'
```

### removed — delete an existing node

`removed` detaches the identified node and all its children from the document. It takes only a `selector` — no `content` or `value`.

```yaml
# Remove a section that is no longer relevant
- op: removed
  selector:
    type: section
    matches: 'Requirement: Legacy auth'

# Remove a JSON property
- op: removed
  selector:
    type: property
    matches: deprecated_field

# Remove a YAML pair
- op: removed
  selector:
    type: pair
    matches: old_setting
```

### added — insert a new node

`added` inserts a new node into the document. It does not take a `selector` — the node being added does not yet exist. Use `position` to control where it is inserted.

For text-based formats (markdown, plain text), `content` includes the identifying line as its first line — the heading, for a section.

````yaml
# Append a new requirement to the end of the Requirements section (default position)
- op: added
  position:
    parent:
      type: section
      matches: '^Requirements$'
  content: |
    ### Requirement: Evict cache on change

    The system must evict the in-memory config cache when specd.yaml
    is modified on disk.

# Insert after a specific sibling
- op: added
  position:
    parent:
      type: section
      matches: '^Requirements$'
    after:
      type: section
      matches: 'Requirement: Load config'
  content: |
    ### Requirement: Validate on load

    The system must validate specd.yaml against its schema immediately
    after loading and before executing any command.

# Insert before a specific sibling
- op: added
  position:
    parent:
      type: section
      matches: '^Requirements$'
    before:
      type: section
      matches: 'Requirement: Evict cache on change'
  content: |
    ### Requirement: Cache TTL

    The cache must expire after 60 seconds to pick up external edits.

# Insert as the first child of the parent
- op: added
  position:
    parent:
      type: section
      matches: '^Requirements$'
    first: true
  content: |
    ### Requirement: Discover config file

    The system must discover specd.yaml by walking up from the CWD.

# Append at document root level (no parent — appended to end of document)
- op: added
  content: |
    ## Examples

    ### Example: Minimal config

    ```yaml
    schema: '@specd/schema-std'
    ```
````

### no-op — explicitly document that no change is needed

`no-op` declares that the artifact requires no changes for this delta. It is used when a spec is listed in the proposal but a particular artifact does not need modifications — the existing content is already valid.

Rather than omitting the delta file (which is ambiguous — was it forgotten or intentionally skipped?), write a `no-op` entry with a `description` explaining why no change is needed.

A `no-op` entry must be the **only** entry in the delta file. Mixing `no-op` with any other operation is an error — SpecD rejects such a file during parsing.

The only valid fields on a `no-op` entry are `op` and `description`. All other fields (`selector`, `position`, `rename`, `content`, `value`, `strategy`, `mergeKey`) are invalid.

When SpecD encounters a `no-op` delta, it skips delta application, delta validations, and structural validations entirely. It proceeds directly to hash computation on the raw delta file content and marks the artifact complete. The `no-op` declares that the existing artifact is already correct.

```yaml
# verify.md does not need changes — existing scenarios remain valid
- op: no-op
  description: 'Constructor signature changed but all existing verify scenarios still apply.'
```

```yaml
# spec.md requires no changes — only design.md and tasks.md are updated in this change
- op: no-op
  description: 'No spec changes needed. This change only updates the implementation plan.'
```

## Description field

Every delta entry, regardless of operation type, accepts an optional `description` field. Use it to record the intent behind the operation — why this node is being changed, what the business reason is, or what downstream effect is expected. The description is ignored during delta application; it exists purely for human and AI readers.

```yaml
- op: modified
  selector:
    type: section
    matches: 'Requirement: Load config'
  description: 'Tightened wording to reflect that the walk stops at the git root, not just any ancestor.'
  content: |
    The system must load specd.yaml from the nearest ancestor directory
    that contains the file, stopping at the git repo root.

- op: added
  description: 'New requirement introduced by ADR-0012 — cache invalidation on file change.'
  position:
    parent:
      type: section
      matches: '^Requirements$'
  content: |
    ### Requirement: Evict cache on change

    The system must evict the in-memory config cache when specd.yaml is modified on disk.
```

## Position

`position` controls where an `added` entry inserts its node. All fields are optional — omitting `position` entirely appends the node at the end of the document.

| Field    | Description                                                                                                                                                     |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parent` | Scopes the insertion to the children of the matched node. If omitted, insertion is at document root level.                                                      |
| `after`  | Inserts immediately after the matched sibling within the parent scope. Falls back to appending at the end of scope with a warning if the sibling is not found.  |
| `before` | Inserts immediately before the matched sibling within the parent scope. Falls back to appending at the end of scope with a warning if the sibling is not found. |
| `first`  | Inserts as the first child of the parent scope.                                                                                                                 |
| `last`   | Inserts as the last child of the parent scope. This is the default when `parent` is specified but no placement hint is given.                                   |

`after`, `before`, `first`, and `last` are mutually exclusive. If only `parent` is given, the node is appended as the last child.

## Array merge strategies

When the selector targets an array or sequence node (not an individual item), the `strategy` field controls how the new value is merged:

| Strategy            | Behaviour                                                                                                                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `replace` (default) | Replaces the entire array with the supplied value.                                                                                                                                                                     |
| `append`            | Appends the supplied items to the end of the existing array.                                                                                                                                                           |
| `merge-by`          | Merges the supplied items into the existing array by matching objects on `mergeKey`. Items with a matching key are replaced; items with new keys are appended; existing items not in the supplied value are preserved. |

```yaml
# Replace the entire keywords array
- op: modified
  selector:
    type: property
    matches: keywords
  value:
    - 'specd'
    - 'spec-driven'

# Append new keywords without removing existing ones
- op: modified
  selector:
    type: property
    matches: keywords
  strategy: append
  value:
    - 'schema'

# Merge pipeline steps by the "name" key:
# - replaces existing steps whose name matches
# - appends steps with new names
# - preserves existing steps not in the supplied list
- op: modified
  selector:
    type: pair
    matches: steps
  strategy: merge-by
  mergeKey: name
  value:
    - name: Run tests
      run: 'pnpm test --coverage'
    - name: Lint
      run: 'pnpm lint'
```

## Modifying array items individually

To modify a specific item in an array or sequence, use a selector that targets the item directly rather than the parent array. Use `index` for positional access or `where` for object matching:

```yaml
# Modify the first step in a YAML sequence
- op: modified
  selector:
    type: sequence-item
    parent:
      type: pair
      matches: steps
    index: 0
  value:
    name: Run tests
    run: 'pnpm test --coverage'

# Modify a specific step by matching on its "name" field
- op: modified
  selector:
    type: sequence-item
    parent:
      type: pair
      matches: steps
    where:
      name: 'Run tests'
  value:
    name: Run tests
    run: 'pnpm test --coverage'
```

## Conflict detection

SpecD validates the entire delta for conflicts before applying any operation. If any conflict is found, the whole delta is rejected with a `DeltaApplicationError` and no changes are made to the artifact.

| Conflict                                                                               | Error                                              |
| -------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Two `modified` or `removed` entries resolve to the same node                           | Cannot apply two operations to the same node.      |
| A `rename` target already exists as a sibling                                          | Would produce a duplicate node.                    |
| Two `modified` entries rename to the same target within the same parent scope          | Ambiguous result.                                  |
| `content` and `value` both present in the same entry                                   | Mutually exclusive.                                |
| `selector` on an `added` or `no-op` entry                                              | Use `position.parent` instead for `added`.         |
| `rename` on an `added`, `removed`, or `no-op` entry                                    | Only valid on `modified`.                          |
| `strategy: merge-by` without `mergeKey`                                                | `mergeKey` is required for `merge-by`.             |
| `mergeKey` without `strategy: merge-by`                                                | `mergeKey` is only meaningful with `merge-by`.     |
| `strategy` on a non-array selector                                                     | Strategy is only valid for array/sequence targets. |
| More than one of `after`, `before`, `first`, `last` in the same `position`             | Mutually exclusive placement hints.                |
| `position.parent` resolves to no node                                                  | SpecD cannot scope the insertion.                  |
| `no-op` entry combined with any other entry in the same delta file                     | `no-op` must be the sole entry.                    |
| `position`, `rename`, `content`, `value`, `strategy`, or `mergeKey` on a `no-op` entry | Only `op` and `description` are valid on `no-op`.  |

## Complete delta file example

A realistic delta for a spec that is gaining a new requirement, updating an existing one, and removing an obsolete one:

```yaml
# spec.md.delta.yaml
# Change: add caching requirement, update discovery requirement, remove legacy entry

# Update the existing discovery requirement with tighter wording
- op: modified
  description: 'Clarified that the walk stops at the git root boundary — not just any ancestor.'
  selector:
    type: section
    matches: 'Requirement: Discover config'
  content: |
    The system must discover specd.yaml by walking up from the current working
    directory, stopping at the first match or at the git repo root, whichever
    comes first. The walk never crosses the repo root boundary.

# Add a new caching requirement after the discovery requirement
- op: added
  description: 'New requirement from ADR-0012: cache must be process-scoped only.'
  position:
    parent:
      type: section
      matches: '^Requirements$'
    after:
      type: section
      matches: 'Requirement: Discover config'
  content: |
    ### Requirement: Cache resolved config

    The system must cache the resolved config object in memory for the duration
    of a single command invocation. The cache must be invalidated between
    commands — it must not persist across process boundaries.

# Remove the legacy override requirement that is now superseded
- op: removed
  selector:
    type: section
    matches: 'Requirement: Legacy override'
```

Paired no-op delta for the verify file, when its scenarios require no changes:

```yaml
# verify.md.delta.yaml
- op: no-op
  description: 'Existing verification scenarios remain valid for the updated requirements.'
```
