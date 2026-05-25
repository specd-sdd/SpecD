/** RFC 7807 problem+json mapped for Studio UI. */
export interface ProblemJsonBody {
  readonly status?: number
  readonly title?: string
  readonly detail?: string
  readonly type?: string
  readonly code?: string
  readonly instance?: string
  readonly [key: string]: unknown
}

/** Base client error with HTTP problem fields. */
export class SpecdClientError extends Error {
  readonly status: number
  readonly title?: string
  readonly detail?: string
  readonly code?: string
  readonly problem: ProblemJsonBody

  constructor(status: number, problem: ProblemJsonBody, message?: string) {
    super(message ?? problem.detail ?? problem.title ?? `HTTP ${status}`)
    this.name = 'SpecdClientError'
    this.status = status
    this.title = problem.title
    this.detail = problem.detail
    this.code = typeof problem.code === 'string' ? problem.code : undefined
    this.problem = problem
  }
}

/** HTTP 409 artifact save conflict. */
export class ArtifactConflictError extends SpecdClientError {
  readonly serverHash?: string

  constructor(problem: ProblemJsonBody) {
    super(409, problem)
    this.name = 'ArtifactConflictError'
    this.serverHash =
      typeof problem.serverHash === 'string' ? problem.serverHash : undefined
  }
}
