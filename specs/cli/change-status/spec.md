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

In `json` or `toon` mode, the `artifactDag` array MUST include the `hasTasks` field for every entry.

The `state` field in the top-level `artifactDag` MUST reflect the drift-aware display state projection (e.g., `complete-with-drift`) rather than the raw canonical state, ensuring that agents can detect drift without manually comparing hashes.

### Requirement: Task completion display in DAG

When a schema artifact type has `hasTasks: true` and the `GetStatus` result includes `taskCompletion` data for that artifact, the DAG render SHALL replace the static `[hasTasks]` tag with `[hasTasks - N/M done]`, where `N` is the number of complete items and `M` is the total.

The `[hasTasks]` fallback SHALL still appear when the artifact has `hasTasks: true` but no `taskCompletion` data is available (e.g. artifact file does not exist).

The `hasTasks` field in `artifactDag` entries for JSON/toon output MUST remain `true/false` as before.

### Requirement: Display-state rendering

Human-facing status output SHALL render artifact/file display states rather than forcing users to infer drift from raw canonical state plus hashes.

Specifically:

- canonical `complete` plus `hasDrift=true` SHALL render as `complete-with-drift`
- canonical `missing` remains `missing` even if `hasDrift=true`
- canonical review states (`pending-review`, `drifted-pending-review`, `pending-parent-artifact-review`) remain visually stronger than drift-only display projections

JSON/toon output SHALL include both canonical state and display-state fields when returned by GetStatus; text output SHALL prioritize the display state for human readability.

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

### Requirement: Implementation section

When implementation tracking is active for a change, the status display SHALL include an `Implementation` section derived from the `GetStatus` result **ONLY if the `--implementation` flag is provided**.

That section MUST expose:

- tracked implementation files grouped or labeled by review state (`open`, `resolved`, `ignored`)
- confirmed implementation links, showing file-level links and any symbol-level refinements
- stale-link warnings for symbol-level links whose symbol is absent from the graph database

The CLI section is based on the `GetStatus` projection. It MUST NOT recompute implementation tracking state independently, but it MAY enrich symbol-level links with stale diagnostics and graph-state hints by querying the code graph.

When a symbol-level link contains a composed member identifier such as `X.Y`, `X#Y`, or `X::Y`, and the exact stored symbol string is not found in the graph, the CLI SHOULD retry stale resolution against the same file using the rightmost member segment plus the graph-reported symbol kind.

This fallback is best-effort only. It MUST NOT rewrite the stored symbol string, MUST NOT mutate change state or archived sidecars, and MUST leave the symbol marked stale when multiple same-file matches make the fallback ambiguous.

### Requirement: Task completion in details section

The details section of the text output SHALL show task completion counts for each artifact that has `taskCompletion` data, appended inline after the status line in the format `tasks: N/M`.

## Constraints

- The output includes all artifacts declared by the schema, not only those present on disk
- `effectiveStatus` reflects dependency cascading — an artifact may be `in-progress` because a dependency is incomplete even if its own hash matches
- The CLI command serializes lifecycle and implementation-tracking state returned by `GetStatus`; it does not recompute core state independently
- The CLI command MAY enrich implementation output with stale symbol diagnostics and graph-state hints by querying the code graph
- When applying stale-symbol enrichment, the CLI MAY use a same-file composed-member fallback for symbols containing `.`, `#`, or `::`, but MUST treat it as review-time enrichment only
- The CLI command MUST NOT call `SchemaRegistry`, `config show`, or any other use case to compute lifecycle data — it serializes what `GetStatus` returns for lifecycle interpretation
- Lifecycle semantics shown by the command (effective artifact status, blockers, available transitions, next artifact, review summary, next action) are projections of the `GetStatus` result, which is itself derived from `LifecycleEngine`; the CLI must not re-derive them independently

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

- [`cli:entrypoint`](../entrypoint/spec.md) — CLI config discovery, exit codes, and output conventions
- [`core:change`](../../core/change/spec.md) — change and artifact state model
- [`core:get-status`](../../core/get-status/spec.md) — status payload returned by core
