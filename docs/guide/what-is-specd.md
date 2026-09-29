---
title: What is SpecD?
description: What SpecD is, what you can do with it, and how the Code Graph fits in.
sidebar_position: 0
---

# What is SpecD?

SpecD is a spec-driven development platform for real codebases. It keeps three things in the same repository: the specification of what the software must do, the change that carries that work from idea to archive, and a Code Graph of the code those specs govern.

It is built for two readers at once. The person who decides what should be built, and the AI agent that implements it. Both use the same contract and the same commands. The agent is not handed a vague prompt and a whole tree of files. It is handed the spec for the current change, and it can ask the Code Graph what that change will touch.

---

## What you can do

### Write specs that stay next to the code

A spec is a requirement document in the repository. `spec.md` says what a capability must do, in normative language. `verify.md` says how to tell that the implementation satisfies those requirements, as concrete scenarios. They are reviewed and versioned with the code. When the behavior changes, the spec changes through a change, and the archive merges that delta back into the living spec.

The full shape of a spec is in [Specifications](./specs.md).

### Run each piece of work as a change

A change is the unit of work. It holds the proposal, the spec deltas, the verification scenarios, the design, and the task list, and it moves through a lifecycle: design, implementation, verification, and archive. You can see which artifacts are done, what is blocking the next step, and what was decided. When the change is archived, the accepted spec updates land in `specs/` and the change record remains as history.

The states, gates, and hooks are in [Workflow & Lifecycle](./workflow.md). What a change contains is in [Changes](./changes.md).

### Use the same workflow from the terminal and from an agent

The CLI is the workflow. `specd changes`, `specd specs`, `specd guide`, and `specd graph` are the operations a person runs and the operations an agent runs. Skills such as `/specd`, `/specd-new`, `/specd-design`, `/specd-implement`, `/specd-verify`, and `/specd-archive` are guided sessions over those commands. They do not invent a second process.

`specd guide` serves this documentation from the terminal, including this page, so an agent can read the topic it needs without guessing.

### Look up the code before editing it

Before changing a function, a file, or a requirement, you can ask which symbols exist, which callers depend on them, which spec they implement, and which documents already explain the area. That is the Code Graph, described below. The point of the platform is that this lookup is a normal step of design and implementation, for people and for agents.

---

## How the pieces fit

A typical change moves like this:

1. You describe the intent. SpecD opens a change and a proposal.
2. You write or update the spec and the verification scenarios. The spec says what must be true. The scenarios say how you will recognize that it is true.
3. You write a design that names the files and symbols to change, after checking the Code Graph for what those symbols affect.
4. Implementation follows the design and the task list. The agent, or you, checks off tasks as the code lands.
5. Verification walks the scenarios. A test suite can support that check. It does not replace it.
6. Archive merges the accepted spec deltas into the repository specs.

In the repository you will see `specs/` for the living requirements, a change directory for the work in progress, the application code, and `docs/guide/` for this documentation. Workspaces let one SpecD project cover a monorepo, with a spec id that always names its workspace.

SpecD does not replace the editor, the language toolchain, or the test runner. Tests answer "does the code behave as it was programmed?" Verification answers "does the implementation satisfy the spec?" Both questions matter, and they are not the same question. [Philosophy](./philosophy.md) explains why the spec comes before the code. [Workflow & Lifecycle](./workflow.md) is the state machine behind the path above.

---

## The Code Graph

The Code Graph is a core part of SpecD. It is how the platform understands a repository without opening every file.

Indexing walks the workspaces in the project and records:

- **Symbols** — functions, classes, methods, types, interfaces, and the public exports that re-export them.
- **Relations** — calls, imports, type uses, and hierarchy such as extends and implements.
- **Specifications** — requirement documents and the links from a spec to the files and symbols that implement it.
- **Documents** — markdown guides, architecture notes, and other documentation in the repository.

When the index is stale, search and impact are not trustworthy. `specd graph index` refreshes it. `specd graph stats` reports counts and whether the graph is fresh.

### Search

`specd graph search` looks through symbols, source files, specs, and documents. With no category flag it searches all four. This finds a function by name and hides test files:

```bash
specd graph search "resolveCliContext" --symbols --kind function --exclude-path "*:test/*" --format toon
```

The same command with `--documents` or `--specs` searches guides and requirements instead of code. `--snippet` adds a short preview. The full flag list is in [Code Graph & Intelligence](./code-graph.md).

### Blast radius

Before you change something, impact analysis lists what depends on it and how wide that set is. `dependents` answers "who breaks if I change this?" `dependencies` answers "what does this rely on?"

```bash
specd graph impact --symbol "resolveCliContext" --direction dependents --format toon
```

The same command accepts a file, a spec id (`workspace:capability-path`), or one public export on a file surface (`--export` with `--from`). Passing several `--file` flags combines the blast radius of a whole changeset. The result includes a risk level: `LOW`, `MEDIUM`, `HIGH`, or `CRITICAL`.

### Hotspots

Hotspots rank symbols by how coupled they are: callers in the same workspace, callers in other workspaces, and files that import them. Use them to see where a change deserves extra care, or where tests and refactors will pay off.

```bash
specd graph hotspots --min-risk HIGH --exclude-path "*:test/*" --format toon
```

### Specs and code stay linked

When a spec records which file or symbol implements it, indexing checks that link. `specd graph index` reports coverage diagnostics when the link is broken: `FILE_NOT_INDEXED`, `SYMBOL_NOT_FOUND`, or `SYMBOL_AMBIGUOUS`. That is how a rename or a deleted file shows up as a broken requirement link instead of a silent gap.

Flags, the risk formula, traversal depth, and the playbooks for refactoring and cross-workspace audits live in [Code Graph & Intelligence](./code-graph.md).

---

## People and agents

The person sets the intent: what the system must do, which specs are in scope, and whether the design is acceptable. The agent does the guided work: it reads the compiled context for the current step, queries the Code Graph, writes artifacts and code, and checks them against the scenarios.

Context compilation is what makes that handoff small enough to use. At each step SpecD assembles the specs, instructions, and lifecycle data the step needs, instead of pasting the whole repository into the prompt. The rules for what gets included are in [Context Compilation](./context-compilation.md). How the skills call the CLI is in [Skills](./skills.md).

The Code Graph is part of that handoff. An agent that searches symbols and measures impact is working from the structure of the repo. An agent that greps at random is filling its context with unrelated files. SpecD's own workflow tells agents to do the first of those.

---

## Where to go next

- [Installation & Initialization](./installation.md) — install the CLI and initialize a repository.
- [Getting Started](./getting-started.md) — run a change from idea to archive with skills.
- [Philosophy](./philosophy.md) — why specifications come before code.
- [Guides Overview](./index.md) — the map of every guide.
- [Code Graph & Intelligence](./code-graph.md) — search, impact, hotspots, risk, and playbooks.
