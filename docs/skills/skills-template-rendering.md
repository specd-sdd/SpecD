# Skills Template Rendering

`@specd/skills` renders install-time skill templates for agent plugins from
`packages/skills/templates/`.

## Source files

- Skill-local and shared template source files use the `.md.tpl` extension.
- Resolved install output files use the same name without the trailing `.tpl`.
- Skill-local templates live in `packages/skills/templates/<skill-name>/`.
- Shared templates live in `packages/skills/templates/shared/`.
- Each skill-local directory also contains `skill.meta.json`.

## Skill metadata

Each skill directory declares its template contract in `skill.meta.json`:

```json
{
  "supportedCapabilities": ["mcp", "agents", "frontmatter"],
  "requiredCapabilities": [],
  "requiredSharedTemplates": ["shared.md"]
}
```

- `supportedCapabilities` declares which capability identifiers templates in that folder may reference.
- `requiredCapabilities` declares which capability identifiers must be present for the skill to be installable.
- `requiredSharedTemplates` declares which files from `templates/shared/` are included in the resolved bundle.

## Render context

Templates receive:

- `variables` as a recursive object tree
- `capabilities` from plugins as a list of identifiers such as `['mcp', 'agents', 'frontmatter']`
- `frontmatter` as the final YAML block to inject when enabled

`@specd/skills` normalizes the capability list internally for template rendering.

Built-in public variables are privacy-safe:

- `configPath`
- `schemaRef`
- `sharedFolder`

`projectRoot` is used only internally for validation and is not exposed to templates.

The initial required capability identifiers are:

- `mcp`
- `agents`
- `frontmatter`

## Supported template features

Templates may use `Handlebars` features that keep rendering declarative:

- `{{variable}}`
- `{{variables.frontmatter.name}}`
- `{{#if capabilities.mcp}} ... {{else}} ... {{/if}}`
- `{{#each someList}} ... {{/each}}`

Templates must not rely on arbitrary runtime code execution.

## Frontmatter insertion

Skill-local templates may declare a frontmatter insertion point with:

```md
{{{frontmatter}}}
```

`@specd/skills` composes that YAML block from `variables.frontmatter`.
The block is emitted only when:

- `capabilities.frontmatter` is enabled
- `variables.frontmatter` is present
- the target file is not marked as shared

Shared templates must remain free of runtime frontmatter blocks.

## Shared templates

Shared references inside markdown use:

```md
@{{sharedFolder}}/shared.md
```

`sharedFolder` is treated as a regular template variable:

- it remains relative to the project root in rendered output
- `@specd/skills` injects a default when the plugin does not provide one
- `@specd/skills` normalizes away any trailing `/`
- `@specd/skills` rejects values that escape the project root

## Authoring guidance

- Keep existing workflow wording intact when migrating a template to `.md.tpl`.
- Use capability branches only where the runtime behavior genuinely differs.
- Prefer `capabilities.*` for control flow and `variables.*` for render data.
- Keep frontmatter values structured in plugin code; do not pass prebuilt YAML from plugins.
