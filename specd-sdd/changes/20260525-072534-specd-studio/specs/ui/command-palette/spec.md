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

### Requirement: palette supports global remote search

The Command Palette MUST provide a global search capability powered by the `searchGraph` API:

- Studio MUST perform a debounced remote search (300ms delay) as the user types in the palette input.
- Results MUST be categorized and displayed in the following order: **Actions**, **Specifications**, **Code Symbols**, and **Documents**.
- **Actions** MUST be contextual: high-impact commands such as "Validate change artifacts" MUST only be displayed if a valid, editable change is currently selected in the Studio.
- Each **Specification** result MUST show its `specId` and title; selection MUST navigate to that spec's view.
- Each **Code Symbol** result MUST show the symbol name, kind, workspace, file path, and line number.
- Each **Document** result MUST show its file path and workspace.
- For all search categories, the UI MUST display the full search snippet returned by the API (using `whitespace-pre-wrap` and no line-clamping) to ensure the relevant context is fully visible.
- Results MUST be limited to a sensible number (e.g., 10 per category) to maintain performance.
- The UI MUST show an animated loading state while the remote search is in flight.

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
