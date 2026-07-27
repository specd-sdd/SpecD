# Proposal: agent-plugin-prompt-injection

## Motivation

When AI agent plugins (`plugin-agent-claude`, `plugin-agent-opencode`, `plugin-agent-copilot`, `plugin-agent-codex`, `plugin-agent-standard`) are installed into a project, there is currently no official mechanism to automatically inject an entry prompt or system instructions guiding the target agent to adopt the `specd` workflow (`/specd`, `/specd-new`, `specd graph`, etc.). Users must manually copy and paste instructions or maintain custom configurations across different agent tools.

Furthermore, multiple agent plugins may target shared instruction files (e.g. `AGENTS.md` used by OpenCode, Codex, and Standard agents), while others target exclusive vendor files (e.g. `CLAUDE.md` for Claude Code or `.github/copilot-instructions.md` for Copilot). A naive single-block approach risks overwriting plugin-specific instructions when multiple plugins target a shared file.

## Current behaviour

Plugins currently install skill bundles into agent-specific directories (such as `.claude/skills` or `.agents/skills`), but they do not initialize agent entry points or system instructions. As a result, newly installed agent plugins are passive and do not know how to interact with `specd` unless the user manually instructs them or creates custom rule files.

## Proposed solution

Implement an automated agent initialization mechanism triggered directly within each plugin's `install()` and `uninstall()` methods during plugin operations that:

1. **Centralizes Base Instruction Template in `@specd/skills`**:
   - Provides a shared base template (`agent-instruction.md.tpl`) defining standard `specd` agent entry points (`/specd`, `/specd-new`), mandatory Code Graph research protocol (`specd graph`), index freshness checks (`stale: true` → `specd graph index --format toon`), strict skill stop rules, instruction precedence, and the explicit user escape hatch.
   - Exposes `renderBaseAgentInstruction(options?: { extraInstructions?: string })` in `@specd/skills`. If `extraInstructions` is provided and non-empty, it is rendered directly inside the base `<!-- <specd> -->` block.

2. **Idempotent Markdown Block Management (Exclusive & Shared Files)**:
   - **Exclusive Files (`CLAUDE.md`, `.github/copilot-instructions.md`)**: The plugin injects a single unified `<!-- <specd> -->` block. No plugin marker is added.
   - **Shared Files (`AGENTS.md`)**: The base `<!-- <specd> -->` block is injected. No plugin-specific marker block is added — all plugins using `AGENTS.md` write only the base block. Legacy `<!-- <specd-plugin:* > -->` marker blocks from previous installs are removed during `install()` and `uninstall()`.

3. **Clean Universal Instruction Block**:
   - The prompt text focuses strictly on `specd` workflow directives, entry points, research protocols, and escape hatch rules.
   - **Empty Block Rule**: If `content` is empty or whitespace-only, `injectSpecdBlock(filePath, "", blockId)` is a no-op and does not insert empty tags into the file.

4. **Minimal Uninstall Cleanup**:
   - **`install`**: Writes base `<!-- <specd> -->` block and removes any legacy plugin marker blocks.
   - **`uninstall`**: Removes any legacy plugin marker block (no-op if absent), then removes the base `<!-- <specd> -->` block.
   - **`update`**: Re-injects base prompt idempotently, purging any old plugin markers.

---

## Specs affected

### New specs

- `skills:agent-instruction-template`: Defines the shared agent instruction prompt template, `renderBaseAgentInstruction({ extraInstructions? }): Promise<string>`, and block management (`injectSpecdBlock`, `removeSpecdBlock`) in `@specd/skills`.
  - Depends on: none (standalone utility functions)

### Modified specs

- `plugin-manager:install-plugin-use-case`: Updated to document that installing an `AgentPlugin` delegates agent prompt injection to the plugin's `install()` implementation.
  - Depends on (added): `skills:agent-instruction-template`
  - Depends on (removed): none
- `plugin-agent-claude:plugin-agent`: Updated to inject `CLAUDE.md` base prompt (exclusive file, no plugin marker).
  - Depends on (added): `skills:agent-instruction-template`
  - Depends on (removed): none
- `plugin-agent-opencode:plugin-agent`: Updated to inject `AGENTS.md` base prompt only (shared file, no marker injected; legacy markers removed).
  - Depends on (added): `skills:agent-instruction-template`
  - Depends on (removed): none
- `plugin-agent-copilot:plugin-agent`: Updated to inject `.github/copilot-instructions.md` base prompt (exclusive file).
  - Depends on (added): `skills:agent-instruction-template`
  - Depends on (removed): none
- `plugin-agent-codex:plugin-agent`: Updated to inject `AGENTS.md` base prompt only (shared file, no marker injected; legacy markers removed).
  - Depends on (added): `skills:agent-instruction-template`
  - Depends on (removed): none
- `plugin-agent-standard:plugin-agent`: Updated to inject `AGENTS.md` base prompt only (shared file, no marker injected; legacy markers removed).
  - Depends on (added): `skills:agent-instruction-template`
  - Depends on (removed): none

## Impact

- **`@specd/skills`**: Exposes `renderBaseAgentInstruction(options?)` along with helper functions for block manipulation (`injectSpecdBlock`, `removeSpecdBlock`).
- **`@specd/plugin-manager`**: Delegates agent prompt initialization and teardown through the `AgentPlugin` `install()` / `uninstall()` contract.
- **`plugin-agent-*` packages**: Implement agent-specific target path mapping and prompt block injection during `install()` / `uninstall()`. No native hook scripts or JSON config modifications are performed.

## Technical context

- **Idempotent Block Injection**: `injectSpecdBlock` replaces an existing block if found or appends it. `removeSpecdBlock` removes a block only if present, and is a safe no-op otherwise.
- **Legacy Marker Cleanup**: Shared file plugins (`opencode`, `codex`, `standard`) call `removeSpecdBlock(path, 'pluginId')` during both `install()` and `uninstall()` to purge any `<!-- <specd-plugin:pluginId> -->` blocks left by older plugin versions.

## Open Questions

_None. All design choices were resolved during exploration._
