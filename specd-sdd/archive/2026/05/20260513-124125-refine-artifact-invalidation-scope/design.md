# Design: refine-artifact-invalidation-scope

## Non-goals

- Changing approval-gate semantics outside invalidation. Spec approval and signoff still gate the same lifecycle steps; this change only alters how drift and manual invalidation reopen artifacts.
- Reworking `LifecycleEngine` into a drift interpreter. It continues to read canonical artifact states only.
- Redesigning archive overlap handling beyond preserving current `spec-overlap-conflict` behavior.
- Adding a second persisted invalidation-policy axis. Automatic and manual invalidation keep sharing one persisted `invalidationPolicy`.

## Affected areas

- `Change.invalidate()` in `packages/core/src/domain/entities/change.ts`
  Change: extend the method to resolve an effective invalidation policy, apply policy-scoped reopening, and materialize `hasDrift` only for focused `artifact-drift` payloads.
  Callers: 80 direct dependents / 81 transitive dependents from graph impact · Risk: CRITICAL.
  Note: this is the central mutation point already used by `ValidateArtifacts`, `TransitionChange`, archive overlap handling, and scope edits. Signature changes must stay backwards-compatible for existing callers that still expect global behavior.

- `ArtifactFile` in `packages/core/src/domain/value-objects/artifact-file.ts`
  Change: persist `hasDrift`, expose a display-state helper, and separate canonical state transitions from drift marking/clearing.
  Callers: implicit fan-in through `ChangeArtifact`, repository hydration, status read models, and validation · Risk: HIGH.
  Note: this is the smallest safe place to centralize `complete + hasDrift => complete-with-drift`.

- `FsChangeRepository` in `packages/core/src/infrastructure/fs/change-repository.ts`
  Change: read/write `invalidationPolicy` and per-file `hasDrift`, preserve current drift detection on load, and delegate consequences to `Change.invalidate()` under the new policy semantics.
  Callers: 3 direct / 4 transitive dependents from graph impact · Risk: HIGH.
  Note: current serialization rewrites `missing + validatedHash` into `complete`-like persisted state; that legacy normalization must be removed because `missing + hasDrift=true` is now a valid canonical combination.

- Manifest schema in `packages/core/src/infrastructure/fs/manifest.ts`
  Change: add `invalidationPolicy` at change level and `hasDrift` at file level.
  Impact: repository load/save, tests, and any manifest readers · Risk: MEDIUM.

- `ValidateArtifacts.execute()` in `packages/core/src/application/use-cases/validate-artifacts.ts`
  Change: keep collecting focused drift payloads, but rely on the entity to apply policy semantics; preserve `missing` before hash rules and stop treating every mismatch as implicit global reopening.
  Callers: kernel `changes.validate`, archive preconditions, tests · Risk: HIGH.

- `TransitionChange.execute()` in `packages/core/src/application/use-cases/transition-change.ts`
  Change: preserve the current explicit "return to designing means all artifacts require review" behavior, even after the new invalidation policy work lands.
  Callers: CLI `changes transition`, skill-driven lifecycle flows, tests · Risk: HIGH.
  Note: this branch currently calls `Change.invalidate('artifact-review-required', ...)` with the full artifact/file set when moving back to `designing`. That broad reopening is intentional for this change and must not be narrowed as part of the report fixes.

- `GetStatus` in `packages/core/src/application/use-cases/get-status.ts`
  Change: extend `ArtifactFileStatus` and `ArtifactStatusEntry` with `hasDrift` and `displayStatus`; aggregate artifact display state from file display states.
  Callers: `cli/change/status`, `cli/change/artifacts`, possibly MCP/read-model consumers · Risk: MEDIUM.

- `registerChangeStatus()` in `packages/cli/src/commands/change/status.ts`
  Change: render display state in text mode; include both canonical and display state in structured output.
  Callers: CLI users and skill flows that inspect status · Risk: MEDIUM.

- `registerChangeArtifacts()` in `packages/cli/src/commands/change/artifacts.ts`
  Change: display per-file `displayStatus`, emit `hasDrift` and `displayStatus` in JSON/toon, and restore the text-mode contract required by the spec: `<id>  <artifact-state>  <file-state>  <exists>  <absolute-path>`.
  Callers: CLI users and workflow automation · Risk: MEDIUM.
  Note: the latest audit found that text mode currently drops `artifactState`, `fileState`, and `path`, which makes the default human-facing output non-compliant even though the structured rows already compute those fields.

- `InvalidateChange` and supporting errors in `packages/core/src/application/use-cases/invalidate-change.ts` plus new `packages/core/src/application/errors/*`
  Change: replace generic `Error` throws for invalid targets and missing-force approval guard with typed `SpecdError` subclasses that preserve current human-readable text while giving CLI/MCP adapters machine-readable codes.
  Callers: `cli/change/invalidate`, tests, any future delivery surface exposing manual invalidation · Risk: MEDIUM.
  Note: this is not a request to rewrite every generic throw in the repo. It is scoped to the user-facing invalidation flow surfaced by the latest audit and your observation that this path should behave like the rest of specd's typed error surface.

- `handleError()` in `packages/cli/src/handle-error.ts`
  Change: no semantic rewrite required, but the invalidation flow should arrive here as `SpecdError` so JSON/toon callers receive structured errors instead of opaque stderr-only generic failures.
  Callers: nearly every CLI command · Risk: HIGH as an integration boundary.

- `CreateChange` / `EditChange` in `packages/core/src/application/use-cases/create-change.ts` and `packages/core/src/application/use-cases/edit-change.ts`
  Change: accept/persist `invalidationPolicy` without inventing drift or mutating canonical artifact states.
  Callers: kernel, CLI create/edit commands, tests · Risk: MEDIUM.

- Config loading in `packages/core/src/application/specd-config.ts` and `packages/core/src/infrastructure/fs/config-loader.ts`
  Change: add resolved `invalidationPolicy` to `SpecdConfig`, validate accepted values, default to `downstream`.
  Callers: every kernel construction path and any code importing `SpecdConfig` (`plugins-*`, `skills`, CLI bootstrap) · Risk: MEDIUM.

- Kernel composition in `packages/core/src/composition/kernel.ts`, `packages/core/src/composition/use-cases/create-change.ts`, and `packages/core/src/composition/use-cases/edit-change.ts`
  Change: wire the new invalidation policy into create/edit use cases and register the new `InvalidateChange` use case in `kernel.changes`.
  Callers: every delivery surface using the kernel · Risk: HIGH because the kernel contract grows.

- CLI command registration in `packages/cli/src/index.ts`
  Change: register a new `changes invalidate` command.
  Callers: CLI entrypoint only · Risk: LOW.

- Tests
  Change: update/add coverage in:
  - `packages/core/test/domain/entities/change.spec.ts`
  - `packages/core/test/application/use-cases/validate-artifacts.spec.ts`
  - `packages/core/test/application/use-cases/create-change.spec.ts`
  - `packages/core/test/application/use-cases/edit-change.spec.ts`
  - new tests for `InvalidateChange`
  - CLI tests for `change/status`, `change/artifacts`, and new `change/invalidate`
    Risk: HIGH if omitted because this change spans entity, repository, use-case, and CLI contracts.

## New constructs

- `type InvalidationPolicy = 'none' | 'surgical' | 'downstream' | 'global'`
  Location: `packages/core/src/domain/value-objects/invalidation-policy.ts`
  Shape:

  ```ts
  export type InvalidationPolicy = 'none' | 'surgical' | 'downstream' | 'global'
  export const DEFAULT_INVALIDATION_POLICY: InvalidationPolicy = 'downstream'
  export function isInvalidationPolicy(value: string): value is InvalidationPolicy
  ```

  Responsibility: canonical policy type shared by config, manifest, use cases, and CLI parsing.
  Relationships: imported by `Change`, config loader, create/edit/invalidate use cases, and CLI command.

- `type ArtifactDisplayStatus = ArtifactStatus | 'complete-with-drift'`
  Location: `packages/core/src/domain/value-objects/artifact-display-status.ts`
  Shape:

  ```ts
  export type ArtifactDisplayStatus = ArtifactStatus | 'complete-with-drift'
  ```

  Responsibility: represent human-facing status without contaminating lifecycle state.
  Relationships: imported by `ArtifactFile`, `GetStatus`, and CLI status renderers.

- `InvalidateChange` use case
  Location: `packages/core/src/application/use-cases/invalidate-change.ts`
  Shape:

  ```ts
  export interface InvalidateTargetInput {
    readonly artifactId: string
    readonly specId?: string
  }

  export interface InvalidateChangeInput {
    readonly name: string
    readonly reason: string
    readonly policyOverride?: InvalidationPolicy
    readonly targets?: readonly InvalidateTargetInput[]
    readonly force?: boolean
  }

  export interface AffectedArtifactFile {
    readonly artifactId: string
    readonly key: string
    readonly filename: string
    readonly expansion: 'direct' | 'downstream' | 'global'
  }

  export interface InvalidateChangeResult {
    readonly change: Change
    readonly effectivePolicy: InvalidationPolicy
    readonly affected: readonly AffectedArtifactFile[]
  }

  export class InvalidateChange {
    constructor(changes: ChangeRepository, actor: ActorResolver, schemaProvider: SchemaProvider)
    execute(input: InvalidateChangeInput): Promise<InvalidateChangeResult>
  }
  ```

  Responsibility: preflight manual invalidation, resolve effective policy, normalize targets, enforce approval guard, and delegate actual mutation to `Change.invalidate()`.
  Relationships: exposed via `kernel.changes.invalidate`, used only by the CLI in this change.

- `registerChangeInvalidate()`
  Location: `packages/cli/src/commands/change/invalidate.ts`
  Shape:

  ```ts
  export function registerChangeInvalidate(parent: Command): void
  ```

  Responsibility: parse `--reason`, repeated `--target`, optional `--policy`, and `--force`; map CLI strings to `InvalidateChangeInput`; format the final affected set.
  Relationships: registered from `packages/cli/src/index.ts`, calls `kernel.changes.invalidate.execute(...)`.

- `InvalidInvalidateTargetError` and `InvalidateRequiresForceError`
  Location: `packages/core/src/application/errors/invalid-invalidate-target-error.ts` and `packages/core/src/application/errors/invalidate-requires-force-error.ts`
  Shape:

  ```ts
  export class InvalidInvalidateTargetError extends SpecdError {
    override get code(): string
    constructor(messages: readonly string[])
  }

  export class InvalidateRequiresForceError extends SpecdError {
    override get code(): string
    constructor(changeName: string)
  }
  ```

  Responsibility: represent expected operator errors from manual invalidation as typed failures rather than generic exceptions.
  Relationships: thrown by `InvalidateChange.execute()`, consumed by CLI `handleError()`, covered by core and CLI tests.

## Approach

1. Add the shared invalidation-policy type and thread it through resolved config, manifest types, and the `Change` entity. `SpecdConfig` gets `invalidationPolicy`, `CreateChangeInput` gets an initial policy, and `EditChangeInput` gets an optional override field for persistence edits.

2. Extend `ArtifactFile` with explicit drift state instead of deriving everything from `validatedHash`.
   - Add `readonly hasDrift?: boolean` to construction props and a private `_hasDrift` field.
   - Add methods:
     ```ts
     markDrifted(): void
     clearDrift(): void
     displayStatus(): ArtifactDisplayStatus
     ```
   - `displayStatus()` returns `complete-with-drift` only for canonical `complete + hasDrift=true`.
   - `markComplete(hash)` must also clear drift, because successful validation reconciles the current baseline.

3. Rework `Change.invalidate()` into policy-aware mutation, but keep detection outside the entity.
   - New signature:
     ```ts
     invalidate(
       cause: InvalidatedEvent['cause'],
       actor: ActorIdentity,
       message?: string,
       affectedArtifacts?: readonly InvalidatedArtifactEntry[],
       invalidationPolicyOverride?: InvalidationPolicy,
     ): InvalidatedArtifactEntry[]
     ```
   - The method resolves the effective policy from override or persisted change policy.
   - It always appends `invalidated` and, when needed, a `transitioned` event to `designing`.
   - It returns the final deduplicated affected set so callers can report it without re-running expansion.
   - `artifact-drift` marks `hasDrift=true` only on the focused payload before reopening canonical states according to policy.
   - `artifact-review-required` never touches drift flags.

4. Encode policy semantics inside the entity, not in the repository or CLI.
   - `none`: no reopened artifact states; canonical file state may still be `missing` if the file is absent.
   - `surgical`: reopen only the normalized target set.
   - `downstream`: reopen the normalized target set plus DAG descendants computed from `Change.artifacts`.
   - `global`: reopen every artifact/file in the change.
     The entity needs a private helper pair such as:

   ```ts
   private _resolveInvalidationPolicy(override?: InvalidationPolicy): InvalidationPolicy
   private _expandAffectedArtifacts(
     base: readonly InvalidatedArtifactEntry[],
     policy: InvalidationPolicy,
   ): readonly InvalidatedArtifactEntry[]
   ```

5. Keep drift detection in `FsChangeRepository.get()` and `ValidateArtifacts.execute()`, but change the consequences.
   - Repository hydration continues to compare disk vs. `validatedHash`.
   - On mismatch, it still calls `change.invalidate('artifact-drift', SYSTEM_ACTOR, ..., affectedArtifacts)`.
   - The difference is that the entity now applies `none`/`surgical`/`downstream`/`global`, so repository load no longer hardcodes global reopening.
   - `_deriveFileStatus()` must continue to establish presence first; missing files stay `missing`.
   - Serialization must stop rewriting `missing + validatedHash` into persisted `complete`, because that would destroy the new canonical `missing + hasDrift=true` state.

6. Introduce a manual invalidation use case instead of overloading `TransitionChange`.
   - `InvalidateChange.execute()` loads the change and schema, resolves the effective policy, and validates command shape before anything else.
   - For `surgical`/`downstream`, it resolves repeated targets into concrete `(artifactId, key, filename)` entries and accumulates all target errors.
   - For `none`/`global`, any target is rejected.
   - If approvals/signoff are active and `force !== true`, it aborts before mutation.
   - On success it calls `freshChange.invalidate('artifact-review-required', actor, reason, affectedArtifacts, policyOverride)` inside repository mutation and returns the entity-produced final affected set.
   - The abort paths above should throw typed `SpecdError` subclasses, not raw `Error`, so CLI structured formats preserve machine-readable failure information.

7. Extend read models instead of teaching `LifecycleEngine` about drift.
   - `GetStatus.ArtifactFileStatus` adds `hasDrift` and `displayStatus`.
   - `ArtifactStatusEntry` adds `displayStatus`.
   - Aggregation precedence follows the spec: `drifted-pending-review > pending-review > in-progress > missing > complete-with-drift > complete`, with `skipped` only when all files are skipped.
   - `LifecycleEngine` remains unchanged except, if needed, removing any incidental dependency on raw drift heuristics so it reads canonical states only.

8. Update CLI status surfaces to consume display state.
   - `change status` text mode prints display state where it currently prints `state`.
   - JSON/toon include both canonical and display fields.
   - `change artifacts` text mode must emit the full spec-promised row shape: id, artifact state, file display state, existence, and absolute path. JSON/toon keep the richer structured fields including `hasDrift` and `displayStatus`.
   - The new `change invalidate` command groups final affected files by artifact and orders them by linear DAG-forest traversal, using the final deduplicated set returned by core.
   - The missing-force message surfaced by `change invalidate` must explicitly say that the active approval/signoff will be invalidated as part of returning to `designing`.

9. Keep documentation and operator help aligned.
   - CLI help text for `change edit`, `change status`, `change artifacts`, and the new `change invalidate` must mention the new fields/flags.
   - Add or update a short operator-facing document under `docs/` describing `invalidationPolicy`, `complete-with-drift`, and the approval/`--force` behavior of manual invalidation.

## Key decisions

- **Policy execution stays in `Change.invalidate()`** → drift detection already happens in repository/use-case layers, but lifecycle rollback, approval invalidation, and artifact reopening must stay co-located to avoid splitting one transition across layers. **Alternatives rejected** → pushing policy into `FsChangeRepository` or `ValidateArtifacts` would duplicate logic and miss manual invalidation.

- **`hasDrift` is persisted, `complete-with-drift` is not** → humans and downstream readers need to see drift in `manifest.json`, but `complete-with-drift` is a projection, not a canonical state. **Alternatives rejected** → persisting `complete-with-drift` would duplicate truth and create stale-state risk.

- **Missing beats drift for canonical status** → absent files must remain `missing` even when they no longer match the baseline. **Alternatives rejected** → treating missing files as only “drifted complete” would make lifecycle and validation semantics dishonest.

- **Manual invalidation always invalidates the change** → `changes invalidate` is a lifecycle action first; policy only controls artifact consequences. **Alternatives rejected** → making `none` a full no-op would conflict with approval invalidation and the command name itself.

- **`--target` only exists when the effective policy needs a starting set** → this avoids a separate `--all` concept and keeps the CLI aligned with policy meaning. **Alternatives rejected** → keeping both `--artifact`/`--spec` and `--target`, or adding `--all`, would add redundant surfaces and more validation branches.

- **Display logic is centralized in domain/read-model helpers, not re-derived per CLI** → this keeps `change status` and `change artifacts` consistent. **Alternatives rejected** → having each renderer recompute `complete + hasDrift` would drift over time.

- **Transitioning back to `designing` still reopens the whole change** → although the invalidation-policy work narrows drift and manual invalidation scope, an explicit lifecycle step back to `designing` remains a broad semantic reset. **Alternatives rejected** → making this transition policy-aware would silently weaken the user's explicit "we are reworking this change" action and conflicts with the observed current workflow expectation.

- **Manual invalidation user errors are typed `SpecdError`s** → invalid targets and missing `--force` are expected domain/application failures, not unexpected exceptions. **Alternatives rejected** → leaving them as raw `Error` would keep text-mode behavior but degrade JSON/toon consumers and diverge from specd's established error model.

## Trade-offs

- `[High fan-in in Change.invalidate()]` → keep the external call pattern mostly source-compatible, add focused helper methods, and cover behavior with entity and use-case tests before refactoring any callers.
- `[Manifest backward compatibility]` → load old manifests without `hasDrift` or `invalidationPolicy` by defaulting to `false` and `downstream`, then rewrite on next save.
- `[Repository load now mutates under policy semantics]` → acceptable because the repository already mutates on load today; mitigation is to make the mutation deterministic and entirely delegated to the entity.
- `[CLI output gets wider]` → keep text output concise and move extra detail to JSON/toon fields and grouped sections.
- `[New typed invalidation errors add surface area]` → keep the new `SpecdError` classes narrowly scoped to CLI-facing invalidation failures and preserve the existing human-readable wording so downstream tests and docs need only targeted updates.

## Spec impact

### `core:change`

- Direct dependents found in specs: `core:edit-change`, `core:create-change`, `core:transition-change`, `core:workflow-model`, `core:change-repository-port`, `cli:change-status`, `cli:change-artifacts`, `cli:change-edit`, `cli:change-validate`, `cli:change-archive`, `cli:change-transition`, and other lifecycle/CLI specs.
- Assessment: most dependents refer to lifecycle states, approval invalidation, or artifact semantics at a high level and remain satisfied by the new design. This change already scoped the dependents that need contract changes (`core:edit-change`, `core:create-change`, `cli:change-status`, `cli:change-artifacts`).
- No additional spec deltas are required for `core:workflow-model`, `cli:change-archive`, or `cli:change-transition` because canonical lifecycle states are unchanged.

### `core:validate-artifacts`

- Direct dependents found in specs: `core:archive-change`, `core:validate-specs`, `cli:change-validate`, `core:kernel`.
- Assessment: these dependents rely on validation result shape and drift detection existing, not on global reopening semantics. Their requirements remain satisfied because validation still detects mismatch and still invalidates the change; only reopening scope changes.
- No further spec expansion is needed.

### `core:get-status`

- Direct dependents found in specs: `cli:change-status`, `core:workflow-model`, `core:kernel`.
- Assessment: only the human-facing CLI contract changes. Kernel and workflow-model continue to use canonical state concepts and are unaffected.

### `core:config`

- Direct dependents found in specs: plugin manager specs, graph CLI specs, config-loader/get-active-schema/project CLI specs, and several plugin agent specs.
- Assessment: all of those depend on `SpecdConfig` broadly. Adding one optional resolved field does not invalidate their existing requirements. No dependent spec needs requirement changes as long as current fields remain stable and `invalidationPolicy` defaults cleanly.

### `core:change-manifest`

- Direct dependents found in specs: `core:change-layout`, `core:storage`, `cli:change-deps`, `core:spec-id-format`, `core:change-repository-port`.
- Assessment: the manifest grows but does not rename or remove existing fields. Those specs stay satisfied. No additional spec changes are needed beyond the manifest spec itself.

## Dependency map

```mermaid
graph LR
  CFG[core:config / SpecdConfig] --> CC[CreateChange]
  CFG --> EC[EditChange]
  CFG --> IC[InvalidateChange]
  REPO[FsChangeRepository.get] --> CHG[Change.invalidate()]
  VA[ValidateArtifacts.execute] --> CHG
  IC --> CHG
  CHG --> AF[ArtifactFile.hasDrift/displayStatus]
  AF --> GS[GetStatus]
  GS --> CST[CLI change status]
  GS --> CAT[CLI change artifacts]
  IC --> CINV[CLI change invalidate]
  MAN[manifest.json schema] --> REPO
  MAN --> CHG
```

```text
┌──────────────────────┐
│ core:config          │
│ invalidationPolicy   │
└──────────┬───────────┘
           │
           ├──────────────▶┌──────────────────┐
           │               │ CreateChange     │
           ├──────────────▶│ EditChange       │
           │               └────────┬─────────┘
           │                        │
           ▼                        │
┌──────────────────────┐            │
│ InvalidateChange     │────────────┘
│ (new use case)       │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐      ┌──────────────────────┐
│ ValidateArtifacts    │─────▶│ Change.invalidate()  │◀─────┐
└──────────────────────┘      │ [CRITICAL hotspot]   │      │
                              └──────────┬───────────┘      │
                                         │                  │
                                         ▼                  │
                              ┌──────────────────────┐      │
                              │ ArtifactFile         │      │
                              │ hasDrift             │      │
                              │ displayStatus()      │      │
                              └──────────┬───────────┘      │
                                         │                  │
                                         ▼                  │
                              ┌──────────────────────┐      │
                              │ GetStatus            │      │
                              └───────┬──────────────┘      │
                                      │                     │
                    ┌─────────────────┴──────────────┐      │
                    ▼                                ▼      │
        ┌──────────────────────┐          ┌──────────────────────┐
        │ CLI change status    │          │ CLI change artifacts │
        └──────────────────────┘          └──────────────────────┘

┌──────────────────────┐
│ FsChangeRepository   │
│ manifest hydrate/save│──────────────────────────────▶ Change.invalidate()
└──────────────────────┘
```

## Migration / Rollback

- Manifest loading must accept missing `invalidationPolicy` and `hasDrift` fields from existing changes.
  - Load default: `invalidationPolicy = 'downstream'`.
  - Load default per file: `hasDrift = false`.
- On save, always write the new fields so manifests converge forward.
- Rollback safety:
  - If the feature must be reverted after manifests are rewritten, old binaries must tolerate the extra JSON keys. The current Zod schemas are strict, so rollback requires either keeping backward-compatible schema readers in the revert or migrating manifests back.
  - Because of that, implementation should update loader schemas first and keep them tolerant before any code path writes the new fields.

## Testing

**Automated tests**

- `packages/core/test/domain/entities/change.spec.ts`
  - add cases for `none`, `surgical`, `downstream`, and `global`
  - verify `artifact-drift` sets `hasDrift` only on focused files
  - verify manual invalidation leaves `hasDrift` untouched
  - verify missing files remain `missing` even with `hasDrift=true`

- `packages/core/test/domain/value-objects/artifact-file.spec.ts` (new if absent)
  - verify `displayStatus()` and drift-marking helpers
  - verify `markComplete()` clears drift

- `packages/core/test/application/use-cases/validate-artifacts.spec.ts`
  - cover focused drift payload generation
  - cover `none` preserving canonical `complete`
  - cover missing-before-hash behavior

- `packages/core/test/application/use-cases/invalidate-change.spec.ts` (new)
  - cover effective-policy resolution
  - cover target normalization/dedupe and accumulated errors
  - cover approval/signoff `force` guard
  - assert that invalid target failures and missing-force failures are `SpecdError`-based with stable machine-readable codes
  - cover final affected-set expansion and ordering metadata

- `packages/core/test/application/use-cases/create-change.spec.ts`
  - cover default invalidation-policy seeding

- `packages/core/test/application/use-cases/edit-change.spec.ts`
  - cover persisted invalidation-policy edits without drift side effects

- `packages/core/test/application/use-cases/get-status.spec.ts` (new or existing)
  - cover file-level and artifact-level display-state aggregation

- `packages/core/test/infrastructure/fs/change-repository.spec.ts` (new or existing)
  - cover manifest round-trip for `invalidationPolicy` and `hasDrift`
  - cover repository-load drift detection with policy-aware consequences

- `packages/cli/test/commands/change/invalidate.spec.ts` (new, or equivalent CLI harness path)
  - cover `--reason`, `--policy`, repeated `--target`, `--force`, no-target/prohibited-target combinations
  - cover the explicit approval/signoff invalidation warning text
  - cover structured error output for typed invalidation failures
  - cover grouped final affected-set reporting

- `packages/cli/test/commands/change/status.spec.ts`
  - cover `displayStatus` and `hasDrift` in text/json output

- `packages/cli/test/commands/change/artifacts.spec.ts`
  - cover `complete-with-drift` and structured output fields
  - cover text rows including artifact state, display-state file column, exists flag, and absolute path

**Manual / E2E verification**

- Run:
  ```bash
  node packages/cli/dist/index.js changes validate refine-artifact-invalidation-scope --all --artifact specs
  node packages/cli/dist/index.js changes validate refine-artifact-invalidation-scope --all --artifact verify
  pnpm build
  pnpm test --filter @specd/core --filter @specd/cli
  ```
- Create a scratch change with persisted `invalidationPolicy: none`, validate one artifact, edit the file on disk, then run:
  ```bash
  node packages/cli/dist/index.js changes status <name> --format text
  node packages/cli/dist/index.js changes artifacts <name> --format text
  ```
  Expected: file shows `complete-with-drift`, lifecycle stays on canonical states, and missing files show `missing`, not `complete-with-drift`.
- With an approved/signed-off change, run:
  ```bash
  node packages/cli/dist/index.js changes invalidate <name> --reason "semantic review" --policy none
  ```
  Expected: command stops with a force warning. Re-run with `--force` and confirm the change returns to `designing` while artifact states follow `none`.
- Re-run with `--policy surgical` and `--policy downstream --target specs@core:change` to verify final affected-set reporting and ordering.
- Confirm that returning a change to `designing` through `changes transition <name> designing` still reopens the full artifact set intentionally, and that this path is unchanged by the implementation.
- Update the relevant operator docs under `docs/` to document:
  - `specd.yaml` `invalidationPolicy`
  - `changes edit --invalidation-policy`
  - `changes invalidate`
  - `complete-with-drift` in status output
