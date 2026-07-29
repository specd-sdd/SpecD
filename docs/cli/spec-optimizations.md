# spec optimizations

Manage persisted LLM optimization baselines in `spec-lock.json`. This command never invokes an LLM.

## Usage

```bash
specd specs optimizations get <specPath>
specd specs optimizations set <specPath> --input <json-file|->
specd specs optimizations set <specPath> [--optimized-description <text>] [--optimized-context <text>]
specd specs optimizations clear <specPath> --field optimizedDescription|optimizedContext
specd specs optimizations clear <specPath> [--optimized-description] [--optimized-context]
```

## Freshness

`get` reports per-field freshness (`fresh` / `STALE`) and reasons such as `artifact-changed`, `schema-changed`, or `missing`. Only fresh values are projected into materialized metadata.

`set` captures a baseline from current artifact hashes for each field present in the call. Clearing the last field omits `optimizations` from the lock entirely.

## Mutation forms

`set` accepts exactly one input form:

- `--input <json-file|->` for a JSON object containing `optimizedDescription` and/or `optimizedContext`
- one or both direct value flags: `--optimized-description <text>` and `--optimized-context <text>`

`clear` accepts exactly one selection form:

- one or more repeated `--field optimizedDescription|optimizedContext`
- one or both direct clear flags: `--optimized-description` and `--optimized-context`

The direct forms may update or clear both fields atomically in one command. Mixed forms are rejected at the CLI boundary: `set` cannot combine `--input` with direct value flags, and `clear` cannot combine `--field` with direct clear flags.

Failure examples:

```bash
specd specs optimizations set cli:spec-optimizations
specd specs optimizations set cli:spec-optimizations --input payload.json --optimized-context "..."
specd specs optimizations clear cli:spec-optimizations
specd specs optimizations clear cli:spec-optimizations --field optimizedDescription --optimized-context
```

Each command above exits with code `1`, prints an `error:` message, and leaves persisted state unchanged.

## Errors

The command exits with code `1` for invalid CLI input and for Core-reported user errors such as unknown specs, conflicts, or read-only workspaces.

CLI validation failures include:

- `set` without `--input` and without any direct value flag
- `clear` without `--field` and without any direct clear flag
- malformed JSON, non-object JSON, unknown JSON keys, non-string JSON values, or `{}`
- mixed structured and direct forms for either `set` or `clear`

## Workflow

Optimizer agents gate on effective `llmOptimizedContext === true` and persist results with `specs optimizations set`. Consumers (`specs metadata`, context compilation) self-heal projections on read.

Examples:

```bash
specd specs optimizations set cli:spec-optimizations \
  --optimized-description "CLI contract for persisted spec optimizations" \
  --optimized-context "# cli:spec-optimizations\n## Rules\n..."

printf '{"optimizedDescription":"summary"}' | \
  specd specs optimizations set cli:spec-optimizations --input -

specd specs optimizations clear cli:spec-optimizations \
  --optimized-description --optimized-context

specd specs optimizations get cli:spec-optimizations --format toon
```

Clearing one field preserves the other field and its baseline. Clearing the final remaining field removes the `optimizations` block from `spec-lock.json`, which is observable through a follow-up `get` that reports no persisted optimization values.

Compatibility clear remains available:

```bash
specd specs optimizations clear cli:spec-optimizations --field optimizedDescription
```
