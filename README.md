# SpecD

A spec-driven development platform for AI-native teams. SpecD compiles the specs your agent needs at every lifecycle step — so context is delivered, not discovered, and compliance is structural, not hoped for.

## What is SpecD?

AI coding assistants work best when given clear, structured intent. Spec-Driven Development (SDD) addresses this by inserting a spec layer between human intent and AI-generated code: requirements are written, validated, and agreed upon before implementation begins.

SpecD is a ground-up redesign of that workflow, built for professional teams. It models specs, changes, schemas, and hooks as first-class domain concepts — independent of any particular AI tool or delivery mechanism. The same business logic is exposed through a CLI, an MCP server, and agent plugins, all consuming a single core library with no I/O dependencies.

Key differences from earlier SDD tools:

- **Deterministic where possible.** Spec merging, validation, status resolution, and delta application are computed algorithmically — not delegated to the LLM.
- **Schema-driven format.** The spec file format, section headers, artifact names, and dependency order are defined in a `schema.yaml` you control. SpecD does not hardcode any particular convention.
- **Governance built in.** Optional approval gates let teams require explicit human sign-off before implementation begins or before a change is archived.
- **Composable packages.** Use only what you need: the core library as an SDK, the CLI for terminal workflows, the MCP server for agent-native workflows, or the full stack.
- **Context compiled, not discovered.** At every lifecycle step, SpecD computes which specs are relevant to the current change and delivers their content as a structured, ready-to-consume block. The agent does not decide what to read — SpecD resolves it.
- **Compliance gates.** Two structural checkpoints enforce spec adherence: one before implementation (plan vs specs) and one before archiving (code vs specs). The agent cannot advance past either gate until it demonstrably complies.
- **Multi-workspace and coordinator repos.** A project can declare multiple spec workspaces, each pointing to a different directory or repository. A single coordinator repo can govern specs across an entire microservice architecture without coupling service repos to each other.
- **Spec lifecycle.** Specs carry explicit status — active, superseded — and can reference what they replace. Append-only workflows like ADRs are supported natively, without overwriting existing specs.

## Current status (March 2026)

SpecD is in active development and usable from source in this monorepo.

- `@specd/core` has substantial implementation (domain entities, use cases, composition layer, fs adapters, validation, tests).
- `@specd/cli` is implemented and exposes the main command groups (`change`, `spec`, `project`, `schema`, `skills`, `drafts`, `discarded`, `archive`, `config`).
- `@specd/schema-std` ships a real `schema.yaml` and templates.
- `@specd/mcp`, `@specd/schema-openspec`, and `@specd/plugin-*` are still placeholders/scaffolding.
- `@specd/skills` API exists but currently returns an empty registry.

Publishing/install flows are not finalized yet; use workspace commands for now.

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

## Context compilation

Most SDD tools give the agent a list of files and leave it to figure out which specs are relevant. SpecD takes a different approach: at every lifecycle step, `specd context` computes and delivers the full instruction block the agent needs.

The resolution works in five steps:

1. **Project-level include patterns** — which specs always apply to every change in this project.
2. **Project-level exclude patterns** — specs explicitly excluded from context.
3. **Workspace-level include/exclude patterns** — applied only for workspaces active in the current change.
4. **`dependsOn` traversal** — starting from the specs a change touches, SpecD follows declared dependencies transitively to pull in related specs automatically.
5. **Assembly** — for each resolved spec, SpecD injects structured metadata (rules, constraints, scenarios) when available, with a raw-content fallback when metadata is stale or absent.

The output is a single, ordered instruction block combining project context, schema instructions for the active artifact, spec content, and lifecycle hooks — ready to inject into the agent's context window. The agent doesn't search, doesn't guess, and doesn't miss a spec that wasn't mentioned by name.

## Compliance gates

The most common failure mode in spec-driven development is not writing bad specs — it is that agents plan and implement without fully respecting them. An agent reads the specs, generates a design and task list, then produces code that diverges from the requirements. The gap surfaces during verification or review, after the work is done.

SpecD addresses this with two structural checkpoints in the change lifecycle:

```
designing → ready → [gate: plan vs specs] → implementing → verifying → [gate: code vs specs] → done → archivable
```

**Before implementation:** a compliance agent reads the planned artifacts — design document and task list — and verifies they do not contradict any requirement or constraint in the relevant specs. If they do, the change transitions back to designing with a violation report. The agent revisits the approach before any code is written.

**Before archiving:** the same agent runs again during the verifying step, this time against the actual implementation. It checks that the code behaviour matches what the specs require. Only changes that pass both gates can be archived.

This turns spec compliance from a social convention into a structural constraint. The agent is not asked to follow specs — it cannot advance until it demonstrably has.

## Multi-workspace projects

A SpecD project can declare multiple workspaces, each with its own spec tree, storage path, and code root. Workspaces can point to directories inside the same repository or to external repositories entirely.

This enables a coordinator pattern: a single repo holds the specs for an entire system, while each service repo maintains its own codebase. Context compilation is workspace-aware — when a change touches specs in multiple workspaces, include/exclude patterns and `dependsOn` traversal are applied per-workspace, and only the active workspaces contribute to the compiled context.

Teams with microservice architectures can manage cross-cutting specs (authentication contracts, API schemas, shared conventions) in one place, without forcing every service repo to carry a full SpecD installation.

## Packages

| Package                  | Description                                                                                      | Status     |
| ------------------------ | ------------------------------------------------------------------------------------------------ | ---------- |
| `@specd/core`            | Domain library: entities, value objects, use cases, ports, composition, infrastructure adapters. | Functional |
| `@specd/cli`             | CLI adapter around `@specd/core` with command registration and formatting/output modes.          | Functional |
| `@specd/mcp`             | MCP server adapter package.                                                                      | Scaffolded |
| `@specd/skills`          | Skill registry API used by plugins and CLI skill commands.                                       | Scaffolded |
| `@specd/schema-std`      | Standard SpecD schema package with `schema.yaml` and template files.                             | Functional |
| `@specd/schema-openspec` | OpenSpec-compatible schema package.                                                              | Scaffolded |
| `@specd/plugin-claude`   | Claude plugin package.                                                                           | Scaffolded |
| `@specd/plugin-copilot`  | GitHub Copilot plugin package.                                                                   | Scaffolded |
| `@specd/plugin-codex`    | OpenAI Codex plugin package.                                                                     | Scaffolded |

## Getting started (workspace)

**Requirements**

- Node.js >= 20
- pnpm >= 10

Install dependencies and run quality checks:

```sh
pnpm install
pnpm build
pnpm test
pnpm lint
```

Build and run the CLI from source:

```sh
pnpm --filter @specd/cli build
node packages/cli/dist/index.js --help
```

Example command groups currently wired:

- `specd change ...`
- `specd spec ...`
- `specd project ...`
- `specd config show`
- `specd schema show`
- `specd skills ...`

`project init` can generate a local `specd.yaml`. A minimal config looks like:

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

See the [configuration reference](docs/config/config-reference.md) for all available options.

## Documentation

| Section                          | Contents                                                                    |
| -------------------------------- | --------------------------------------------------------------------------- |
| [`docs/core/`](docs/core/)       | Core API and model docs (`overview`, `domain-model`, `ports`, `use-cases`). |
| [`docs/config/`](docs/config/)   | `specd.yaml` reference and configuration examples.                          |
| [`docs/schemas/`](docs/schemas/) | Schema format reference and schema examples.                                |
| [`docs/adr/`](docs/adr/)         | Architecture Decision Records.                                              |
| [`docs/cli/`](docs/cli/)         | CLI docs directory (currently mostly pending).                              |
| [`docs/mcp/`](docs/mcp/)         | MCP docs directory (currently mostly pending).                              |

## Development model

This repository follows a spec-driven workflow: each significant area of behavior is specified in `specs/` before implementation begins.

## License

MIT — see [LICENSE](LICENSE).
