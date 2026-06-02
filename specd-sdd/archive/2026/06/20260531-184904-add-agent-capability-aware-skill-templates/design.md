# Design: add-agent-capability-aware-skill-templates

## Non-goals

- Do not introduce a general-purpose template runtime outside agent skill installation.
- Do not let agent plugins own final markdown rendering, final frontmatter YAML composition, or shared-template path conventions.
- Do not expose absolute filesystem paths or `projectRoot` to rendered templates.
- Do not replace plugin-specific install directories for non-shared files.
- Do not invent a second metadata format for shared templates; `skill.meta.json` is the only folder-level contract introduced by this change.

## Affected areas

- `FsSkillRepository.getBundle()` in `packages/skills/src/infrastructure/repository/skill-repository.ts`
  Change: replace flat variable substitution plus `shared.meta.json` inverse lookup with skill-owned metadata loading, capability normalization, shared-template resolution from `requiredSharedTemplates`, `sharedFolder` normalization/validation, and capability-gated frontmatter insertion.
  Callers: all agent installers plus `ResolveBundle` and skills tests. Risk: HIGH.

- `ResolveBundle.execute()` in `packages/skills/src/application/use-cases/resolve-bundle.ts`
  Change: stop exposing `projectRoot` as a template variable, keep it only for internal validation, and inject safe built-ins plus a default relative `sharedFolder` when absent.
  Callers: internal use case and `packages/skills/test/resolve-bundle.spec.ts`. Risk: MEDIUM.

- `SkillRepository` port in `packages/skills/src/application/ports/skill-repository.ts`
  Change: update bundle-resolution input so plugin capabilities arrive as a simple string list and recursive variables remain available as template data.
  Callers: `FsSkillRepository`, `ResolveBundle`, plugin install use cases, test doubles. Risk: HIGH.

- Template source tree under `packages/skills/templates/`
  Change: migrate source files to `.md.tpl`, add `skill.meta.json` per skill folder, move shared requirements from `shared.meta.json` to `requiredSharedTemplates`, and update shared references to `@{{sharedFolder}}/shared.md`.
  Callers: consumed indirectly by `FsSkillRepository.getBundle()` and all plugin installers. Risk: HIGH.

- `AgentInstallOptions` in `packages/plugin-manager/src/domain/types/agent-plugin.ts`
  Change: expose `capabilities?: readonly string[]` and recursive `variables`, with `variables.frontmatter` and optional `variables.sharedFolder` as ordinary template data.
  Callers: all `plugin-agent-*` install flows and plugin-manager type tests. Risk: HIGH.

- `InstallSkills.execute()` in:
  - `packages/plugin-agent-claude/src/application/use-cases/install-skills.ts`
  - `packages/plugin-agent-copilot/src/application/use-cases/install-skills.ts`
  - `packages/plugin-agent-codex/src/application/use-cases/install-skills.ts`
  - `packages/plugin-agent-opencode/src/application/use-cases/install-skills.ts`
  - `packages/plugin-agent-standard/src/application/use-cases/install-skills.ts`
    Change: stop constructing renderer-specific capability objects, pass capability identifiers only, pass frontmatter source values under `variables.frontmatter`, optionally override `variables.sharedFolder`, and install shared files in the same relative folder the templates reference.
    Callers: one per plugin package; each has a dedicated install test file. Risk: HIGH.

- Shared-template metadata in `packages/skills/templates/shared/shared.meta.json`
  Change: remove the current inverse consumer-index role from the design. Shared dependencies are declared by each skill folder through `skill.meta.json.requiredSharedTemplates`.
  Callers: current repository shared-file resolution only. Risk: MEDIUM because it changes the ownership model.

- Documentation:
  - `packages/skills/README.md`
  - `docs/guide/_sections/getting-started/project-structure.md`
  - `docs/guide/skills-template-rendering.md`
    Change: document `.md.tpl`, `skill.meta.json`, capability identifiers, `@{{sharedFolder}}/shared.md`, and the privacy/safety rules around `sharedFolder`.
    Callers: contributors and agent authors. Risk: LOW.

## New constructs

- `packages/skills/src/domain/template-context.ts`
  Shape:

  ```ts
  export type SkillTemplateScalar = string | number | boolean

  export type SkillTemplateValue =
    | SkillTemplateScalar
    | readonly SkillTemplateValue[]
    | { readonly [key: string]: SkillTemplateValue }

  export interface SkillTemplateContext {
    readonly variables?: Readonly<Record<string, SkillTemplateValue>>
    readonly capabilities?: readonly string[]
  }
  ```

  Responsibility: shared render-time data contract for `@specd/skills`. It carries recursive template data and plugin-declared capability identifiers without exposing the renderer's internal capability map.
  Relationships: exported by `@specd/skills`; consumed by `SkillRepository`, `ResolveBundle`, and the infrastructure renderer.

- `packages/skills/src/domain/skill-template-metadata.ts`
  Shape:

  ```ts
  export interface SkillTemplateMetadata {
    readonly supportedCapabilities: readonly string[]
    readonly requiredCapabilities: readonly string[]
    readonly requiredSharedTemplates: readonly string[]
  }
  ```

  Responsibility: parsed representation of `skill.meta.json` for a template directory.
  Relationships: loaded by repository infrastructure; validated before bundle resolution; not exposed to plugins.

- `packages/skills/src/infrastructure/repository/template-renderer.ts`
  Shape:

  ```ts
  export interface RenderTemplateInput {
    readonly templateSource: string
    readonly variables: Readonly<Record<string, SkillTemplateValue>>
    readonly capabilities: Readonly<Record<string, boolean>>
    readonly includeFrontmatter: boolean
  }

  export class TemplateRenderer {
    render(input: RenderTemplateInput): string
    composeFrontmatter(values: Readonly<Record<string, SkillTemplateValue>>): string
    normalizeOutputFilename(filename: string): string
  }
  ```

  Responsibility: compile and render `Handlebars` templates, emit `.md` filenames from `.md.tpl` sources, and compose final YAML frontmatter when enabled.
  Relationships: created inside `FsSkillRepository`; depends on `handlebars`; receives already-normalized booleans from `skills` internals, never from plugins.

- `packages/skills/src/infrastructure/repository/skill-template-metadata-reader.ts`
  Shape:
  ```ts
  export class SkillTemplateMetadataReader {
    readSkillMetadata(directory: string): SkillTemplateMetadata
  }
  ```
  Responsibility: read and validate `skill.meta.json` per template directory.
  Relationships: used by `FsSkillRepository`; replaces the old `shared.meta.json` consumer lookup path as the source of truth for shared-template requirements.

## Design overview

1. Make the skill folder own its own contract.
   Every skill template directory declares `skill.meta.json` with:

   ```json
   {
     "supportedCapabilities": ["mcp", "agents", "frontmatter"],
     "requiredCapabilities": [],
     "requiredSharedTemplates": ["shared.md"]
   }
   ```

   This replaces the current inverse ownership model where `shared.meta.json` lists which skills consume a shared file.

2. Keep plugin capability input deliberately small.
   Plugins pass only the capabilities they support, for example:

   ```ts
   capabilities: ['mcp', 'agents', 'frontmatter']
   ```

   Plugins do not build renderer-specific `{ type, value }` objects and do not need updating when `skills` grows new internal capability handling.

3. Normalize capabilities inside `@specd/skills`.
   `skills` converts the plugin's capability list to the internal boolean map used by `Handlebars`, validates required capabilities, and rejects unsupported capability declarations when they matter to a given skill folder.

4. Keep frontmatter gated by capability.
   `variables.frontmatter` is ordinary recursive template data, but `skills` only reads, serializes, and inserts it when `frontmatter` is present in the capability list. Templates continue to use `{{{frontmatter}}}` as the insertion point for the final YAML block.

5. Treat `sharedFolder` as ordinary template data with safety guards.
   `sharedFolder` lives under `variables.sharedFolder`, not as a top-level option. If the plugin omits it, `skills` injects a default relative path derived from the runtime config directory. Before rendering, `skills`:
   - strips any trailing `/`
   - resolves the relative path against `projectRoot` internally
   - fails if the resolved path escapes `projectRoot`
   - exposes only the relative form to templates

6. Remove `projectRoot` from the public render context.
   `projectRoot` remains available only to `skills` internals for containment checks and related safety validation. It is not exposed as a template variable and must never appear in rendered markdown.

7. Align template references and install destinations.
   Templates reference shared files with:
   ```md
   @{{sharedFolder}}/shared.md
   ```
   The plugin must install shared files into the same relative folder that the rendered markdown references. If the plugin does not override `variables.sharedFolder`, the default injected by `skills` becomes both the rendered reference target and the install destination contract.

## Key decisions

- **Use `skill.meta.json` as the single folder-level metadata contract** → one shape defines supported capabilities, capability gating, and required shared templates for each skill folder. **Alternatives rejected** → keep `shared.meta.json` as inverse consumer index; rejected because it centralizes knowledge of all consumers in `shared` instead of in each skill that depends on it.

- **Keep plugin capability input as `string[]`** → plugins declare only what they support; `skills` owns normalization. **Alternatives rejected** → plugin-side structured capability objects; rejected because they leak renderer internals and force plugin churn whenever `skills` evolves.

- **Treat `sharedFolder` as a regular variable with internal validation** → keeps the contract small, keeps rendered paths relative, and avoids special-case API surface. **Alternatives rejected** → top-level `sharedFolder` option; rejected because it creates a second lane for template data without adding expressive power.

- **Keep `frontmatter` as an explicit capability gate** → `skills` has a clear switch for whether to read and render `variables.frontmatter`. **Alternatives rejected** → render frontmatter whenever `variables.frontmatter` exists; rejected because it removes the explicit control-flow signal the templates and repository need.

- **Render shared references with `@{{sharedFolder}}/shared.md`** → uses standard Handlebars syntax and preserves the existing `@...` include convention. **Alternatives rejected** → `@{sharedFolder}/shared.md`; rejected because it would introduce a second variable syntax.

- **Never expose absolute paths or `projectRoot` to templates** → prevents privacy leaks into installed markdown and tracked files. **Alternatives rejected** → expose `projectRoot` as before and rely on authors to avoid it; rejected because the safety property should be enforced by the package, not by template discipline.

## Trade-offs

- `[Skill metadata migration]` → moving shared ownership from `shared.meta.json` to `skill.meta.json` requires a one-time migration across template folders, but it leaves the dependency declaration where it belongs and removes a global inverse index.
- `[Default shared path coupling]` → the default `sharedFolder` is now derived from the runtime config directory and must stay aligned with where plugins actually install shared files; the fix is to test both rendered references and install destinations together.
- `[Privacy vs debug visibility]` → removing `projectRoot` from templates prevents local path leakage, but it also removes a debugging convenience from installed files. The design prefers privacy and deterministic, repo-relative output.
- `[Validation strictness]` → rejecting `sharedFolder` when it escapes the project root adds failure modes during install, but the safety gain outweighs the extra validation branch.

## Review-driven adjustments

- Verification exposed a semantic drift in the plugin specs and verify scenarios: several still described runtime-local `._specd-shared` directories even though the implemented contract had already moved to `sharedFolder`.
- The design direction is therefore explicit that plugin-facing install and uninstall requirements must describe the resolved `sharedFolder` location, with its default derived from the runtime config directory, instead of preserving any runtime-local shared directory as the canonical contract.
- Tasks and downstream verify scenarios must preserve this alignment so future verification compares the implementation against the same `sharedFolder` contract that templates and installers now use.

## Spec impact

### `skills:skill-templates-source`

- Direct contract changes: `.md.tpl` sources, `skill.meta.json`, `requiredSharedTemplates`, `supportedCapabilities`, `requiredCapabilities`, `@{{sharedFolder}}/shared.md`.
- Assessment: the existing plugin specs already in scope are sufficient; no new spec family is required.

### `skills:skill-repository`

- Direct contract changes: shared-template lookup now comes from skill metadata, capability normalization happens inside `skills`, and `sharedFolder` is normalized and validated there.
- Assessment: no additional spec outside the already scoped plugin specs needs a delta.

### `skills:resolve-bundle`

- Direct contract changes: safe built-ins only, default relative `sharedFolder`, `projectRoot` internal-only.
- Assessment: no extra spec family is needed.

### `plugin-manager:agent-plugin-type`

- Direct contract changes: `capabilities?: readonly string[]`; recursive `variables`; `variables.frontmatter`; optional `variables.sharedFolder`.
- Assessment: plugin-manager use-case specs remain satisfied because they describe lifecycle flow, not nested install-option shape.

### `plugin-agent-*`

- Direct contract changes: plugins pass capability identifiers only, optionally pass `variables.sharedFolder`, provide `variables.frontmatter`, and install shared files into the rendered relative shared folder.
- Assessment: the five agent plugin specs already in scope cover the required runtime-specific behavior.

## Dependency map

```mermaid
graph LR
  A[plugin-agent-*/InstallSkills.execute] --> B[AgentInstallOptions]
  B --> C[SkillTemplateContext]
  C --> D[FsSkillRepository.getBundle]
  D --> E[SkillTemplateMetadataReader]
  D --> F[TemplateRenderer]
  E --> G[skill.meta.json]
  F --> H[.md.tpl templates]
  F --> I[@{{sharedFolder}}/shared.md]
  F --> J[{{{frontmatter}}}]
  D --> K[shared bundle files]
```

## Tests and verification focus

- `@specd/skills`
  - metadata reader and validation for `skill.meta.json`
  - `requiredCapabilities` gating
  - `requiredSharedTemplates` shared resolution
  - `sharedFolder` defaulting, trailing-slash trimming, and containment failure
  - no `projectRoot` leakage into rendered templates
  - capability-gated frontmatter insertion

- `plugin-manager`
  - widened `AgentInstallOptions` shape
  - capability string-list typing

- `plugin-agent-*`
  - each plugin passes capability identifiers only
  - each plugin writes shared files into the rendered shared folder
  - rendered markdown references the same shared folder path it installs
  - shared files remain frontmatter-free

## Documentation impact

- `packages/skills/README.md`
  - package-level API and authoring changes
- `docs/guide/skills-template-rendering.md`
  - `.md.tpl`, `skill.meta.json`, capabilities, frontmatter, `sharedFolder`
- `docs/guide/_sections/getting-started/project-structure.md`
  - updated generated layout expectations for shared skill files
