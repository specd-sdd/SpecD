import { SpecdError } from '@specd/sdk'

/** RFC 7807 problem details for specd API errors. */
export interface ProblemJsonBody {
  readonly type: string
  readonly title: string
  readonly status: number
  readonly detail: string
  readonly code: string
  readonly [key: string]: unknown
}

const ERROR_STATUS: Readonly<Record<string, number>> = {
  CHANGE_NOT_FOUND: 404,
  CHANGE_ARTIFACT_FILE_NOT_FOUND: 404,
  SPEC_NOT_FOUND: 404,
  SCHEMA_NOT_FOUND: 404,
  ARCHIVE_NOT_FOUND: 404,
  SAVE_REQUIRES_FORCE: 409,
  INVALIDATE_REQUIRES_FORCE: 409,
  INVALID_STATE_TRANSITION: 409,
  HOOK_FAILED: 502,
}

/**
 * Maps a thrown value to HTTP status and problem+json body.
 *
 * @param err - Caught error
 */
export function toProblemJson(err: unknown): { status: number; body: ProblemJsonBody } {
  if (err instanceof SpecdError || isSpecdErrorLike(err)) {
    const code = err.code
    const status = ERROR_STATUS[code] ?? 400
    const body: ProblemJsonBody = {
      type: `urn:specd:error:${code}`,
      title: err.name,
      status,
      detail: err.message,
      code,
      ...extractSafeMetadata(err),
    }
    return { status, body }
  }

  const message = err instanceof Error ? err.message : String(err)
  return {
    status: 500,
    body: {
      type: 'urn:specd:error:INTERNAL_ERROR',
      title: 'Internal Server Error',
      status: 500,
      detail: message,
      code: 'INTERNAL_ERROR',
    },
  }
}

/**
 *
 * @param err
 */
function isSpecdErrorLike(err: unknown): err is SpecdError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'specd' in err &&
    (err as { specd?: unknown }).specd === true &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string'
  )
}

/**
 *
 * @param err
 */
function extractSafeMetadata(err: object): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(err)) {
    if (key.startsWith('_') || key === 'stack' || key === 'message' || key === 'name') {
      continue
    }
    const value = (err as Record<string, unknown>)[key]
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value
    }
  }
  return out
}
