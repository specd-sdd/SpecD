# Outline Change Artifact

## Purpose

Change-directory artifacts (including **new specs** under `specs/` and deltas under `deltas/`) must be outlineable before they exist in the workspace tree. `OutlineChangeArtifact` loads content from the change (or accepts a Studio **draft** body) and delegates to [`core:outline-artifact-content`](../outline-artifact-content/spec.md).

## Requirements

### Requirement: input names change and filename

`execute` MUST accept `name` (change), `filename` (change-relative path), optional `content` (draft override), and optional `full` / `hints`.

### Requirement: draft content skips repository read

When `content` is provided, the use case MUST NOT call `ChangeRepository.artifact` for that request; it MUST outline the supplied string.

### Requirement: saved content loads via GetChangeArtifact path

When `content` is omitted, the use case MUST load bytes through `ChangeRepository.artifact(change, filename)`. Missing file MUST throw an error surfaced as HTTP 404 at the API boundary.

### Requirement: change must exist

Unknown change name MUST throw `ChangeNotFoundError`.

## Spec Dependencies

- [`core:outline-artifact-content`](../outline-artifact-content/spec.md) — parse + outline
- [`core:get-change-artifact`](../get-change-artifact/spec.md) — same artifact bytes when not draft
- [`core:change-repository-port`](../../../../../../specs/core/change-repository-port/spec.md) — load path for active change artifacts
