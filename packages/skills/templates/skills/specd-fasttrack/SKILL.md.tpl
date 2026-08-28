{{{frontmatter}}}

# specd-fasttrack — code-first implementation & consolidation

## What this does

Use this workflow for a code-first feature, bugfix, or spike: explore and implement with
the user first, then consolidate the evidence into specd design artifacts. It does not
replace the normal design, approval, verification, or archive lifecycle.

The durable record is `<changePath>/.specd-exploration.md`. It must make an interrupted
session resumable without reconstructing work from memory, `git diff`, commits, resets,
or discarded work.

## Activation boundary

This is a manual-only workflow. Use `/specd-fasttrack` only when the user explicitly
invokes it. Never select or invoke this skill for normal specd work; use `/specd` and its
normal lifecycle skills instead.

## 0. Bootstrap

Read @{{sharedFolder}}/shared.md before doing anything. Then load project context and
the configured project/workspace context-spec scope:

```bash
specd project status --context --format toon
specd project context-specs --format toon
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

If the user DID NOT specify a change name:
1. List active changes:
```bash
specd changes list --format toon
```
2. Ask the user:
> Would you like to use an existing active change or create a new one for this fast-track session?

3. If creating a new change, create it without pre-assigning specs and start tracking:
```bash
specd changes create <name>
specd changes implementation start <name>
```

4. If selecting an existing named change, inspect its status and start tracking:
```bash
specd changes status <name> --format text
specd changes implementation start <name>
```

Create `<changePath>/.specd-exploration.md` if it does not exist using the following exact structure.

**CRITICAL RULE:** You MUST copy the `> **MANDATORY DIRECTIVES FOR \`/specd-design\`**:` block below **VERBATIM (EXACTLY AS-IS)** into the header of `<changePath>/.specd-exploration.md`. Do NOT summarize, alter, or omit any of the 9 numbered directives.

```markdown
# Fast-track Journal: <name>

> **MANDATORY DIRECTIVES FOR `/specd-design`**:
> When generating change artifacts during the design phase:
> 1. **Primary Implementation Scope (Tracked Links)**:
>    - Do NOT rely solely on `git diff` (intermediate commits might have occurred during the session).
>    - You MUST inspect the tracked implementation files and confirmed links via `specd changes implementation list <name>` and `specd changes implementation review <name> --format toon` as the authoritative scope of code modifications.
> 2. **Spec Evaluation & Selection**: Critically evaluate the suggested specs under `## Suggested Specs for Design` or search the workspace specs to find better-fitting alternatives (or determine if a brand-new capability spec is required). Register the final, optimal set of specs via `specd changes edit <name> --add-spec <spec-id>`.
> 3. **Proposal artifact**: Transcribe the motivation, root cause, and agreed solution into the formal proposal document.
> 4. **Specification & Verification artifacts (or deltas)**: Formalize the behavior into normative requirements and verification scenarios according to the schema instructions. Incorporate any broken/modified contracts identified below.
> 5. **Design / Architecture artifact**: Document the concrete architecture, touched files/symbols from the tracked implementation links, and technical choices.
> 6. **Task-bearing artifact (`[hasTasks]`)**:
>    - **DO NOT start tasks from scratch.** The fast-track journal explicitly lists all tasks that have already been implemented and verified during this session under `## Completed Work`.
>    - You MUST carry over all items from **Completed Work** below and generate them in the task-bearing artifact **already marked as completed (`- [x]`)**, following the artifact's instructions and template.
>    - Carry over all items from **Pending Work & Gaps** into the task-bearing artifact **marked as open/pending (`- [ ]`)**, following the artifact's instructions and template.
>    - Preserve the task metadata and structure required by the schema (e.g. file, symbol, approach, and requirement mapping).
>    - This ensures the task artifact accurately preserves the full audit trail of what was built during the fast-track session alongside any remaining polish/tests.
> 7. **Completeness, Edge Cases & Omissions (Capture what was left out)**:
>    - The fast-track session focused on the primary solution. The design skill MUST critically identify any omitted edge cases, boundary conditions, error handling paths, or missing unit/integration tests.
>    - Add new verification scenarios for these edge cases into the verification artifact.
>    - Add concrete follow-up tasks into the task-bearing artifact marked as pending/open tasks.
> 8. **Codebase-Wide Adoption & Affected Areas (MUST)**:
>    - You MUST investigate if other parts of the codebase should adopt, reuse, or be updated to use this new feature, capability, refactor, or fix (e.g. eliminating duplicated logic, replacing legacy call patterns, or standardizing behavior across packages/workspaces).
>    - Search the codebase (`specd graph search`, grep) for adoption candidates.
>    - Include concrete adoption/migration tasks in the task-bearing artifact and document them in the design artifact.
> 9. **Blast Radius & Downstream Regression Search (MUST)**:
>    - You MUST run code graph impact analysis (`specd graph impact`) on all tracked files and symbols to identify callers or modules across the codebase that could suffer side effects or regressions.
>    - Ensure any affected downstream areas have corresponding regression test tasks and design mitigations documented.

## Motivation & Problem
- Summary of the problem or spike goal explored in Step 1.

## Approaches Explored & Agreed Strategy
- Approach chosen and reasons why alternatives were discarded.

## Suggested Specs for Design
<!-- Discovered during exploration; the design skill must critically evaluate these suggestions or search for better-fitting specs before registering via specd changes edit <name> --add-spec -->
- `<workspace:spec-id>` (suggested: modified / new)

## Spec Contracts & Impact Analysis
<!-- Record specs read and any contracts modified or broken -->
### Active Specs Inspected
- `<workspace:spec-id>`

### Broken or Modified Contracts (if any)
<!-- e.g. `<workspace:spec-id>`: Requirement: <name> — previous behavior vs new behavior and why -->
- None yet.

## Codebase Adoption & Affected Areas (Initial Findings)
<!-- Other places in the codebase noted during exploration that might need or adopt this change -->
- Areas identified to adopt this change:
- Downstream affected modules:

## Decisions & Code Actions
<!-- Append in real-time as code is modified (files touched, symbols modified, rationale) -->

## Consolidation & Audit (Pending)
```

## 3. Discover governing contracts continuously

Before modifying or investigating code, discover the governing specs and dependencies.
First run file impact and inspect its `coveringSpecs` result. It is the evidence-backed
answer for which specs currently cover the target file; it may be empty, so never assume
that a workspace has applicable specs. Use the workspace roots in `project status` to
identify the workspace that owns a target file. Then use `project context-specs` to add
project and workspace candidates that are relevant to the planned change; each candidate
ID encodes its workspace as `<workspace>:<spec-id>`. Load every applicable covering or
context candidate with compiled spec context—do not use `specs resolve-path` solely for
this discovery. `specs context` is the only allowed spec-reading surface in this workflow;
never use `specs show`.

```bash
specd graph impact --file "<workspace:path>" --direction dependents --format toon
specd project context-specs --workspace <workspace> --format toon
specd specs context <workspace:spec-id> --follow-deps --format text
specd graph impact --symbol "<name>" --direction dependents --format toon
specd graph search "<keyword>" --specs --format toon
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

Append each audit finding immediately under the live journal rule. Then append the final
`Consolidation & Audit Summary` section into `<changePath>/.specd-exploration.md`:

```markdown
## Consolidation & Audit Summary

### 1. Root Cause & Solution Summary
- Summary of the problem, root cause, and how it was resolved in code.

### 2. Tracked Implementation Summary
- Files and symbols confirmed tracked in implementation links.

### 3. Suggested Specs for Design (Final Review)
- `<workspace:spec-id>`: <reason why it is affected or if it is a new spec to create>

### 4. Spec Contract Impact Summary
- Specs confirmed compliant vs. specs requiring delta modifications.

### 5. Codebase Adoption & Propagation Candidates (MUST Check in Design)
- Other files/modules identified that should adopt this change or feature.

### 6. Completed Work (Tasks already implemented & verified)
- Detail each concrete task that was already implemented, debugged, and verified during this fast-track session (with file, symbol, applied approach, and requirement mapping).
- These tasks MUST be generated directly as marked completed (`- [x]`) by `/specd-design` in the task-bearing artifact.

### 7. Pending Work & Gaps (Tasks remaining to be done)
- Pending task description with file, symbol, suggested approach, and requirement mapping (to be generated as pending in the task artifact according to its instructions).
- Additional unit/integration tests or refactors required.
- Tasks for propagating adoption to other modules if applicable.

### 8. Spec & Verification Guidance
- Normative requirements for specification artifacts (or deltas).
- Verification scenarios for verification artifacts (or deltas).
```

## 6. Hand-off and explicit stop

**MANDATORY STOP RULES**:
- **Do NOT create, write, or populate formal schema artifacts in this skill.**
- **Do NOT autonomously invoke, launch, or execute `/specd-design`.**
- **You MUST ask the user and wait for their explicit response.**

Present a concise summary to the user:
- What was implemented.
- Tracked implementation files and symbols confirmed.
- Suggested specs identified during exploration.
- Specs inspected and contract impact (whether any contracts were broken/modified).
- Potential adoption candidates or affected areas noted.
- Summary of completed work vs. pending gaps found in the audit.
- Ask the confirmation question:

> **Fast-track exploration consolidated in `.specd-exploration.md`!**
> 
> - **Implemented**: <summary of code changes>
> - **Tracked Links**: <summary of files/symbols tracked>
> - **Suggested Specs**: <list of suggested specs for design>
> - **Specs & Contracts**: <specs checked / contract changes noted>
> - **Codebase Adoption**: <adoption candidates or affected areas identified>
> - **Audit findings**: <completed items vs. pending gaps>
> 
> Would you like to proceed with `/specd-design <name>` now to generate the formal change artifacts, or would you like to continue coding/reviewing?

**STOP — End your turn here. Wait for the user's explicit decision before continuing.**
