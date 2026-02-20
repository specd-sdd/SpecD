/**
 * Represents the validation state of an artifact within a change.
 *
 * - `missing` — artifact file has not been created yet
 * - `in-progress` — artifact exists but has not been validated, or a dependency is not complete
 * - `complete` — artifact has been validated and its hash recorded
 */
export type ArtifactStatus = 'missing' | 'in-progress' | 'complete'
