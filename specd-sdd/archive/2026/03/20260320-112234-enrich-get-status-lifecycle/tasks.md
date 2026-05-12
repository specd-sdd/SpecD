# Tasks: enrich-get-status-lifecycle

## 1. Core use case — types and constructor

- [x] 1.1 Add `LifecycleContext` and `TransitionBlocker` types to GetStatus module
      `packages/core/src/application/use-cases/get-status.ts`:
      new interfaces — `LifecycleContext` with `validTransitions`, `availableTransitions`,
      `blockers`, `approvals`, `nextArtifact`, `changePath`, `schemaInfo`; `TransitionBlocker`
      with `transition`, `reason`, `blocking`
      Approach: define as exported readonly interfaces alongside existing types;
      add `lifecycle: LifecycleContext` to `GetStatusResult`
      (Req: Returns lifecycle context)

- [x] 1.2 Expand `GetStatus` constructor to accept new dependencies
      `packages/core/src/application/use-cases/get-status.ts`:
      `GetStatus` constructor — add `schemas: SchemaRegistry`, `schemaRef: string`,
      `workspaceSchemasPaths: ReadonlyMap<string, string>`,
      `approvals: { readonly spec: boolean; readonly signoff: boolean }`
      Approach: store as private readonly fields; same pattern as `TransitionChange` constructor
      (Req: Constructor dependencies)

- [x] 1.3 Export new types from core barrel
      `packages/core/src/index.ts` (or relevant barrel file):
      add exports for `LifecycleContext`, `TransitionBlocker`
      Approach: add named re-exports from the use-case file
      (Req: Returns lifecycle context)

## 2. Core use case — lifecycle computation

- [x] 2.1 Compute `validTransitions` in `execute()`
      `packages/core/src/application/use-cases/get-status.ts`:
      `execute()` — import `VALID_TRANSITIONS` from `domain/value-objects/change-state.js`,
      look up `VALID_TRANSITIONS[change.state]`
      Approach: static lookup, no schema needed; always works
      (Req: Returns lifecycle context)

- [x] 2.2 Resolve schema with graceful degradation
      `packages/core/src/application/use-cases/get-status.ts`:
      `execute()` — call `this._schemas.resolve(this._schemaRef, this._workspaceSchemasPaths)`
      wrapped in try/catch; set `schema` to `null` on failure
      Approach: try/catch around resolve(); if result is null or throws, use null;
      extract `schemaInfo` as `{ name: schema.name(), version: schema.version() }` or null
      (Req: Graceful degradation when schema resolution fails)

- [x] 2.3 Compute `availableTransitions` and `blockers`
      `packages/core/src/application/use-cases/get-status.ts`:
      `execute()` — for each state in `validTransitions`, look up `schema.workflowStep(state)`;
      check each required artifact's `effectiveStatus`; collect available vs blocked
      Approach: mirror `TransitionChange` lines 188-197 pattern — check
      `change.effectiveStatus(artifactId)` is `'complete'` or `'skipped'` for each require;
      if no workflow step exists (or schema null), treat as available (no requires);
      collect blocking artifact IDs into `TransitionBlocker` with `reason: 'requires'`
      (Req: Returns lifecycle context)

- [x] 2.4 Compute `nextArtifact`
      `packages/core/src/application/use-cases/get-status.ts`:
      `execute()` — walk `schema.artifacts()` in declaration order; find first artifact
      whose requires are all satisfied but whose own status is not `complete`/`skipped`
      Approach: for each artifact, check all `artifact.requires` have effectiveStatus
      `complete` or `skipped`, then check the artifact's own effectiveStatus is neither;
      return first match's `id`, or `null` if none found; return `null` when schema is null
      (Req: Returns lifecycle context)

- [x] 2.5 Compute `changePath` and assemble lifecycle
      `packages/core/src/application/use-cases/get-status.ts`:
      `execute()` — call `this._changes.changePath(change)`, build the full
      `LifecycleContext` object and add to the return value
      Approach: always available; combine all computed fields into the lifecycle object
      (Req: Returns lifecycle context)

## 3. Kernel and factory wiring

- [x] 3.1 Update kernel wiring for `GetStatus`
      `packages/core/src/composition/kernel.ts`:
      line 176 — change `new GetStatus(i.changes)` to pass all new dependencies
      Approach: `new GetStatus(i.changes, i.schemas, i.schemaRef, i.workspaceSchemasPaths,
    { spec: config.approvals.spec, signoff: config.approvals.signoff })`
      (Req: Constructor dependencies)

- [x] 3.2 Update `createGetStatus` factory function
      `packages/core/src/composition/use-cases/get-status.ts`:
      `FsGetStatusOptions` — add schema and approvals fields;
      `createGetStatus()` — forward new dependencies to constructor
      Approach: extend options interface; create or receive `SchemaRegistry`, pass through
      (Req: Constructor dependencies)

## 4. CLI command handler

- [x] 4.1 Remove independent schema resolution from CLI handler
      `packages/cli/src/commands/change/status.ts`:
      lines 24-35 — remove the `kernel.specs.getActiveSchema.execute()` call and its
      try/catch block
      Approach: delete the block; schema warning will use `lifecycle.schemaInfo` instead
      (Req: Schema version warning — CLI must not resolve schema independently)

- [x] 4.2 Add schema warning using `lifecycle.schemaInfo`
      `packages/cli/src/commands/change/status.ts`:
      after getting the result — compare `change.schemaName`/`change.schemaVersion`
      against `result.lifecycle.schemaInfo`
      Approach: if `schemaInfo` is not null, build `recorded` and `current` strings
      and compare; if different, write warning to stderr; if `schemaInfo` is null, skip
      (Req: Schema version warning)

- [x] 4.3 Add lifecycle serialization to text output
      `packages/cli/src/commands/change/status.ts`:
      text format block — add `lifecycle:` section with `transitions:`, `next artifact:`,
      `approvals:`, `path:` lines, and optional `blockers:` section
      Approach: append lines after artifacts; `transitions:` shows `availableTransitions`
      joined by `, ` (omit line if empty); `next artifact:` omitted if null;
      `approvals:` shows `spec=on|off signoff=on|off`; `path:` shows `changePath`;
      `blockers:` section with `→ <transition>: <reason> — <blocking>` lines (omit if empty)
      (Req: Output format)

- [x] 4.4 Add lifecycle to JSON output
      `packages/cli/src/commands/change/status.ts`:
      JSON format block — include `lifecycle` object in output
      Approach: spread `result.lifecycle` fields into the JSON object; `schemaInfo` as-is
      (null when degraded)
      (Req: Output format)

## 5. Core tests

- [x] 5.1 Add `makeSchemaRegistry` helper for GetStatus tests
      `packages/core/test/application/use-cases/helpers.ts` (or co-located helper):
      new helper — returns mock `SchemaRegistry` with configurable schema
      Approach: create a mock that returns a `Schema` with standard artifact DAG
      (proposal → specs → verify → design → tasks) and workflow steps

- [x] 5.2 Update existing tests to use new constructor signature
      `packages/core/test/application/use-cases/get-status.spec.ts`:
      all existing `new GetStatus(repo)` calls — add schema and approvals args
      Approach: use `makeSchemaRegistry()` helper; pass default approvals `{ spec: false, signoff: false }`

- [x] 5.3 Add tests for `lifecycle.validTransitions`
      `packages/core/test/application/use-cases/get-status.spec.ts`:
      new describe block — verify returns correct transitions for each state
      Approach: test with change in `designing` state, assert `validTransitions`
      matches `VALID_TRANSITIONS['designing']`
      (Req: Returns lifecycle context, scenario: Valid transitions from designing state)

- [x] 5.4 Add tests for `lifecycle.availableTransitions` and `blockers`
      `packages/core/test/application/use-cases/get-status.spec.ts`:
      new describe block — test available/blocked transitions based on artifact statuses
      Approach: test with all requires satisfied → transition in `availableTransitions`;
      test with missing requires → transition not available, blocker entry with correct
      artifact IDs; test skipped artifacts count as satisfied
      (Req: Returns lifecycle context, scenarios: Available transitions, Blocked transition,
      Skipped artifacts)

- [x] 5.5 Add tests for `lifecycle.approvals`
      `packages/core/test/application/use-cases/get-status.spec.ts`:
      new test — verify approvals reflect injected config
      Approach: construct with `{ spec: true, signoff: false }`, verify result matches
      (Req: Returns lifecycle context, scenario: Approvals reflect injected config)

- [x] 5.6 Add tests for `lifecycle.nextArtifact`
      `packages/core/test/application/use-cases/get-status.spec.ts`:
      new describe block — test next artifact resolution
      Approach: test first unsatisfied artifact with met requires; test null when all
      complete; test skips artifacts whose requires are not met
      (Req: Returns lifecycle context, scenarios: Next artifact resolves, null when all
      complete, skips unmet requires)

- [x] 5.7 Add tests for `lifecycle.changePath` and `lifecycle.schemaInfo`
      `packages/core/test/application/use-cases/get-status.spec.ts`:
      new tests — verify changePath from repo, schemaInfo from schema
      Approach: mock `changePath()` return value; verify `schemaInfo` contains
      schema name and version
      (Req: Returns lifecycle context, scenarios: Change path, Schema info)

- [x] 5.8 Add tests for graceful degradation
      `packages/core/test/application/use-cases/get-status.spec.ts`:
      new describe block — test behavior when schema resolution fails
      Approach: mock `schemas.resolve()` to throw; verify result doesn't throw;
      verify `validTransitions` populated, `availableTransitions` empty, `blockers` empty,
      `nextArtifact` null, `schemaInfo` null, `changePath` populated, `approvals` populated
      (Req: Graceful degradation, scenario: Schema resolution failure)

## 6. CLI tests

- [x] 6.1 Update existing CLI test mocks with lifecycle field
      `packages/cli/test/commands/change-status.spec.ts`:
      all `kernel.changes.status.execute.mockResolvedValue` calls — add `lifecycle` field
      Approach: add a default `lifecycle` object to each mock return value with
      `validTransitions`, `availableTransitions: []`, `blockers: []`,
      `approvals: { spec: false, signoff: false }`, `nextArtifact: null`,
      `changePath: '.specd/changes/...'`, `schemaInfo: { name: '...', version: 1 }`

- [x] 6.2 Update schema mismatch test to use `lifecycle.schemaInfo`
      `packages/cli/test/commands/change-status.spec.ts`:
      `Schema mismatch` test — remove `kernel.specs.getActiveSchema.execute` mock;
      set `lifecycle.schemaInfo` with different name/version
      Approach: set `schemaInfo: { name: '@specd/schema-std', version: 2 }` on lifecycle
      while change has `schemaVersion: 1`; verify warning appears
      (Req: Schema version warning)

- [x] 6.3 Add tests for lifecycle text output
      `packages/cli/test/commands/change-status.spec.ts`:
      new tests — verify lifecycle section in text output
      Approach: test available transitions shown; test transitions line omitted when empty;
      test next artifact shown/omitted; test blockers section shown/omitted
      (Req: Output format, scenarios: Text output shows available transitions, blockers,
      next artifact)

- [x] 6.4 Add test for lifecycle in JSON output
      `packages/cli/test/commands/change-status.spec.ts`:
      update JSON structure test — verify `lifecycle` object in JSON
      Approach: parse JSON output; verify `lifecycle` has all expected fields with correct types
      (Req: Output format, scenario: JSON output contains lifecycle object)

## 7. Manual verification

- [x] 7.1 Build and run E2E smoke test
      Manual: create a test change, check text and JSON output, verify lifecycle fields,
      advance state, verify transitions update
      Approach: follow the E2E steps from design.md — create change, transition to designing,
      check status in text and JSON, verify lifecycle section, write a proposal artifact,
      verify nextArtifact advances, discard change
