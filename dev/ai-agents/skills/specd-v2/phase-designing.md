# Phase A — Designing

Goal: understand the user's intent, author every artifact in the schema's DAG, and
transition to `ready`.

Mark the "Design artifacts" task as `in_progress`.

---

## A.1 Transition to designing (if in drafting)

```bash
node packages/cli/dist/index.js change transition <name> designing
```

## A.1b Discovery conversation

**CRITICAL: Do not start writing artifacts until you understand what the user wants.**

If the user has already explained their intent in detail (in this conversation or via
the change description), summarize your understanding and confirm it before proceeding.

If the intent is vague or minimal, have a discovery conversation. Ask about:

- **What problem are we solving?** What's broken, missing, or could be better?
- **What's the proposed approach?** High-level, not implementation details.
- **What's the scope?** Which areas of the codebase are affected? Which specs exist
  that might need changes? Use the CLI to explore:
  ```bash
  node packages/cli/dist/index.js spec list --format text --summary
  node packages/cli/dist/index.js graph search "<relevant terms>" --specs --limit 10
  ```
- **What code is affected?** Search for symbols and analyze impact on the codebase:
  ```bash
  node packages/cli/dist/index.js graph search "<relevant terms>" --symbols --limit 10
  node packages/cli/dist/index.js graph impact --symbol "<key symbol>" --direction downstream
  ```
  If specific files are already known to change:
  ```bash
  node packages/cli/dist/index.js graph impact --changes <file1> <file2> --format text
  ```
  Use the impact results to surface files, symbols, and risk levels that the user
  might not have considered. This prevents scope surprises during implementation.
- **Are there open questions?** Anything unresolved that might change the direction?

Keep this conversational — don't dump a questionnaire. Ask what you need to understand
the change, then summarize:

> Here's what I understand:
>
> - **Problem:** ...
> - **Approach:** ...
> - **Specs to create/modify:** ...
> - **Affected code:** ... (key files/symbols and risk level from impact analysis)
> - **Open questions:** ...
>
> Does this look right? Anything to add or change before I start writing?

Only proceed to A.2 after the user confirms.

If specIds need updating based on the discovery, look up the correct fully-qualified
ID from `spec list --format text` (the PATH column) and use it:

```bash
node packages/cli/dist/index.js change edit <name> --add-spec <workspace:capability-path>
```

**Never guess spec IDs.** Always verify them against `spec list` output. The format is
always `workspace:capability-path` (e.g. `core:core/config`, not `core/config`).

## A.2 Load schema, context, and hook instructions

First, load the active schema to understand the artifact DAG:

```bash
node packages/cli/dist/index.js schema show --format json
```

This returns:

- `artifacts` — array with `id`, `scope`, `optional`, `requires[]`, `delta`, `format`,
  `description`, `output`, `hasTaskCompletionCheck`
- `workflow` — array with `step`, `requires[]`

The `artifacts` array defines the DAG. Each artifact's `requires` lists which other
artifacts must be `complete` or `skipped` before it can be worked on. The order in the
array is the declaration order — the auto-resolver walks it in this order.

**Create artifact sub-tasks** from the schema. For each artifact in the array, create a
task:

- Subject: `"Write <id>"` (append `" (optional)"` if `optional: true`)
- blockedBy: tasks for each artifact in its `requires` list

Then load context. During designing, load only rules (requirements) — verification
scenarios are not needed yet:

```bash
node packages/cli/dist/index.js change context <name> designing --follow-deps --depth 1 --rules --constraints --format text
node packages/cli/dist/index.js change hook-instruction <name> designing --phase pre --format text
```

Read the context carefully — it contains project-level instructions and included specs.
Follow the pre-hook guidance.

**Note:** If dependencies are added during the artifact loop (via `change deps --add`),
reload the context to pick up the new dependency specs:

```bash
node packages/cli/dist/index.js change context <name> designing --follow-deps --depth 1 --rules --constraints --format text
```

## A.2b Choose review mode

**MANDATORY: You MUST ask the user this question before writing any artifacts.
Do NOT skip this step. Do NOT assume auto-pilot.**

> How would you like to review artifacts as they're written?
>
> 1. **Review each** — pause after every artifact for your feedback before continuing
> 2. **Review key ones** — pause only after artifacts with no `requires` and artifacts
>    with `scope: spec` (these shape everything downstream), auto-continue on the rest
> 3. **Auto-pilot** — write and validate all artifacts without stopping, review at the end

Wait for the user's response. Default to option 1 if the user doesn't have a preference.
Store the choice for the duration of Phase A.

## A.3 Artifact authoring loop

Repeat until all artifacts are `complete` or `skipped`:

### A.3a Check status

```bash
node packages/cli/dist/index.js change status <name> --format json
```

Parse the `artifacts` array. If every artifact has `effectiveStatus` of `complete` or
`skipped`, go to A.4. You can also check `lifecycle.nextArtifact` — if it is `null`,
all artifacts are done.

### A.3b Get the next artifact's instructions

Use `lifecycle.nextArtifact` from the status response to know which artifact is next.
Then fetch its full instructions:

```bash
node packages/cli/dist/index.js change artifact-instruction <name> --format json
```

Auto-resolves the next artifact in the DAG whose `requires` are satisfied. Returns:

- `artifactId` — which artifact to work on
- `rulesPre` — composition rules to apply before writing
- `instruction` — what to write
- `template` — the resolved template content (scaffolding for new artifacts); `null` if
  the artifact has no template. Use for new artifacts; ignore for deltas (use `outlines`).
- `delta` — if non-null, the artifact supports deltas:
  - `formatInstructions` — how to write a delta for this format
  - `domainInstructions` — domain-specific delta guidance
  - `outlines` — structural outline of existing artifacts (for delta targeting)
- `rulesPost` — composition rules to apply after writing

Mark the corresponding artifact sub-task as `in_progress`.

### A.3c Author the artifact

Follow the `instruction` from the previous step. Key decision points:

- **Optional artifact** (`optional: true` in schema): **you MUST ask the user** whether
  this artifact is needed for this change. Explain briefly what the artifact is for
  (from the instruction) and let the user decide. Never skip silently.
  If they agree to skip:

  ```bash
  node packages/cli/dist/index.js change skip-artifact <name> <artifactId>
  ```

- **Delta-capable artifact** (`delta: true` in schema) when `delta.outlines` has entries:
  the spec artifact already exists — write a delta file instead of a new file. Use the
  `formatInstructions` and `outlines` to target existing nodes.

- **New artifact**: write from scratch using the `instruction`. If `template` is
  non-null, use it as the scaffolding structure for the artifact content.

**Order:** rulesPre → instruction + template (+ delta guidance if applicable) → rulesPost.

### A.3d Reconcile scope and dependencies

After writing each artifact, check if the content implies scope or dependency changes.
Each artifact can reveal that the change is bigger than expected.

**1. Discover affected code and specs.** Read the artifact you just wrote and extract
every reference to a system, module, adapter, configuration area, or domain concept.

First, use the code graph to find code that may be affected beyond what the artifact
explicitly mentions:

```bash
node packages/cli/dist/index.js graph search "<key concepts from artifact>" --symbols --limit 10
node packages/cli/dist/index.js graph impact --symbol "<modified symbol>" --direction downstream
```

If the artifact names specific files that will change, run a multi-file impact analysis:

```bash
node packages/cli/dist/index.js graph impact --changes <file1> <file2> --format text
```

Review the impact results — symbols and files flagged as affected may need their own
spec coverage or dependency registration. Surface any HIGH/CRITICAL risk findings to
the user.

Then cross-reference against existing specs:

```bash
node packages/cli/dist/index.js spec list --format text --summary
```

For each area mentioned in the artifact or surfaced by impact analysis, check whether
an existing spec covers it.
If so, determine whether the change **modifies** that spec (needs a delta or specId
addition) or merely **depends on** it (needs a `deps --add`). Present findings to
the user:

> The artifact mentions changes to `<area>`. There is an existing spec
> `<workspace>:<path>` covering this area.
>
> - Should I add it as a **modified spec** (adds specId, requires delta)?
> - Or register it as a **dependency** (for context only)?
> - Or neither?

**2. Check specIds alignment.** If the artifact references specs (new or modified) that
are not in the change's `specIds`, surface them to the user. If yes:

```bash
node packages/cli/dist/index.js change edit <name> --add-spec <workspace>:<path>
```

If the artifact dropped specs that were originally in scope, confirm removal:

```bash
node packages/cli/dist/index.js change edit <name> --remove-spec <workspace>:<path>
```

Always confirm with the user before executing — changing specIds invalidates approvals.

**3. Register declared dependencies.** For every spec that the change depends on (but
does not modify), register it so `CompileContext` can follow it for transitive context:

```bash
node packages/cli/dist/index.js change deps <name> <specId> --add <dep-spec-id>
```

If a dependency points to a spec that doesn't exist and isn't in the change, flag it to
the user — they may need to expand scope or defer to a separate change.

**4. If `change edit` reports `invalidated: true`**, the change was reset to `designing`
and approvals were cleared. Continue the artifact loop normally.

### A.3e Validate

After writing each artifact and reconciling scope, validate the artifact just written:

```bash
node packages/cli/dist/index.js change validate <name> <specId> --artifact <artifactId>
```

Use `--artifact` to validate only the artifact you just wrote — this avoids noise from
unwritten artifacts and gives faster feedback. Run it for each spec in
`change.specIds` if the artifact has `scope: spec`.

If validation fails: read errors, fix the artifact, re-validate. Do not proceed until
the artifact validates.

Mark the artifact sub-task as `completed` when validation passes.

### A.3f Review checkpoint

After validation passes, apply the review mode chosen in A.2b:

- **Review each:** Present the artifact to the user with a summary of what was written.
  Ask:

  > `<artifactId>` is ready. Want to review it, request changes, or continue?
  > Wait for the user's response. If they request changes, apply them and re-validate
  > before moving on.

- **Review key ones:** Pause if the artifact has no `requires` (it's a root artifact
  that shapes everything downstream) or has `scope: spec` (it persists beyond the
  change). For others, show a one-line summary and continue automatically.

- **Auto-pilot:** Show a one-line summary (artifact name + status) and continue
  immediately.

### A.3g Propagate changes to related artifacts

When an artifact is modified after initial validation — whether from user feedback in
the review checkpoint, scope changes in A.3d, or any other reason — check whether the
change affects other artifacts that have already been written:

- **Downstream artifacts** (artifacts whose `requires` include the modified artifact):
  their content may be derived from or depend on the modified artifact. Review each
  downstream artifact that is already `complete` and determine if it needs updating.
  For example, if `proposal` is modified, check `specs`, `design`, and `tasks`.

- **Upstream artifacts** (artifacts that the modified artifact `requires`): the
  modification may reveal that an upstream artifact was incomplete or incorrect.
  For example, if writing `design` reveals that the `proposal` missed an affected
  area, update the proposal.

For each artifact that needs updating:

1. Make the edits
2. Re-validate with `change validate <name> <specId> --artifact <artifactId>`
3. If the update triggers further cascading changes, repeat this check

Do not silently skip this step. If in doubt about whether a change propagates, ask
the user.

### A.3h Loop back to A.3a

## A.4 Pre-ready review with scenarios

Before transitioning, reload context with both rules and scenarios to verify that
the artifacts written during designing are consistent with the full spec context:

```bash
node packages/cli/dist/index.js change context <name> designing --follow-deps --depth 1 --rules --constraints --scenarios --format text
```

Review the artifacts against this context. If any inconsistency is found, fix the
artifact and re-validate before transitioning.

Run a final validation across all specs in the change:

```bash
node packages/cli/dist/index.js change validate <name> --all
```

If any spec fails, fix the artifact and re-run until all pass.

## A.5 Run hooks

```bash
node packages/cli/dist/index.js change run-hooks <name> designing --phase post
```

If hooks fail, fix the issue and re-run.

```bash
node packages/cli/dist/index.js change hook-instruction <name> designing --phase post --format text
```

Follow the guidance there.

## A.6 Transition to ready

```bash
node packages/cli/dist/index.js change hook-instruction <name> ready --phase pre --format text
```

Follow the guidance there.

```bash
node packages/cli/dist/index.js change transition <name> ready --skip-hooks source.post
node packages/cli/dist/index.js change status <name> --format json
```

Mark "Design artifacts" task as `completed`.

**Next:** Read `phase-approval.md` and continue to Phase B.
