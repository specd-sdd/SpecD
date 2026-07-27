# specd — Agent Instructions

You are working on **specd**, a spec-driven development platform built in TypeScript as a pnpm monorepo.

> These instructions complement the specd workflow. YOU MUST follow them exactly when reading, writing, or modifying code, and when the tool can drive the workflow you MUST prefer the tool over ad hoc repo navigation.

- Use the CLI via `node packages/cli/dist/index.js ...` for specd commands; do not use bare `specd`

---

## Project Structure

```
specd/
├── packages/
│   ├── core/                 # @specd/core
│   ├── cli/                  # @specd/cli
│   ├── skills/               # @specd/skills
│   ├── code-graph/           # @specd/code-graph
│   ├── schema-std/           # @specd/schema-std
│   ├── mcp/                  # @specd/mcp
│   ├── plugin-manager/       # @specd/plugin-manager
│   ├── plugin-agent-claude/  # @specd/plugin-agent-claude
│   ├── plugin-agent-codex/   # @specd/plugin-agent-codex
│   ├── plugin-agent-copilot/ # @specd/plugin-agent-copilot
│   ├── plugin-agent-opencode/# @specd/plugin-agent-opencode
│   ├── plugin-agent-standard/# @specd/plugin-agent-standard
│   └── specd/                # @specd/specd (main)
├── apps/
│   └── public-web/           # @specd/public-web
├── dev/
│   ├── ai-agents/
│   └── scripts/
├── specs/                    # Specifications (managed via specd workflow or `specd` cli)
├── docs/                     # Documentation (including ADRs)
└── .specd/                   # Change workflow (changes/, drafts/, metadata/)
```

---

## Package Dependencies

```
plugin-* → skills → core
cli      → core, code-graph, skills, plugin-*, schema-std
code-graph → core
mcp      → core
schema-* → (no specd deps)
```

No circular workspace dependencies.

<!-- <specd agents="opencode,codex,standard"> -->

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

_Generated and managed by @specd. Do not edit manually inside <specd> tags._

<!-- </specd> -->
