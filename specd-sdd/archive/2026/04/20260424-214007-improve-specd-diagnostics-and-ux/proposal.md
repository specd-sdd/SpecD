# Proposal: improve-specd-diagnostics-and-ux

## Motivation

The SpecD CLI currently produces ambiguous "warning" messages for non-blocking validation issues and generic error messages during lifecycle transitions. This lack of precision causes significant friction for AI agents, which often over-correct informative notes as if they were blocking errors, and leads to "JSON blindness" when diagnosing large changes.

## Current behaviour

- Validation messages are labeled as "warning", implying a failure or a bug, even for non-blocking AST/Delta suggestions.
- Transition errors (e.g., `designing` to `ready`) are generic, stating that an artifact is "not complete" without specifying which file or spec is missing or stale.

## Proposed solution

1. **Semantic Labeling**: Reserved `note:` labeling for AST/Delta suggestions during `change validate` (e.g., "consider using rename"). All other advisory conditions (stale metadata, overlap, etc.) remain as `warning:`.
2. **Next Action Engine**: `GetStatus` will return a structured `nextAction` object (`targetStep`, `actionType`, `command`) to guide agents between mechanical (automated) and cognitive (manual) steps.
3. **High-Visibility Blockers, DAG & Scope**:
   - Adding a dedicated "Blockers" section to `change status` (Text and Toon) for immediate attention.
   - **Artifact DAG Visualization**: ASCII tree rendering of the dependency hierarchy.
   - **Scope Visibility**: Explicit `[scope: change]` or `[scope: spec]` labels for every node in the DAG.
   - **Visual Legend**:
     ```text
     artifacts (DAG):
       [✓] complete  [ ] missing  [!] drifted  [~] needs review  [?] in-progress
     ```
4. **Enhanced Failure Diagnostics**:
   - `TransitionChange` will throw detailed `InvalidStateTransitionError` when artifacts are incomplete, listing specific statuses (e.g., "is missing", "has drifted", "is blocked by an upstream review").
   - CLI will render a "Repair Guide" on failure, surfacing the `nextAction.reason` and `nextAction.command`.
5. **Semantic Status Propagation**:
   - Introduction of `pending-parent-artifact-review` state.
   - `effectiveStatus` propagation: A child artifact dependent on a parent that `drifted-pending-review` or `pending-review` will recursively report `pending-parent-artifact-review`.
6. **Skill UX Optimization**: Updating project skills to use `--format text` for lifecycle status checks and `--format toon` for retrieving change metadata.

## Visual Example (Artifact DAG)

```text
artifacts (DAG):
  [✓] complete  [ ] missing  [!] drifted  [~] needs review  [?] in-progress

  [~] proposal [scope: change]
  └─ [~] specs [scope: spec]
     ├─ [~] verify [scope: spec]
     │  └─ [~] design [scope: change]
     │     └─ [!] tasks [scope: change]
```

## Specs affected

### New specs

- `skills:workflow-automation`: Defines the policy for text-based diagnostics and TOON data extraction.
  - Depends on: none

### Modified specs

- `core:core/change`: Introduce `pending-parent-artifact-review` state and semantic status propagation in `effectiveStatus`.
  - Depends on (added): none
- `core:core/get-status`: Add explicit "Blockers" identification and "Next Action" recommendation logic.
  - Depends on (added): `core:core/change`, `core:core/kernel`, `core:core/transition-change`, `core:core/schema-format`, `core:core/config`
- `core:core/transition-change`: Enhance failure reporting with detailed reason propagation.
  - Depends on (added): `core:core/change`, `core:core/run-step-hooks`, `core:core/hook-execution-model`, `core:core/workflow-model`, `default:_global/architecture`
- `cli:cli/change-status`: Update text/toon output to include the high-visibility Blockers section, Artifact DAG (with scope/legend), and Recommended Action.
  - Depends on (added): `cli:cli/entrypoint`, `core:core/change`, `core:core/get-status`
- `cli:cli/change-transition`: Enhance failure reporting with Repair Guide instructions.
  - Depends on (added): `cli:cli/entrypoint`, `core:core/change`, `core:core/transition-change`, `core:core/hook-execution-model`
- `cli:cli/change-validate`: Rename labels to `note:` strictly for AST/Delta optimization hints.
  - Depends on (added): `cli:cli/entrypoint`, `core:core/change`, `core:core/validate-artifacts`, `core:core/spec-id-format`

## Impact

- **Core**: `GetStatus` and `TransitionChange` use cases.
- **CLI**: `change status`, `change transition`, `change validate` commands.
- **Skills**: All specd-related skills in the monorepo.

## Technical context

- **Decision** → Rename "warning" to "note" in validation outputs for optimization suggestions.
- **Decision** → List specific missing files in transition errors.
- **Decision** → Add a "Blockers" section to `change status` text output.
- **Agreements reached**: Transition errors should be instructions for repair, not just statements of fact. JSON is for data; Text is for diagnostics.

## Open questions

- Should the `note:` label be color-coded differently (e.g., blue/cyan) in the CLI?
- Do we need a `specd change doctor` command?
