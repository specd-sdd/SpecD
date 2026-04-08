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

specd ships with `@specd/schema-std` as a default. You can customise it or replace it entirely. See [Schema Format Reference](../../../schemas/schema-format.md) for details.

### Workspaces

A **workspace** is a declared location for specs. Every project has at least a `default` workspace — and for simple projects, that is all you need.

Additional workspaces become useful when your project grows beyond a single spec directory:

- **Monorepos** — each package (`core`, `cli`, `mcp`) gets its own workspace with separate specs and code root. The agent sees the right specs for the package being worked on.
- **Multi-repo architectures** — a coordinator repo declares workspaces pointing to external service repos (`../auth-service/specd/specs`). Changes can span services.
- **Mixed ownership** — some workspaces are `owned` (your team modifies freely), others are `readOnly` (visible for context, cannot modify).

See [Workspaces](../../workspaces.md) for the full guide with monorepo and multi-repo coordinator examples.

### Spec IDs

Every spec is identified by a **spec ID** in the format `workspace:capability-path`. Examples:

- `default:auth/login` — the `auth/login` spec in the default workspace
- `default:auth/oauth` — the `auth/oauth` spec in the default workspace
- `default:_global/architecture` — the `architecture` spec in the default workspace when that workspace uses `prefix: _global`
- `core:schema-format` — the `schema-format` spec in the `core` workspace

The workspace name is always the part before the colon. The capability path mirrors the directory structure inside the workspace's specs directory.

If a workspace declares `prefix`, that prefix is prepended to the capability path portion of the spec ID — it does not replace the workspace name. For example, a `default` workspace with `prefix: _global` produces spec IDs like `default:_global/architecture`.
