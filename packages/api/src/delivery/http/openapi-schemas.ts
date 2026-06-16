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

const INVALIDATION_POLICY_VALUES = ['none', 'surgical', 'downstream', 'global'] as const

const LOG_LEVEL_VALUES = ['debug', 'info', 'warn', 'error'] as const

const IMPLEMENTATION_TRACKING_ACTION_VALUES = ['add', 'remove', 'ignore', 'resolve'] as const

/**
 * JSON Schemas used by `@fastify/swagger` to generate OpenAPI components.
 *
 * These are intentionally defined once (as canonical DTO JSON Schemas) and then:
 * - registered on the Fastify instance via `addSchema`
 * - referenced from route `schema` blocks via `$ref: "<SchemaId>#"`
 */
export const API_OPENAPI_SCHEMAS: Record<string, JsonSchema> = {
  ProblemJson: {
    type: 'object',
    required: ['type', 'title', 'status', 'detail', 'code'],
    additionalProperties: true,
    properties: {
      type: { type: 'string', description: 'URN, e.g. urn:specd:error:CHANGE_NOT_FOUND' },
      title: { type: 'string' },
      status: { type: 'integer' },
      detail: { type: 'string' },
      code: { type: 'string' },
    },
  },
  HealthDto: {
    type: 'object',
    required: ['status', 'auth'],
    properties: {
      status: { type: 'string', enum: ['ok'] },
      auth: {
        type: 'object',
        required: ['type'],
        properties: { type: { type: 'string' } },
      },
    },
  },
  ProjectDto: {
    type: 'object',
    required: ['name', 'projectRoot', 'schemaRef', 'workspaces', 'approvals', 'auth'],
    properties: {
      name: { type: 'string' },
      projectRoot: { type: 'string' },
      schemaRef: { type: 'string' },
      workspaces: {
        type: 'array',
        items: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            prefix: { type: 'string' },
            ownership: { type: 'string' },
          },
        },
      },
      approvals: {
        type: 'object',
        properties: {
          spec: { type: 'boolean' },
          signoff: { type: 'boolean' },
        },
      },
      auth: {
        type: 'object',
        properties: { type: { type: 'string' } },
      },
    },
  },
  ProjectStatusDto: {
    type: 'object',
    properties: {
      activeChanges: { type: 'integer' },
      drafts: { type: 'integer' },
      discarded: { type: 'integer' },
      archived: { type: 'integer' },
      specsByWorkspace: { type: 'object', additionalProperties: { type: 'integer' } },
      graph: {
        type: 'object',
        properties: {
          lastIndexedAt: { type: 'string', nullable: true },
          stale: { type: 'boolean', nullable: true },
          fingerprintMismatch: { type: 'boolean', nullable: true },
          fileCount: { type: 'integer', nullable: true },
          symbolCount: { type: 'integer', nullable: true },
        },
      },
      approvals: {
        type: 'object',
        properties: {
          specEnabled: { type: 'boolean' },
          signoffEnabled: { type: 'boolean' },
        },
      },
    },
  },
  ProjectContextDto: {
    type: 'object',
    properties: {
      content: { type: 'string' },
      warnings: { type: 'array', items: { type: 'string' } },
    },
  },
  ProjectSchemaDto: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      version: { type: 'integer' },
      artifacts: {
        type: 'array',
        items: {
          type: 'object',
          properties: { id: { type: 'string' }, scope: { type: 'string' } },
        },
      },
      raw: { type: 'boolean' },
      schemaRef: { type: 'string' },
    },
  },
  SchemaValidateResultDto: {
    type: 'object',
    properties: {
      valid: { type: 'boolean' },
      errors: { type: 'array', items: { type: 'object' } },
      warnings: { type: 'array', items: { type: 'object' } },
    },
  },
  ChangeSummaryDto: {
    type: 'object',
    required: ['name', 'state', 'specIds', 'updatedAt', 'blockerCount'],
    properties: {
      name: { type: 'string' },
      description: { type: 'string' },
      state: { type: 'string' },
      specIds: { type: 'array', items: { type: 'string' } },
      updatedAt: { type: 'string', format: 'date-time' },
      blockerCount: { type: 'integer' },
    },
  },
  ChangeSummaryList: {
    type: 'array',
    items: { $ref: 'ChangeSummaryDto#' },
  },
  CreateChangeBody: {
    type: 'object',
    required: ['name'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1 },
      specIds: { type: 'array', items: { type: 'string' } },
      description: { type: 'string' },
      invalidationPolicy: {
        type: 'string',
        enum: [...INVALIDATION_POLICY_VALUES],
      },
    },
  },
  ChangeDetailDto: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      state: { type: 'string' },
      specIds: { type: 'array', items: { type: 'string' } },
      specDependsOn: {
        type: 'object',
        additionalProperties: { type: 'array', items: { type: 'string' } },
      },
      schemaName: { type: 'string' },
      schemaVersion: { type: 'integer' },
      description: { type: 'string' },
      invalidationPolicy: { type: 'string' },
      updatedAt: { type: 'string', format: 'date-time' },
      history: { type: 'array', items: { type: 'object' } },
      approvals: {
        type: 'object',
        properties: {
          specApproved: { type: 'boolean' },
          signoffApproved: { type: 'boolean' },
        },
      },
      archivedMeta: { type: 'object' },
    },
  },
  ChangeStatusDto: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      state: { type: 'string' },
      updatedAt: { type: 'string' },
      unchanged: { type: 'boolean' },
      specIds: { type: 'array', items: { type: 'string' } },
      blockers: {
        type: 'array',
        items: {
          type: 'object',
          properties: { code: { type: 'string' }, message: { type: 'string' } },
        },
      },
      nextAction: { type: 'object' },
      totalTasks: { type: 'integer' },
      completedTasks: { type: 'integer' },
      artifacts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            hasTasks: { type: 'boolean' },
            totalTasks: { type: 'integer' },
            completedTasks: { type: 'integer' },
            state: { type: 'string' },
            effectiveStatus: { type: 'string' },
            displayStatus: { type: 'string' },
            files: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  key: { type: 'string' },
                  filename: { type: 'string' },
                  state: { type: 'string' },
                  hasDrift: { type: 'boolean' },
                  displayStatus: { type: 'string' },
                },
              },
            },
          },
        },
      },
      review: { type: 'object' },
      lifecycle: { type: 'object' },
    },
  },
  ArtifactListDto: {
    type: 'object',
    properties: {
      artifacts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            filename: { type: 'string' },
            type: { type: 'string' },
            hasTasks: { type: 'boolean' },
            totalTasks: { type: 'integer' },
            completedTasks: { type: 'integer' },
            state: { type: 'string' },
            displayStatus: { type: 'string' },
          },
        },
      },
    },
  },
  ArtifactContentDto: {
    type: 'object',
    properties: {
      filename: { type: 'string' },
      content: { type: 'string' },
      originalHash: { type: 'string' },
      contentHash: { type: 'string' },
      updatedAt: { type: 'string' },
    },
  },
  SaveArtifactBody: {
    type: 'object',
    required: ['content'],
    additionalProperties: false,
    properties: {
      content: { type: 'string' },
      originalHash: { type: 'string' },
      force: { type: 'boolean' },
    },
  },
  PreviewResultDto: {
    type: 'object',
    properties: {
      specId: { type: 'string' },
      files: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            filename: { type: 'string' },
            base: { type: 'string' },
            merged: { type: 'string' },
          },
        },
      },
    },
  },
  PreviewChangeBody: {
    type: 'object',
    required: ['specId'],
    additionalProperties: false,
    properties: {
      specId: { type: 'string', minLength: 1 },
      artifactOverrides: {
        type: 'object',
        additionalProperties: { type: 'string' },
        description: 'Change-relative filename → draft content',
      },
    },
  },
  CompiledContextDto: {
    type: 'object',
    properties: {
      content: { type: 'string' },
      fingerprint: { type: 'string' },
      status: { type: 'string', enum: ['unchanged'] },
    },
  },
  ValidateResultDto: {
    type: 'object',
    properties: {
      passed: { type: 'boolean' },
      failures: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            artifactId: { type: 'string' },
            path: { type: 'string' },
          },
        },
      },
      warnings: { type: 'array', items: { type: 'string' } },
      files: { type: 'array', items: { type: 'string' } },
    },
  },
  ValidateBatchResultDto: {
    type: 'object',
    properties: {
      passed: { type: 'boolean' },
      total: { type: 'integer' },
      results: { type: 'array', items: { type: 'object' } },
    },
  },
  TransitionChangeBody: {
    type: 'object',
    required: ['to'],
    additionalProperties: false,
    properties: {
      to: { type: 'string', enum: [...CHANGE_STATE_VALUES], description: 'Target lifecycle state' },
      skipHookPhases: {
        type: 'array',
        items: { type: 'string', enum: [...HOOK_PHASE_SELECTOR_VALUES] },
      },
    },
  },
  PatchChangeBody: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      description: { type: 'string' },
      addSpecIds: { type: 'array', items: { type: 'string' } },
      removeSpecIds: { type: 'array', items: { type: 'string' } },
      invalidationPolicy: { type: 'string', enum: [...INVALIDATION_POLICY_VALUES] },
    },
  },
  ArchivedChangeListItemDto: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      archivedName: { type: 'string' },
      archivedAt: { type: 'string', format: 'date-time' },
      description: { type: 'string' },
      archivedBy: { type: 'object', additionalProperties: true },
      specIds: { type: 'array', items: { type: 'string' } },
      schemaName: { type: 'string' },
      schemaVersion: { type: 'integer' },
      workspaces: { type: 'array', items: { type: 'string' } },
      artifacts: { type: 'array', items: { type: 'string' } },
    },
  },
  ArchivedChangeDetailDto: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      description: { type: 'string' },
      state: { type: 'string' },
      archivedName: { type: 'string' },
      archivedAt: { type: 'string', format: 'date-time' },
      archivedBy: { type: 'object', additionalProperties: true },
      specIds: { type: 'array', items: { type: 'string' } },
      specDependsOn: {
        type: 'object',
        additionalProperties: { type: 'array', items: { type: 'string' } },
      },
      schemaName: { type: 'string' },
      schemaVersion: { type: 'integer' },
      updatedAt: { type: 'string', format: 'date-time' },
      history: { type: 'array', items: { type: 'object' } },
      workspaces: { type: 'array', items: { type: 'string' } },
      artifacts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            filename: { type: 'string' },
            type: { type: 'string' },
            state: { type: 'string' },
            displayStatus: { type: 'string' },
          },
        },
      },
      archivedMeta: { type: 'object' },
    },
  },
  WorkspaceDto: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      prefix: { type: 'string' },
      ownership: { type: 'string' },
      specsPath: { type: 'string' },
      codeRoots: { type: 'array', items: { type: 'string' } },
    },
  },
  WorkspaceList: {
    type: 'array',
    items: { $ref: 'WorkspaceDto#' },
  },
  WorkspaceSpecTreeDto: {
    type: 'object',
    properties: {
      workspace: { type: 'string' },
      specs: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            specId: { type: 'string' },
            path: { type: 'string' },
            title: { type: 'string' },
          },
        },
      },
    },
  },
  SpecSummaryDto: {
    type: 'object',
    properties: {
      specId: { type: 'string' },
      workspace: { type: 'string' },
      path: { type: 'string' },
      title: { type: 'string' },
      description: { type: 'string' },
    },
  },
  SpecSummaryList: {
    type: 'array',
    items: { $ref: 'SpecSummaryDto#' },
  },
  SpecDetailDto: {
    type: 'object',
    properties: {
      specId: { type: 'string' },
      workspace: { type: 'string' },
      path: { type: 'string' },
      title: { type: 'string' },
      description: { type: 'string' },
      dependsOn: { type: 'array', items: { type: 'string' } },
      artifacts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            filename: { type: 'string' },
            hash: { type: 'string' },
          },
        },
      },
      linkedChanges: {
        type: 'array',
        items: {
          type: 'object',
          required: ['name', 'state'],
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            state: { type: 'string' },
          },
        },
      },
    },
  },
  SpecContextDto: {
    type: 'object',
    additionalProperties: false,
    required: ['entries', 'warnings'],
    properties: {
      entries: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['spec', 'source', 'mode', 'stale'],
          properties: {
            spec: { type: 'string' },
            source: { type: 'string', enum: ['root', 'dependency'] },
            mode: { type: 'string', enum: ['list', 'summary', 'full'] },
            title: { type: 'string' },
            description: { type: 'string' },
            rules: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['requirement', 'rules'],
                properties: {
                  requirement: { type: 'string' },
                  rules: { type: 'array', items: { type: 'string' } },
                },
              },
            },
            constraints: { type: 'array', items: { type: 'string' } },
            scenarios: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['requirement', 'name'],
                properties: {
                  requirement: { type: 'string' },
                  name: { type: 'string' },
                  given: { type: 'array', items: { type: 'string' } },
                  when: { type: 'array', items: { type: 'string' } },
                  then: { type: 'array', items: { type: 'string' } },
                },
              },
            },
            stale: { type: 'boolean' },
            optimizedContent: { type: 'string' },
          },
        },
      },
      warnings: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'message'],
          properties: {
            type: { type: 'string' },
            path: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  },
  OutlineEntryList: {
    type: 'array',
    items: { type: 'object' },
    description: 'Outline entries from code-graph / spec outline use case',
  },
  GraphStatusDto: {
    type: 'object',
    properties: {
      lastIndexedAt: { type: 'string', nullable: true },
      lastIndexedRef: { type: 'string', nullable: true },
      fileCount: { type: 'integer' },
      documentCount: { type: 'integer' },
      symbolCount: { type: 'integer' },
      specCount: { type: 'integer' },
      graphFingerprint: { type: 'string', nullable: true },
      stale: { type: 'boolean', nullable: true },
    },
  },
  GraphFileRefDto: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'workspace', 'workspaceRelativePath', 'projectRelativePath'],
    properties: {
      id: { type: 'string' },
      workspace: { type: 'string' },
      workspaceRelativePath: { type: 'string' },
      projectRelativePath: { type: 'string' },
    },
  },
  GraphSymbolRefDto: {
    type: 'object',
    additionalProperties: false,
    required: [
      'id',
      'workspace',
      'workspaceRelativePath',
      'projectRelativePath',
      'name',
      'kind',
      'line',
      'column',
    ],
    properties: {
      id: { type: 'string' },
      workspace: { type: 'string' },
      workspaceRelativePath: { type: 'string' },
      projectRelativePath: { type: 'string' },
      name: { type: 'string' },
      kind: { type: 'string' },
      line: { type: 'integer' },
      column: { type: 'integer' },
    },
  },
  GraphSearchResultDto: {
    type: 'object',
    additionalProperties: false,
    required: ['symbols', 'specs', 'documents'],
    properties: {
      symbols: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['workspace', 'symbol', 'score', 'snippet', 'startLine', 'endLine'],
          properties: {
            workspace: { type: 'string' },
            symbol: { $ref: 'GraphSymbolRefDto#' },
            score: { type: 'number' },
            snippet: { type: 'string' },
            startLine: { type: 'integer' },
            endLine: { type: 'integer' },
          },
        },
      },
      specs: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'workspace',
            'specId',
            'path',
            'title',
            'description',
            'score',
            'snippet',
            'startLine',
            'endLine',
          ],
          properties: {
            workspace: { type: 'string' },
            specId: { type: 'string' },
            path: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            score: { type: 'number' },
            snippet: { type: 'string' },
            startLine: { type: 'integer' },
            endLine: { type: 'integer' },
          },
        },
      },
      documents: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'workspace',
            'path',
            'projectRelativePath',
            'score',
            'snippet',
            'startLine',
            'endLine',
          ],
          properties: {
            workspace: { type: 'string' },
            path: { type: 'string' },
            projectRelativePath: { type: 'string' },
            score: { type: 'number' },
            snippet: { type: 'string' },
            startLine: { type: 'integer' },
            endLine: { type: 'integer' },
          },
        },
      },
    },
  },
  GraphImpactDto: {
    type: 'object',
    additionalProperties: false,
    required: [
      'target',
      'direction',
      'riskLevel',
      'directDepsCount',
      'indirectDepsCount',
      'transitiveDepsCount',
      'affectedFilesCount',
      'affectedProcesses',
      'specs',
      'symbols',
      'files',
    ],
    properties: {
      target: { type: 'string' },
      direction: { type: 'string' },
      riskLevel: { type: 'string' },
      directDepsCount: { type: 'integer' },
      indirectDepsCount: { type: 'integer' },
      transitiveDepsCount: { type: 'integer' },
      affectedFilesCount: { type: 'integer' },
      affectedProcesses: { type: 'array', items: { type: 'string' } },
      specs: { type: 'array', items: { type: 'string' } },
      symbols: {
        type: 'array',
        items: { $ref: 'GraphImpactSymbolDto#' },
      },
      files: {
        type: 'array',
        items: { $ref: 'GraphImpactFileDto#' },
      },
    },
  },
  ChangeGraphViewDto: {
    type: 'object',
    additionalProperties: false,
    required: ['changeName', 'specIds', 'specs'],
    properties: {
      changeName: { type: 'string' },
      specIds: { type: 'array', items: { type: 'string' } },
      specs: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['specId', 'coveredFiles', 'coveredSymbols'],
          properties: {
            specId: { type: 'string' },
            coveredFiles: { type: 'array', items: { $ref: 'GraphFileRefDto#' } },
            coveredSymbols: { type: 'array', items: { $ref: 'GraphSymbolRefDto#' } },
          },
        },
      },
    },
  },
  GraphSpecCoverageDto: {
    type: 'object',
    additionalProperties: false,
    required: ['specId', 'files', 'symbols'],
    properties: {
      specId: { type: 'string' },
      files: { type: 'array', items: { $ref: 'GraphFileRefDto#' } },
      symbols: { type: 'array', items: { $ref: 'GraphSymbolRefDto#' } },
    },
  },
  GraphImpactFileDto: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'workspace', 'workspaceRelativePath', 'projectRelativePath'],
    properties: {
      id: { type: 'string' },
      workspace: { type: 'string' },
      workspaceRelativePath: { type: 'string' },
      projectRelativePath: { type: 'string' },
      risk: { type: 'string' },
    },
  },
  GraphImpactSymbolDto: {
    type: 'object',
    additionalProperties: false,
    required: [
      'id',
      'workspace',
      'workspaceRelativePath',
      'projectRelativePath',
      'name',
      'kind',
      'line',
      'column',
      'depth',
    ],
    properties: {
      id: { type: 'string' },
      workspace: { type: 'string' },
      workspaceRelativePath: { type: 'string' },
      projectRelativePath: { type: 'string' },
      name: { type: 'string' },
      kind: { type: 'string' },
      line: { type: 'integer' },
      column: { type: 'integer' },
      depth: { type: 'integer' },
      risk: { type: 'string' },
    },
  },
  ImplementationReviewDto: {
    type: 'object',
    properties: {
      implementationTracking: { type: 'object' },
      specIds: { type: 'array', items: { type: 'string' } },
    },
  },
  LogReadDto: {
    type: 'object',
    properties: {
      entries: { type: 'array', items: { type: 'object' } },
      lines: { type: 'array', items: { type: 'string' } },
    },
  },
  AppendLogBody: {
    type: 'object',
    required: ['message'],
    additionalProperties: false,
    properties: {
      level: { type: 'string', enum: [...LOG_LEVEL_VALUES] },
      message: { type: 'string', minLength: 1 },
      context: { type: 'object', additionalProperties: true },
    },
  },
  OkDto: {
    type: 'object',
    properties: { ok: { type: 'boolean', enum: [true] } },
  },
  ArchivedChangeList: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: { $ref: 'ArchivedChangeListItemDto#' },
      },
      meta: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          count: { type: 'integer' },
          limit: { type: 'integer' },
          page: { type: 'integer' },
          startAt: { type: 'string' },
        },
      },
    },
  },
  ChangeOverlapsDto: {
    type: 'object',
    additionalProperties: { type: 'array', items: { type: 'string' } },
  },
  ArchiveChangeResultDto: {
    type: 'object',
    properties: {
      archivedChange: { type: 'string' },
      archiveDirPath: { type: 'string' },
      postHookFailures: { type: 'array', items: { type: 'object' } },
    },
  },
  ReasonBody: {
    type: 'object',
    additionalProperties: false,
    properties: { reason: { type: 'string' } },
  },
  InvalidateBody: {
    type: 'object',
    additionalProperties: false,
    properties: {
      reason: { type: 'string' },
      force: { type: 'boolean' },
    },
  },
  SkipArtifactBody: {
    type: 'object',
    required: ['artifactId'],
    additionalProperties: false,
    properties: { artifactId: { type: 'string', minLength: 1 } },
  },
  PatchSpecIdsBody: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      add: { type: 'array', items: { type: 'string' } },
      remove: { type: 'array', items: { type: 'string' } },
    },
  },
  PatchSpecDependenciesBody: {
    type: 'object',
    required: ['specId'],
    additionalProperties: false,
    properties: {
      specId: { type: 'string', minLength: 1 },
      add: { type: 'array', items: { type: 'string' } },
      remove: { type: 'array', items: { type: 'string' } },
      set: { type: 'array', items: { type: 'string' } },
    },
  },
  ValidateChangeBody: {
    type: 'object',
    additionalProperties: false,
    properties: {
      specId: { type: 'string', minLength: 1 },
      artifactId: { type: 'string', minLength: 1 },
    },
  },
  ValidateBatchBody: {
    type: 'object',
    additionalProperties: false,
    properties: {
      artifactId: { type: 'string', minLength: 1 },
    },
  },
  UpdateImplementationTrackingBody: {
    type: 'object',
    required: ['action', 'file'],
    additionalProperties: false,
    properties: {
      action: { type: 'string', enum: [...IMPLEMENTATION_TRACKING_ACTION_VALUES] },
      file: { type: 'string', minLength: 1 },
      specId: { type: 'string', minLength: 1 },
      symbols: {
        type: 'array',
        items: { type: 'string', minLength: 1 },
      },
    },
    allOf: [
      {
        if: {
          properties: { action: { enum: ['add', 'remove'] } },
          required: ['action'],
        },
        then: { required: ['specId'] },
      },
    ],
  },
  UpdateSpecDepsResultDto: {
    type: 'object',
    properties: {
      specId: { type: 'string' },
      dependsOn: { type: 'array', items: { type: 'string' } },
    },
  },
  UpdateImplementationTrackingResultDto: {
    type: 'object',
    required: ['implementationTracking'],
    properties: {
      implementationTracking: {
        type: 'object',
        required: ['trackedFiles', 'links'],
        properties: {
          trackedFiles: {
            type: 'array',
            items: {
              type: 'object',
              required: ['file', 'state'],
              properties: {
                file: { type: 'string' },
                state: { type: 'string', enum: ['open', 'resolved', 'ignored'] },
              },
            },
          },
          links: {
            type: 'array',
            items: {
              type: 'object',
              required: ['specId', 'file', 'fileLinkExplicit'],
              properties: {
                specId: { type: 'string' },
                file: { type: 'string' },
                fileLinkExplicit: { type: 'boolean' },
                symbols: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
    },
  },
  OutlineArtifactBody: {
    type: 'object',
    additionalProperties: false,
    properties: { content: { type: 'string' } },
  },
  GraphIndexBody: {
    type: 'object',
    additionalProperties: false,
    properties: {
      force: { type: 'boolean' },
    },
  },
  GraphIndexErrorDto: {
    type: 'object',
    additionalProperties: false,
    required: ['filePath', 'message'],
    properties: {
      filePath: { type: 'string' },
      message: { type: 'string' },
    },
  },
  WorkspaceGraphIndexBreakdownDto: {
    type: 'object',
    additionalProperties: false,
    required: [
      'name',
      'filesDiscovered',
      'filesIndexed',
      'filesSkipped',
      'filesRemoved',
      'specsDiscovered',
      'specsIndexed',
    ],
    properties: {
      name: { type: 'string' },
      filesDiscovered: { type: 'integer' },
      filesIndexed: { type: 'integer' },
      filesSkipped: { type: 'integer' },
      filesRemoved: { type: 'integer' },
      specsDiscovered: { type: 'integer' },
      specsIndexed: { type: 'integer' },
    },
  },
  GraphIndexResultDto: {
    type: 'object',
    additionalProperties: false,
    required: [
      'filesDiscovered',
      'filesIndexed',
      'filesRemoved',
      'filesSkipped',
      'specsDiscovered',
      'specsIndexed',
      'errors',
      'duration',
      'workspaces',
      'vcsRef',
      'graphFingerprint',
      'fullRebuildReason',
    ],
    properties: {
      filesDiscovered: { type: 'integer' },
      filesIndexed: { type: 'integer' },
      filesRemoved: { type: 'integer' },
      filesSkipped: { type: 'integer' },
      specsDiscovered: { type: 'integer' },
      specsIndexed: { type: 'integer' },
      errors: {
        type: 'array',
        items: { $ref: 'GraphIndexErrorDto#' },
      },
      duration: { type: 'integer' },
      workspaces: {
        type: 'array',
        items: { $ref: 'WorkspaceGraphIndexBreakdownDto#' },
      },
      vcsRef: { type: 'string', nullable: true },
      graphFingerprint: { type: 'string' },
      fullRebuildReason: { type: 'string', nullable: true },
    },
  },
  GraphHotspotsResultDto: {
    type: 'object',
    additionalProperties: true,
  },
  WorkspaceSpecsValidateResultDto: {
    type: 'object',
    properties: {
      passed: { type: 'boolean' },
      totalSpecs: { type: 'integer' },
      passedCount: { type: 'integer' },
      failedCount: { type: 'integer' },
      entries: { type: 'array', items: { type: 'object' } },
    },
  },
  SpecMetadataBody: {
    type: 'object',
    additionalProperties: false,
    properties: {
      generate: { type: 'boolean' },
      metadata: { type: 'string' },
    },
    anyOf: [
      {
        required: ['generate'],
        properties: { generate: { const: true } },
      },
      {
        required: ['metadata'],
      },
    ],
  },
  SpecOutlineDraftBody: {
    type: 'object',
    additionalProperties: false,
    required: ['filename', 'content'],
    properties: {
      filename: { type: 'string' },
      content: { type: 'string' },
    },
  },
  SpecMetadataResultDto: {
    type: 'object',
    properties: {
      ok: { type: 'boolean' },
      generated: { type: 'boolean' },
    },
  },
  HookInstructionsDto: {
    type: 'object',
    additionalProperties: true,
  },
  ArtifactInstructionDto: {
    type: 'object',
    additionalProperties: true,
  },
  JsonObjectDto: {
    type: 'object',
    additionalProperties: true,
  },
}

export function registerApiOpenApiSchemas(app: { addSchema(schema: JsonSchema): void }): void {
  for (const [id, schema] of Object.entries(API_OPENAPI_SCHEMAS)) {
    app.addSchema({ $id: id, ...schema })
  }
}
