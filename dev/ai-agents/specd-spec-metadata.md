# Skill: Spec Metadata Generator

> Temporary working document. Final location TBD.

## What this skill does

Generates or updates the `.specd-metadata.yaml` file for one or all specs by launching Haiku subagents to do the extraction work. Uses `specd` CLI commands for all spec access and writes.

## Instructions

When this skill is invoked:

1. **Determine scope.** If the user already provided a specific spec (as argument, in conversation, or as a path), use that. Otherwise, ask:

   > Which specs should I generate metadata for?
   >
   > - **All specs** — process every spec across all workspaces
   > - **A specific spec** — provide a spec identifier (e.g. `core:config`, `auth/login`) or path (e.g. `specs/core/change/`)

2. **If a specific spec:**

   a. If the input contains a **colon** (e.g. `core:archive-change`), it is already a
   qualified spec ID — use it directly as `<spec-id>`.
   b. **Otherwise** — even if it looks like `core/change` or `specs/core/change` — you MUST
   run `specd spec resolve-path` to get the correct spec ID. **Never** convert slashes to
   colons yourself. Run:

   ```bash
   specd spec resolve-path <input> --format json
   ```

   The command returns `{ workspace, specPath, specId }`. Use the returned `specId` as
   `<spec-id>`. If the command fails, tell the user the path could not be resolved.
   c. Launch a single subagent (see "Subagent prompt" below) with `<spec-id>` substituted.

3. **If all specs:**

   a. Run `specd spec list --format json` to get every spec across all workspaces.
   b. Parse the JSON. For each workspace, collect the spec paths (they come as `workspace:path`).
   c. Launch subagents **in parallel batches** — up to 5 concurrent subagents at a time.
   Each subagent receives its own `<spec-id>`.
   d. After all subagents complete, report a summary:
   - How many specs were processed
   - How many were already fresh (skipped)
   - How many were updated
   - Any errors

4. Each subagent uses the Agent tool with:
   - `subagent_type: general-purpose`
   - `model: haiku`
   - The full prompt below, substituting `<spec-id>` with the target spec identifier.

5. The subagents use `specd` CLI commands — they do not access the filesystem directly for spec content.

## Subagent prompt

````
You are updating the .specd-metadata.yaml file for spec <spec-id>.

IMPORTANT: Use `specd` CLI commands for all spec reads and writes. Do NOT access spec files
directly via the filesystem. All Bash commands that invoke `specd` must run from the project
root directory.

Follow these steps exactly:

### Step 0 — Create top-level progress tasks

Create these tasks using TaskCreate before doing any other work:
- "Check content freshness" (activeForm: "Checking content freshness")
- "Read and classify changed files" (activeForm: "Reading changed files")
- "Extract content" (activeForm: "Extracting rules and scenarios")
- "Write .specd-metadata.yaml" (activeForm: "Writing metadata")

Mark each in_progress when you start it and completed when done. Skip = complete immediately.

### Step 1 — Check what needs updating

Mark "Check content freshness" in_progress.

Run:
```bash
specd spec metadata <spec-id> --format json
````

Parse the JSON response. If `fresh` is `true` → mark all tasks completed and stop. No update needed.

If the command fails (spec has no metadata yet), treat all files as stale and continue.

For each entry in `contentHashes`, note whether `fresh` is `true` or `false`:

- `false` → re-extract all fields derived from that file
- `true` → keep existing values, skip re-extraction

Mark "Check content freshness" completed.

### Step 2 — Read and classify changed files

Mark "Read and classify changed files" in_progress.

Get the spec content:

```bash
specd spec show <spec-id> --format json
```

This returns an array of `{ filename, content }` objects. For each file whose hash was stale
(or all files if no prior metadata), determine its role from the content:

- rules — requirement definitions, normative prose, constraints, field definitions, state machines
- scenarios — WHEN/THEN verification scenarios
- both — contains both
- ignore — auxiliary content (examples, ADRs, diagrams)

Mark "Read and classify changed files" completed.

### Step 3 — Count and create per-item tasks

Count named requirements across all rules/both files and named scenarios across all scenarios/both files. Create:

- "Extract metadata fields" (activeForm: "Extracting title, description, keywords, dependsOn, constraints")
- One task per requirement: "Requirement: <name>" (activeForm: "Extracting rules for <name>")
- One task per scenario: "Scenario: <requirement> — <name>" (activeForm: "Extracting scenario <name>")

### Step 4 — Extract

Mark "Extract content" in_progress.

**DO NOT write any file during extraction. The Write tool and Bash write commands must not be
called until the single write step below. Only TaskUpdate calls are allowed during extraction.**

#### Metadata fields

Mark "Extract metadata fields" in_progress.
Extract title, description, keywords, dependsOn, constraints, contentHashes into memory.

For `dependsOn`: the `## Spec Dependencies` section in `spec.md` lists dependencies as relative
markdown links (e.g. `[...](../../_global/architecture/spec.md)`). To get workspace-qualified IDs:

1. Extract the relative path from each markdown link.
2. Resolve it to a project-relative filesystem path. The spec lives at `specs/<spec-id with / separators>/`,
   so a link like `../../_global/architecture/spec.md` from `specs/core/archive-change/spec.md`
   resolves to `specs/_global/architecture/spec.md`, i.e. directory `specs/_global/architecture`.
3. Run `specd spec resolve-path <resolved-dir> --format json` for each dependency.
4. Use the returned `specId` (e.g. `default:_global/architecture`) in the `dependsOn` list.

For contentHashes, compute them from the artifact content returned by `specd spec show`:

```bash
echo -n '<file-content>' | shasum -a 256
```

For `description`: write 2–3 sentences aimed at a reader (human or AI agent) deciding whether
this spec is relevant to their task. Answer: what does this spec cover, why does it exist in the
system, and when would you need to read it? Avoid dictionary-style openings ("X is a Y that..."),
passive constructions ("this spec defines..."), and pure structural descriptions. Write as if
recommending the spec to a colleague.

Mark "Extract metadata fields" completed.

#### Rules — one requirement at a time (in memory only)

For each named requirement in rules/both files:

- Mark its task in_progress
- Extract every normative statement as a single plain-text sentence. Preserve named functions, APIs,
  field names, state/enum values, transition graphs, event types and their fields. Strip only
  explanation and rationale. Structural enumerations (tables, valid state lists, transitions) are
  normative — include them.
- Store in memory. Do NOT write to disk.
- Mark its task completed.

#### Scenarios — all at once (in memory only)

Extract all scenarios from scenarios/both files in one pass. Store in memory. Do NOT write to disk.
Mark each scenario task in_progress and completed as you process it (for progress visibility only).

**Format rules for scenarios:**

- Flat array: one object per scenario, never one object per requirement with nested scenarios inside.
- Multiple scenarios that verify the same requirement each get their own top-level entry with the
  same `requirement` value repeated — do NOT group them under a shared parent.
- `name` is the scenario title exactly as it appears in the verify file.

#### Single write — only here

Once ALL extraction is complete, write the full YAML result to a temporary file:

```bash
cat > /tmp/specd-metadata-tmp.yaml << 'YAMLEOF'
<full .specd-metadata.yaml content>
YAMLEOF
```

Then write it to the spec:

```bash
specd spec write-metadata <spec-id> --force --input /tmp/specd-metadata-tmp.yaml
```

Clean up the temp file:

```bash
rm /tmp/specd-metadata-tmp.yaml
```

Mark "Extract content" completed.

### Step 5 — Finalize

Mark "Write .specd-metadata.yaml" completed.

## YAML quoting rules

Always quote every string value that appears as a list item or a scalar field value. Use single
quotes unless the value contains a single quote, in which case use double quotes.

These characters break YAML when unquoted and MUST trigger quoting:

- `: ` (colon followed by space) anywhere in the string
- `#` preceded by a space
- Leading `{`, `[`, `>`, `|`, `!`, `&`, `*`, `?`
- Strings starting with a digit that look like numbers or dates

When in doubt — quote it. Over-quoting is never a bug; under-quoting breaks the file.

## Output format

title: <short name>
description: >
<2–3 sentences: what it covers, why it exists, when you need it — written for discovery, not documentation>
keywords:

- <keyword>
  dependsOn:
- <spec-path>
  contentHashes:
    spec.md: 'sha256:<hex>'
    verify.md: 'sha256:<hex>'
  rules:
- requirement: <requirement name>
  rules: - <normative statement, plain text>
  constraints:
- <constraint statement, plain text>
  scenarios:
- requirement: <requirement name>
  name: <scenario name>
  given:
  - <precondition>
    when:
  - <condition>
    then:
  - <expected outcome>

## Notes

- contentHashes is always rewritten — never copy from previous version
- When in doubt about a dependency or keyword, include it
- constraints are invariants — if in doubt, put in rules
- Omit constraints if no ## Constraints section exists
- Omit scenarios if no scenarios exist

```

```
