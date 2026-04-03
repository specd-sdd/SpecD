---
status: accepted
date: 2026-02-28
decision-makers: specd maintainer
consulted: '-'
informed: '-'
---

# ADR-0015: Use-Case-Level Composition and Config Loading

## Context and Problem Statement

The composition layer was initially designed to expose port-level factories (`createSpecRepository`, `createChangeRepository`, etc.). Delivery mechanisms (CLI, MCP) would import these factories, construct each port individually, and wire them manually into use case constructors.

This approach has two problems. First, it leaks infrastructure detail: delivery mechanisms must know which ports each use case requires, and adding or removing an internal port dependency (e.g. `NodeHookRunner`) forces changes in every entry point. Second, config loading is implicit — the CLI reads `specd.yaml` and maps its fields to factory arguments, coupling the CLI to the config file format. Switching to environment variables or a different config source requires changes in the delivery layer.

## Decision Drivers

- Delivery mechanisms (CLI, MCP) must not know which ports a use case requires — that is infrastructure detail
- Internal port implementations with a single concrete class (`NodeHookRunner`, `GitVcsAdapter`, `FsFileReader`) must never appear in public API surfaces
- Config loading must be decoupled from the kernel so that new sources (env vars, remote config) can be added without touching the delivery layer
- The composition layer must remain the only layer permitted to import from `infrastructure/`
- Consumers that only need a single use case must not be forced through the full kernel

## Considered Options

- Port-level factories only — caller constructs ports and wires them into use cases manually
- Use-case-level factories — composition constructs and wires ports internally, exposes pre-wired use cases
- Use-case-level factories + kernel + config loader port — adds a single-entry-point kernel that builds all use cases from a typed config object, with config loading separated behind a port
- Use-case factories accepting `SpecdConfig` directly — factories can be called with a fully resolved config object in addition to the explicit `(context, options)` form

## Decision Outcome

Chosen option: "Use-case-level factories + kernel + config loader port", because it fully removes infrastructure knowledge from delivery mechanisms and decouples config loading from config format.

The composition layer is structured in three levels:

**Level 1 — Use-case factories** (`composition/use-cases/`): each factory (e.g. `createArchiveChange`) accepts either a fully resolved `SpecdConfig` or an explicit `(context, options)` pair. Both call signatures are public. The explicit form covers composition without the full kernel; in current code it is primarily used for explicit filesystem-backed wiring rather than arbitrary mock injection. Repository-level factories (`createSpecRepository`, etc.) are also internal to this level.

**Level 2 — Kernel** (`composition/kernel.ts`): `createKernel(config: SpecdConfig)` is a convenience that calls every use-case factory with the same `SpecdConfig` and returns an object with all pre-wired use cases. Delivery mechanisms that need the full set call `createKernel`; those that need a single use case call its factory directly.

**Level 3 — Config loader** (`application/ports/config-loader.ts` + `infrastructure/`): `ConfigLoader` is a port that resolves a `SpecdConfig` from one or more sources. The `FsConfigLoader` implementation reads `specd.yaml` and `specd.local.yaml`. Future implementations (`EnvConfigLoader`, `CompositeConfigLoader`) can add new sources without touching the kernel or any delivery layer. The CLI calls `loadConfig()` and passes the result to `createKernel` or to individual use-case factories.

### Consequences

- Good, because delivery mechanisms (CLI, MCP) are reduced to: load config → create kernel → call use case
- Good, because internal dependency wiring remains hidden behind composition entry points even though the public export surface has since grown
- Good, because adding a new internal port dependency to a use case requires no changes in delivery layers
- Good, because config source (YAML, env vars, CI secrets) is fully interchangeable behind the `ConfigLoader` port
- Good, because the kernel accepts a typed `SpecdConfig` — it is testable without any filesystem access
- Good, because consumers that need a single use case can call its factory directly with `SpecdConfig` without going through the kernel
- Neutral, because the kernel interface will grow as use cases are added — mitigated by grouping related use cases under namespaced properties (e.g. `kernel.changes.archive`, `kernel.specs.approve`)
- Neutral, because each use-case factory that accepts `SpecdConfig` must contain logic to extract its required fields from the config — this logic is trivial but must live somewhere

### Current implementation note

The composition surface has evolved since this ADR was accepted:

- `createKernel(...)` is now asynchronous.
- `@specd/core` now also exposes `createKernelBuilder(...)` and additive kernel registries for storage factories, parsers, VCS providers, actor providers, and external hook runners.
- Some concrete composition-layer adapters are now exported publicly, so the "never exported" language in this ADR should be read as the original design intent, not the exact current export surface.

### Original confirmation criteria

- No file under `src/infrastructure/` is imported from any file outside `src/composition/`
- At decision time, `NodeHookRunner`, `GitVcsAdapter`, and `FsFileReader` were expected not to appear in `src/index.ts` or any public export
- `createSpecRepository`, `createChangeRepository`, and `createArchiveRepository` do not appear in `src/index.ts`
- The `ConfigLoader` port is defined in `src/application/ports/` and its implementations live in `src/infrastructure/`
- These are verified by ESLint `no-restricted-imports` rules and by inspecting the public export surface of `@specd/core`

## Pros and Cons of the Options

### Port-level factories only

- Good, because individual use cases can be constructed without building the full kernel
- Bad, because delivery mechanisms must know the full port graph of every use case they use
- Bad, because adding an internal port to a use case is a breaking change for all entry points
- Bad, because config loading has no defined home — it accumulates in the delivery layer

### Use-case-level factories

- Good, because port wiring is hidden behind use-case factories
- Bad, because delivery mechanisms still compose use-case factories manually
- Bad, because config loading remains in the delivery layer, coupled to the config file format

### Use-case-level factories + kernel + config loader port

- Good, because the delivery layer is reduced to two calls: `loadConfig` + `createKernel`
- Good, because config sources are swappable behind a port without changing any other layer
- Good, because the kernel is fully testable with a plain in-memory `SpecdConfig` object
- Neutral, because the kernel becomes the single mandatory entry point — consumers that want one use case must still build the full kernel

### Use-case factories accepting `SpecdConfig` directly

- Good, because consumers that need a single use case can call its factory directly with `SpecdConfig` without going through the kernel
- Good, because the kernel becomes a convenience rather than a requirement
- Neutral, because each use-case factory must contain logic to extract its required fields from `SpecdConfig`

## More Information

### Spec

- [`specs/_global/architecture/spec.md`](../../specs/_global/architecture/spec.md)
- [`specs/core/composition/spec.md`](../../specs/core/composition/spec.md)
