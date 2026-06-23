# Port Studio Panel

## Purpose

Client port methods for Studio remote log access and debug trace writes. User-visible Output/Problems buffers are local UI session state rather than remote API resources.

## Requirements

### Requirement: readProjectLogs and appendProjectLog

`readProjectLogs({ limit?, prettier? }, signal?)` MUST `GET /v1/logs`. `appendProjectLog({ level?, message, context? })` MUST `POST /v1/logs`. Log messages are for tracing (action ids); they MUST NOT repeat full studio output user text as the primary log message.

### Requirement: output buffering is local to the UI session

The port MUST NOT expose methods for listing or appending Studio output lines. Output/Problems entries belong to a local session buffer owned by `@specd/ui` or the Studio host.

### Requirement: trace logs remain independent from local output

`appendProjectLog` MUST NOT be specified as a persistence path for the local output buffer. The UI MAY emit a debug trace for an action and also append a separate local output line, but those are distinct channels.

### Requirement: SpecdDataPort composes PortStudioPanel

`SpecdDataPort` MUST extend `PortStudioPanel` so `@specd/ui` hooks call the port only.

## Spec Dependencies

- [`client:specd-data-port`](../specd-data-port/spec.md) — aggregation
- [`api:routes-project-logs`](../../api/routes-project-logs/spec.md) — HTTP contract
