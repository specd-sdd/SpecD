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

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
- [`client:port-project`](../../client/port-project/spec.md) — port methods
