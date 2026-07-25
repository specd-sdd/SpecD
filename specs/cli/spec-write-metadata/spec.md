# Spec Write-Metadata

## Purpose

**Removed.** The `specd spec write-metadata` command accepted arbitrary metadata JSON/YAML from stdin or a file and persisted it through the (now removed) `SaveSpecMetadata` use case. Metadata is now a self-healing materialized cache with no external editor: normalized fields are always derived from current source artifacts by `MaterializeSpecMetadata`, and the only writable persisted state is lock-owned optimized fields, mutated through `specd spec optimizations set`/`clear`.

## Requirements

### Requirement: spec write-metadata is removed

The CLI MUST NOT register a `write-metadata` command, or any alias of it, on the `spec` parent command, and MUST NOT accept arbitrary metadata content from stdin, `--file`, or `--input` for any command. Agents that need to persist an LLM-optimized description or context MUST use `specd spec optimizations set` instead.

## Spec Dependencies

- [`default:_global/architecture`](../../_global/architecture/spec.md) — adapter packages contain no business logic
- [`default:_global/conventions`](../../_global/conventions/spec.md) — error types, named exports
- [`core:spec-metadata`](../../core/spec-metadata/spec.md) — metadata format, validation, and dependsOn overwrite protection

## ADRs

_none_
