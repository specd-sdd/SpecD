# Hooks Project

## Purpose

React data hooks for **Hooks Project**: loading state, error propagation, and polling rules for `SpecdDataPort`. Hooks keep components free of transport details and `@specd/core` imports.

## Requirements

### Requirement: hooks expose getProject and getProjectStatus

The hook surface MUST call `client:port-project` methods `getProject()` and `getProjectStatus()` and return `{ data, error, isLoading, refetch }` (or equivalent) to consumers.

### Requirement: hooks participate in the global project poll

While the shell global poll runs, these hooks MUST refresh project and project status on the 2–3 second interval.

### Requirement: hooks dedupe concurrent fetches

Parallel mounts MUST share one in-flight request per cache key to avoid stampedes.

### Requirement: project poll publishes a session snapshot store

`useProjectPoll` MUST remain the single writer for global project polling. On each successful fetch it MUST publish `{ project, projectStatus, refreshKey, isLoading, error }` to a module-level session store consumed via `useSyncExternalStore` (same pattern as studio output in `ui:bottom-panel-output`).

`useProjectPollSession()` MUST expose the latest snapshot to any Studio consumer without prop drilling. Parallel subscribers MUST read the same in-memory snapshot for a given poll tick.

Chrome surfaces (top bar, sidebar graph rail, status bar, graph main view index card) MUST read graph health from `projectStatus.graph` on this session store and MUST NOT issue separate `getGraphStatus` calls for stale/warning display.

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
- [`client:port-project`](../../client/port-project/spec.md) — port methods
