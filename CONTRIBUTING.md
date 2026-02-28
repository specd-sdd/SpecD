# Contributing to specd

## Workflow

1. Fork the repository and clone your fork.
2. Create a branch from `main` with a descriptive name:
   ```sh
   git checkout -b feat/my-feature
   ```
3. Make your changes.
4. Push your branch and open a pull request against `main`.

PRs should be focused on a single concern. If you have unrelated changes, open separate PRs.

## Setup

**Requirements:** Node.js >= 20, pnpm >= 10.

```sh
pnpm install
```

Husky hooks are installed automatically via the `prepare` script.

## Development

```sh
pnpm build       # build all packages
pnpm test        # run all tests
pnpm typecheck   # type-check all packages
pnpm lint        # lint + typecheck
pnpm lint:fix    # lint with auto-fix
```

## Code style

Formatting is handled by **Prettier**. It runs automatically on staged files before each commit. To format manually:

```sh
pnpm format        # format all files
pnpm format:check  # check without writing
```

## Git hooks

Two hooks run automatically via **Husky**:

- **`pre-commit`** — runs `lint-staged`, which applies ESLint (with auto-fix), Prettier, and `tsc --noEmit` on staged `.ts` files, and Prettier on staged `.json`, `.yaml`, `.yml`, and `.md` files.
- **`commit-msg`** — validates the commit message with commitlint. Commits that violate the format are rejected before they reach the repository.

## Commit conventions

specd follows [Conventional Commits](https://www.conventionalcommits.org/). Every commit message must match:

```
<type>(<scope>): <description>
```

**Allowed types:**

| Type       | When to use                                             |
| ---------- | ------------------------------------------------------- |
| `feat`     | New feature or capability                               |
| `fix`      | Bug fix                                                 |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test`     | Adding or updating tests                                |
| `docs`     | Documentation only changes                              |
| `chore`    | Tooling, config, dependency updates                     |
| `perf`     | Performance improvement                                 |
| `build`    | Changes to build system or external dependencies        |

**Scope** must be the short package name (without the `@specd/` prefix):

| Scope             | Package                      |
| ----------------- | ---------------------------- |
| `core`            | `@specd/core`                |
| `cli`             | `@specd/cli`                 |
| `mcp`             | `@specd/mcp`                 |
| `skills`          | `@specd/skills`              |
| `schema-std`      | `@specd/schema-std`          |
| `schema-openspec` | `@specd/schema-openspec`     |
| `plugin-claude`   | `@specd/plugin-claude`       |
| `plugin-copilot`  | `@specd/plugin-copilot`      |
| `plugin-codex`    | `@specd/plugin-codex`        |
| `root`            | monorepo root                |
| `all`             | all packages (use sparingly) |

**Rules enforced by commitlint:**

- Scope is required and must be one of the values above.
- Description must be in imperative mood, lower-case, and must not end with a period.
- Header must not exceed 72 characters.
- Body lines must not exceed 100 characters.

**Breaking changes** use the `!` marker and require a `BREAKING CHANGE:` footer:

```
feat(core)!: rename SpecRepository.find to SpecRepository.get

BREAKING CHANGE: SpecRepository.find has been renamed to SpecRepository.get.
```

**Commit body** (optional) uses setext-style section headers — not ATX (`###`):

```
feat(core): add renamed operation to mergeSpecs

Context:
========
`mergeSpecs` previously had no way to express a rename as a single operation.

Changes:
--------
- Add `renamed` keyword to `DeltaConfig`
- Implement RENAMED resolution before other operations
```

**Each commit must represent a single coherent change.** If your work spans unrelated concerns, stage and commit them separately.

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
