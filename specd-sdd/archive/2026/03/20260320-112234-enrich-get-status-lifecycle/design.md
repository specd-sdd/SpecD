# Design: enrich-get-status-lifecycle

## Non-goals

- **Structured transition errors** — returning `{ error, blockingItems }` from `TransitionChange` is a separate concern (noted in the issue as a future improvement).
- **Batch validate** — `change validate <name>` without specPath is out of scope.
- **MCP adapter changes** — the MCP adapter benefits automatically from the richer result; no code changes are needed there.

## Affected areas

### `packages/core/src/application/use-cases/get-status.ts`

The `GetStatus` class currently accepts only `ChangeRepository` in its constructor. It will be extended to accept `SchemaRegistry`, `schemaRef`, `workspaceSchemasPaths`, and `approvals`. The `execute()` method will compute the `lifecycle` object and include it in `GetStatusResult`.

The types `GetStatusResult` will gain a `lifecycle` field. New types `LifecycleContext` and `TransitionBlocker` will be added in this file.

### `packages/core/src/composition/kernel.ts`

Line 176: `new GetStatus(i.changes)` will be updated to pass the additional dependencies:

```typescript
new GetStatus(i.changes, i.schemas, i.schemaRef, i.workspaceSchemasPaths, {
  spec: config.approvals.spec,
  signoff: config.approvals.signoff,
})
```

### `packages/core/src/composition/use-cases/get-status.ts`

The `createGetStatus()` factory function creates `GetStatus` for standalone use (outside the kernel). It will need to accept and forward the new dependencies. The `FsGetStatusOptions` interface will be extended.

### `packages/cli/src/commands/change/status.ts`

The CLI handler will:

1. Remove the independent `kernel.specs.getActiveSchema.execute()` call (lines 24-35) — schema info for the warning will come from the result's `lifecycle` data or be simplified.
2. Add lifecycle serialization for both text and JSON output formats.
3. The schema warning will compare `change.schemaName`/`change.schemaVersion` against the active schema, but since the use case resolves the schema internally, the CLI can detect mismatch from the result's `change` entity. The CLI still needs the active schema name/version for the warning message — this will be added to the lifecycle as `schemaInfo: { name, version } | null`.

**Revision**: After further analysis, the CLI currently gets the active schema name/version from `kernel.specs.getActiveSchema`. With this change, the use case already resolves the schema. Rather than exposing schema info in the lifecycle (which is unrelated to lifecycle concerns), the CLI will continue to use the existing `change.schemaName`/`change.schemaVersion` vs `kernel.specs.getActiveSchema` for the warning. This keeps the lifecycle object focused. The spec delta says the CLI "MUST NOT resolve the schema independently" — but the schema warning is outside lifecycle context. We'll add `schemaInfo` to the lifecycle to satisfy this cleanly.

**Final approach**: Add `schemaInfo: { readonly name: string; readonly version: number } | null` to the lifecycle object. This is the active schema's name and version (from schema resolution). `null` when schema resolution fails. The CLI compares `change.schemaName/Version` against `lifecycle.schemaInfo` for the warning — no independent schema call.

### `packages/core/test/application/use-cases/get-status.spec.ts`

All existing tests pass `new GetStatus(repo)` — they'll need the new constructor signature. A `makeSchemaRegistry()` helper will be needed.

### `packages/cli/test/commands/change-status.spec.ts`

The mock `GetStatusResult` will need the `lifecycle` field. The schema mismatch test will change — it currently mocks `kernel.specs.getActiveSchema.execute`, which will no longer be called.

## New constructs

### `LifecycleContext` (type)

- **Location**: `packages/core/src/application/use-cases/get-status.ts`
- **Shape**:
  ```typescript
  interface LifecycleContext {
    readonly validTransitions: readonly ChangeState[]
    readonly availableTransitions: readonly ChangeState[]
    readonly blockers: readonly TransitionBlocker[]
    readonly approvals: { readonly spec: boolean; readonly signoff: boolean }
    readonly nextArtifact: string | null
    readonly changePath: string
    readonly schemaInfo: { readonly name: string; readonly version: number } | null
  }
  ```
- **Responsibility**: Carries pre-computed lifecycle context so consumers don't need to replicate state machine + DAG + config logic.
- **Relationships**: Embedded in `GetStatusResult`. Consumed by CLI and MCP serializers.

### `TransitionBlocker` (type)

- **Location**: `packages/core/src/application/use-cases/get-status.ts`
- **Shape**:
  ```typescript
  interface TransitionBlocker {
    readonly transition: ChangeState
    readonly reason: 'requires' | 'tasks-incomplete'
    readonly blocking: readonly string[]
  }
  ```
- **Responsibility**: Describes why a structurally valid transition is not currently available.
- **Relationships**: Used within `LifecycleContext.blockers`.

## Approach

### 1. Compute `validTransitions` (static, no schema needed)

Import `VALID_TRANSITIONS` from `packages/core/src/domain/value-objects/change-state.ts`. Look up `VALID_TRANSITIONS[change.state]`. This always works regardless of schema availability.

### 2. Resolve schema (may fail)

Call `this._schemas.resolve(this._schemaRef, this._workspaceSchemasPaths)`. Wrap in try/catch. If it fails or returns `null`, set a `schema` variable to `null` and use the degraded path for all schema-dependent fields.

### 3. Compute `availableTransitions` and `blockers`

For each state in `validTransitions`:

1. Look up `schema.workflowStep(state)`.
2. If no workflow step exists (or schema is null), treat the transition as available (no requires to enforce).
3. If workflow step has `requires`, check each via `change.effectiveStatus(artifactId)`. If all are `complete` or `skipped`, the transition is available. Otherwise, collect the blocking artifact IDs into a `TransitionBlocker`.

This mirrors the pattern in `TransitionChange` (lines 188-197 of `transition-change.ts`) but without throwing — it collects results instead.

### 4. Compute `nextArtifact`

Walk `schema.artifacts()` in declaration order. For each artifact:

1. Check if its `requires` are all satisfied (`change.effectiveStatus(reqId)` is `complete` or `skipped` for each).
2. Check if the artifact itself is not done (`change.effectiveStatus(artifact.id)` is neither `complete` nor `skipped`).
3. Return the first such artifact's `id`. If none found, return `null`.

When schema is `null` (degraded), return `null`.

### 5. Compute `changePath`

Call `this._changes.changePath(change)`. Always available.

### 6. Assemble lifecycle and return

Build the `LifecycleContext` object and add it to the existing result alongside `change` and `artifactStatuses`.

### 7. Update CLI handler

- Remove the `kernel.specs.getActiveSchema.execute()` call.
- For text format: add `lifecycle:` section after `artifacts:`. Show `transitions:` (only `availableTransitions`, omit if empty), `next artifact:` (omit if null), `approvals:`, `path:`. Show `blockers:` section if non-empty.
- For JSON format: include the full `lifecycle` object in the output.
- Schema warning: compare `change.schemaName`/`change.schemaVersion` against `result.lifecycle.schemaInfo`. If `schemaInfo` is `null` (schema resolution failed), skip the warning.

### 8. Update kernel wiring

Pass additional dependencies to `GetStatus` constructor in `createKernel()`.

### 9. Update `createGetStatus` factory

Extend `FsGetStatusOptions` to include schema and approvals config. Pass them through.

## Key decisions

**Decision: `schemaInfo` in lifecycle** → The spec says the CLI must not resolve the schema independently. Adding `schemaInfo: { name, version } | null` to the lifecycle gives the CLI what it needs for the schema warning without a separate call. **Alternative rejected**: keeping the CLI's independent `getActiveSchema` call — violates the spec delta we just wrote.

**Decision: Treat missing workflow step as "available"** → When a transition target has no workflow step in the schema, there are no requires to enforce, so the transition is considered available. This matches `TransitionChange` behavior (lines 188-197: requires check is skipped when `workflowStep` is `null`). **Alternative rejected**: treating it as blocked — would be inconsistent with how `TransitionChange` actually behaves.

**Decision: Types co-located in `get-status.ts`** → `LifecycleContext` and `TransitionBlocker` are specific to this use case's result. No other use case needs them. **Alternative rejected**: separate file in `domain/value-objects/` — these are application-layer result types, not domain value objects.

**Decision: `changePath` as relative path** → `ChangeRepository.changePath()` returns an absolute path. The CLI currently uses absolute paths. However, for JSON output consumed by external tools, a relative path (from project root) is more portable. We'll let the use case return whatever `changePath()` returns (absolute) and let the CLI relativize it for display if needed. The spec says "filesystem path" without specifying relative/absolute — we'll follow the existing `changePath()` contract.

## Trade-offs

**[Risk: Schema resolution adds latency]** → Mitigation: schema resolution is a single in-memory lookup after the first call (schemas are cached by `SchemaRegistry`). Other use cases already pay this cost. Zero additional I/O in practice.

**[Risk: Breaking change to `GetStatusResult` type]** → Mitigation: `lifecycle` is a new field — existing destructuring `{ change, artifactStatuses }` still works. TypeScript consumers that type-check against the full interface will see the new field. This is additive, not breaking.

**[Risk: `createGetStatus` factory API change]** → Mitigation: the factory is internal infrastructure, not a public API. Only the kernel and tests call it.

## Testing

### Automated tests

#### `packages/core/test/application/use-cases/get-status.spec.ts`

New describe blocks:

- **`lifecycle.validTransitions`**
  - `returns valid transitions for the current state` — verify against `VALID_TRANSITIONS` map for each state
  - `returns valid transitions for designing state` (verify scenario)

- **`lifecycle.availableTransitions`**
  - `includes transition when all workflow requires are satisfied` (verify scenario)
  - `excludes transition when requires are not satisfied`
  - `includes transition when no workflow step exists for target`
  - `skipped artifacts count as satisfied requires` (verify scenario)

- **`lifecycle.blockers`**
  - `reports blocker for valid-but-unavailable transition` (verify scenario)
  - `reports correct blocking artifact IDs`
  - `empty when all transitions are available`

- **`lifecycle.approvals`**
  - `reflects injected approvals config` (verify scenario)

- **`lifecycle.nextArtifact`**
  - `resolves first unsatisfied artifact with met requires` (verify scenario)
  - `returns null when all artifacts are complete` (verify scenario)
  - `skips artifacts whose requires are not met` (verify scenario)

- **`lifecycle.changePath`**
  - `returns changePath from repository` (verify scenario)

- **`lifecycle.schemaInfo`**
  - `returns schema name and version when resolution succeeds`
  - `returns null when schema resolution fails`

- **`graceful degradation`**
  - `does not throw when schema resolution fails` (verify scenario)
  - `returns degraded lifecycle fields when schema is null` (verify scenario)

Existing tests will be updated to pass the new constructor dependencies. A `makeSchemaRegistry()` helper will be added that returns a mock `SchemaRegistry` with a default schema containing the standard artifact DAG.

#### `packages/cli/test/commands/change-status.spec.ts`

Updated tests:

- **`Normal status output`** — mock result includes `lifecycle`, verify text output includes lifecycle section
- **`JSON output contains correct structure`** — verify JSON includes `lifecycle` object with all fields
- **`Schema mismatch`** — change mock to use `lifecycle.schemaInfo` instead of `kernel.specs.getActiveSchema`
- New: **`Text output shows available transitions`** — verify transitions line
- New: **`Text output shows blockers`** — verify blockers section
- New: **`Text output shows next artifact`** — verify next artifact line
- New: **`Text output omits transitions line when none available`**
- New: **`Text output omits next artifact when all done`**
- New: **`JSON output contains lifecycle object`** — full lifecycle structure check

### Manual / E2E verification

```bash
# Create a change and check status in designing state
node packages/cli/dist/index.js change create test-lifecycle --description "test"
node packages/cli/dist/index.js change transition test-lifecycle designing
node packages/cli/dist/index.js change status test-lifecycle

# Expected: text output with lifecycle section showing:
#   next artifact: proposal
#   approvals: spec=off signoff=off
#   path: .specd/changes/...-test-lifecycle
# Expected: blockers section showing ready is blocked

# JSON output
node packages/cli/dist/index.js change status test-lifecycle --format json
# Expected: lifecycle object with validTransitions, availableTransitions (empty),
#   blockers (ready blocked), approvals, nextArtifact: "proposal", changePath

# Write proposal and verify nextArtifact advances
# ... write proposal.md ...
node packages/cli/dist/index.js change status test-lifecycle --format json
# Expected: nextArtifact now points to "specs"

# Clean up
node packages/cli/dist/index.js change discard test-lifecycle --reason "test cleanup"
```

### Linting

ESLint architecture rules apply — `get-status.ts` is in the application layer and may import from domain (`change-state.ts`, `VALID_TRANSITIONS`) and ports (`schema-registry.ts`, `change-repository.ts`). No infrastructure imports allowed.

## Open questions

_(none)_
