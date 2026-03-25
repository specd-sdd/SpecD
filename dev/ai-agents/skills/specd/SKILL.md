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
node packages/cli/dist/index.js config show --format json
node packages/cli/dist/index.js spec list --format json --summary
node packages/cli/dist/index.js change list --format json
node packages/cli/dist/index.js drafts list --format json
node packages/cli/dist/index.js project context --format text
```

**MUST follow** — the project context output contains binding directives (instructions
and file content). Read and absorb them before continuing. If lazy mode returns summary
specs, evaluate and load any that are relevant (see `shared.md` — "Processing `change
context` output").

From the results, **print a welcome block** to the user with this structure:

```
# specd

**Schema:** <schemaRef>
**Workspaces:** <name> (<specCount> specs), <name> (<specCount> specs), ...
**Active changes:** <count> — <name> (<state>), ...
**Drafts:** <count> (or "none")

> **Context:** <summarize the `context` entries from config — for `instruction` entries
> show a one-line digest of the instruction text; for `file` entries show the filename>
```

Keep it compact — no more than 8-10 lines. Omit sections that are empty (e.g. skip
"Drafts" if there are none). The user cannot see tool output directly, so you MUST
print this yourself.

### 2. Check for existing changes

```bash
node packages/cli/dist/index.js change list --format json
node packages/cli/dist/index.js drafts list --format json
```

- If changes or drafts exist: show them with their states and ask the user
  what they want to do — continue one, start something new, or just talk.
- If a draft is selected: `node packages/cli/dist/index.js drafts restore <name>`

### 3. Route based on state

If the user provided a change name, or selected one from the list:

```bash
node packages/cli/dist/index.js change status <name> --format json
```

Read `state` and suggest the next skill:

| State                   | Suggest                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `drafting`              | `/specd-design <name>`                                                                             |
| `designing`             | `/specd-design <name>`                                                                             |
| `ready`                 | Review artifacts, then `/specd-design <name>` to continue or `/specd-implement <name>` if approved |
| `pending-spec-approval` | "Approval pending. Run: `specd change approve spec <name> --reason ...`"                           |
| `spec-approved`         | `/specd-implement <name>`                                                                          |
| `implementing`          | `/specd-implement <name>`                                                                          |
| `verifying`             | `/specd-verify <name>`                                                                             |
| `done`                  | `/specd-archive <name>` (handles signoff gate internally)                                          |
| `pending-signoff`       | "Signoff pending. Run: `specd change approve signoff <name> --reason ...`"                         |
| `signed-off`            | `/specd-archive <name>`                                                                            |
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
