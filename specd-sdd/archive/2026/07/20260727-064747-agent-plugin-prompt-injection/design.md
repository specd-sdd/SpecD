# Design: agent-plugin-prompt-injection

## Overview

This design document acts as the self-contained contract for implementing automated agent prompt initialization across `@specd/skills`, `@specd/plugin-manager`, and all `plugin-agent-*` packages (`plugin-agent-claude`, `plugin-agent-opencode`, `plugin-agent-copilot`, `plugin-agent-codex`, `plugin-agent-standard`). Each plugin, when installed, injects a standardized specd instruction block into the target agent's shared/exclusive instruction file. An implementer reading this document has every signature, regex, file template, export definition, and control flow algorithm needed without referencing external specs.

Native runtime hooks (shell scripts, session plugins) are **out of scope** for this change. Only markdown prompt injection is implemented.

---

## Canonical Prompt Template & Specifications

The shared Handlebars template file is located at `packages/skills/templates/prompt/agent-instruction.md.tpl`. Its exact string content MUST be:

````markdown
<!-- <specd> -->

# specd — Agent Protocol & Instructions

This project is managed by **specd** (spec-driven development & codebase intelligence).

> YOU MUST follow these instructions when reading, writing, or modifying code, and when the tool can drive the workflow you MUST prefer the tool over ad hoc repo navigation.

---

## 1. Mandatory Entry Points & Orienting

- **Main Entry Point:** Use `/specd` (or run `specd project status --context --graph`) to orient yourself, load project context, inspect active changes/drafts, check graph freshness, and decide the next workflow step.
- **New Change Entry Point:** Use `/specd-new` directly if the explicit goal is to create a new change.
- **Lifecycle Skills:** Execute other skills (`specd-design`, `specd-implement`, `specd-verify`, `specd-archive`) according to the active change's state.

## 2. Mandatory Research Protocol (Graph-First)

You are a **Graph-First Agent**. Generic search tools (`grep`, `glob`) and direct file reads are legacy fallbacks that MUST NOT be your first choice.

- **Check Index Freshness:** If `project status` or `graph stats` outputs `stale: true` (or a warning appears), run re-indexing immediately:
  ```bash
  specd graph index --format toon
  ```
````

- **Finding Symbols & Definitions:**
  ```bash
  specd graph search "<query>" --symbols --format toon
  ```
- **Blast Radius Analysis (Dependents):**
  ```bash
  specd graph impact --symbol "<name>" --direction dependents --format toon
  specd graph impact --file "<ws:path>" --direction dependents --format toon
  ```
- **Dependency Tracing (Dependencies):**
  ```bash
  specd graph impact --file "<ws:path>" --direction dependencies --format toon
  ```
- **High-Risk Hotspots:**
  ```bash
  specd graph hotspots --min-risk HIGH --format toon
  ```
- **Spec Requirements Search:**
  ```bash
  specd graph search "<query>" --specs --format toon
  ```

## 3. Mandatory Workflow & Skill Rules

- **Enter Through specd:** Every meaningful code change MUST go through a `specd` change workflow. Specs are the source of truth; code follows specs. Do not edit source files directly without an active change workflow.
- **Follow Skills Literally:** When a `specd` skill is invoked (`specd` or `specd-*`), treat every instruction inside the active skill as binding (especially lines that say "stop", "ask the user", "present and stop"). Do not replace required stop points with autonomous execution.
- **No Autonomous Workflow Progression:** Do NOT advance workflow state (create changes, write artifacts, transition, approve, archive) unless the active skill explicitly permits it without asking.

## 4. Explicit User Override (Escape Hatch)

A direct, explicit user instruction in the current turn may authorize a one-off code or repository edit outside the normal `specd` workflow ONLY IF:

- The user explicitly requests to bypass `specd` for a narrow, local, and immediate task.
- The agent explicitly restates that it is proceeding outside the normal `specd` workflow.
- The agent does NOT perform any `specd` lifecycle operations (create/approve/archive) autonomously.
- This override applies only to the current task and turn context. Default to `specd` when in doubt.

## 5. Instruction Precedence

1. Repository-local instructions in `<specd>` block / agent files
2. Explicit instructions inside the active skill
3. General agent autonomy instructions
   {{#if extraInstructions}}

---

## 6. Agent-Specific Instructions

{{{extraInstructions}}}
{{/if}}

_Generated and managed by @specd. Do not edit manually inside <specd> tags._

<!-- </specd> -->

```

---

## Architecture & Data Flow

```

+-------------------------------------------------------------------+
| @specd/plugin-manager |
| (InstallPlugin / UninstallPlugin / UpdatePlugin use-cases) |
+---------------------------------+---------------------------------+
| (delegates install/uninstall)
v
+---------------------------------+---------------------------------+
| plugin-agent-\* |
| (Claude, OpenCode, Copilot, Codex, Standard implementations) |
+---------------------------------+---------------------------------+
| (imports domain/application helpers)
v
+---------------------------------+---------------------------------+
| @specd/skills |
| - renderBaseAgentInstruction(options?: ...): Promise<string> |
| - injectSpecdBlock(filePath, content, blockId?) |
| - removeSpecdBlock(filePath, blockId?) |
+-------------------------------------------------------------------+

````

---

## Shared File vs Exclusive File Strategy

Plugins target two types of instruction files:

| Type | File | Plugins | Strategy |
|------|------|---------|----------|
| **Exclusive** | `CLAUDE.md` | claude | Base `<!-- <specd> -->` block (or `<!-- <specd agents="claude"> -->`). |
| **Exclusive** | `.github/copilot-instructions.md` | copilot | Base `<!-- <specd> -->` block (or `<!-- <specd agents="copilot"> -->`). |
| **Shared** | `AGENTS.md` | opencode, codex, standard | Shared base block with registered agents attribute: `<!-- <specd agents="opencode,codex,standard"> -->`. Reference-counted cleanup automatically removes the block when all registered agents are uninstalled. |

### Shared File Install Flow (e.g., plugin-agent-opencode)

```typescript
// Render and inject the shared base prompt with plugin registration
const prompt = await renderBaseAgentInstruction()
await injectSpecdBlock(agentsMdPath, prompt, 'opencode')
````

### Shared File Uninstall Flow (e.g., plugin-agent-opencode)

```typescript
// Remove plugin registration from shared block. Removes block only if no other agents remain.
await removeSpecdBlock(agentsMdPath, 'opencode')
```

---

## Detailed Component & Interface Specifications

### 1. `@specd/skills` Package Extensions

#### A. Template Asset & Path Resolver (`packages/skills/src/domain/templates/index.ts`)

```typescript
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function getAgentInstructionTemplatePath(): string {
  // Resolves to packages/skills/templates/prompt/agent-instruction.md.tpl
  return path.resolve(__dirname, '../../../templates/prompt/agent-instruction.md.tpl')
}
```

#### B. Prompt Renderer (`packages/skills/src/application/render-base-agent-instruction.ts`)

```typescript
import { readFile } from 'node:fs/promises'
import Handlebars from 'handlebars'
import { getAgentInstructionTemplatePath } from '../domain/templates/index.js'

export interface RenderBaseAgentInstructionOptions {
  readonly extraInstructions?: string
}

export async function renderBaseAgentInstruction(
  options?: RenderBaseAgentInstructionOptions,
): Promise<string> {
  const templatePath = getAgentInstructionTemplatePath()
  const templateSource = await readFile(templatePath, 'utf8')
  const compiled = Handlebars.compile(templateSource)
  const extraInstructions = options?.extraInstructions?.trim()
  return compiled({
    extraInstructions:
      extraInstructions && extraInstructions.length > 0 ? extraInstructions : undefined,
  })
}
```

#### C. Block Manager (`packages/skills/src/application/specd-block-manager.ts`)

- **Tag Patterns**:
  - Base block pattern: `/<!-- <specd(?:\s+agents="([^"]*)")?\s*> -->([\s\S]*?)<!-- \/specd -->/`
  - Opening tag format with registered agents: `<!-- <specd agents="claude,opencode"> -->`

- **`injectSpecdBlock` Behavior**:
  - Parses content. If empty and `blockId` is specified, calls `removeSpecdBlock(filePath, blockId)`.
  - Reads existing file if present. Matches existing `<!-- <specd ...> --> ... <!-- </specd> -->` block.
  - If `blockId` is provided:
    - Extracts existing `agents` attribute (e.g. `"codex"`). Parses comma-separated array.
    - Adds `blockId` if not already present (e.g. `["codex", "opencode"]`).
    - Constructs opening tag `<!-- <specd agents="codex,opencode"> -->`.
  - Also purges any legacy `<!-- <specd-plugin:<blockId>> -->` blocks from earlier versions.
  - Replaces or appends the block in the file.

- **`removeSpecdBlock` Behavior**:
  - If `blockId` is undefined: removes any `<!-- <specd ...> --> ... <!-- </specd> -->` block unconditionally.
  - If `blockId` is provided:
    - Purges any legacy `<!-- <specd-plugin:<blockId>> -->` block.
    - Reads existing `<!-- <specd agents="..."> -->` tag.
    - Removes `blockId` from the registered `agents` list.
    - If remaining `agents` list is non-empty, updates the opening tag (e.g. `<!-- <specd agents="opencode"> -->`) and preserves the prompt block content.
    - If remaining `agents` list is empty, removes the entire `<!-- <specd ...> --> ... <!-- </specd> -->` block from the file.

#### D. Public Barrel Export (`packages/skills/src/index.ts`)

```typescript
export { renderBaseAgentInstruction } from './application/render-base-agent-instruction.js'
export type { RenderBaseAgentInstructionOptions } from './application/render-base-agent-instruction.js'
export { injectSpecdBlock, removeSpecdBlock } from './application/specd-block-manager.js'
export { mergeJsonConfig, unmergeJsonConfig } from './application/json-config-manager.js'
```

---

## Detailed Plugin Prompt Injection Specifications

### 1. `plugin-agent-claude` (`packages/plugin-agent-claude/src/application/use-cases/install-skills.ts`)

- **Target File**: `CLAUDE.md` (exclusive file under `config.projectRoot`).
- **Strategy**: Exclusive file — base `<!-- <specd> -->` block only, no plugin marker.
- **Install Flow**:
  ```typescript
  const prompt = await renderBaseAgentInstruction()
  await injectSpecdBlock(claudeMdPath, prompt)
  ```
- **Uninstall Flow**:
  - Calls `removeSpecdBlock(claudeMdPath)`.

### 2. `plugin-agent-opencode` (`packages/plugin-agent-opencode/src/application/use-cases/install-skills.ts`)

- **Target File**: `AGENTS.md` (shared file under `config.projectRoot`).
- **Strategy**: Shared file — base `<!-- <specd> -->` block only. No plugin marker injected.
- **Install Flow**:
  ```typescript
  const prompt = await renderBaseAgentInstruction()
  await injectSpecdBlock(agentsMdPath, prompt)
  await removeSpecdBlock(agentsMdPath, 'opencode') // clean up any legacy marker
  ```
- **Uninstall Flow**:
  ```typescript
  await removeSpecdBlock(agentsMdPath, 'opencode') // no-op if not present
  await removeSpecdBlock(agentsMdPath)
  ```

### 3. `plugin-agent-copilot` (`packages/plugin-agent-copilot/src/application/use-cases/install-skills.ts`)

- **Target File**: `.github/copilot-instructions.md` (exclusive file under `config.projectRoot`).
- **Strategy**: Exclusive file — base `<!-- <specd> -->` block only, no plugin marker.
- **Install Flow**:
  ```typescript
  const prompt = await renderBaseAgentInstruction()
  await injectSpecdBlock(copilotInstructionsPath, prompt)
  ```
- **Uninstall Flow**:
  - Calls `removeSpecdBlock(copilotInstructionsPath)`.

### 4. `plugin-agent-codex` (`packages/plugin-agent-codex/src/application/use-cases/install-skills.ts`)

- **Target File**: `AGENTS.md` (shared file under `config.projectRoot`).
- **Strategy**: Shared file — base `<!-- <specd> -->` block only. No plugin marker injected.
- **Install Flow**:
  ```typescript
  const prompt = await renderBaseAgentInstruction()
  await injectSpecdBlock(agentsMdPath, prompt)
  await removeSpecdBlock(agentsMdPath, 'codex') // clean up any legacy marker
  ```
- **Uninstall Flow**:
  ```typescript
  await removeSpecdBlock(agentsMdPath, 'codex') // no-op if not present
  await removeSpecdBlock(agentsMdPath)
  ```

### 5. `plugin-agent-standard` (`packages/plugin-agent-standard/src/application/use-cases/install-skills.ts`)

- **Target File**: `AGENTS.md` (shared file under `config.projectRoot`).
- **Strategy**: Shared file — base `<!-- <specd> -->` block only. No plugin marker injected.
- **Install Flow**:
  ```typescript
  const prompt = await renderBaseAgentInstruction()
  await injectSpecdBlock(agentsMdPath, prompt)
  await removeSpecdBlock(agentsMdPath, 'standard') // clean up any legacy marker
  ```
- **Uninstall Flow**:
  ```typescript
  await removeSpecdBlock(agentsMdPath, 'standard') // no-op if not present
  await removeSpecdBlock(agentsMdPath)
  ```

---

## File Modifications Summary

| Package                 | File Path                                          | Action | Description                                            |
| ----------------------- | -------------------------------------------------- | ------ | ------------------------------------------------------ |
| `skills`                | `templates/prompt/agent-instruction.md.tpl`        | Create | Canonical prompt Handlebars template                   |
| `skills`                | `src/domain/templates/index.ts`                    | Modify | Expose `getAgentInstructionTemplatePath()` resolver    |
| `skills`                | `src/application/render-base-agent-instruction.ts` | Create | Handlebars compile function                            |
| `skills`                | `src/application/specd-block-manager.ts`           | Create | `injectSpecdBlock` and `removeSpecdBlock`              |
| `skills`                | `src/index.ts`                                     | Modify | Barrel export new functions and types                  |
| `plugin-manager`        | `src/application/use-cases/install-plugin.ts`      | Modify | Document delegation to `plugin.install()`              |
| `plugin-manager`        | `src/application/use-cases/uninstall-plugin.ts`    | Modify | Document delegation to `plugin.uninstall()`            |
| `plugin-agent-claude`   | `src/application/use-cases/install-skills.ts`      | Modify | Inject `CLAUDE.md` prompt block                        |
| `plugin-agent-opencode` | `src/application/use-cases/install-skills.ts`      | Modify | Inject `AGENTS.md` prompt block, remove legacy markers |
| `plugin-agent-copilot`  | `src/application/use-cases/install-skills.ts`      | Modify | Inject `.github/copilot-instructions.md` block         |
| `plugin-agent-codex`    | `src/application/use-cases/install-skills.ts`      | Modify | Inject `AGENTS.md` prompt block, remove legacy markers |
| `plugin-agent-standard` | `src/application/use-cases/install-skills.ts`      | Modify | Inject `AGENTS.md` prompt block, remove legacy markers |

---

## Testing Plan

1. **`@specd/skills` Unit Tests**:
   - `packages/skills/test/application/render-base-agent-instruction.spec.ts`: Verify `renderBaseAgentInstruction()` returns canonical prompt with and without `extraInstructions`.
   - `packages/skills/test/application/specd-block-manager.spec.ts`: Verify `injectSpecdBlock()` and `removeSpecdBlock()` handle base/plugin blocks, non-empty guards, and safe legacy marker removal.

2. **`plugin-agent-*` Integration Tests**:
   - `packages/plugin-agent-claude/test/install-skills.spec.ts`: Test `install()` and `uninstall()` verifying `CLAUDE.md` block injection and removal.
   - `packages/plugin-agent-opencode/test/install-skills.spec.ts`: Test `install()` and `uninstall()` verifying `AGENTS.md` base block injection, legacy marker removal, and safe teardown.
   - `packages/plugin-agent-copilot/test/install-skills.spec.ts`: Test `install()` and `uninstall()` verifying `.github/copilot-instructions.md`.
   - `packages/plugin-agent-codex/test/install-skills.spec.ts`: Test `install()` and `uninstall()` verifying `AGENTS.md` base block and legacy marker cleanup.
   - `packages/plugin-agent-standard/test/install-skills.spec.ts`: Test `install()` and `uninstall()` verifying `AGENTS.md` base block and legacy marker cleanup.

---

## Open Questions

_None._
