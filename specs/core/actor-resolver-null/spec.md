# Actor Resolver Null

## Purpose

Fallback identity provider when no other provider is detected or selected.

## Requirements

### Requirement: Identity resolution

The resulting resolver MUST reject `identity()` calls with an error indicating that no identity source is available.

### Requirement: NullAutoDetectActorProvider

A `NullAutoDetectActorProvider` MUST be registered in the actor provider registry with `name: "null"`. Its `detect()` method MUST always return `null` — there is no environment to detect for the null provider. The `create()` method MUST return a `NullActorResolver`.

This provider is distinct from the `NullActorResolver` fallback: the resolver is the concrete implementation returned when all detection fails; the provider is the registered factory that produces it.

## Spec Dependencies

- [`core:actor-provider`](../actor-provider/spec.md)
