# Tasks: plugin-type-validation

## 1. Domain plugin types and guards

- [x] 1.1 Derive `PluginType` from a runtime source of truth and add base guard
      `packages/plugin-manager/src/domain/types/specd-plugin.ts`: `PLUGIN_TYPES`, `PluginType`, `isSpecdPlugin` — replace the hardcoded union with a const array and validate runtime objects against the full base contract plus known types.
      Approach: add `export const PLUGIN_TYPES = ['agent'] as const`, derive `PluginType` as `typeof PLUGIN_TYPES[number]`, and implement `isSpecdPlugin(value: unknown): value is SpecdPlugin` with a strict object-shape check plus `type` membership in `PLUGIN_TYPES`.
      (Req: plugin-manager:specd-plugin-type / PluginType, isSpecdPlugin type guard)
- [x] 1.2 Move `isAgentPlugin` to domain as an exported pure type guard
      `packages/plugin-manager/src/domain/types/agent-plugin.ts`: `isAgentPlugin` — add a reusable guard that verifies `'agent'` type and required lifecycle methods.
      Approach: implement `isAgentPlugin(value: SpecdPlugin): value is AgentPlugin` as a pure function checking `type === 'agent'` and function presence for `install` and `uninstall`.
      (Req: plugin-manager:agent-plugin-type / isAgentPlugin type guard)
- [x] 1.3 Export new guards through domain type barrel
      `packages/plugin-manager/src/domain/types/index.ts`: type/guard exports — expose `isSpecdPlugin`, `PLUGIN_TYPES`, and `isAgentPlugin` for application and infrastructure imports.
      Approach: keep existing type exports and add named value exports so infrastructure/use-cases can import domain guards without layering violations.
      (Req: plugin-manager:specd-plugin-type / isSpecdPlugin type guard, plugin-manager:agent-plugin-type / isAgentPlugin type guard)

## 2. Loader runtime validation flow

- [x] 2.1 Replace loader-local guard implementations with domain guards
      `packages/plugin-manager/src/infrastructure/loader/plugin-loader.ts`: imports and guard usage — remove local `isSpecdPlugin`/`isAgentPlugin` helpers and import canonical guards from domain types.
      Approach: update imports to consume `isSpecdPlugin` and `isAgentPlugin` from `../../domain/types/...`, then delete duplicated local guard functions to keep a single validation source.
      (Req: plugin-manager:plugin-loader / Load workflow)
- [x] 2.2 Enforce unknown runtime type rejection in loader validation
      `packages/plugin-manager/src/infrastructure/loader/plugin-loader.ts`: `validateRuntimePlugin()` — ensure base validation rejects runtime plugin objects whose `type` is not in `PLUGIN_TYPES`.
      Approach: rely on domain `isSpecdPlugin` first; on failure, throw `PluginValidationError` with base-contract fields so unknown types are rejected before subtype checks.
      (Req: plugin-manager:plugin-loader / Error handling; scenario: Unknown plugin type rejected at runtime)
- [x] 2.3 Keep subtype validation explicit for agent manifests
      `packages/plugin-manager/src/infrastructure/loader/plugin-loader.ts`: `validateRuntimePlugin()` agent branch — keep `'agent'` branch guarded by `isAgentPlugin` and fail with `PluginValidationError` when install/uninstall contract is missing.
      Approach: keep manifest-driven subtype dispatch and throw with `['install', 'uninstall']` when `pluginType === 'agent'` and the runtime object fails the agent guard.
      (Req: plugin-manager:plugin-loader / Load workflow, Error handling; scenario: Agent plugin missing install method)

## 3. Use-case safety checks before install/uninstall

- [x] 3.1 Guard install operation with `isAgentPlugin`
      `packages/plugin-manager/src/application/use-cases/install-plugin.ts`: `InstallPlugin.execute()` — remove unsafe cast and reject non-agent plugins before calling `install()`.
      Approach: import domain `isAgentPlugin` and `PluginValidationError`; after `loader.load()`, check guard and throw validation error on mismatch, then call `plugin.install(...)` only for validated agent plugins.
      (Req: plugin-manager:install-plugin-use-case / Behavior, Error handling; scenario: Non-agent plugin rejected)
- [x] 3.2 Guard uninstall operation with `isAgentPlugin`
      `packages/plugin-manager/src/application/use-cases/uninstall-plugin.ts`: `UninstallPlugin.execute()` — remove unsafe cast and reject non-agent plugins before calling `uninstall()`.
      Approach: mirror install flow: guard loaded plugin, throw `PluginValidationError` for non-agent values, then invoke `plugin.uninstall(...)`.
      (Req: plugin-manager:uninstall-plugin-use-case / Behavior, Error handling; scenario: Non-agent plugin rejected)
- [x] 3.3 Guard update operation with `isAgentPlugin`
      `packages/plugin-manager/src/application/use-cases/update-plugin.ts`: `UpdatePlugin.execute()` — validate plugin subtype before reinstall behavior.
      Approach: apply the same guard pattern as install/uninstall, throwing `PluginValidationError` for non-agent plugins before calling `install(...)`.
      (Req: plugin-manager:update-plugin-use-case / Behavior, Error handling; scenario: Non-agent plugin rejected)

## 4. Automated and manual verification

- [x] 4.1 Add unit tests for base plugin guard and known-type validation
      `packages/plugin-manager/test/domain/types/is-specd-plugin.spec.ts`: `isSpecdPlugin` scenarios — cover acceptance of known type and rejection of unknown type/malformed payloads.
      Approach: build minimal runtime objects and assert `isSpecdPlugin` returns `true` for valid `'agent'` payloads and `false` for unknown types or missing required members.
      (Req: plugin-manager:specd-plugin-type / isSpecdPlugin type guard; scenarios: Rejects unknown plugin type, Accepts known plugin type)
- [x] 4.2 Add unit tests for agent subtype guard
      `packages/plugin-manager/test/domain/types/is-agent-plugin.spec.ts`: `isAgentPlugin` scenarios — verify missing install/uninstall and wrong type paths reject cleanly.
      Approach: pass valid `SpecdPlugin`-shaped values with selective contract violations and assert guard results for each failure mode.
      (Req: plugin-manager:agent-plugin-type / isAgentPlugin type guard; scenarios: Rejects plugin without install method, Rejects plugin with wrong type)
- [x] 4.3 Extend install use-case tests for non-agent rejection
      `packages/plugin-manager/test/application/install-plugin.spec.ts`: `InstallPlugin.execute()` error path — add case where loader returns base plugin without agent methods and assert `PluginValidationError`.
      Approach: keep existing success test, add a failing fixture that passes `isSpecdPlugin` but not `isAgentPlugin`, and assert no install call is attempted.
      (Req: plugin-manager:install-plugin-use-case / Error handling; scenario: Non-agent plugin rejected)
- [x] 4.4 Add uninstall and update use-case tests for guard enforcement
      `packages/plugin-manager/test/application/uninstall-plugin.spec.ts`, `packages/plugin-manager/test/application/update-plugin.spec.ts`: execute-path tests — add success and non-agent rejection coverage for both use cases.
      Approach: mirror install test structure with mocked loader returns; assert `PluginValidationError` on non-agent values and method invocation on valid agent plugins.
      (Req: plugin-manager:uninstall-plugin-use-case / Behavior, Error handling; plugin-manager:update-plugin-use-case / Behavior, Error handling; scenarios: Non-agent plugin rejected)
- [x] 4.5 Extend runtime loader integration tests for new guard behavior
      `packages/plugin-manager/test/infrastructure/plugin-loader.spec.ts`: `createPluginLoader` validations — add explicit runtime-type mismatch and missing install/uninstall scenarios tied to manifest `pluginType: 'agent'`.
      Approach: create temporary local packages whose runtime `create()` output violates base type membership or agent subtype contract and assert `PluginValidationError`.
      (Req: plugin-manager:plugin-loader / Error handling; scenarios: Unknown plugin type rejected at runtime, Agent plugin missing install method)
- [x] 4.6 Execute test, lint, and export smoke checks
      `packages/plugin-manager` verification workflow: project validation commands — confirm implementation and exports satisfy design verification steps.
      Approach: run `pnpm test`, `pnpm lint`, and a runtime export check for `isSpecdPlugin`/`isAgentPlugin` from package entrypoints; fix regressions before moving to verifying.
      (Req: all modified specs — implementation and verification coverage gate)
