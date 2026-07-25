# cli:spec-update-metadata

## Purpose

**Removed.** The `specd spec update-metadata <workspace:capability-path>` command accepted a partial metadata JSON/YAML payload and delegated to the (now removed) `UpdateSpecMetadata` use case to merge LLM-optimized fields into generated metadata. Optimized fields are now owned directly by `spec-lock.json` and mutated only through `specs optimizations set`/`clear` (see `cli:spec-optimizations`). There is no `update-metadata` command or alias.

## Requirements

### Requirement: spec update-metadata is removed

The CLI MUST NOT register an `update-metadata` command, or any alias of it, on the `spec` parent command. Agents that need to persist an LLM-optimized description or context MUST use `specd spec optimizations set` instead.

## Spec Dependencies

_none_
