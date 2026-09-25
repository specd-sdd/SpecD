---
title: Getting Started with SpecD
description: Quickstart tutorial using SpecD skills to navigate and execute the spec-driven development lifecycle.
sidebar_position: 1
---

# Getting Started with SpecD

Welcome to SpecD! This quickstart shows you how to develop software using SpecD and your AI coding assistant (Claude Code, GitHub Copilot, OpenAI Codex, OpenCode, etc.).

Instead of having to memorize CLI commands, artifact schemas, or internal state machines, SpecD equips your assistant with **slash skills**.

At the center is **/specd** — your starting point, router, and orientation hub.

> Need to install the CLI or initialize a repository first? Follow the [Installation & Initialization Guide](./installation.md).

---

## 1. How Skills Work: The Router vs. Direct Invocation

SpecD skills are designed to give you complete flexibility:

- **When you start a session or aren't sure where you left off:** Run `/specd`. It inspects project health, discovers any active changes or drafts, tells you exactly what state the project is in, and points you to the right next skill.
- **When you already know what you want to do:** Go straight to the relevant skill! You do **not** need to call `/specd` before every action. If you are starting a new feature, run `/specd-new <intent>`. If you just finished writing tests and want to verify, run `/specd-verify`.

```text
               ┌──────────────────────────────────────────────┐
               │                   /specd                     │
               │   (Orientation hub: check status & route)    │
               └───────────────────────┬──────────────────────┘
                                       │ advises
                                       ▼
  ┌────────────┐       ┌───────────────┐       ┌──────────────────┐       ┌───────────────┐       ┌─────────────────┐
  │ /specd-new │  ──►  │ /specd-design │  ──►  │ /specd-implement │  ──►  │ /specd-verify │  ──►  │ /specd-archive  │
  │ (Creation) │       │   (Design)    │       │ (Implementation) │       │ (Validation)  │       │ (Consolidation) │
  └────────────┘       └───────────────┘       └──────────────────┘       └───────────────┘       └─────────────────┘
         ▲                     ▲                       ▲                          ▲                       ▲
         └─────────────────────┴────── You can invoke ─────────┴──────────────────────────┴───────────────────────┘
                                      any skill directly!
```

---

## 2. Walkthrough: A Complete Feature Lifecycle

Here is how a typical change progresses through the skills:

### Step 1: Start a New Change with `/specd-new`

When you want to build a new capability or modify an existing one, invoke `/specd-new` directly:

```text
/specd-new I want to add an in-memory token bucket rate limiter for API requests
```

_(Tip: If you're not sure if a change is already in progress, run `/specd` first to check.)_

**What happens:**

1. The agent analyzes existing code and specs using the [Code Graph](./code-graph.md) (`specd graph search`, `specd graph impact`) to identify impacted modules.
2. The agent asks clarifying questions to pin down requirements and scope.
3. SpecD scaffolds `.specd/changes/<timestamp>-<name>/` containing `manifest.yaml` and `proposal.md`.

---

### Step 2: Author Requirements & Design with `/specd-design`

Once the change is open, move into specification and architecture design:

```text
/specd-design
```

**What happens:**
The agent authors the artifacts along the dependency DAG:

1. `specs/rate-limiter/spec.md` — normative requirements (`SHALL return 429 when quota exceeded`).
2. `specs/rate-limiter/verify.md` — acceptance test scenarios (`WHEN request count > limit, THEN reject with 429`).
3. `design.md` — technical architecture, classes, interfaces, and blast-radius considerations.
4. `tasks.md` — granular implementation checklist (`- [ ] Implement TokenBucket class`, `- [ ] Add unit tests`).

Once all artifacts are validated against the schema, the change state advances to `ready`.

---

### Step 3: Implement Code with `/specd-implement`

With design and tasks agreed upon, begin writing code:

```text
/specd-implement
```

**What happens:**

1. The agent executes tasks defined in `tasks.md` sequentially.
2. For each task, the agent writes or refactors source files, runs tests, and marks the task as complete (`- [x]`).
3. When all tasks are checked off, the change transitions to `verifying`.

---

### Step 4: Verify Against Scenarios with `/specd-verify`

Confirm that the implementation satisfies the contract defined in `verify.md`:

```text
/specd-verify
```

**What happens:**

1. The agent executes the test suite against every scenario declared in `verify.md`.
2. If any scenario fails, the agent reports the discrepancy and continues implementation to fix the defect.
3. If all scenarios pass, the change transitions to `done`.

---

### Step 5: Archive the Change with `/specd-archive`

Consolidate the validated work:

```text
/specd-archive
```

**What happens:**

1. Preflight checks ensure the working tree is clean and verifications pass.
2. Proposed spec deltas are cleanly merged into the living specification library in `specs/`.
3. The change directory is permanently moved to `.specd/archive/` as an immutable audit record.
4. The codebase dependency graph is re-indexed.

---

### Need Guidance? Use `/specd` Anytime

Whenever you step away from your keyboard, switch Git branches, or return to a project after days away:

```text
/specd
```

SpecD inspects everything and tells you:

- Current active change name and lifecycle state (`designing`, `ready`, `implementing`, `verifying`, or `done`).
- Any paused drafts in `.specd/drafts/`.
- Unfinished tasks in `tasks.md`.
- Which skill you should invoke to proceed.

---

## 3. Skills Catalog at a Glance

| Skill                   | Lifecycle Stage     | When to Use                                                                   |
| ----------------------- | ------------------- | ----------------------------------------------------------------------------- |
| **`/specd`**            | **Router & Hub**    | Whenever you start a session or want to inspect current status and get routed |
| **`/specd-new`**        | Creation            | When starting a new capability, feature, or refactor                          |
| **`/specd-design`**     | Planning            | When authoring or revising specs, test scenarios, design docs, or tasks       |
| **`/specd-implement`**  | Execution           | When implementing code against the agreed `tasks.md` checklist                |
| **`/specd-verify`**     | Validation          | When testing the code against the `verify.md` acceptance scenarios            |
| **`/specd-archive`**    | Consolidation       | When merging validated specs into `specs/` and archiving the change           |
| **`/specd-compliance`** | Audit               | When reviewing compliance between implementation and specs                    |
| **`/specd-fasttrack`**  | Code-First / Hotfix | For quick spikes, urgent bugfixes, or code-first prototyping                  |

> For technical details on stop-points, CLI interactions, and customizing prompt instructions, see the **[Official Skills Guide](./skills.md)**.

---

## Next Steps

- Review the [Installation & Initialization Guide](./installation.md) to set up plugins for your editor or agent.
- Read [The Philosophy of Spec-Driven Development](./philosophy.md) for the core principles of spec-first engineering.
- Learn about [Workflow & Lifecycle](./workflow.md) for approval gates and state transitions.
- Explore [Workspaces](./workspaces.md) if you are working in a monorepo.
