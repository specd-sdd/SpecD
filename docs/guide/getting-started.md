# Getting Started with specd

specd is a spec-driven development platform. It gives you a structured way to define what you want to build _before_ you build it, track that definition as it evolves, and ensure the implementation matches what was agreed — especially when AI agents are doing the implementing.

This guide opens with the philosophy behind spec-driven development. Understanding the why makes the how much clearer. Technical concepts and project setup follow.

---

## The philosophy of spec-driven development

### The problem with the traditional workflow

Most software development follows a pattern that looks roughly like this:

> idea → rough ticket → code → hope it works → document later (maybe)

Requirements live in a chat message, a half-finished ticket, or someone's memory. A developer — or increasingly, an AI agent — receives a vague prompt and fills the gaps with assumptions. When the output does not match the intent, it is hard to say exactly why, because the intent was never formally stated.

The result is a familiar cycle: rework, misalignment, and a growing gap between what the system does and what anyone can confidently say it was meant to do. Documentation, if it exists at all, is written after the fact and describes what was built rather than what was intended.

### What spec-driven development does differently

Spec-driven development inverts the order of operations:

> idea → specify requirements → write verification scenarios → design → implement → verify against spec → archive

The specification comes first. It describes what the system SHALL do — not how. It is written in plain language, reviewed like code, and treated as a first-class artifact alongside the implementation. The verification scenarios written alongside it describe how to confirm correctness in concrete, unambiguous terms.

This is not a new idea. Engineering disciplines outside software have worked this way for decades. specd makes it practical for day-to-day software development, particularly when AI agents are involved in implementation.

### What a spec actually is

A spec is a living requirement document. It answers the question: what should this capability do?

- It is written in Markdown, in natural language, with normative language: SHALL, MUST, SHOULD.
- It is paired with a verification file that describes concrete WHEN/THEN scenarios — not vague acceptance criteria, but specific conditions and expected outcomes.
- It outlives the change that created it. Once written, a spec is a permanent record of intent. It evolves through structured delta modifications that preserve its history.
- It is the source of truth for what the system should do, independent of any particular implementation.

A spec does not describe how the code is structured. It does not name functions or modules. It says what the system shall do and what it shall not do. The implementation is a consequence of the spec, not the other way around.

### Why specs must come before code

Forcing clarity before implementation has compounding benefits.

**It makes intent explicit.** Vague requirements produce vague implementations. Writing a spec forces you to answer questions you would otherwise defer: what are the edge cases? what are the constraints? what does success actually look like?

**It creates alignment between humans and agents.** An AI agent working from a spec is working from a contract. It knows what it is supposed to produce, in what order, and against what criteria. The spec is not a suggestion — it is the acceptance test.

**It provides verifiable acceptance criteria.** "The login should work" is not a requirement. "WHEN a user submits valid credentials, THEN they receive an authenticated session token" is. Verification scenarios make it possible to determine, unambiguously, whether the implementation is correct.

**It enables governance without blocking velocity.** Approval gates become natural checkpoints when they are attached to well-defined specs. A reviewer can evaluate whether a design satisfies a spec. A compliance check can verify whether code satisfies verification scenarios. These gates carry meaning because the specs they reference carry meaning.

**It creates an audit trail of why.** Code tells you what the system does today. A commit message tells you what changed. A spec tells you why the capability exists and what it was intended to do — even after the code has been refactored, rewritten, or replaced entirely.

**Specs survive refactors. Code does not.** You can rewrite the implementation from scratch and still have a complete record of what it was supposed to do. The spec is independent of the technology, the architecture, and the team that wrote the original version.

### The key insight

There are four different things that say something about a software system, and they answer different questions:

| Artifact               | Question it answers                     |
| ---------------------- | --------------------------------------- |
| Code                   | What does the system do today?          |
| Tests                  | Does the code behave as programmed?     |
| Specs                  | What should the system do, and why?     |
| Verification scenarios | Does the code satisfy the requirements? |

Most teams have code and tests. Few have durable, structured specs. Fewer still have explicit verification scenarios that connect requirements to outcomes. specd fills that gap.

### The specd approach

specd is a platform that makes spec-driven development practical without imposing heavy process.

It provides **structure** through schemas. A schema defines what artifact types exist in your project, what files they produce, and what order they must be produced in. You cannot produce a design until a spec exists. You cannot produce tasks until a design exists. The structure enforces deliberate sequencing without requiring manual enforcement.

It provides **workflow** through a change lifecycle. A change tracks a unit of work from initial idea through implementation to completion. Each lifecycle state has a clear meaning. Optional approval gates enforce compliance checks at the transitions that matter most.

It provides **tooling** through the CLI and MCP server. You can manage the full lifecycle from the command line. AI agents can interact through the MCP interface, which exposes the same workflow as structured tool calls.

It provides **context** through compilation. At each lifecycle step, specd assembles the right set of specs, schema instructions, and lifecycle context into a single block — ready to inject into the agent. The agent gets exactly what it needs for the current step, with full detail on the specs it is directly working with and lighter summaries for broader context.

It works **with** AI agents rather than around them. Specs are the contract between human intent and agent execution. The agent reads the spec, produces artifacts against it, and is checked against it. The human defines what should be built. The agent works out how.

---

## Core concepts

Before exploring the project structure, it helps to know what the main building blocks are.

### Specs

A **spec** is a requirement document. It lives in a dedicated directory and typically consists of two files:

- `spec.md` — what the capability is, what it must do, and what constraints apply
- `verify.md` — concrete scenarios for testing whether the spec is satisfied (written as WHEN/THEN pairs)

Specs are plain Markdown. They are written by humans (or agents acting on human intent) and reviewed like code.

### Changes

A **change** is the unit of work in specd. When you want to create a new capability or modify an existing one, you open a change. A change:

- Declares which specs it is creating or modifying
- Collects the artifacts produced during the work (proposal, design, tasks, etc.)
- Moves through a defined lifecycle from initial idea to completion

Changes are stored in `.specd/changes/` while active. When finished, they are archived.

### Artifacts

An **artifact** is a typed file produced during a change. Examples include a proposal document, a spec file, a verification plan, a design document, or a task list. The exact artifact types available in your project are defined by the schema.

Artifacts have an explicit dependency order: you cannot produce a design until a spec exists, and you cannot produce tasks until a design exists. This ensures work proceeds in a deliberate sequence.

### Schema

The **schema** defines the artifact workflow for a project. It declares:

- Which artifact types exist and what files they produce
- The dependency order between artifacts (what requires what)
- Validation rules applied to artifact content
- The lifecycle steps and any hooks that run between them
- Instructions that guide the AI at each phase

specd ships with `@specd/schema-std` as a default. You can customise it or replace it entirely. See [Schema Format Reference](../schemas/schema-format.md) for details.

### Workspaces

A **workspace** is a declared location for specs. Every project has at least a `default` workspace — and for simple projects, that is all you need.

Additional workspaces become useful when your project grows beyond a single spec directory:

- **Monorepos** — each package (`core`, `cli`, `mcp`) gets its own workspace with separate specs and code root. The agent sees the right specs for the package being worked on.
- **Multi-repo architectures** — a coordinator repo declares workspaces pointing to external service repos (`../auth-service/specd/specs`). Changes can span services.
- **Mixed ownership** — some workspaces are `owned` (your team modifies freely), others are `readOnly` (visible for context, cannot modify).

See [Workspaces](workspaces.md) for the full guide with monorepo and multi-repo coordinator examples.

### Spec IDs

Every spec is identified by a **spec ID** in the format `workspace:capability-path`. Examples:

- `default:auth/login` — the `auth/login` spec in the default workspace
- `default:auth/oauth` — the `auth/oauth` spec in the default workspace
- `core:schema-format` — the `schema-format` spec in the `core` workspace

The workspace prefix comes from your `specd.yaml` configuration. The capability path mirrors the directory structure inside the workspace's specs directory.

---

## Project structure on disk

A specd project has a predictable layout:

```
my-project/
├── specd.yaml                 # Project configuration
├── specs/                     # Your spec documents
│   ├── auth/
│   │   ├── login/
│   │   │   ├── spec.md
│   │   │   └── verify.md
│   │   └── oauth/
│   │       ├── spec.md
│   │       └── verify.md
│   └── _global/
│       └── architecture/
│           ├── spec.md
│           └── verify.md
├── .specd/
│   ├── changes/               # Active work
│   ├── drafts/                # Paused work
│   ├── discarded/             # Abandoned work
│   ├── archive/               # Completed work
│   └── metadata/              # Extracted spec metadata
└── src/                       # Your application code
```

The `specs/` directory holds your specifications. The `.specd/` directory is managed by specd and holds all change state. Your application code sits alongside both — specd does not impose any structure on it.

---

## What is inside a spec directory

A spec directory contains at minimum a `spec.md`. Most also include a `verify.md`.

**`spec.md`** — The requirement document. A typical structure:

```markdown
# Login

## Purpose

Describe what this capability is for and why it exists.

## Requirements

- Users must be able to log in with email and password.
- Failed login attempts must return a generic error message.
- Sessions expire after 24 hours of inactivity.

## Constraints

- Passwords must never be stored in plain text.
- Rate limiting must be applied to the login endpoint.
```

**`verify.md`** — The verification scenarios. Written as WHEN/THEN pairs:

```markdown
# Login — Verification

## Scenarios

WHEN a user submits valid credentials
THEN they receive an authenticated session token

WHEN a user submits invalid credentials
THEN they receive a generic error with no information about which field was wrong

WHEN a session has been inactive for more than 24 hours
THEN subsequent requests with that session token are rejected
```

The exact section headers and structure are governed by the active schema. The examples above follow the `@specd/schema-std` convention.

---

## What is inside a change directory

Each change is a directory inside `.specd/changes/` containing the artifacts produced so far:

```
.specd/changes/
└── 20260402-173732-add-oauth-login/
    ├── manifest.json          # Change state, scope, and artifact tracking
    ├── proposal.md            # Initial idea and scope
    ├── specs/
    │   └── default/
    │       └── auth/
    │           └── oauth/
    │               ├── spec.md    # New spec content staged in the change
    │               └── verify.md
    ├── design.md              # Technical approach
    ├── tasks.md               # Implementation task list
    └── deltas/
        └── default/
            └── auth/
                └── oauth/
                    └── spec.md.delta.yaml # Structured delta operations for an existing spec artifact
```

The timestamped directory name is assigned by SpecD when the change is created. `specs/` contains staged full artifacts for new specs introduced by the change. `deltas/` contains structured YAML documents that express modifications to existing spec artifacts — not as text diffs, but as explicit operations (additions, modifications, removals). specd applies these deterministically when archiving the change.

---

## The lifecycle at a glance

A change moves through a series of named states from creation to completion:

```
  create
    |
    v
 drafting --> designing --> ready --> implementing --> verifying --> done --> archivable
    ^                                                                              |
    |                                                                           archive
    |
 [pause: drafts]          [discard: discarded]
```

- **drafting** — the change exists but work has not fully started
- **designing** — the design and task artifacts are being produced
- **ready** — design is complete; the agent is ready to implement
- **implementing** — code is being written
- **verifying** — the implementation is being checked against the specs
- **done** — verification is complete; the change is ready to be archived
- **archivable** — all gates have passed; the change can be archived

**Pausing** a change moves it to `.specd/drafts/`. It is preserved as-is and can be resumed later.

**Discarding** a change moves it to `.specd/discarded/`. The work is retained for reference but the change is no longer active.

**Archiving** applies the spec deltas to the live specs directory and moves the completed change to `.specd/archive/`.

### Approval gates

Two optional approval gates can be configured between lifecycle steps:

```
  ready --> [gate: plan vs specs] --> implementing
  done  --> [gate: code vs specs] --> archivable
```

When enabled, specd runs a compliance check at each gate. If the planned artifacts or implementation do not satisfy the specs, the change is pushed back with a violation report. The agent must address the issues before advancing. See [Workflow Reference](workflow.md) for details.

---

## Spec metadata

specd extracts structured metadata from your spec files and stores it in `.specd/metadata/`. Each spec gets a `metadata.json` file that captures:

- Title and description
- Rules and constraints (extracted from the spec content)
- Verification scenarios (extracted from the verify content)
- `dependsOn` relationships to other specs

This metadata is used during context compilation. Rather than reading every spec file in full, specd can serve the metadata summary — which is typically smaller and more focused — when building the agent's context window.

Metadata is **generated automatically at archive time**. Between archiving runs it can become stale if you edit a spec manually. specd tracks freshness: a stale metadata file is flagged, and the raw spec content is used as a fallback until metadata is regenerated.

---

## Context compilation

When an agent works on a change, it needs to know which specs are relevant. Rather than leaving this to the agent to figure out, specd compiles a structured context block at each lifecycle step.

The compilation process:

1. **Project-level include patterns** — specs that always apply to every change (for example, `_global/architecture`).
2. **Project-level exclude patterns** — specs explicitly excluded from every change.
3. **Workspace-level patterns** — per-workspace include/exclude rules.
4. **Dependency traversal** — starting from the specs a change touches, specd follows `dependsOn` links transitively, pulling in related specs automatically.
5. **Assembly** — specs are sorted by tier and assembled into a single instruction block.

### Tiers

Not all resolved specs are treated equally:

- **Tier 1 (full content)** — specs directly relevant to the change. The agent receives the full spec and verify content.
- **Tier 2 (summary only)** — specs pulled in via dependency traversal that are not directly touched. The agent receives a compact metadata summary instead of the full file.

This keeps the context window focused: the agent gets full detail on the specs it is directly working with, and lighter summaries for the broader context.

The output is a single ordered instruction block: project context, schema instructions for the active artifact, spec content, and lifecycle hooks — ready to inject directly into the agent.

---

## How specd is used in practice

specd is designed to be driven by **coding assistants** — tools like Claude Code, GitHub Copilot, OpenAI Codex, or any AI-powered coding tool that supports slash commands or custom instructions.

You do not typically run specd by typing CLI commands one by one. Instead, you interact through **skills** — slash commands installed into your coding assistant that orchestrate the full lifecycle for you.

### Skills

When you set up specd in a project, you install skills for your coding assistant of choice:

```bash
specd project init --agent claude     # Install skills for Claude Code
specd project init --agent copilot    # Install skills for GitHub Copilot
specd project init --agent codex      # Install skills for OpenAI Codex
```

This installs slash commands that the coding assistant can invoke. The main one is `/specd`.

### The `/specd` entry point

`/specd` is the primary skill. When you invoke it, it:

1. Shows the current project status — active changes, their states, available specs
2. Detects where you left off and suggests what to do next
3. Routes you to the appropriate phase skill

You can invoke it with a change name to jump straight to that change, or without arguments to see an overview and decide what to work on.

```
> /specd

# specd

**Schema:** @specd/schema-std
**Workspaces:** default (12 specs), core (45 specs)
**Active changes:** 1 — add-auth-flow (designing)
**Drafts:** none

> The change "add-auth-flow" is in the designing state.
> Specs and verify are complete. Design is next.
> Suggest: /specd-design add-auth-flow
```

### Phase skills

Each lifecycle phase has its own skill that knows how to guide the coding assistant through that phase:

| Skill              | Phase        | What it does                                                         |
| ------------------ | ------------ | -------------------------------------------------------------------- |
| `/specd-new`       | Creation     | Explores what you want to do, creates a change when ready            |
| `/specd-design`    | Designing    | Drives the agent through proposal → specs → verify → design → tasks  |
| `/specd-implement` | Implementing | Works through tasks one by one, runs hooks, transitions to verifying |
| `/specd-verify`    | Verifying    | Checks the implementation against verification scenarios             |
| `/specd-archive`   | Archiving    | Handles signoff gates, archives the change, applies deltas           |

You rarely need to invoke phase skills directly — `/specd` suggests the right one based on the current state. But you can jump to any phase if you know where you are.

### The typical workflow

A real session looks like this:

1. You type `/specd` in your coding assistant
2. specd shows the project status and asks what you want to do
3. You describe the change you want to make (or pick an existing one)
4. `/specd-new` explores what you want through a conversation, creates the change, and saves the full discovery context to `specd-exploration.md` in the change directory — so nothing is lost between sessions
5. `/specd-design` reads the exploration context, verifies it's still current, and guides the agent through writing the artifacts defined by the schema — in `@specd/schema-std` that means proposal, specs, verification scenarios, design, and tasks. Other schemas may define a different set of artifacts.
6. You review the artifacts. If approval gates are enabled, you approve the spec.
7. `/specd-implement` works through the task list, writing code that satisfies the specs
8. `/specd-verify` runs through each verification scenario to confirm correctness
9. `/specd-archive` archives the completed change, applying spec deltas to the permanent spec repository

At every step, the coding assistant has access to the compiled context — the right specs, the right instructions, the right constraints — assembled automatically by specd.

### The CLI underneath

The skills call the specd CLI under the hood. Every operation is ultimately a CLI command:

```bash
specd change create add-auth --spec auth/login
specd change status add-auth
specd change transition add-auth implementing
specd change context add-auth designing
specd change archive add-auth
```

You can use the CLI directly when you need to — for scripting, CI pipelines, or when you want fine-grained control. But for day-to-day development, the skills provide the guided experience that makes spec-driven development practical.

See the [CLI Reference](../cli/cli-reference.md) for the full command reference.

---

## Setting up a new project

**Step 1: Initialise the project.**

```bash
specd project init
```

This creates a `specd.yaml` with a default configuration, installs skills for your coding assistant, and sets up the storage directories.

For a non-interactive setup:

```bash
specd project init --schema @specd/schema-std --agent claude
```

**Step 2: Start working.**

Open your coding assistant and type `/specd`. That is all you need — the skill takes it from there.

---

## Where to go next

| Topic                                                   | Document                                 |
| ------------------------------------------------------- | ---------------------------------------- |
| Lifecycle states, transitions, and gates in full detail | [Workflow](workflow.md)                  |
| Artifacts, templates, and schema customisation          | [Schemas](schemas.md)                    |
| Multi-package and multi-repo spec organisation          | [Workspaces](workspaces.md)              |
| specd.yaml configuration options                        | [Configuration](configuration.md)        |
| Selectors, extractors, and validation rules             | [Selectors](selectors.md)                |
| Full CLI command reference                              | [CLI Reference](../cli/cli-reference.md) |
| Core API for integrators and plugin authors             | [Core API Reference](../core/)           |
