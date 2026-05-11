# Actor Resolver Privacy

## Purpose

To protect user privacy in public repositories, specd provides a `PrivacyActorResolver` decorator. It ensures that sensitive identity data (like real emails) is obfuscated or removed before being stored in change manifests or archives.

## Requirements

### Requirement: Privacy modes

The decorator MUST support three obfuscation modes:

- **`hash`**: Obfuscates the email using HMAC with a project-specific salt.
- **`mask`**: Partially masks the name and email parts (e.g. `j***z@e***.com`).
- **`anonymous`**: Replaces the identity with a static "Anonymous" placeholder.

### Requirement: HMAC hashing with salt

In `hash` mode, the decorator MUST use HMAC with SHA-256 and the configured `salt`.

- The salt MUST be treated as a secret.
- Hashing SHALL be deterministic: the same email and salt MUST always produce the same hash.

### Requirement: Masking strategy

In `mask` mode, the decorator MUST apply the following rules:

- **Name**: Keep first character, mask the rest (e.g. `J***n`).
- **Email Local Part**: Keep first and last characters, replace middle with `***`. If 2 chars or fewer, mask entire part.
- **Email Domain Part**: Keep first character and full extension (e.g. `e***.com`).

### Requirement: Metadata privacy

When any privacy mode is active, the decorator MUST:

- Remove `providerId`.
- Remove all `metadata` fields except those explicitly whitelisted in `allowedMetadataKeys`.

### Requirement: Excluded actors

The decorator MUST NOT apply any obfuscation or metadata removal to actors listed in `excludeActors`.

- Comparison MUST be case-insensitive against both `name` and `email`.
- When an actor is excluded, the raw identity is returned verbatim — including `providerId` and all `metadata` fields. This takes precedence over the "Metadata privacy" requirement.

## Spec Dependencies

- [`core:actor-resolver-port`](../actor-resolver-port/spec.md)
- [`core:config`](../config/spec.md)
