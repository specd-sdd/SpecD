# core:vcs-implementation-detector

## Purpose

The first implementation detector in specd derives candidate implementation files from VCS worktree state, but that behavior should not be conflated with the detector abstraction itself or with VCS adapter composition. This spec defines the VCS-backed implementation that translates VCS modified-file information into implementation-detector results.

## Requirements

### Requirement: Implements the detector port

The VCS-backed implementation detector SHALL implement `core:implementation-detector-port`.

Its externally visible behavior MUST satisfy the detector contract for project-relative modified-file discovery.

### Requirement: Uses the VCS adapter port

The detector SHALL obtain modified-file information through `core:vcs-adapter-port`.

It MUST delegate VCS-specific enumeration to the adapter instead of embedding git-, hg-, or svn-specific command behavior directly inside change-lifecycle use cases.

### Requirement: Resolves the historical implementation baseline

The detector SHALL derive its baseline from the first time the change entered `implementing`.

It MUST ask the change for that timestamp, resolve the corresponding historical revision through `VcsAdapter.refAt(...)`, and use that revision as the baseline for `modifiedFiles(...)`.

If no historical `implementing` timestamp exists or the VCS backend cannot resolve a matching historical revision, the detector MAY fall back to `VcsAdapter.ref()` rather than failing outright.

### Requirement: Modified-file candidate mapping

When asked for modified files since a baseline reference, the detector MUST return project-relative candidate paths derived from the complete VCS adapter result.

Because `VcsAdapter.modifiedFiles(...)` returns repository-root-relative paths independently of its construction cwd, the detector SHALL resolve the adapter repository root and deterministically rebase each candidate to the configured project root. It SHALL normalize separators to forward slashes, deduplicate, and sort the result.

Paths outside the configured project root MUST NOT be returned as project-relative implementation candidates. Deleted/missing paths and both rename sides that are inside the project remain candidates; later implementation-review or materialization policy determines how they are presented.

The detector MAY apply the caller-provided generic implementation/internal `excludePaths` owned by the `ImplementationDetector` port after repository-to-project rebasing. It MUST NOT read Code Graph configuration, apply Code Graph effective visibility (`allowedPaths`, graph channel selection, graph defaults, or graph-specific exclusions), or derive a graph freshness fingerprint.

### Requirement: No workspace normalization

The VCS implementation detector SHALL remain workspace-agnostic. It SHALL rebase repository-root-relative VCS paths to the configured project root, normalize separators, and MAY apply the generic caller-provided implementation/internal `excludePaths` required by the `ImplementationDetector` port.

Workspace identity validation and Code Graph effective visibility are not responsibilities of this detector. In particular, the detector MUST NOT load graph configuration or infer graph `allowedPaths`, graph channel selection, default graph exclusions, or graph-specific exclusion policy.

## Constraints

- The detector MUST preserve raw project-relative semantics.
- The detector MUST remain replaceable by non-VCS implementations through the detector port.

## Spec Dependencies

- [`core:implementation-detector-port`](../implementation-detector-port/spec.md) — abstract detector contract
- [`core:vcs-adapter-port`](../vcs-adapter-port/spec.md) — VCS modified-file enumeration
