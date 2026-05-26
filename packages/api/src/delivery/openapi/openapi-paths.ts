type JsonSchemaRef = { readonly $ref: string }

function ref(name: string): JsonSchemaRef {
  return { $ref: `#/components/schemas/${name}` }
}

function jsonOk(schema: string, description = 'OK'): object {
  return {
    '200': {
      description,
      content: { 'application/json': { schema: ref(schema) } },
    },
  }
}

function jsonBody(schema: string, required = true): object {
  return {
    required,
    content: { 'application/json': { schema: ref(schema) } },
  }
}

function problemResponses(): object {
  return {
    '400': {
      description: 'Client error',
      content: { 'application/problem+json': { schema: ref('ProblemJson') } },
    },
    '404': {
      description: 'Not found',
      content: { 'application/problem+json': { schema: ref('ProblemJson') } },
    },
    '409': {
      description: 'Conflict',
      content: { 'application/problem+json': { schema: ref('ProblemJson') } },
    },
    '500': {
      description: 'Server error',
      content: { 'application/problem+json': { schema: ref('ProblemJson') } },
    },
  }
}

const namePath = {
  name: 'name',
  in: 'path',
  required: true,
  schema: { type: 'string' },
} as const

const filenamePath = {
  name: 'filename',
  in: 'path',
  required: true,
  schema: { type: 'string' },
} as const

const wsPath = {
  name: 'ws',
  in: 'path',
  required: true,
  schema: { type: 'string' },
} as const

const specPathParam = {
  name: 'specPath',
  in: 'path',
  required: true,
  schema: { type: 'string' },
  description: 'Spec path within workspace; may contain slashes (e.g. auth/login)',
} as const

/**
 * OpenAPI 3.1 path items for `/v1/*` (paths relative to server url `/v1`).
 */
export const OPENAPI_PATHS = {
  '/health': {
    get: {
      operationId: 'getHealth',
      summary: 'Health check',
      tags: ['Meta'],
      responses: { ...jsonOk('HealthDto'), ...problemResponses() },
    },
  },
  '/project': {
    get: {
      operationId: 'getProject',
      summary: 'Project configuration',
      tags: ['Project'],
      responses: { ...jsonOk('ProjectDto'), ...problemResponses() },
    },
  },
  '/project/status': {
    get: {
      operationId: 'getProjectStatus',
      summary: 'Project status and graph summary',
      tags: ['Project'],
      responses: { ...jsonOk('ProjectStatusDto'), ...problemResponses() },
    },
  },
  '/project/context': {
    get: {
      operationId: 'getProjectContext',
      summary: 'Compiled project context',
      tags: ['Project'],
      parameters: [
        { name: 'followDeps', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
        { name: 'depth', in: 'query', schema: { type: 'integer' } },
      ],
      responses: { ...jsonOk('ProjectContextDto'), ...problemResponses() },
    },
  },
  '/project/schema': {
    get: {
      operationId: 'getProjectSchema',
      summary: 'Active schema metadata',
      tags: ['Project'],
      responses: { ...jsonOk('ProjectSchemaDto'), ...problemResponses() },
    },
  },
  '/project/schema/validate': {
    post: {
      operationId: 'validateProjectSchema',
      summary: 'Validate project schema',
      tags: ['Project'],
      responses: { ...jsonOk('SchemaValidateResultDto'), ...problemResponses() },
    },
  },
  '/logs': {
    get: {
      operationId: 'getLogs',
      summary: 'Tail project log ring',
      tags: ['Logs'],
      parameters: [
        { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 500 } },
        {
          name: 'prettier',
          in: 'query',
          schema: { type: 'string', enum: ['true', 'false', '1', '0'] },
        },
      ],
      responses: { ...jsonOk('LogReadDto'), ...problemResponses() },
    },
    post: {
      operationId: 'appendLog',
      summary: 'Append studio log line',
      tags: ['Logs'],
      requestBody: jsonBody('AppendLogBody'),
      responses: { ...jsonOk('OkDto'), ...problemResponses() },
    },
  },
  '/studio/output': {
    get: {
      operationId: 'getStudioOutput',
      summary: 'List buffered Studio output',
      tags: ['Studio'],
      parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', maximum: 500 } }],
      responses: { ...jsonOk('StudioOutputListDto'), ...problemResponses() },
    },
    post: {
      operationId: 'appendStudioOutput',
      summary: 'Append Studio output entry',
      tags: ['Studio'],
      requestBody: jsonBody('AppendStudioOutputBody'),
      responses: { ...jsonOk('StudioOutputListDto'), ...problemResponses() },
    },
  },
  '/changes': {
    get: {
      operationId: 'listChanges',
      summary: 'List active changes',
      tags: ['Changes'],
      responses: { ...jsonOk('ChangeSummaryList'), ...problemResponses() },
    },
    post: {
      operationId: 'createChange',
      summary: 'Create change',
      tags: ['Changes'],
      requestBody: jsonBody('CreateChangeBody'),
      responses: { ...jsonOk('ChangeSummaryDto'), ...problemResponses() },
    },
  },
  '/changes/overlaps': {
    get: {
      operationId: 'getChangeOverlaps',
      summary: 'Detect overlapping active changes',
      tags: ['Changes'],
      responses: {
        '200': {
          description: 'Overlap groups',
          content: { 'application/json': { schema: { type: 'array' } } },
        },
        ...problemResponses(),
      },
    },
  },
  '/drafts': {
    get: {
      operationId: 'listDrafts',
      summary: 'List draft changes',
      tags: ['Changes'],
      responses: { ...jsonOk('ChangeSummaryList'), ...problemResponses() },
    },
  },
  '/discarded': {
    get: {
      operationId: 'listDiscarded',
      summary: 'List discarded changes',
      tags: ['Changes'],
      responses: { ...jsonOk('ChangeSummaryList'), ...problemResponses() },
    },
  },
  '/archived-changes': {
    get: {
      operationId: 'listArchivedChanges',
      summary: 'List archived changes',
      tags: ['Changes'],
      responses: {
        '200': {
          description: 'Archive index',
          content: {
            'application/json': {
              schema: { type: 'array', items: ref('ArchivedChangeListItemDto') },
            },
          },
        },
        ...problemResponses(),
      },
    },
  },
  '/archived-changes/{name}': {
    get: {
      operationId: 'getArchivedChange',
      summary: 'Archived change detail',
      tags: ['Changes'],
      parameters: [namePath],
      responses: { ...jsonOk('ArchivedChangeDetailDto'), ...problemResponses() },
    },
  },
  '/changes/{name}': {
    get: {
      operationId: 'getChange',
      summary: 'Change detail',
      tags: ['Changes'],
      parameters: [namePath],
      responses: { ...jsonOk('ChangeDetailDto'), ...problemResponses() },
    },
    patch: {
      operationId: 'patchChange',
      summary: 'Edit change metadata and spec sets',
      tags: ['Changes'],
      parameters: [namePath],
      requestBody: jsonBody('PatchChangeBody', false),
      responses: { ...jsonOk('ChangeDetailDto'), ...problemResponses() },
    },
  },
  '/changes/{name}/status': {
    get: {
      operationId: 'getChangeStatus',
      summary: 'Change status, artifact DAG, blockers',
      tags: ['Changes'],
      parameters: [
        namePath,
        { name: 'ifModifiedSince', in: 'query', schema: { type: 'string' } },
        {
          name: 'refreshImplementation',
          in: 'query',
          schema: { type: 'string', enum: ['true', 'false'] },
        },
      ],
      responses: { ...jsonOk('ChangeStatusDto'), ...problemResponses() },
    },
  },
  '/changes/{name}/artifacts': {
    get: {
      operationId: 'listChangeArtifacts',
      summary: 'Artifact list for change',
      tags: ['Changes'],
      parameters: [namePath],
      responses: { ...jsonOk('ArtifactListDto'), ...problemResponses() },
    },
  },
  '/changes/{name}/artifacts/{filename}': {
    get: {
      operationId: 'getChangeArtifact',
      summary: 'Artifact file content',
      tags: ['Changes'],
      parameters: [namePath, filenamePath],
      responses: { ...jsonOk('ArtifactContentDto'), ...problemResponses() },
    },
    put: {
      operationId: 'saveChangeArtifact',
      summary: 'Save artifact content',
      tags: ['Changes'],
      parameters: [namePath, filenamePath],
      requestBody: jsonBody('SaveArtifactBody'),
      responses: { ...jsonOk('ArtifactContentDto'), ...problemResponses() },
    },
  },
  '/changes/{name}/context': {
    get: {
      operationId: 'getChangeContext',
      summary: 'Compiled change context',
      tags: ['Changes'],
      parameters: [
        namePath,
        { name: 'step', in: 'query', schema: { type: 'string' } },
        {
          name: 'includeChangeSpecs',
          in: 'query',
          schema: { type: 'string', enum: ['true', 'false'] },
        },
        { name: 'followDeps', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
        { name: 'depth', in: 'query', schema: { type: 'integer' } },
        { name: 'fingerprint', in: 'query', schema: { type: 'string' } },
      ],
      responses: { ...jsonOk('CompiledContextDto'), ...problemResponses() },
    },
  },
  '/changes/{name}/preview': {
    get: {
      operationId: 'previewChangeGet',
      summary: 'Preview spec merge from saved artifacts',
      tags: ['Changes'],
      parameters: [
        namePath,
        { name: 'specId', in: 'query', required: true, schema: { type: 'string' } },
      ],
      responses: { ...jsonOk('PreviewResultDto'), ...problemResponses() },
    },
    post: {
      operationId: 'previewChangePost',
      summary: 'Preview with optional artifact overrides',
      tags: ['Changes'],
      parameters: [namePath],
      requestBody: jsonBody('PreviewChangeBody'),
      responses: { ...jsonOk('PreviewResultDto'), ...problemResponses() },
    },
  },
  '/changes/{name}/artifacts/{filename}/outline': {
    post: {
      operationId: 'outlineChangeArtifact',
      summary: 'Outline change artifact',
      tags: ['Changes'],
      parameters: [namePath, filenamePath],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { content: { type: 'string', description: 'Draft content to outline' } },
            },
          },
        },
      },
      responses: { ...jsonOk('OutlineEntryList'), ...problemResponses() },
    },
  },
  '/changes/{name}/implementation-review': {
    get: {
      operationId: 'getImplementationReview',
      summary: 'Implementation tracking review',
      tags: ['Changes'],
      parameters: [namePath],
      responses: { ...jsonOk('ImplementationReviewDto'), ...problemResponses() },
    },
  },
  '/changes/{name}/hook-instructions': {
    get: {
      operationId: 'getHookInstructions',
      summary: 'Workflow hook instructions',
      tags: ['Changes'],
      parameters: [
        namePath,
        { name: 'step', in: 'query', schema: { type: 'string' } },
        { name: 'phase', in: 'query', schema: { type: 'string', enum: ['pre', 'post'] } },
      ],
      responses: {
        '200': {
          description: 'Hook instruction payload',
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        ...problemResponses(),
      },
    },
  },
  '/changes/{name}/artifacts/{artifactId}/instruction': {
    get: {
      operationId: 'getArtifactInstruction',
      summary: 'Artifact instruction text',
      tags: ['Changes'],
      parameters: [
        namePath,
        { name: 'artifactId', in: 'path', required: true, schema: { type: 'string' } },
      ],
      responses: {
        '200': {
          description: 'Instruction',
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        ...problemResponses(),
      },
    },
  },
  '/changes/{name}/validate': {
    post: {
      operationId: 'validateChange',
      summary: 'Validate change / spec / artifact',
      tags: ['Changes'],
      parameters: [
        namePath,
        { name: 'specId', in: 'query', schema: { type: 'string' } },
        { name: 'artifactId', in: 'query', schema: { type: 'string' } },
      ],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                specId: { type: 'string' },
                artifactId: { type: 'string' },
              },
            },
          },
        },
      },
      responses: { ...jsonOk('ValidateResultDto'), ...problemResponses() },
    },
  },
  '/changes/{name}/validate-all': {
    post: {
      operationId: 'validateChangeBatch',
      summary: 'Batch validate change',
      tags: ['Changes'],
      parameters: [namePath, { name: 'artifactId', in: 'query', schema: { type: 'string' } }],
      requestBody: {
        content: {
          'application/json': {
            schema: { type: 'object', properties: { artifactId: { type: 'string' } } },
          },
        },
      },
      responses: { ...jsonOk('ValidateBatchResultDto'), ...problemResponses() },
    },
  },
  '/changes/{name}/transition': {
    post: {
      operationId: 'transitionChange',
      summary: 'Lifecycle transition',
      tags: ['Changes'],
      parameters: [namePath],
      requestBody: jsonBody('TransitionChangeBody'),
      responses: { ...jsonOk('ChangeDetailDto'), ...problemResponses() },
    },
  },
  '/changes/{name}/draft': {
    post: {
      operationId: 'draftChange',
      summary: 'Move change to drafts',
      tags: ['Changes'],
      parameters: [namePath],
      responses: { ...jsonOk('ChangeDetailDto'), ...problemResponses() },
    },
  },
  '/changes/{name}/restore': {
    post: {
      operationId: 'restoreChange',
      summary: 'Restore change from draft',
      tags: ['Changes'],
      parameters: [namePath],
      responses: { ...jsonOk('ChangeDetailDto'), ...problemResponses() },
    },
  },
  '/changes/{name}/discard': {
    post: {
      operationId: 'discardChange',
      summary: 'Discard change',
      tags: ['Changes'],
      parameters: [namePath],
      requestBody: {
        content: {
          'application/json': {
            schema: { type: 'object', properties: { reason: { type: 'string' } } },
          },
        },
      },
      responses: { ...jsonOk('ChangeDetailDto'), ...problemResponses() },
    },
  },
  '/changes/{name}/archive': {
    post: {
      operationId: 'archiveChange',
      summary: 'Archive change',
      tags: ['Changes'],
      parameters: [namePath],
      responses: {
        '200': {
          description: 'Archive result',
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        ...problemResponses(),
      },
    },
  },
  '/changes/{name}/approve-spec': {
    post: {
      operationId: 'approveSpec',
      summary: 'Approve spec gate',
      tags: ['Changes'],
      parameters: [namePath],
      requestBody: {
        content: {
          'application/json': {
            schema: { type: 'object', properties: { reason: { type: 'string' } } },
          },
        },
      },
      responses: { ...jsonOk('ChangeDetailDto'), ...problemResponses() },
    },
  },
  '/changes/{name}/approve-signoff': {
    post: {
      operationId: 'approveSignoff',
      summary: 'Approve signoff gate',
      tags: ['Changes'],
      parameters: [namePath],
      requestBody: {
        content: {
          'application/json': {
            schema: { type: 'object', properties: { reason: { type: 'string' } } },
          },
        },
      },
      responses: { ...jsonOk('ChangeDetailDto'), ...problemResponses() },
    },
  },
  '/changes/{name}/invalidate': {
    post: {
      operationId: 'invalidateChange',
      summary: 'Invalidate change',
      tags: ['Changes'],
      parameters: [namePath],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { reason: { type: 'string' }, force: { type: 'boolean' } },
            },
          },
        },
      },
      responses: { ...jsonOk('ChangeDetailDto'), ...problemResponses() },
    },
  },
  '/changes/{name}/skip-artifact': {
    post: {
      operationId: 'skipArtifact',
      summary: 'Skip artifact',
      tags: ['Changes'],
      parameters: [namePath],
      requestBody: {
        content: {
          'application/json': {
            schema: { type: 'object', properties: { artifactId: { type: 'string' } } },
          },
        },
      },
      responses: { ...jsonOk('ChangeDetailDto'), ...problemResponses() },
    },
  },
  '/changes/{name}/spec-ids': {
    patch: {
      operationId: 'patchChangeSpecIds',
      summary: 'Add or remove spec IDs',
      tags: ['Changes'],
      parameters: [namePath],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                add: { type: 'array', items: { type: 'string' } },
                remove: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
      responses: { ...jsonOk('ChangeDetailDto'), ...problemResponses() },
    },
  },
  '/changes/{name}/spec-dependencies': {
    patch: {
      operationId: 'patchSpecDependencies',
      summary: 'Update spec dependencies on change',
      tags: ['Changes'],
      parameters: [namePath],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['specId'],
              properties: {
                specId: { type: 'string' },
                add: { type: 'array', items: { type: 'string' } },
                remove: { type: 'array', items: { type: 'string' } },
                set: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Updated deps',
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        ...problemResponses(),
      },
    },
  },
  '/changes/{name}/implementation-tracking': {
    patch: {
      operationId: 'patchImplementationTracking',
      summary: 'Patch implementation tracking',
      tags: ['Changes'],
      parameters: [namePath],
      requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
      responses: {
        '200': {
          description: 'Tracking state',
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        ...problemResponses(),
      },
    },
  },
  '/workspaces': {
    get: {
      operationId: 'listWorkspaces',
      summary: 'List workspaces',
      tags: ['Workspaces'],
      responses: { ...jsonOk('WorkspaceList'), ...problemResponses() },
    },
  },
  '/workspaces/{ws}/specs': {
    get: {
      operationId: 'getWorkspaceSpecTree',
      summary: 'Spec tree for workspace',
      tags: ['Workspaces'],
      parameters: [wsPath],
      responses: { ...jsonOk('WorkspaceSpecTreeDto'), ...problemResponses() },
    },
  },
  '/workspaces/{ws}/specs/validate': {
    post: {
      operationId: 'validateWorkspaceSpecs',
      summary: 'Validate specs in workspace',
      tags: ['Workspaces'],
      parameters: [wsPath, { name: 'specPath', in: 'query', schema: { type: 'string' } }],
      responses: {
        '200': {
          description: 'Validation summary',
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        ...problemResponses(),
      },
    },
  },
  '/workspaces/{ws}/specs/{specPath}': {
    get: {
      operationId: 'getSpecDetail',
      summary: 'Spec detail (wildcard path segment)',
      tags: ['Specs'],
      parameters: [wsPath, specPathParam],
      responses: { ...jsonOk('SpecDetailDto'), ...problemResponses() },
    },
  },
  '/workspaces/{ws}/specs/{specPath}/artifacts/{filename}': {
    get: {
      operationId: 'getSpecArtifact',
      summary: 'Canonical spec artifact content',
      tags: ['Specs'],
      parameters: [wsPath, specPathParam, filenamePath],
      responses: { ...jsonOk('ArtifactContentDto'), ...problemResponses() },
    },
  },
  '/workspaces/{ws}/specs/{specPath}/context': {
    get: {
      operationId: 'getSpecContext',
      summary: 'Spec context entries',
      tags: ['Specs'],
      parameters: [
        wsPath,
        specPathParam,
        { name: 'followDeps', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
        { name: 'depth', in: 'query', schema: { type: 'integer' } },
      ],
      responses: { ...jsonOk('SpecContextDto'), ...problemResponses() },
    },
  },
  '/workspaces/{ws}/specs/{specPath}/outline': {
    get: {
      operationId: 'outlineSpecGet',
      summary: 'Outline saved spec artifact',
      tags: ['Specs'],
      parameters: [
        wsPath,
        specPathParam,
        { name: 'filename', in: 'query', schema: { type: 'string' } },
        { name: 'artifactId', in: 'query', schema: { type: 'string' } },
      ],
      responses: { ...jsonOk('OutlineEntryList'), ...problemResponses() },
    },
    post: {
      operationId: 'outlineSpecPost',
      summary: 'Outline draft spec content',
      tags: ['Specs'],
      parameters: [wsPath, specPathParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                filename: { type: 'string' },
                content: { type: 'string' },
              },
            },
          },
        },
      },
      responses: { ...jsonOk('OutlineEntryList'), ...problemResponses() },
    },
  },
  '/workspaces/{ws}/specs/{specPath}/metadata': {
    post: {
      operationId: 'saveSpecMetadata',
      summary: 'Save or generate spec metadata',
      tags: ['Specs'],
      parameters: [wsPath, specPathParam],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                metadata: { type: 'string' },
                generate: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: { ...jsonOk('OkDto'), ...problemResponses() },
    },
  },
  '/specs/search': {
    get: {
      operationId: 'searchSpecs',
      summary: 'Search specs',
      tags: ['Specs'],
      parameters: [
        { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
        { name: 'workspace', in: 'query', schema: { type: 'string' } },
      ],
      responses: { ...jsonOk('SpecSummaryList'), ...problemResponses() },
    },
  },
  '/graph/status': {
    get: {
      operationId: 'getGraphStatus',
      summary: 'Graph index statistics',
      tags: ['Graph'],
      responses: { ...jsonOk('GraphStatusDto'), ...problemResponses() },
    },
  },
  '/graph/index': {
    post: {
      operationId: 'indexGraph',
      summary: 'Index code graph',
      tags: ['Graph'],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { workspaces: { type: 'array', items: { type: 'string' } } },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Index result',
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        ...problemResponses(),
      },
    },
  },
  '/graph/search': {
    get: {
      operationId: 'searchGraph',
      summary: 'BM25 search symbols and specs',
      tags: ['Graph'],
      parameters: [
        { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
        { name: 'symbols', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
        { name: 'specs', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
        { name: 'limit', in: 'query', schema: { type: 'integer' } },
        { name: 'workspace', in: 'query', schema: { type: 'string' } },
      ],
      responses: { ...jsonOk('GraphSearchResultDto'), ...problemResponses() },
    },
  },
  '/graph/impact': {
    get: {
      operationId: 'getGraphImpact',
      summary: 'Symbol or file impact analysis',
      tags: ['Graph'],
      parameters: [
        { name: 'symbol', in: 'query', schema: { type: 'string' } },
        { name: 'file', in: 'query', schema: { type: 'string' } },
        { name: 'direction', in: 'query', schema: { type: 'string' } },
        { name: 'depth', in: 'query', schema: { type: 'integer' } },
      ],
      responses: { ...jsonOk('GraphImpactDto'), ...problemResponses() },
    },
  },
  '/graph/hotspots': {
    get: {
      operationId: 'getGraphHotspots',
      summary: 'High-risk graph hotspots',
      tags: ['Graph'],
      parameters: [
        { name: 'minRisk', in: 'query', schema: { type: 'string' } },
        { name: 'limit', in: 'query', schema: { type: 'integer' } },
      ],
      responses: {
        '200': {
          description: 'Hotspots',
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        ...problemResponses(),
      },
    },
  },
  '/graph/specs/{workspace}/{specPath}': {
    get: {
      operationId: 'getGraphSpecCoverage',
      summary: 'Graph coverage for a spec',
      tags: ['Graph'],
      parameters: [
        { name: 'workspace', in: 'path', required: true, schema: { type: 'string' } },
        specPathParam,
      ],
      responses: { ...jsonOk('GraphSpecCoverageDto'), ...problemResponses() },
    },
  },
  '/graph/changes/{name}': {
    get: {
      operationId: 'getChangeGraphView',
      summary: 'Graph view for change specs',
      tags: ['Graph'],
      parameters: [namePath],
      responses: { ...jsonOk('ChangeGraphViewDto'), ...problemResponses() },
    },
  },
} as const

/** OpenAPI security schemes (reserved for future bearer auth). */
export const OPENAPI_SECURITY_SCHEMES = {
  bearerAuth: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'Not required when api.auth.type is disabled (v1 default).',
  },
} as const
