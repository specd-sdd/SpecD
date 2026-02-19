# Commit Conventions

## Overview

specd uses Conventional Commits. Every commit message must be machine-parseable for changelog generation and release automation.

## Requirements

### Requirement: Conventional commit format

All commits follow the format:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Requirement: Allowed types

| Type | When to use |
|---|---|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or updating tests |
| `docs` | Documentation only changes |
| `chore` | Tooling, config, dependency updates |
| `perf` | Performance improvement |
| `build` | Changes to build system or external dependencies |

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

### Requirement: Breaking changes

Breaking changes are marked with `!` after the type/scope and explained in the footer:

```
feat(core)!: rename SpecRepository.find to SpecRepository.get

BREAKING CHANGE: SpecRepository.find has been renamed to SpecRepository.get
for consistency with other port interfaces.
```

## Constraints

- Every commit message must match: `^(feat|fix|refactor|test|docs|chore|perf|build)(\(.+\))?: .+`
- Scope must be present and match a known package name or `root` / `all`
- Description must not end with a period
- Breaking changes must use the `!` marker and include a `BREAKING CHANGE:` footer
- No `Co-Authored-By` footer unless explicitly requested

## Spec Dependencies

_none — this is a global constraint spec_

