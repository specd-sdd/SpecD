# Workflow Automation

## Purpose

To ensure consistent and efficient agent interactions across the SpecD lifecycle by defining policies for diagnostic output and data extraction. This spec minimizes "AI blindness" by mandating human-optimized text for status checks and machine-optimized formats for data-intensive operations.

## Requirements

### Requirement: Diagnostic Priority

AI agents SHALL prioritize text-based output (`--format text`) for all lifecycle status checks, transition attempts, and validation commands to ensure visibility of human-readable blockers and notes.

### Requirement: Data Extraction

AI agents SHALL use machine-optimized formats strictly when structured data extraction is required for subsequent tool calls or internal state management.

Agents MUST prefer `--format toon` for structured extraction. Agents MAY use `--format json` only when `toon` is unavailable or explicitly requested.

### Requirement: Spec read surface selection

AI agents MUST select a spec read command according to the information required:

- `specd specs show <spec-id>` MUST be used when exact raw artifact content is required for authoring, delta composition, or content review.
- `specd specs context <spec-id>` MUST be used when the agent needs semantic working context, including section filtering, dependency traversal, or configured optimized-content preference.
- `specd specs metadata <spec-id>` MUST be used only when the caller needs the normalized metadata projection or materialization diagnostics such as `source`, `regenerated`, and warnings.

Agents MUST NOT treat `specs metadata` as a source of effective project configuration or as the default way to load working context. Effective project configuration MUST come from a project configuration or project status command whose contract exposes the required field.

### Requirement: On-demand outline retrieval

When artifact-instruction responses provide only outline availability references (for example `availableOutlines`), AI agents MUST retrieve full outline content on demand using the canonical command:

`specd specs outline <specPath> --artifact <artifactId>`

Agents MUST NOT rely on embedded full outline trees in `changes artifact-instruction` output.

### Requirement: Repair Strategy

Agents SHALL follow the "Next Action" recommendations provided in command outputs before attempting to repeat a failed lifecycle operation.

### Requirement: Canonical Command References

Agent-authored workflow instructions and examples MUST use canonical plural command groups for countable resources (for example: `changes`, `specs`, `archives`, `drafts`).

Singular forms MAY be referenced only as aliases.

For outline retrieval examples, the canonical form is `specd specs outline <specPath> --artifact <artifactId>`.

### Requirement: Command Necessity and Freshness

AI agents MUST avoid redundant command invocations when a prior command in the same skill execution already provides the required fields with equivalent semantics.

A command MAY be skipped only when both conditions hold:

1. The required information is already available from a prior command output in the current execution step.
2. The information is still fresh for the current decision boundary.

Agents MUST NOT assume continuity across separate skill invocations. When a skill may run later, in a different session, or without reliable in-memory state, the agent SHALL re-read the minimal required state before making lifecycle decisions.

When equivalence is not deterministic, agents SHALL run the explicit command instead of reusing inferred state.

### Requirement: Structural Validation and Content Review

Agents SHALL treat `specd changes validate` as structural/state validation only. A successful validation MUST NOT be interpreted as semantic approval of artifact content.

Agents MUST perform content review of requirements, constraints, and intent alignment before progressing lifecycle steps that depend on artifact correctness.

For successful individual validation of an existing delta-backed `scope: spec` artifact, agents SHALL review the inline diff shown by `specd changes validate` as the immediate review surface for unintended removals, contract breakage, or other risky edits.

If that inline diff is unavailable because validation failed or because diff generation reported the dedicated non-fatal failure path, agents SHALL fall back to:

`specd changes spec-preview <change-name> <specId> --diff --artifact <artifactId>`

When overlap or drift risk exists for broader spec-delta review outside that narrow single-validate path, agents SHALL verify merged content with `specd changes spec-preview <change-name> <specId>` before accepting the delta outcome.

When review only needs one spec-scoped artifact, agents SHOULD prefer `specd changes spec-preview <change-name> <specId> --artifact <artifactId>` to reduce unnecessary output volume.

### Requirement: Cross-skill artifact review and recovery

Every lifecycle skill SHALL begin from fresh `change status` guidance and SHALL treat the returned reconciled state, validity projections, blockers, and next action as canonical.

Under `workflow: preserve` without required spec-gate recovery, the active skill MAY review drifted artifacts in place: inspect semantic consistency and dependent artifacts, correct content when within that skill's authorized scope, and run structural validation to establish a new baseline. Structural success MUST NOT be presented as semantic review, approval renewal, or verification renewal.

The skill SHALL redirect to `specd-design` when artifact authoring, design correction, a new design decision, or required spec-approval recovery is necessary. Implement, verify, and change-scoped compliance SHALL respect mandatory spec-consent recovery. `changes verification invalidate <name> --reason <text>` withdraws completed evidence; explicit `start` begins a new attempt. Archive refuses stale or unknown required verification and incomplete live tasks.

Both `specd-verify` and `specd-compliance --change <name>`, when invoked independently, SHALL support any active lifecycle state and execute `changes verification start <name>` before verification work, then perform checks and produce findings/report, then execute `changes verification complete <name>` only after success. Applicable hooks and report generation precede completion. CLI completion records the skill's declaration, not execution of tests. Neither skill requires entering `verifying` merely to produce evidence; lifecycle advancement remains a separate authorized action.

When verify optionally invokes compliance in full mode, verify SHALL start before scenario checks and explicitly pass both `--delegated` and `--attempt <attemptId>`. Delegated compliance participates in that attempt and returns its audit result without start or complete. It remains a complete change-scoped audit mode: it resolves status and project context, discovers the change specs and direct dependencies, reads merged specs through `changes spec-preview`, writes under the change's reports directory, and emits the change-scoped compliance filename. Every downstream mode branch that applies to standalone `--change` also applies to delegated mode except verification-attempt ownership.

Verify alone completes after both scenario verification and audit succeed. Simple verify runs start/checks/complete without compliance. An existing active attempt alone MUST NOT imply delegation; independent invocations start their own attempt. Compliance modes without a concrete active change produce reports without change-verification commands.

If fingerprints change, the owning skill SHALL inspect differences, resolve their cause, explicitly start again, and repeat verification work before completion. It MUST NOT start after testing and immediately complete using earlier results. Failed checks, interrupted work, or failed delegated audits MUST NOT record successful completion. Renewing evidence requires neither a self-transition nor leaving and re-entering a phase.

Skills MUST NOT independently calculate fingerprints, invalidate projections, select recovery targets, or assume that `preserve` permits forward progress with unresolved non-task review.

### Requirement: Implementation traceability policy

AI agents SHALL maintain implementation traceability as part of normal change workflow.

Specifically:

- agents MUST use `specd changes implementation add` to confirm relevant spec-to-file or spec-to-symbol links
- agents MUST treat tracked implementation files as a review surface distinct from confirmed links
- agents MUST explicitly resolve or ignore tracked implementation files before archive
- when resolving or ignoring multiple files, agents SHOULD use comma-separated lists in the `--file` option for better efficiency
- agents SHALL use implementation integrity review when stale symbol links or sidecar maintenance issues are present

### Requirement: Context optimization policy

When `llmOptimizedContext` is enabled, the system SHALL prefer using ultra-terse representations for all context compiled from metadata.

Orchestrator agents SHOULD delegate context optimization to specialized subagents (`specd-project-context-optimizer`, `specd-spec-context-optimizer`) whenever the runtime supports subagent flows.

If subagent flows are not supported, the orchestrator agent SHALL perform optimization inline following the "smart caveman" style defined in [`skills:agents`](../agents/spec.md).

## Spec Dependencies

- [`cli:command-resource-naming`](../cli/command-resource-naming/spec.md) — canonical plural naming in agent-facing commands
- [`skills:agents`](../agents/spec.md) — optimizer agents and prompts
- [`cli:spec-context`](../../cli/spec-context/spec.md) — semantic spec context and dependency traversal
- [`cli:spec-metadata`](../../cli/spec-metadata/spec.md) — metadata projection and diagnostics
- [`core:get-status`](../../core/get-status/spec.md) — reconciled lifecycle, validity, blockers, and next action
- [`core:validate-artifacts`](../../core/validate-artifacts/spec.md) — structural validation and baseline establishment
- [`core:transition-checks`](../../core/transition-checks/spec.md) — canonical validity verdict and recovery priority
