# Outline Artifact Content

## Purpose

Studio Outline (and CLI `specs outline`) need a single parser entry point that turns **raw artifact bytes** into navigable outline trees without requiring a workspace spec or change file on disk. `outlineArtifactContent` centralizes format inference, parse, and `outline()` so `GetSpecOutline` and `OutlineChangeArtifact` do not duplicate parser wiring.

## Requirements

### Requirement: input is content and filename only

The function MUST accept `content` (string), `filename` (for extension / format inference), `ArtifactParserRegistry`, and optional `{ full?, hints? }`. It MUST NOT read the filesystem.

### Requirement: output matches spec outline entry shape

The result MUST include `filename`, `outline` (readonly tree), and optional `selectorHints` when `hints: true`.

### Requirement: unknown format throws ParserNotRegisteredError

When `inferFormat(filename)` fails or no parser is registered, the function MUST throw `ParserNotRegisteredError` with the filename in the message.

### Requirement: parse errors propagate

Parser `parse` failures MUST propagate to callers (HTTP layer maps to problem+json).

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — parsers as infrastructure
- Workspace [`core:preview-spec`](../../../../../../specs/core/preview-spec/spec.md) — shared parser registry at kernel
