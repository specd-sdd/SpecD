# Design: plugin-system-phase-1

## Overview

Implementation design for the plugin system phase 1. Creates a hexagonal architecture for skills and plugins with a new plugin-manager package, redesigned skills package, and CLI plugin commands.

## Package Structure

### @specd/plugin-manager

New package at `packages/plugin-manager/`:

```
plugin-manager/
├── src/
│   ├── domain/
│   │   ├── types.ts           # PluginType, SpecdPlugin, AgentPlugin interfaces
│   │   └── errors.ts        # PluginNotFoundError, PluginValidationError
│   ├── application/
│   │   ├── install-plugin.ts
│   │   ├── uninstall-plugin.ts
│   │   ├── update-plugin.ts
│   │   ├── list-plugins.ts
│   │   └── load-plugin.ts
│   └── infrastructure/
│       ├── plugin-loader.ts    # Dynamic import + Zod validation
│       └── index.ts
└── package.json
```

### @specd/skills

Redesigned package at `packages/skills/`:

```
skills/
├── src/
│   ├── domain/
│   │   ├── skill.ts       # Skill, SkillTemplate interfaces
│   │   └── bundle.ts     # SkillBundle, ResolvedFile
│   ├── application/
│   │   ├── list-skills.ts
│   │   ├── get-skill.ts
│   │   └── resolve-bundle.ts
│   ├── ports/
│   │   └── repository-port.ts
│   ├── infrastructure/
│   │   └── fs-repository.ts
│   └── index.ts
├── templates/
│   ├── skill-name/
│   │   └── *.md
│   └── shared/
│       └── .meta.json
└── package.json
```

### CLI Commands

New commands under `specd plugins`:

- `specd plugins install <plugin> [...]`
- `specd plugins list [--type ...]`
- `specd plugins show <plugin>`
- `specd plugins update [<plugin>...]`
- `specd plugins uninstall <plugin> [...]`

### Agent Plugins

- `@specd/plugin-agent-claude` → installs to `.claude/skills/`
- `@specd/plugin-agent-copilot` → stub for phase 2
- `@specd/plugin-agent-codex` → stub for phase 2

## Implementation Order

1. **plugin-manager** package - types, errors, loader + install/uninstall use cases
2. **skills** package - domain models, port, infrastructure
3. **CLI plugin commands** - wire use cases to CLI
4. **Agent plugins** - concrete implementations with frontmatter

## Key Decisions

- **No frontmatter in skills package** - agent plugins inject their own metadata
- **Zod validation at loader boundary** - before domain code runs
- **Idempotent updates** - no config mutation on update
- **Lazy template loading** - SkillTemplate.getContent() is Promise-based
