# Proposal: refine-fasttrack-skill-template

## Motivation

The `specd-fasttrack` workflow enables exploratory, code-first development, spikes, and interactive bugfixes while preserving traceability and governance in SpecD. However, the standard packaged skill template lacked literal Markdown scaffolding for the exploration journal and lacked explicit, normative directives for the downstream design phase.

Without literal scaffolding and explicit directives, agents running fast-track had to improvise the structure of `.specd-exploration.md`, occasionally missed transferring completed tasks to formal design artifacts (or erroneously reset them to open tasks), failed to systematically check the rest of the codebase for adoption opportunities, or summarized directives rather than passing them verbatim to `/specd-design`.

Enriching the packaged template `packages/skills/templates/skills/specd-fasttrack/SKILL.md.tpl` ensures all agent plugins install an unambiguous, self-contained workflow contract.

## Current behaviour

`packages/skills/templates/skills/specd-fasttrack/SKILL.md.tpl` previously described journal sections and `/specd-design` instructions in brief prose paragraphs. As a result:

- Agents did not have a copy-paste ready Markdown template for `.specd-exploration.md` containing the 9 binding directives for `/specd-design`.
- The directive requiring `/specd-design` to generate tasks from the journal's completed work directly as marked completed (`- [x]`) was not explicitly stated.
- The directive requiring `/specd-design` to investigate codebase-wide adoption (`specd graph search`, grep) to eliminate duplicate logic across packages was only mentioned informally.
- The rule instructing agents to copy the mandatory directives block verbatim was absent.

## Proposed solution

Enrich `packages/skills/templates/skills/specd-fasttrack/SKILL.md.tpl` and update its governing spec `skills:skill-templates-source`:

1. Provide the exact, literal Markdown scaffolding for `<changePath>/.specd-exploration.md` in Step 2, including the 9 numbered directives for `/specd-design`.
2. Add the explicit critical rule requiring agents to copy the mandatory directives block into `.specd-exploration.md` **VERBATIM (EXACTLY AS-IS)**.
3. Formally specify that tasks recorded under `## Completed Work` in the journal MUST be generated directly as marked completed (`- [x]`) in the task-bearing artifact, preserving the full audit trail.
4. Formally specify the **Codebase-Wide Adoption & Affected Areas (MUST)** directive in the template and spec.
5. Provide the exact Markdown scaffolding for `## Consolidation & Audit Summary` in Step 5.
6. Provide interactive confirmation questions and explicit stop gates in Step 2 and Step 6.
7. Keep the template fully self-contained within `SKILL.md.tpl` so agent plugins install and render it deterministically without extra external file dependencies.

## Specs affected

### New specs

None.

### Modified specs

- `skills:skill-templates-source`: updates the requirement `Fast-track workflow template` to require verbatim directives, literal exploration scaffolding, direct generation of completed tasks as `- [x]`, codebase-wide adoption search, and explicit stop gates in `specd-fasttrack`.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- **Affected files**: `packages/skills/templates/skills/specd-fasttrack/SKILL.md.tpl` and tests in `packages/skills/test/`.
- **Plugins**: All agent plugins (`claude`, `copilot`, `codex`, `opencode`, `standard`) automatically render and install the enriched template upon update/install.
- **Risk**: LOW. Pure documentation/prompting template refinement with no runtime engine breaking changes.

## Technical context

- `SkillTemplateMetadata` and `FsSkillRepository` in `@specd/skills` resolve `SKILL.md.tpl` and inject runtime-specific frontmatter and shared context variables.
- Keeping the exploration template inline in `SKILL.md.tpl` rather than splitting into separate markdown files avoids complex shared file routing and ensures 100% portability across all agent plugins.
- Vitest suite in `@specd/skills` verifies that template resolution and capability filtering work as expected.

## Open questions

None.
