# Proposal: add-agent-capability-aware-skill-templates

## Motivation

`@specd/skills` needs more than flat variable substitution during agent installation, because installed skill markdown now needs to vary by runtime capabilities such as MCP support, delegated agents, and frontmatter emission. This matters now because the current design pushes too much template knowledge into each `plugin-agent-*` package instead of keeping template semantics owned by `skills`.

## Current behaviour

Today, `@specd/skills` resolves templates with flat `{{key}}` replacement and returns the resulting files to the agent plugins. The plugins then inject runtime-specific frontmatter and effectively decide capability handling themselves, while the templates do not declare which capabilities they support and `skills` does not own the capability model end to end. Shared template routing is also inconsistent: older plugin contracts still describe runtime-private `._specd-shared` directories, while the implementation direction now needs a stable `sharedFolder` contract that templates can reference without hardcoding runtime-specific paths.

## Proposed solution

Move to a capability-aware install-time rendering model owned by `@specd/skills`. Agent plugins should declare only the capabilities they support, using a simple collection such as `['mcp', 'agents', 'frontmatter']`, and `skills` should normalize that input into whatever internal form its templates need. Each skill template directory should declare a `skill.meta.json` contract, including `supportedCapabilities`, `requiredCapabilities`, and `requiredSharedTemplates`. Frontmatter should remain gated by the `frontmatter` capability: only when that capability is present should `skills` render the frontmatter block from the associated template variables and insert it at the template-defined insertion point. The current `shared.meta.json` consumer index should be removed from the model; shared template requirements should instead be declared from each skill. Shared template references inside skill markdown should use the Handlebars-backed form `@{{sharedFolder}}/shared.md`, with `skills` responsible for injecting a default relative path when the plugin does not provide one and for normalizing the value so it never ends with `/`.

## Specs affected

### New specs

- none

### Modified specs

- `skills:skill-templates-source`: define how each skill template directory declares `skill.meta.json` with `supportedCapabilities`, `requiredCapabilities`, and `requiredSharedTemplates`, how `.md.tpl` sources expose capability-aware branches, and how frontmatter insertion is gated by the `frontmatter` capability rather than by plugin-side string assembly.
  - Depends on (added): none
- `skills:skill-repository`: change bundle resolution so `skills` receives plugin-declared capabilities as a simple list, normalizes them internally, validates them against skill-supported capabilities, injects and normalizes `variables.sharedFolder`, and owns final frontmatter insertion.
  - Depends on (added): none
- `skills:resolve-bundle`: update the bundle resolution use case so only the safe built-in template variables remain exposed, recursive template variables and plugin capability lists are combined in a `skills`-owned render path, and `projectRoot` is retained only for internal validation rather than template rendering.
  - Depends on (added): none
- `plugin-manager:agent-plugin-type`: change the agent install contract so plugins pass capabilities as a simple collection of supported capability identifiers instead of pre-normalized capability objects, while still allowing structured template variables.
  - Depends on (added): none
- `plugin-agent-claude:plugin-agent`: update the Claude plugin contract so install declares only the capabilities Claude supports, passes frontmatter source values without taking ownership of capability normalization or final frontmatter assembly, and routes shared files through `sharedFolder` rather than `._specd-shared`.
  - Depends on (added): none
- `plugin-agent-copilot:plugin-agent`: update the Copilot plugin contract so install declares only the capabilities Copilot supports, passes frontmatter source values without taking ownership of capability normalization or final frontmatter assembly, and routes shared files through `sharedFolder` rather than `._specd-shared`.
  - Depends on (added): none
- `plugin-agent-codex:plugin-agent`: update the Codex plugin contract so install declares only the capabilities Codex supports, passes frontmatter source values without taking ownership of capability normalization or final frontmatter assembly, and routes shared files through `sharedFolder` rather than `._specd-shared`.
  - Depends on (added): none
- `plugin-agent-opencode:plugin-agent`: update the Open Code plugin contract so install declares only the capabilities Open Code supports, passes frontmatter source values without taking ownership of capability normalization or final frontmatter assembly, and routes shared files through `sharedFolder` rather than `._specd-shared`.
  - Depends on (added): none
- `plugin-agent-standard:plugin-agent`: update the Agent Skills standard plugin contract so install declares only the capabilities the standard supports, passes frontmatter source values without taking ownership of capability normalization or final frontmatter assembly, and routes shared files through `sharedFolder` rather than `._specd-shared`.
  - Depends on (added): none

## Impact

This change affects the install-time contract exposed by `plugin-manager`, the bundle rendering path in `packages/skills`, the metadata and authoring model for skill templates under `packages/skills/templates/`, and the install flows in all five `plugin-agent-*` packages. It will also change how shared templates are linked into a skill bundle by moving that declaration from `shared.meta.json` into each skill's own metadata, how shared template paths are rendered by introducing a normalized `sharedFolder` variable, which built-in variables are allowed to reach template output, and how frontmatter is emitted by installed skill files by making `skills` the owner of the final inserted block while keeping plugins responsible only for declaring support and providing source values. It also changes the documented shared install destination away from runtime-local `._specd-shared` directories toward the `sharedFolder` contract and its default runtime-config-derived location.

## Technical context

The earlier design direction assumed plugins would pass structured capability objects into `skills`, but that was rejected because it would force every plugin to know the renderer's internal capability shape and would require touching all plugins when `skills` grows a new capability. The updated direction is stricter about boundaries: plugins should only know which capabilities they themselves support; `skills` should own normalization, conditional rendering, frontmatter insertion, shared-folder normalization, and internal path validation; and each skill template directory should declare which capabilities and shared templates it understands through `skill.meta.json`. The agreed shape now includes `supportedCapabilities`, `requiredCapabilities`, and `requiredSharedTemplates`, for example:

```json
{
  "supportedCapabilities": ["mcp", "agents", "frontmatter"],
  "requiredCapabilities": [],
  "requiredSharedTemplates": ["shared.md"]
}
```

`Handlebars` remains the preferred templating mechanism, `.md.tpl` remains the preferred source extension, and `frontmatter` remains an explicit capability gate so `skills` can decide whether `variables.frontmatter` should produce an inserted YAML block at all. The current `shared.meta.json` shape was also reviewed against the code in `skill-repository.ts`: today it acts as an inverse index of which skills consume `shared.md`, and that ownership is being intentionally inverted so the dependency is declared by each skill through `requiredSharedTemplates` instead. No replacement use for `shared.meta.json` is assumed in this change.

For shared template references inside installed skill markdown, the conversation also established that absolute paths must never be rendered because they would leak local machine paths into tracked files. Instead, `sharedFolder` should be treated as a regular template variable, always relative to the project root. When the plugin does not provide `variables.sharedFolder`, `skills` should inject a default relative path derived from the runtime config directory, and when the plugin does provide it, `skills` should normalize it by removing any trailing `/` before exposing it to templates. For safety, `skills` should resolve `sharedFolder` against `projectRoot` internally and fail if the resulting absolute path escapes the project root; this containment check is internal only and must not leak absolute paths into rendered output. By the same privacy rule, `projectRoot` itself should no longer be exposed as a template variable at all, whether from plugins or from built-in bundle resolution.

## Open questions

None at proposal stage. The remaining work is to specify the exact validation rules and lifecycle semantics for `skill.meta.json` in the downstream specs and design artifacts.
