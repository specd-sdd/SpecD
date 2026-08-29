# Proposal: fasttrack-context-resolution

## Motivation

The fast-track workflow needs to identify the contracts governing a target file before code-first work begins. It must also remain an explicit opt-in escape hatch rather than being selected for ordinary specd work.

## Current behaviour

Fast-track used generic spec search and raw spec rendering, without checking graph-backed file coverage or configured workspace context. Its routing descriptions did not say that the workflow requires an explicit user invocation.

## Proposed solution

Make fast-track discover file-covering specs through graph impact, combine relevant configured project/workspace context candidates, and load all contracts through compiled spec context. Mark the workflow manual-only in the shared template and in every agent-routing description; emit native model-invocation disablement for Claude and Copilot.

## Specs affected

### New specs

None.

### Modified specs

- `skills:skill-templates-source`: require the fast-track template to use graph coverage and compiled context discovery, and declare its manual-only activation boundary.
  - Depends on (added): none.
  - Depends on (removed): none.
- `plugin-agent-claude:plugin-agent`: require manual-only fast-track routing and Claude model-invocation disablement.
  - Depends on (added): none.
  - Depends on (removed): none.
- `plugin-agent-codex:plugin-agent`: require manual-only fast-track routing metadata.
  - Depends on (added): none.
  - Depends on (removed): none.
- `plugin-agent-copilot:plugin-agent`: require manual-only fast-track routing and Copilot model-invocation disablement.
  - Depends on (added): none.
  - Depends on (removed): none.
- `plugin-agent-opencode:plugin-agent`: require manual-only fast-track routing metadata.
  - Depends on (added): none.
  - Depends on (removed): none.
- `plugin-agent-standard:plugin-agent`: require manual-only fast-track routing metadata.
  - Depends on (added): none.
  - Depends on (removed): none.

## Impact

Changes affect the fast-track template, its contract test, and the per-agent frontmatter maps and installation tests. No public runtime API, storage model, or external service changes are required.

## Technical context

`graph impact --file` exposes `coveringSpecs` with file-level evidence; the result can be empty and must not be assumed from workspace membership alone. `project context-specs` supplies configured candidate specs. The workflow uses `specs context`, never `specs show`. Claude and Copilot have native model-invocation disablement fields; Codex, OpenCode, and the Agent Skills standard rely on the routing description and template instruction.

## Open questions

None.
