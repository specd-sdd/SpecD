# spec schema

Read or update the persisted schema identity stored in `spec-lock.json`.

## Usage

```bash
specd specs schema get <specPath>
specd specs schema set <specPath> --schema <schema-ref>
```

## Behavior

- `get` requires an initialized lock (`SpecNotInitializedError` otherwise).
- `set` never creates a lock; reassignment to the same schema is a no-op.
- Compatible reassignment preserves `dependsOn`, `implementation`, and `optimizations` verbatim but marks optimizations stale (`schema-changed`).
- Conflicting reassignment (extracted dependencies disagree with persisted `dependsOn`) fails with `PersistedSchemaDependencyConflictError` and performs no write.
