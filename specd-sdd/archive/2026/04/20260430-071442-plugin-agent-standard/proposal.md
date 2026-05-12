# Proposal: plugin-agent-standard

## Motivation

specd currently ships agent plugins for four vendor-specific clients (Claude, Copilot, Codex, OpenCode), but lacks a plugin for the open [Agent Skills standard](https://agentskills.io/). As more agents adopt this standard (Gemini CLI, Cursor, Amp, Roo Code, etc.), a vendor-neutral plugin lets specd skills work with any compliant agent without per-vendor plugins.

## Current behaviour

specd has four agent plugins, each targeting a specific client with its own install directory and frontmatter format:

- `plugin-agent-claude` → `.claude/skills/` with Claude-specific fields (`allowed_tools`, `argument_hint`, etc.)
- `plugin-agent-copilot` → `.github/skills/` with Copilot-specific fields
- `plugin-agent-codex` → `.codex/skills/` with Codex-specific fields
- `plugin-agent-opencode` → `.opencode/skills/` with basic standard fields (no `allowed-tools`)

None of these emit the `allowed-tools` field defined by the Agent Skills specification. Agents that implement the open standard cannot consume specd skills from a single generic plugin.

## Proposed solution

Add `@specd/plugin-agent-standard` — a new agent plugin that installs specd skills into `.agents/skills/` using the [agentskills.io](https://agentskills.io/specification) frontmatter format. The plugin emits the standard fields (`name`, `description`, `license`, `compatibility`, `metadata`) plus the experimental `allowed-tools` field for pre-approved tool access, enabling any compliant agent to discover and use specd skills out of the box.

The implementation clones the `plugin-agent-opencode` structure and adapts the frontmatter type and install directory. It also registers the new plugin across the monorepo integration points (CLI, meta-package, commitlint scopes, specd.yaml).

## Specs affected

### New specs

- `plugin-agent-standard:plugin-agent`: Defines the Agent Skills standard plugin contract — factory export, domain layer, frontmatter type matching the agentskills.io specification (`name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`), install/uninstall use cases targeting `.agents/skills/`, and integration requirements (CLI init wizard, meta-package dependency, commitlint scope).
  - Depends on: `plugin-agent-opencode:plugin-agent`, `default:_global/commits`

### Modified specs

- `default:_global/commits`: Adds `plugin-agent-standard` to the `scope-enum` list in the "Automated enforcement" requirement so commits targeting the new package are accepted by commitlint.
  - Depends on (added): none

## Impact

**New package:** `packages/plugin-agent-standard/` with full plugin implementation (domain types, frontmatter map, install/uninstall use cases, factory, tests).

**Existing files to modify:**

- `packages/cli/package.json` — add workspace dependency
- `packages/cli/src/commands/project/init.ts` — add to `AVAILABLE_AGENT_PLUGINS` list
- `packages/specd/package.json` — add workspace dependency
- `commitlint.config.mjs` — add `plugin-agent-standard` to scope-enum
- `specd.yaml` — add to `plugins.agents` list and update context instruction (this is done by specd plugin install)

**No API or data model changes.** The new plugin implements the existing `AgentPlugin` contract from `@specd/plugin-manager`.

## Technical context

- **Agent Skills specification** (agentskills.io): frontmatter fields are `name` (required), `description` (required), `license`, `compatibility`, `metadata`, `allowed-tools` (experimental, space-separated string). The `allowed-tools` key uses a hyphen — not the underscore used by Claude-specific tooling.
- **allowed-tools values** will mirror the Claude plugin's tool patterns (`Bash(node *)`, `Bash(specd *)`, `Read`, `Write`, `Edit`, `Grep`, `Glob`, etc.) adapted to the standard's space-separated format.
- **Install directory** `.agents/skills/` follows the existing convention of `.<agent>/skills/` but uses a generic name since the standard is vendor-neutral.
- The package structure mirrors `plugin-agent-opencode` exactly: `src/domain/types/`, `src/domain/frontmatter/`, `src/application/use-cases/`, `src/index.ts`, `test/`.
- The plugin is an adapter package with no domain logic — it delegates to `@specd/skills` for repository access and `@specd/plugin-manager` for the plugin contract.

## Open questions

_none_
