---
name: specd-new
description: Explore what the user wants to do and create a new specd change when ready.
allowed-tools: Bash(node *), Read, Grep, Glob, Agent, TaskCreate, TaskUpdate
argument-hint: '[description of what you want to do]'
---

# specd-new — discover and create

Read `.specd/skills/shared.md` before doing anything.

## What this does

Explores what the user wants to accomplish, surfaces affected specs, and creates a
change when the picture is clear. Does NOT write any artifacts — that's `/specd-design`.

## Steps

### 1. Understand intent

**Do NOT immediately ask for a name, description, or specIds.**

- If the user explained clearly (in arguments or prior messages): summarize and confirm.
- If vague: have a conversation. Ask what you need to understand:
  - What problem are they solving?
  - What's the approach?
  - What areas of the codebase are affected?

Investigate the codebase if relevant:

```bash
node packages/cli/dist/index.js spec list --format text --summary
```

Surface existing specs that might be affected. Let the conversation develop naturally.

### 2. Propose the change

When the picture is clear enough:

> Based on our discussion:
>
> - **Name:** `<kebab-case-slug>`
> - **Description:** `<one-liner>`
> - **Initial specs:** `<workspace:path>, ...` (or none yet — we can add them during design)
>
> Want me to create this change?

Wait for confirmation.

### 3. Create

```bash
node packages/cli/dist/index.js change create <name> --spec <workspace:path> --description "<desc>" --format json
```

The response includes `changePath` — the directory where artifacts will be written.

If `change create` fails with `Change '<name>' already exists`, the change is already
in progress. Load its status and redirect:

```bash
node packages/cli/dist/index.js change status <name> --format json
```

Suggest based on state:

| State                                                    | Suggest                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------ |
| `drafting` / `designing`                                 | `/specd-design <name>`                                                   |
| `ready`                                                  | Review artifacts, then `/specd-implement <name>` if approved             |
| `implementing` / `spec-approved`                         | `/specd-implement <name>`                                                |
| `verifying`                                              | `/specd-verify <name>`                                                   |
| `done` / `pending-signoff` / `signed-off` / `archivable` | `/specd-archive <name>`                                                  |
| `pending-spec-approval`                                  | "Approval pending. Run: `specd change approve spec <name> --reason ...`" |

**Stop — do not continue.**

### 4. Run entry hooks

```bash
node packages/cli/dist/index.js change hook-instruction <name> drafting --phase pre --format text
```

Follow guidance if any.

### 5. Show status and stop

```bash
node packages/cli/dist/index.js change status <name> --format json
```

Show the change state and suggest next step:

> Change `<name>` created at `<changePath>`.
> Run `/specd-design <name>` to start writing artifacts.

**Stop here.** Do not start writing artifacts.

## Session tasks

Create tasks at the start for session visibility. Update them as you go.

1. `Understand intent` — mark done after confirming what the user wants
2. `Propose change` — mark done after user confirms name/description/specs
3. `Create change` — mark done after CLI creates the change successfully

## Guardrails

- Do NOT create artifacts — that's `/specd-design`
- Do NOT skip the discovery conversation to rush to creation
- Spec IDs must be `workspace:capability-path` — look up from `spec list`, never guess
- It's fine to create with no specs — they can be added during design
- For new specs, ask the user which workspace they belong to
