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

## Packages

| Package                  | Description                                                                                      | Status             |
| ------------------------ | ------------------------------------------------------------------------------------------------ | ------------------ |
| `@specd/core`            | Domain library: entities, value objects, use cases, ports, composition, infrastructure adapters. | In progress (real) |
| `@specd/cli`             | CLI adapter around `@specd/core` with command registration and formatting/output modes.          | In progress (real) |
| `@specd/mcp`             | MCP server adapter package.                                                                      | Scaffolded         |
| `@specd/skills`          | Skill registry API used by plugins and CLI skill commands.                                       | Scaffolded/empty   |
| `@specd/schema-std`      | Standard SpecD schema package with `schema.yaml` and template files.                             | In progress (real) |
| `@specd/schema-openspec` | OpenSpec-compatible schema package.                                                              | Scaffolded         |
| `@specd/plugin-claude`   | Claude plugin package.                                                                           | Scaffolded         |
| `@specd/plugin-copilot`  | GitHub Copilot plugin package.                                                                   | Scaffolded         |
| `@specd/plugin-codex`    | OpenAI Codex plugin package.                                                                     | Scaffolded         |

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
