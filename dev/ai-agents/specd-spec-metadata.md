---
description: 'Skill: Spec Metadata Generator'
allowed-tools: Bash(node *), Bash(cat *), Bash(rm *), Bash(shasum *), Read, Agent
---

# Skill: Spec Metadata Generator

Generates or updates `.specd-metadata.yaml` files by launching subagents for extraction and writing the results from the main thread.

## Architecture

Subagents **only extract** — they read spec content, compute hashes, resolve dependencies, and return the full YAML as their result string. They **never write files**. The main orchestrator receives the YAML from each subagent and writes it via `spec write-metadata`.

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
   run `spec resolve-path` to get the correct spec ID. **Never** convert slashes to
   colons yourself. Run:

   ```bash
   node packages/cli/dist/index.js spec resolve-path <input> --format json
   ```

   The command returns `{ workspace, specPath, specId }`. Use the returned `specId` as
   `<spec-id>`. If the command fails, tell the user the path could not be resolved.
   c. Launch a single extractor subagent (see "Subagent prompt" below) with `<spec-id>` substituted.
   Single-spec mode: the subagent runs the freshness check and may return `FRESH` if the spec
   is already up to date.

3. **If all specs:**

   a. Run:

   ```bash
   node packages/cli/dist/index.js spec list --metadata-status stale,missing,invalid --format json
   ```

   b. Parse the JSON. For each workspace, collect the spec IDs.
   If the result is empty (no stale, missing, or invalid specs), report that all metadata is fresh and stop.
   c. Launch extractor subagents **in parallel batches** — up to 5 concurrent subagents at a time.
   Each subagent receives its own `<spec-id>`. Prepend `BATCH MODE:` to the prompt for batch specs.
   d. As each subagent completes, **write its result** (see "Writing results" below).
   e. After all subagents complete, report a summary.

4. Each subagent uses the Agent tool with:
   - `subagent_type: general-purpose`
   - The full extractor prompt below, substituting `<spec-id>`.

5. **Regeneration policy (only when needed).**
   - If metadata is fresh **and** passes semantic quality checks, do not rewrite (`FRESH`).
   - If metadata is stale but semantic quality is good, regenerate with minimal churn (preserve semantic fields when possible, update `contentHashes`).
   - If semantic quality fails, force full regeneration of semantic fields (`keywords`, `rules`, `constraints`, `scenarios`).

## Writing results (main thread only)

When a subagent returns:

- If its result is `FRESH` — skip, the spec is already up to date.
- If its result starts with `ERROR:` — log the error and continue.
- Otherwise, the result is the full YAML content. Before writing, enforce a quality gate:
  - Run this gate on every non-`FRESH` result, including stale specs.

  - Must be YAML mapping syntax (no top-level JSON `{ ... }` wrapper)
  - Must include `title`, `description`, `keywords`, `contentHashes`, `rules`
  - `keywords` must be a non-empty YAML list
  - `keywords` must contain 4-8 concrete domain tags; reject obvious generic filler terms (`each`, `may`, `project`, `contain`, `thing`, `misc`)
  - `rules[*].rules` must not contain formatting artifacts or example scaffolding (tree glyphs like `├──`/`└──`, Markdown table rows, raw YAML example keys like `title:`/`dependsOn:`/`contentHashes:`, or field docs like `**\`title\`\*\*`)
  - If `## Spec Dependencies` in `spec.md` has entries, `dependsOn` must be present and non-empty

  If any check fails, regenerate once with a forced prompt prefix:
  `FORCE FULL REGEN: previous output failed quality gate.`
  If it fails again, treat it as `ERROR:` and continue.

  If checks pass, write it:

```bash
cat > /tmp/specd-metadata-<safe-name>.yaml << 'YAMLEOF'
<yaml content from subagent>
YAMLEOF
node packages/cli/dist/index.js spec write-metadata <spec-id> --force --input /tmp/specd-metadata-<safe-name>.yaml
node packages/cli/dist/index.js spec metadata <spec-id> --format json
rm /tmp/specd-metadata-<safe-name>.yaml
```

Where `<safe-name>` is the spec ID with colons and slashes replaced by hyphens.
After writing, `spec metadata` output must show non-empty `keywords` and non-empty `contentHashes`.
If it does not, log `ERROR:` for that spec.

## Extractor subagent prompt

````
You are extracting metadata for spec <spec-id>. Your job is to read the spec content, extract
structured metadata, and return the complete YAML as your final message. Do NOT write any files.

IMPORTANT: Use `node packages/cli/dist/index.js` instead of `specd` for all CLI commands.
All Bash commands must run from the project root directory.

Follow these steps exactly:

### Step 1 — Check freshness (single-spec mode only)

**If BATCH MODE** (the prompt starts with "BATCH MODE:"):
Skip — treat all files as stale.

**Otherwise:**
Run:
```bash
node packages/cli/dist/index.js spec metadata <spec-id> --format json
```

If `fresh` is `true`, evaluate existing metadata quality from command output:
- `keywords` has 4-8 items, no generic filler tags
- `rules[*].rules` has no formatting artifacts (tree glyphs, table rows, YAML example keys, field-doc lines)
- rules are requirement statements, not snippets copied from examples

If freshness and quality both pass → return the single word `FRESH` and stop.
If freshness passes but quality fails → continue extraction and force semantic regeneration.
If the command fails (no metadata yet), treat all files as stale.

### Step 2 — Read spec content

```bash
node packages/cli/dist/index.js spec show <spec-id> --format json
```

This returns an array of `{ filename, content }` objects.

Classify sections:
- requirements-source: content under `## Requirements` in `spec.md`
- constraints-source: content under `## Constraints` in `spec.md`
- deps-source: content under `## Spec Dependencies` in `spec.md`
- scenarios-source: requirement/scenario blocks in `verify.md`
- ignore: examples, ADRs, pending, everything else

### Step 3 — Compute content hashes

For each file returned by `spec show`, compute its SHA-256:
```bash
node packages/cli/dist/index.js spec show <spec-id> --format json | node -e "
const crypto = require('crypto');
let input = '';
process.stdin.on('data', d => input += d);
process.stdin.on('end', () => {
  const data = JSON.parse(input);
  for (const f of data) {
    const hash = crypto.createHash('sha256').update(f.content).digest('hex');
    console.log(f.filename + ': sha256:' + hash);
  }
});
"
```

### Step 4 — Resolve dependencies

Extract dependencies from `## Spec Dependencies` using BOTH formats:

- Markdown links: `- [text](../path/spec.md)`
- Plain text bullets: `- core:core/config` or `- specs/_global/architecture/spec.md`

For each dependency candidate:

1. Normalize by removing bullet markers and trailing explanatory text after ` — ` or ` - `.
2. If it is already a qualified spec ID (`workspace:capability/path`), keep as-is.
3. Otherwise resolve it via:
```bash
node packages/cli/dist/index.js spec resolve-path <resolved-dir> --format json
```
Use the returned `specId` in the `dependsOn` list.
4. Deduplicate while preserving order.

If `## Spec Dependencies` is `_none` / `_none — ...`, omit `dependsOn`.
If it has entries and none can be resolved, return `ERROR:` instead of silently omitting.

### Step 5 — Extract metadata

#### Extraction boundaries (STRICT)

Use ONLY these sources:

- `title`, `description`: from `# ...` and `## Overview` in `spec.md`
- `keywords`: derive from `title`, `## Overview`, and `## Requirements` in `spec.md`
- `dependsOn`: ONLY from `## Spec Dependencies` in `spec.md`
- `constraints`: ONLY from `## Constraints` in `spec.md`
- `rules`: ONLY from `## Requirements` in `spec.md`, grouped by each `### Requirement: ...`
- `scenarios`: ONLY from `verify.md` under `## Requirements` / `### Requirement` / `#### Scenario`

Hard exclusions for `rules`:

- Never include content from `## Spec Dependencies`
- Never include content from `## Constraints`
- Never include links to `.../spec.md` as rule entries unless part of a normative sentence in `## Requirements`
- Never include raw Markdown table rows (`| ... |`) as list items in `rules` or `constraints`
- If normative information appears in a table, convert to plain-language sentences (no pipe syntax)
- Never include example-only scaffolding lines (`title:`, `description:`, `dependsOn:`, `contentHashes:`, `rules:`, `constraints:`, `scenarios:`)
- Never include filesystem tree-art lines (`├──`, `└──`, `│`)
- Never include field reference docs (`**\`field\`** ...`) as rules

Deduplication:

- Remove exact duplicates across all `rules[*].rules`
- Remove any `rules[*].rules` entry identical to an entry in `constraints`
- Remove table separator rows and formatting-only lines
- Remove example scaffolding and tree-art lines

For `description`: write 2–3 sentences aimed at a reader deciding whether this spec is relevant.
Answer: what does this spec cover, why does it exist, and when would you need it? Avoid
dictionary-style openings, passive constructions, and structural descriptions.

#### Rules

For each named requirement: extract every normative statement as a single plain-text sentence.
Preserve named functions, APIs, field names, state/enum values, transitions. Strip explanation
and rationale. Convert tables to standalone sentence units.

#### Scenarios

Flat array, one object per scenario. `name` is the exact scenario title from the verify file.
Multiple scenarios for the same requirement each get their own entry.

#### Keywords

`keywords` is REQUIRED. Generate 4-8 lowercase hyphenated tags that help retrieval.
Use concrete domain terms (commands, use cases, concepts), not generic words.
No duplicates.

### Step 6 — Return the YAML

Compose the complete YAML and return it as your final message. The YAML must be the ONLY content
in your final message — no explanation, no markdown fences, just raw YAML.

## YAML quoting rules

Always quote every string value with single quotes. Use double quotes only when the value contains
a single quote.
Use canonical YAML list style (`- item`) and mapping style (`key: value`) only.
Do NOT return JSON-compatible inline structures (`[ ... ]`, `{ ... }`) as the document format.

## Output format

```yaml
title: '<short name>'
description: >
  <2–3 sentences>
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
- `keywords` is mandatory; never omit it
- Prefer omission over guessing when section ownership is unclear
- Omit constraints if no `## Constraints` section exists
- Omit scenarios if no scenarios exist
````
