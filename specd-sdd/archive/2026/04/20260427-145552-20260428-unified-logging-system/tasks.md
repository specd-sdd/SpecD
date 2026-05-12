# Tasks: 20260428-unified-logging-system

## 1. Core logging contract and ambient proxy

- [x] 1.1 Define logger port types and interface contract
      `packages/core/src/application/ports/logger.port.ts`: `LogLevel`, `LogFormat`, `LogEntry`, `LogDestination`, `LoggerPort` — add the canonical logging contract used by core and adapters.
      Approach: encode level/format unions and destination discriminators (`console|file|callback`) with optional `path` and `onLog` fields to support multi-destination routing.
      (Req: Extended Logger Interface, Structured Metadata, Log Entry Contract)
- [x] 1.2 Implement ambient `Logger` proxy with safe default behavior
      `packages/core/src/application/logger.ts`: `Logger` static proxy + default implementation — provide globally accessible logger API with no-op fallback.
      Approach: implement proxy delegation to a swappable `LoggerPort` instance, initialize with silent default to keep tests deterministic.
      (Req: Ambient Context Proxy, Implementation Swapping, Default Implementation)
- [x] 1.3 Expose the logger API from core public exports
      `packages/core/src/index.ts`: export `LoggerPort`/types and `Logger` proxy symbols.
      Approach: add explicit named exports only (ESM/no default export), preserving package surface conventions.
      (Req: Extended Logger Interface)

## 2. Pino adapter and destination routing

- [x] 2.1 Add Pino-backed logger adapter and default factory
      `packages/core/src/infrastructure/logging/pino-logger.ts`: `PinoLogger`, `createDefaultLogger` — implement concrete logger adapter.
      Approach: wrap `pino` instance and provide factory accepting destination list as the single construction path.
      (Req: Pino Adapter Construction, Default Factory Function)
- [x] 2.2 Implement destination mapping for console/file/callback targets
      `packages/core/src/infrastructure/logging/pino-logger.ts`: stream/destination mapping helpers.
      Approach: build `pino.multistream` targets and callback bridge that maps emitted events into `LogEntry` payloads.
      (Req: Implementation of Destinations, Multi-destination Configuration)
- [x] 2.3 Enforce per-destination level filtering and child logger propagation
      `packages/core/src/infrastructure/logging/pino-logger.ts`: level filter logic and `child(context)` implementation.
      Approach: configure stream-specific levels and implement `child` by deriving bound context from underlying pino child logger.
      (Req: Level Filtering, Child Logger Mapping)

## 3. Kernel and config integration

- [x] 3.1 Extend kernel options to accept additional logging destinations
      `packages/core/src/composition/kernel.ts`: `KernelOptions` and destination merge flow.
      Approach: include optional `additionalDestinations`, merge with config-derived file destination, and pass resolved list to default logger factory.
      (Req: Support for Additional Destinations, Default Logger Instantiation)
- [x] 3.2 Initialize proxy logger early in `createKernel`
      `packages/core/src/composition/kernel.ts`: `createKernel()` startup sequence.
      Approach: instantiate logger and call proxy setter before constructing dependent services/use cases to guarantee consistent global logger binding.
      (Req: Proxy Initialization)
- [x] 3.3 Guarantee file destination directory resolution/creation
      `packages/core/src/composition/kernel.ts`: path resolution helper for `.specd/log/specd.log`.
      Approach: derive path from loaded config root and ensure directory exists before logger initialization.
      (Req: Project-Wide Logging (File), Log Directory Guarantee)
- [x] 3.4 Add logging section to config model and loader validation
      `packages/core/src/application/specd-config.ts`, `packages/core/src/infrastructure/fs/config-loader.ts`: `SpecdConfig.logging` and Zod schema/defaults.
      Approach: define optional `logging` root section with robust defaults/normalization so missing config still yields info-level file logging.
      (Req: Logging configuration)

## 4. CLI wiring and verbosity behavior

- [x] 4.1 Define console destination from CLI runtime flags
      `packages/cli/src/kernel.ts`: CLI-to-kernel logging wiring.
      Approach: map `-v/-vv` to destination log levels and construct console `LogDestination` payload passed through kernel options.
      (Req: Console Destination Definition, Verbosity Overrides)
- [x] 4.2 Register CLI-provided destination into kernel startup path
      `packages/cli/src/kernel.ts`: `createCliKernel()` integration.
      Approach: pass console/callback destinations as `additionalDestinations` while keeping core unaware of CLI formatting concerns.
      (Req: Kernel Registration, Separation of Concerns)
- [x] 4.3 Add optional callback destination support for interception
      `packages/cli/src/kernel.ts`: callback destination branch.
      Approach: provide optional callback target suitable for UI/dashboard interception without coupling domain/application layers.
      (Req: Callback Interception (Optional))

## 5. Verification, docs, and manual checks

- [x] 5.1 Add unit tests for proxy and port behavior
      `packages/core/test/application/logger-port.spec.ts`: proxy delegation + default no-op behavior.
      Approach: assert all methods delegate to active implementation and default implementation never throws.
      (Req: Ambient Context Proxy, Default Implementation)
- [x] 5.2 Add unit tests for Pino adapter destinations and callbacks
      `packages/core/test/infrastructure/logging/pino-logger.spec.ts`: destination routing, level filtering, callback `LogEntry` mapping, and `child` behavior.
      Approach: use stream/callback mocks to assert structured payloads and per-target filtering.
      (Req: Implementation of Destinations, Level Filtering, Child Logger Mapping)
- [x] 5.3 Add kernel/config integration tests for destination composition
      `packages/core/test/composition/kernel-logging.spec.ts`, `packages/core/test/infrastructure/fs/config-loader.spec.ts`: merge of config + options and logging section parsing/defaults.
      Approach: cover configured file logging, missing logging section fallback, and merged destination list semantics.
      (Req: Project-Wide Logging (File), Support for Additional Destinations, Logging configuration)
- [x] 5.4 Add CLI tests for verbosity and destination registration
      `packages/cli/test/kernel.spec.ts` (or equivalent): verbosity-to-level mapping and kernel option forwarding.
      Approach: mock kernel factory inputs and assert console destination level changes with `-v/-vv` flags.
      (Req: Console Destination Definition, Verbosity Overrides, Kernel Registration)
- [x] 5.5 Update user documentation for logging configuration and usage
      `docs/guide/config.md`, `docs/cli` logging-related references: document new `logging` config section, defaults, and verbosity interaction.
      Approach: add concise examples for file destination default behavior and CLI verbosity overrides.
      (Req: Logging configuration)
- [x] 5.6 Execute manual verification scenarios from design
      runtime verification via `specd status`, `specd -vv status`, and config fallback check.
      Approach: confirm file log creation, console trace visibility with verbose flags, and fallback behavior when `logging` section is absent.
      (Req: Project-Wide Logging (File), Verbosity Overrides)
