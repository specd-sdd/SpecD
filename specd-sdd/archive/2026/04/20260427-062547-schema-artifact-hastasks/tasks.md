# Tasks: schema-artifact-hastasks

## 1. Infrastructure and Domain (core)

- [x] 1.1 Add `hasTasks` to `ArtifactYaml` Zod schema
      `packages/core/src/infrastructure/schema-yaml-parser.ts`: `artifactYamlSchema` — add `hasTasks: z.boolean().optional()`
      Approach: update the artifact entry Zod definition to accept the new optional boolean.
      (Req: Artifact definition)
- [x] 1.2 Add `hasTasks` to `ArtifactType` value object
      `packages/core/src/domain/value-objects/artifact-type.ts`: `ArtifactTypeProps` and `ArtifactType` class — add `hasTasks` readonly property
      Approach: update construction properties and add the public readonly property to the domain class. Update constructor to initialize it.
      (Req: Artifact definition)
- [x] 1.3 Add `missing-task-capability` reason to `InvalidStateTransitionError`
      `packages/core/src/domain/errors/invalid-state-transition-error.ts`: `TransitionFailureReason` and `buildMessage` — add new reason type
      Approach: add `{ type: 'missing-task-capability', artifactId: string }` to the union and update the switch statement in `buildMessage` to return a clear error message.
      (Req: InvalidStateTransitionError structured reasons)

## 2. Application Logic and Validation (core)

- [x] 2.1 Implement semantic validation in `buildSchema`
      `packages/core/src/domain/services/build-schema.ts`: `buildSchema` — check `requiresTaskCompletion` consistency
      Approach: after building artifacts, iterate through workflow steps. For each ID in `requiresTaskCompletion`, verify the resolved `ArtifactType` has `hasTasks: true`. Throw `SchemaValidationError` if not.
      (Req: Workflow, Constraints)
- [x] 2.2 Implement default patterns and mapping in `buildArtifactType`
      `packages/core/src/domain/services/build-schema.ts`: `buildArtifactType` — map `hasTasks` and provide defaults
      Approach: read `hasTasks` from raw YAML. If `true` and `taskCompletionCheck` patterns are missing, inject standard markdown checkbox regexes into the `ArtifactType` properties.
      (Req: taskCompletionCheck)
- [x] 2.3 Implement defensive check and master switch in `TransitionChange`
      `packages/core/src/application/use-cases/transition-change.ts`: `execute()` and `_checkTaskCompletionForArtifact`
      Approach: before running the task check, verify `artifactType.hasTasks` is true. If false but present in `requiresTaskCompletion`, throw the new `missing-task-capability` error. Use the explicit flag to decide whether to execute the content check.
      (Req: Task completion check during requires enforcement)

## 3. CLI Visual Feedback

- [x] 3.1 Update DAG rendering to show `[hasTasks]` tag
      `packages/cli/src/commands/change/status.ts`: `renderDag` and node rendering logic
      Approach: use `artifactType.hasTasks` from the schema info. Append ` [hasTasks]` string to the line when rendering nodes in the tree.
      (Req: Output format)
- [x] 3.2 Include `hasTasks` in JSON output
      `packages/cli/src/commands/change/status.ts`: `ChangeStatus` command output
      Approach: ensure the JSON payload includes the `hasTasks` boolean in the `artifactDag` array entries.
      (Req: Schema-derived fields)

## 4. Schema and Verification

- [x] 4.1 Update `@specd/schema-std`
      `packages/schema-std/schema.yaml`: `tasks` artifact definition
      Approach: add `hasTasks: true` explicitly to the tasks artifact.
      (Req: Schema Example)
- [x] 4.2 Add and update automated tests
      Various test files — add coverage for new scenarios
      Approach: add tests for Zod parsing, semantic validation in `buildSchema`, defensive check in `TransitionChange`, and CLI output rendering.
      (Req: All updated scenarios in verify.md)
