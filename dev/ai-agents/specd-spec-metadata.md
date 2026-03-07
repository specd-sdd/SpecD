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
   Single-spec mode: the subagent runs Step 1 (freshness check via `specd spec metadata`) and
   may skip if the spec is already fresh.

3. **If all specs:**

   a. Run `specd spec list --metadata-status stale,missing --format json` to get only specs that need updating.
   b. Parse the JSON. For each workspace, collect the spec paths (they come as `workspace:path`).
   If the result is empty (no stale or missing specs), report that all metadata is fresh and stop.
   c. Launch subagents **in parallel batches** — up to 5 concurrent subagents at a time.
   Each subagent receives its own `<spec-id>`. These specs are already known to need updating,
   so subagents skip the freshness check (Step 1) and go directly to Step 2.
   d. After all subagents complete, report a summary:
   - How many specs needed updating (stale + missing)
   - How many were updated successfully
   - Any errors

4. Each subagent uses the Agent tool with:
   - `subagent_type: general-purpose`
   - `model: haiku`
   - The full prompt below, substituting `<spec-id>` with the target spec identifier.
   - When launching from batch mode (all specs), prepend this line to the prompt:
     `BATCH MODE: This spec is already known to be stale/missing. Skip the freshness check in Step 1.`

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

**If launched from batch mode** (the master told you this spec is already stale/missing):
Skip freshness check — treat all files as stale and continue. Mark completed immediately.

**If launched for a single spec:**
Run:
```bash
specd spec metadata <spec-id> --format json
```

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

This returns an array of `{ filename, content }` objects.

Do section-based classification (not free-form role guessing):

- requirements-source: content under `## Requirements` in `spec.md`
- constraints-source: content under `## Constraints` in `spec.md`
- deps-source: content under `## Spec Dependencies` in `spec.md`
- scenarios-source: requirement/scenario blocks in `verify.md`
- ignore: examples, ADRs, pending, and any section not listed above

Mark "Read and classify changed files" completed.

### Step 3 — Count and create per-item tasks

Count named requirements from requirements-source and named scenarios from scenarios-source. Create:

- "Extract metadata fields" (activeForm: "Extracting title, description, keywords, dependsOn, constraints")
- One task per requirement: "Requirement: <name>" (activeForm: "Extracting rules for <name>")
- One task per scenario: "Scenario: <requirement> — <name>" (activeForm: "Extracting scenario <name>")

### Step 4 — Extract

Mark "Extract content" in_progress.

**During extraction (Steps 4a–4c below), do NOT write any file — store everything in memory.
Only Bash commands may write files, and only in the "Single write" step (Step 4d).
Do NOT use the Write tool at any point. You MUST execute the Single write step once extraction is complete.**

#### Metadata fields

Mark "Extract metadata fields" in_progress.
Extract title, description, keywords, dependsOn, constraints, contentHashes into memory.

#### Extraction boundaries (STRICT)

Use ONLY these sources:

- `title`, `description`: from `# ...` and `## Overview` in `spec.md`
- `dependsOn`: ONLY from `## Spec Dependencies` in `spec.md`
- `constraints`: ONLY from `## Constraints` in `spec.md`
- `rules`: ONLY from `## Requirements` in `spec.md`, grouped by each `### Requirement: ...`
- `scenarios`: ONLY from `verify.md` under `## Requirements` / `### Requirement` / `#### Scenario`

Hard exclusions for `rules`:

- Never include content from `## Spec Dependencies`
- Never include content from `## Constraints`
- Never include links to `.../spec.md` as rule entries unless they are part of a normative sentence inside `## Requirements`

Deduplication:

- Remove exact duplicates across all `rules[*].rules`
- Remove any `rules[*].rules` entry that is identical to an entry in `constraints`

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

For each named requirement in requirements-source:

- Mark its task in_progress
- Extract every normative statement as a single plain-text sentence. Preserve named functions, APIs,
  field names, state/enum values, transition graphs, event types and their fields. Strip only
  explanation and rationale. Structural enumerations (tables, valid state lists, transitions) are
  normative — include them.
- Store in memory. Do NOT write to disk.
- Mark its task completed.

#### Scenarios — all at once (in memory only)

Extract all scenarios from scenarios-source in one pass. Store in memory. Do NOT write to disk.
Mark each scenario task in_progress and completed as you process it (for progress visibility only).

**Format rules for scenarios:**

- Flat array: one object per scenario, never one object per requirement with nested scenarios inside.
- Multiple scenarios that verify the same requirement each get their own top-level entry with the
  same `requirement` value repeated — do NOT group them under a shared parent.
- `name` is the scenario title exactly as it appears in the verify file.

#### Single write — only here (Bash only, never the Write tool)

Once ALL extraction is complete, write the full YAML result to a temporary file using Bash:

```bash
cat > /tmp/specd-metadata-tmp.yaml << 'YAMLEOF'
<full .specd-metadata.yaml content>
YAMLEOF
```

Then write it to the spec using Bash:

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

Use this YAML structure exactly:

```yaml
title: '<short name>'
description: >
  <2–3 sentences: what it covers, why it exists, when you need it>
keywords:
  - '<keyword>'
dependsOn:
  - '<workspace:spec/path>'
contentHashes:
  'spec.md': 'sha256:<hex>'
  'verify.md': 'sha256:<hex>'
rules:
  - requirement: '<requirement name>'
    rules:
      - '<normative statement>'
constraints:
  - '<constraint statement>'
scenarios:
  - requirement: '<requirement name>'
    name: '<scenario name>'
    given:
      - '<precondition>'
    when:
      - '<condition>'
    then:
      - '<expected outcome>'
```

## Notes

- contentHashes is always rewritten — never copy from previous version
- If a statement comes from `## Constraints`, it MUST go to `constraints`, never to `rules`
- If a dependency is not in `## Spec Dependencies`, do not add it to `dependsOn`
- Prefer omission over guessing when section ownership is unclear
- Omit constraints if no ## Constraints section exists
- Omit scenarios if no scenarios exist

```

```
````
