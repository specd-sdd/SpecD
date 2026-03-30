# @specd/core

The domain library for [specd](../../README.md) — a spec-driven development platform. Contains all business logic as a self-contained, I/O-free core that the CLI, MCP server, and any other delivery mechanism build on top of.

## Installation

```sh
pnpm add @specd/core
```

`@specd/core` requires Node.js 18 or later and is published as ESM.

## Key concepts

| Concept    | Description                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Change** | An in-progress spec change moving through a schema-defined lifecycle (e.g. `in-progress` → `spec-approved` → `signed-off`).                                                    |
| **Spec**   | A directory of artifact files that defines one capability (e.g. `default:auth/oauth`).                                                                                         |
| **Schema** | A YAML file that declares artifact types, workflow steps, hooks, validation rules, and extraction rules for a project.                                                         |
| **Kernel** | A fully-wired set of use cases constructed from a resolved `SpecdConfig`. The recommended way to consume the library.                                                          |
| **Port**   | An abstract interface (repository, VCS adapter, hook runner, etc.) that the application layer depends on. Infrastructure adapters implement ports; callers receive port types. |

## Architecture

`@specd/core` is organized in three layers with a strict one-way dependency flow:

```
┌──────────────────────────────────────┐
│             domain/                  │
│  Entities · Value objects · Errors   │
│  No I/O. No external dependencies.  │
└──────────────────┬───────────────────┘
                   │
┌──────────────────▼───────────────────┐
│           application/               │
│  Use cases · Ports (interfaces)      │
│  Depends on domain only.             │
└──────────────────┬───────────────────┘
                   │
┌──────────────────▼───────────────────┐
│         infrastructure/              │
│  Fs adapters · Git · Hooks           │
│  Internal. Never imported directly.  │
└──────────────────┬───────────────────┘
                   │
┌──────────────────▼───────────────────┐
│           composition/               │
│  createKernel · factory functions    │
│  Exported. Returns abstract types.   │
└──────────────────────────────────────┘
```

The `infrastructure/` layer is intentionally not importable directly. All concrete adapters are created through the factory functions in `composition/`, keeping callers decoupled from storage and VCS implementation details.

## Usage

### Create a kernel

The `Kernel` is the standard entry point. Load config with `createConfigLoader`, then pass it to `createKernel`:

```typescript
import { createConfigLoader, createKernel } from '@specd/core'

const loader = createConfigLoader({ startDir: process.cwd() })
const config = await loader.load()

const kernel = await createKernel(config)
```

### Create a change

```typescript
const schema = await kernel.schemas.resolve(config.schemaRef)

const change = await kernel.changes.create.execute({
  name: 'add-oauth-login',
  specIds: ['default:auth/oauth'],
  schemaName: schema.name,
  schemaVersion: schema.version,
})
```

### Transition a change through its lifecycle

```typescript
await kernel.changes.transition.execute({
  name: 'add-oauth-login',
  to: 'implementing',
  approvalsSpec: config.approvals.spec,
  approvalsSignoff: config.approvals.signoff,
})
```

### Use a single use case without a full kernel

When you only need one or two use cases, the individual `create*` factory functions wire a single use case to the filesystem without constructing the full kernel:

```typescript
import { createConfigLoader, createListChanges } from '@specd/core'

const loader = createConfigLoader({ startDir: process.cwd() })
const config = await loader.load()

const listChanges = createListChanges(config)
const changes = await listChanges.execute()
```

## Public API

Everything exported from `@specd/core` is a domain type, an application type, or a composition factory. The public surface includes:

- **Entities** — `Change`, `Spec`, `ChangeArtifact`, `Delta`, `ArchivedChange`
- **Port interfaces** — `ChangeRepository`, `SpecRepository`, `ArchiveRepository`, `SchemaRegistry`, `HookRunner`, `VcsAdapter`, `FileReader`, `ArtifactParser`, and more
- **~30 use cases** — grouped as `kernel.changes.*`, `kernel.specs.*`, `kernel.project.*`
- **Composition factories** — `createKernel`, `createConfigLoader`, `createSchemaRegistry`, `createVcsAdapter`, VCS adapter classes
- **Domain errors** — all extend `SpecdError` and carry a typed `code` property

See the full export reference in [docs/core/overview.md](../../docs/core/overview.md).

## Documentation

| Document                                                     | Read when you need to…                                                 |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| [docs/core/overview.md](../../docs/core/overview.md)         | Full export reference — every public type, port, use case, and factory |
| [docs/core/domain-model.md](../../docs/core/domain-model.md) | Understand the entities and value objects returned from use cases      |
| [docs/core/ports.md](../../docs/core/ports.md)               | Implement a custom repository, schema registry, or other port          |
| [docs/core/use-cases.md](../../docs/core/use-cases.md)       | Wire and call use cases from a delivery adapter                        |
| [docs/core/errors.md](../../docs/core/errors.md)             | Handle errors in a delivery layer                                      |
| [docs/core/services.md](../../docs/core/services.md)         | Use domain service functions such as `hashFiles` and `buildSchema`     |

## License

MIT
