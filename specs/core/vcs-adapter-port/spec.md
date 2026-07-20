# VCS Adapter Port

## Purpose

Use cases need VCS state (repo root, branch, revision, file history) but must not couple to a specific tool, since the platform targets git today and may support hg or svn later. `VcsAdapter` is the application-layer port interface that provides technology-neutral access to version-control system state — repository root resolution, branch detection, working-tree cleanliness checks, revision references, and file content retrieval — with a null fallback for environments without VCS.

## Requirements

### Requirement: rootDir returns the repository root

`rootDir()` MUST return a `string` representing the absolute path of the repository root directory. The returned path MUST be absolute, not relative.

When the current working directory is not inside a VCS repository, `rootDir()` MUST throw an `Error`.

### Requirement: branch returns the current branch name

`branch()` MUST return a `Promise<string>` resolving to the name of the currently checked-out branch.

When the repository is in a detached or unknown-head state, `branch()` MUST return `"HEAD"` (for git) or an equivalent sentinel value for other VCS backends. It MUST NOT throw in detached-head state.

### Requirement: isClean reports working-tree cleanliness

`isClean()` MUST return a `Promise<boolean>`. It MUST resolve to `true` when the working tree has no uncommitted changes, and `false` when uncommitted changes exist.

### Requirement: ref returns the current short revision

`ref()` MUST return a `Promise<string | null>`. It MUST resolve to the short revision identifier (e.g. abbreviated commit hash) for the current commit or changeset.

When VCS is unavailable or the repository has no commits, `ref()` MUST resolve to `null`. It MUST NOT throw in these cases.

### Requirement: refAt resolves the revision active at a timestamp

`refAt(at)` MUST accept an ISO-8601 timestamp string and return a `Promise<string | null>`.

It resolves to the most recent revision identifier at or before the supplied timestamp.

When VCS is unavailable, the repository has no matching historical revision, or the backend cannot resolve a revision for that timestamp, `refAt()` MUST resolve to `null`. It MUST NOT throw for these no-data cases.

### Requirement: show retrieves file content at a revision

`show(ref, filePath)` MUST accept a revision identifier (`ref`) and a repository-relative file path (`filePath`), both as `string` parameters. It MUST return a `Promise<string | null>`.

When the revision and file exist, `show()` MUST resolve to the file content as a string. When the revision or file path does not exist, `show()` MUST resolve to `null`. It MUST NOT throw for missing revisions or paths.

### Requirement: modifiedFiles lists changed repository files

`modifiedFiles(baseRef)` MUST accept a baseline revision identifier (`baseRef`) as a string and return a `Promise<readonly string[]>`.

The returned array contains repository-relative file paths that differ between the current worktree state and the specified baseline reference.

Missing or empty results MUST be represented as an empty array, not as `null`.

### Requirement: Abstract class base

`VcsAdapter` MUST be declared as an abstract class, not a TypeScript interface. It MUST accept `cwd` as a protected read-only constructor parameter, which represents the working directory context.

### Requirement: Public port export

`@specd/core` SHALL export the `VcsAdapter` abstract class as a runtime value from its supported public API. Consumers that require the typed VCS contract MUST import the port from `@specd/core` and MUST NOT import it from an internal application path.

### Requirement: Null fallback implementation

A `NullVcsAdapter` implementation MUST exist for environments where no VCS is detected. It MUST satisfy the following contract:

- `rootDir()` MUST throw an `Error` containing a message indicating no VCS was detected.
- `branch()` MUST resolve to `"none"`.
- `isClean()` MUST resolve to `true`.
- `ref()` MUST resolve to `null`.
- `refAt()` MUST resolve to `null` for any timestamp.
- `show()` MUST resolve to `null` for any arguments.
- `modifiedFiles()` MUST resolve to an empty array for any baseline.
- `identity()` MUST resolve to `{ name: 'unknown', email: '', provider: 'null' }`.

### Requirement: identity resolves version control identity

`identity()` MUST return a `Promise<VcsIdentity>` resolving to the version control author identity configured for the repository.

The returned `VcsIdentity` has the structure:

```typescript
export interface VcsIdentity {
  readonly name: string
  readonly email: string
  readonly provider: string
}
```

`name` MUST be a non-empty string when resolved successfully, and `email` MAY be empty for backends that do not natively store email (like SVN).

### Requirement: static detect detects active VCS

`VcsAdapter` MUST define a static `detect(cwd: string): Promise<VcsAdapter | null>` method.

By default, `VcsAdapter.detect()` MUST return `null`. Concrete subclasses override this to asynchronously detect if the given `cwd` is inside their repository type, resolve the repository root, and return an instance of themselves.

## Constraints

- All methods are async and return `Promise` values.
- Methods that can reasonably produce a "no data" result (`ref`, `show`) use `null` rather than throwing.
- Methods that have no meaningful fallback (`rootDir`) throw when VCS is absent.
- `branch` uses a sentinel string rather than `null` to simplify downstream string interpolation.
- Implementations reside in `infrastructure/<vcs>/vcs-adapter.ts`; the port interface lives in `application/ports/vcs-adapter.ts`.

## Spec Dependencies

- [`default:_global/architecture`](../../_global/architecture/spec.md) -- hexagonal architecture, port/adapter separation
- [`core:vcs-adapter`](../vcs-adapter/spec.md) -- factory that selects the concrete implementation
