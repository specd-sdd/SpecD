# Command Palette

## Purpose

Studio UI for **Command Palette**: user-visible layout and actions driven exclusively through `SpecdDataPort` hooks. Studio UI component: **Command Palette**.

## Requirements

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

### Requirement: view surfaces loading and error states

While requests are in flight or fail, the UI MUST show loading indicators and human-readable errors (including HTTP 409 on save conflicts where applicable).

### Requirement: view is composed using shadcn Command and Dialog primitives

The Command Palette MUST be implemented using shadcn's `CommandDialog`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, and `CommandItem` primitives. It MUST preserve existing keyboard shortcuts (Escape to close, Arrow keys to navigate, Enter to select) via the underlying `cmdk` component. Custom search inputs and manual results lists MUST NOT be used.

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
