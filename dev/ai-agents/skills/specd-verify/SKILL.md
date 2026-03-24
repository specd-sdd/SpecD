---
name: specd-verify
description: Verify a specd change's implementation against spec scenarios.
allowed-tools: Bash(node *), Bash(pnpm *), Read, Grep, Glob
argument-hint: '<change-name>'
---

# specd-verify — check implementation against specs

Read `.claude/skills/specd-v3/shared.md` before doing anything.

## What this does

Runs through verification scenarios for each spec in the change. If all pass,
transitions to `done`. If any fail, loops back to implementing.

## Steps

### 1. Load change state

```bash
node packages/cli/dist/index.js change status <name> --format json
```

If not in `verifying`, this is the wrong skill — suggest the right one.

Store `lifecycle.changePath` and `specIds` from the response.

### 2. Run entry hooks

```bash
node packages/cli/dist/index.js change hook-instruction <name> verifying --phase pre --format text
```

Follow guidance.

### 3. Load verification context

```bash
node packages/cli/dist/index.js change context <name> verifying --follow-deps --depth 1 --scenarios --format text
```

### 4. Verify each scenario

For each spec in the change, read its verification scenarios. For each scenario:

- Inspect the implementation code
- Run relevant tests if applicable
- Confirm GIVEN/WHEN/THEN conditions are satisfied

### 5. Report results

Present findings to the user:

> **Verification results for `<name>`:**
>
> | Spec | Scenario | Result    |
> | ---- | -------- | --------- |
> | ...  | ...      | PASS/FAIL |
>
> N/M scenarios pass.

### 6. Transition

Run exit hooks:

```bash
node packages/cli/dist/index.js change run-hooks <name> verifying --phase post
node packages/cli/dist/index.js change hook-instruction <name> verifying --phase post --format text
```

**If all pass:**

```bash
node packages/cli/dist/index.js change transition <name> done
```

Suggest: `/specd-archive <name>`

**If any fail:**

```bash
node packages/cli/dist/index.js change transition <name> implementing
```

Tell the user which scenarios failed and suggest:

> Some scenarios failed. Run `/specd-implement <name>` to fix.

**Stop.**

## Guardrails

- Verify against scenarios from the compiled context, not from memory
- Run actual tests where applicable — don't just inspect code
- Report each failing scenario with specifics so the user can fix it
