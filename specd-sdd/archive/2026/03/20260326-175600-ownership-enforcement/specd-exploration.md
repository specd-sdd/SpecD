Generated: 2026-03-26

# Exploration: ownership-enforcement

## Problem statement

The `ownership` field on workspaces (`'owned' | 'shared' | 'readOnly'`) is defined in
`SpecdWorkspaceConfig`, loaded from `specd.yaml`, stored in the `Repository` base class,
and threaded through every use-case factory — but **never checked**. A `readOnly` workspace
can be modified exactly like an `owned` one: specs can be created, changed, archived, and
written without any guard.

The user wants enforcement so that `readOnly` workspaces truly block modifications.

## Approach / solution outline

Enforce at **four points**, covering two independent flows (changes and direct spec writes):

### Flow 1: Change lifecycle

| Guard point                              | What it blocks                                                  |
| ---------------------------------------- | --------------------------------------------------------------- |
| `change create --spec <readOnly:spec>`   | Cannot add a readOnly spec to a new change                      |
| `change edit --add-spec <readOnly:spec>` | Cannot add a readOnly spec to an existing change                |
| `ArchiveChange` use case                 | Cannot merge deltas into specs belonging to readOnly workspaces |

### Flow 2: Direct spec writes

| Guard point                     | What it blocks                                      |
| ------------------------------- | --------------------------------------------------- |
| `SpecRepository.save()`         | Cannot write spec artifacts to a readOnly workspace |
| `SpecRepository.saveMetadata()` | Cannot write spec metadata to a readOnly workspace  |

### Error messages

Errors are **explanatory but not suggestive** — they say what happened and why, but do NOT
suggest changing `specd.yaml` ownership or removing specs from the change. This is deliberate:
an LLM agent reading the error might act on a suggestion and modify config autonomously.

Agreed error formats:

**change create / change edit --add-spec:**

```
Error: Cannot add spec "platform:auth/tokens" to change — workspace "platform" is readOnly.

ReadOnly workspaces are protected: their specs and code cannot be modified by changes.
```

**archive:**

```
Error: Cannot archive change "my-change" — it contains specs from readOnly workspaces:

  - platform:auth/tokens  ->  workspace "platform" (readOnly)

Archiving would write deltas into protected specs.
```

**SpecRepository.save() / saveMetadata():**

```
Error: Cannot write to spec "platform:auth/tokens" — workspace "platform" is readOnly.
```

### Skill-level guards (already done)

The skills `specd-new`, `specd-design`, and `specd-implement` were updated in this
conversation with ownership checks:

- **specd-new** (step 3): runs `config show --format json`, filters out readOnly specs
  before proposing the change
- **specd-design** (step 1b): loads config, blocks if any change spec is readOnly;
  continuous guard against designing artifacts that prescribe changes to readOnly code/specs
- **specd-implement** (step 1b): same config check; continuous guard against writing files
  under readOnly `codeRoot`

These are already committed to both `dev/ai-agents/skills/` and `.claude/skills/`.

### What was explicitly NOT included

- **No guard on `FsChangeRepository.save()`** — changes live in `.specd/changes/`, not in
  the workspace's spec directory. Writing change artifacts is legitimate even if the change
  references readOnly specs (though it shouldn't reach that point with the upstream guards).
- **No guard on `validate`** — validation is a read operation, not a write.
- **No guard on `DraftChange`** — shelve/unshelve operates on the change itself, not on specs.
- **No warning-based approach** — all violations are hard errors, not warnings. If readOnly,
  the operation fails. Period.
- **No "remove spec from change" suggestion in errors** — the change's artifacts likely
  reference the spec, so removing it would break coherence.
- **No "change ownership in specd.yaml" suggestion in errors** — an LLM might act on it.
- **No code-level enforcement for agents writing to `codeRoot`** — there's no specd
  middleware between the agent and the filesystem. Skill instructions are the only guard
  for code writes. Git pre-commit hooks could be a future layer.

## Affected areas

### Domain / Application layer

- `packages/core/src/application/ports/spec-repository.ts` — `save()`, `saveMetadata()` abstract methods
- `packages/core/src/infrastructure/fs/spec-repository.ts` — `FsSpecRepository` implementations
- `packages/core/src/application/ports/repository.ts` — `Repository` base class (has `ownership` getter)
- Domain errors — needs a new error class (e.g. `ReadOnlyWorkspaceError`)

### Use cases (composition layer)

- `packages/core/src/composition/use-cases/create-change.ts` — factory receives ownership
- `packages/core/src/composition/use-cases/archive-change.ts` — must check before merging deltas

### CLI layer

- `packages/cli/src/commands/change/create.ts` — `change create` command
- `packages/cli/src/commands/change/edit.ts` — `change edit` command

### Skills (already updated)

- `dev/ai-agents/skills/specd-new/SKILL.md`
- `dev/ai-agents/skills/specd-design/SKILL.md`
- `dev/ai-agents/skills/specd-implement/SKILL.md`
- `.claude/skills/specd-new/SKILL.md`
- `.claude/skills/specd-design/SKILL.md`
- `.claude/skills/specd-implement/SKILL.md`

## Spec IDs in the change

- `core:core/workspace` — delta: refine ownership semantics to specify enforcement behavior
- `core:core/spec-repository-port` — delta: save/saveMetadata must reject readOnly
- `core:core/archive-change` — delta: archive must reject changes with readOnly specs
- `cli:cli/change-create` — delta: reject --spec targeting readOnly workspace
- `cli:cli/change-edit` — delta: reject --add-spec targeting readOnly workspace
- `core:core/repository-port` — delta: possibly define error class or base guard

## Design decisions

1. **Errors, not warnings** — readOnly is a hard boundary. No "proceed anyway" option.
2. **No resolution hints in error messages** — prevents LLM agents from autonomously
   modifying config to bypass the restriction.
3. **Defense in depth** — enforcement at CLI (user-facing), use case (business logic),
   and repository (infrastructure) levels. Each layer catches different bypass vectors.
4. **`shared` ownership is pass-through** — shared workspaces allow all writes, same as
   owned. The only behavioral difference is tracking via `touchedSharedSpecs` (future).

## Rejected alternatives

- **Warning-based approach** — rejected because a warning doesn't prevent the operation.
  The whole point of readOnly is to prevent writes.
- **Guard on FsChangeRepository** — rejected because change artifacts don't live in the
  workspace's spec directory. Writing to `.specd/changes/` is always legitimate.
- **Guard on validate** — rejected because validation is read-only.
- **Suggesting config changes in errors** — rejected to prevent LLM agents from changing
  ownership autonomously.
- **Suggesting spec removal from change** — rejected because artifacts likely reference
  the spec already.

## Open questions

- Should `CreateChange` use case itself validate ownership, or should it be done only at
  the CLI layer? The spec approach suggests both (CLI for user-facing errors, use case for
  programmatic enforcement), but the current `CreateChange` use case doesn't have access
  to workspace ownership directly — it receives repositories that already carry ownership.
  Need to check the exact flow during design.
- Error class naming: `ReadOnlyWorkspaceError`? `WorkspaceOwnershipError`? Should it be a
  domain error or an application error?

## Key codebase observations

- `ownership` getter exists on `Repository` base class (`packages/core/src/application/ports/repository.ts:62-64`)
- Config loader defaults: `owned` for default workspace, `readOnly` for others (`packages/core/src/infrastructure/fs/config-loader.ts:433`)
- No existing error class for ownership violations — needs to be created
- `FsSpecRepository.save()` at `packages/core/src/infrastructure/fs/spec-repository.ts:165` — writes directly via `writeFileAtomic`
- `FsSpecRepository.saveMetadata()` at `packages/core/src/infrastructure/fs/spec-repository.ts:259` — same pattern
- All use-case factories in `packages/core/src/composition/use-cases/` receive `ownership` in context but none check it
- Only test for ownership is a getter test in `packages/core/test/infrastructure/fs/schema-repository.spec.ts:174-181`

## Conversation flow

1. User asked what restrictions exist for non-owned workspaces
2. I explained the spec's intent (owned/shared/readOnly semantics)
3. User asked what actually enforces it in code
4. I searched and found: nothing enforces it — ownership is stored but never checked
5. User asked where to add enforcement — we discussed guard points
6. I initially proposed guards on FsChangeRepository — user corrected that changes don't
   modify specs directly, only archive does
7. User pointed out SpecRepository.save() is a separate write path from changes
8. User clarified that changes and specs are different flows — both need independent guards
9. We discussed that code-level writes (agent editing files in codeRoot) can't be enforced
   programmatically — only via skill instructions
10. User noted Claude Code hooks are user-level, not project-level — can't distribute them
11. I updated the three skills (new, design, implement) with ownership guards
12. We refined error messages: explanatory but without resolution suggestions
13. User caught that suggesting "change config" would let an LLM change it — removed
14. User caught that suggesting "remove spec from change" is impractical — removed
15. Final error format: just what happened and why, nothing else
16. User approved creating the change
