/**
 * OpenAPI 3.1 component schemas aligned with `packages/api/src/delivery/http/dto/*`.
 * Kept in sync with {@link ../http/dto/index.ts} and Studio API route handlers.
 */
export const OPENAPI_SCHEMAS = {
  ProblemJson: {
    type: 'object',
    required: ['type', 'title', 'status', 'detail', 'code'],
    properties: {
      type: { type: 'string', description: 'URN, e.g. urn:specd:error:CHANGE_NOT_FOUND' },
      title: { type: 'string' },
      status: { type: 'integer' },
      detail: { type: 'string' },
      code: { type: 'string' },
    },
    additionalProperties: true,
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
      title: { type: 'string' },
      state: { type: 'string' },
      specIds: { type: 'array', items: { type: 'string' } },
      updatedAt: { type: 'string', format: 'date-time' },
      blockerCount: { type: 'integer' },
    },
  },
  ChangeSummaryList: {
    type: 'array',
    items: { $ref: '#/components/schemas/ChangeSummaryDto' },
  },
  CreateChangeBody: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string' },
      specIds: { type: 'array', items: { type: 'string' } },
      description: { type: 'string' },
      invalidationPolicy: {
        type: 'string',
        enum: ['none', 'surgical', 'downstream', 'global'],
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
      artifacts: { type: 'array', items: { type: 'object' } },
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
      content: { type: 'string' },
      originalHash: { type: 'string' },
      contentHash: { type: 'string' },
      updatedAt: { type: 'string' },
    },
  },
  SaveArtifactBody: {
    type: 'object',
    required: ['content'],
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
    properties: {
      specId: { type: 'string' },
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
    properties: {
      to: { type: 'string', description: 'Target lifecycle state' },
      skipHookPhases: { type: 'array', items: { type: 'string' } },
    },
  },
  PatchChangeBody: {
    type: 'object',
    properties: {
      description: { type: 'string' },
      addSpecIds: { type: 'array', items: { type: 'string' } },
      removeSpecIds: { type: 'array', items: { type: 'string' } },
      invalidationPolicy: { type: 'string' },
    },
  },
  ArchivedChangeListItemDto: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      archivedName: { type: 'string' },
    },
  },
  ArchivedChangeDetailDto: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      archivedName: { type: 'string' },
      archivedAt: { type: 'string', format: 'date-time' },
      specIds: { type: 'array', items: { type: 'string' } },
      schemaName: { type: 'string' },
      schemaVersion: { type: 'integer' },
      artifacts: { type: 'array', items: { type: 'string' } },
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
    items: { $ref: '#/components/schemas/WorkspaceDto' },
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
    items: { $ref: '#/components/schemas/SpecSummaryDto' },
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
      linkedChanges: { type: 'array', items: { type: 'string' } },
    },
  },
  SpecContextDto: {
    type: 'object',
    properties: {
      entries: { type: 'array', items: { type: 'object' } },
      warnings: { type: 'array', items: { type: 'string' } },
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
      symbolCount: { type: 'integer' },
      specCount: { type: 'integer' },
      graphFingerprint: { type: 'string', nullable: true },
      stale: { type: 'boolean', nullable: true },
    },
  },
  GraphSearchResultDto: {
    type: 'object',
    properties: {
      symbols: { type: 'array', items: { type: 'object' } },
      specs: { type: 'array', items: { type: 'object' } },
    },
  },
  GraphImpactDto: {
    type: 'object',
    properties: {
      target: { type: 'string' },
      direction: { type: 'string' },
      symbols: { type: 'array', items: { type: 'object' } },
      files: { type: 'array', items: { type: 'object' } },
    },
  },
  ChangeGraphViewDto: {
    type: 'object',
    properties: {
      changeName: { type: 'string' },
      specIds: { type: 'array', items: { type: 'string' } },
      specs: { type: 'array', items: { type: 'object' } },
    },
  },
  GraphSpecCoverageDto: {
    type: 'object',
    properties: {
      specId: { type: 'string' },
      files: { type: 'array', items: { type: 'string' } },
      symbols: { type: 'array', items: { type: 'string' } },
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
    properties: {
      level: { type: 'string', enum: ['debug', 'info', 'warn', 'error'] },
      message: { type: 'string' },
      context: { type: 'object' },
    },
  },
  OkDto: {
    type: 'object',
    properties: { ok: { type: 'boolean', enum: [true] } },
  },
  StudioOutputListDto: {
    type: 'object',
    properties: {
      entries: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            timestamp: { type: 'string' },
            level: { type: 'string', enum: ['debug', 'info', 'warn', 'error'] },
            message: { type: 'string' },
            action: { type: 'string' },
            context: { type: 'object' },
          },
        },
      },
    },
  },
  AppendStudioOutputBody: {
    type: 'object',
    properties: {
      level: { type: 'string', enum: ['debug', 'info', 'warn', 'error'] },
      message: { type: 'string' },
      action: { type: 'string' },
      context: { type: 'object' },
    },
  },
} as const
