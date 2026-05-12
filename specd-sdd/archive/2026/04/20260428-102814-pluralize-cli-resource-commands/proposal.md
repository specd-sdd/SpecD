# Proposal: pluralize-cli-resource-commands

## Motivation

The CLI currently mixes plural and singular resource command groups (for example, `drafts` vs `change`, `spec`, and `archive`), which makes command discovery and usage less predictable. We need a consistent naming model now to reduce UX friction and align docs/skills with one canonical command vocabulary.

## Current behaviour

Today `drafts` uses plural resource naming (`drafts list`, `drafts show`, `drafts restore`) while other countable resource groups still appear as singular in command group naming (`change ...`, `spec ...`, and `archive ...` where applicable). This inconsistency leaks into documentation and agent skills, so users and agents do not always get one coherent command style.

## Proposed solution

Adopt plural resource command groups as canonical for countable resources: `changes`, `specs`, `archives`, and `drafts`. Preserve existing singular groups as aliases (`change`, `spec`, `archive`, `draft`) so current workflows do not break. Update docs and skills to use plural canonical forms. Public documentation examples and command references MUST display plural canonical commands.

## Specs affected

### New specs

- `cli:cli/command-resource-naming`: defines CLI-wide naming policy for countable command groups, canonical plural forms, singular aliases, and documentation/help expectations.
  - Depends on: `cli:cli/entrypoint`

### Modified specs

- `cli:cli/change-draft`: clarifies canonical plural command families and explicit singular alias handling, including `draft` alias coverage where applicable.
  - Depends on (added): `cli:cli/command-resource-naming`
- `cli:cli/drafts-list`: aligns signature/examples with canonical plural resource naming and singular alias mention.
  - Depends on (added): `cli:cli/command-resource-naming`
- `cli:cli/drafts-show`: aligns signature/examples with canonical plural resource naming and singular alias mention.
  - Depends on (added): `cli:cli/command-resource-naming`
- `cli:cli/drafts-restore`: aligns signature/examples with canonical plural resource naming and singular alias mention.
  - Depends on (added): `cli:cli/command-resource-naming`
- `cli:cli/change-list`: introduces plural canonical route for list operations and singular alias expectations.
  - Depends on (added): `cli:cli/command-resource-naming`
- `cli:cli/spec-list`: introduces plural canonical command family for spec listing and singular alias expectations.
  - Depends on (added): `cli:cli/command-resource-naming`
- `cli:cli/change-archive`: introduces plural canonical route for archive namespace operations and singular alias expectations.
  - Depends on (added): `cli:cli/command-resource-naming`
- `skills:workflow-automation`: enforces that skill-authored command examples and workflow guidance prefer canonical plural command groups while acknowledging singular aliases.
  - Depends on (added): `cli:cli/command-resource-naming`

## Impact

- CLI command routing and help text under `packages/cli`.
- CLI command tests that assert command paths/help output.
- Documentation command examples under `docs/` must be updated to show plural canonical command families.
- Skill instructions under `.codex/skills/` and skill-related behavior in `@specd/skills` that currently reference singular command forms.
- No planned breaking change in command behavior; aliases retain current invocation paths.

## Technical context

- The user requested a consistency pass anchored on plural canonical naming.
- The user asked to preserve singular forms as aliases.
- The user expanded scope to include `archive -> archives` (canonical) and `draft` alias in addition to canonical `drafts`.
- The user requested ensuring spec coverage even where dedicated specs may not exist yet, including skills-related expectations.
- All relevant workspaces are currently `owned`, so no ownership block for this scope.

## Open questions

Resolved in this proposal:

- Canonicalization policy applies to all new countable command groups: plural canonical + singular alias.
- Singular aliases should be shown in help as aliases only (no compatibility message).
- Generated templates/messages should also move to canonical plural naming where applicable.
