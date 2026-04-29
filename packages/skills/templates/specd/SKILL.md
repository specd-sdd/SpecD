# specd — entry point

Read @../\_specd-shared/shared.md before doing anything.

## What this does

Detects the current state of a change and tells you what to do next.
This skill does NOT execute lifecycle phases — it routes to the right skill.

## Steps

### 1. Show project welcome

Gather project info and load project context:

```bash
specd project status --context --graph --format toon
```

**MUST follow** — the project status output contains workspaces (name, prefix, ownership, codeRoot),
specs, changes, graph freshness, and approval gates.

The `context` field contains binding directives (instructions and file references).
Read and absorb them before continuing. If lazy mode returns summary
specs, evaluate and load any that are relevant (see `shared.md` — "Processing `change
context` output").

From the results, **print a welcome block** to the user with the structure defined
in `shared.md`.

If the code graph is stale or not indexed, re-index it in the background:

```bash
specd graph index --format toon
```

### 2. Check for existing changes

If the user DID NOT provide a change name as an argument:

1. Check `changes.active` and `changes.drafts` from the `project status` output.
2. If any exist and `project status` did not include their names/states, list them
   for the user with their current states.

```bash
specd changes list --format toon
specd drafts list --format toon
```

3. Ask the user:

   > Would you like to:
   >
   > - **Continue** an existing change? (select one)
   > - **Explore** something new to create a change? (run `/specd-new`)
   > - **Restore** a draft? (select one)

4. **Stop.** Wait for the user to decide.

If a draft is selected to be restored: `specd drafts restore <name>`.

### 3. Route based on state

If a change name is provided (or once selected), run in **text mode** to see the full
diagnostic context (Artifact DAG, blockers, next action):

```bash
specd changes status <name> --format text
```

**Always prioritize high-visibility blockers.** If the **blockers:** section is not
empty, explain them to the user and suggest following the **next action:** command.

If `review: required: yes` is shown, suggest:

- `/specd-design <name>`

Do NOT suggest implementation, verification, or archive while review is required.

If no review is required, suggest the next skill based on the **next action:** `target`
and `command` recommendation provided by the CLI. Trust the CLI's dynamic routing
over manual state tables.

### 4. Present and stop

Show the user what you found and suggest the next action. **Do NOT invoke skills
automatically** — let the user decide.

## Guardrails

- Do NOT write any code — this skill is read-only for routing
- Do NOT modify any existing files in the codebase
- Do NOT create artifacts — that's handled by other skills
