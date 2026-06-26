# Partial: Global architecture — `06-core-config-editing-boundary`

**Spec:** `default:_global/architecture`

## Requirements summary

Change reinforces layered boundaries: config mutation via composition factory + port, not kernel use cases.

## Implementation status

✅ **Pass** — no new violations introduced:

- `ConfigWriter` port in `application/ports/`
- `FsConfigWriter` in `infrastructure/fs/` — only reached via `createConfigWriter()` in composition
- CLI imports `@specd/core` factory, not infrastructure adapter
- Domain/application layers unchanged by this change; deleted pass-through use cases removed thin delegation only

## Discrepancies

None specific to this change.

## Test coverage

N/A — architectural constraints enforced by structure and existing lint/graph conventions.

## Summary

- **Pass:** 4 relevant boundary rules
- **Fail:** 0
- **Drift:** 0
- **Test gaps:** 0
