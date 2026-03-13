# FileReader Port

## Purpose

Application logic such as `CompileContext` must read arbitrary files but cannot import `node:fs` directly without violating the hexagonal boundary. `FileReader` is the application-layer port that defines the contract for reading files by absolute path, returning `null` for missing files instead of throwing, so consumers stay decoupled from concrete filesystem APIs.

## Requirements

### Requirement: Interface shape

The port MUST be declared as a TypeScript `interface` named `FileReader` with a single method `read`. It SHALL NOT be an abstract class, because there are no invariant constructor arguments shared across all implementations.

### Requirement: Read method signature

The `read` method MUST accept a single parameter:

1. `absolutePath: string` — the absolute filesystem path to read

It MUST return `Promise<string | null>`. The content MUST be read as UTF-8 text.

### Requirement: Missing file handling

When the file at `absolutePath` does not exist, the `read` method MUST return `null`. It SHALL NOT throw an error for missing files.

### Requirement: Non-ENOENT errors propagate

For filesystem errors other than "file not found" (e.g. permission denied), the `read` method MUST propagate the error by throwing. Only `ENOENT` errors are converted to `null`.

### Requirement: Path traversal protection (implementation concern)

Implementations MAY accept an optional `basePath` constraint at construction time. When a `basePath` is configured, the implementation MUST verify that the resolved path does not escape the base directory. If it does, the implementation MUST throw a `PathTraversalError`.

### Requirement: Path resolution

Implementations MUST resolve the provided path (e.g. via `path.resolve`) before performing any read or traversal check, ensuring that relative components like `..` are normalised.

## Constraints

- The port lives in `application/ports/` per the hexagonal architecture rule
- No direct dependency on `node:fs` or any I/O at the port level
- The return type is `string | null`, not `Buffer` — all reads are UTF-8 text
- `null` is the sentinel for "file does not exist"; no custom error type for missing files

## Spec Dependencies

- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — hexagonal architecture and port placement rules
