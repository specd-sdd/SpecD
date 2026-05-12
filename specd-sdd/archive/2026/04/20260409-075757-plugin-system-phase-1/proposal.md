# Proposal: plugin-system-phase-1

## Motivation

The current skills/plugin model blocks one of specd's main product surfaces: agent integration. The CLI still owns agent-specific installation logic, `@specd/skills` is only a flat skill bundle without proper models, and the plugin packages are stubs. Adding or evolving agent integrations requires editing the CLI instead of extending the system through plugins.

## Current behaviour

Today:

- `packages/skills/src/index.ts` exposes only a flat `Skill` shape with `{ name, description, content }` plus `listSkills()` / `getSkill()`.
- `packages/plugins/*/src/index.ts` are stubs with no runtime contract.
- `packages/cli/src/helpers/known-agents.ts` hardcodes project directories for agents.
- CLI commands (`skills install/list/show/update`, `project init`, `project update`) couple the CLI to skill-install flows.

## Proposed solution

Phase 1 redesigns the skills/plugin foundation around autonomous agent plugins and a canonical prompt library, following hexagonal architecture.

### Architecture

- **@specd/plugin-manager** (NEW package at `packages/plugin-manager/`): domain (types, errors) + application (use cases) + infrastructure (loader)
- **@specd/skills** (redesign at `packages/skills/`): domain (models) + application (use cases) + infrastructure (repository)
- **@specd/core**: ConfigWriter manages plugin config in specd.yaml
- **@specd/cli**: orchestrates — reads config (core) → calls use cases (plugin-manager) → writes config (core)

**Plugin packages move to top-level:**

- `packages/plugin-agent-claude/` (was `packages/plugins/claude/`)
- `packages/plugin-agent-copilot/` (was `packages/plugins/copilot/`)
- `packages/plugin-agent-codex/` (was `packages/plugins/codex/`)

Key decisions:

- Plugin-manager is pure — no config I/O. Config stays in @specd/core via ConfigWriter.
- Both plugin-manager and skills follow hexagonal architecture.
- Zod validation at infrastructure boundary for all JSON inputs.
- CLI orchestrates all operations.

### Package Structures

#### `@specd/skills` (`packages/skills/src/`)

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
├── templates/                 # skill template files (WITHOUT frontmatter)
│   ├── shared.md             # shared content across all skills
│   ├── specd/
│   ├── specd-archive/
│   ├── specd-design/
│   ├── specd-implement/
│   ├── specd-new/
│   ├── specd-metadata/       # (renamed from specd-spec-metadata)
│   ├── specd-compliance/    # (renamed from specd-specs-compliance)
│   └── specd-verify/
└── index.ts                   # main barrel export: createSkillRepository()
```

#### `@specd/plugin-manager` (`packages/plugin-manager/src/`)

```
packages/plugin-manager/src/
├── domain/
│   ├── types/
│   │   ├── specd-plugin.ts      # SpecdPlugin, ConfigSchemaEntry interfaces
│   │   ├── agent-plugin.ts      # AgentPlugin, InstallOptions, InstallResult
│   │   ├── plugin-context.ts    # PluginContext interface
│   │   └── index.ts             # barrel export
│   ├── errors/
│   │   ├── plugin-not-found.ts  # PluginNotFoundError
│   │   ├── plugin-validation.ts # PluginValidationError
│   │   └── index.ts             # barrel export
│   └── index.ts                 # barrel export (domain types only)
├── application/
│   ├── use-cases/
│   │   ├── install-plugin.ts    # orchestrates plugin install
│   │   ├── uninstall-plugin.ts  # orchestrates plugin uninstall
│   │   ├── update-plugin.ts     # orchestrates plugin update
│   │   ├── list-plugins.ts      # returns plugin inventory
│   │   ├── load-plugin.ts       # loads and validates a single plugin
│   │   └── index.ts
│   ├── ports/
│   │   ├── plugin-repository.ts # interface for plugin storage
│   │   └── index.ts
│   └── index.ts
├── infrastructure/
│   ├── loader/
│   │   ├── plugin-loader.ts    # PluginLoader implementation
│   │   ├── registry.ts         # InMemoryPluginRegistry
│   │   └── index.ts
│   └── index.ts
└── index.ts                    # main barrel export
```

#### `@specd/plugin-agent-claude` (`packages/plugin-agent-claude/src/`)

```
packages/plugin-agent-claude/
├── src/
│   ├── domain/
│   │   ├── types/
│   │   │   ├── claude-plugin.ts   # AgentPlugin implementation
│   │   │   └── frontmatter.ts     # Frontmatter type definitions
│   │   ├── frontmatter/
│   │   │   ├── specd.ts
│   │   │   ├── specd-archive.ts
│   │   │   ├── specd-design.ts
│   │   │   ├── specd-implement.ts
│   │   │   ├── specd-new.ts
│   │   │   ├── specd-metadata.ts   # (renamed from specd-spec-metadata)
│   │   │   ├── specd-compliance.ts # (renamed from specd-specs-compliance)
│   │   │   ├── specd-verify.ts
│   │   │   └── index.ts           # exports skillFrontmatter: Record<string, Frontmatter>
│   │   └── index.ts
│   ├── application/
│   │   ├── use-cases/
│   │   │   ├── install-skills.ts  # Orchestrates: get skills → add frontmatter → install
│   │   │   └── index.ts
│   │   └── index.ts
│   ├── index.ts                   # exports create(): AgentPlugin
│   └── specd-plugin.json         # manifest file
└── package.json
```

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

---

## Specs affected

### CLI Commands

- **`cli:cli/plugins-install`**: CLI contract for `specd plugins install <plugin> [<plugin>...]`
  - **With one or more plugin names**: `specd plugins install @specd/plugin-agent-claude @specd/plugin-agent-copilot`
    1. Reads config via ConfigWriter.listPlugins() to check already installed
    2. For each plugin name:
       - If already in config: warns "plugin already installed, use update to reinstall"
       - If not installed: loads via LoadPlugin use case, calls InstallPlugin, persists via ConfigWriter.addPlugin()
  - Exit code 1 if any plugin fails (continues with remaining)
  - Depends on: `plugin-manager:install-plugin-use-case`, `plugin-manager:load-plugin-use-case`, `core:core/config-writer-port`

- **`cli:cli/plugins-list`**: CLI contract for `specd plugins list [--type ...]`
  - Reads declared plugins from config
  - For each plugin in config:
    - **installed**: plugin is in config and can be loaded (tries LoadPlugin)
    - **not_found**: plugin is in config but npm package not installed
    - **error**: plugin in config but fails to load (shows error message)
  - Output shows: name, type, version (if available), status
  - Depends on: `plugin-manager:load-plugin-use-case`, `core:core/config-writer-port`

- **`cli:cli/plugins-show`**: CLI contract for `specd plugins show <plugin>`
  - Displays plugin metadata, configSchema, capabilities
  - Depends on: `plugin-manager:load-plugin-use-case`

- **`cli:cli/plugins-update`**: CLI contract for `specd plugins update [<plugin>...]`
  - **Without arguments**: updates all declared plugins in config
  - **With plugin names**: updates only those specified
  - No config mutation (idempotent reinstall)
  - Exit code 1 if any fails
  - Depends on: `plugin-manager:update-plugin-use-case`, `core:core/config-writer-port`

- **`cli:cli/plugins-uninstall`**: CLI contract for `specd plugins uninstall <plugin> [<plugin>...]`
  - For each plugin name:
    1. Loads plugin via LoadPlugin use case
    2. Calls plugin.uninstall()
    3. Removes from config via ConfigWriter.removePlugin()
  - Exit code 1 if any plugin fails (continues with remaining)
  - Depends on: `plugin-manager:uninstall-plugin-use-case`, `plugin-manager:load-plugin-use-case`, `core:core/config-writer-port`
  - Depends on: `plugin-manager:uninstall-plugin-use-case`, `core:core/config-writer-port`

### Domain Models - Skills

- **`skills:skill`**: Skill and SkillTemplate domain models
  - **Skill**: `{ name: string, description: string, templates: SkillTemplate[] }`
  - **SkillTemplate**: `{ filename: string, getContent(): Promise<string> }` — lazy content loading
  - Template files live in `packages/skills/templates/<skill-name>/`
  - No I/O in domain layer
  - Depends on: none

- **`skills:skill-bundle`**: SkillBundle with resolved files and file operations
  - **SkillBundle**: `{ name: string, description: string, files: ResolvedFile[], install(targetDir): Promise<void>, uninstall(targetDir): Promise<void> }`
  - **ResolvedFile**: `{ filename: string, content: string }`
  - install() writes files to targetDir; uninstall() removes them
  - Depends on: `skills:skill`

- **`skills:skill-repository`**: SkillRepository interface and in-memory implementation
  - **SkillRepository**:
    - `list(): Skill[]` — returns all skills (metadata only)
    - `get(name: string): Skill | undefined` — get single skill
    - `getBundle(name: string, variables: Record<string, string> = {}): SkillBundle` — reads template files and replaces `{{variable}}` placeholders with values from the variables map. Variables are passed at invocation time — the repository does not define any predefined variables.
    - `listSharedFiles(): SharedFile[]` — scans templates/shared/ for .meta.json files
  - **SharedFile**: `{ filename: string, content: string, skills: string[] }`
  - Depends on: `skills:skill`, `skills:skill-bundle`

- **`skills:skill-templates-source`**: Skill template source and frontmatter handling
  - **Template source**: Templates live in `packages/skills/templates/<skill-name>/` WITHOUT frontmatter
  - **Migration**: Copy skill directories from `dev/ai-agents/skills/` to `packages/skills/templates/` (strip frontmatter YAML block, keep markdown content). Includes: specd, specd-archive, specd-design, specd-implement, specd-new, specd-metadata (renamed), specd-compliance (renamed), specd-verify, plus shared.md as shared content
  - **Frontmatter source**: Original frontmatter is read from `dev/ai-agents/skills/<skill-name>/SKILL.md` before stripping and stored in agent plugins
  - **Frontmatter injection**: Each agent plugin injects its stored frontmatter when installing (name, description, allowed-tools, argument-hint)
  - **Why**: Plugins know their target environment (Claude, Copilot, Codex) and inject appropriate metadata while preserving skill definition
  - Depends on: `skills:skill`

### Skills Use Cases

- **`skills:list-skills`**: Returns all skills
  - Input: `ListSkillsInput = {}`
  - Output: `ListSkillsOutput = { skills: readonly Skill[] }`
  - Depends on: `skills:skill`, `skills:skill-repository-port`

- **`skills:get-skill`**: Returns single skill by name
  - Input: `GetSkillInput = { name: string }`
  - Output: `GetSkillOutput = { skill: Skill } | { error: 'NOT_FOUND' }`
  - Depends on: `skills:skill`, `skills:skill-repository-port`

- **`skills:resolve-bundle`**: Resolves skill bundle with variable substitution
  - Input: `ResolveBundleInput = { name: string, variables?: Record<string, string> }`
  - Output: `ResolveBundleOutput = { bundle: SkillBundle }`
  - Replaces `{{key}}` in templates with provided variables
  - Depends on: `skills:skill-bundle`, `skills:skill-repository-port`

### Skills Ports and Infrastructure

- **`skills:skill-repository-port`**: Abstract interface for skill storage
  - **SkillRepositoryPort**: same interface as SkillRepository above
  - Implementations: SkillRepositoryInfra (node:fs)
  - Depends on: `skills:skill`, `skills:skill-bundle`

- **`skills:skill-repository-infra`**: Infrastructure implementation
  - Uses node:fs/promises to read template files
  - TemplateReader reads .md files from packages/skills/templates/
  - Scans templates/shared/ for .meta.json shared file metadata
  - Depends on: `skills:skill-repository-port`

---

### Plugin Manager Types

- **`plugin-manager:specd-plugin-type`**: Base plugin interface

  ```typescript
  type PluginType = 'agent' // extensible

  interface SpecdPlugin {
    readonly name: string // npm package name
    readonly type: PluginType
    readonly version: string // semver
    readonly configSchema: Record<string, ConfigSchemaEntry>
    init(context: PluginContext): Promise<void>
    destroy(): Promise<void>
  }

  interface PluginContext {
    projectRoot: string // absolute path
    config: Record<string, unknown> // this plugin's config from specd.yaml (empty if none)
    typeContext: unknown // type-specific context (empty for agent plugins in phase 1)
  }

  interface ConfigSchemaEntry {
    type: 'string' | 'boolean' | 'number'
    description: string
    default?: unknown
    required?: boolean
  }
  ```

  - Depends on: `default:_global/architecture`

- **`plugin-manager:agent-plugin-type`**: Agent plugin extends SpecdPlugin

  ```typescript
  interface AgentPlugin extends SpecdPlugin {
    type: 'agent'
    install(projectRoot: string, options?: InstallOptions): Promise<InstallResult>
    uninstall(projectRoot: string, options?: InstallOptions): Promise<void>
  }

  interface InstallOptions {
    skills?: string[] // specific skill names; omit = all
    variables?: Record<string, string> // variables passed to getBundle for template substitution
  }

  interface InstallResult {
    installed: Array<{ skill: string; path: string }>
    skipped: Array<{ skill: string; reason: string }>
  }
  ```

  - Depends on: `plugin-manager:specd-plugin-type`

- **`plugin-manager:plugin-errors`**: Error classes extending SpecdError

  ```typescript
  class PluginNotFoundError extends SpecdError {
    readonly pluginName: string
  }

  class PluginValidationError extends SpecdError {
    readonly pluginName: string
    readonly fields: string[]
  }
  ```

  - Depends on: `default:_global/architecture`

### Plugin Manager Use Cases

- **`plugin-manager:install-plugin-use-case`**: Orchestrates plugin installation

  ```typescript
  interface InstallPluginInput {
    readonly pluginName: string      // npm package name
    readonly projectRoot: string
    readonly options?: Record<string, unknown>  // plugin-specific options
  }

  interface InstallPluginOutput {
    readonly success: boolean
    readonly message: string  // human-readable result
    readonly data?: unknown  // plugin-specific result
  }

  class InstallPlugin {
    constructor(private readonly loader: PluginLoader)
    execute(input: InstallPluginInput): Promise<InstallPluginOutput>
  }
  ```

  - Loads plugin via PluginLoader
  - Calls plugin.install()
  - Returns generic result (no config mutation)
  - Depends on: `plugin-manager:agent-plugin-type`, `plugin-manager:plugin-loader`

- **`plugin-manager:uninstall-plugin-use-case`**: Orchestrates plugin removal

  ```typescript
  interface UninstallPluginInput {
    readonly pluginName: string
    readonly projectRoot: string
    readonly options?: Record<string, unknown>  // plugin-specific options
  }

  class UninstallPlugin {
    constructor(private readonly loader: PluginLoader)
    execute(input: UninstallPluginInput): Promise<void>
  }
  ```

  - Loads plugin, calls uninstall()
  - Depends on: `plugin-manager:agent-plugin-type`, `plugin-manager:plugin-loader`

- **`plugin-manager:update-plugin-use-case`**: Idempotent reinstall
  - Same as install but no config mutation
  - Depends on: `plugin-manager:agent-plugin-type`, `plugin-manager:plugin-loader`

- **`plugin-manager:list-plugins-use-case`**: Returns plugin inventory
  - Input: `{ pluginNames: string[] }`
  - Output: `{ plugins: Array<{ name: string; status: 'loaded' | 'not_found' | 'error'; plugin?: SpecdPlugin; error?: string }> }`
  - Depends on: `plugin-manager:plugin-loader`

- **`plugin-manager:load-plugin-use-case`**: Loads and validates single plugin
  - Input: `{ pluginName: string }`
  - Output: `{ plugin: SpecdPlugin }` or `{ error: PluginNotFoundError | PluginValidationError }`
  - Depends on: `plugin-manager:plugin-loader`

### Plugin Manager Ports and Infrastructure

- **`plugin-manager:plugin-repository-port`**: Interface for plugin storage
  - Abstraction: CLI implements via ConfigWriter
  - Methods: `addPlugin()`, `removePlugin()`, `listPlugins()`
  - Depends on: `plugin-manager:specd-plugin-type`

- **`plugin-manager:plugin-loader`**: Infrastructure for dynamic loading
  - **Workflow**:
    1. The package must be available in node_modules (either installed via npm/pnpm or linked as a workspace)
    2. Resolve package path via `import.meta.resolve()` or `require.resolve()`
    3. Read `specd-plugin.json` (no import yet)
    4. Validate with Zod schema
    5. Dynamic import → `import(name)` (ESM)
    6. Call `create()` factory function
    7. Validate against expected interface
  - **CLI responsibility**: Before calling InstallPlugin/LoadPlugin, the CLI must ensure the plugin package is installed in node_modules (e.g., via `pnpm add <plugin-name>`).
  - **Zod Manifest Schema**:
    ```typescript
    const SpecdPluginManifestSchema = z.object({
      schemaVersion: z.number().min(1),
      name: z.string().min(1),
      description: z.string().optional(),
      pluginType: z.enum(['agent']),
      minCoreVersion: z.string().default('*'),
    })
    ```
  - Validation failures throw PluginValidationError
  - Depends on: `plugin-manager:specd-plugin-type`, `plugin-manager:plugin-errors`

---

### Concrete Plugins

- **`plugin-agent-claude:plugin-agent`**: Claude agent plugin implementation
  - Exports `create(): AgentPlugin`
  - Domain layer contains `claude-plugin.ts` (AgentPlugin impl), `frontmatter.ts` (type), and `frontmatter/` (skill metadata)
  - Application layer has `InstallSkills` use case that orchestrates: get skills → inject frontmatter → install
  - **Frontmatter type** (Claude Code fields - all optional except description recommended):
    ```typescript
    interface Frontmatter {
      name?: string // Display name (defaults to directory name, max 64 chars, lowercase + numbers + hyphens)
      description: string // REQUIRED - what it does and when to use it
      when_to_use?: string // Additional context for triggering (appended to description)
      argument_hint?: string // Hint shown during autocomplete (e.g., '[issue-number]')
      disable_model_invocation?: boolean // true = prevent auto-loading, trigger manually with /name
      user_invocable?: boolean // false = hidden from / menu
      allowed_tools?: string // Tools allowed (space-separated string or YAML list)
      model?: string // Model to use when this skill is active
      effort?: string // Effort level: low, medium, high, xhigh, max
      context?: string // 'fork' = run in forked subagent context
      agent?: string // Subagent type when context: fork
      hooks?: Record<string, unknown> // Lifecycle hooks scoped to this skill
      paths?: string // Glob patterns that limit when skill is activated
      shell?: string // Shell for !`command` blocks: 'bash' (default) or 'powershell'
    }
    ```
  - Uses `skillFrontmatter` map from domain to inject frontmatter to each skill
  - Example flow:

    ```typescript
    import { createSkillRepository } from '@specd/skills'
    import { skillFrontmatter } from './domain/frontmatter/index.js'

    const repo = createSkillRepository()
    const skills = repo.list()

    for (const skill of skills) {
      const bundle = repo.getBundle(skill.name, options?.variables)
      const fm = skillFrontmatter[skill.name]

      const modifiedFiles = bundle.files.map((f) => ({
        ...f,
        content: `---
        name: ${fm.name}
        description: ${fm.description}
        allowed-tools: ${fm.allowedTools}
        argument-hint: ${fm.argumentHint}
        ---
        ${f.content}`,
      }))

      const newBundle = { ...bundle, files: modifiedFiles }
      await newBundle.install(targetDir)
    }
    ```

  - Installs to `.claude/skills/` in project root
  - **Note**: Agent plugins depend on @specd/skills package for skill operations
  - Depends on: `plugin-manager:agent-plugin-type`, `skills:skill-repository`

- **`plugin-agent-copilot:plugin-agent`**: Copilot agent plugin (stub for phase 2)
  - Same structure, placeholder implementation
  - Will depend on `skills:skill-repository` when implemented
  - Depends on: `plugin-manager:agent-plugin-type`

- **`plugin-agent-codex:plugin-agent`**: Codex agent plugin (stub for phase 2)
  - Same structure, placeholder implementation
  - Will depend on `skills:skill-repository` when implemented
  - Depends on: `plugin-manager:agent-plugin-type`

---

### Modified Specs

- **`core:core/config-writer-port`**: adds addPlugin(), removePlugin(), listPlugins()
  - `addPlugin(configPath, type, name)` — adds to plugins.<type>
  - `removePlugin(configPath, type, name)` — removes from plugins.<type>
  - `listPlugins(configPath, type?)` — returns declared plugins
  - Depends on (added): none

- **`core:core/config`**: documents plugins.agents structure

  ```yaml
  plugins:
    agents:
      - name: '@specd/plugin-agent-claude'
      - name: '@specd/plugin-agent-copilot'
        config:
          commandsDir: .github/copilot
  ```

  - `plugins.agents` is an array of plugin declarations
  - Each entry has `name` (required) and optional `config` (plugin-specific)
  - ConfigWriter.addPlugin() adds to this array
  - ConfigWriter.removePlugin() removes by name
  - ConfigWriter.listPlugins() returns this array
  - Depends on (added): `core:core/config-writer-port`

- **`cli:cli/project-init`**: replace --agent with --plugin selection
  - Depends on (added): `cli:cli/plugins-install`

- **`cli:cli/project-update`**: use plugin orchestrator
  - Depends on (added): `cli:cli/plugins-update`

---

### Deleted Specs

- `cli:cli/skills-install` — replaced by cli:cli/plugins-install
- `cli:cli/skills-list` — replaced by cli:cli/plugins-list
- `cli:cli/skills-show` — replaced by cli:cli/plugins-show
- `cli:cli/skills-update` — replaced by cli:cli/plugins-update
- `core:core/get-skills-manifest` — replaced by ConfigWriter.listPlugins()
- `core:core/record-skill-install` — replaced by ConfigWriter.addPlugin()

---

## Impact

### Code areas

- `packages/plugin-manager/` — NEW top-level package with hexagonal structure
  - domain/types/, domain/errors/, application/use-cases/, application/ports/, infrastructure/loader/
- `packages/plugin-agent-claude/` — MOVE from packages/plugins/claude/
- `packages/plugin-agent-copilot/` — MOVE from packages/plugins/copilot/
- `packages/plugin-agent-codex/` — MOVE from packages/plugins/codex/
- `packages/skills/src/` — full redesign with hexagonal structure
  - domain/models/, application/use-cases/, application/ports/, infrastructure/repository/
- `packages/core/src/application/ports/config-writer.ts` — add plugin methods
- `packages/cli/src/commands/plugins/` — new command group
- `packages/cli/src/commands/skills/` — DELETE
- `packages/cli/src/helpers/known-agents.ts` — DELETE

### External surfaces

- `specd.yaml` — plugin declaration under `plugins.agents`
- CLI commands — skills _ removed, plugins _ added

---

## Technical context

1. **Config in core**: ConfigWriter manages specd.yaml. Plugin-manager is pure library.

2. **Hexagonal architecture**: domain (pure types), application (use cases), infrastructure (I/O) in both packages.

3. **Zod at boundary**: All JSON validated before reaching application/domain layers. Manifest schema validates schemaVersion, name, pluginType, minCoreVersion.

4. **CLI orchestration pattern**:
   - ConfigWriter.listPlugins() → read declared plugins
   - UseCase.execute() → perform operation
   - ConfigWriter.addPlugin/removePlugin() → persist (if needed)

5. **Plugin manifest**: specd-plugin.json validated with Zod before import().

6. **Plugin factory**: npm package must export `create(): SpecdPlugin` as default or named export.

7. **Shared files**: Scanned from `templates/shared/*.meta.json`, each with `{ skills: string[] }`.

---

## Open questions

None — all major decisions have been resolved during design.
