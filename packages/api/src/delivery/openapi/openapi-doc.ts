/** Minimal OpenAPI 3.1 stub for Studio API discovery. */
export const OPENAPI_STUB = {
  openapi: '3.1.0',
  info: {
    title: 'SpecD Studio API',
    version: '1.0.0',
    description: 'Spec-driven development HTTP API for SpecD Studio.',
  },
  servers: [{ url: '/v1' }],
  paths: {
    '/health': {
      get: {
        summary: 'Health check',
        responses: {
          '200': {
            description: 'Server is ready',
          },
        },
      },
    },
    '/project': {
      get: { summary: 'Project configuration' },
    },
    '/changes': {
      get: { summary: 'List active changes' },
      post: { summary: 'Create change' },
    },
    '/changes/{name}/preview': {
      get: {
        summary: 'Preview spec merge from saved change artifacts',
        parameters: [
          { name: 'name', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'specId', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Preview result (base/merged per file)' } },
      },
      post: {
        summary: 'Preview spec merge with optional in-memory artifact overrides',
        parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['specId'],
                properties: {
                  specId: { type: 'string' },
                  artifactOverrides: {
                    type: 'object',
                    additionalProperties: { type: 'string' },
                    description: 'Change-relative filename → draft content',
                  },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Preview result (base/merged per file)' } },
      },
    },
    '/changes/{name}/artifacts/{filename}/outline': {
      post: {
        summary: 'Outline a change artifact (saved bytes or draft content)',
        parameters: [
          { name: 'name', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'filename', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  content: {
                    type: 'string',
                    description: 'When set, outline this draft instead of disk',
                  },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Outline entry array' } },
      },
    },
    '/workspaces/{ws}/specs/{specPath}/outline': {
      get: {
        summary: 'Outline saved canonical spec artifact',
        parameters: [
          { name: 'ws', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'specPath', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'filename', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Outline entry array' } },
      },
      post: {
        summary: 'Outline draft spec artifact content without persisting',
        parameters: [
          { name: 'ws', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'specPath', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['filename', 'content'],
                properties: {
                  filename: { type: 'string' },
                  content: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Outline entry array' } },
      },
    },
  },
} as const
