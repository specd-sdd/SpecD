# Snapshot Hasher

## Overview

`hashFiles` is a pure domain service that computes SHA-256 content hashes for a set of files. It is used to record a content fingerprint at validation time so that infrastructure adapters can detect drift — a file has drifted if its current hash differs from the one stored at last validation.

## Requirements

### Requirement: Hash format

Each hash is returned as a prefixed hex string: `sha256:<64 hex characters>`. The prefix makes the algorithm explicit and allows future algorithms to be introduced without ambiguity.

### Requirement: Determinism

The same content always produces the same hash. Two calls with identical content for the same path must return the same digest.

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

- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — pure function requirement for domain services
