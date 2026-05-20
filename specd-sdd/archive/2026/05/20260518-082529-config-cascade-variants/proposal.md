# Proposal: config-cascade-variants

## Motivation

Local configuration in specd is currently expensive to maintain because changing one field requires copying the entire project config. This issue matters now because the platform already supports multiple config-driven behaviors, and the current replacement-only model makes local development overrides fragile and repetitive.

## Current behaviour

Today `specd.local.yaml` is a full replacement for `specd.yaml`. When a local file is present, the shared config is not read, no merge happens, discovery stops at the first matching file, and `specd init` only gitignores `specd.local.yaml`.

This prevents small local overrides such as changing one workspace path, tweaking storage, or removing one context or hook entry without duplicating the full config. Named config variants also have no defined discovery cascade.

## Proposed solution

Add a layered config cascade for `specd.yaml`, named variants, and local variants while preserving backward compatibility for projects that use `specd.local.yaml` as a standalone config.

The new model should:

- discover and merge present config layers in a deterministic order during normal discovery
- preserve exact-entrypoint behavior for `--config`, resolving only the selected file and its own `extends` chain
- define merge semantics for scalars, objects, additive arrays, explicit object-key removals, and structured array removals by local identity
- allow local-only standalone behavior when the local base file does not opt into cascading
- update init/gitignore behavior to cover local named variants as well as `specd.local.yaml`

At the config-file level, the intended direction is:

- use `extends` as the explicit opt-in mechanism for inheritance, with `extends: true` meaning “inherit from the previous active layer” and `extends: <path>` meaning “inherit from this explicit in-chain base”
- require an `extends` target to stay inside the applicable config chain, so explicit inheritance cannot jump to arbitrary files outside the active cascade
- allow explicit removal of object members where keyed maps exist, especially `workspaces.<name>` and `storage.<key>`
- keep `remove` as a top-level config key for structured removal from additive arrays
- use `remove.root` to delete optional top-level fields without overloading booleans or nulls
- use the same `remove` block for keyed object maps, removing named keys when the target is a map such as `workspaces` or `storage`
- allow optional `id` fields on array items specifically so inherited entries can be removed through stable identifiers instead of fragile content matching
- keep the existing config sections (`workspaces`, `storage`, `context`, `workflow`, `plugins`, and similar blocks) as the merge targets rather than introducing a separate override namespace
- treat named variants as a file-discovery convention (`specd.*.yaml` and `specd.local.*.yaml`) instead of a new in-file variant registry
- treat `remove` as an inheritance-only feature: a config file that does not declare `extends` must not use `remove`

The intended operation model follows the same structural idea as `schemaOverrides` rather than a global selector pass over the whole YAML document:

- the config key selects the target collection (`context`, `plugins.agents`, `workflow`, and similar arrays)
- `append` and `remove` operate inside that collection scope
- item targeting happens inside that local scope, with `id` as the preferred stable identifier where available
- each removable array defines its own identity keys, so removal stays deterministic without introducing AST-wide selector matching
- when `remove` targets `root`, its entries are interpreted as optional top-level field names to delete
- when `remove` targets a keyed object map such as `workspaces` or `storage`, its entries are interpreted as key names to delete rather than as array items to match
- invalid cascade instructions must surface as typed specd errors rather than generic parser or runtime exceptions

The intended compatibility rule is explicit:

- when `specd.local.yaml` does not declare `extends`, it remains a complete standalone root and therefore replaces `specd.yaml`
- when `specd.local.yaml` declares `extends`, it becomes an inheriting layer and participates in the cascade
- later local named variants (`specd.local.*.yaml`) still apply on top of whichever local base is active
- local named variants are applied in ascending alphabetical order by filename, so later-sorting filenames have higher effective precedence
- using `remove` in a config file that does not declare `extends` should be a validation error, because there is no inherited base to remove from
- a file loaded by normal discovery may only `extends` a config that belongs to that same discovery cascade; pointing to an unrelated config file should be a validation error
- config files outside the normal discovery naming convention should not be auto-loaded by presence alone; they are loaded only when selected explicitly with `--config` or when reached from that explicitly selected config's own `extends` chain
- a discovered config file with an explicit `extends` target only applies when that target belongs to the already active chain being resolved; otherwise the discovered file is ignored in normal discovery
- in explicit `--config` mode, the selected file and its full `extends` chain are resolved even when some chain members would not have become active through normal discovery alone

Illustrative examples for the intended config shape:

```yaml
# specd.local.yaml
extends: true

workspaces:
  default:
    codeRoot: ./worktrees/local-dev

storage:
  changes:
    fs:
      path: .specd/local-changes
```

```yaml
# specd.local.dev.yaml
extends: true

remove:
  root:
    - llmOptimizedContext
  workspaces:
    - billing
  storage:
    - drafts
  context:
    - id: bootstrap

plugins:
  agents:
    - name: '@specd/plugin-agent-codex'
      config:
        commandsDir: .codex/commands
```

```yaml
# specd.local.experimental.yaml
extends: ./specd.experimental.yaml
```

```yaml
# specd.yaml
context:
  - id: bootstrap
    file: specd-bootstrap.md

schemaOverrides:
  append:
    workflow:
      - step: archiving
        hooks:
          post:
            - id: notify-team
              run: pnpm run notify-team
```

In these examples:

- `extends` makes the file participate in inheritance instead of acting as a standalone root
- `extends: true` means “inherit from the previous active layer in the resolved chain”
- `extends: ./specd.experimental.yaml` means “inherit only when that explicit base is active in the resolved chain”
- scalar and object fields override only the keys they redefine
- keyed object entries such as `workspaces.billing` or `storage.drafts` can be removed explicitly rather than only overwritten
- optional top-level fields can be removed explicitly via `remove.root`
- additive arrays can be extended by appending new entries
- inherited array entries can be removed through `remove` using local structural identity
- `id` is the preferred way to target removable inherited array items when the base config provides one
- `remove.context` means “remove from the `context` array”, not “search the whole YAML file for something called context”
- a discovered file such as `specd.local.experimental.yaml` remains inactive during normal discovery unless its explicit base, `specd.experimental.yaml`, is already part of the active chain
- selecting either `specd.experimental.yaml` or `specd.local.experimental.yaml` explicitly with `--config` activates that explicit chain and allows the local experimental layer to participate

Examples of ordering by filename when local variants are present:

```text
specd.local.10-team.yaml
specd.local.20-machine.yaml
specd.local.99-final.yaml
```

These would apply in exactly that order, so `specd.local.99-final.yaml` becomes the highest-precedence local layer.

If a project wants a specific config to be last, the naming convention can make that explicit. For example:

```text
specd.local.dev.yaml
specd.local.dev-override.yaml
specd.local.zz-last.yaml
```

In that sequence, `specd.local.zz-last.yaml` sorts last alphabetically and therefore wins whenever it redefines the same scalar or object keys as earlier local layers.

## Specs affected

### New specs

- None.

### Modified specs

- `core:config`: change project configuration semantics to define cascade discovery order, standalone-local fallback, merge behavior for layered config files, `remove` semantics for keyed object entries such as `workspaces` and `storage`, structured array removal by per-array identity keys, optional array-item identifiers intended for `remove` targeting, and updated gitignore conventions for local variants.
  - Depends on (added): none

- `core:config-loader`: change loader behavior so discovery builds the active config from multiple layers instead of selecting a single file, while preserving exact-file `--config` semantics and validation rules for the resulting merged config.
  - Depends on (added): none

- `core:init-project`: change initialization expectations so project bootstrap writes gitignore entries that cover both `specd.local.yaml` and local named variants.
  - Depends on (added): none

- `core:config-writer-port`: change the port contract for project initialization to require the broader local gitignore convention during `initProject`.
  - Depends on (added): none

## Impact

Affected code areas are concentrated in core config loading and project initialization:

- `packages/core/src/infrastructure/fs/config-loader.ts`
- `packages/core/src/application/specd-config.ts`
- `packages/core/src/infrastructure/fs/config-writer.ts`
- `packages/core/test/infrastructure/fs/config-loader.spec.ts`
- `packages/core/test/infrastructure/fs/config-writer.spec.ts`

The blast radius is high because resolved config feeds kernel composition, repository wiring, schema loading, and most CLI command setup paths.

## Technical context

The existing code and specs were reviewed before drafting this proposal. Current behavior is encoded both in spec text and tests that explicitly assert `specd.local.yaml` exclusive precedence.

The change should stay centered on config semantics and initialization behavior rather than inventing a separate feature surface. The preferred removal model is structural and local, aligned with how `schemaOverrides` resolves targets by container plus identity rather than by global AST search.

The proposal direction is to reuse a config shape that remains close to today's authored `specd.yaml`: normal config keys continue to express the resulting configuration, `extends` expresses inheritance, and `remove` expresses deletion of inherited content for both keyed object members and array entries. This keeps the authored file declarative and avoids introducing a second parallel override DSL just for layered config.

Discovery should also be chain-aware rather than purely presence-driven. A filename-discovered variant with an explicit `extends` target should only activate when that target is already part of the chain being resolved. This lets files such as `specd.local.experimental.yaml` keep a conventional variant name while still remaining inactive during normal discovery unless `specd.experimental.yaml` is intentionally selected or otherwise activated first.

Where array items may need downstream removal, the proposal direction is to let authors add an optional `id` and make that the preferred remove target. This gives layered config a durable reference point for hooks, context entries, plugins, and similar additive arrays.

For removals, the preferred mental model is the one already used by `schemaOverrides`: the structure names the container first, then the operation resolves entries within that container by local identity. The design should not require users to write full-document selectors just to remove one inherited config item from a known array.

Because removal only makes sense relative to inherited content, the specs should require `extends` whenever `remove` is present. A standalone config root may replace values by redefining them, but it must not contain removal instructions against a nonexistent parent layer.

The inheritance model should distinguish three practical cases:

- standalone config: no `extends`, so it becomes the root from that point
- inheriting config against the implicit parent selected by cascade order: represented as `extends: true`, allowed and expected
- inheriting config against an explicitly named parent: represented as `extends: <path>`, allowed only when that parent is still part of the same applicable config chain, not an arbitrary external config file

This keeps discovery deterministic while still allowing a config to be explicit about which in-chain base it expects.

Explicit `--config` mode should remain intentionally narrow in the first version:

- only one `--config` entrypoint is supported
- that entrypoint resolves its own `extends` chain as a closed set
- normal discovery does not add more layers on top of that explicit chain

This keeps `--config` exact and avoids surprising activation of filename-discovered variants during explicit selection.

All feature-level validation failures introduced by this change should be modeled as specd domain/application errors and therefore surface through the normal `SpecdError` path, not as untyped YAML or generic runtime exceptions. Examples include using `remove` without `extends`, trying to remove a required root field such as `schema`, removing an unknown workspace/storage key, or providing an ambiguous/non-resolvable array removal target.

The specs should define the identity keys for each removable array explicitly. Initial expected directions are:

- `context[]`: `id` preferred; otherwise the natural authored key (`file` or `instruction`) if that array item shape guarantees uniqueness
- `plugins.agents[]`: `name`
- `workflow[]`: `step`
- `workflow[].hooks.pre[]` and `workflow[].hooks.post[]`: `id` preferred; otherwise the natural authored key for the hook shape (`run` or `instruction`) if uniqueness rules permit it

These identity keys should be defined per array in the spec rather than allowing arbitrary field-combination matching.

For `context[]`, this change is expected to introduce `id` support as new config surface so inherited context entries can be removed stably. The clearest fit is file-backed context entries. Inline `instruction` entries are less naturally identifiable, so the spec work should be explicit about whether they also support `id` or remain removable only through their authored value.

For keyed objects, the specs should also define which maps support explicit key removal. Initial required cases are:

- `workspaces`: remove a named workspace entry such as `billing`
- `storage`: remove a named storage entry such as `drafts`

Whether other keyed maps should later support the same pattern can be decided independently, but these two must be covered by the first version.

For optional top-level fields, the specs should define which fields may appear under `remove.root`. Initial expected cases include project-level toggles or optional sections such as:

- `llmOptimizedContext`
- `logging`
- `privacy`
- `context`
- `plugins`
- `schemaPlugins`
- `schemaOverrides`

Required top-level fields such as `schema` must not be removable through `remove.root`; attempting to do so should be a validation error.

The proposal examples are intentionally shaped like normal config files rather than patch documents. That keeps layered config understandable to users reading a single file in isolation while still giving the loader enough structure to compute deterministic merged output.

Graph investigation showed critical coupling around:

- `packages/core/src/infrastructure/fs/config-loader.ts`
- `packages/core/src/infrastructure/fs/config-writer.ts`

That coupling means backward compatibility and deterministic merge order must be specified clearly before implementation starts.

## Open questions

- None at proposal level after choosing single-entrypoint closed-chain `--config` semantics for the first version..
