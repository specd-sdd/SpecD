# Proposal: remove-legacy-metadata-skill

## Motivation

`specd-metadata` duplicates metadata-optimization work that is now owned by specialized agents. Removing the obsolete skill makes the agent-based interface unambiguous before any external users depend on it.

## Current behaviour

The skills package publishes a `specd-metadata` template, all agent plugins register it as a standard skill, and installed copies remain invocable. Archive guidance also points to the legacy workflow even though `specd-spec-context-optimizer` already performs the per-spec optimized-context update.

## Proposed solution

Remove the legacy skill template, plugin registrations, legacy development copy, and rendered installations. Update active workflow guidance and the template-source contract to use the specialized optimizer agents. Preserve deterministic metadata generation and all metadata CLI/core capabilities.

## Specs affected

### New specs

None.

### Modified specs

- `skills:skill-templates-source`: remove `specd-metadata` from the required standard-template inventory and require rendered bundles to omit removed skill templates.
  - Depends on (added): none
  - Depends on (removed): none
- `skills:agents`: establish specialized optimizer agents as the supported metadata-optimization interface in place of the legacy standard skill.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

Affected areas include `@specd/skills` template discovery and rendering, the frontmatter maps in the Claude, Codex, Copilot, OpenCode, and Standard plugins, the archive workflow template, the legacy development skill, and generated local skill copies. No core metadata data model, API, or persistence behavior changes.

## Technical context

The old skill orchestrates deterministic metadata generation and subagent optimization. The existing `specd-spec-context-optimizer` agent instead updates only `optimizedDescription` and `optimizedContext` through the safe metadata-update path, which preserves fresh deterministic extraction. The template system distinguishes standard skills from specialized agents through separate directories and metadata files. Agent-capability fallback remains supported by rendering agent prompts for manual or inline execution.

The user approved direct removal: there are no users, so no alias, deprecation period, migration documentation, or compatibility fallback is needed. Historical archives and references to the metadata persistence mechanism are out of scope.

## Open questions

None.
