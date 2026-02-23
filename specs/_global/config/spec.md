# Project Configuration

## Overview

`specd.yaml` is the single project-level configuration file for specd. It declares which schema governs the project, how specs are organised across workspaces, where changes and archives are stored, project-level workflow hooks, per-artifact constraints, and installed plugins. Every tool in the specd ecosystem reads this file — the CLI, MCP server, and plugins all derive their wiring from it.

## Requirements

### Requirement: Config file location and format

`specd.yaml` must be a valid YAML file. specd discovers it using the following strategy, in order:

1. **`--config` flag** — if the CLI is invoked with `--config path/to/specd.yaml`, that path is used directly; no discovery takes place.
2. **Walk up from CWD, bounded by the git repo root** — specd walks up from the current working directory, checking each directory for `specd.yaml`. The walk stops at the **first match** (nearest to CWD) or at the git repo root (the nearest ancestor directory containing `.git/`), whichever comes first. If no `specd.yaml` is found before or at the repo root, specd exits with an error.
3. **CWD only, when not inside a git repo** — if no `.git/` ancestor exists (e.g. the user is running specd from outside any repository, as in a coordinator script), specd checks only the current working directory and stops there. It does not walk further up.

The search never goes above the git repo root. This prevents accidentally picking up a `specd.yaml` from a parent repository in nested or sibling monorepo layouts. In a monorepo where each package has its own `specd.yaml`, the package-level file is used when running specd from within that package — the root-level file is not considered.

### Requirement: Local config override

Alongside `specd.yaml`, developers may place a `specd.local.yaml` file in the same directory to use a fully independent local configuration. When `specd.local.yaml` is present, specd uses it exclusively — `specd.yaml` is not read and no merging takes place. The local file is a complete, self-contained config that must be valid on its own.

The file is optional — its absence is normal. `specd init` must add `specd.local.yaml` to the project's `.gitignore` so it is never committed.

The typical workflow for local customisation is: copy `specd.yaml` to `specd.local.yaml`, then edit the copy. This keeps the mental model simple — there is always exactly one active config file.

When the CLI is invoked with `--config path/to/specd.yaml`, that file is used exactly as specified — no `specd.local.yaml` lookup takes place. This allows testing with the shared config without the local override interfering.

### Requirement: Schema reference

`specd.yaml` must declare a `schema` field identifying the schema that governs this project. Only one schema is active per project at a time — per-workspace schema selection is not supported. The field is required.

The value uses a prefix convention to make the resolution strategy explicit:

```yaml
schema: "@specd/schema-std"            # npm package — starts with @
schema: "#spec-driven"                 # default workspace's schemasPath (same as bare name)
schema: "spec-driven"                  # bare name — resolved from default workspace's schemasPath
schema: "#billing:my-billing-schema"   # named workspace's schemasPath
schema: "./schemas/custom/schema.yaml" # direct path — relative to specd.yaml location
schema: "/absolute/path/schema.yaml"   # direct absolute path
```

- **`@scope/name`** — an npm package. The schema file is loaded from `node_modules/@scope/name/schema.yaml`. Version selection is handled by npm via `package.json`.
- **`#workspace:name`** — a named schema resolved from a specific workspace's `schemas` section. `#billing:my-schema` loads from `workspaces.billing.schemas.fs.path/my-schema/schema.yaml`.
- **`#name` or bare name** — equivalent to `#default:name`. Resolved from the `default` workspace's `schemas` section.
- **Relative or absolute path** — a direct path to a `schema.yaml` file. Relative paths are resolved from the directory containing `specd.yaml`.

There is no implicit multi-level fallback — the prefix determines exactly where specd looks. `SchemaRegistry.resolve()` receives the full value from `specd.yaml` and dispatches based on the prefix.

**Resolution timing:** schema resolution happens at command dispatch time, immediately before the command body executes. Commands that do not require the schema — such as `--help`, `--version`, `init`, `config validate`, and `plugin` subcommands — skip resolution entirely.

**Error types:** both `ConfigValidationError` (malformed `specd.yaml`) and `SchemaNotFoundError` / `SchemaValidationError` (resolution failures) are domain errors defined in `@specd/core` and extend `SpecdError`. They are distinct types with distinct messages and exit codes — config errors indicate a problem with `specd.yaml` itself; schema errors indicate a problem with the referenced schema.

### Requirement: Workspaces

`specd.yaml` must declare at least one workspace under the `workspaces` key. Each workspace defines where its specs live, where the implementation code lives, where its local schemas are stored, and the ownership relationship the project has with those specs.

`default` is a reserved workspace name that identifies the local project workspace. Every config must contain a `default` workspace. `specd init` creates it automatically if no `workspaces` section is present.

```yaml
workspaces:
  default: # required — the local project workspace
    specs: # where this workspace's spec files live (required)
      adapter: fs # storage adapter (required; only "fs" in v1)
      fs:
        path: specs/
    schemas: # where named local schemas live (optional)
      adapter: fs
      fs:
        path: specd/schemas # default: specd/schemas (relative to specd.yaml)
    codeRoot: ./ # where implementation code lives (default: project root)
    ownership: owned # owned | shared | readOnly (default: owned)

  billing: # additional workspace
    specs:
      adapter: fs
      fs:
        path: ../billing/specd/specs
    schemas:
      adapter: fs
      fs:
        path: ../billing/dev/schemas
    codeRoot: ../billing # required for non-default workspaces — no default
    ownership: readOnly # default for non-default workspaces
```

**`specs`** (required) — declares where this workspace's spec files live. Has its own `adapter` and adapter-specific config block. Only `"fs"` is supported in v1.

**`specs.fs.path`** (required for `fs` adapter) — directory where spec files live. Relative paths are resolved from the directory containing `specd.yaml`. May point outside the project repo root, in which case `RepositoryConfig.isExternal` is set to `true` by the application layer.

**`schemas`** (optional) — declares where named local schemas for this workspace are stored. Has its own `adapter` and adapter-specific config block, independent of `specs`. Used when the `schema` field references `#workspace:name` or a bare/hash-prefixed name targeting this workspace.

- For the `default` workspace, if omitted, defaults to `adapter: fs` with `fs.path: specd/schemas`.
- For non-`default` workspaces, if omitted, the workspace has no local schemas — any schema reference targeting it (e.g. `#billing:name`) will produce a `SchemaNotFoundError`.

**`codeRoot`** — directory where the implementation code for this workspace lives. Used by `CompileContext` to tell the agent where to write code.

- For the `default` workspace, defaults to the project root (the directory containing `specd.yaml`).
- For non-`default` workspaces, `codeRoot` is required — there is no sensible default since the implementation code lives in an external location.

**`ownership`** — the relationship this project has with specs in the workspace:

- `owned` — the project owns these specs; changes are freely proposed (default for `default`)
- `shared` — the project co-owns these specs; changes may require coordination
- `readOnly` — the project reads but does not modify these specs (default for non-`default` workspaces)

**`isExternal`** is not declared in config — it is inferred by the application layer from whether the resolved `specs.fs.path` is outside the project repo root.

**`contextIncludeSpecs`** (optional) — workspace-level context spec patterns. Loaded only when this workspace is active in the current change. Patterns follow the same syntax as the project-level field, with one difference: omitting the workspace qualifier means _this workspace_ (not `default`). So `['*']` means all specs in this workspace; `['auth/*']` means specs under `auth/` in this workspace.

**`contextExcludeSpecs`** (optional) — workspace-level exclusion patterns. Applied only when this workspace is active in the current change. Same qualifier semantics as `contextIncludeSpecs` at workspace level.

Workspace names must be unique and must match `/^[a-z][a-z0-9-]*$/`. The name `default` is reserved.

**Each project's `specd.yaml` is the sole source of truth for that project's view of its workspaces.** specd never reads the `specd.yaml` of external repos declared as workspaces — paths, schemas, ownership, and all other workspace fields must be explicitly declared in the active config. This means:

- If the `billing` repo has its own `specd.yaml` where it is the `default` (`owned`) workspace, the coordinator that references it as `readOnly` must independently declare those paths and settings. The two configs coexist without awareness of each other.
- When an external workspace's structure changes (paths, schema, etc.), every project that references it must update its own `specd.yaml` manually — there is no automatic synchronisation.
- `ownership` is always relative to the declaring project: the same repo can be `owned` in its own config and `readOnly` in a coordinator's config simultaneously. Both are valid and intentional.

### Requirement: Storage configuration

`specd.yaml` must include a `storage` section with sub-keys for `changes` and `archive`. These paths are global — a project has one changes directory and one archive directory regardless of workspaces.

```yaml
storage:
  changes:
    adapter: fs
    fs:
      path: specd/changes

  archive:
    adapter: fs
    fs:
      path: specd/archive
      pattern: '{{change.archivedName}}' # optional; default: "{{change.archivedName}}"
```

`adapter` is required per sub-key; adapter-specific fields are nested under the adapter key (`fs:`). Unknown adapter values must produce a validation error. Relative paths are resolved from the directory containing `specd.yaml` and must remain within the project repo root.

### Requirement: Template variables

Several fields in `specd.yaml` support template variable interpolation using `{{variable}}` syntax. Template variables are resolved at runtime by the application layer before the value is used.

The following variables are available in **`storage.archive.fs.pattern`**:

| Variable                  | Value                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `{{change.name}}`         | The change's slug name (e.g. `add-auth-flow`)                                                           |
| `{{change.archivedName}}` | The change's full archived directory name (e.g. `2024-01-15-add-auth-flow`) — the default pattern value |
| `{{change.workspace}}`    | The primary workspace of the change                                                                     |
| `{{year}}`                | Four-digit current year (e.g. `2024`)                                                                   |
| `{{date}}`                | ISO date at archive time (e.g. `2024-01-15`)                                                            |

The following variables are available in **`workflow` hook `run` commands**:

| Variable               | Value                                                           |
| ---------------------- | --------------------------------------------------------------- |
| `{{change.name}}`      | The change's slug name                                          |
| `{{change.workspace}}` | The primary workspace of the change                             |
| `{{codeRoot}}`         | The resolved absolute path to the active workspace's `codeRoot` |

Unknown variables in a template are left as-is and a warning is emitted.

### Requirement: Workflow additions

`specd.yaml` may include a `workflow` section to add project-level hooks to skill lifecycle points. Entries are matched to schema workflow entries by `skill` name; schema hooks fire first, then project hooks. `requires` is not valid in project-level workflow entries and must be rejected.

```yaml
workflow:
  - skill: archive
    hooks:
      post:
        - run: 'pnpm run notify-team'
        - run: 'git checkout -b specd/{{change.name}}'
  - skill: apply
    hooks:
      pre:
        - instruction: |
            Prefer editing existing files over creating new ones.
```

### Requirement: Project-level artifact rules

`specd.yaml` may include an `artifactRules` section to add per-artifact constraints without forking the schema. Keys are artifact IDs; values are arrays of constraint strings. `CompileContext` injects them as a distinct block in the compiled instruction, after the schema's instruction.

```yaml
artifactRules:
  specs:
    - 'All requirements must reference the relevant RFC number'
    - 'Scenarios must use WHEN/THEN/AND format'
  design:
    - 'Architecture decisions must reference an ADR'
```

Keys are validated against the active schema's artifact IDs at startup. Unknown keys emit a warning but do not prevent startup.

### Requirement: Context spec selection

`contextIncludeSpecs` and `contextExcludeSpecs` can be declared at two levels with different semantics:

- **Project level** (top-level in `specd.yaml`) — patterns are always applied, regardless of which workspaces the current change touches. Use this for specs that must always be in context: global constraints, cross-cutting architecture specs, shared external specs.
- **Workspace level** (inside a workspace entry) — patterns are applied only when that workspace is active in the current change. Use this for specs that are relevant only when working within that workspace.

**A workspace is considered active if at least one of its specs is listed in the current change's metadata.** When a change is created or updated, the set of specs it contains is recorded in its metadata file. `CompileContext` reads that list and resolves each spec's workspace by matching its path against the declared `specs.fs.path` entries — not by scanning the filesystem at compile time, not by CWD, not by `codeRoot`. A change whose metadata lists specs from both `default` and `billing` activates both workspaces simultaneously.

**Pattern syntax:**

| Pattern               | Meaning at project level                                            | Meaning at workspace level                                          |
| --------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `*`                   | All specs in all workspaces                                         | All specs in this workspace (= `{self}:*`)                          |
| `workspace:*`         | All specs in the named workspace                                    | All specs in the named workspace                                    |
| `prefix/*`            | All specs under `prefix/` in `default`                              | All specs under `prefix/` in this workspace                         |
| `workspace:prefix/*`  | All specs under `prefix/` in the named workspace                    | All specs under `prefix/` in the named workspace                    |
| `path/name`           | Exact spec in `default` (does not match descendants)                | Exact spec in this workspace (does not match descendants)           |
| `workspace:path/name` | Exact spec path in the named workspace (does not match descendants) | Exact spec path in the named workspace (does not match descendants) |

`*` may only appear in three positions: alone (`*`), as the sole suffix after `workspace:` (`billing:*`), or as the sole suffix after a path prefix ending in `/` (`_global/*`). It may not appear in the middle of a path segment or in any other position.

**Qualifier resolution by level:**

- At project level, omitting the workspace qualifier is equivalent to `default:`.
- At workspace level, omitting the workspace qualifier means _this workspace_ — e.g. inside `billing:`, `['auth/*']` means `billing:auth/*` and `['*']` means all specs in `billing`.

**Defaults:**

- Project-level `contextIncludeSpecs`: `['default:*']`
- Project-level `contextExcludeSpecs`: `[]`
- Workspace-level `contextIncludeSpecs`: `['*']` (equivalent to `{workspace-name}:*`)
- Workspace-level `contextExcludeSpecs`: `[]`

**Resolution order:** `CompileContext` builds the context spec set in this sequence:

1. Project-level include patterns (in declaration order) — always applied
2. Workspace-level include patterns from each active workspace (in workspace declaration order, then pattern order within each workspace)
3. Project-level exclude patterns — always applied
4. Workspace-level exclude patterns from each active workspace (same order as step 2)

Specs matched by earlier patterns take priority if the context must be truncated. A spec matched by multiple include patterns appears only once, at the position of the first matching pattern.

```yaml
# always in context — global constraints regardless of change scope
contextIncludeSpecs:
  - 'shared:_global/*'

workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs/
    contextIncludeSpecs:
      - '*' # all default specs, when default is active

  billing:
    specs:
      adapter: fs
      fs:
        path: ../billing/specd/specs
    codeRoot: ../billing
    contextIncludeSpecs:
      - '*' # all billing specs, when billing is active
    contextExcludeSpecs:
      - 'drafts/*' # exclude billing drafts (resolves to billing:drafts/*)

  shared:
    specs:
      adapter: fs
      fs:
        path: ../shared/specs
    ownership: readOnly
    # no workspace-level context — project-level shared:_global/* covers it
```

References to unknown workspace qualifiers produce a warning at startup but do not prevent startup — runtime is tolerant to allow working with partial workspace setups. However, `specd config validate` must fail with an error if any unknown workspace qualifier is found: a typo in a qualifier silently excludes specs from context, which is a dangerous silent failure in teams. References to non-existent spec paths are silently skipped at context-compilation time — this avoids breaking when a spec is temporarily deleted or not yet created. Invalid pattern syntax is an error caught at startup.

`specd config validate` additionally warns when a pattern (include or exclude, at any level) matches no specs on disk at validation time. This is not a runtime error — specs may not exist yet — but the warning helps catch typos early.

### Requirement: Plugin declarations

`specd.yaml` may include a `plugins` section declaring which agent-integration plugins are installed. Each entry must include `name`; `options` is plugin-specific and optional.

```yaml
plugins:
  - name: '@specd/plugin-claude'
  - name: '@specd/plugin-copilot'
    options:
      commandsDir: .github/copilot/instructions
```

Plugin declarations are used by `specd init`, `specd plugin add`, and `specd update` to install and maintain the plugin's skill files and hooks in the project. They do not affect schema resolution, storage, or context compilation.

### Requirement: Startup validation

specd must validate `specd.yaml` before executing any command that requires a config (see Schema reference requirement for which commands skip this). `specd init` is exempt — it creates `specd.yaml` and therefore requires no existing config.

The following conditions are **errors** that abort startup immediately:

- `schema` field is missing
- `storage` section is missing, or either `changes` or `archive` sub-key is absent
- `workspaces` section is missing, or no `default` workspace is declared
- `specs` section is missing in any workspace
- `codeRoot` is missing in any non-`default` workspace
- `adapter` is missing in any `specs`, `schemas`, or storage section
- Unknown adapter value in any `specs`, `schemas`, or storage section
- Required adapter-specific fields are absent (e.g. `fs.path` missing when `adapter: fs`)
- `requires` field present in a project-level workflow entry
- Storage path (`changes.fs.path` or `archive.fs.path`) resolves outside the repo root
- Invalid `contextIncludeSpecs` or `contextExcludeSpecs` pattern syntax (e.g. `*` in a disallowed position)

The following conditions emit **warnings** but allow startup to proceed:

- Unknown key in `artifactRules` (no matching artifact ID in the active schema)
- Duplicate workspace names (YAML retains last-wins; warn about the pattern)
- Project-level workflow entry names a skill not declared in the schema
- Unknown workspace qualifier in a `contextIncludeSpecs` or `contextExcludeSpecs` pattern (runtime only — `specd config validate` treats this as an error)

## Constraints

- `schema` is required — specd cannot start without a schema reference
- `workspaces.default` is required — every config must have a `default` workspace; `specd init` creates it
- `specd.local.yaml` is always `.gitignored`; `specd init` must add it automatically
- When `specd.local.yaml` is present it is the sole active config — `specd.yaml` is not read
- `specd.local.yaml` must be a complete, valid config on its own; partial overrides are not supported
- `requires` is not valid in project-level `workflow` entries
- Workspace names must match `/^[a-z][a-z0-9-]*$/`; `default` is reserved for the local project workspace
- `ownership` values are limited to `readOnly`, `shared`, and `owned`
- `isExternal` is not declared — it is inferred by the application layer from whether the resolved `specs.fs.path` is outside the project repo root
- Every workspace must declare a `specs` section; `codeRoot` is required for non-`default` workspaces
- `schemas` is optional: for the `default` workspace it defaults to `adapter: fs` / `fs.path: specd/schemas`; for non-`default` workspaces, omitting it means no local schemas — schema references targeting that workspace produce `SchemaNotFoundError`
- `adapter` is required in every `specs`, `schemas`, and storage section; adapter-specific fields are nested under the adapter key
- `storage` section is required and must contain both `changes` and `archive` sub-keys
- All relative paths resolve from the `specd.yaml` directory; storage paths (`fs.path` in `changes` and `archive`) must remain within the repo root
- Project-level `contextIncludeSpecs` defaults to `['default:*']`; project-level `contextExcludeSpecs` defaults to `[]`
- Workspace-level `contextIncludeSpecs` defaults to `['*']` (all specs in that workspace); workspace-level `contextExcludeSpecs` defaults to `[]`
- Project-level patterns are always applied; workspace-level patterns are applied only when that workspace is active in the current change
- At project level, omitting the workspace qualifier is equivalent to `default:`; at workspace level, omitting it means the declaring workspace
- Include pattern order (project-level first, then active workspace declaration order) determines context order and truncation priority
- A spec matched by multiple include patterns appears once, at the position of the first matching pattern
- `*` in a pattern may only appear alone, as `workspace:*`, or as a path suffix `prefix/*` — any other position is a startup error
- Unknown workspace qualifiers in patterns produce a warning, not an error; missing spec paths are silently skipped at compile time

## Examples

### Single-repo project (minimal)

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
  archive:
    adapter: fs
    fs:
      path: specd/archive
```

### Single-repo project with local schema

```yaml
schema: 'spec-driven' # resolves from default.schemas.fs.path (specd/schemas/spec-driven/schema.yaml)

workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs/
    schemas:
      adapter: fs
      fs:
        path: specd/schemas

storage:
  changes:
    adapter: fs
    fs:
      path: specd/changes
  archive:
    adapter: fs
    fs:
      path: specd/archive
```

### Coordinator repo managing multiple service repos

```yaml
schema: '@specd/schema-std'

workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs/
    codeRoot: ./

  auth:
    specs:
      adapter: fs
      fs:
        path: ../auth-service/specd/specs
    codeRoot: ../auth-service
    ownership: owned

  payments:
    specs:
      adapter: fs
      fs:
        path: ../payments-service/specd/specs
    codeRoot: ../payments-service
    ownership: owned

  platform:
    specs:
      adapter: fs
      fs:
        path: ../platform-repo/specd/specs
    codeRoot: ../platform-repo
    ownership: readOnly # specs are readable but not modifiable; loads by default when active

storage:
  changes:
    adapter: fs
    fs:
      path: specd/changes
  archive:
    adapter: fs
    fs:
      path: specd/archive
      pattern: '{{year}}/{{change.archivedName}}'

# workspace-level contextIncludeSpecs defaults to ['*'] —
# default, auth, and payments each load all their own specs when active

workflow:
  - skill: archive
    hooks:
      post:
        - run: 'git -C {{codeRoot}} checkout -b specd/{{change.name}}'
```

### Project with workspace-specific schema

```yaml
schema: '#billing:billing-schema' # ../billing/dev/schemas/billing-schema/schema.yaml

workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs/

  billing:
    specs:
      adapter: fs
      fs:
        path: ../billing/specd/specs
    schemas:
      adapter: fs
      fs:
        path: ../billing/dev/schemas
    codeRoot: ../billing
    ownership: readOnly

storage:
  changes:
    adapter: fs
    fs:
      path: specd/changes
  archive:
    adapter: fs
    fs:
      path: specd/archive

artifactRules:
  specs:
    - 'All requirements must reference the platform contract they satisfy'
```

## Spec Dependencies

- [`specs/_global/schema-format/spec.md`](../schema-format/spec.md) — schema structure and resolution order
- [`specs/_global/architecture/spec.md`](../architecture/spec.md) — port and adapter design
- [`specs/core/storage/spec.md`](../../core/storage/spec.md) — storage adapter behavior

## ADRs

- [ADR-0012: Configuration File Strategy](../../../docs/adr/0012-config-file-strategy.md)
- [ADR-0013: Workspaces, Not Scopes](../../../docs/adr/0013-workspaces-not-scopes.md)
- [ADR-0014: Single Changes and Archive Storage Per Project](../../../docs/adr/0014-single-storage-per-project.md)
