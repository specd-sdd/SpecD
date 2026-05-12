# Tasks: refactor-agent-plugin-config

## 1. Domain model (plugin-manager)

- [x] 1.1 Update `PluginContext` to use `SpecdConfig`
      `packages/plugin-manager/src/domain/types/specd-plugin.ts`: `PluginContext` — Replace `projectRoot`, `config`, and `typeContext` with `readonly config: SpecdConfig`.
      Approach: Import `SpecdConfig` from `@specd/core`.
      (Req: PluginContext)
- [x] 1.2 Update `AgentPlugin` interface signatures
      `packages/plugin-manager/src/domain/types/agent-plugin.ts`: `AgentPlugin` — Update `install` and `uninstall` methods to accept `SpecdConfig`.
      (Req: AgentPlugin extends SpecdPlugin)
- [x] 1.3 Rename Agent types
      `packages/plugin-manager/src/domain/types/agent-plugin.ts`: `InstallOptions` and `InstallResult` — Rename to `AgentInstallOptions` and `AgentInstallResult`.
      (Req: AgentInstallOptions, AgentInstallResult)

## 2. Infrastructure (plugin-manager)

- [x] 2.1 Update `PluginLoader` and options
      `packages/plugin-manager/src/infrastructure/loader/plugin-loader.ts`: `PluginLoaderOptions` — Add `config` to options and pass to factory.
      (Req: Load workflow, Factory function)

## 3. Application (plugin-manager)

- [x] 3.1 Update `InstallPlugin`, `UninstallPlugin`, `UpdatePlugin` use cases
      `packages/plugin-manager/src/application/use-cases/*`: Update to accept and propagate `SpecdConfig`.
      (Req: Input, Behavior)
- [x] 3.2 Update `ListPlugins` and `LoadPlugin` use cases
      `packages/plugin-manager/src/application/use-cases/`: Update context construction.
      (Req: PluginContext)

## 4. Application (skills)

- [x] 4.1 Update `ResolveBundle` for built-in variables
      `packages/skills/src/application/use-cases/resolve-bundle.ts`: Implement built-in variable injection.
      (Req: Input, Behavior)
- [x] 4.2 Update `SkillRepository` port
      `packages/skills/src/application/ports/skill-repository.ts`: Update `getBundle` signature.
      (Req: SkillRepositoryPort interface)

## 5. Plugin Implementations

- [x] 5.1 Update all Agent Plugins (Claude, Copilot, Codex, OpenCode)
      `packages/plugin-agent-*/src/`: Update factory, plugin class, and installation logic to handle `SpecdConfig`.
      (Req: Factory export, Install location)

## 6. CLI Integration

- [x] 6.1 Update CLI command wiring
      `packages/cli/src/commands/plugins/*.ts`, `project/init.ts`, and `project/update.ts`: Pass `SpecdConfig` instead of `projectRoot`.
      Approach: Use the kernel's resolved config and propagate it to use case executors.

## 7. Documentation & Metapackage

- [x] 7.1 Update skill authoring documentation
      `docs/guide/schemas.md`: Document built-in variables.
      Approach: Add a section explaining that `{{projectRoot}}`, `{{configPath}}`, and `{{schemaRef}}` are automatically available in templates.
- [x] 7.2 Update metapackage dependencies
      `packages/specd/package.json`: Add `@specd/plugin-agent-opencode` as a dependency.
      Approach: Ensure all core-supported plugins are part of the meta-distribution.

## 8. Testing

- [x] 8.1 Update unit tests across packages
      `packages/plugin-manager/test/`, `packages/skills/test/`, and `packages/plugin-agent-*/test/`: Update mocks and add built-in variable tests.
- [x] 8.2 Verify CLI integration tests
      `packages/cli/test/commands/plugins.spec.ts`: Assert that config is correctly propagated from the command line interface.
