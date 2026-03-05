# SpecD

A spec-driven development platform for AI-native teams. SpecD gives AI agents a structured, machine-readable interface to spec state — so that compliance and correctness can be verified, not hoped for.

## What is SpecD?

AI coding assistants work best when given clear, structured intent. Spec-Driven Development (SDD) addresses this by inserting a spec layer between human intent and AI-generated code: requirements are written, validated, and agreed upon before implementation begins.

SpecD is a ground-up redesign of that workflow, built for professional teams. It models specs, changes, schemas, and hooks as first-class domain concepts — independent of any particular AI tool or delivery mechanism. The same business logic is exposed through a CLI, an MCP server, and agent plugins, all consuming a single core library with no I/O dependencies.

Key differences from earlier SDD tools:

- **Deterministic where possible.** Spec merging, validation, status resolution, and delta application are computed algorithmically — not delegated to the LLM.
- **Schema-driven format.** The spec file format, section headers, artifact names, and dependency order are defined in a `schema.yaml` you control. SpecD does not hardcode any particular convention.
- **Governance built in.** Optional approval gates let teams require explicit human sign-off before implementation begins or before a change is archived.
- **Composable packages.** Use only what you need: the core library as an SDK, the CLI for terminal workflows, the MCP server for agent-native workflows, or the full stack.

## Core concepts

| Concept       | Description                                                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Change**    | A named, in-progress unit of spec work. A change tracks which specs are being modified, which artifacts have been produced, and where it sits in its lifecycle.                             |
| **Spec**      | A specification file (or set of files) that defines what a system should do. Specs live in a dedicated directory and are governed by the active schema.                                     |
| **Artifact**  | A typed file produced during a change — for example, a proposal, a spec, a design, or a task list. Artifact types and their dependency order are declared in the schema.                    |
| **Schema**    | A `schema.yaml` file that defines the artifact workflow for a project: what artifacts exist, how they relate, what validations apply, and what instructions guide the AI.                   |
| **Workspace** | A declared location of specs, with its own storage path, code root, and ownership relationship. A project can span multiple workspaces (e.g. a coordinator managing several service repos). |
| **Delta**     | A structured YAML document that expresses changes to a spec as AST operations, rather than inline text diffs. Deltas are applied deterministically by SpecD.                                |

The change lifecycle progresses through well-defined states:

```
drafting → designing → ready → implementing ⇄ verifying → done → archivable
```

Optional approval gates can require human sign-off between `ready → implementing` and `done → archivable`.

## Packages

| Package                  | Description                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `@specd/core`            | Domain library. All business logic: entities, use cases, and port interfaces. Zero I/O dependencies. |
| `@specd/cli`             | CLI adapter. Exposes the full spec lifecycle as `specd` commands.                                    |
| `@specd/mcp`             | MCP server adapter. Exposes the full spec lifecycle to any MCP-compatible AI agent.                  |
| `@specd/skills`          | Canonical skill definitions installed by agent plugins.                                              |
| `@specd/schema-std`      | The standard SpecD schema: proposal → specs → design → tasks workflow.                               |
| `@specd/schema-openspec` | An OpenSpec-compatible schema for teams migrating from OpenSpec.                                     |
| `@specd/plugin-claude`   | Agent plugin for Claude Code.                                                                        |
| `@specd/plugin-copilot`  | Agent plugin for GitHub Copilot.                                                                     |
| `@specd/plugin-codex`    | Agent plugin for OpenAI Codex.                                                                       |

## Getting started

> SpecD is in active development. The CLI and MCP server are not yet available for general use. The sections below describe the intended setup once they are released.

**Requirements:**

- Node.js >= 20
- pnpm >= 10

**Installation (upcoming):**

```sh
pnpm add -D @specd/cli
```

**Project setup (upcoming):**

```sh
pnpm specd init
```

`specd init` creates a `specd.yaml` at the project root, adds `specd.local.yaml` to `.gitignore`, and scaffolds the storage directories. A minimal `specd.yaml` looks like this:

```yaml
schema: '@specd/schema-std'

workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs/

storage:
  changes:
    adapter: fs
    fs:
      path: specd/changes
  drafts:
    adapter: fs
    fs:
      path: specd/drafts
  discarded:
    adapter: fs
    fs:
      path: specd/discarded
  archive:
    adapter: fs
    fs:
      path: specd/archive
```

See the [configuration reference](docs/schemas/config-reference.md) for all available options.

## Documentation

| Section                          | Contents                                                                   |
| -------------------------------- | -------------------------------------------------------------------------- |
| [`docs/cli/`](docs/cli/)         | Reference for every `specd` command: purpose, flags, examples, exit codes. |
| [`docs/mcp/`](docs/mcp/)         | Reference for every tool and resource exposed by `@specd/mcp`.             |
| [`docs/core/`](docs/core/)       | Public API of `@specd/core`: entities, ports, use cases, and error types.  |
| [`docs/schemas/`](docs/schemas/) | Schema authoring guide and `specd.yaml` configuration reference.           |
| [`docs/adr/`](docs/adr/)         | Architecture Decision Records documenting the key design decisions.        |

## Project status

SpecD is under active development. The domain core (`@specd/core`) is being built out — the domain model, use cases, and infrastructure adapters are taking shape. The CLI, MCP server, and plugins are scaffolded but not yet implemented.

This repository follows a spec-driven workflow: each significant area of behavior is specified in `specs/` before implementation begins.

## Positioning: SpecD vs OpenSpec and similar alternatives

The table below summarizes the current intended positioning.

| Dimension                | SpecD                                                                                                                                           | OpenSpec / similar alternatives                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Determinism              | Core operations (merge, validation, lifecycle resolution, delta apply) are deterministic where possible, rather than delegated to LLM behavior. | Often rely more heavily on model behavior, with less deterministic execution in core workflows. |
| Workflow customization   | Workflow is schema-driven (`schema.yaml`): artifact types, ordering, validation hooks, and context instructions are configurable by teams.      | Usually provide a fixed baseline workflow with narrower customization points.                   |
| Governance               | Native approval gates can enforce human sign-off at lifecycle transitions (`ready → implementing`, `done → archivable`).                        | Governance patterns vary; in many tools, approval flow is externalized to process/convention.   |
| Integration model        | One `@specd/core` domain model exposed via CLI, MCP server, and agent plugins.                                                                  | Tooling is often centered around one primary interface or editor integration.                   |
| Migration path           | Includes `@specd/schema-openspec` for teams migrating incrementally from OpenSpec-style structures.                                             | Migration away from incumbent formats may require custom adapters.                              |
| Current maturity (today) | Active development; CLI and MCP are documented as not yet generally available.                                                                  | Some alternatives may currently be more production-ready in out-of-the-box CLI workflows.       |

### MVP gaps to close for competitive adoption

To compete strongly with established alternatives, an MVP should prioritize:

- A true 5-minute onboarding path: `pnpm add -D @specd/cli` + `pnpm specd init` + default schema + first successful workflow.
- Reliable command ergonomics and clear errors for config/schema resolution.
- Polished plugin install/update/doctor flows across supported agents.
- Fast-path templates and examples for common team setups.

## License

MIT — see [LICENSE](LICENSE).
