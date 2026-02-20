# Snapshot Hasher

## Overview

`hashFiles` is a pure domain service that computes SHA-256 content hashes for a set of files. It is used to record a content fingerprint at validation time so that infrastructure adapters can detect drift — a file has drifted if its current hash differs from the one stored at last validation.

## Requirements

### Requirement: Hash format

Each hash is returned as a prefixed hex string: `sha256:<64 hex characters>`. The prefix makes the algorithm explicit and allows future algorithms to be introduced without ambiguity.

#### Scenario: Single file hashed

- **WHEN** `hashFiles` is called with one file path and its content
- **THEN** the result contains that path as a key with a value matching `sha256:[a-f0-9]{64}`

### Requirement: Determinism

The same content always produces the same hash. Two calls with identical content for the same path must return the same digest.

#### Scenario: Identical content produces identical hash

- **WHEN** `hashFiles` is called twice with the same path and same content
- **THEN** both results have the same hash value for that path

#### Scenario: Different content produces different hash

- **WHEN** two files have different content — including content that differs only in whitespace
- **THEN** their hashes are different

### Requirement: Path preservation

The path key is preserved exactly as given. No normalisation, no platform separator conversion.

#### Scenario: Path used as key

- **WHEN** `hashFiles` is called with a path like `specd/changes/foo/proposal.md`
- **THEN** the result map contains that exact string as a key

### Requirement: Empty input

An empty input object produces an empty result object without error.

#### Scenario: Empty input

- **WHEN** `hashFiles` is called with `{}`
- **THEN** it returns `{}`

### Requirement: Empty file content

A file with empty string content is hashed normally — the SHA-256 of an empty string is a valid, stable digest.

#### Scenario: Empty content hashed

- **WHEN** `hashFiles` is called with a file whose content is `""`
- **THEN** the result contains a valid `sha256:<hex>` value for that path

## Constraints

- Pure function — no I/O, no side effects
- Input encoding is UTF-8
- Output keys match input keys exactly

## Spec Dependencies

- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — pure function requirement for domain services
