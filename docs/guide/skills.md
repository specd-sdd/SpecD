---
title: Skills
description: What skills are, how to use them, and a catalog of every built-in skill with its purpose.
sidebar_position: 4
---

# Skills

Skills are slash commands installed in your coding assistant (Claude, Codex, Copilot, etc.) that guide you and the AI agent through the SpecD workflow. They act as the **interface layer** between you and the SpecD CLI — each skill knows how to load context, call the right CLI commands, write or validate artifacts, and tell the agent exactly what to do next.

> For a deeper explanation of how skills fit into the overall lifecycle, see the [Workflow & Lifecycle guide](./workflow.md).

---

## How skills work

When you type `/specd` (or any other skill slash command), your coding assistant loads the skill's instruction file and the agent executes the steps inside it. Skills:

1. **Load shared context** — read `shared.md` and project status from the CLI.
2. **Call CLI commands** — invoke `specd` under the hood to inspect state, create changes, validate artifacts, and transition lifecycle steps.
3. **Present results and stop** — skills have mandatory stop-points where they present information and wait for your input before continuing. This keeps you in control.
4. **Write artifacts** — design docs, task lists, spec deltas, and verify files are authored by the agent following skill instructions.

The agent interacts with the CLI on your behalf; **you never need to know which CLI command to run**. The skill handles that.

```text
You  →  /skill-name  →  Agent  →  specd CLI  →  Workflow engine
```

---

## Available skills

### `/specd` — Entry point and status

The main entry point. Checks the current project and change status, detects where you are in the lifecycle, and routes you to the correct next skill.

**When to use:** Start here whenever you open a session, return to a project, or are unsure what to do next.

---

### `/specd-new` — Create a new change

Explores your intent, surfaces affected specs, asks clarifying questions, and creates a new change when the scope is clear.

**When to use:** When you want to start a new unit of work. Does **not** write any design artifacts — that's `/specd-design`.

---

### `/specd-design` — Write design artifacts

Writes one artifact at a time (proposal, spec files, verify scenarios, design doc, tasks) for the active change. Validates each artifact before proceeding. Supports fast-forward mode (`--ff`) to write all remaining artifacts without stopping.

**When to use:** When a change is in `designing` state and you need to author or revise its artifacts.

---

### `/specd-implement` — Write code

Implements the code described by the change's `design.md` and `tasks.md`. Works through tasks one by one, runs tests, and marks tasks complete as it goes.

**When to use:** When a change is in `implementing` state and code needs to be written.

---

### `/specd-verify` — Verify implementation

Runs through the verification scenarios defined in each spec's `verify.md` file. Executes tests, checks output, and reports pass/fail. If all scenarios pass, transitions the change to `done`. If any fail, loops back to implementing.

**When to use:** When a change is in `verifying` state and implementation is complete.

---

### `/specd-archive` — Archive a completed change

Reviews deltas and archives the change by merging deltas into canonical project specs. Archiving is the final, irreversible step. The change must already be in `archivable` state.

**When to use:** When a change is `done` (or `archivable`) and you are ready to publish its spec deltas to the repository.

---

### `/specd-compliance` — Audit spec compliance

Read-only auditor that compares the implementation against specs and produces a detailed compliance report. Does **not** modify any code or spec files.

**When to use:** When you want to check that the current code faithfully reflects what the specs say, without making any changes.

---

### `/specd-fasttrack` — Code-first development

Fast-track session for code-first features, bugfixes, or spikes. Lets you explore and implement first, then consolidates the evidence into specd design artifacts post-facto. Maintains a live decision journal (`<changePath>/.specd-exploration.md`) so interrupted sessions can always be resumed.

**When to use:** Only when explicitly invoked — for quick bugfixes or exploratory spikes where the design is discovered through implementation rather than planned upfront.

---

## Using skills with agents

All skills produce output using the SpecD CLI's `--format toon` option where possible, which minimizes token usage while keeping the agent fully informed. The agent instructions embedded in `AGENTS.md` (and `CLAUDE.md`) instruct agents to consult `specd guide [topic]` for on-demand documentation rather than guessing:

```bash
# Look up any topic from inside a skill session
specd guide specs
specd guide workflow --section "Approval Gates"
specd guide search "delta three-way merge"
```

### The Graph-First Protocol

Agents executing `/specd-design` and `/specd-implement` follow the **Graph-First Protocol**:

- **Finding Symbols & Definitions:** Agents must not use blind lexical grep. They search the AST graph directly via `specd graph search "<query>" --symbols`.
- **Pre-calculating Blast Radius:** Before drafting changes in `design.md`, agents calculate downstream impact with `specd graph impact --symbol "<name>" --direction dependents` or `specd graph impact --file "<path>"`.
- **Auditing Hotspots:** When editing core or shared modules, agents check `specd graph hotspots --min-risk HIGH` to exercise caution in fragile areas.
- **Traceable Spec Verification:** During `/specd-verify`, agents trace implementations back to specs using `specd graph impact --spec "<id>"`.

---

## Where skills live

Skills are stored as `.md` files in `.agents/skills/` at the root of the repository:

```
.agents/skills/
├── specd/SKILL.md            # /specd
├── specd-new/SKILL.md        # /specd-new
├── specd-design/SKILL.md     # /specd-design
├── specd-implement/SKILL.md  # /specd-implement
├── specd-verify/SKILL.md     # /specd-verify
├── specd-archive/SKILL.md    # /specd-archive
├── specd-compliance/SKILL.md # /specd-compliance
└── specd-fasttrack/SKILL.md  # /specd-fasttrack
```

Shared context and configuration used by all skills is in `.specd/config/skills/shared/shared.md`.

---

## Next steps

- **[Code Graph & Intelligence](./code-graph.md)** — AST-powered codebase intelligence, multi-modal search (symbols, files, specs, documents), and blast radius impact analysis.
- **[Workflow & Lifecycle](./workflow.md)** — Full walkthrough of lifecycle states, transitions, approval gates, hooks, and a complete end-to-end example showing how skills and CLI interact at each step.
- **[Changes](./changes.md)** — What a change is, what artifacts it tracks, and how the DAG is organized.
- **[CLI Reference](./cli.md)** — All CLI commands that skills call under the hood.
