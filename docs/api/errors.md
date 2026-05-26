---
title: Errors
sidebar_position: 4
---

# API errors

Failed requests return **RFC 7807-style problem+json** (`application/problem+json`).

## Shape

| Field    | Description                                  |
| -------- | -------------------------------------------- |
| `type`   | URN, e.g. `urn:specd:error:CHANGE_NOT_FOUND` |
| `title`  | Error class name                             |
| `status` | HTTP status (duplicated in body)             |
| `detail` | Human-readable message                       |
| `code`   | Stable `SpecdError` code for clients         |

Additional safe metadata from the domain error may appear on the body (for example `serverHash` on save conflicts).

## Common status codes

| Code                             | HTTP | Typical cause                                      |
| -------------------------------- | ---- | -------------------------------------------------- |
| `CHANGE_NOT_FOUND`               | 404  | Unknown change name                                |
| `SPEC_NOT_FOUND`                 | 404  | Unknown workspace spec path                        |
| `CHANGE_ARTIFACT_FILE_NOT_FOUND` | 404  | Artifact file missing on change                    |
| `SAVE_REQUIRES_FORCE`            | 409  | Optimistic save conflict; retry with `force: true` |
| `INVALIDATE_REQUIRES_FORCE`      | 409  | Invalidate blocked without force                   |
| `INVALID_STATE_TRANSITION`       | 409  | Lifecycle transition not allowed                   |
| `HOOK_FAILED`                    | 502  | Workflow hook command failed                       |
| `INTERNAL_ERROR`                 | 500  | Unexpected server error                            |

`@specd/client` maps these to `SpecdClientError` and `ArtifactConflictError` (409 saves). See [Client errors](../client/errors.md).

## Example

```http
PUT /v1/changes/my-change/artifacts/spec.md
```

```json
{
  "type": "urn:specd:error:SAVE_REQUIRES_FORCE",
  "title": "SaveRequiresForceError",
  "status": 409,
  "detail": "Artifact content changed on disk since load",
  "code": "SAVE_REQUIRES_FORCE",
  "serverHash": "abc123…"
}
```
