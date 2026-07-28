---
name: commit
description: Commit changes following specd Conventional Commits conventions. Use this whenever a git commit needs to be made — it groups the intended changes, crafts the commit message, and executes the commit. Never run git commit directly; always invoke this skill instead.
allowed-tools: Bash(git *), Bash(node *), Bash(specd *), Read
---

# Agent: Commit

## What this agent does

Prepares and executes a git commit following specd's Conventional Commits conventions.
It first analyzes the current git state to identify the intended change set and warn
about mixed concerns or unexpected staged content. Once the user confirms the commit
message and scope, it stages the confirmed files and commits them in a single commit.

## When to run

- When changes are ready to be grouped into a commit, whether or not they are already staged
- The agent handles grouping review, commit message crafting, staging, and the final commit

---

## Instructions

When this agent is invoked:

### Step 1 — Read the commits spec

Read both files in full before doing anything else:

- `specs/_global/commits/spec.md`
- `specs/_global/commits/verify.md`

These are the binding constraints for every commit. Apply every rule and constraint
found there throughout the rest of the steps. Do not rely on any prior knowledge of
commit conventions — use only what you read from these files.

### Step 2 — Inspect the current change set

Run the following in sequence:

```
git status
git diff --name-only
git diff
git diff --staged --name-only
git diff --staged
```

From the output, identify:

- Which files are unstaged
- Which files are already staged
- Which spec directories are affected — a spec directory is any directory that contains
  a `spec.md` or `verify.md` file
- Whether the visible changes span unrelated concerns (apply the granularity requirement
  you read in Step 1)

If the changes clearly touch unrelated concerns, warn the user and propose splitting
into separate commits before continuing.

If anything is already staged, call that out explicitly before proceeding:

- show which files are staged
- show which relevant files are still unstaged, if any
- ask the user whether the staged set is the intended commit scope or whether you should
  stage a different subset before committing

If nothing is staged, do **not** stop automatically. Treat the working tree diff as the
candidate commit scope and continue the grouping review from there.

Before moving to Step 3, summarize the proposed commit scope in plain language and get
the user's confirmation that this is the set of changes that should become the commit.

### Step 3 — Craft the commit message

Using the confirmed commit scope and the rules you read in Step 1, draft a commit message that
satisfies every requirement and constraint in `specs/_global/commits/spec.md`.

Present the proposed commit message to the user and ask for confirmation before proceeding.

### Step 4 — Stage the confirmed scope and commit

Before running `git commit`, make sure the index matches the confirmed commit scope:

- If the intended files are not staged yet, stage them now
- If the index contains files outside the confirmed scope, stop and resolve that mismatch
  with the user before committing
- Do not silently commit a broader staged set than the one that was reviewed
- Do **not** stage gitignored metadata cache files (`.specd/metadata/**` or legacy
  `specs/**/.specd-metadata.yaml` sidecars). Deterministic metadata is a self-healing
  cache; it is not part of the commit payload.

Once the index matches the confirmed scope, execute:

```
SPECD_COMMIT=1 git commit -m "$(cat <<'EOF'
<confirmed message>
EOF
)"
```

After the commit completes, run `git status` to confirm the working tree is clean.

---

## Notes

- Staging is an implementation detail of the final commit step, not a prerequisite for using this skill
- Spec metadata under `.specd/metadata/` is gitignored and self-heals on read. The commit flow
  does not regenerate or stage metadata cache files.
- Optional cache warming: if the user explicitly requests a metadata rebuild, run
  `specd specs generate-metadata` (or per-spec variants). Its outputs are not commit
  prerequisites and must not be staged as part of the commit.
- For LLM-optimized context (keywords, compressed rules/constraints), use the specialized
  optimizer agents only when the effective project configuration has `llmOptimizedContext: true`:
  - `specd-spec-context-optimizer` — per-spec optimization
  - `specd-project-context-optimizer` — project-level context optimization
    When `llmOptimizedContext` is not `true`, do not invoke optimizer agents or persist
    optimized fields as part of the commit workflow.
- Optimized fields are persisted via `specd specs optimizations set`; that is separate from
  the commit workflow and is not a commit prerequisite.
