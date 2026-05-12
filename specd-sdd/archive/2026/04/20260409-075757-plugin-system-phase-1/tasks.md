# Tasks: plugin-system-phase-1

## 1. Core config and lifecycle cleanup

- [x] 1.1 Replace the `ConfigWriter` skills manifest API with plugin operations
      `packages/core/src/application/ports/config-writer.ts`: `ConfigWriter` — remove `recordSkillInstall()` / `readSkillsManifest()` and define `addPlugin()`, `removePlugin()`, and `listPlugins()` alongside `initProject()`
      Approach: keep `specd.yaml` mutation in core, model plugin persistence as `plugins.<type>` entries, and preserve the existing `InitProjectOptions` / `InitProjectResult` contract
      (Req: Config writer port, Plugin declarations)
- [x] 1.2 Rework the fs adapter to persist `plugins.agents`
      `packages/core/src/infrastructure/fs/config-writer.ts`: `FsConfigWriter` — implement YAML reads/writes for `plugins.agents` and remove the legacy `skills` manifest parsing path
      Approach: parse the YAML document once, mutate only the `plugins` subtree, preserve unrelated config structure, and keep file writes atomic
      (Req: Plugin declarations, addPlugin/removePlugin/listPlugins behavior)
- [x] 1.3 Retire the legacy core skills-manifest use cases and exports
      `packages/core/src/application/use-cases/record-skill-install.ts`, `packages/core/src/application/use-cases/get-skills-manifest.ts`, `packages/core/src/application/use-cases/index.ts`, `packages/core/src/composition/kernel.ts`: old skills-manifest flow — remove or stop exporting the obsolete path
      Approach: delete the unused use cases together with their kernel exposure so the CLI cannot keep using the pre-plugin model by accident
      (Req: project-update plugin orchestration, project-init plugin installation)
- [x] 1.4 Add focused config-writer regression tests
      `packages/core/test/infrastructure/fs/config-writer.spec.ts`: `FsConfigWriter` — cover plugin add/remove/list, idempotency, and YAML preservation
      Approach: use temp-directory integration tests against real YAML files, matching the repo's existing fs adapter testing pattern
      (Req: Plugin declarations, Config writer port)

## 2. Canonical skills library

- [x] 2.1 Replace the flat `@specd/skills` API with domain models and package structure
      `packages/skills/src/domain/skill.ts`, `packages/skills/src/domain/skill-bundle.ts`, `packages/skills/src/index.ts`: `Skill`, `SkillTemplate`, `SkillBundle`, `ResolvedFile` — introduce the lazy-template model required by the specs
      Approach: move from `content: string` to `templates: SkillTemplate[]`, keep domain types pure interfaces, and export only the new structured API
      (Req: Skill interface, SkillTemplate interface, SkillBundle interface)
- [x] 2.2 Implement the skills repository port and use cases
      `packages/skills/src/application/ports/skill-repository.ts`, `packages/skills/src/application/use-cases/list-skills.ts`, `get-skill.ts`, `resolve-bundle.ts`: `SkillRepository`, `ListSkills`, `GetSkill`, `ResolveBundle` — provide the application surface described in the specs
      Approach: keep the repository contract metadata-first, return discriminated outputs where required, and route bundle resolution through the repository rather than ad hoc template access
      (Req: list() method, get() method, getBundle() method, ListSkills input/output, GetSkill input/output, ResolveBundle input/output)
- [x] 2.3 Implement filesystem-backed template loading and shared-file scanning
      `packages/skills/src/infrastructure/repository/skill-repository.ts`, `template-reader.ts`: `createSkillRepository()` and `TemplateReader` — read templates lazily, resolve variables, and expose `listSharedFiles()`
      Approach: use `node:fs/promises`, keep content loading lazy until `getContent()` / `getBundle()`, and scan `templates/shared/*.meta.json` into `SharedFile` records
      (Req: File reading, TemplateReader, Shared file scanning, createSkillRepository factory)
- [x] 2.4 Migrate the skill templates into the canonical source tree
      `packages/skills/templates/`: skill directories and shared content — move the markdown bodies out of `dev/ai-agents/skills/*`, strip frontmatter, add renamed `specd-metadata` / `specd-compliance`, and create shared metadata files
      Approach: keep the markdown bodies frontmatter-free, store shared content under `templates/shared/`, and represent ownership with `.meta.json` files rather than duplicating file bodies
      (Req: Template source location, Template migration, Frontmatter source, Why no frontmatter in skills package)
- [x] 2.5 Add skills package tests for bundles and repository behavior
      `packages/skills/test/domain/skill-bundle.spec.ts`, `packages/skills/test/infrastructure/skill-repository.spec.ts`: bundle install/uninstall and repository resolution — verify lazy loading, variable substitution, shared-file scanning, and idempotent uninstall
      Approach: use explicit assertions against a temporary target directory and the real template tree
      (Req: Install behavior, Uninstall behavior, listSharedFiles() method, Lazy content loading)

## 3. Plugin manager and agent packages

- [x] 3.1 Scaffold `@specd/plugin-manager` with typed domain contracts and errors
      `packages/plugin-manager/src/domain/types/specd-plugin.ts`, `agent-plugin.ts`, `plugin-context.ts`, `packages/plugin-manager/src/domain/errors/plugin-not-found.ts`, `plugin-validation.ts`: `SpecdPlugin`, `AgentPlugin`, `PluginContext`, `PluginNotFoundError`, `PluginValidationError`
      Approach: keep all contracts in the domain layer, extend `SpecdError` for runtime failures, and define `InstallResult` / `InstallOptions` exactly as specified
      (Req: Base plugin interface, Agent plugin extends SpecdPlugin, Plugin errors)
- [x] 3.2 Implement plugin-manager use cases and loader infrastructure
      `packages/plugin-manager/src/application/use-cases/install-plugin.ts`, `uninstall-plugin.ts`, `update-plugin.ts`, `list-plugins.ts`, `load-plugin.ts`, `packages/plugin-manager/src/infrastructure/loader/plugin-loader.ts`: plugin orchestration and runtime loading
      Approach: validate `specd-plugin.json` with Zod before `import()`, call `create()`, validate the returned runtime contract, and keep config mutation out of these use cases
      (Req: InstallPlugin, UninstallPlugin, UpdatePlugin, ListPlugins, LoadPlugin, Plugin loader workflow)
- [x] 3.3 Add plugin-manager tests for manifest validation and orchestration
      `packages/plugin-manager/test/infrastructure/plugin-loader.spec.ts`, `packages/plugin-manager/test/application/install-plugin.spec.ts`: loader and use cases — verify missing packages, invalid manifests, contract validation, and generic install/update/list/load flows
      Approach: use mocked dynamic imports and small fake plugin modules so the tests exercise both success and failure paths deterministically
      (Req: Plugin loader workflow, PluginValidationError, PluginNotFoundError)
- [x] 3.4 Implement the top-level Claude package and contract-valid Copilot/Codex stubs
      `packages/plugin-agent-claude/src/**`, `packages/plugin-agent-copilot/src/index.ts`, `packages/plugin-agent-codex/src/index.ts`, each package's `specd-plugin.json`: concrete `AgentPlugin` exports
      Approach: Claude owns frontmatter types plus a `skillFrontmatter` map and installs bundles into `.claude/skills/`; Copilot and Codex return valid `AgentPlugin` stubs that satisfy the runtime contract without full environment-specific behavior
      (Req: Claude agent plugin, Frontmatter injection, Install location, Copilot stub, Codex stub)
- [x] 3.5 Retire the old stub plugin packages and update workspace wiring
      `packages/plugins/claude/**`, `packages/plugins/copilot/**`, `packages/plugins/codex/**`, plus affected `package.json` / workspace references: old package locations — remove or detach the obsolete stubs once the new top-level packages compile
      Approach: update workspace manifests/imports first, then delete the redundant stubs so the repo ends with one canonical package per agent
      (Req: top-level agent package move, plugin package ownership)
- [x] 3.6 Add agent-package tests for Claude frontmatter installation
      `packages/plugin-agent-claude/test/install-skills.spec.ts`: `create()` / install flow — verify bundle resolution, frontmatter prepending, selected-skill filtering, and target directory writes
      Approach: mock the skills repository factory, assert file content includes YAML frontmatter, and verify `.claude/skills/` path resolution from `projectRoot`
      (Req: Factory export, Application layer, Frontmatter injection, Install location)

## 4. CLI plugin commands and command migration

- [x] 4.1 Add the `plugins` command family
      `packages/cli/src/commands/plugins/install.ts`, `list.ts`, `show.ts`, `update.ts`, `uninstall.ts`: Commander command registrations for the new public CLI surface
      Approach: reuse `resolveCliContext()`, `parseFormat()`, and `output()`; read plugin declarations through `ConfigWriter`; use plugin-manager use cases for runtime operations; preserve text/json/toon parity
      (Req: plugins-install command signature/workflow/output, plugins-list status/output, plugins-show output/error handling, plugins-update behavior/output, plugins-uninstall workflow)
- [x] 4.2 Refactor `project init` from `--agent` + direct skill writes to `--plugin` + plugin orchestration
      `packages/cli/src/commands/project/init.ts`: `registerProjectInit()`, `runInteractiveInit()` — replace `KNOWN_AGENTS`, `listSkills()`, and `createRecordSkillInstall()` usage with plugin selection and plugin installation
      Approach: keep project creation in `InitProject`, then delegate plugin installation through the new `plugins install` path or a shared helper that uses the same orchestration model; preserve existing banner and interactive UX semantics
      (Req: project-init command signature, Interactive mode, Skills installation after init)
- [x] 4.3 Refactor `project update` onto declared plugin updates
      `packages/cli/src/commands/project/update.ts`: `registerProjectUpdate()` — replace `getSkillsManifest()` + direct file writes with `listPlugins()` + `update-plugin` orchestration and `plugins:`-prefixed output
      Approach: resolve config once, update all declared plugins when no filter is provided, and emit grouped text/json results matching the new verify scenarios
      (Req: project-update update step, Output on success)
- [x] 4.4 Remove the old `skills` command path and `known-agents` helper
      `packages/cli/src/commands/skills/install.ts`, `list.ts`, `show.ts`, `update.ts`, `packages/cli/src/helpers/known-agents.ts`, and CLI command registration: obsolete agent-specific CLI surface
      Approach: delete the old command modules only after the new `plugins` commands are registered and the project commands no longer import the helper
      (Req: replace old skills CLI with plugins CLI, remove hardcoded agent directories)
- [x] 4.5 Rewrite CLI tests around the plugin workflow
      `packages/cli/test/commands/plugins.spec.ts`, `packages/cli/test/commands/plugins-update.spec.ts`, `packages/cli/test/commands/project-init.spec.ts`, `packages/cli/test/commands/project-update.spec.ts`: command behavior coverage
      Approach: mock plugin-manager factories/use cases, update existing `project-init` / `project-update` specs from `skills` expectations to `plugins` expectations, and cover already-installed, partial-failure, and JSON output cases
      (Req: plugin command output/exit code, project-init plugin install, project-update plugin update)

## 5. Docs, exports, and final verification

- [x] 5.1 Update public docs for the new CLI surface and core contract
      `docs/cli/plugins-install.md`, `plugins-list.md`, `plugins-show.md`, `plugins-update.md`, `plugins-uninstall.md`, `docs/cli/project-init.md`, `docs/cli/project-update.md`, `docs/core/config.md`, `docs/core/config-writer.md`: public docs — describe command purpose, flags, output semantics, and the new `plugins.agents` / `ConfigWriter` contract
      Approach: document the machine-consumed output shapes alongside human usage examples, and remove outdated references to the `skills` command family
      (Req: CLI documentation, Core documentation)
- [x] 5.2 Ensure package exports, manifests, and JSDoc are complete
      `packages/plugin-manager/package.json`, `packages/skills/package.json`, `packages/plugin-agent-claude/package.json`, `packages/plugin-agent-copilot/package.json`, `packages/plugin-agent-codex/package.json`, plus all new exported source files: package entrypoints and symbol docs
      Approach: expose only named exports, keep NodeNext/ESM wiring consistent, and add full JSDoc to every exported function, class, interface, and method introduced by the redesign
      (Req: ESM only, Named exports only, JSDoc on all symbols)
- [x] 5.3 Run full repo verification for the redesign slice
      `pnpm test`, `pnpm lint`, plus manual CLI smoke runs against `node packages/cli/dist/index.js`: repo-wide verification — confirm the plugin workflow, docs, and command outputs all line up with the specs
      Approach: execute automated checks first, then run manual end-to-end flows for `project init`, `plugins list`, `project update`, and `plugins uninstall` in a temporary project to confirm the behavior described in `verify`
      (Req: verify scenarios across CLI, plugin-manager, skills, and agent-plugin specs)

## 6. Follow-up fixes after implementation review

- [x] 6.1 Normalize shared-file references in skill templates
      `packages/skills/templates/*/SKILL.md`: shared-file mentions — replace path-style mentions (`.specd/skills/shared.md`) with the filename-only reference (`shared.md`)
      Approach: keep instruction semantics unchanged and only normalize the shared-file reference format in template content
      (Req: Template migration, shared template composition)
- [x] 6.2 Align Claude frontmatter contract with spec/design
      `packages/plugin-agent-claude/src/domain/types/frontmatter.ts`, `packages/plugin-agent-claude/src/application/use-cases/install-skills.ts`: `Frontmatter` + renderer — support the full declared interface and serialize all declared fields into YAML frontmatter
      Approach: expand the type to include all optional keys from spec, keep required `description`, and make renderer deterministic for scalar/object values
      (Req: Frontmatter type, Frontmatter injection)
- [x] 6.3 Move Claude plugin runtime class to domain layer shape
      `packages/plugin-agent-claude/src/domain/types/claude-plugin.ts`, `packages/plugin-agent-claude/src/index.ts`: `ClaudeAgentPlugin` location — place the concrete class in the domain/types path referenced by design and keep `create(): AgentPlugin` as entrypoint
      Approach: keep behavior unchanged, move class definition, and keep index as thin factory export
      (Req: Domain layer, Factory export)
- [x] 6.4 Inject frontmatter across all installed skill markdown files
      `packages/plugin-agent-claude/src/application/use-cases/install-skills.ts`, `packages/plugin-agent-claude/test/install-skills.spec.ts`: install flow — prepend frontmatter to every markdown file in each skill bundle
      Approach: apply frontmatter to `*.md` files during write loop and update tests to assert the behavior for `shared.md` too
      (Req: Frontmatter injection, Application layer)
