{{{frontmatter}}}

# specd-fasttrack — code-first implementation & consolidation

## What this does

Use this workflow for a code-first feature, bugfix, or spike: explore and implement with
the user first, then consolidate the evidence into specd design artifacts. It does not
replace the normal design, approval, verification, or archive lifecycle.

The durable record is `<changePath>/.specd-exploration.md`. It must make an interrupted
session resumable without reconstructing work from memory, `git diff`, commits, resets,
or discarded work.

## 0. Bootstrap

Read @{{sharedFolder}}/shared.md before doing anything. Then load project context:

```bash
specd project context --format text
```

{{#if capabilities.mcp}}
When an MCP-backed project workflow or connector is available, prefer it for the work it
exposes; retain the CLI commands below as the portable record of the workflow.
{{/if}}

## 1. Align on intent and an initial approach

Understand the requested outcome, summarize it when already supplied, and discuss two or
three viable approaches with their compatibility, complexity, and blast-radius tradeoffs.
Use the graph and specs to ground the choice:

```bash
specd specs list --format text --summary
specd graph search "<keyword>" --specs --format toon
```

Record the agreed approach and rejected alternatives in the journal before starting the
next meaningful action.

## 2. Select or create an unscoped change

If no change was named, list active changes and ask whether to use one or create a new
one. Create a new fast-track change without pre-assigning specs:

```bash
specd changes create <name>
specd changes implementation start <name>
```

For an existing named change, inspect its status and start implementation tracking:

```bash
specd changes status <name> --format text
specd changes implementation start <name>
```

Create `<changePath>/.specd-exploration.md` if it does not exist. It must include the
following sections: Motivation & Problem; Approaches Explored & Agreed Strategy;
Suggested Specs for Design; Spec Contracts & Impact Analysis (including inspected and
modified contracts); Codebase Adoption & Affected Areas; Decisions & Code Actions; and
Consolidation & Audit.

At the top, direct `/specd-design` to use `specd changes implementation list <name>` and
`specd changes implementation review <name> --format toon` as the authority for completed
work, rather than relying only on a Git diff. It must evaluate suggested specs, preserve
completed and pending work in formal tasks, investigate omitted edge cases and adoption,
and perform the downstream impact analysis.

## 3. Discover governing contracts continuously

Before modifying or investigating code, discover the governing specs and dependencies:

```bash
specd graph impact --file "<workspace:path>" --direction dependents --format toon
specd graph impact --symbol "<name>" --direction dependents --format toon
specd graph search "<keyword>" --specs --format toon
specd specs show <workspace:spec-id> --format text
```

Append each scope or contract finding to the journal immediately. For an intentional
contract change, record the exact requirement, old behavior, new behavior, and reason
under `Spec Contracts & Impact Analysis` before proceeding.

## 4. Implement with a live, append-only journal

Work with the user to inspect, edit, debug, and test code. Register every changed file
or stable symbol as soon as it is modified:

```bash
specd changes implementation add <name> --spec <suggested-spec-id> --file <path> --symbol <symbol-name>
```

**Mandatory live journal rule:** before moving to the next meaningful action, append an
entry to `Decisions & Code Actions` after **every** decision, scope or contract finding,
source edit, implementation-link update, test or debugging action/result, and audit
result. Each entry records the action or finding, why it happened, and affected files or
symbols; test/debug entries also record the command or observation and result. Record
actions even when code is later committed, reset, paused, or discarded. A final audit or
consolidation summary supplements these incremental entries and can never replace them.

{{#if capabilities.agents}}
When independent work can be safely parallelized, delegate bounded investigations or
non-overlapping edits, then journal each delegated result and update its implementation
links before relying on it.
{{/if}}

Protect existing contracts. If a proposed change cannot be reconciled with a governing
spec, record the conflict and obtain the user's direction rather than silently changing
the contract.

## 5. Consolidate and audit

When the implementation is ready to formalize, inspect the recorded scope:

```bash
specd changes implementation review <name> --format toon
specd changes implementation list <name> --format text
git status --short
```

Append each audit finding immediately under the live journal rule. Then add a
`Consolidation & Audit Summary` that covers: root cause and solution; tracked files and
symbols; final suggested specs; contract impact; adoption candidates; completed work with
file/symbol/requirement mapping; pending gaps; and specification and verification guidance.

## 6. Hand-off and explicit stop

Do not create, write, or populate formal schema artifacts in this skill. Do not invoke
`/specd-design` autonomously. Summarize the consolidated implementation, tracked links,
suggested specs and contract impact, adoption candidates, completed work, and pending gaps.
Ask whether the user wants to proceed with `/specd-design <name>` or continue coding or
reviewing, then stop and wait for the explicit response.
