# Design: plugin-agent-standard

## Approach

Clone the `plugin-agent-opencode` package structure and adapt it for the [Agent Skills standard](https://agentskills.io/specification). The plugin implements the same `AgentPlugin` contract from `@specd/plugin-manager` but targets `.agents/skills/` and emits the standard frontmatter format including `allowed-tools`.

The key differences from the opencode plugin:

1. **Install directory**: `.agents/skills/` instead of `.opencode/skills/`
2. **Frontmatter**: adds `allowed-tools` field (with hyphen per the agentskills.io spec)
3. **Frontmatter rendering**: uses `allowed-tools` key with JSON string value

## Affected areas

### New package: `packages/plugin-agent-standard/`

All files are new — no existing code is modified within this package.

| File                                            | Purpose                                                     |
| ----------------------------------------------- | ----------------------------------------------------------- |
| `src/index.ts`                                  | Factory export — `create()` reads manifest, wires use cases |
| `src/domain/types/agent-standard-plugin.ts`     | Plugin class implementing `AgentPlugin`                     |
| `src/domain/types/frontmatter.ts`               | Frontmatter interface for Agent Skills standard fields      |
| `src/domain/frontmatter/index.ts`               | Per-skill frontmatter map with `allowed-tools` declarations |
| `src/application/use-cases/install-skills.ts`   | Install use case — writes to `.agents/skills/`              |
| `src/application/use-cases/uninstall-skills.ts` | Uninstall use case — removes from `.agents/skills/`         |
| `test/install-skills.spec.ts`                   | Integration test with temp directory                        |
| `package.json`                                  | Package manifest with workspace deps                        |
| `specd-plugin.json`                             | Plugin manifest                                             |
| `tsconfig.json`                                 | TypeScript config extending base                            |

### Modified files outside the package

| File                                        | Change                                                     |
| ------------------------------------------- | ---------------------------------------------------------- |
| `packages/cli/package.json`                 | Add `@specd/plugin-agent-standard: workspace:*` dependency |
| `packages/cli/src/commands/project/init.ts` | Add to `AVAILABLE_AGENT_PLUGINS` array                     |
| `packages/specd/package.json`               | Add `@specd/plugin-agent-standard: workspace:*` dependency |
| `commitlint.config.mjs`                     | Add `plugin-agent-standard` to scope-enum                  |
| `specd.yaml`                                | Add to `plugins.agents` list                               |

## New constructs

### `AgentStandardFrontmatter` interface

```typescript
interface Frontmatter {
  readonly name: string
  readonly description: string
  readonly license?: string
  readonly compatibility?: string
  readonly metadata?: Record<string, string>
  readonly 'allowed-tools'?: string
}
```

### `AgentStandardAgentPlugin` class

Identical structure to `OpenCodeAgentPlugin` — implements `AgentPlugin`, delegates install/uninstall to injected operations. Constructor receives `name`, `version`, `runInstall`, `runUninstall`.

### `skillFrontmatter` map

Maps each skill name to its `Frontmatter` with `allowed-tools` declarations:

| Skill              | allowed-tools                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| `specd`            | `Bash(node *) Bash(specd *) Read`                                                                  |
| `specd-archive`    | `Bash(node *) Bash(specd *) Read`                                                                  |
| `specd-design`     | `Bash(node *) Bash(pnpm *) Bash(specd *) Read Write Edit Grep Glob`                                |
| `specd-implement`  | `Bash(node *) Bash(pnpm *) Bash(specd *) Read Write Edit Grep Glob`                                |
| `specd-new`        | `Bash(node *) Bash(specd *) Read Grep Glob`                                                        |
| `specd-metadata`   | `Bash(node *) Bash(specd *) Bash(cat *) Bash(rm *) Bash(shasum *) Read`                            |
| `specd-compliance` | `Bash(git *) Bash(gh *) Bash(mkdir *) Bash(date *) Bash(cat *) Bash(specd *) Read Grep Glob Write` |
| `specd-verify`     | `Bash(node *) Bash(pnpm *) Bash(specd *) Read Grep Glob`                                           |

### `renderFrontmatter` function

Prepends YAML frontmatter to markdown content. Renders fields in order: `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`. Only emits fields with defined values. The `allowed-tools` key is rendered with its hyphenated name.

## Data flow

```
create(PluginLoaderOptions)
  → readManifest() → { name, version }
  → new AgentStandardAgentPlugin(name, version, installSkills.execute, uninstallSkills.execute)
  → returns AgentPlugin

plugin.install(SpecdConfig, AgentInstallOptions)
  → InstallSkills.execute(config, options)
    → createSkillRepository().list() → available skills
    → resolve requestedSkills (from options or all)
    → for each skill:
        → repository.getBundle(skillName, variables, config) → bundle
        → resolve frontmatter from skillFrontmatter map
        → targetDir = projectRoot + ".agents/skills/"
        → for each file in bundle:
            → if shared: write to _specd-shared/ without frontmatter
            → if .md and not shared: prepend frontmatter, write to skill dir
    → return { installed, skipped }

plugin.uninstall(SpecdConfig, AgentInstallOptions)
  → UninstallSkills.execute(config, options)
    → if skills filter: remove only those skill dirs
    → if no filter: remove all specd skills + _specd-shared/
```

## Testing

### Unit / integration tests

- `test/install-skills.spec.ts` — mirrors the opencode test pattern:
  - Mock `@specd/skills` repository
  - Create temp project root
  - Call `create()` then `plugin.install()`
  - Assert files created under `.agents/skills/<skill>/`
  - Assert frontmatter contains `name`, `description`, `allowed-tools`
  - Assert shared files have no frontmatter
  - Assert `uninstall()` removes only specd-managed skills

### Verification scenarios

All scenarios from `verify.md` are exercised through the integration test plus structural checks on the domain types and the init wizard list.

## Documentation

No `docs/` changes needed — this is a new package following established plugin patterns already documented in the monorepo.

## Open questions

- Whether to update the `specd.yaml` context instruction to mention the new plugin in the package enumeration. This is cosmetic and can be deferred.
