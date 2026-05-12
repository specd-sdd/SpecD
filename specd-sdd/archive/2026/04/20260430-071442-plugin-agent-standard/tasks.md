# Tasks: plugin-agent-standard

## 1. Domain types

- [x] 1.1 Create Frontmatter interface for Agent Skills standard
      `packages/plugin-agent-standard/src/domain/types/frontmatter.ts`: `Frontmatter` — define interface with `name`, `description`, `license?`, `compatibility?`, `metadata?`, `'allowed-tools'?` fields
      Approach: mirror the opencode frontmatter interface but replace opencode-specific fields with the agentskills.io field set; use `'allowed-tools'` (quoted) for the hyphenated key
      (Req: Frontmatter type contract)

- [x] 1.2 Create AgentStandardAgentPlugin class
      `packages/plugin-agent-standard/src/domain/types/agent-standard-plugin.ts`: `AgentStandardAgentPlugin` — implement `AgentPlugin` with constructor accepting `name`, `version`, `runInstall`, `runUninstall`
      Approach: clone `OpenCodeAgentPlugin` structure exactly — same `InstallOperation`/`UninstallOperation` types, same getter pattern, same `init`/`destroy`/`install`/`uninstall` methods
      (Req: Domain layer, Factory export)

- [x] 1.3 Create per-skill frontmatter map with allowed-tools
      `packages/plugin-agent-standard/src/domain/frontmatter/index.ts`: `skillFrontmatter` — export `Readonly<Record<string, Frontmatter>>` mapping each specd skill to its frontmatter including `allowed-tools`
      Approach: use the tool strings from design.md (e.g. `Bash(node *) Bash(specd *) Read` for specd skill); key by skill name exactly matching skill bundle names
      (Req: allowed-tools configuration)

## 2. Application layer

- [x] 2.1 Create InstallSkills use case
      `packages/plugin-agent-standard/src/application/use-cases/install-skills.ts`: `InstallSkills` — use case that reads skills from `@specd/skills`, resolves frontmatter, prepends YAML to markdown files, writes to `.agents/skills/`
      Approach: clone opencode's `InstallSkills` and change target directory to `.agents/skills/`; update `renderFrontmatter` to emit `allowed-tools` field; use `appendYamlField` pattern for optional fields
      (Req: Application layer, Frontmatter injection, Install location)

- [x] 2.2 Create UninstallSkills use case
      `packages/plugin-agent-standard/src/application/use-cases/uninstall-skills.ts`: `UninstallSkills` — remove skill directories from `.agents/skills/`
      Approach: clone opencode's `UninstallSkills` and change target directory to `.agents/skills/`; same logic — selective removal when filter provided, full removal + shared cleanup otherwise
      (Req: Uninstall behavior)

## 3. Factory export

- [x] 3.1 Create factory export with manifest reading
      `packages/plugin-agent-standard/src/index.ts`: `create()` — named export that reads `specd-plugin.json`, creates use cases, returns `AgentStandardAgentPlugin`
      Approach: clone opencode's `src/index.ts` exactly — same `readManifest()` with candidate paths, same `create()` signature, same wiring pattern; update error message to reference `@specd/plugin-agent-standard`
      (Req: Factory export)

## 4. Tests

- [x] 4.1 Create integration test for install and uninstall
      `packages/plugin-agent-standard/test/install-skills.spec.ts`: integration test using temp directory
      Approach: clone opencode's test — mock `@specd/skills` repository, create temp project root, call `create()` then `install()`, assert files under `.agents/skills/`, assert frontmatter contains `name`, `description`, `allowed-tools` with hyphen, assert shared files have no frontmatter, test uninstall preserves user skills
      (Req: Install location, Frontmatter injection, Uninstall behavior, Frontmatter type contract)

## 5. Integration

- [x] 5.1 Add workspace dependency to CLI package
      `packages/cli/package.json`: add `@specd/plugin-agent-standard: workspace:*` to dependencies
      Approach: add alongside existing plugin-agent-\* dependencies, maintaining alphabetical order
      (Req: Project init wizard integration)

- [x] 5.2 Add to AVAILABLE_AGENT_PLUGINS list
      `packages/cli/src/commands/project/init.ts`: add `@specd/plugin-agent-standard` to the `AVAILABLE_AGENT_PLUGINS` array
      Approach: append to the `as const` array at line 13-18
      (Req: Project init wizard integration)

- [x] 5.3 Add workspace dependency to meta package
      `packages/specd/package.json`: add `@specd/plugin-agent-standard: workspace:*` to dependencies
      Approach: add alongside existing plugin-agent-\* dependencies
      (Req: Meta package inclusion)

- [x] 5.4 Add commitlint scope
      `commitlint.config.mjs`: add `plugin-agent-standard` to the `scope-enum` array
      Approach: insert after `plugin-agent-opencode` in the scope-enum list at line 20
      (Req: automated enforcement via default:\_global/commits)

- [x] 5.5 Add to specd.yaml plugins list
      `specd.yaml`: add `- name: '@specd/plugin-agent-standard'` to the `plugins.agents` list
      Approach: append after the opencode entry at line 308
      (Req: Project init wizard integration)
