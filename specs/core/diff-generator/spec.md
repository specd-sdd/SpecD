# DiffGenerator

## Purpose

`PreviewSpec` needs to produce unified diff output from previewed artifact files, but the use case must not depend directly on a specific diff library. `DiffGenerator` defines the small application-layer capability that turns preview file content into a plain unified diff string, while allowing core to swap the concrete implementation later without changing the use-case contract.

## Requirements

### Requirement: Interface shape

The capability MUST be declared as a TypeScript `interface` named `DiffGenerator`. It SHALL expose a single method named `generate`. It SHALL NOT be an abstract class, because there are no shared constructor invariants across all implementations.

### Requirement: Input contract

`DiffGenerator.generate` MUST accept a single parameter object with these fields:

- `filename: string` — the artifact filename being diffed (for example `spec.md` or `verify.md`)
- `base: string` — the original content before change application
- `merged: string` — the resulting content after change application
- `contextLines?: number` — optional number of context lines to include around changes

The port MUST allow callers to provide an empty string for `base` when the previewed artifact is newly introduced and has no canonical base file yet.

### Requirement: Output contract

`DiffGenerator.generate` MUST return a plain unified diff string. The returned value MUST be presentation-neutral data: no ANSI color codes, no terminal control sequences, and no host-specific separator lines.

The diff output MUST identify the two sides using the preview filename:

- base side label: `a/<filename> (base)`
- merged side label: `b/<filename> (merged)`

### Requirement: Error contract

`DiffGenerator` SHALL define a dedicated typed failure for diff production: `DiffGenerationError`.

`DiffGenerationError` MUST represent diff-generation failures that callers may handle as a non-fatal review-surface problem after merge has already succeeded.

The default implementation MUST raise `DiffGenerationError` when its concrete diff-generation mechanism fails to produce a usable unified diff result.

This error contract exists so callers such as `PreviewSpec` can distinguish:

- a failed diff surface
- from a failed merge or failed artifact preview

### Requirement: Default context lines

When `contextLines` is omitted, the default implementation MUST generate the diff with 3 lines of context so preview output remains compatible with the current CLI behavior.

### Requirement: Default implementation

Core MUST provide a default implementation factory for this capability so config-based composition can construct `PreviewSpec` without requiring every caller to supply a custom diff generator. The default implementation MAY use any concrete diff library chosen by the project, but that library choice SHALL remain encapsulated behind `DiffGenerator`.

### Requirement: Usage boundary

`DiffGenerator` is an internal core capability for shared preview behavior. It MUST be suitable for use by `PreviewSpec`, but it SHALL NOT force delivery mechanisms to use it directly for unrelated diff workflows.

## Constraints

- The port lives in `application/ports/` per core's hexagonal structure
- The port itself MUST NOT depend directly on any concrete diff library
- The capability returns plain text data only; colorization and other host presentation remain outside the port
- The capability models file-to-file unified diffs; it does not model semantic review comments or artifact filtering behavior
- Diff-generation failures intended for caller handling MUST surface through the dedicated `DiffGenerationError` contract rather than through anonymous library-specific errors

## Spec Dependencies

_none_
