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

### Requirement: Drafted change status is read-only

When `GetStatus` returns `draftView` for the requested name, the command MUST render status in read-only form:

- MUST NOT print actionable lifecycle transitions that would mutate the drafted change
- MUST indicate the change is drafted (for example in text headers or JSON `isDrafted: true`)
- MAY still show artifact effective statuses for inspection

When `GetStatus` returns an active `change`, behaviour is unchanged.

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

### Requirement: Lifecycle projections come from GetStatus checks

Displayed `validTransitions`, `availableTransitions`, `nextAction`, and repair-oriented blockers MUST be the check-derived projections from `GetStatus`. The CLI MUST NOT filter the protocol graph locally in a way that reintroduces a list execute would reject (for example advertising `verifying` while tasks are incomplete, or recommending `/specd-implement` when `verifying` is allowed).

### Requirement: Text status omits duplicated review file lists

When rendering `format=text` and `review.required` is true, the CLI MUST print a `review:` header with `required`, `route`, `reason`, and human `message` when Core supplies it. It MUST NOT print `review.affectedArtifacts` file paths. Those files already appear under `artifacts (details):` with `pending-review` and `[drift]`. Invalidation overlap MUST NOT appear as a `OVERLAP_CONFLICT` blocker line.

When `review.reason` is `'spec-overlap-conflict'` and `overlapDetail` is non-empty, `format=text` MUST still print the overlap peers (archived change name and overlapping spec ids). Those peers are not present in `artifacts (details):`.

JSON and TOON MUST still serialize the full `review` object, including `overlapDetail`. Command `--help` JSON schema for `review` MUST list `overlapDetail` alongside `affectedArtifacts`.

### Requirement: Text blockers include check labels

When a blocker comes from a failed predicate and carries a gerund `label`, `format=text` MUST render that label next to the code so agents can interpret opaque codes. Canonical shape:

```text
! <CODE> — <label>: <message>
```

Example: `! DEPS_INCONSISTENT — Checking spec dependencies: Extracted dependsOn disagrees with persisted values for: cli:change-archive`.

JSON/TOON MUST serialize `label` (and `checkId` when present) on those blocker objects. Review-only blockers without a check `label` keep `! <CODE>: <message>`.

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
      children: ["..."]
      hasTasks: true|false
      output: "..."
```

`artifactDag` entries MUST be emitted in `schema.artifactDag().topologicalOrder()`.

For each entry, `requires` comes from the schema artifact definition and `children` MUST be `schema.artifactDag().childrenOf(id)` — the CLI MUST NOT derive children with local `requires.includes(id)` filters.

`hasTasks` is true when the artifact has `hasTasks: true` explicitly or has a `taskCompletionCheck` declaration.

Text-mode `artifacts (DAG):` tree rendering MUST use the same roots (`artifactDag().roots()`) and child ordering (`childrenOf`) as structured output.

Text-mode DAG node labels MUST use each artifact's **display status** from `GetStatus` (for example `complete-with-drift`), not raw `effectiveStatus`, so drift is visible without reading the details section.

When the DAG has convergent edges (one artifact required by multiple parents), the text tree MUST render each artifact type id **at most once**. Dependents reached again via another branch MUST NOT repeat the full subtree; the renderer MAY omit duplicate child expansion or annotate with a short reference (for example `└── (see <id> above)`).

When the CLI has resolved the active `Schema` instance, structured and text DAG derivation MUST use `schema.artifactDag()` (cached) rather than rebuilding `ArtifactDag.from` on a detached artifact list, so ordering matches every other consumer.

This allows design/implement skills to replace `schema show` calls.

### Requirement: Delegates refresh policy to GetStatus

The command MUST invoke `GetStatus` directly and MUST NOT call `RefreshImplementationTracking` or `ImplementationDetector` itself.

Default `GetStatus` refresh behaviour applies unless a future CLI flag explicitly opts out.

### Requirement: Implementation section

When implementation tracking is active, `--implementation` SHALL render the structured projection returned by `sdk:build-implementation-review`.

The section SHALL retain tracked-file states and confirmed stored values and SHALL expose each symbol link's status, reason, health/coverage, canonical logical target, candidates, and provenance. File-level links remain unforced.

The CLI MUST NOT enrich `GetStatus` through independent graph queries or same-file/rightmost-name fallback and MUST NOT mutate tracking or sidecars.

### Requirement: Task completion in details section

The details section of the text output SHALL show task completion counts for each artifact that has `taskCompletion` data, appended inline after the status line in the format `tasks: N/M`.

### Requirement: Basic info section

In text mode, the command SHALL render a basic info block at the top of the output including the change name and its current state.
It SHALL NOT include a standalone `specs:` list, as spec visibility is handled by the dedicated "Specs and dependencies" section.

### Requirement: Specs and dependencies section

The command SHALL include a "specs and dependencies" section in the output, listing all specs in the change's scope and their declared dependencies from the manifest's `specDependsOn` field.

In text mode, the section SHALL follow the DAG or details section and use a bulleted list format:

```
specs and dependencies:
  workspace:spec-path-1: dep1, dep2
  workspace:spec-path-2: (none)
```

In structured output (JSON/toon), the `specDependsOn` object from the change manifest SHALL be included in the top-level response.

## Constraints

- The output includes all artifacts declared by the schema, not only those present on disk.
- `effectiveStatus` reflects dependency cascading.
- The CLI serializes lifecycle and tracking state returned by Core and symbol-resolution state returned by the SDK; it recomputes neither.
- The CLI MUST NOT call `SchemaRegistry`, `config show`, or another use case to recompute lifecycle data.
- Lifecycle semantics remain projections of `GetStatus` and transition-check evaluation (`evaluateLifecycle`).
- Drafted status MUST suppress `nextAction.command` (print `(none)` / JSON `null`) even if Core attached a command.
- Drafted JSON MUST set `availableTransitions` and `availableSteps` to empty arrays even if Core leaked protocol hops.
- The CLI MUST NOT apply a second `VALID_TRANSITIONS`-only filter that drops or adds steps relative to `GetStatus.availableTransitions`.

## Examples

```
$ specd change status add-oauth-login
change:      add-oauth-login
state:       designing
description: Add OAuth2 login via Google

artifacts (DAG):
  [✓] proposal
  └── [?] specs

next action:
  target:  designing
  command: /specd-design
  reason:  ...

lifecycle:
  next artifact: specs
  approvals:     spec=off  signoff=off
  path:          .specd/changes/20260310-140000-add-oauth-login
```

## Spec Dependencies

- [`cli:entrypoint`](../entrypoint/spec.md) — output conventions
- [`core:change`](../../core/change/spec.md) — change state model
- [`core:get-status`](../../core/get-status/spec.md) — lifecycle status projection
- [`sdk:build-implementation-review`](../../sdk/build-implementation-review/spec.md) — shared implementation resolution projection
- [`core:transition-checks`](../../core/transition-checks/spec.md) — check-derived projections and gerund labels
