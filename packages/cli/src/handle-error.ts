import {
  ChangeNotFoundError,
  ChangeAlreadyExistsError,
  AlreadyInitialisedError,
  ApprovalGateDisabledError,
  SchemaNotFoundError,
  InvalidSpecPathError,
  SpecNotInChangeError,
  EmptySpecIdsError,
  ArtifactNotFoundError,
  CorruptedManifestError,
  ParserNotRegisteredError,
  UnsupportedPatternError,
  PathTraversalError,
  DeltaApplicationError,
} from '@specd/core'
import {
  InvalidStateTransitionError,
  ApprovalRequiredError,
  ArtifactConflictError,
  ArtifactNotOptionalError,
  HookFailedError,
  SchemaValidationError,
  ConfigValidationError,
} from '@specd/core'

/**
 * Maps an error to the appropriate exit code and writes a message to stderr.
 *
 * Exit codes:
 * - `1` — domain/user error (change not found, invalid transition, etc.)
 * - `2` — hook failure
 * - `3` — system/schema error
 *
 * This function never returns.
 *
 * @param err - The caught error
 */
export function handleError(err: unknown): never {
  if (
    err instanceof ChangeNotFoundError ||
    err instanceof ChangeAlreadyExistsError ||
    err instanceof AlreadyInitialisedError ||
    err instanceof InvalidStateTransitionError ||
    err instanceof ApprovalRequiredError ||
    err instanceof ArtifactNotOptionalError ||
    err instanceof ApprovalGateDisabledError ||
    err instanceof ArtifactConflictError ||
    err instanceof ConfigValidationError ||
    err instanceof InvalidSpecPathError ||
    err instanceof SpecNotInChangeError ||
    err instanceof EmptySpecIdsError ||
    err instanceof ArtifactNotFoundError ||
    err instanceof CorruptedManifestError ||
    err instanceof ParserNotRegisteredError ||
    err instanceof UnsupportedPatternError ||
    err instanceof PathTraversalError ||
    err instanceof DeltaApplicationError
  ) {
    process.stderr.write(`error: ${err.message}\n`)
    process.exit(1)
  }

  if (err instanceof HookFailedError) {
    process.stderr.write(`error: hook '${err.command}' failed\n${err.stderr}\n`)
    process.exit(2)
  }

  if (err instanceof SchemaNotFoundError || err instanceof SchemaValidationError) {
    process.stderr.write(`fatal: ${err.message}\n`)
    process.exit(3)
  }

  const debug = process.env['SPECD_DEBUG'] === '1'
  if (err instanceof Error) {
    process.stderr.write(`fatal: ${err.message}\n${debug && err.stack ? err.stack + '\n' : ''}`)
    process.exit(3)
  }

  process.stderr.write(`fatal: unexpected error\n${debug ? String(err) + '\n' : ''}`)
  process.exit(3)
}
