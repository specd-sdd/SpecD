# Agent Instruction Template

## Purpose

Define the shared agent instruction prompt template (`agent-instruction.md.tpl`), rendering interface (`renderBaseAgentInstruction`), and Markdown block management helper utilities (`injectSpecdBlock`, `removeSpecdBlock`) in `@specd/skills` to initialize AI agent runtimes with standardized `specd` workflow instructions during plugin installation.

## Requirements

### Requirement: Shared Base Instruction Template

`@specd/skills` MUST provide a shared Handlebars template (`agent-instruction.md.tpl`) under `templates/prompt/` that renders standard `specd` agent instructions.

- The template MUST define standard entry points (`/specd` for general project orientation with `specd project status --context --graph`, `/specd-new` for intent discovery and change creation).
- The template MUST define a mandatory Code Graph research protocol (`specd graph`) as the primary research tool, explicitly instructing agents that generic search tools (`grep`, `glob`, file reads) are legacy fallbacks.
- The template MUST instruct agents to check index freshness (`stale: true`) and immediately run `specd graph index --format toon` if the index is out of date.
- The template MUST include concrete CLI examples for symbol search, blast-radius impact analysis, dependency tracing, hotspots, and spec search using `--format toon`.
- The template MUST include strict workflow rules, skill stop rules, and the explicit user escape hatch (override rule).
- The template MUST support an optional `extraInstructions` slot rendered inside the base `<!-- <specd> -->` block when provided.

### Requirement: Base Prompt Rendering Interface

`@specd/skills` MUST export a function `renderBaseAgentInstruction(options?: RenderBaseAgentInstructionOptions): Promise<string>`.

- `RenderBaseAgentInstructionOptions` MAY accept `extraInstructions?: string`.
- When `extraInstructions` is provided and non-empty, the rendered prompt MUST include `extraInstructions` inside the `<!-- <specd> -->` block.
- When `extraInstructions` is omitted or empty, the rendered prompt MUST render only the clean base prompt without trailing empty headers or sections.

### Requirement: Idempotent Markdown Block Management

`@specd/skills` MUST export helper utilities `injectSpecdBlock(filePath: string, content: string, blockId?: string): Promise<void>` and `removeSpecdBlock(filePath: string, blockId?: string): Promise<void>`.

- `injectSpecdBlock` MUST manage blocks delimited by `<!-- <specd> -->` ... `<!-- </specd> -->` when `blockId` is omitted or undefined.
- `injectSpecdBlock` MUST manage blocks delimited by `<!-- <specd-plugin:<blockId>> -->` ... `<!-- </specd-plugin:<blockId>> -->` when `blockId` is provided.
- `injectSpecdBlock` MUST insert the block if not present, update the block content if present, and preserve all surrounding user content in `filePath`.
- If `content` passed to `injectSpecdBlock` is empty or contains only whitespace:
  - If `blockId` is provided, `injectSpecdBlock` MUST NOT insert empty comment tags and MUST remove any existing block matching `blockId`.
  - If `blockId` is omitted, `injectSpecdBlock` MUST NOT insert empty base tags.
- `removeSpecdBlock` MUST remove the target block matching `blockId` (or default base block) without leaving orphaned comment tags.
- `removeSpecdBlock` MUST perform reference-counted cleanup on shared files: if all plugin-specific blocks (`<!-- <specd-plugin:* -->`) have been removed, it MUST also remove the shared `<!-- <specd> -->` base block.

### Requirement: Shared File Plugin Registration

When multiple agent plugins target the same instruction file (e.g. `AGENTS.md`), each plugin MUST inject a plugin-specific registration marker block using `injectSpecdBlock(filePath, registrationContent, pluginName)` alongside the shared base `<!-- <specd> -->` block.

- The registration content MUST be a non-empty string identifying the plugin (e.g. `"Registered by @specd/plugin-agent-<name>"`).
- This marker block enables reference-counted cleanup: `removeSpecdBlock(filePath, pluginName)` will remove the plugin's marker, and if no other plugin markers remain, the shared base block is also removed.
- Plugins targeting exclusive instruction files (e.g. `CLAUDE.md`, `.github/copilot-instructions.md`) do NOT inject plugin-specific marker blocks; they use only the base `<!-- <specd> -->` block.

### Requirement: Safe JSON Config Merge Utilities

`@specd/skills` MUST export safe JSON configuration helpers `mergeJsonConfig<T>(filePath: string, updater: (existing: T) => T): Promise<void>` and `unmergeJsonConfig<T>(filePath: string, updater: (existing: T) => T): Promise<void>`.

- `mergeJsonConfig` MUST read the existing JSON file, parse it, pass the parsed object to the `updater` function, and write the result back as formatted JSON with a trailing newline.
- If the target file does not exist or contains invalid JSON, `mergeJsonConfig` MUST pass an empty object `{} as T` to the `updater` and create the file (including parent directories).
- `mergeJsonConfig` MUST NOT overwrite existing top-level properties not touched by the `updater`.
- `unmergeJsonConfig` MUST read the existing JSON file, parse it, pass the parsed object to the `updater` function, and write the result back.
- If the target file does not exist or contains invalid JSON, `unmergeJsonConfig` MUST be a graceful no-op.
- Both utilities MUST write formatted JSON with 2-space indentation and a trailing newline.

## Spec Dependencies

_None — this spec defines standalone utility functions with no specd workspace dependencies._
