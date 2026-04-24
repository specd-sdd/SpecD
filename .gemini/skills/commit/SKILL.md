---
name: commit
description: Commit changes following specd Conventional Commits conventions. Use this whenever a git commit needs to be made — it groups the intended changes, crafts the commit message, verifies spec metadata is up to date, and executes the commit. Never run git commit directly; always invoke this skill instead.
allowed-tools: Bash(git *), Bash(node *), Bash(specd *), Read
---

# Agent: Commit

## What this agent does

Prepares and executes a git commit following specd's Conventional Commits conventions.
It first analyzes the current git state to identify the intended change set and warn
about mixed concerns or unexpected staged content. Once the user confirms the commit
message and scope, it regenerates `.specd-metadata.yaml` files for any affected spec
directories, stages the confirmed files, and commits everything together in a single
commit.

## When to run

- When changes are ready to be grouped into a commit, whether or not they are already staged
- The agent handles grouping review, commit message crafting, metadata regeneration, staging,
  and the final commit

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

### Step 4 — Update spec metadata

Only after the user confirms the commit message and the commit scope:

1. Check which specs have stale, missing, or invalid metadata:

   ```
   specd spec list --metadata-status stale,missing,invalid --format json
   ```

2. **Present the list to the user and ask for confirmation.** Show each spec ID and its
   status (stale / missing / invalid), then ask the user which ones to regenerate. The user
   may want to:
   - Regenerate all of them (default)
   - Skip some specs (e.g. ones they plan to update manually later)
   - Add additional specs not in the list (e.g. ones the user knows need refreshing)

   Do not proceed until the user confirms the final list.

3. Regenerate metadata deterministically for all confirmed specs at once:

   ```
   specd spec generate-metadata --all --write --status stale,missing,invalid
   ```

   If the user excluded some specs, run per-spec instead:

   ```
   specd spec generate-metadata <spec-id> --write
   ```

   If `generate-metadata` fails, **do not retry with `--force` automatically**. Instead,
   present the error to the user and ask how to proceed — options include:
   - Re-run with `--force` to overwrite existing metadata
   - Skip this spec and continue with the commit
   - Abort the commit so the user can fix the issue manually

   If the error is due to a missing `metadataExtraction` in the schema, recommend skipping
   and using the `specd-spec-metadata` skill separately after committing.

4. After all regenerations, stage the updated files:
   ```
   git add specs/**/.specd-metadata.yaml
   ```

If no specs are stale/missing/invalid, skip this step entirely.

### Step 5 — Stage the confirmed scope and commit

Before running `git commit`, make sure the index matches the confirmed commit scope:

- If the intended files are not staged yet, stage them now
- If the index contains files outside the confirmed scope, stop and resolve that mismatch
  with the user before committing
- Do not silently commit a broader staged set than the one that was reviewed

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

- Metadata is updated only when a commit is actually going to happen — never on staging alone
- Staging is an implementation detail of the final commit step, not a prerequisite for using this skill
- If the user has already staged `.specd-metadata.yaml`, Step 4 is a no-op for that directory
- The deterministic `generate-metadata` command extracts title, description, dependsOn,
  rules, constraints, scenarios, and contentHashes from the spec's AST — no LLM needed
- For LLM-optimized metadata (keywords, cleaned rules), use the `specd-spec-metadata`
  skill separately after committing
