# Change Status

## Purpose

Users and agents need a quick way to see where a change stands — its lifecycle state and which artifacts are done, in progress, or missing. `specd change status <name>` reports the current lifecycle state and artifact statuses of a named change.

## Requirements

### Requirement: Command signature

```
specd change status <name> [--format text|json|toon]
```

- `<name>` — required positional; the name of the change to inspect
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Output format

In `text` mode (default), the command prints a structured summary to stdout:

```
change:      <name>
state:       <state>
specs:       <specId>, <specId>, ...
description: <description>            ← only if set

artifacts (DAG):                      ← ASCII tree rendering
  [✓] complete  [ ] missing  [!] drifted  [~] needs review  [?] in-progress

  [~] proposal [scope: change]
  └─ [~] specs [scope: spec]
     ├─ [~] verify [scope: spec]
     │  └─ [~] design [scope: change]
     │     └─ [!] tasks [scope: change] [hasTasks]

blockers:                             ← High-visibility section for errors
  ! <CODE>: <message>
  ...

next action:                          ← Direct recommendation
  target:  <targetStep>
  command: <command>
  reason:  <reason>

lifecycle:
  transitions:  <available1>, <available2>, ...    ← only availableTransitions
  next artifact: <artifactId>                      ← omitted when null
  approvals:     spec=on|off  signoff=on|off
  path:          <changePath>

review:
  required:  yes|no
  route:     designing
  reason:    artifact-drift|artifact-review-required|spec-overlap-conflict
  overlap:                                         ← only when reason is spec-overlap-conflict
    - archived: <name1>, specs: <specId1>, <specId2>
    - archived: <name2>, specs: <specId3>
  affected:
    <artifact-type>:
      - <absolute-path>
      - <absolute-path>

artifacts (details):                  ← Detailed file list
  <type>  <state>
    <file-key>  <file-state>  <filename>
  ...
```

The `description:` line is omitted when no description is set on the change.

The `artifacts (DAG):` section renders an ASCII tree of the artifact dependency hierarchy. Each node MUST include a status symbol from the legend, an explicit `[scope: change]` or `[scope: spec]` label, and an optional `[hasTasks]` label if the artifact has task capability enabled. The legend MUST be printed at the top of the DAG.

The status symbols map to aggregate artifact states:

- `[✓]` -> `complete` or `skipped`
- `[ ]` -> `missing`
- `[!]` -> `drifted-pending-review`
- `[~]` -> `pending-review` or `pending-parent-artifact-review`
- `[?]` -> `in-progress`

The `blockers:` section is a high-visibility list of the `blockers` array returned by `GetStatus`. It lists every blocker code and its descriptive message. This section is omitted when there are no blockers.

The `next action:` section presents the `nextAction` object from `GetStatus`. The `command:` line uses formatting that highlights the command for easy copy-pasting. This section is always present.

The `lifecycle:` section is always present. The `transitions:` line shows only `availableTransitions` (transitions that would succeed now). It is omitted when the list is empty. The `next artifact:` line is omitted when `nextArtifact` is `null`.

The `review:` section is omitted when `review.required` is `false`. When present, it summarizes why the change must return through design review. Within that section, affected files are rendered using their absolute paths so an operator or agent can jump directly to the file that needs review. If supplemental `key` data is present, it is secondary and must not replace the path-first rendering.

When `review.reason` is `'spec-overlap-conflict'`, the review section additionally shows an `overlap:` subsection listing each unhandled overlap entry as a bullet with the archived change name and overlapping spec IDs. This subsection is omitted for all other reasons. Multiple entries (from multiple archived changes) are listed newest-first.

The `artifacts (details):` section provides the granular file-level statuses. Each artifact line shows the artifact type ID and its persisted aggregate `state`. Under each artifact, the command prints every tracked file with its file key, persisted file `state`, and relative filename. Artifacts are listed in schema-declared order, with file rows in artifact order.

In `json` or `toon` mode, the output is:

```json
{
  "name": "...",
  "state": "...",
  "specIds": ["..."],
  "schema": { "name": "...", "version": 1 },
  "description": "...",
  "blockers": [{ "code": "...", "message": "..." }],
  "nextAction": {
    "targetStep": "...",
    "actionType": "...",
    "reason": "...",
    "command": "..."
  },
  "artifactDag": [
    {
      "id": "...",
      "scope": "change|spec",
      "hasTasks": true,
      "state": "...",
      "requires": ["..."],
      "children": ["..."]
    }
  ],
  "artifacts": [
    {
      "type": "...",
      "state": "pending-review",
      "effectiveStatus": "pending-review",
      "files": [
        {
          "key": "...",
          "filename": "...",
          "state": "drifted-pending-review"
        }
      ]
    }
  ],
  "review": {
    "required": true,
    "route": "designing",
    "reason": "artifact-drift|artifact-review-required|spec-overlap-conflict",
    "overlapDetail": [],
    "affectedArtifacts": [
      {
        "type": "specs",
        "files": [
          {
            "key": "core:core/change",
            "filename": "deltas/core/core/change/spec.md.delta.yaml",
            "path": "/abs/path/.specd/changes/<change>/deltas/core/core/change/spec.md.delta.yaml"
          }
        ]
      }
    ]
  },
  "lifecycle": {
    "validTransitions": ["..."],
    "availableTransitions": ["..."],
    "blockers": [{ "transition": "...", "reason": "requires", "blocking": ["..."] }],
    "approvals": { "spec": false, "signoff": false },
    "nextArtifact": "...",
    "changePath": "...",
    "schemaInfo": { "name": "...", "version": 1 }
  }
}
```

`description` is omitted from the JSON object when not set. The `lifecycle` object is always present. `nextArtifact` is `null` (not omitted) when all artifacts are done.

`overlapDetail` is always present in the JSON `review` object:

- When `review.reason` is `'spec-overlap-conflict'`: an array of `{ archivedChangeName, overlappingSpecIds }` entries ordered newest-first
- For all other reasons: an empty array `[]`

### Requirement: Schema version warning

If the change's recorded `schemaName`/`schemaVersion` differs from the currently active schema, the command prints a warning to stderr:

```
warning: change was created with schema <recorded> but active schema is <current>
```

The command still exits with code 0.

The CLI command MUST NOT resolve the schema independently. It SHALL compare `change.schemaName`/`change.schemaVersion` against `lifecycle.schemaInfo` from the `GetStatusResult`. If `lifecycle.schemaInfo` is `null` (schema resolution failed), the warning is skipped.

### Requirement: Change not found

If no change with the given name exists, the command exits with code 1 and prints an `error:` message to stderr.

### Requirement: Schema-derived fields

When the change uses any schema (not just schema-std), the JSON output MUST include a nested schema object with derived fields:

```
schema:
  name: "..."
  version: 1
  artifactDag:
    - id: "..."
      scope: "change|spec"
      optional: true|false
      requires: ["..."]
      hasTasks: true|false
      output: "..."
```

`artifactDag` is derived from the schema's `artifacts` array.
`hasTasks` is true when the artifact has `hasTasks: true` explicitly or has a `taskCompletionCheck` declaration.
This allows design/implement skills to replace `schema show` calls.

## Constraints

- The output includes all artifacts declared by the schema, not only those present on disk
- `effectiveStatus` reflects dependency cascading — an artifact may be `in-progress` because a dependency is incomplete even if its own hash matches
- The CLI command is a pure serializer — all lifecycle computation is performed by the `GetStatus` use case in `@specd/core`
- The CLI command MUST NOT call `SchemaRegistry`, `config show`, or any other use case to compute lifecycle data — it serializes what `GetStatus` returns

## Examples

```
$ specd change status add-oauth-login
change:      add-oauth-login
state:       designing
specs:       auth/oauth
description: Add OAuth2 login via Google

artifacts:
  proposal   complete
  specs      in-progress
  verify     missing
  design     missing
  tasks      missing

lifecycle:
  next artifact: specs
  approvals:     spec=off  signoff=off
  path:          .specd/changes/20260310-140000-add-oauth-login

blockers:
  → ready: requires — specs, verify, design, tasks
```

## Spec Dependencies

- [`cli:cli/entrypoint`](../entrypoint/spec.md) — CLI config discovery, exit codes, and output conventions
- [`core:core/change`](../../core/change/spec.md) — change and artifact state model
- [`core:core/get-status`](../../core/get-status/spec.md) — status payload returned by core
