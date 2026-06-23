# Get Spec Outline Draft

## Purpose

Workspace canonical specs are read-only in Studio v1, but the inspector may still need an outline of **unsaved buffer text** (e.g. future edit flows) or consistent API shape. This extends workspace `GetSpecOutline` with optional `content` + `filename` to outline draft bytes without reading `SpecRepository`.

## Requirements

### Requirement: content plus filename short-circuits repository

When `GetSpecOutlineInput.content` and `filename` are both set, `execute` MUST return a single outline result from [`core:outline-artifact-content`](../outline-artifact-content/spec.md) and MUST NOT require the spec to exist in the workspace tree.

### Requirement: repository path unchanged without content

When `content` is omitted, behavior MUST match workspace `GetSpecOutline` (load artifacts from spec repo, schema-driven filename set).

### Requirement: filename required with content

When `content` is provided without `filename`, the use case MUST throw a clear error (`SpecNotFoundError` or equivalent message).

## Spec Dependencies

- [`core:outline-artifact-content`](../outline-artifact-content/spec.md)
- Workspace CLI/kernel `GetSpecOutline` — canonical saved-spec behavior
