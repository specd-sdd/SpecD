# specd-new — discover and create

Read @shared.md before doing anything.

## What this does

Explores what the user wants to accomplish, surfaces affected specs, and creates a
change when the picture is clear. Does NOT write any artifacts — that's `/specd-design`.

## Steps

### 1. Load project context

```bash
specd project context --format text
```

**MUST follow** — project context entries are binding directives. If lazy mode returns
summary specs, evaluate and load any that are relevant to the work ahead
(see `shared.md` — "Processing `change context` output").

**Workspace locality rule — mandatory.** External workspaces are still part of the
project for discovery work.

- Read **specs** through specd CLI commands only. Do NOT inspect specs directly from
  `specsPath`, whether the workspace is local or external.
- Read **code** directly from a workspace's `codeRoot` when you need to understand
  current behavior, dependencies, or likely impact, even if that `codeRoot` lives
  outside the current git root.
- `isExternal` does not change permissions; it only tells you the workspace lives
  outside the current repository root.
- `ownership` controls writes, not reads. `readOnly` workspaces may still be inspected
  for context.

### 2. Understand intent

**Do NOT immediately ask for a name, description, or specIds.**

- If the user explained clearly (in arguments or prior messages): summarize and confirm.
- If vague: have a conversation. Ask what you need to understand:
  - What problem are they solving?
  - What's the approach?
  - What areas of the codebase are affected?

Investigate the codebase if relevant:

```bash
specd specs list --format text --summary
```

Surface existing specs that might be affected. Let the conversation develop naturally.

When a likely affected workspace is external, inspect its code via `codeRoot` the same
way you would inspect local workspace code. Do not skip it just because it lives in a
different repository directory.

#### Use code graph for deeper investigation

When the user describes affected areas, use graph search to find related symbols and specs:

```bash
specd graph search "<keyword>" --format toon
```

If the user mentions specific files or symbols, check their impact to understand scope:

```bash
specd graph impact --file "<workspace:path>" --direction both --format toon
specd graph impact --symbol "<name>" --direction both --format toon
```

This helps you surface specs and code areas the user may not have considered. If `riskLevel`
is HIGH or CRITICAL, mention it — it affects how many specs should be in scope.

### 3. Propose the change

When the picture is clear enough, first check workspace ownership:

```bash
specd project status --format toon
```

From the response, build a map of each workspace's `ownership` from the `workspaces` array. For each spec you're
about to propose, determine which workspace it belongs to.

**If any proposed spec belongs to a `readOnly` workspace**, do NOT include it. Tell the user:

> `<workspace:spec-path>` belongs to workspace `<workspace>` which is `readOnly` —
> it can't be modified by a change. Want to use it as context instead, or change
> the workspace ownership in `specd.yaml`?

Only propose specs from `owned` or `shared` workspaces:

> Based on our discussion:
>
> - **Name:** `<kebab-case-slug>`
> - **Description:** `<one-liner>`
> - **Initial specs:** `<workspace:path>, ...` (or none yet — we can add them during design)
>
> Want me to create this change?

Wait for confirmation.

### 4. Create

```bash
specd changes create <name> --spec <workspace:path> --description "<desc>" --format toon
```

The response includes `changePath` — the directory where artifacts will be written.

If `change create` fails with `Change '<name>' already exists`, the change is already
in progress. Load its status in **text mode** for diagnostics and **toon mode** for extraction:

```bash
specd changes status <name> --format text
specd changes status <name> --format toon
```

Read `state`, `blockers`, `nextAction`, and `review` from the response.

**Always prioritize high-visibility blockers.** If `blockers` is not empty,
identify which ones are blocking progress (e.g. `ARTIFACT_DRIFT`, `OVERLAP_CONFLICT`,
`REVIEW_REQUIRED`) and inform the user. Follow the `nextAction.command`
recommendation.

If `review.required` is `true`, suggest `/specd-design <name>` regardless of
the lifecycle state. Summarize `review.reason` and `review.affectedArtifacts`,
then stop.

If `review.required` is `false`, suggest based on `nextAction.targetStep`:

| targetStep                       | Suggest                                                                     |
| -------------------------------- | --------------------------------------------------------------------------- |
| `drafting` / `designing`         | `/specd-design <name>`                                                      |
| `ready`                          | Review artifacts, then `/specd-implement <name>` if approved                |
| `implementing` / `spec-approved` | `/specd-implement <name>`                                                   |
| `verifying`                      | `/specd-verify <name>`                                                      |
| `done` / `signed-off`            | `/specd-verify <name>` (handles done→archivable transition)                 |
| `pending-signoff`                | "Signoff pending. Run: `specd changes approve signoff <name> --reason ...`" |
| `archivable`                     | `/specd-archive <name>`                                                     |
| `pending-spec-approval`          | "Approval pending. Run: `specd changes approve spec <name> --reason ...`"   |

**Stop — do not continue.**

### 5. Run entry hooks

```bash
specd changes run-hooks <name> drafting --phase pre
specd changes hook-instruction <name> drafting --phase pre --format text
```

Follow guidance if any.

### 6. Register known spec dependencies

If during the discovery conversation you identified dependencies between the specs in the
change (or between them and existing specs), register them now:

```bash
specd changes deps <name> <specId> --add <depId> --add <depId>
```

This is optional at this stage — dependencies can also be registered later during
`/specd-design` when the proposal is written. But if the conversation already surfaced
clear dependencies, registering them early means the context compilation will be richer
from the start.

### 7. Save exploration context

Write a file `.specd-exploration.md` inside the change directory (`<changePath>/.specd-exploration.md`).
This file is your own working memory — it must capture **everything** you learned during
the discovery conversation so that `/specd-design` can pick up exactly where you left off,
even in a brand-new conversation with zero prior context.

**Save everything.** Re-read the entire conversation from the beginning and capture every
single piece of information that was discussed, no matter how minor it seems. If it came
up in the conversation, it goes in the file. Nothing is too small — a passing thought,
a tangential issue the user mentioned, a "maybe we should also…", a concern, a rejected
idea and _why_ it was rejected. The goal is that someone reading this file with zero
context can reconstruct the full picture of the conversation.

Include at minimum:

- **Problem statement** — what the user wants to achieve and why
- **Approach / solution outline** — how the user wants to solve it (architecture, strategy)
- **Affected areas** — packages, modules, files, specs discussed
- **Spec IDs** — specs attached to the change and any others mentioned as relevant
- **Design decisions** — anything the user confirmed, rejected, or constrained
- **Agreements reached** — explicit or implicit agreements about how things should work,
  naming, behavior, scope boundaries, sequencing, or any other commitment made during
  the conversation
- **Steps / plan defined** — if the user outlined or agreed to specific implementation
  steps, phases, or ordering, capture them exactly as discussed
- **Rejected alternatives** — ideas that were considered and discarded, with reasons
- **Open questions** — anything still unresolved that `/specd-design` should clarify
- **Key codebase observations** — relevant findings from your investigation (file paths,
  existing patterns, current behavior) that will inform artifact writing
- **User preferences** — any stated preferences about scope, approach, or priorities
- **Tangential topics** — anything the user mentioned that's not directly part of the
  change but was discussed (related issues, future ideas, concerns, complaints, bugs
  noticed in passing, things to watch out for)
- **Conversation flow** — brief chronological summary of how the discussion evolved,
  so you can understand not just _what_ was decided but _how_ you got there

**Staleness awareness.** Time may pass between exploration and design — code may change,
specs may be renamed or removed, and decisions may no longer apply. To help the future
reader judge freshness:

- Include **concrete anchors**: file paths, spec IDs, function names, line numbers when
  relevant. These are verifiable — the reader can check if they still exist.
- Note **why** each decision was made, not just what was decided. Reasons age better than
  conclusions — if the reason still holds, the decision likely does too.
- Timestamp the file (add a `Generated: YYYY-MM-DD` line at the top).

Write it in plain markdown, structured for quick scanning. This is for agent use, not
user documentation — optimize for completeness and precision over polish. When in doubt
about whether to include something: include it.

### 8. Run exit hooks

```bash
specd changes run-hooks <name> drafting --phase post
specd changes hook-instruction <name> drafting --phase post --format text
```

Follow guidance if any.

### 9. Show status and stop

```bash
specd changes status <name> --format text
specd changes status <name> --format toon
```

Show the change state and suggest next step:

> Change `<name>` created at `<changePath>`.
> Run `/specd-design <name>` to start writing artifacts.

**Stop here.** Do not start writing artifacts.

## Session tasks

Create tasks at the start for session visibility. Update them as you go.

1. `Load project context` — mark done after step 1
2. `Understand intent` — mark done after confirming what the user wants
3. `Propose change` — mark done after user confirms name/description/specs
4. `Create change` — mark done after CLI creates the change successfully
5. `Save exploration context` — mark done after writing `<changePath>/.specd-exploration.md`

## Guardrails

- Do NOT write any code — this skill is for discovery and change creation only
- Do NOT modify any existing files in the codebase
- Do NOT create artifacts — that's `/specd-design`
- Do NOT skip the discovery conversation to rush to creation
- Spec IDs must be `workspace:capability-path` — look up from `spec list`, never guess
- It's fine to create with no specs — they can be added during design
- For new specs, ask the user which workspace they belong to
