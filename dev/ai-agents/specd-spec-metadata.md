---
description: 'Skill: Spec Metadata Generator'
allowed-tools: Bash(node *), Bash(cat *), Bash(rm *), Bash(shasum *), Read, Agent
---

# Skill: Spec Metadata Generator

Generates or updates `.specd-metadata.yaml` files in two steps:

1. **Deterministic extraction** — `spec generate-metadata` extracts raw metadata from artifact ASTs via schema-declared `metadataExtraction` rules. Produces `title`, `description`, `dependsOn`, `rules`, `constraints`, `scenarios`, `context`, and `contentHashes`. No LLM.
2. **LLM optimization** — subagents read the generated metadata and optimize `rules`, `constraints`, `scenarios`, `description` for quality (clean formatting artifacts, deduplicate, convert tables to sentences) without losing content. They also add `keywords`, which cannot be extracted deterministically.

## Architecture

The deterministic path runs `spec generate-metadata --write` which:

- Parses artifacts into ASTs via the schema's artifact parsers
- Runs extractors declared in `metadataExtraction` (selectors, captures, groupBy, transforms)
- Computes SHA-256 content hashes and resolves dependency paths
- Writes `.specd-metadata.yaml` with `generatedBy: core`

Subagents **only optimize** — they read the generated metadata (not the raw spec files), clean up semantic fields, and return the full YAML as their result string. They **never write files**. The main orchestrator receives the YAML from each subagent and writes it via `spec write-metadata`.

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
   c. Run deterministic generation:

   ```bash
   node packages/cli/dist/index.js spec generate-metadata <spec-id> --write --force
   ```

   If the schema has no `metadataExtraction` (command exits with error), fall back to the
   legacy LLM extraction subagent (see "LLM subagent fallback" below).
   d. Launch a single optimizer subagent (see "Subagent prompt" below) with `<spec-id>` substituted.
   Single-spec mode: the subagent runs the freshness + quality check and may return `FRESH`.

3. **If all specs:**

   a. Run:

   ```bash
   node packages/cli/dist/index.js spec list --metadata-status stale,missing,invalid --format json
   ```

   b. Parse the JSON. For each workspace, collect the spec IDs.
   If the result is empty (no stale, missing, or invalid specs), report that all metadata is fresh and stop.
   c. For each spec, run deterministic generation:

   ```bash
   node packages/cli/dist/index.js spec generate-metadata <spec-id> --write --force
   ```

   d. Launch optimizer subagents **in parallel batches** — up to 5 concurrent subagents at a time.
   Each subagent receives its own `<spec-id>`. Prepend `BATCH MODE:` to the prompt for batch specs.
   e. As each subagent completes, **write its result** (see "Writing results" below).
   f. After all subagents complete, report a summary.

4. Each subagent uses the Agent tool with:
   - `subagent_type: general-purpose`
   - The full optimizer prompt below, substituting `<spec-id>`.

5. **Regeneration policy (only when needed).**
   - If metadata is fresh **and** passes semantic quality checks, do not rewrite (`FRESH`).
   - If metadata is stale but semantic quality is good, regenerate deterministic baseline + optimize with minimal churn.
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
  - If `dependsOn` was present in the deterministic output, it must still be present

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

## Subagent prompt

````
You are optimizing metadata for spec <spec-id>. The deterministic extractor has already produced
a baseline from the spec's AST. Your job is to read the generated metadata, optimize the semantic
fields for quality without losing content, add keywords, and return the complete YAML as your
final message. Do NOT write any files.

IMPORTANT: Use `node packages/cli/dist/index.js` instead of `specd` for all CLI commands.
All Bash commands must run from the project root directory.

Follow these steps exactly:

### Step 1 — Check freshness (single-spec mode only)

**If BATCH MODE** (the prompt starts with "BATCH MODE:"):
Skip — treat as needing optimization.

**Otherwise:**
Run:
```bash
node packages/cli/dist/index.js spec metadata <spec-id> --format json
```

If `fresh` is `true`, evaluate existing metadata quality from command output:
- `keywords` has 4-8 items, no generic filler tags
- `rules[*].rules` has no formatting artifacts (tree glyphs, table rows, YAML example keys, field-doc lines)
- rules are requirement statements, not snippets copied from examples
- `description` is 2-3 sentences, not a dictionary-style definition

If freshness and quality both pass → return the single word `FRESH` and stop.
If freshness passes but quality fails → continue optimization and force semantic regeneration.
If the command fails (no metadata yet), treat all files as stale.

### Step 2 — Read the generated metadata and spec content

```bash
node packages/cli/dist/index.js spec metadata <spec-id> --format json
node packages/cli/dist/index.js spec show <spec-id> --format json
```

The metadata JSON is your primary source — it already contains `title`, `description`,
`dependsOn`, `rules`, `constraints`, `scenarios`, and `contentHashes` extracted by the
deterministic engine. The spec content is for domain context only — do NOT re-extract
structural fields from it.

### Step 3 — Optimize semantic fields

Work from the metadata output (Step 2), optimizing without losing content:

#### `description`
Optimize the extracted description into 2-3 sentences aimed at a reader deciding whether this
spec is relevant. Answer: what does this spec cover, why does it exist, and when would you need
it? Avoid dictionary-style openings, passive constructions, and structural descriptions.

#### `rules`
For each requirement group from the extracted `rules`: optimize every rule entry into a single
clean plain-text normative statement. Preserve named functions, APIs, field names, state/enum
values, transitions. Strip explanation and rationale. Convert tables to standalone sentence units.

Hard exclusions for `rules`:
- Never include content from `## Spec Dependencies` or `## Constraints`
- Never include raw Markdown table rows (`| ... |`)
- If normative information appears in table form, convert to plain-language sentences
- Never include example-only scaffolding lines (`title:`, `description:`, `dependsOn:`, `contentHashes:`, `rules:`, `constraints:`, `scenarios:`)
- Never include filesystem tree-art lines (`├──`, `└──`, `│`)
- Never include field reference docs (`**\`field\`** ...`) as rules

Deduplication:
- Remove exact duplicates across all `rules[*].rules`
- Remove any `rules[*].rules` entry identical to an entry in `constraints`
- Remove table separator rows and formatting-only lines

#### `constraints`
Clean up each constraint into a single plain-text sentence. Same exclusion rules as `rules`.

#### `scenarios`
Preserve the structure (requirement, name, given, when, then) but clean up formatting artifacts
from the extracted text. `name` must be the exact scenario title from the verify file.
Multiple scenarios for the same requirement each get their own entry.

#### `keywords`
Generate 4-8 lowercase hyphenated tags that help retrieval. Use concrete domain terms (commands,
use cases, concepts), not generic words. No duplicates.

### Step 4 — Preserve structural fields

Copy these fields exactly from the metadata — do NOT modify them:
- `title` (keep as extracted unless clearly wrong)
- `dependsOn` (keep all resolved paths)
- `contentHashes` (keep all computed hashes — never recompute)

### Step 5 — Return the YAML

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

- contentHashes and dependsOn come from the deterministic extractor — never modify them
- If a statement comes from `## Constraints`, it MUST go to `constraints`, never to `rules`
- `keywords` is mandatory; never omit it
- Prefer omission over guessing when section ownership is unclear
- Omit constraints if the deterministic output has none
- Omit scenarios if the deterministic output has none
````

## LLM subagent fallback

If the schema has no `metadataExtraction` declarations (i.e. `spec generate-metadata` fails),
fall back to the full LLM extraction subagent that reads raw spec files. This uses the same
subagent prompt as above, except:

- Step 2 is skipped (no metadata to read)
- Step 3 becomes the primary source
- The subagent must compute `contentHashes` itself:

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

- The subagent must resolve dependencies from `## Spec Dependencies`:

```bash
node packages/cli/dist/index.js spec resolve-path <path> --format json
```
