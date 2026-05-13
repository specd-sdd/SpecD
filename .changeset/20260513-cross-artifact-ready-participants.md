---
'@specd/core': patch
---

20260513 - cross-artifact-ready-participants: Fix cross-artifact validation to rehydrate already-complete participants when validating a later artifact in a separate invocation. Previously, cross-artifact rules were deferred whenever a participant had been validated in an earlier invocation, even though the counterpart artifact was complete and available. The fix adds a rehydration step that reloads and parses completed participants so rules evaluate immediately instead of being falsely deferred.

Specs affected:

- `core:validate-artifacts`
