# Port Studio Panel

## Purpose

Client port methods for the Studio bottom panel: **Output** stream, **Logs** readback, and debug trace writes. Implemented by remote HTTP and in-memory adapters.

## Requirements

### Requirement: listStudioOutput and appendStudioOutput

`listStudioOutput(limit?, signal?)` MUST `GET /v1/studio/output`. `appendStudioOutput({ level?, message, action?, context? })` MUST `POST /v1/studio/output`.

### Requirement: readProjectLogs and appendProjectLog

`readProjectLogs({ limit?, prettier? }, signal?)` MUST `GET /v1/logs`. `appendProjectLog({ level?, message, context? })` MUST `POST /v1/logs`. Log messages are for tracing (action ids); they MUST NOT repeat full studio output user text as the primary log message.

### Requirement: output and logs are independent buffers

`appendStudioOutput` MUST NOT write to the log ring. `appendProjectLog` MUST NOT write to the studio output buffer.

### Requirement: SpecdDataPort composes PortStudioPanel

`SpecdDataPort` MUST extend `PortStudioPanel` so `@specd/ui` hooks call the port only.

## Spec Dependencies

- [`client:specd-data-port`](../specd-data-port/spec.md) — aggregation
- [`api:routes-project-logs`](../../api/routes-project-logs/spec.md) — HTTP contract
