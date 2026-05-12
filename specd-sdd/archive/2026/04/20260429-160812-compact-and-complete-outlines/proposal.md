# Proposal: compact-and-complete-outlines

## Motivation

`change artifact-instruction` currently returns oversized payloads by embedding outlines for every spec in scope. This adds noise, increases token cost, and makes it harder for agents to find the relevant structure quickly. At the same time, always returning full outline detail and hints can be too verbose for common delta-authoring flows.

## Current behaviour

Today, `GetArtifactInstruction` (and its CLI surface) includes only compact `availableOutlines` references, which is good. However, outline retrieval still tends toward a full-detail shape, and recent selector-hint expansion introduced verbosity that may exceed what users need by default. Outline content should remain discoverable, but routine workflows should start from a smaller, actionable view.

Workflow guidance in skills is now normative about fetching outlines on demand through `specd specs outline <specPath> --artifact <artifactId>`.

## Proposed solution

Split outline discovery from instruction delivery and add explicit outline detail modes:

1. `change artifact-instruction` returns only a compact list of available outline references (spec IDs), not embedded outline trees.
2. `specd specs outline <specPath> --artifact <artifactId>` remains the on-demand retrieval command, with verbosity controls:
   - default mode: parser-specific actionable subset for day-to-day delta authoring, aligned with historical behavior from the pre-expansion implementation.
   - `--full`: include all selector-addressable node families.
   - `--hints`: include a root-level `selectorHints` object that documents hint placeholders per node type included in the current mode.
3. Keep canonical workflow guidance: first discover candidates via `availableOutlines`, then fetch only the needed spec/artifact outline on demand.
4. Align parser and CLI contracts with this mode model so defaults stay compact while advanced inspection remains available.
5. Avoid repeating hint payload in every outline entry. The command response should expose:
   - `selectorHints` (root-level, grouped by node type, placeholder-driven),
   - `outline` (structural entries without duplicated per-node hint objects).
6. Default subset baseline (from prior `git` behavior):
   - markdown: `section`
   - json: `property`, `array-item`
   - yaml: `pair`
   - plaintext: `paragraph`
     This baseline is owned by parser defaults, not hardcoded by the use case.

## Specs affected

### New specs

- _none_

### Modified specs

- `cli:cli/change-artifact-instruction`: Keep compact output contract centered on `availableOutlines` and preserve no-inline-outline behavior.
  - Depends on (added): none

- `core:core/get-artifact-instruction`: Keep result shape focused on compact outline references (spec IDs only) for instruction payloads.
  - Depends on (added): `core:core/get-spec-outline`

- `core:core/delta-format`: Clarify how outline detail modes map to selector-authoring guidance.
  - Depends on (added): `core:core/selector-model`, `core:core/artifact-parser-port`

- `cli:cli/spec-outline`: Extend command contract with mode semantics for default subset, `--full`, and `--hints`, including root-level `selectorHints` metadata.
  - Depends on (added): none

- `core:core/get-spec-outline`: Ensure use-case contract supports mode-aware outline retrieval (default subset vs full coverage) and optional root-level hint metadata sourced from parser contract.
  - Depends on (added): `core:core/artifact-parser-port`, `core:core/selector-model`

- `core:core/artifact-parser-port`: Clarify outline-generation contract for compact defaults and optional hint/full expansions, including parser-owned selector hint metadata surfaced at response level instead of repeated per entry.
  - Depends on (added): `core:core/selector-model`

- `skills:workflow-automation`: Keep normative workflow rule requiring on-demand outline retrieval via `specd specs outline <specPath> --artifact <artifactId>`.
  - Depends on (added): `cli:cli/spec-outline`

## Impact

- Core and CLI contracts for outline retrieval behavior, mode flags, and root-level hint metadata shape.
- Parser adapter output expectations per format for default subset vs full mode.
- Skill templates/instructions that guide agents toward low-noise default usage.
- Tests across core/cli/skills for compact defaults, `--full`, `--hints`, root-level `selectorHints`, and compatibility with existing `availableOutlines` workflow.

## Technical context

Decisions confirmed in discussion:

- `change instructions` must stay compact and practical for LLM flows.
- Compact shape is an explicit list, e.g. `availableOutlines: ['core:core/config', 'cli:otro-spec']`.
- Full outline data is fetched only when needed through `specd specs outline <specPath> --artifact <artifactId>`.
- Default outline output should prioritize low noise; full selector coverage remains available in explicit full mode.
- `selectorHints` should be optional and user-controlled via `--hints` instead of always-on verbosity.
- Hint values should be placeholder-style documentation (e.g. `"<value>"`, `"<contains>"`, `"<level>"`) grouped by type, not repeated concrete values per node.
- The `specs outline` path and skills policy remain normative.

## Open questions

- _none_
