## Spec metadata

specd materializes structured metadata from spec artifacts and persisted state into `.specd/metadata/<spec>.json`. The cache is **gitignored** (`/.specd/metadata/` in the root `.gitignore`) and **self-healing**: `specs metadata`, context compilation, and archive read through `MaterializeSpecMetadata` and rebuild stale projections automatically.

Materialized metadata includes title, description, rules, constraints, scenarios, and projections of lock-owned fields (`dependsOn`, implementation, fresh optimizations).

### Persisted state (`spec-lock.json`)

Authoritative semantic state lives beside each spec:

- `schema` — adopted schema identity (`specs init`, `specs schema`)
- `dependsOn` — curated dependency links (`specs deps`)
- `implementation` — tracked code links (`specs implementation`)
- `optimizations` — LLM optimization baselines (`specs optimizations`)

Run `specs init` (or `specs init --all`) to create locks for legacy specs. Archive force-materializes metadata after publication; you do not need routine `specs generate-metadata` in normal workflow.

### Migration: stop tracking committed metadata cache

If `.specd/metadata/` was previously committed, untrack it once (specd never runs this automatically):

```bash
git rm -r --cached .specd/metadata
git commit -m "chore: stop tracking specd metadata cache"
```

Fresh `project init` creates the directory and gitignore entry idempotently.
