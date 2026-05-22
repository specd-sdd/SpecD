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

When asked for modified files since a baseline reference, the detector MUST return project-relative candidate file paths derived from the VCS adapter result.

The detector MUST normalize path separators to forward slashes before returning them.

### Requirement: No workspace normalization

The VCS-backed detector MUST NOT resolve files to canonical `workspace:path` identities.

Workspace validation, `graph.excludePaths` filtering, and canonical normalization belong to archive-time materialization, not to detection.

## Constraints

- The detector MUST preserve raw project-relative semantics.
- The detector MUST remain replaceable by non-VCS implementations through the detector port.

## Spec Dependencies

- [`core:implementation-detector-port`](../implementation-detector-port/spec.md) — abstract detector contract
- [`core:vcs-adapter-port`](../vcs-adapter-port/spec.md) — VCS modified-file enumeration
