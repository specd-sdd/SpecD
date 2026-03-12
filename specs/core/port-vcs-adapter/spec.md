# VCS Adapter Port

## Overview

`VcsAdapter` is an application-layer port interface that provides technology-neutral access to version-control system state. Use cases depend on this interface for repository root resolution, branch detection, working-tree cleanliness checks, revision references, and file content retrieval. Concrete implementations exist for git (and planned for hg, svn) as well as a null fallback for environments without VCS.

## Requirements

### Requirement: rootDir returns the repository root

`rootDir()` MUST return a `Promise<string>` resolving to the absolute path of the repository root directory. The returned path MUST be absolute, not relative.

When the current working directory is not inside a VCS repository, `rootDir()` MUST reject with an `Error`.

### Requirement: branch returns the current branch name

`branch()` MUST return a `Promise<string>` resolving to the name of the currently checked-out branch.

When the repository is in a detached or unknown-head state, `branch()` MUST return `"HEAD"` (for git) or an equivalent sentinel value for other VCS backends. It MUST NOT throw in detached-head state.

### Requirement: isClean reports working-tree cleanliness

`isClean()` MUST return a `Promise<boolean>`. It MUST resolve to `true` when the working tree has no uncommitted changes, and `false` when uncommitted changes exist.

### Requirement: ref returns the current short revision

`ref()` MUST return a `Promise<string | null>`. It MUST resolve to the short revision identifier (e.g. abbreviated commit hash) for the current commit or changeset.

When VCS is unavailable or the repository has no commits, `ref()` MUST resolve to `null`. It MUST NOT throw in these cases.

### Requirement: show retrieves file content at a revision

`show(ref, filePath)` MUST accept a revision identifier (`ref`) and a repository-relative file path (`filePath`), both as `string` parameters. It MUST return a `Promise<string | null>`.

When the revision and file exist, `show()` MUST resolve to the file content as a string. When the revision or file path does not exist, `show()` MUST resolve to `null`. It MUST NOT throw for missing revisions or paths.

### Requirement: Interface-only declaration

`VcsAdapter` MUST be declared as a TypeScript `interface`, not an abstract class. Unlike repository ports, `VcsAdapter` has no invariant constructor arguments shared across all implementations, so an interface is the appropriate abstraction.

### Requirement: Null fallback implementation

A `NullVcsAdapter` implementation MUST exist for environments where no VCS is detected. It MUST satisfy the following contract:

- `rootDir()` MUST reject with an `Error` containing a message indicating no VCS was detected.
- `branch()` MUST resolve to `"none"`.
- `isClean()` MUST resolve to `true`.
- `ref()` MUST resolve to `null`.
- `show()` MUST resolve to `null` for any arguments.

The null implementation MUST NOT shell out to any external process or perform I/O.

## Constraints

- All methods are async and return `Promise` values.
- Methods that can reasonably produce a "no data" result (`ref`, `show`) use `null` rather than throwing.
- Methods that have no meaningful fallback (`rootDir`) throw when VCS is absent.
- `branch` uses a sentinel string rather than `null` to simplify downstream string interpolation.
- Implementations reside in `infrastructure/<vcs>/vcs-adapter.ts`; the port interface lives in `application/ports/vcs-adapter.ts`.

## Spec Dependencies

- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) -- hexagonal architecture, port/adapter separation
- [`specs/core/vcs-adapter/spec.md`](../vcs-adapter/spec.md) -- factory that selects the concrete implementation
