## What is inside a spec directory

A spec directory contains at minimum a `spec.md`. Most also include a `verify.md`.

**`spec.md`** — The requirement document. A typical structure:

```markdown
# Login

## Purpose

Describe what this capability is for and why it exists.

## Requirements

- Users must be able to log in with email and password.
- Failed login attempts must return a generic error message.
- Sessions expire after 24 hours of inactivity.

## Constraints

- Passwords must never be stored in plain text.
- Rate limiting must be applied to the login endpoint.
```

**`verify.md`** — The verification scenarios. Written as WHEN/THEN pairs:

```markdown
# Login — Verification

## Scenarios

WHEN a user submits valid credentials
THEN they receive an authenticated session token

WHEN a user submits invalid credentials
THEN they receive a generic error with no information about which field was wrong

WHEN a session has been inactive for more than 24 hours
THEN subsequent requests with that session token are rejected
```

The exact section headers and structure are governed by the active schema. The examples above follow the `@specd/schema-std` convention.
