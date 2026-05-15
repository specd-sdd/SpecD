# Proposal: refine-artifact-invalidation-scope

## Motivation

Iterating on a validated artifact is currently too expensive because any detected drift reopens the whole artifact DAG, even when the change is still local and the design is not yet settled. This slows normal review loops and makes previously validated work noisy and fragile during design refinement.

## Current behaviour

Today, `ValidateArtifacts` detects drift against approval/signoff hashes and calls `Change.invalidate(...)` with `cause: 'artifact-drift'`. The resulting rollback is always **global**: it marks the drifted file and then aggressively downgrades **every other artifact** in the change to `pending-review`.

There is no way to limit this scope, and no explicit command for manual targeted reopening.

## Proposed solution

Introduce a top-level **`invalidationPolicy`** field in `specd.yaml` to control how much of the artifact graph is reopened when drift is detected or a manual invalidation is requested.

### 1. Invalidation Scopes (Policies)

The system will support four levels of invalidation:

| Scope            | Drift Invalidation       | Invalidation Effect                                                                                                                                                                      | Use Case                                                                     |
| :--------------- | :----------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------- |
| **`none`**       | **Informational Only\*** | Drift is tracked but does not trigger `invalidate()`. Artifacts stay internally `complete`, while status may render them as `complete-with-drift`.                                       | Expert mode: full manual control.                                            |
| **`surgical`**   | **Active**               | Only the drifted/targeted file is invalidated as a real artifact-state change. Descendants are not invalidated; they may become blocked dynamically in effective status and transitions. | Optimistic mode: fast iterations where contracts are stable.                 |
| **`downstream`** | **Active**               | Target(s) + all descendants in the DAG are invalidated.                                                                                                                                  | Safety mode: if a requirement changes, all derived work must be re-reviewed. |
| **`global`**     | **Active**               | Every artifact in the change is invalidated.                                                                                                                                             | Legacy mode: current behavior where nothing is trusted after drift.          |

_\*Note: `none` is suspended when an active Approval exists (see Section 6)._

### 2. Informational Drift Tracking

To provide visibility without disruption, the system will decouple **artifact state** (Workflow) from **content synchronization** (Disk).

- **`hasDrift` flag**: Each artifact file in the `manifest.json` will include a persisted `hasDrift` boolean that records whether the file's current state differs from its validated baseline.
- **Meaning**: `hasDrift=true` means the file's current state does not match the validated baseline. This includes changed content and file absence. `hasDrift=false` means the current state matches the validated baseline.
- **Tracking**: `ValidateArtifacts` will ALWAYS update this flag whenever the current file state does not match the validated baseline, regardless of the active policy.
- **Status Reporting**: `specd changes status` will surface this flag. When an artifact remains internally `complete` but `hasDrift=true`, the status layer renders it as `complete-with-drift`.
- **Reset**: The flag is reset to `false` only after a successful `validate` command that matches the current disk content/baseline again.
- **Manifest shape**: `hasDrift` is stored per artifact file entry in `manifest.json`, alongside the existing `state` and `validatedHash` fields. `validatedHash` remains the last successfully validated baseline hash only; it must not be treated as evidence that the file still exists or is still complete on disk.

`complete-with-drift` is therefore a **derived display state**, not a new persisted workflow state. The persisted workflow state remains `complete` unless the active policy escalates the artifact into a real review state such as `drifted-pending-review`.

### 3. Structural Integrity vs. Content Drift

It is critical to distinguish between these two validation phases:

- **Structural Validation**: ALWAYS active. `ValidateArtifacts` always checks if artifacts satisfy schema rules and delta integrity. If an artifact becomes structurally invalid, it will fail validation and block transitions, regardless of the `invalidationPolicy`.
- **Drift Invalidation**: Governed by the policy. It determines whether a **hash mismatch** (captured in `hasDrift`) should remain informational (`complete-with-drift` in status) or should trigger a change-level rollback to `designing` and artifact status downgrades such as `drifted-pending-review`.
- **Missing beats drift state**: If the expected artifact file does not exist on disk, the canonical result is `missing`, not a drift-derived workflow/display state. This applies even under `none`: informational drift handling never preserves `complete` when the file itself is absent. The system may still retain `hasDrift=true` as diagnostic state if the missing file no longer matches the validated baseline, but `complete-with-drift` must not be shown once the canonical state is `missing`.
- **State before hash**: Presence and canonical file state must always be checked before interpreting `validatedHash`. The hash is only the last validated baseline, not proof of current presence, completeness, or freshness.

### 4. Configuration & Overrides

- **Global**: `invalidationPolicy` in `specd.yaml` (defaults to `downstream`).
- **Per-Change**: Persisted in `manifest.json`, modifiable via `specd changes edit <name> --invalidation-policy <policy>`.
- **Manual Command**: `specd changes invalidate <name> --policy <policy>` overrides the stored policy for a single execution.
- **Single Policy Model**: The change stores one `invalidationPolicy`, and that same persisted policy is the default for both automatic drift handling and manual invalidation. The manual command's `--policy` flag is a one-off override for that execution only; it does not introduce a second persisted policy dimension.
- **Developer Choice**: Persisting `none`, `surgical`, `downstream`, or `global` on the change is an intentional authoring choice made either through `specd.yaml` defaults or `changes edit`. specd should respect that choice rather than silently narrowing the allowed policy set.

### 5. Explicit Targeted Invalidation Command

The `specd changes invalidate <change>` command allows precise control:

- **Change-level effect**: Executing the command always invalidates the change itself and returns it to `designing`. The invalidation policy does not decide whether the change is invalidated; it decides only what happens to artifact states as part of that invalidation.
- **Target selection**: `--target <target>` is the single targeting surface and may be repeated.
  - `<artifactId>` targets the whole artifact. For `scope: change` artifacts this means the single change-scoped artifact file; for `scope: spec` artifacts this means all files for that artifact across the specs included in the change.
  - `<artifactId>@<specId>` targets one specific file of a `scope: spec` artifact.
  - Using `<artifactId>@<specId>` against a `scope: change` artifact is a command error.
  - Repeated `--target` values are deduplicated after normalization.
  - The command must resolve and validate the complete normalized target set before mutating anything. If any target is invalid, malformed, unknown, or scope-incompatible, the entire command fails and no invalidation happens.
  - Validation errors should be accumulated across the full requested target set. The command must report every invalid target combination it found, rather than stopping at the first error.
- **Policy control**: Uses the change's effective invalidation policy by default; can be overridden via `--policy`.
  - The command must first resolve the effective policy: the explicit `--policy` override when present, otherwise the change's persisted `invalidationPolicy`.
  - If the effective policy is `surgical` or `downstream`, at least one `--target` is required.
  - If the effective policy is `none` or `global`, `--target` is not allowed because targeting would be semantically irrelevant.
  - Preflight order: resolve effective policy first, then validate command shape against that policy, then normalize and validate the full target set. If any validation errors exist, the command fails before evaluating approval/signoff guards or `--force`.
- **Audit & Feedback**:
  - `--reason <text>`: Mandatory human-readable explanation.
  - **Approval guard**: If the change currently has an active approval or signoff, the command must stop by default and warn that the change will be returned to `designing` and the current approvals will be invalidated. The user must pass `--force` to continue. This guard applies even when the effective policy is `none`.
  - **`none` semantics**: If the effective policy is `none`, the command performs no artifact-state invalidation. The CLI must say explicitly that no artifacts were invalidated because the effective invalidation policy is `none`. It must also explain that the caller can pass `--policy <policy>` to force a different propagation policy for this execution.
  - **CLI Feedback**: The command always reports the effective invalidation policy, that the change was invalidated and returned to `designing`, and the final affected artifact/file set after normalization, deduplication, and any policy-driven expansion. Each affected artifact/file must appear at most once in the output. Under `surgical`, the CLI must make it clear that no downstream expansion occurred. Under `downstream` or `global`, the CLI must enumerate the final affected set rather than only reporting a count.
  - **Output shape**: The final affected set should be grouped by artifact and reported in a linear DAG-forest traversal order. Start from one root, walk that root's branch to completion, then continue with the next remaining root, never re-listing artifacts/files that were already shown through an earlier branch. Internal roots that appear after prior expansion follow the same rule: traverse them in order, but skip anything already emitted. When policy expansion is the reason an artifact/file appears, the CLI should label that clearly (for example with a downstream-expansion marker or legend).

### 6. Approval Supersedence (The Integrity Gate)

**Approvals are invalidated by drift regardless of policy.**

A Change with an active `spec-approved` or `signed-off` state is under "Signature Protection":

- `ValidateArtifacts` **MUST** perform drift detection against the approved hashes, regardless of the configured invalidation policy.
- Any detected drift **SHALL** invalidate the approval, record an `invalidated` event with cause `artifact-drift`, and return the change to `designing`.
- This approval invalidation is unconditional. The `invalidationPolicy` does **not** decide whether approval remains valid; it decides only what happens to artifact states after the approval has been invalidated.
- Under `none`, the change still returns to `designing` and the approval must be re-earned before the change can advance again, even if the affected artifact remains internally `complete` and only surfaces as `complete-with-drift`.
- Under `surgical`, `downstream`, and `global`, artifact-state reopening follows the policy semantics already defined above.
- In every case, once drift has invalidated approval, the change must satisfy the normal readiness conditions again before a new approval can be granted.

## Specs affected

### New specs

- `core:invalidate-change`: Use case for targeted invalidation and policy enforcement.
- `cli:change-invalidate`: CLI command surface.

### Modified specs

- `core:change`: Update `invalidate()` logic, add `invalidationPolicy` and `hasDrift` persistence, and implement Approval supersedence rules.
- `core:change-manifest`: Extend the manifest schema for policy and drift flags.
- `core:edit-change`: Add support for policy modification.
- `core:create-change`: Ensure the global policy is copied to the manifest during creation.
- `core:config`: Add global `invalidationPolicy` schema.
- `core:validate-artifacts`: Implement policy-aware drift detection, Approval protection, and `hasDrift` tracking.
- `core:lifecycle-engine`: Preserve existing blocking/gating semantics while ensuring `surgical` relies on canonical artifact states rather than display-only drift projections.
- `core:get-status`, `cli:change-status`, and `cli:change-artifacts`: Enhanced human-facing status/reporting with drift-aware display state rendering.

## Technical context

- **Responsibility for Policy Enforcement**: The `Change` entity is the "point of truth" for invalidation logic. `Change.invalidate()` will accept an optional `invalidationPolicyOverride` parameter.
  - **Automatic Flow (System)**: `ValidateArtifacts` calls `invalidate()` WITHOUT an `invalidationPolicyOverride`. The entity resolves the policy from its manifest (or global fallback). If the policy is `none`, the mismatch is recorded via `hasDrift=true`, while canonical file state still depends on actual presence/state (`complete` if still present and otherwise unchanged, `missing` if absent). No drift-derived workflow-state downgrade is applied beyond those canonical file-state rules.
  - **Manual Flow (Actor)**: Use cases triggered by explicit actions (like the CLI command) MAY pass an `invalidationPolicyOverride`. Without an override, the command inherits the change's effective policy. If that effective policy is `none`, the command still invalidates the change and returns it to `designing`, but performs no artifact-state invalidation. With an override, the entity respects the requested policy for that execution. Manual invalidation uses the domain cause `artifact-review-required`; the user supplies only the human-readable `reason` message recorded on the event.
- **Drift Authority**: `ValidateArtifacts` is responsible for detecting any mismatch between the current file state and the validated baseline. When it calls `Change.invalidate()` with cause `artifact-drift`, it provides the focused `affectedArtifacts` payload that identifies the concrete artifact/files that drifted. The entity materializes `hasDrift=true` only for those affected files while also applying policy-driven invalidation. `hasDrift` is the persisted source of truth; `complete-with-drift` is a status projection derived from `status=complete` plus `hasDrift=true`.
- **Drift Preconditions**: Drift-derived projections such as `complete-with-drift` only apply when the expected artifact file still exists and differs from its validated baseline while remaining canonically `complete`. If the file is absent, the entity/repository must surface `missing`; `hasDrift` may still remain true as a diagnostic signal, but no `complete-with-drift` projection is shown.
- **Manual Invalidation vs Drift**: Manual invalidation never invents or clears drift. It does not set `hasDrift`; only drift detection and subsequent successful validation change that flag.
- **Display State Centralization**: The canonical persisted state remains `status` plus `hasDrift`; `complete-with-drift` is not persisted. Artifact files should expose a centralized display-state helper (for example `displayStatus()`) so human-facing consumers do not each re-derive the same `complete + hasDrift` projection independently.
- **Display Aggregation**: Aggregated artifact display state should be derived from file-level display states rather than recomputed from raw fields in multiple places. If `ChangeArtifact` exposes its own `displayStatus()`, it should delegate to the file-level display semantics so file and artifact rendering cannot drift apart.
  - Suggested precedence for aggregated display state: `drifted-pending-review` > `pending-review` > `in-progress` > `missing` > `complete-with-drift` > `complete`, with `skipped` preserved only when all files are skipped.
  - `complete-with-drift` should therefore appear at artifact level only when at least one file has drift-visible display state and no file is already in a stronger real workflow state.
- **DAG Awareness**: `Change.invalidate()` already has the artifact DAG and remains responsible for expanding invalidation across that DAG according to the effective policy (`surgical`, `downstream`, `global`). Automatic and manual invalidation both reuse this same entity-owned expansion logic.
- **Policy Semantics**: `surgical` changes only the normalized target set and leaves descendants untouched as persisted state; any downstream consequence is interpreted later by `LifecycleEngine` as blocking/effective state only. `downstream` mutates the normalized target set plus all DAG descendants of that set as real invalidated artifacts. `global` mutates every artifact/file in the change.
- **Idempotence**: If a targeted artifact/file is already in a reopened state such as `pending-review` or `drifted-pending-review`, manual invalidation leaves it as-is and continues. Under `none`, artifacts already surfacing as `complete-with-drift` likewise remain unchanged. Already-reopened or already-drift-visible targets are not treated as command errors.
- **Lifecycle Interpretation**: `LifecycleEngine` does not calculate or apply invalidation. It continues to operate on canonical artifact states only (`complete`, `pending-review`, `drifted-pending-review`, etc.) when deriving effective statuses, blockers, and transition eligibility. It does not need to understand `hasDrift` or `complete-with-drift`, because those are reporting/display concerns rather than lifecycle-state inputs.
- **Read-model Usage Boundary**: Human-facing read models and renderers such as `GetStatus`, `change status`, and `change artifacts` should consume the centralized display-state helper. Lifecycle, validation, approval, archive, and transition logic must continue to use the canonical workflow state rather than the display projection.
- **Repository Role**: The `ChangeRepository` remains a "dumb" adapter. Its only role is to persist and restore the `invalidationPolicy` and `hasDrift` fields in the manifest.
