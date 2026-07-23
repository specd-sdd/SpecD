# Proposal: refactor-task-completion

## Motivation

The task completion counting logic is currently duplicated in two separate core use cases: `GetStatus` and `TransitionChange`. This duplication makes the codebase harder to maintain and prone to bugs if task parsing rules drift. The audit also exposed missing coverage and ambiguous task-pattern semantics that the shared boundary must make explicit.

## Current behaviour

Currently, both `GetStatus` (in `get-status.ts`) and `TransitionChange` (in `transition-change.ts`) implement independent logic to:

1. Fetch file content for task-enabled artifacts using the `ChangeRepository`.
2. Compile and apply regular expressions for `incompletePattern` and `completePattern`.
3. Count and aggregate the completed and incomplete tasks across all files of the artifact.

This duplication places coordination responsibility (looping over schema artifacts and compiling regexes) on the callers.

The compliance audit also found one stale schema-format scenario that still describes the lower-case-only complete pattern, plus a missing direct test for aggregation across two task-capable artifact types.

## Proposed solution

We will extract this task completion counting logic into a new, reusable application-layer usecase in the core package: `CountTasks`.

To prevent callers from having to loop and coordinate calls for each artifact type, `CountTasks` will accept the entire `Change` and return both per-artifact task completion statuses for all task-enabled artifacts and an aggregate completion status for the entire change.

### Changes to Existing Use Cases

#### 1. `GetStatus` ([get-status.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/get-status.ts))

- **Dependency**: Inject `CountTasks` as a new constructor dependency.
- **Removal**: Remove the entire manual task aggregation loop (lines 342-384), including compiling regular expressions (`safeRegex`) and reading file contents (`this._changes.artifact(...)`).
- **Addition**: Call `CountTasks.execute({ change })` once at the beginning of the status projection.
- **Wiring**: Map each status entry's `taskCompletion` property by looking up the artifact ID in the returned per-artifact result.

#### 2. `TransitionChange` ([transition-change.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/transition-change.ts))

- **Dependency**: Inject `CountTasks` as a new constructor dependency.
- **Removal**: Remove the private helper method `_checkTaskCompletionForArtifact` (lines 364-412), which has its own file reading and task counting logic.
- **Addition**: Call `CountTasks.execute({ change })` once before checking the transition requirements.
- **Wiring**: For each `artifactId` listed in `workflowStep.requiresTaskCompletion`, preserve the existing missing-task-capability failure when the artifact does not declare task capability and completion configuration. Otherwise, check the returned per-artifact count for `incomplete > 0`; if so, trigger the progress callback and throw `InvalidStateTransitionError` using the counted metrics.

---

We will create the following constructs:

### 1. Interfaces & Signatures

#### Input Signature: `CountTasksInput`

```typescript
export interface CountTasksInput {
  /** The change whose artifact files are checked. */
  readonly change: Change
}
```

#### Output Signature: `CountTasksResult`

```typescript
export interface TaskCompletionStatus {
  /** Count of completed task items. */
  readonly complete: number
  /** Count of incomplete task items. */
  readonly incomplete: number
  /** Total count of tracked task items (complete + incomplete). */
  readonly total: number
}

export interface CountTasksResult {
  /** Completion status for each task-capable artifact, keyed by artifact type ID. */
  readonly byArtifact: Readonly<Record<string, TaskCompletionStatus>>
  /** Aggregate completion status across every task-capable artifact in the change. */
  readonly total: TaskCompletionStatus
}
```

`byArtifact` MUST include every qualifying artifact with at least one existing, non-empty file, including a zero-valued entry when configured patterns are unsafe. `total` MUST aggregate the `complete`, `incomplete`, and `total` counts from every entry in `byArtifact`, and MUST contain zeroes when no qualifying artifact is present. Omitted patterns use the schema's standard checkbox defaults, including case-insensitive complete matching. Callers that require task capability remain responsible for preserving their missing-capability error by inspecting the artifact definition rather than inferring it from absence in `byArtifact`.

The schema-construction boundary owns those defaults: for a task-capable artifact, the resolved schema materializes `incompletePattern` as `^\s*-\s+\[ \]` and `completePattern` as `^\s*-\s+\[[xX]\]`. `CountTasks` consumes the resolved patterns and does not redefine fallback patterns.

### 2. Use Case Class: `CountTasks`

Located in `packages/core/src/application/use-cases/count-tasks.ts`:

```typescript
export class CountTasks {
  private readonly _changes: ChangeRepository
  private readonly _schemaProvider: SchemaProvider

  constructor(changes: ChangeRepository, schemaProvider: SchemaProvider) {
    this._changes = changes
    this._schemaProvider = schemaProvider
  }

  /**
   * Counts task completion status for all task-enabled artifacts in the change.
   * Returns a dictionary mapping artifact type IDs to their task counts.
   */
  async execute(input: CountTasksInput): Promise<CountTasksResult>
}
```

### 3. Composition Layer

Located in `packages/core/src/composition/use-cases/count-tasks.ts`:

#### Explicit Dependencies: `CountTasksDeps`

```typescript
export interface CountTasksDeps {
  readonly changes: ChangeRepository
  readonly schemaProvider: SchemaProvider
}
```

#### Dependency Resolution: `resolveCountTasksDeps`

```typescript
export function resolveCountTasksDeps(resolver: CompositionResolver): CountTasksDeps {
  return {
    changes: resolver.getChangeRepository(),
    schemaProvider: resolver.getSchemaProvider(),
  }
}
```

#### Factory Overloads: `createCountTasks`

```typescript
// Overload 1: From explicit dependencies
export function createCountTasks(deps: CountTasksDeps): CountTasks

// Overload 2: From project configuration
export function createCountTasks(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): CountTasks
```

## Specs affected

### New specs

- `core:count-tasks`: Defines the reusable task-completion counting contract, including safe pattern handling, aggregation across artifact files, and omission of artifacts that are not task-capable.
  - Depends on: `core:change`, `core:schema-format`, `core:composition-resolver`

### Modified specs

- `core:get-status`: Updated to depend on `CountTasks` for task counting and to declare the resulting content read explicitly.
  - Depends on (added): `core:count-tasks`
  - Depends on (removed): none
- `core:transition-change`: Updated to depend on `CountTasks` for task counting while preserving defensive rejection when required task capability or completion configuration is absent.
  - Depends on (added): `core:count-tasks`
  - Depends on (removed): none
- `core:kernel`: Updated to expose and wire the exported `CountTasks` use case through the changes domain group and its standalone composition factory.
  - Depends on (added): `core:count-tasks`
  - Depends on (removed): none
- `core:schema-format`: Update the materialized default completed-checkbox pattern so schema consumers count both `[x]` and `[X]` consistently.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- **Workspace**: `core` (packages/core)
- **Code Paths**:
  - New files: `packages/core/src/application/use-cases/count-tasks.ts` and `packages/core/src/composition/use-cases/count-tasks.ts`.
  - Modifications: [get-status.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/get-status.ts), [transition-change.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/transition-change.ts), and their corresponding composition factory files.
- **Public APIs**: The `Kernel` changes-domain surface and the public core factory surface gain `CountTasks` / `createCountTasks`, with the same normalized explicit-dependencies/config factory contract as neighbouring use cases.
- **Data Models / Schemas**: None.

## Technical context

During the discovery conversation, it was agreed that:

- The refactoring must proceed strictly under the `specd` workflow, keeping specifications up to date.
- Existing task-gating and status semantics remain consistent while default-pattern, unsafe-pattern, and capability cases become explicit and receive unit-test coverage.
- The schema verification wording and the CountTasks aggregate fixture must remain aligned with the resolved-schema contract.
- A separate dependency-injected use case is the cleanest architectural approach to align with the project's Hexagonal/DDD structure.
- The default checkbox patterns belong to schema construction, not to task-counting consumers; this keeps every consumer aligned with the resolved schema.

## Open questions

- none
