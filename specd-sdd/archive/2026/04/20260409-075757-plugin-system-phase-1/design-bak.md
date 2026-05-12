# Design: plugin-system-phase-1

## Overview

This design implements the plugin system phase 1 for specd — a plugin architecture where autonomous agent plugins install and manage skill files, replacing the current hardcoded skills CLI commands.

## Problem

The current implementation couples agent-specific installation logic to the CLI. Adding or evolving agent integrations requires editing the CLI instead of extending the system through plugins. The `@specd/skills` package is a flat skill bundle without proper models, and plugin packages are stubs.

## Approach

The implementation follows a three-layer architecture:

1. **Plugin Manager layer** (`@specd/plugin-manager`): Plugin interfaces, loader, registry, installer — pure TypeScript, no external deps. Consumed by CLI and MCP.
2. **Skills layer** (`@specd/skills`): Pure prompt library with Skill, SkillTemplate, SkillBundle models and a repository — zero dependencies on core
3. **CLI adapter layer** (`@specd/cli`): Imports `@specd/plugin-manager`, uses it to discover, load, validate, and orchestrate plugins

## Affected Areas

### New Files

#### `@specd/skills` package redesign (`packages/skills/src/`)

```
packages/skills/src/
├── domain/
│   ├── models/
│   │   ├── skill.ts           # Skill, SkillTemplate interfaces
│   │   ├── skill-bundle.ts    # SkillBundle, ResolvedFile interfaces
│   │   └── index.ts           # barrel export
│   └── index.ts               # barrel export (domain only)
├── application/
│   ├── use-cases/
│   │   ├── get-skill.ts       # get single skill
│   │   ├── list-skills.ts     # list all skills
│   │   ├── resolve-bundle.ts  # resolve skill bundle with variables
│   │   └── index.ts
│   ├── ports/
│   │   ├── skill-repository.ts # interface for skill storage
│   │   └── index.ts
│   └── index.ts
├── infrastructure/
│   ├── repository/
│   │   ├── skill-repository.ts # implements SkillRepository port
│   │   ├── template-reader.ts  # TemplateReader implementation using node:fs
│   │   └── index.ts
│   └── index.ts
├── templates/                 # skill template files
│   ├── shared/               # shared skill files with .meta.json
│   ├── specd-design/
│   └── specd-implement/
└── index.ts                   # main barrel export: createSkillRepository()
```

**Domain layer (pure, no I/O):**

- `Skill` — interface with name, description, templates
- `SkillTemplate` — interface with filename, getContent()
- `SkillBundle` — interface with install(), uninstall(), files

**Application layer (use cases):**

- `GetSkill` — returns single skill by name
- `ListSkills` — returns all skills (metadata only, no content)
- `ResolveBundle` — resolves skill bundle with variable substitution

**Infrastructure layer (I/O):**

- `SkillRepository` — implements domain interface, uses node:fs for file operations
- `TemplateReader` — reads .md template files

#### Plugin Manager package (`packages/plugin-manager/`)

```
packages/plugin-manager/
├── src/
│   ├── domain/
│   │   ├── types/
│   │   │   ├── specd-plugin.ts      # SpecdPlugin, ConfigSchemaEntry interfaces
│   │   │   ├── agent-plugin.ts     # AgentPlugin, InstallOptions, InstallResult
│   │   │   ├── plugin-context.ts   # PluginContext interface
│   │   │   └── index.ts            # barrel export
│   │   ├── errors/
│   │   │   ├── plugin-not-found.ts # PluginNotFoundError
│   │   │   ├── plugin-validation.ts # PluginValidationError
│   │   │   └── index.ts            # barrel export
│   │   └── index.ts                # barrel export (domain types only)
│   ├── application/
│   │   ├── use-cases/
│   │   │   ├── install-plugin.ts   # orchestrates plugin install
│   │   │   ├── uninstall-plugin.ts # orchestrates plugin uninstall
│   │   │   ├── update-plugin.ts    # orchestrates plugin update
│   │   │   ├── list-plugins.ts     # returns plugin inventory
│   │   │   ├── load-plugin.ts      # loads and validates a single plugin
│   │   │   └── index.ts
│   │   ├── ports/
│   │   │   ├── plugin-repository.ts # interface for plugin storage
│   │   │   └── index.ts
│   │   └── index.ts
│   ├── infrastructure/
│   │   ├── loader/
│   │   │   ├── plugin-loader.ts    # PluginLoader implementation
│   │   │   ├── registry.ts         # InMemoryPluginRegistry
│   │   │   └── index.ts
│   │   └── index.ts
│   └── index.ts                    # main barrel export
```

**Domain layer (pure, no I/O):**

- `SpecdPlugin` — base interface with `name`, `type`, `version`, `configSchema`, `init()`, `destroy()`
- `AgentPlugin` — extends SpecdPlugin with `install()`, `uninstall()`
- `PluginContext` — `projectRoot`, `configPath`, `cliPath`
- Error classes extend `SpecdError` from @specd/core

**Application layer (use cases):**

- `InstallPlugin` — receives plugin name, loads plugin, calls install()
- `UninstallPlugin` — receives plugin name, loads plugin, calls uninstall()
- `UpdatePlugin` — idempotent reinstall (no config mutation)
- `ListPlugins` — receives list of plugin names, returns status for each
- `LoadPlugin` — loads and validates a single plugin

**Infrastructure layer (I/O):**

- `PluginLoader` — uses Node.js `import()` for dynamic loading

**Config management stays in @specd/core:**

- `ConfigWriter.addPlugin()` / `removePlugin()` / `listPlugins()` — core manages specd.yaml
- CLI commands call ConfigWriter, then call plugin-manager use cases

**This package is consumed by CLI and MCP adapters — they don't implement plugin loading themselves.**

#### CLI plugin commands (`packages/cli/src/commands/plugins/`)

```
packages/cli/src/
└── commands/
    └── plugins/
        ├── install.ts       # specd plugins install
        ├── list.ts          # specd plugins list
        ├── show.ts          # specd plugins show
        ├── update.ts        # specd plugins update
        └── uninstall.ts     # specd plugins uninstall
```

**Key implementations:**

- Import `@specd/plugin-manager` and use `PluginLoader` class
- Commands orchestrate plugin operations via the manager
- Delete: `packages/cli/src/commands/skills/*.ts` entire directory

#### Plugin-claude implementation (`packages/plugin-agent-claude/`)

```
packages/plugin-agent-claude/
├── src/
│   └── index.ts            # exports create(): AgentPlugin
├── specd-plugin.json      # manifest file
└── package.json
```

**Key implementation:**

```typescript
// packages/plugin-agent-claude/src/index.ts
import { createSkillRepository } from '@specd/skills'
import path from 'node:path'
import type { AgentPlugin } from '@specd/plugin-manager'

export function create(): AgentPlugin {
  return {
    name: '@specd/plugin-claude',
    type: 'agent',
    version: '1.0.0',
    configSchema: {},
    async init() {},
    async destroy() {},
    async install(projectRoot, options) {
      const repo = createSkillRepository()
      const skills = options?.skills
        ? options.skills.map((s) => repo.getBundle(s, {}))
        : repo.list().map((s) => repo.getBundle(s.name, {}))

      const targetDir = path.join(projectRoot, '.claude', 'skills')
      for (const bundle of skills) {
        await bundle.install(targetDir)
      }
      return { installed: skills.map((s) => ({ skill: s.name, path: targetDir })), skipped: [] }
    },
    async uninstall(projectRoot) {
      const targetDir = path.join(projectRoot, '.claude', 'skills')
      // remove files
    },
  }
}
```

### Modified Files

#### Plugin Manager config helpers

- `packages/plugin-manager/src/config.ts`: `addPlugin()`, `removePlugin()`, `listPlugins()` helpers that read/write plugin declarations in specd.yaml

#### Config spec updates

- `specs/core/config/spec.md`: Replace `skills` section with `plugins.agents` structure (read by plugin-manager)

#### CLI command updates

- `packages/cli/src/commands/project/init.ts`: Replace `--agent` with `--plugin`, use plugin installer
- `packages/cli/src/commands/project/update.ts`: Use plugin orchestrator
- Delete: `packages/cli/src/commands/skills/*.ts` entire directory

#### Known agents removal

- `packages/cli/src/helpers/known-agents.ts`: Delete file (no longer needed)

### Files to Delete

```
packages/cli/src/commands/skills/           # entire directory - REMOVED
packages/cli/src/helpers/known-agents.ts   # deleted - no longer needed
packages/plugin-agent-claude/src/stub.ts       # replaced by real implementation
packages/plugin-agent-copilot/src/stub.ts     # stub remains, phase 2+
packages/plugin-agent-codex/src/stub.ts        # stub remains, phase 2+
```

## New Constructs

### `@specd/skills` API

```typescript
// Main export
function createSkillRepository(): SkillRepository

// SkillRepository interface
interface SkillRepository {
  list(): Skill[]
  get(name: string): Skill | undefined
  getBundle(name: string, variables?: Record<string, string>): SkillBundle
  listSharedFiles(): SharedFile[]
}

// Skill interface
interface Skill {
  name: string
  description: string
  templates: SkillTemplate[]
}

// SkillTemplate interface
interface SkillTemplate {
  filename: string
  getContent(): Promise<string>
}

// SkillBundle interface
interface SkillBundle {
  name: string
  description: string
  files: ResolvedFile[]
  install(targetDir: string): Promise<void>
  uninstall(targetDir: string): Promise<void>
}

// SharedFile interface
interface SharedFile {
  filename: string
  content: string
  skills: string[]
}
```

### Plugin Manifest (`specd-plugin.json`)

```json
{
  "schemaVersion": 1,
  "name": "@specd/plugin-claude",
  "description": "Claude AI coding assistant integration",
  "pluginType": "agent",
  "minCoreVersion": "*"
}
```

### CLI Commands

| Command                               | Behavior                                                             |
| ------------------------------------- | -------------------------------------------------------------------- |
| `specd plugins install`               | Load all declared agent plugins, call `install()`, persist to config |
| `specd plugins install @scope/plugin` | Load specific plugin, install, persist                               |
| `specd plugins list`                  | Show declared plugins with status (loaded/not found/error)           |
| `specd plugins show <plugin>`         | Display metadata, configSchema, available skills                     |
| `specd plugins update`                | Reinstall all declared plugins (idempotent, no config mutation)      |
| `specd plugins uninstall <plugin>`    | Call `uninstall()`, remove from config                               |

### Plugin Manager Use Cases

```typescript
// packages/plugin-manager/src/application/use-cases/install-plugin.ts
import { type PluginLoader } from '../../infrastructure/loader/index.js'

export interface InstallPluginInput {
  readonly pluginName: string
  readonly projectRoot: string
  readonly options?: { readonly skills?: readonly string[] }
}

export interface InstallPluginOutput {
  readonly installed: ReadonlyArray<{ readonly skill: string; readonly path: string }>
  readonly skipped: ReadonlyArray<{ readonly skill: string; readonly reason: string }>
}

export class InstallPlugin {
  constructor(private readonly loader: PluginLoader) {}

  async execute(input: InstallPluginInput): Promise<InstallPluginOutput> {
    const plugin = await this.loader.load(input.pluginName)
    return plugin.install(input.projectRoot, input.options)
  }
}
```

**CLI orchestrates config:**

```typescript
// packages/cli/src/commands/plugins/install.ts
import { ConfigWriter } from '@specd/core'
import { InstallPlugin } from '@specd/plugin-manager'

export class InstallPluginCommand {
  async execute(pluginName: string, projectRoot: string) {
    // 1. Read declared plugins from config
    const declared = await this.configWriter.listPlugins('agents')

    // 2. Use plugin-manager to install
    const installPlugin = new InstallPlugin(this.loader)
    const result = await installPlugin.execute({ pluginName, projectRoot })

    // 3. Persist to config (CLI responsibility)
    await this.configWriter.addPlugin('agents', pluginName)

    return result
  }
}
```

### Plugin Loading Flow

1. Read `specd.yaml` → `pluginManager.listPlugins('agents')`
2. For each plugin name:
   - Resolve package path via Node module resolution
   - Read `specd-plugin.json` → validate schema, version
   - Dynamic import → `import(name)`
   - Call `create()` → get plugin instance
   - Validate against expected interface
3. Register in `PluginLoader`

### Manifest Validation (Before Any Code Execution)

```typescript
// packages/plugin-manager/src/infrastructure/loader/manifest.ts
import { z } from 'zod'

const SpecdPluginManifestSchema = z.object({
  schemaVersion: z.number().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  pluginType: z.enum(['agent']), // extensible
  minCoreVersion: z.string().default('*'),
})

export type SpecdPluginManifest = z.infer<typeof SpecdPluginManifestSchema>

export function readSpecdPluginManifest(packagePath: string): SpecdPluginManifest {
  const manifestPath = path.join(packagePath, 'specd-plugin.json')
  const content = fs.readFileSync(manifestPath, 'utf-8')
  const parsed = JSON.parse(content)

  // Validate with Zod before any code execution
  const result = SpecdPluginManifestSchema.safeParse(parsed)
  if (!result.success) {
    throw new PluginValidationError(
      parsed.name ?? 'unknown',
      result.error.issues.map((i) => i.path.join('.')),
    )
  }

  const manifest = result.data

  // Validate version compatibility
  if (
    manifest.minCoreVersion !== '*' &&
    !semver.satisfies(currentVersion, manifest.minCoreVersion)
  ) {
    throw new PluginValidationError(manifest.name, ['minCoreVersion'])
  }

  return manifest
}
```

**Zod schema validation requirements:**

- All JSON inputs (manifest, config, metadata) validated at infrastructure boundary
- Validation failures throw typed errors extending `SpecdError` from @specd/core
- No raw JSON reaches application or domain layers

### Shared Files Resolution

```typescript
function listSharedFiles(): SharedFile[] {
  const sharedDir = path.join(templatesDir, 'shared')
  const files = fs.readdirSync(sharedDir)

  return files
    .filter((f) => f.endsWith('.meta.json'))
    .map((f) => {
      const name = f.replace('.meta.json', '')
      const meta = JSON.parse(fs.readFileSync(path.join(sharedDir, f), 'utf-8'))
      const content = fs.readFileSync(path.join(sharedDir, name + '.md'), 'utf-8')
      return { filename: name + '.md', content, skills: meta.skills }
    })
}
```

## Testing

### Unit Tests

- `packages/skills/test/repository/skill-repository.spec.ts` — list, get, getBundle, shared files
- `packages/skills/test/models/skill-bundle.spec.ts` — install, uninstall, file operations
- `packages/plugin-manager/test/loader.spec.ts` — loading, Zod validation, error cases

**Note:** Config management stays in @specd/core — no plugin-manager tests for config

### Integration Tests

- `packages/cli/src/commands/plugins/install.test.ts` — end-to-end install flow
- `packages/cli/src/commands/plugins/list.test.ts` — status reporting
- `packages/plugin-agent-claude/test/functional.test.ts` — real plugin installation

### Test Scenarios from Verify

Each requirement in spec.md and scenario in verify.md must map to at least one test:

| Verify Scenario                    | Test Coverage                              |
| ---------------------------------- | ------------------------------------------ |
| Valid plugin implementation        | `PluginLoader.load()` returns valid plugin |
| Plugin init receives context       | `init(context)` called with correct values |
| init/destroy are no-ops for agents | Verify no state management                 |
| Unknown type rejected              | `PluginValidationError` thrown             |
| Agent plugin install flow          | `install()` writes files, returns result   |
| Manifest validation before import  | Read JSON, then import                     |
| ConfigWriter addPlugin             | Updates `specd.yaml` correctly             |
| ConfigWriter listPlugins           | Returns declared plugins                   |
| Shared files discovery             | `listSharedFiles()` returns correct files  |
| Shared files in getBundle          | Bundle includes skill's shared files       |

## Documentation Updates

### New Documentation Required

- **docs/guide/plugins.md** — Plugin system overview, plugin manifest format, writing plugins with SpecdPlugin/AgentPlugin interfaces
- **docs/guide/skills.md** — @specd/skills usage, skill structure, shared files, repository API
- **docs/cli/plugins.md** — CLI plugin commands: install, list, show, update, uninstall
- **docs/plugins/plugin-manager.md** — TypeScript interfaces exported by @specd/plugin-manager for plugin authors

### Documentation to Update

- **docs/cli/commands.md** — Remove `skills install/list/show/update` commands, add `plugins install/list/show/update/uninstall`
- **docs/guide/configuration.md** — Document `plugins.agents` structure in specd.yaml (replaces `skills` section)

## Dependencies

```
@specd/plugin-claude → @specd/skills
@specd/cli → @specd/core, @specd/plugin-manager, @specd/skills
@specd/core → (no plugin dependencies)
@specd/plugin-manager → @specd/core (for SpecdError base class)
@specd/skills → (no external dependencies)
```

## Open Questions

1. **Should plugins be able to declare dependencies on other plugins?** — Not in phase 1, keep it simple
2. **How to handle plugin version mismatches?** — Advisory only, log warning, proceed (per spec)
3. **Should there be a plugin development mode?** — Not in phase 1, user manages npm manually
4. **How to validate plugin config in specd.yaml?** — Basic structure validation only, per spec

## Global Specs Compliance

- **Architecture**: Plugin loader runs in @specd/plugin-manager (not core), CLI and MCP consume it; ports define contracts, no I/O in domain
- **Conventions**: ESM only, named exports, no `any`, proper JSDoc
- **Testing**: Unit tests alongside implementation, integration tests for CLI commands

## Blast Radius Analysis

### High-Risk Symbols

- `ConfigWriter` — Used everywhere config is written; changes affect init, update flows
- `SkillRepository` — Core of skills package; any API change breaks plugins
- `PluginLoader` — Single point of failure for all plugin operations

### Medium-Risk Symbols

- CLI command handlers — change requires handler updates but isolated
- Known agents helper — deletion affects init wizard only

### Low-Risk Symbols

- Individual plugin implementations — isolated from each other
- Skill bundle file operations — contained in bundle class

## Implementation Order

1. **Phase 1a**: @specd/plugin-manager package (types, loader, config helpers, registry)
2. **Phase 1b**: @specd/skills models and repository (foundation)
3. **Phase 1c**: CLI plugin commands using @specd/plugin-manager
4. **Phase 1d**: Plugin-claude implementation
5. **Phase 1e**: project-init/update updates (use plugin commands)
6. **Phase 1f**: Integration testing, docs
