# YamlSerializer Port

## Overview

`YamlSerializer` is an application-layer port that defines the contract for YAML parsing and serialization. It keeps the application layer free from direct YAML library dependencies, following the architecture rule that parsing belongs at the infrastructure boundary.

## Requirements

### Requirement: Abstract class shape

The port MUST be declared as a TypeScript `abstract class` named `YamlSerializer` with two abstract methods: `parse(content: string): unknown` and `stringify(data: unknown): string`. No concrete behaviour SHALL be provided.

### Requirement: Parse method input and output

The `parse` method MUST accept a single `content` parameter of type `string` containing raw YAML text. It MUST return the parsed JavaScript value typed as `unknown`. The caller is responsible for narrowing the type.

### Requirement: Parse method error handling

If the input string is not valid YAML, the `parse` method MUST throw an error. Implementations SHALL NOT return `undefined` or silently swallow malformed input.

### Requirement: Parse method empty and blank input

When `content` is an empty string or contains only whitespace, `parse` MUST return `undefined` (the YAML spec defines an empty document as producing no value). Implementations SHALL NOT throw for empty or blank input.

### Requirement: Stringify method input and output

The `stringify` method MUST accept a single `data` parameter of type `unknown` and return a YAML string representation. The output MUST be valid YAML that, when passed back to `parse`, produces a value structurally equivalent to the original input (round-trip fidelity for JSON-safe values).

### Requirement: Stringify method line wrapping

Implementations MUST NOT introduce automatic line wrapping into the serialized output. Long scalar values SHALL be emitted on a single line unless the input data explicitly contains newlines.

### Requirement: No side effects

Both `parse` and `stringify` MUST be pure with respect to their inputs. Calling either method SHALL NOT produce I/O, mutate shared state, or depend on external context.

## Constraints

- The port lives in `application/ports/` per the hexagonal architecture rule
- No direct dependency on any YAML library at the port level
- `parse` returns `unknown` — consumers MUST narrow the type themselves
- Round-trip fidelity is guaranteed only for JSON-safe values (strings, numbers, booleans, null, plain objects, arrays)

## Spec Dependencies

- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — hexagonal architecture and port placement rules
