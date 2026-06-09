# @specd/skills

Skill registry API for [specd](https://github.com/specd-sdd/SpecD). For more information, visit [getspecd.dev](https://getspecd.dev).

## Exports

### Domain types

- **`Skill`** — domain model with `name`, `description`, and `templates`.
- **`SkillTemplate`** — lazy-loaded template file with `filename` and `getContent()`.
- **`SkillBundle`** — a resolved set of skill files read from a directory.
- **`SkillTemplateContext`** — recursive install-time render context with `variables` and `capabilities`.

### Use cases

- **`GetSkill`** — retrieve a skill by name.
- **`ListSkills`** — list all available skills in a directory.
- **`ResolveBundle`** — resolve a skill bundle with install-time variables, capabilities, and built-in project values.

### Infrastructure

- **`createSkillRepository`** — creates a `SkillRepository` adapter backed by the filesystem.

## Usage

```typescript
import { createSkillRepository } from '@specd/skills'

const repo = createSkillRepository()

const skills = await repo.list()
const skill = await repo.get('specd')
const bundle = await repo.getBundle('specd', {
  variables: {
    sharedFolder: '.specd/config/skills/shared',
    frontmatter: {
      name: 'specd',
      description: 'Entry point for specd lifecycle orientation and next-step guidance.',
    },
  },
  capabilities: ['mcp', 'agents', 'frontmatter'],
})
```

## Skill templates

Templates are stored under `packages/skills/templates/` and use the `.md.tpl` extension.
Resolved install bundles emit `.md` files by removing the trailing `.tpl` suffix.

Skill-local templates may include:

- `Handlebars` conditionals such as `{{#if capabilities.mcp}} ... {{/if}}`
- recursive variables, including nested paths under `variables.frontmatter`
- a frontmatter insertion point using `{{{frontmatter}}}`

Each skill directory declares `skill.meta.json` with:

- `supportedCapabilities`
- `requiredCapabilities`
- `requiredSharedTemplates`

Shared templates under `templates/shared/` remain frontmatter-free and are included from each skill's `requiredSharedTemplates`.
Skill-local markdown only receives runtime frontmatter when the `frontmatter` capability is present and `variables.frontmatter` is present.

Public template data is privacy-safe:

- `projectRoot` is not exposed to templates
- `sharedFolder` is rendered as a project-relative path
- shared references use `@{{sharedFolder}}/shared.md`

For contributor-facing authoring rules, see `docs/guide/skills-template-rendering.md`.

## License

MIT
