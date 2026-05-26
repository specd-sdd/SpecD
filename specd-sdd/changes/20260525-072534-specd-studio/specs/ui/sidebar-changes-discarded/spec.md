# Sidebar Changes Discarded

## Purpose

Studio UI for **Sidebar Changes Discarded**: user-visible layout and actions driven exclusively through `SpecdDataPort` hooks. Studio UI component: **Sidebar Changes Discarded**.

## Requirements

### Requirement: sidebar renders global poll data — navigation only

The sidebar MUST render a list of discarded changes from global poll hooks. Each row navigates to the change Overview — the sidebar MUST NOT expose per-row action buttons. A discarded change is permanently abandoned; its Overview shows a read-only notice to that effect.

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

### Requirement: view surfaces loading and error states

While requests are in flight or fail, the UI MUST show loading indicators and human-readable errors.

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
