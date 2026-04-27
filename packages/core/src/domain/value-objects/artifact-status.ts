/**
 * Represents the validation state of an artifact within a change.
 *
 * - `missing` — artifact file has not been created yet
 * - `in-progress` — artifact exists but has not been validated, or a dependency is not complete
 * - `complete` — artifact has been validated and its hash recorded
 * - `skipped` — artifact is optional and was explicitly skipped; satisfies dependency requirements
 * - `pending-review` — artifact was previously validated but must be reviewed again
 * - `drifted-pending-review` — validated content drifted from the recorded hash and must be reviewed
 * - `pending-parent-artifact-review` — artifact is blocked by an upstream dependency that requires review
 */
export type ArtifactStatus =
  | 'missing'
  | 'in-progress'
  | 'complete'
  | 'skipped'
  | 'pending-review'
  | 'drifted-pending-review'
  | 'pending-parent-artifact-review'
