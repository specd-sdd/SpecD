# Snapshot Hasher

## Purpose

Detecting whether an artifact has changed since it was last validated requires a stable, deterministic content fingerprint that can be stored and compared later. `hashFiles` is a pure domain service that computes SHA-256 content hashes for a set of files, recording a fingerprint at validation time so that infrastructure adapters can detect drift — a file has drifted if its current hash differs from the one stored at last validation.

## Requirements

### Requirement: Hash format

Each hash is returned as a prefixed hex string: `sha256:<64 hex characters>`. The prefix makes the algorithm explicit and allows future algorithms to be introduced without ambiguity.

### Requirement: Determinism

The same text always produces the same hash after the injected `hashContent` function runs. `hashFiles` MUST forward each string to `hashContent` unchanged. It MUST NOT detect a binary string and MUST NOT rewrite newlines itself. Newline normalization belongs to the text hasher from `core:content-hasher-port`. Raw file bytes are not strings and MUST NOT be passed through `hashFiles`.

### Requirement: Path preservation

The path key is preserved exactly as given. No normalisation, no platform separator conversion.

### Requirement: Empty input

An empty input object produces an empty result object without error.

### Requirement: Empty file content

A file with empty string content is hashed normally — the SHA-256 of an empty string is a valid, stable digest.

## Constraints

- Pure function — no I/O, no side effects
- Input encoding is UTF-8
- Output keys match input keys exactly

## Spec Dependencies

- [`default:_global/architecture`](../../_global/architecture/spec.md) — pure function requirement for domain services
- [`core:content-hasher-port`](../content-hasher-port/spec.md) — text hashes normalize newlines before the digest
