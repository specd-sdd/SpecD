| status   | date       | decision-makers  | consulted | informed |
| -------- | ---------- | ---------------- | --------- | -------- |
| accepted | 2026-02-19 | specd maintainer | -         | -        |

# ADR-0006: Filesystem-Only Storage Adapter in v1

## Context and Problem Statement

The storage ports (`SpecRepository`, `ChangeRepository`, `ArchiveRepository`, `SchemaRegistry`) are designed to support multiple adapter implementations. Future adapters could target databases, remote APIs, or object storage. However, implementing multiple adapters before the domain and CLI are stable risks building adapters against an unstable interface.

## Decision Outcome

Chosen option: "Ship only the `fs` adapter in v1", because validating the port interfaces against one real implementation before treating them as stable is safer than building additional adapters against interfaces that may change.

All four storage ports are implemented with `FsSpecRepository`, `FsChangeRepository`, `FsArchiveRepository`, and `FsSchemaRegistry`. The adapters live in `@specd/core/infrastructure/fs/`. Future adapters (database, remote) will be introduced in later versions, potentially as separate packages or as an enterprise offering.

### Consequences

- Good, because v1 is simpler to implement and test
- Good, because port interfaces are validated against one real implementation before being considered stable
- Good, because the `allowExternalPaths` guardrail in the fs adapter mitigates the main risk of filesystem-based storage (paths escaping the project root)
- Bad, because teams requiring shared or remote storage must wait for a future release

### Confirmation

Compliance is verified structurally: `@specd/core/infrastructure/` must contain only an `fs/` subdirectory. Any non-fs adapter implementation (e.g. `db/`, `remote/`) appearing in that directory signals a violation of this ADR.

## More Information

### Spec

- [`specs/_global/architecture/spec.md`](../../specs/_global/architecture/spec.md)
