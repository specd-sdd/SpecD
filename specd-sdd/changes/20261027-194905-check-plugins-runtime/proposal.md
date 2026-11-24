# Proposal: check-plugins-runtime

## Motivation

Workflow checks (transition and archive) cannot use internal use cases, and a check cannot be shipped as a plugin. A check only sees `CheckExecutionContext`, and the only extension path, `KernelBuilder.registerCheck`, accepts a ready-made definition that no package other than core calls. Nothing on this branch has been released, so breaking changes are acceptable.

## Current behaviour

- `CheckExecutionContext` (`packages/core/src/domain/services/transition-checks.ts`) exposes only `change`, `schema`, `attempt`, `config`, `validity`, `onCheckProgress`, `skipHookPhases`, `effectiveStatusByArtifact`, `approvals`, `passMemo`. No use cases, no kernel.
- `CustomCheckDefinition` has `id`, `label`, optional `command`, `execute(ctx)`.
- Built-in checks receive use cases as deps in `createWorkflowCheckRegistry`, wired by `resolveWorkflowCheckRegistry` (`composition/use-cases/workflow-check-registry.ts`). Plugin checks are told apart from built-ins by `id.startsWith('@')`.
- `registerCheck(pluginName, check, defaultBindings?, options?)` on `KernelBuilder` accepts only a definition. The registry composes the id as `@${pluginName}.${check.id}` and validates `pluginName` with `^[a-zA-Z0-9_-]+$` (its JSDoc says `^[a-z][a-z0-9-]*$`).
- A workflow schema references a check only by id (`skippable`, `disabled`, `config`, `onFailure`); it cannot define check logic.
- `plugin-manager` only knows plugin type `agent`; the plugin system itself is being reworked in the sibling change `plugin-architecture`.

## Proposed solution

This change builds on `plugin-architecture` (plugin as a feature with N contributions declared in the manifest, flat `plugins` list in `specd.yaml`, open registry of contribution-kind handlers, `registerPlugins` in the SDK). It contributes only what is specific to the `check` kind:

1. **`CheckServices`** (core): a frozen, typed facade over already-composed use cases, built once per kernel from the same instances the kernel uses (no second composition). Admission rule: only read use cases, or read use cases with an internal cache that does not alter the returned result; never use cases that feed back into the check engine (e.g. `getStatus`) or modify the state of a change.
2. **`registerCheck` factory form** (core): accepts a definition or a factory `(services) => CustomCheckDefinition`, resolved inside `createKernel` after use cases are composed.
3. **Scoped plugin names for checks** (core): the registry requires `pluginName` to be a scoped npm name (`@scope/name`, the leading `@` is mandatory and never added); the canonical id is `@scope/name.local_id`, local ids contain no `.`. This keeps `@` as the discriminator against built-in ids such as `workflow.requires`. The JSDoc/regex mismatch in `check-registry.ts` is fixed.
4. **`check` contribution kind** (plugin-manager): the manifest block `contributes.checks[]` declares each check statically, so checks are discoverable without code or a kernel. Each entry carries `id`, a gerund `label`, optional `command`, `defaultBindings` (`PluginCheckDefaultBinding`: `scope`, `from?`, `to?`, `along?`, `skippable?`, `allow*`) and governance options (`allowSchemaEmbedding`, `allowBindingOverride`, `allowConfigOverride`, `allowDisable`, check-level default `config`). The plugin code supplies only, per declared id, a factory `(services, pluginConfig) => execute`; the loader cross-validates that manifest ids and code factory keys match. The kind handler registers each check through `builder.registerCheck(...)` before `build()` with ids and bindings already known, and only `execute` is deferred through the factory form. `CheckPlugin` is the code contract of the kind.
5. Plugins never touch the builder or kernel. They are trusted in-process code (same trust model as every plugin); `CheckServices` restrictions are API contract, not a security boundary.

## Specs affected

### New specs

- `core:check-services`: catalog and contract of `CheckServices` (frozen, same instances as the kernel, admission rule, a throwing service becomes a `fail` result, adding a service is compatible while removing one or changing a signature is breaking, `ctx.change` stays the source of truth for the change under evaluation, trust statement).
  - Depends on: `core:check-registry`, `core:transition-checks`, `core:kernel`, `default:_global/architecture`
- `plugin-manager:check-plugin-type`: `check` contribution kind: manifest block `contributes.checks[]`, `CheckPlugin` code contract (per-id factory `(services, pluginConfig) => execute`), manifest/code cross-validation, the kind handler that registers checks on the builder.
  - Depends on: `plugin-manager:specd-plugin-type`, `plugin-manager:register-plugins-use-case`, `core:check-services`, `core:check-registry`

### Modified specs

- `core:check-registry`: factory-registered checks receiving `CheckServices`; scoped plugin names; canonical id `@scope/name.local_id`; local ids without `.`.
  - Depends on (added): `core:check-services`
  - Depends on (removed): none
- `core:kernel-builder`: `registerCheck` accepts a definition or a factory; factories are resolved at `build()` with `CheckServices`; interplay with base registration state from `KernelOptions`.
  - Depends on (added): `core:check-services`
  - Depends on (removed): none

## Impact

- `packages/core`: `domain/services/transition-checks.ts` (hot: ~793 transitive dependents per the graph, CRITICAL; edits must be additive, optional types only), `domain/services/check-registry.ts`, `composition/kernel-builder.ts`, `composition/kernel.ts`, `composition/use-cases/workflow-check-registry.ts`, new `CheckServices` module.
- `packages/plugin-manager`: new `check` kind (type, handler, manifest block), built on the registry of kind handlers from `plugin-architecture`.
- Everything about `specd.yaml` shape, config schema and validation, manifest identity, lifecycles, `cli plugins *`, `registerPlugins` and `createSdkContext` is in `plugin-architecture`, not here.
- Depends on `plugin-architecture` landing first (or being built together); `core:kernel-builder` text must be written against its result.

## Technical context

- Agreed `CheckServices` v1 catalog (curated subset audited against the admission rule): `getSpecMetadata`, `validateSpecs`, `getSpec`, `listSpecs`, `getSpecOutline`, `previewSpec`, `countTasks`, `listChanges`, `detectOverlap`, `getImplementationReview`, `compileContext`, plus `logger` and `projectRoot`. `getSpecMetadata` and the services built on it (`validateSpecs`) may persist derived cache under `.specd/metadata/...`; the spec documents "effects limited to derived caches". Explicitly excluded: `getStatus`, `runStepHooks`, `validateArtifacts` (it mutates via reconcile), transition/archive/approve/create/edit/draft/restore/discard, tracking updates and refreshes, and all `update*`/`regenerate*`/`initialize*` persisted-state writers. Reading the change under evaluation through `listChanges` may show lagging persisted state; `ctx.change` is authoritative.
- Rejected: a new `policy: 'read'` for `MaterializeSpecMetadata` (over-engineering, plugins are trusted); passing the whole `Kernel` to `registerCheck`; closures over hand-built use cases in the host (second composition); resolving check ids and bindings late through `checks(services, config)` (replaced by the static manifest declaration); a separate `namespace` field or deriving one from the npm name.
- Check ids are declared in the manifest, not in code, so `plugins show`/`list` can list a plugin's checks and schema references can be validated without a kernel.
- The plugin-level `defaultConfig` (written to `specd.yaml` on install, defined in `plugin-architecture`) and the check-level default `config` in the governance options are different things and named distinctly.
- Where a check acts and its policies (`onFailure`, `skippable`, `disabled`, per-binding config) stay in the workflow schema and can be adjusted through schema layers within the locks the plugin declares in its registration (`core:check-registry`). Known interaction, out of scope: project schema layers (`schemaOverrides`, `schemaPlugins`) are applied by `ResolveSchema` to whatever reference it resolves, from the current config at each resolution, and the merged schema is not persisted (a change records only `schema: { name, version }`). So a plugin check placed through a layer reaches a change only while the layer stays in the config; changes to layers mid-change are neither recorded nor detected.
- Example (all values are placeholders, not real names):
  ```json
  "contributes": {
    "checks": [
      { "id": "<id>", "label": "<Gerund label>",
        "defaultBindings": [{ "scope": "archive" }],
        "options": { "allowSchemaEmbedding": false, "allowDisable": true } }
    ]
  }
  ```
  ```ts
  checks: { '<id>': (services, pluginConfig) => ({ async execute(ctx) { /* ... */ } }) }
  ```

## Open questions

None blocking the specs. To verify during design, not decisions: that `schemaOverrides` reaches `step.checks`; each `CheckServices` use case against the admission rule by reading it; where the `check` kind handler lives in the dependency graph, which depends on the handler registry shape defined in `plugin-architecture`.
