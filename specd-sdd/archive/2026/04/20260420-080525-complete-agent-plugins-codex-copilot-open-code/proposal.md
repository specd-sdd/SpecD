# Proposal: complete-agent-plugins-codex-copilot-open-code

## Motivation

The project already ships a real Claude agent plugin, while Codex and Copilot are still stubs and Open Code is missing entirely. This creates inconsistent agent support and blocks teams that want the same skill-install workflow across agents.

## Current behaviour

- `@specd/plugin-agent-claude` installs skills into `.claude/skills/` and injects agent-specific frontmatter.
- `@specd/plugin-agent-codex` and `@specd/plugin-agent-copilot` currently return stub install results (`installed: []`).
- There is no Open Code agent plugin package yet.
- The `specd project init` wizard only exposes the currently known agent plugins and does not include Open Code.
- The `@specd/specd` meta package dependencies do not include `@specd/plugin-agent-opencode`.
- `skills:skill-templates-source` defines plugin-side frontmatter injection, but current concrete coverage is effectively Claude-first.

## Proposed solution

Implement Codex and Copilot plugins to reach parity with Claude's install/uninstall behavior, and add a new Open Code plugin following the same pattern. Keep skill templates frontmatter-free in `@specd/skills`, and make each agent plugin responsible for injecting only the metadata fields that target agent supports.

For Open Code, the execution order is explicit: create the plugin package folder and register its workspace in `specd.yaml` first, then add `plugin-agent-opencode:plugin-agent` to the change scope, and only then write its spec artifacts.

Install targets are fixed for this change:

- Codex: `.codex/skills/`
- Open Code: `.opencode/skills/`
- Copilot (project-level): `.github/skills/`

Frontmatter support is also fixed from vendor docs:

- Codex (`SKILL.md`): `name` and `description` are required.
- Copilot (`SKILL.md`):
  - base skill docs: `name` and `description` required, `license` optional;
  - Copilot CLI skill reference additionally supports `allowed-tools`, `user-invocable`, and `disable-model-invocation`.
- Open Code (`SKILL.md`): `name` and `description` required; `license`, `compatibility`, and `metadata` optional; unknown fields are ignored.

Design principle for this change: frontmatter models must be as exact and complete as possible per target agent (full supported option set), even if runtime defaults only emit a minimal subset for most skills.

## Specs affected

### New specs

- `plugin-agent-opencode:plugin-agent`: Open Code agent plugin contract and behavior (install path, supported frontmatter fields, install/uninstall semantics).
  - Depends on: `plugin-manager:agent-plugin-type`, `skills:skill-templates-source`
- `specd:meta-package`: metapackage dependency contract for `@specd/specd`, including required inclusion of shipped agent plugins.
  - Depends on: `plugin-agent-opencode:plugin-agent`

### Modified specs

- `plugin-agent-codex:plugin-agent`: replace placeholder requirements with concrete install/uninstall + frontmatter-injection behavior at Claude parity.
  - Depends on (added): `skills:skill-templates-source`
- `plugin-agent-copilot:plugin-agent`: replace placeholder requirements with concrete install/uninstall + frontmatter-injection behavior at Claude parity.
  - Depends on (added): `skills:skill-templates-source`
- `skills:skill-templates-source`: extend wording from Claude/Copilot/Codex focus to explicit multi-agent behavior including Open Code, plus supported-field expectations per plugin.
  - Depends on (added): none
- `cli:cli/project-init`: extend interactive plugin-selection requirement so known plugin options include `@specd/plugin-agent-opencode`.
  - Depends on (added): `plugin-agent-opencode:plugin-agent`

## Impact

Affected code areas expected:

- `packages/plugin-agent-codex/` (stub to real plugin implementation)
- `packages/plugin-agent-copilot/` (stub to real plugin implementation)
- `packages/plugin-agent-opencode/` (new package)
- `packages/cli/src/commands/project/init.ts` (known plugin list for interactive wizard)
- `packages/specd/package.json` (metapackage dependency list)
- `specd.yaml` (workspace and agent plugin registration for Open Code)
- `packages/*/package.json` and workspace wiring as needed for the new package
- Tests for Codex/Copilot/Open Code install/uninstall and frontmatter rendering behavior

No external runtime dependencies are required beyond existing `@specd/plugin-manager` and `@specd/skills` usage patterns.

## Technical context

- The agreed approach is to copy the proven `plugin-agent-claude` structure (`InstallSkills` use case + plugin type implementation) and adapt names, install directories, and frontmatter maps per agent.
- Open Code naming is fixed to `plugin-agent-opencode` / `plugin-agent-opencode:plugin-agent`.
- The user explicitly requires workspace setup before spec authoring for Open Code: package folder + `specd.yaml` workspace registration must exist before adding/writing the Open Code spec.
- Copilot install location is based on GitHub's agent-skills docs: project-level skills are supported in `.github/skills` (personal/global location is `~/.copilot/skills`).
- Frontmatter compatibility to encode in plugin behavior:
  - Codex plugin contract should model the full known Codex set (`name`, `description`) and emit configured fields only.
  - Copilot plugin contract should model the full known Copilot set (`name`, `description`, optional `license`, `allowed-tools`, `user-invocable`, `disable-model-invocation`) and emit configured fields only.
  - Open Code plugin contract should model the full known Open Code set (`name`, `description`, optional `license`, `compatibility`, `metadata`) and emit configured fields only.
  - Runtime defaults may remain minimal, but type/model coverage must include the complete supported field matrix per agent.
- Existing implementation reference points:
  - `packages/plugin-agent-claude/src/application/use-cases/install-skills.ts`
  - `packages/plugin-agent-claude/src/domain/frontmatter/index.ts`
  - `packages/plugin-agent-claude/src/domain/types/frontmatter.ts`
  - `packages/plugin-agent-claude/src/domain/types/claude-plugin.ts`
- Current stubs to replace:
  - `packages/plugin-agent-codex/src/index.ts`
  - `packages/plugin-agent-copilot/src/index.ts`
- Existing related specs:
  - `plugin-agent-codex:plugin-agent`
  - `plugin-agent-copilot:plugin-agent`
  - `skills:skill-templates-source`
  - `cli:cli/project-init`
  - `specd:meta-package`
  - `plugin-manager:agent-plugin-type`

## Open questions

- _none (frontmatter scope and precision criteria confirmed during proposal review)_
