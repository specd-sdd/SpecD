# ContentHasher Port

## Purpose

Artifact conflict detection and change validation rely on deterministic content hashes, but the application layer must not depend on a specific algorithm or cryptographic library. `ContentHasher` is the application-layer port that defines the contract for computing content hashes, isolating consumers from the underlying implementation so algorithms can be swapped transparently.

## Requirements

### Requirement: Abstract class shape

The port MUST be declared as a TypeScript `abstract class` named `ContentHasher` with a single abstract method `hash(content: string): string`. No concrete behaviour SHALL be provided.

### Requirement: Hash input

The `hash` method MUST accept a single `content` parameter of type `string`. Implementations MUST treat the input as UTF-8 encoded text.

### Requirement: Hash output format

The `hash` method MUST return a string in the format `<algorithm>:<hex>`, where `<algorithm>` is a lowercase identifier for the hashing algorithm (e.g. `sha256`) and `<hex>` is the lowercase hexadecimal digest. This prefixed format makes the algorithm explicit and allows future algorithm changes without ambiguity.

### Requirement: Determinism

The same input string MUST always produce the same output. Two calls with identical `content` values MUST return identical results.

### Requirement: Empty content

When `content` is an empty string, the method MUST still return a valid `<algorithm>:<hex>` hash. Implementations SHALL NOT throw or return a sentinel value for empty input.

### Requirement: No side effects

Implementations MUST be pure with respect to their input — calling `hash` SHALL NOT produce I/O, mutate shared state, or depend on external context beyond the algorithm itself.

## Constraints

- The port lives in `application/ports/` per the hexagonal architecture rule
- No direct dependency on any cryptographic library at the port level
- The return format `<algorithm>:<hex>` is mandatory for all implementations

## Spec Dependencies

- [`default:_global/architecture`](../../_global/architecture/spec.md) — hexagonal architecture and port placement rules
