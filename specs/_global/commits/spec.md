# Commit Conventions

## Purpose

Inconsistent commit messages make changelogs unreliable and automated releases impossible. specd uses Conventional Commits so that every message is machine-parseable for changelog generation and release automation. The format is enforced at commit time by commitlint.

## Requirements

### Requirement: Conventional commit format

All commits follow the format:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Requirement: Allowed types

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

### Requirement: Scope is the package name

Scope must match the short package name (without `@specd/` prefix):

```
feat(core): add ChangeState value object
fix(cli): handle missing specd.yaml gracefully
chore(root): update turbo to 2.1.0
```

Use `root` for changes at the monorepo root. Use `all` only for changes that genuinely touch all packages.

### Requirement: Description in imperative mood

The description uses the imperative mood, present tense: "add", "fix", "remove" — not "added", "fixes", "removed".

### Requirement: Commit granularity

Each commit must represent a single coherent change. Unrelated modifications must never be combined into one commit, even if they were made in the same session. The guiding question is: can this commit be reverted or cherry-picked without affecting anything else?

Group changes by the smallest meaningful unit — a single fix, a single feature addition, a single refactor, a documentation update for one spec. When a session produces changes across multiple files for different reasons, they must be staged and committed separately.

```
# Good — each commit has a single reason to exist
docs(root): add scenarios to architecture spec
fix(core): correct delta merge order in mergeSpecs
test(core): add RENAMED operation test cases

# Bad — unrelated changes bundled together
docs(root): update specs and fix delta merger and add tests
```

### Requirement: Breaking changes

Breaking changes are marked with `!` after the type/scope and explained in the footer:

```
feat(core)!: rename SpecRepository.find to SpecRepository.get

BREAKING CHANGE: SpecRepository.find has been renamed to SpecRepository.get
for consistency with other port interfaces.
```

### Requirement: Automated enforcement

Commit conventions must be automatically enforced by commitlint via a husky `commit-msg` hook. Commits that violate the format are rejected at commit time before they reach the repository.

commitlint configuration must:

- Extend `@commitlint/config-conventional` as the base
- Restrict `scope-enum` to the known specd package names: `core`, `cli`, `mcp`, `skills`, `schema-std`, `schema-openspec`, `plugin-claude`, `plugin-copilot`, `plugin-codex`, `code-graph`, `root`, `all`
- Enforce `subject-case: lower-case`
- Enforce `header-max-length: 72`
- Enforce `body-max-line-length: 100`
- Reject commits that include AI co-author trailers (`Co-Authored-By: ... @anthropic.com`)

### Requirement: Commit body format

Commit bodies are optional and used only when the subject line and diff cannot fully explain the change. When a body is present it must follow a consistent structure.

- Use setext-style section headers (`===` for primary, `---` for secondary) — never ATX headers (`###`), which conflict with git comment syntax
- Wrap all technical terms in backticks: filenames (`spec.md`), symbols (`mergeSpecs`), types (`DeltaConfig`), commands (`pnpm test`)
- Limit body lines to 100 characters
- Include at minimum a `Context` and `Changes` section when a body is present; add `Impact` or `Breaking` when they add value

```
feat(core): add RENAMED operation to mergeSpecs

Context:
========
`mergeSpecs` previously supported ADDED, MODIFIED, and REMOVED operations
but not RENAMED. Delta files that rename a block had no way to express the
old-to-new name mapping, forcing a REMOVED + ADDED pair that loses history.

Changes:
--------
- Add `renamed` keyword to `DeltaConfig` and `OperationKeywords`
- Implement RENAMED resolution as the first pass before other operations
- Add conflict detection for FROM/TO name collisions
```

## Constraints

- Every commit message must match: `^(feat|fix|refactor|test|docs|chore|perf|build)(\(.+\))?: .+`
- Scope must be present and match a known package name or `root` / `all`
- Description must not end with a period
- Breaking changes must use the `!` marker and include a `BREAKING CHANGE:` footer
- No `Co-Authored-By` footer unless explicitly requested

## Spec Dependencies

_none — this is a global constraint spec_
