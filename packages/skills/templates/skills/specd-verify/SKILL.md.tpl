{{{frontmatter}}}

# specd-verify — check implementation against specs

## What this does

Runs through verification scenarios for each spec in the change. If all pass,
transitions to `done`. If any fail, loops back to implementing.

## Steps

### 0. Bootstrap and load shared context

You MUST read @{{sharedFolder}}/shared.md before doing anything, if you can't find it using Glob or Read tools, use Bash tools like `ls` and `cat` to find and read it. If you can't find it at all, tell the user: "Shared context not found. Please ensure shared.md is available." and stop.

### 1. Load change state

```bash
specd changes status <name> --format text
```

Identify any high-visibility blockers from the **blockers:** section (e.g. `ARTIFACT_DRIFT`,
`OVERLAP_CONFLICT`, `REVIEW_REQUIRED`) and inform the user. Follow the **next action:**
command recommendation.

Extract the `path:` field from the "lifecycle:" section.

If the status output shows `review: required: yes`, tell the user:

> Artifacts need review before verification can continue. Run `/specd-design <name>`.

**Stop — do not continue.**

If not in `implementing`, `verifying`, or `done`, this is the wrong skill.
Redirect based on the **next action:** `target` recommendation.

**Stop — do not continue.**

### 2. Enter verification (or resume)

**If in `implementing`** (normal entry from `/specd-implement`):

Run pre-hooks and transition:

```bash
specd changes run-hooks <name> verifying --phase pre
specd changes hook-instruction <name> verifying --phase pre --format text
```

Follow guidance.

```bash
specd changes transition <name> verifying --skip-hooks all
```

If it fails, follow the **Repair Guide** output.

**If in `verifying`** (resuming): run pre-hooks but skip the transition:

```bash
specd changes run-hooks <name> verifying --phase pre
specd changes hook-instruction <name> verifying --phase pre --format text
```

**If in `done`**: skip directly to step 6a (transition to archivable path).

Continue to step 2b.

### 2b. Select verification mode

Ask the user:

> "What verification mode do you want?"
>
> - **Simple** — verify scenarios against implementation.
> - **Full** — simple verification + compliance audit.

Wait for the user's choice. Store it as `verificationMode` (simple or full).

Continue to step 3.

### 3. Load verification context

Use a single-pass context policy: choose one profile before calling `changes context`
and avoid running both profiles in the same verification cycle unless a hard blocker
forces a retry.

Choose one profile:

- `light` (lower token cost): use when verification can run primarily from merged
  scenarios and already-loaded artifacts.
- `full` (higher coverage): use when you already know rules/constraints/dependency
  context will be needed.

`light` profile:

```bash
specd changes context <name> verifying --include-change-specs --scenarios --format text [--fingerprint <stored-value>]
```

`full` profile:

```bash
specd changes context <name> verifying --include-change-specs --follow-deps --depth 1 --rules --constraints --scenarios --format text [--fingerprint <stored-value>]
```

Pass `--fingerprint <stored-value>` if you have a `contextFingerprint` from a previous `changes context` call in this conversation (see `shared.md` — "Fingerprint mechanism"). If output says `unchanged`, use the context already in memory.

**MUST follow** — project context entries are binding directives. If lazy mode returns
summary specs, evaluate each one and load any that are relevant to the scenarios you're
about to verify (see `shared.md` — "Processing `changes context` output").

### 3b. Get merged specs with deltas applied

Use merged spec-scoped artifact content for verification. If the context read(s)
already returned the full merged content needed for the spec-scoped requirement and
scenario artifacts, use that output. If context is still incomplete (summaries/metadata
only or missing required merged details), if raw deltas are the only artifact content
you have, or if overlap/drift/stale-base risk exists, use `spec-preview` to get the
final merged spec-scoped artifacts with deltas applied:

```bash
specd changes spec-preview <name> <specId> --format toon
```

If you only need one merged spec-scoped artifact, prefer:

```bash
specd changes spec-preview <name> <specId> --artifact <artifactId> --format toon
```

This merged view is what you should verify against. Raw delta inspection alone is not
equivalent to merged preview review.

### 4. Verify each scenario

For each spec in the change, read the merged spec content from step 3b. Then verify
each scenario against:

1. The **merged spec-scoped content** (from `changes context` when it returned the
   needed full merged content, otherwise from `spec-preview`)
2. The **verification scenarios** in the merged scenario-bearing artifact

For each scenario:

- Inspect the implementation code
- Run relevant tests if applicable
- Confirm GIVEN/WHEN/THEN conditions are satisfied using the merged spec content

### 5. Run exit hooks — immediately after last scenario verified

The moment all scenarios have been evaluated, run the post-verifying hooks:

```bash
specd changes run-hooks <name> verifying --phase post
specd changes hook-instruction <name> verifying --phase post --format text
```

Follow guidance. If hooks fail, fix and re-run.

### 5b. Compliance audit (full mode only)

**Only if `verificationMode` is `full`:** run the compliance audit now, before any
state transition or results display.

Execute the `specd-compliance` skill for the current change: `/specd-compliance --change <name>`

Obtain the audit results and store them. They will be presented together with the
verification results in step 6.

**If `verificationMode` is `simple`:** skip this step entirely.

Continue to step 6.

### 6. Report results and transition

Present verification findings to the user.

**If in `full` mode:** also present the audit results from step 5b alongside the
verification findings. If the audit identified issues, ALWAYS ask the user what to do
next. Provide these options:

- 1. **"Update Specs"** — if audit identified spec-level issues or drift: `/specd-design <name>`
- 2. **"Fix Implementation"** — if audit identified code or test gaps: `/specd-implement <name>`
- 3. **"Both"** — run `/specd-design <name>` FIRST, then `/specd-implement <name>`
- 4. **"Proceed"** — audit is clean or issues dismissed, continue with the standard workflow

If there was no issues, ask only if they want to proceed to transition or review the results again. Provide these options:

- 1. **"Proceed"** — continue with the standard workflow
- 2. **"Review Results"** — review the verification findings again

You MUST NOT proceed automatically; the user must explicitly choose.

**If any scenarios fail:**

First classify the failure:

- **Implementation-only failure** —artifacts still correct
- **Artifact review required** — desired behavior changed or artifacts wrong

Before choosing a transition, reload status:

```bash
specd changes status <name> --format text
```

If the fresh status shows `review: required: yes`, do NOT route back to
`implementing`. Tell the user to run `/specd-design <name>` and **stop**.

If this is an implementation-only failure:

```bash
specd changes transition <name> implementing --skip-hooks all
```

Tell the user to run `/specd-implement <name>` to fix the implementation. **Stop.**

If this is artifact review required:

```bash
specd changes transition <name> designing --skip-hooks all
```

Tell the user to run `/specd-design <name>` to update them. **Stop.**

**If all pass:** transition through `done` and the signoff gate to reach `archivable`.

#### 6a. Transition to done

Run done pre-hooks, then transition:

```bash
specd changes run-hooks <name> done --phase pre
specd changes hook-instruction <name> done --phase pre --format text
```

Follow guidance.

```bash
specd changes transition <name> done --skip-hooks all
```

Run done post-hooks:

```bash
specd changes run-hooks <name> done --phase post
specd changes hook-instruction <name> done --phase post --format text
```

#### 6b. Handle signoff gate

Run `changes status <name> --format text` and check `approvals:` line.

**If signoff=off:** no signoff needed — run archivable hooks and transition:

```bash
specd changes run-hooks <name> archivable --phase pre
specd changes hook-instruction <name> archivable --phase pre --format text
```

Follow guidance.

```bash
specd changes transition <name> archivable --skip-hooks all
```

```bash
specd changes run-hooks <name> archivable --phase post
specd changes hook-instruction <name> archivable --phase post --format text
```

**If signoff=on:** transition routes to `pending-signoff`. Tell user:

> Signoff required. Run: `specd changes approve signoff <name> --reason "..."`
> Then: `/specd-archive <name>`

**Stop.**
Do not invoke `/specd-archive` automatically; wait for explicit user confirmation.

## Session tasks

1. `Load state & hooks`
2. `Select verification mode (simple/full)`
3. `Load verification context`
4. For each spec: `Verify: <specId>`
5. `Run exit hooks`
   5b. `Compliance audit` (full mode only)
6. `Report results & transition`

## Handling failed transitions

When `changes transition` fails, it renders a **Repair Guide** in text mode.
Follow the recommended repair command based on the target recommendation.

**Stop — do not continue after redirecting.**

## Returning to design

If during verification you discover that the artifacts need revision, stop and explain.
If the user agrees:

```bash
specd changes transition <name> designing --skip-hooks all
```

> Artifacts need revision. Run `/specd-design <name>` to update them.

**Stop — do not continue verifying.**

## Guardrails

- Verify against scenarios from the compiled context
- Run actual tests where applicable
- Any time a fresh `changes status` shows `review: required: yes`, stop
  verification and redirect to `/specd-design <name>`
- ALWAYS ask the user for the next action when full-mode audit finds issues
