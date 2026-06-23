# Bottom Panel Output

## Purpose

Studio UI for **Bottom Panel Output**: the full stream of user-visible action results (saves, validation summary lines, scope edits, etc.), backed by a local Studio session buffer rather than a dedicated API route. In [`ui:shell-layout`](../shell-layout/spec.md) this is the **first** bottom tab and the **default** on Studio mount.

## Requirements

### Requirement: Output is the leading bottom tab

The shell MUST render **Output** as the leftmost bottom tab and MUST select it when the shell first mounts unless the user previously chose another tab in the same session (v1: in-memory React state only).

### Requirement: Output lists all local session output entries

The panel MUST show every local output line (all levels), newest first, from the in-memory session buffer.

### Requirement: shell appends local output on successful actions

When the shell handles successful description save, invalidation policy save, scope dialog save, artifact save, validate, restore/discard, or open navigation, it MUST append a local output entry with an appropriate `level` and `action`. It MAY `appendProjectLog` at `debug` with the **action id** as the log message and the user-facing text in `context` only (MUST NOT duplicate the full output line as the log message). Validation with findings MAY select the **Problems** tab; other actions SHOULD select **Output**.

### Requirement: local output buffer is capped

The local output buffer MUST cap retained entries at 400 lines. When appending beyond that limit, the oldest entries MUST be discarded first.

### Requirement: empty state copy

When the stream is empty, the panel MUST show: _Results of saves, validation, and other studio actions appear here._

### Requirement: view uses local output state and port hooks only

Components MUST consume output data through local shell state plus `SpecdDataPort` hooks for remote logs only, and MUST NOT import `@specd/core`.

### Requirement: view surfaces local state immediately

Local output rendering MUST update immediately after append without waiting for remote polling. Remote log failures MUST NOT block rendering existing local output entries.

## Spec Dependencies

- [`client:port-studio-panel`](../../client/port-studio-panel/spec.md) — remote trace logging only
- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
- [`ui:shell-layout`](../shell-layout/spec.md) — orchestration
