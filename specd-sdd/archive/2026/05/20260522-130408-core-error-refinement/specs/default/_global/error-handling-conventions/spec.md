# Error Handling Conventions

## Purpose

Without consistent error handling, a multi-package monorepo produces fragmented feedback that confuses users and breaks automated tooling. This spec defines the standards for error handling across the specd ecosystem, ensuring every user-facing error is machine-readable, actionable, and consistent in its presentation.

## Requirements

### Requirement: Specd Error Contract

All user-facing errors in any specd package SHALL follow the "Specd Error Contract". An error follows this contract if it:

1. Inherits from the standard JavaScript `Error` class.
2. Has a `readonly specd = true` property (the discriminator).
3. Has a `readonly code: string` property (machine-readable ID).
4. Has a descriptive, human-readable `message`.

The `specd: true` discriminator allows delivery mechanisms (like the CLI) to identify compatible errors across package boundaries without strict `instanceof` checks.

### Requirement: core Mandate

The `@specd/core` package SHALL define the canonical `SpecdError` base class. Every domain and application error in `@specd/core` MUST explicitly extend `SpecdError`.

### Requirement: Monorepo Package Mandate

Every package in the specd monorepo that depends on `@specd/core` MUST extend `SpecdError` for its own domain and application errors. Each package SHOULD define its own package-level base error class (e.g., `SpecdCodeGraphError`, `SpecdCliError`) to provide a clear namespace for its errors while remaining compatible with the core hierarchy.

### Requirement: Error Code Naming

Error codes SHALL be in `UPPER_SNAKE_CASE` (e.g., `CHANGE_NOT_FOUND`, `ARTIFACT_DRIFT`). Codes MUST be unique within a package and SHOULD be stable across versions to avoid breaking programmatic consumers.

### Requirement: Actionable Messaging

Error messages MUST be descriptive and, whenever possible, tell the user how to fix the problem. Avoid technical jargon or internal implementation details in user-facing messages.

### Requirement: Metadata Extraction

Errors MAY include additional metadata properties (e.g., `specId`, `filePath`, `expected`) to provide context for structured output formats (JSON/TOON). These properties SHOULD be documented in the error's JSDoc.

### Requirement: JSDoc Documentation

All error classes MUST include JSDoc comments describing:

- What the error represents.
- The machine-readable `code`.
- Any additional metadata properties.

Use cases MUST document the errors they throw using the `@throws` tag.

## Constraints

- System errors (e.g., OOM, network failure) and unexpected internal bugs (e.g., `null` pointer) MAY remain as generic `Error` objects; these are handled as "system errors" by the CLI (displaying a stack trace).
- Domain logic MUST NOT use generic `Error` for expected failure modes or validation errors.

## Spec Dependencies

- [`default:_global/conventions`](../conventions/spec.md) — general coding standards.
