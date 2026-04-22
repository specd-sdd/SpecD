# @specd/skills

Skill registry API for [specd](https://github.com/specd-sdd/SpecD). For more information, visit [getspecd.dev](https://getspecd.dev).

## Exports

### Domain types

- **`Skill`** — domain model with `name`, `description`, and `templates`.
- **`SkillTemplate`** — lazy-loaded template file with `filename` and `getContent()`.
- **`SkillBundle`** — a resolved set of skill files read from a directory.

### Use cases

- **`GetSkill`** — retrieve a skill by name.
- **`ListSkills`** — list all available skills in a directory.
- **`ResolveBundle`** — read and parse all files in a skill directory.

### Infrastructure

- **`createSkillRepository`** — creates a `SkillRepository` adapter backed by the filesystem.

## Usage

```typescript
import { createSkillRepository } from '@specd/skills'

const repo = createSkillRepository({ startDir: process.cwd() })

const skills = await repo.list()
const skill = await repo.get('commit')
```

## Skill templates

Skills are markdown files with a `SKILL.md` in their root. Templates are stored under `templates/` within the package and referenced by skill directories in agent plugin packages.

## License

MIT
