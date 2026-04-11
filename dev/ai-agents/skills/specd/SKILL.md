---
name: specd
description: Entry point for specd — detects change state and suggests the next skill to invoke.
allowed-tools: Bash(node *), Read
argument-hint: '[change-name] or leave empty to list/create'
---

# specd — entry point

Read `.specd/skills/shared.md` before doing anything.

## What this does

Detects the current state of a change and tells you what to do next.
This skill does NOT execute lifecycle phases — it routes to the right skill.

## Steps

### 1. Read shared notes and show project welcome

```
Read .specd/skills/shared.md
```

Then gather project info and load project context:

```bash
specd config show --format json
specd spec list --format json --summary
specd change list --format json
specd drafts list --format json
specd project context --format text
specd graph stats --format json
```

**MUST follow** — the project context output contains binding directives (instructions
and file content). Read and absorb them before continuing. If lazy mode returns summary
specs, evaluate and load any that are relevant (see `shared.md` — "Processing `change
context` output").

**Workspace locality rule — mandatory.** Workspaces marked external (`isExternal: true`)
still belong to the project's workspace model even when their code lives outside the
current git root. Treat them as valid investigation targets.

- Read **specs** through specd CLI commands only (`project context`, `change context`,
  `spec list`, `spec show`, `change spec-preview`, etc.). Do NOT inspect specs directly from
  `specsPath`, whether local or external.
- Read **code** directly from a workspace's `codeRoot` when you need implementation
  context, impact analysis, or architecture understanding, even if that `codeRoot`
  is outside the current git root.
- `isExternal` affects location, not permissions. It does not block reads and does
  not grant writes.
- `ownership` governs writes. `readOnly` means no writes; `owned` and `shared` may
  be writable depending on the active workflow and scope.

From the results, **print a welcome block** to the user with this structure:

```text
# specd

**Schema:** <schemaRef>
**Workspaces:** <name> (<specCount> specs), <name> (<specCount> specs), ...
**Active changes:** <count> — <name> (<state>), ...
**Drafts:** <count> (or "none")
**Code graph:** <"fresh" if stale=false, "stale" if stale=true,
                 "not indexed" if command failed or no data>

> **Context:** <summarize the `context` entries from config — for `instruction` entries
> show a one-line digest of the instruction text; for `file` entries show the filename>
```

Keep it compact — no more than 8-10 lines. Omit sections that are empty (e.g. skip
"Drafts" if there are none). The user cannot see tool output directly, so you MUST
print this yourself.

If the code graph is stale or not indexed, re-index it in the background:

```bash
specd graph index --format json
```

Do not wait for completion before continuing — indexing can take a few seconds and
subsequent skills will benefit from a fresh graph. If `graph stats` failed (graph
never indexed), run `graph index` to bootstrap it.

### 2. Check for existing changes

```bash
specd change list --format json
specd drafts list --format json
```

- If changes or drafts exist: show them with their states and ask the user
  what they want to do — continue one, start something new, or just talk.
- If a draft is selected: `specd drafts restore <name>`

### 3. Route based on state

If the user provided a change name, or selected one from the list:

```bash
specd change status <name> --format json
```

Read `state` and `review` from the response.

If `review.required` is `true`, this change has artifacts or files that must be
reviewed before any other skill continues. Summarize `review.reason` and
`review.affectedArtifacts`, then suggest:

- `/specd-design <name>`

Do NOT suggest implementation, verification, or archive while review is required.

If `review.required` is `false`, suggest the next skill based on `state`:

| State                   | Suggest                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `drafting`              | `/specd-design <name>`                                                                             |
| `designing`             | `/specd-design <name>`                                                                             |
| `ready`                 | Review artifacts, then `/specd-design <name>` to continue or `/specd-implement <name>` if approved |
| `pending-spec-approval` | "Approval pending. Run: `specd change approve spec <name> --reason ...`"                           |
| `spec-approved`         | `/specd-implement <name>`                                                                          |
| `implementing`          | `/specd-implement <name>`                                                                          |
| `verifying`             | `/specd-verify <name>`                                                                             |
| `done`                  | `/specd-verify <name>` (verify handles the done→archivable transition)                             |
| `pending-signoff`       | "Signoff pending. Run: `specd change approve signoff <name> --reason ...`"                         |
| `signed-off`            | `/specd-verify <name>` (verify handles the signed-off→archivable transition)                       |
| `archivable`            | `/specd-archive <name>`                                                                            |

If no changes exist (or the user wants something new):

- If the user has a **clear intent** (described in arguments or conversation):
  → `/specd-new` to create a change
- If the intent is **vague or they want to explore first**:
  → Have a conversation. Ask what they're thinking about, investigate the codebase,
  surface relevant specs. When the picture is clearer, suggest `/specd-new`.
- If the user **just wants to talk** about the project, understand the codebase,
  or think through an idea: that's fine — be a thinking partner. No change needed yet.

### 4. Present and stop

Show the user what you found and suggest the next action. **Do NOT invoke skills
automatically** — let the user decide.
