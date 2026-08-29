# Design: refine-fasttrack-skill-template

## Context & scope

This change enriches the standard packaged fast-track skill template (`packages/skills/templates/skills/specd-fasttrack/SKILL.md.tpl`) and updates its specification contract in `skills:skill-templates-source`.

The goal is to ensure that all agent plugins install a deterministic, self-contained `specd-fasttrack` skill that provides:

1. Copy-paste ready, literal Markdown scaffolding for the exploration journal (`.specd-exploration.md`) and the consolidation summary.
2. An explicit critical rule requiring agents to copy the 9 mandatory directives for `/specd-design` verbatim without summarizing or omitting anything.
3. A normative **Codebase-Wide Adoption & Affected Areas (MUST)** directive ensuring that `/specd-design` evaluates other parts of the monorepo that could adopt the new feature/fix.
4. Strict task transfer rules ensuring `/specd-design` transfers completed tasks directly as marked completed (`- [x]`) and gap/audit tasks as open (`- [ ]`) without resetting tasks to zero.
5. Interactive confirmation questions and explicit stop gates in Step 2 and Step 6.

## Approach

1. **Keep the template inline and self-contained**:
   All exploration journal scaffolding, directives, and consolidation structures are embedded directly inside `packages/skills/templates/skills/specd-fasttrack/SKILL.md.tpl`. This avoids creating external Markdown files in `@specd/skills` that would require custom shared-template routing during plugin installation.

2. **Verbatim directives preservation**:
   The critical rule in Step 2 explicitly states:
   `**CRITICAL RULE:** You MUST copy the '> **MANDATORY DIRECTIVES FOR \`/specd-design\`**:' block below **VERBATIM (EXACTLY AS-IS)\*\* into the header of '<changePath>/.specd-exploration.md'. Do NOT summarize, alter, or omit any of the 9 numbered directives.`

3. **Task-bearing artifact integration**:
   Directive 6 and Consolidation Section 6 explicitly require `/specd-design` to generate tasks from the journal's completed work directly as `- [x]`, preserving the implementation audit trail.

4. **Handlebars safety**:
   Preserve all existing dynamic Handlebars tags (`{{{frontmatter}}}`, `@{{sharedFolder}}/shared.md`, `{{#if capabilities.mcp}}`, `{{#if capabilities.agents}}`).

## Affected areas

- `packages/skills/templates/skills/specd-fasttrack/SKILL.md.tpl`: Main template containing the fast-track workflow instructions.
- `.agents/skills/specd-fasttrack/SKILL.md`: Local workspace development copy rendered from the template.
- `packages/skills/test/`: Existing vitest test suite validating that standard skill discovery, capability filtering, and bundle resolution continue passing cleanly.

## New / modified constructs

No new TypeScript types or classes are introduced. The modification is purely to template source content and its specification invariants:

- **`SKILL.md.tpl` Step 2**: Adds interactive question and full `.specd-exploration.md` markdown template with the 9 directives.
- **`SKILL.md.tpl` Step 5**: Adds structured `Consolidation & Audit Summary` markdown template with direct `- [x]` completed tasks guidance.
- **`SKILL.md.tpl` Step 6**: Adds `MANDATORY STOP RULES` and formatted confirmation block.

## Downstream impact & blast radius

- **Blast Radius**: LOW. The change affects template rendering and documentation only.
- **Plugin consumers**: All plugins (`plugin-agent-claude`, `plugin-agent-copilot`, `plugin-agent-codex`, `plugin-agent-opencode`, `plugin-agent-standard`) consume `@specd/skills` templates during `install` / `update` without requiring code modifications in the plugin packages.

## Testing & verification strategy

1. **Unit & Integration Tests**:
   - Run `pnpm --filter @specd/skills test` to ensure all 8 test files (48 tests) pass without regression.
2. **Template Output Inspection**:
   - Verify that `.agents/skills/specd-fasttrack/SKILL.md` renders valid Markdown with proper frontmatter and relative shared references.

## Documentation

- Updated `skills:skill-templates-source` specification in SpecD.
- No public web docs modifications required.

## Open questions

None.
