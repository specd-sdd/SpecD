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

### Requirement: Host-Neutral Core Errors and Delivery Hints

Domain and application errors, services, and use cases in `@specd/core` MUST NOT embed delivery-mechanism flags (such as `--force`, `--next`, `--target`, `--allow-out-of-scope`, `--set`, `--add`, `--remove`, `--clear`), CLI command syntax (such as `specd ...`, and also such a command with the `specd` prefix omitted, for example `run "specs init" first`), agent slash commands (such as `/specd-verify`), or use-case input names presented as a remedy or bypass instruction (such as `allowOutOfScope`, `force`, or `skipChecks`; for example `Pass force to overwrite`) inside `message`. A bare input name MUST NOT be used as an imperative instruction even when it has no `--` prefix and equals a generic word, and descriptive phrasing that names an input (such as `without force`, as in the historical-implementation guard) MUST likewise be reworded to state the invariant (for example `without explicit confirmation`); the message states the violated invariant (for example that overwriting requires explicit confirmation) and leaves the means of confirmation to the delivery mechanism.

Core errors SHALL describe the violated domain or application invariant in host-neutral terms and expose structured metadata properties (such as `specId`, `changeName`, `state`, `operation`, `gates`, `existingDeps`, `incomingDeps`, or `outOfScopeSpecIds`) so delivery mechanisms (`@specd/cli`, `@specd/mcp`, `@specd/sdk` callers) can translate typed error codes and metadata into delivery-appropriate hints using their active command context. Every core error code that previously relied on an embedded recovery command or input-name instruction (for example `VERIFICATION_STALE`, `SPEC_NOT_INITIALIZED`, or the codes that told the caller to pass `force`) MUST have a matching CLI hint so the recovery stays discoverable. The hint MUST apply to every CLI command that can surface that code (for example `DEPENDS_ON_OVERWRITE` for every command that can propagate `DependsOnOverwriteError`, not only `specs generate-metadata` and `specs validate`), not to a fixed subset of command contexts.

### Requirement: Host-Neutral Core Projections

Non-error read and projection models exposed by `@specd/core` — including next actions, blockers, check results, and validity details — MUST NOT embed delivery-mechanism syntax: CLI commands (`specd ...`), CLI flags (such as `--skip-checks`), or agent slash commands (such as `/specd-design`).

Core SHALL express guidance as structured host-neutral data: workflow-phase intents, check-declared actions (`kind`, optional `params`, optional host-neutral `guidance`), and capability markers such as `isSkippable` plus `checkId`. Delivery mechanisms (`@specd/cli`, `@specd/mcp`, `@specd/sdk` callers) translate that data into their own interaction model (commands, slash commands, flags, tool calls) in a centralized presenter, using their active command context.

A host that does not recognize an action `kind` MUST fall back to the action's host-neutral `guidance` and MUST NOT invent delivery syntax.

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
