type JsonSchema = Record<string, unknown>

const CHANGE_STATE_VALUES = [
  'drafting',
  'designing',
  'ready',
  'pending-spec-approval',
  'spec-approved',
  'implementing',
  'verifying',
  'done',
  'pending-signoff',
  'signed-off',
  'archivable',
  'archiving',
] as const

const HOOK_PHASE_SELECTOR_VALUES = [
  'source.pre',
  'source.post',
  'target.pre',
  'target.post',
  'all',
] as const

const IMPACT_DIRECTION_VALUES = [
  'dependents',
  'dependencies',
  'upstream',
  'downstream',
  'both',
] as const

const GRAPH_RISK_VALUES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const

/** Shared schema for non-empty path and identifier segments. */
export const NON_EMPTY_STRING_SCHEMA: JsonSchema = {
  type: 'string',
  minLength: 1,
}

/** Shared schema for date-time request query values. */
export const DATE_TIME_STRING_SCHEMA: JsonSchema = {
  type: 'string',
  format: 'date-time',
}

/** Shared schema for boolean query flags serialized as strings. */
export const BOOLEAN_QUERY_SCHEMA: JsonSchema = {
  type: 'string',
  enum: ['true', 'false'],
}

/** Shared schema for boolean query flags that also accept `1`/`0`. */
export const BOOLEANISH_QUERY_SCHEMA: JsonSchema = {
  type: 'string',
  enum: ['true', 'false', '1', '0'],
}

/** Shared schema for positive integer query values serialized as strings. */
export const POSITIVE_INTEGER_QUERY_SCHEMA: JsonSchema = {
  type: 'string',
  pattern: '^[1-9][0-9]*$',
}

/** Shared schema for lifecycle step names. */
export const CHANGE_STATE_QUERY_SCHEMA: JsonSchema = {
  type: 'string',
  enum: [...CHANGE_STATE_VALUES],
}

/** Shared schema for hook phase selectors. */
export const HOOK_PHASE_SELECTOR_SCHEMA: JsonSchema = {
  type: 'string',
  enum: [...HOOK_PHASE_SELECTOR_VALUES],
}

/** Shared schema for graph impact directions. */
export const IMPACT_DIRECTION_QUERY_SCHEMA: JsonSchema = {
  type: 'string',
  enum: [...IMPACT_DIRECTION_VALUES],
}

/** Shared schema for graph hotspot risk thresholds. */
export const GRAPH_RISK_QUERY_SCHEMA: JsonSchema = {
  type: 'string',
  enum: [...GRAPH_RISK_VALUES],
}

/** Shared helper for strict object schemas. */
export function strictObjectSchema(options: {
  properties: Record<string, JsonSchema>
  required?: readonly string[]
  minProperties?: number
  anyOf?: readonly JsonSchema[]
  oneOf?: readonly JsonSchema[]
  allOf?: readonly JsonSchema[]
}): JsonSchema {
  return {
    type: 'object',
    additionalProperties: false,
    properties: options.properties,
    ...(options.required !== undefined ? { required: [...options.required] } : {}),
    ...(options.minProperties !== undefined ? { minProperties: options.minProperties } : {}),
    ...(options.anyOf !== undefined ? { anyOf: [...options.anyOf] } : {}),
    ...(options.oneOf !== undefined ? { oneOf: [...options.oneOf] } : {}),
    ...(options.allOf !== undefined ? { allOf: [...options.allOf] } : {}),
  }
}

export const API_PROBLEM_RESPONSES = {
  400: { $ref: 'ProblemJson#' },
  404: { $ref: 'ProblemJson#' },
  409: { $ref: 'ProblemJson#' },
  500: { $ref: 'ProblemJson#' },
} as const satisfies Record<number, JsonSchema>

export const PARAMS_CHANGE_NAME: JsonSchema = {
  ...strictObjectSchema({
    required: ['name'],
    properties: { name: NON_EMPTY_STRING_SCHEMA },
  }),
}

export const PARAMS_CHANGE_NAME_FILENAME: JsonSchema = {
  ...strictObjectSchema({
    required: ['name', 'filename'],
    properties: {
      name: NON_EMPTY_STRING_SCHEMA,
      filename: NON_EMPTY_STRING_SCHEMA,
    },
  }),
}

export const PARAMS_CHANGE_NAME_ARTIFACT_ID: JsonSchema = {
  ...strictObjectSchema({
    required: ['name', 'artifactId'],
    properties: {
      name: NON_EMPTY_STRING_SCHEMA,
      artifactId: NON_EMPTY_STRING_SCHEMA,
    },
  }),
}

export const PARAMS_WORKSPACE: JsonSchema = {
  ...strictObjectSchema({
    required: ['ws'],
    properties: { ws: NON_EMPTY_STRING_SCHEMA },
  }),
}

export const PARAMS_WORKSPACE_WILDCARD: JsonSchema = {
  ...strictObjectSchema({
    required: ['ws', '*'],
    properties: {
      ws: NON_EMPTY_STRING_SCHEMA,
      '*': NON_EMPTY_STRING_SCHEMA,
    },
  }),
}

export const PARAMS_GRAPH_WORKSPACE_WILDCARD: JsonSchema = {
  ...strictObjectSchema({
    required: ['workspace', '*'],
    properties: {
      workspace: NON_EMPTY_STRING_SCHEMA,
      '*': NON_EMPTY_STRING_SCHEMA,
    },
  }),
}

/**
 * Builds a Fastify route `schema` block with standard problem+json error responses.
 */
export function apiRouteSchema(options: {
  body?: string
  querystring?: JsonSchema
  params?: JsonSchema
  response: Record<number, string>
}): { schema: JsonSchema } {
  const response: Record<number, JsonSchema> = { ...API_PROBLEM_RESPONSES }
  for (const [status, schemaId] of Object.entries(options.response)) {
    response[Number(status)] = { $ref: `${schemaId}#` }
  }
  return {
    schema: {
      ...(options.body !== undefined ? { body: { $ref: `${options.body}#` } } : {}),
      ...(options.querystring !== undefined ? { querystring: options.querystring } : {}),
      ...(options.params !== undefined ? { params: options.params } : {}),
      response,
    },
  }
}
