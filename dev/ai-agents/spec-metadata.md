# Skill: Spec Metadata Generator

> Temporary working document. Final location TBD.

## What this skill does

Generates or updates the `.specd-metadata.yaml` file for a spec directory by launching a Haiku subagent to do the extraction work.

## Instructions

When this skill is invoked:

1. Ask the user for the spec directory path if not already provided (e.g. `specs/core/change/`).

2. Launch a subagent using the Task tool with:
   - `subagent_type: general-purpose`
   - `model: haiku`
   - The full prompt below, substituting `<spec-dir>` and `<project-root>` with the actual paths.

3. The subagent has Write access — it will create or update `.specd-metadata.yaml` directly.

## Subagent prompt

```
You are updating the .specd-metadata.yaml file for the spec directory at <spec-dir>.

Follow these steps exactly:

### Step 0 — Create top-level progress tasks

Create these tasks using TaskCreate before doing any other work:
- "Check content hashes" (activeForm: "Checking content hashes")
- "Read and classify changed files" (activeForm: "Reading changed files")
- "Extract content" (activeForm: "Extracting rules and scenarios")
- "Write .specd-metadata.yaml" (activeForm: "Writing metadata")

Mark each in_progress when you start it and completed when done. Skip = complete immediately.

### Step 1 — Check what needs updating

Mark "Check content hashes" in_progress.

1. List all files in <spec-dir>, excluding .specd-metadata.yaml itself.
2. Read the existing .specd-metadata.yaml if it exists.
3. Compute SHA-256 hash of each file: shasum -a 256 <file>
4. Compare each hash against contentHashes in the existing metadata.

If all hashes match → mark all tasks completed and stop. No update needed.

For each file note whether its hash changed:
- Changed → re-extract all fields derived from that file
- Unchanged → keep existing values, skip re-extraction

Mark "Check content hashes" completed.

### Step 2 — Read and classify changed files

Mark "Read and classify changed files" in_progress.

Read only the files whose hash changed. For each, determine its role:
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

**DO NOT write any file during extraction. The Write tool must not be called until the single
write step below. Only TaskUpdate calls are allowed during extraction.**

#### Metadata fields

Mark "Extract metadata fields" in_progress.
Extract title, description, keywords, dependsOn, constraints, contentHashes into memory.
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

#### Single write — only here

Once ALL extraction is complete, call Write exactly once to create .specd-metadata.yaml.tmp with
the full result (metadata fields + rules + scenarios).

Mark "Extract content" completed.

### Step 5 — Finalize

Mark "Write .specd-metadata.yaml" in_progress.

The .specd-metadata.yaml.tmp is already complete. Preserve fields from unchanged files by merging
them in: read the existing .specd-metadata.yaml, take any field not present in the tmp file, and
prepend it. Then rename:

  mv <spec-dir>/.specd-metadata.yaml.tmp <spec-dir>/.specd-metadata.yaml

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
  <one or two sentence summary>
keywords:
  - <keyword>
dependsOn:
  - <spec-path>
contentHashes:
  spec.md: 'sha256:<hex>'
  verify.md: 'sha256:<hex>'
rules:
  - requirement: <requirement name>
    rules:
      - <normative statement, plain text>
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
