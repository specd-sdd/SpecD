import { OPENAPI_PATHS, OPENAPI_SECURITY_SCHEMES } from './openapi-paths.js'
import { OPENAPI_SCHEMAS } from './openapi-schemas.js'

/**
 * OpenAPI 3.1 document served at `GET /v1/openapi.json`.
 * Schemas mirror `packages/api/src/delivery/http/dto/*`; paths mirror `registerV1Routes`.
 */
export const OPENAPI_DOC = {
  openapi: '3.1.0',
  info: {
    title: 'SpecD Studio API',
    version: '1.0.0',
    description:
      'Spec-driven development HTTP API for SpecD Studio. All routes are mounted under `/v1`. ' +
      'Human-readable reference: repository `docs/api/routes.md` and `docs/api/dtos.md`.',
  },
  servers: [{ url: '/v1', description: 'Relative to API origin (e.g. http://127.0.0.1:4450/v1)' }],
  tags: [
    { name: 'Meta', description: 'Health and discovery' },
    { name: 'Project', description: 'Project config, status, schema' },
    { name: 'Changes', description: 'Change lifecycle and artifacts' },
    { name: 'Workspaces', description: 'Workspaces and spec trees' },
    { name: 'Specs', description: 'Canonical spec reads and search' },
    { name: 'Graph', description: 'Code graph operations' },
    { name: 'Logs', description: 'Project log ring' },
    { name: 'Studio', description: 'Studio output buffer' },
  ],
  paths: OPENAPI_PATHS,
  components: {
    schemas: OPENAPI_SCHEMAS,
    securitySchemes: OPENAPI_SECURITY_SCHEMES,
  },
} as const

/** @deprecated Use {@link OPENAPI_DOC}. Kept for existing imports. */
export const OPENAPI_STUB = OPENAPI_DOC
