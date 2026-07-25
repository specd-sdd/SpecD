# spec optimizations

Manage persisted LLM optimization baselines in `spec-lock.json`. This command never invokes an LLM.

## Usage

```bash
specd specs optimizations get <specPath>
specd specs optimizations set <specPath> [--optimized-description <text>] [--optimized-context <text>]
specd specs optimizations clear <specPath> [--optimized-description] [--optimized-context]
```

## Freshness

`get` reports per-field freshness (`fresh` / `STALE`) and reasons such as `artifact-changed`, `schema-changed`, or `missing`. Only fresh values are projected into materialized metadata.

`set` captures a baseline from current artifact hashes for each field present in the call. Clearing the last field omits `optimizations` from the lock entirely.

## Workflow

Optimizer agents gate on effective `llmOptimizedContext === true` and persist results with `specs optimizations set`. Consumers (`specs metadata`, context compilation) self-heal projections on read.
