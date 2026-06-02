# Tasks: add-agent-capability-aware-skill-templates

## 1. Shared install-time contract

- [x] 1.1 Add recursive template context types in `@specd/skills`
      `packages/skills/src/domain/template-context.ts`: `SkillTemplateScalar`, `SkillTemplateValue`, `SkillTemplateCapability`, `SkillTemplateContext` — define the recursive render-data model and the capability transport used by the skills package.
      Approach: introduce a recursive `SkillTemplateValue` union plus a separate scalar-only capability entry type so `variables` can carry nested frontmatter data while `capabilities` remains a normalized control-flow channel.
      (Req: Capability-aware install-time rendering, Req: Frontmatter source)
- [x] 1.2 Widen the repository and use-case contracts to the new context shape
      `packages/skills/src/application/ports/skill-repository.ts`, `packages/skills/src/application/use-cases/resolve-bundle.ts`: `SkillRepository.getBundle()`, `ResolveBundleInput`, `ResolveBundle.execute()` — replace flat variable-only signatures with `SkillTemplateContext` while preserving built-in project value injection and shared-file metadata.
      Approach: merge built-in `projectRoot`, `configPath`, and `schemaRef` into `context.variables`, forward `capabilities` separately, and keep frontmatter gated by `capabilities.frontmatter`.
      (Req: Behavior, Req: Input, Req: getBundle)
- [x] 1.3 Update the plugin-manager install contract
      `packages/plugin-manager/src/domain/types/agent-plugin.ts`: `AgentInstallValue`, `AgentInstallOptions` — change `variables` from `Record<string, string>` to recursive values and add structured capability entries with initial identifiers `mcp`, `agents`, and `frontmatter`.
      Approach: keep capability entries scalar-only and document that `variables.frontmatter` is the only source for frontmatter data; do not introduce a separate frontmatter argument or prebuilt YAML path.
      (Req: AgentInstallOptions)

## 2. Skills renderer and bundle resolution

- [x] 2.1 Add a dedicated template renderer in `@specd/skills`
      `packages/skills/src/infrastructure/repository/template-renderer.ts`: `TemplateRenderer` — centralize `Handlebars` rendering, capability normalization, frontmatter composition, and output filename normalization.
      Approach: compile templates in one place, normalize `capabilities` into a template-friendly map keyed by `type`, compose YAML from `variables.frontmatter`, and strip `.tpl` from emitted filenames without mutating other file metadata.
      (Req: Capability-aware install-time rendering, Req: Frontmatter injection, Req: Template source location)
- [x] 2.2 Move `FsSkillRepository.getBundle()` to structured rendering
      `packages/skills/src/infrastructure/repository/skill-repository.ts`: `FsSkillRepository.getBundle()` and helper paths — replace regex-based flat substitution with the new renderer and preserve unresolved placeholders only for missing template variables.
      Approach: keep unknown scalar placeholders untouched, do not fabricate missing capability/frontmatter values, skip frontmatter emission for `shared: true` files, and use `variables.frontmatter` only when `capabilities.frontmatter` is truthy.
      (Req: getBundle, Req: Frontmatter injection, Req: Why no frontmatter in skills package)
- [x] 2.3 Update template discovery to `.md.tpl`
      `packages/skills/src/infrastructure/repository/template-reader.ts`: template enumeration and read helpers — treat `.md.tpl` as the source extension and preserve final installed names as `.md`.
      Approach: keep source and emitted filenames distinct, normalize output names after reading, and ensure shared template routing continues to work unchanged.
      (Req: Template source location, Req: Template migration)

## 3. Agent plugin integration

- [x] 3.1 Adapt each agent installer to pass capabilities and recursive variables
      `packages/plugin-agent-{claude,copilot,codex,opencode,standard}/src/application/use-cases/install-skills.ts`: `InstallSkills.execute()` — stop local YAML prepend and pass `{ variables, capabilities }` into bundle resolution.
      Approach: build capability entries for the initial set `mcp`, `agents`, and `frontmatter`, carry runtime metadata under `variables.frontmatter`, and write the repository-rendered markdown directly.
      (Req: AgentInstallOptions, Req: Frontmatter injection)
- [x] 3.2 Convert plugin-local frontmatter preparation to structured values
      `packages/plugin-agent-{claude,copilot,codex,opencode,standard}/src/domain/types/frontmatter.ts`, `packages/plugin-agent-*/src/domain/frontmatter/index.ts`: runtime metadata maps — preserve runtime-specific field coverage but expose structured values suitable for `variables.frontmatter`.
      Approach: keep each plugin responsible for which frontmatter fields are supported, but hand final YAML emission off to `@specd/skills`; remove or shrink local `renderFrontmatter()` helpers to normalization-only code if still needed.
      (Req: Frontmatter source, Req: Agent frontmatter matrix)
- [x] 3.3 Align plugin specs’ implementation points with shared rendering
      `packages/plugin-agent-{claude,copilot,codex,opencode,standard}` install paths — confirm each runtime still emits only supported fields and that shared files remain frontmatter-free.
      Approach: use the shared capability contract for flow control, let plugin-local metadata decide field presence, and rely on the skills renderer for final file content so cross-plugin behavior stays uniform.
      (Req: Frontmatter injection, Req: Agent frontmatter matrix)

## 4. Template source migration

- [x] 4.1 Rename skill templates from `.md` to `.md.tpl`
      `packages/skills/templates/**`: template source files — migrate source naming so templates are explicitly non-final markdown while preserving emitted install filenames.
      Approach: rename skill-local and shared template files together, keep directory layout intact, and ensure no installed output path changes beyond dropping `.tpl`.
      (Req: Template source location, Req: Template migration)
- [x] 4.2 Add capability-aware branches and frontmatter insertion points where needed
      `packages/skills/templates/**`: workflow templates and shared markdown — introduce `Handlebars` conditionals for `mcp` and `agents` content and add the frontmatter insertion point used by non-shared markdown.
      Approach: keep logic declarative, use capability-driven branches instead of plugin-specific string rewriting, and ensure templates remain free of static runtime frontmatter blocks.
      (Req: Capability-aware install-time rendering, Req: Why no frontmatter in skills package)
- [x] 4.3 Preserve workflow wording constraints during template edits
      `packages/skills/templates/**`: graph-guidance content — keep the existing dependents/dependencies wording and `--file` impact examples intact while migrating syntax.
      Approach: update only the templating mechanism and capability-aware branches, not the established graph terminology requirements already enforced by the spec.
      (Req: Graph impact terminology in workflow templates)

## 5. Tests and verification mapping

- [x] 5.1 Update `@specd/skills` tests for recursive context and frontmatter gating
      `packages/skills/test/infrastructure/skill-repository.spec.ts`, `packages/skills/test/resolve-bundle.spec.ts`, `packages/skills/test/domain/skill-bundle.spec.ts`: repository and use-case coverage — assert `.md.tpl` source handling, recursive `variables`, shared-file preservation, and capability-gated frontmatter emission.
      Approach: map the verify scenarios directly to test cases, including cases where `variables.frontmatter` exists without `capabilities.frontmatter` and where nested values remain addressable in templates.
      (Req: getBundle, Req: Input, Req: Behavior)
- [x] 5.2 Update each plugin install test to assert rendered output, not local prepend
      `packages/plugin-agent-{claude,copilot,codex,opencode,standard}/test/install-skills.spec.ts`: install flow tests — verify rendered files already contain runtime frontmatter when enabled and that unsupported fields are excluded.
      Approach: assert on the final markdown written by the plugin, cover shared-file routing, and exercise the initial capability catalogue `mcp`, `agents`, and `frontmatter`.
      (Req: Frontmatter injection, Req: Agent frontmatter matrix, Req: AgentInstallOptions)
- [x] 5.3 Keep plugin-manager type tests aligned with the widened contract
      `packages/plugin-manager/test/domain/types/is-agent-plugin.spec.ts` or equivalent type-focused coverage: agent-plugin type guard tests — confirm widened install options do not affect agent type detection.
      Approach: add focused assertions around the type guard and the new option shape rather than duplicating install-flow tests already covered in plugin packages.
      (Req: isAgentPlugin type guard, Req: AgentInstallOptions)
- [x] 5.4 Run package-level verification for touched workspaces
      `packages/skills`, `packages/plugin-agent-*`, `packages/plugin-manager`: test and lint commands — execute the package test and lint suites needed by the design.
      Approach: run the `pnpm test --filter ...` and `pnpm lint --filter ...` commands listed in `design.md`, then record any gaps or follow-up fixes before moving to implementation review.
      (Req: Capability-aware install-time rendering, Req: Frontmatter injection)

## 6. Documentation and manual checks

- [x] 6.1 Document the new template authoring model
      `packages/skills/README.md`, `docs/guide/skills-template-rendering.md`, `docs/guide/_sections/getting-started/project-structure.md`: contributor docs — explain `.md.tpl`, recursive `variables`, the initial capability set, and the frontmatter insertion model.
      Approach: describe the shared render contract once in docs, link package and guide docs together, and keep authoring guidance in English per project rules.
      (Req: Template source location, Req: Capability-aware install-time rendering, Req: Frontmatter source)
- [x] 6.2 Perform manual install-path verification across capabilities
      temp install workspace and agent plugin outputs: manual E2E check — confirm non-shared markdown contains runtime frontmatter only when `capabilities.frontmatter` is enabled and that `mcp` / `agents` branches render the expected content differences.
      Approach: install a sample skill through representative agent plugins, inspect emitted `SKILL.md` and shared files, and verify `.md.tpl` never leaks into installed output.
      (Req: Frontmatter injection, Req: Template migration, Req: Capability-aware install-time rendering)

## 7. Metadata and shared-folder contract alignment

- [x] 7.1 Replace plugin-side capability objects with capability identifier lists
      `packages/plugin-manager/src/domain/types/agent-plugin.ts`, `packages/plugin-agent-{claude,copilot,codex,opencode,standard}/src/application/use-cases/install-skills.ts`: install contracts and call sites — change install-time capability input to `string[]` and remove renderer-specific capability object construction from plugins.
      Approach: keep the plugin-facing contract limited to capability identifiers such as `mcp`, `agents`, and `frontmatter`, and let `@specd/skills` normalize them internally for template rendering.
      (Req: AgentInstallOptions, Req: getBundle, Req: Capability-aware install-time rendering)

- [x] 7.2 Introduce `skill.meta.json` as the canonical folder-level metadata contract
      `packages/skills/templates/**/skill.meta.json`, `packages/skills/src/infrastructure/repository/skill-template-metadata-reader.ts`, `packages/skills/src/domain/skill-template-metadata.ts`: template metadata loading — define and enforce `supportedCapabilities`, `requiredCapabilities`, and `requiredSharedTemplates` per skill directory.
      Approach: load metadata from each skill folder before bundle resolution, validate shape centrally in `@specd/skills`, and make this metadata the only source of truth for skill-level capability/shared-template requirements.
      (Req: Skill template metadata contract, Req: getBundle)

- [x] 7.3 Move shared-template dependency ownership from `shared.meta.json` to each skill
      `packages/skills/src/infrastructure/repository/skill-repository.ts`, `packages/skills/templates/shared/`, `packages/skills/templates/**/skill.meta.json`: shared resolution — stop using shared-side consumer indexes and include shared templates only when the target skill declares them in `requiredSharedTemplates`.
      Approach: keep `templates/shared/` as the source location for shared template files, but resolve inclusion exclusively from the requesting skill's metadata and remove any repository dependence on inverse consumer indexes.
      (Req: Template migration, Req: listSharedFiles() method, Req: Shared consumer index is no longer authoritative)

- [x] 7.4 Add `sharedFolder` defaulting, normalization, and containment validation in `@specd/skills`
      `packages/skills/src/application/use-cases/resolve-bundle.ts`, `packages/skills/src/infrastructure/repository/skill-repository.ts`, `packages/skills/test/**`: bundle resolution safety — inject a default relative shared folder when absent, trim trailing `/`, and reject values that escape the project root.
      Approach: resolve `sharedFolder` against `projectRoot` only internally for validation, never expose the absolute path, and keep the rendered value relative to the project root.
      (Req: Behavior, Req: sharedFolder is injected when absent, Req: sharedFolder escaping the project root is rejected)

- [x] 7.5 Remove `projectRoot` from the public template variable surface
      `packages/skills/src/application/use-cases/resolve-bundle.ts`, affected tests and docs: privacy-safe render context — stop exposing `projectRoot` to templates while retaining it internally for path-containment checks.
      Approach: preserve only safe built-in variables such as `configPath` and `schemaRef`, adjust templates and tests that relied on `projectRoot`, and verify rendered markdown never contains host-specific absolute paths.
      (Req: Behavior, Req: projectRoot is not exposed as a template variable, Req: Templates do not render absolute shared paths)

- [x] 7.6 Migrate shared references in templates and align plugin install destinations
      `packages/skills/templates/**`, `packages/plugin-agent-{claude,copilot,codex,opencode,standard}/src/application/use-cases/install-skills.ts`, plugin install tests: rendered/shared path consistency — update templates to `@{{sharedFolder}}/shared.md` and ensure plugins write shared files into the same relative folder.
      Approach: render shared references from the normalized `sharedFolder` variable, default plugin installs to the runtime-config-derived shared folder when no override is provided, and cover explicit overrides in tests.
      (Req: Capability-aware install-time rendering, Req: Shared references use sharedFolder variable syntax, Req: sharedFolder travels through variables.sharedFolder)

## 8. Verification follow-up alignment

- [x] 8.1 Align plugin specs with resolved sharedFolder destinations
      `specd-sdd/changes/20260531-184904-add-agent-capability-aware-skill-templates/deltas/plugin-agent-{claude,copilot,codex,opencode,standard}/plugin-agent/spec.md.delta.yaml`: install/uninstall requirements — replace lingering `._specd-shared` wording with the resolved `sharedFolder` contract and its runtime-config-derived default.
      Approach: keep non-shared install roots runtime-specific, but describe shared-file install and removal through `sharedFolder` so the plugin specs match the implemented renderer/install path contract.
      (Req: Shared references use sharedFolder variable syntax, Req: sharedFolder travels through variables.sharedFolder)
- [x] 8.2 Align plugin verify scenarios with resolved sharedFolder behavior
      `specd-sdd/changes/20260531-184904-add-agent-capability-aware-skill-templates/deltas/plugin-agent-{claude,copilot,codex,opencode,standard}/plugin-agent/verify.md.delta.yaml`: install/uninstall verification scenarios — replace runtime-local shared directory assertions with resolved `sharedFolder` scenarios.
      Approach: split install-location and uninstall-behavior checks so each scenario asserts the rendered shared destination, `SKILL.md` absence in the shared location, and correct keep/remove behavior during filtered vs full uninstall.
      (Req: Shared references use sharedFolder variable syntax, Req: sharedFolder travels through variables.sharedFolder)
