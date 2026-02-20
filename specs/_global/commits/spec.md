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

#### Scenario: Missing scope
- **WHEN** a commit message reads `fix: handle missing file`
- **THEN** it must be rejected — scope is required

#### Scenario: Valid commit
- **WHEN** a commit message reads `feat(core): add ChangeState value object`
- **THEN** it is accepted

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

#### Scenario: Unknown type
- **WHEN** a commit message reads `update(core): change delta merger`
- **THEN** it must be rejected — `update` is not a valid type

### Requirement: Scope is the package name

Scope must match the short package name (without `@specd/` prefix):

```
feat(core): add ChangeState value object
fix(cli): handle missing specd.yaml gracefully
chore(root): update turbo to 2.1.0
```

Use `root` for changes at the monorepo root. Use `all` only for changes that genuinely touch all packages.

#### Scenario: Full package name used as scope
- **WHEN** a commit message reads `feat(@specd/core): add entity`
- **THEN** it must be rejected — scope must be the short name `core`, not `@specd/core`

### Requirement: Description in imperative mood

The description uses the imperative mood, present tense: "add", "fix", "remove" — not "added", "fixes", "removed".

#### Scenario: Past tense description
- **WHEN** a commit message reads `feat(core): added delta merger`
- **THEN** it must be rejected — description must use imperative mood

#### Scenario: Trailing period
- **WHEN** a commit message reads `fix(cli): handle missing file.`
- **THEN** it must be rejected — description must not end with a period

### Requirement: Breaking changes

Breaking changes are marked with `!` after the type/scope and explained in the footer:

```
feat(core)!: rename SpecRepository.find to SpecRepository.get

BREAKING CHANGE: SpecRepository.find has been renamed to SpecRepository.get
for consistency with other port interfaces.
```

#### Scenario: Breaking change without marker
- **WHEN** a commit introduces an incompatible API change but has no `!` marker
- **THEN** it must be flagged as missing the breaking change marker

#### Scenario: Breaking change without footer
- **WHEN** a commit uses `!` but has no `BREAKING CHANGE:` footer
- **THEN** it must be rejected — the footer is required to explain the breaking change

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

#### Scenario: Body not needed
- **WHEN** a commit reads `fix(cli): correct typo in error message`
- **THEN** no body is needed — the change is self-explanatory from the subject and diff

#### Scenario: ATX header in body
- **WHEN** a commit body uses `### Context` as a section header
- **THEN** it must be changed to setext style — ATX headers conflict with git comment markers

## Constraints

- Every commit message must match: `^(feat|fix|refactor|test|docs|chore|perf|build)(\(.+\))?: .+`
- Scope must be present and match a known package name or `root` / `all`
- Description must not end with a period
- Breaking changes must use the `!` marker and include a `BREAKING CHANGE:` footer
- No `Co-Authored-By` footer unless explicitly requested

## Spec Dependencies

_none — this is a global constraint spec_

