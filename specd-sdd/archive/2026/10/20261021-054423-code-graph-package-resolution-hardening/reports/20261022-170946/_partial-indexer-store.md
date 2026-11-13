# Partial audit: indexer, symbol-model, sqlite-graph-store, resolve-symbol-reference, index-project-graph

Scope:

- `code-graph:indexer`
- `code-graph:symbol-model`
- `code-graph:sqlite-graph-store`
- `code-graph:resolve-symbol-reference`
- `code-graph:index-project-graph`

Audit executed after Task 17 compliance review follow-up fixes.
Read-only inspection of source code and test suite.

---

## Summary counts

| Spec                                  | Requirements audited | Implemented | Partial | Discrepancies (H/M/L) | Scenarios audited | Scenarios with direct test |
| ------------------------------------- | -------------------- | ----------- | ------- | --------------------- | ----------------- | -------------------------- |
| `code-graph:indexer`                  | 4                    | 4           | 0       | 0 / 0 / 0             | 12                | 12                         |
| `code-graph:symbol-model`             | 1                    | 1           | 0       | 0 / 0 / 0             | 1                 | 1                          |
| `code-graph:sqlite-graph-store`       | 2                    | 2           | 0       | 0 / 0 / 0             | 2                 | 2                          |
| `code-graph:resolve-symbol-reference` | 1                    | 1           | 0       | 0 / 0 / 0             | 2                 | 2                          |
| `code-graph:index-project-graph`      | 1                    | 1           | 0       | 0 / 0 / 0             | 2                 | 2                          |

Overall: 9 requirements audited, 9 fully implemented, 0 partial. 0 High, 0 Medium, 0 Low discrepancies remaining.

---

## 1. code-graph:indexer

### Requirements & Status

1. **Shared indexing session**: Implemented.
   - `fileCategories` is populated for newly analyzed and modified files during Pass 1 registration (fixing prior D1 finding).
   - In Pass 2, `includeTests: fileCategories.get(prefixedPath) === 'test'` properly identifies test importers.
   - Production importers never resolve to test symbols; test importers resolve to test helpers, verified with CALLS edge test in `package-resolution.spec.ts`.
   - Hydrated unchanged files restore `namespace` and `namespaceSeparator` into the session qualified name maps.
2. **Cross-workspace package resolution**: Implemented.
   - Partial indexing runs (`--workspace`) forward `configuredWorkspaces` to prepare and map all workspaces without indexing unselected ones.
   - `RepositoryRootSource` port abstracts VCS repository boundary lookups for each code root.
   - Adapters serving multiple languages are listed once by their first language in `adaptersWithoutPackageResolution`.
   - Inaccessible workspaces skipped without failing the run.
3. **Identity-sensitive incremental equivalence**: Implemented.
   - Incremental indexing produces graph state equivalent to a clean rebuild for name-addressed imports.
4. **Package import incremental closure**: Implemented.
   - Added non-code files (e.g. documentation or assets) do not trigger addition-fallback re-extraction of code files.

---

## 2. code-graph:symbol-model

### Requirements & Status

1. **File node**: Implemented.
   - `FileNode` has optional `namespace` and `namespaceSeparator`.
   - `createFileNode` pairs `namespaceSeparator: params.namespaceSeparator ?? '.'` whenever `namespace !== undefined` (fixing prior D5 finding).
   - Namespace data does not affect `FileNode` equality.

---

## 3. code-graph:sqlite-graph-store

### Requirements & Status

1. **Persisted node storage**: Implemented.
   - `files` table contains `namespace TEXT` and `namespace_separator TEXT`.
   - Namespace round-trips through upsert and select operations.
2. **Reference schema upgrade**: Implemented.
   - `SQLITE_SCHEMA_VERSION` bumped to 16.
   - Databases at version 15 are rejected on read (`GraphSchemaIncompatibleError`) and recreated cleanly on index.

---

## 4. code-graph:resolve-symbol-reference

### Requirements & Status

1. **Structured reference input**: Implemented.
   - Anchored references with no adapter candidates return explicit `REFERENCE_UNPROVEN` immediately instead of falling through to simple-identifier resolution (fixing prior D6 finding).
   - Derived qualified names (`Owner.member`) are no longer synthesized; lookup matches only stored `qualified_name`.

---

## 5. code-graph:index-project-graph

### Requirements & Status

1. **Accepts open provider and prepared inputs**: Implemented.
   - `IndexProjectGraph` and `@specd/sdk` forward `configuredWorkspaces` unchanged to provider indexing.
