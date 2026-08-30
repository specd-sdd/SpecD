import { describe, expect, it } from 'vitest'
import { makeSpec } from '../../helpers/make-spec.js'
import { resolveConfiguredContextSpecs } from '../../../src/application/use-cases/_shared/resolve-configured-context-specs.js'
import { type CompileContextConfig } from '../../../src/application/use-cases/compile-context.js'
import { makeSpecRepository, makeWorkspaceMap } from './helpers.js'

describe('resolveConfiguredContextSpecs', () => {
  it('applies project include/exclude before workspace include/exclude', async () => {
    const globalSpec = makeSpec({
      workspace: 'default',
      name: '_global/architecture',
      filenames: ['spec.md'],
    })
    const coreSpec = makeSpec({
      workspace: 'core',
      name: 'workspace',
      filenames: ['spec.md'],
    })
    const workspaceMap = await makeWorkspaceMap(
      new Map([
        ['default', makeSpecRepository({ specs: [globalSpec] })],
        ['core', makeSpecRepository({ specs: [coreSpec] })],
      ]),
    )

    const config: CompileContextConfig = {
      contextIncludeSpecs: ['default:_global/architecture', 'core:workspace'],
      contextExcludeSpecs: ['default:_global/architecture'],
      workspaces: {
        core: {
          contextIncludeSpecs: ['workspace'],
          contextExcludeSpecs: ['workspace'],
        },
      },
    }

    const ops: string[] = []
    await resolveConfiguredContextSpecs({
      config,
      activeWorkspaces: new Set(['core']),
      workspaceMap,
      warnings: [],
      collector: {
        include: (spec) => ops.push(`collector:include:${spec.workspace}:${spec.capPath}`),
        exclude: (spec) => ops.push(`collector:exclude:${spec.workspace}:${spec.capPath}`),
      },
      onOperation: (op, spec, source) => {
        const origin = source.kind === 'project' ? 'project' : `workspace:${source.workspace}`
        ops.push(`${op}:${origin}:${spec.workspace}:${spec.capPath}`)
      },
    })

    expect(ops).toEqual([
      'collector:include:default:_global/architecture',
      'include:project:default:_global/architecture',
      'collector:include:core:workspace',
      'include:project:core:workspace',
      'collector:exclude:default:_global/architecture',
      'exclude:project:default:_global/architecture',
      'collector:include:core:workspace',
      'include:workspace:core:core:workspace',
      'collector:exclude:core:workspace',
      'exclude:workspace:core:core:workspace',
    ])
  })

  it('runs project patterns only when activeWorkspaces is empty', async () => {
    const globalSpec = makeSpec({
      workspace: 'default',
      name: '_global/architecture',
      filenames: ['spec.md'],
    })
    const coreSpec = makeSpec({
      workspace: 'core',
      name: 'workspace',
      filenames: ['spec.md'],
    })
    const workspaceMap = await makeWorkspaceMap(
      new Map([
        ['default', makeSpecRepository({ specs: [globalSpec] })],
        ['core', makeSpecRepository({ specs: [coreSpec] })],
      ]),
    )

    const included: string[] = []
    await resolveConfiguredContextSpecs({
      config: {
        contextIncludeSpecs: ['default:_global/architecture'],
        workspaces: {
          core: { contextIncludeSpecs: ['workspace'] },
        },
      },
      activeWorkspaces: new Set(),
      workspaceMap,
      warnings: [],
      collector: {
        include: (spec) => included.push(`${spec.workspace}:${spec.capPath}`),
        exclude: () => undefined,
      },
    })

    expect(included).toEqual(['default:_global/architecture'])
  })

  it('skips workspace patterns for inactive workspaces', async () => {
    const coreSpec = makeSpec({
      workspace: 'core',
      name: 'workspace',
      filenames: ['spec.md'],
    })
    const cliSpec = makeSpec({
      workspace: 'cli',
      name: 'project-context',
      filenames: ['spec.md'],
    })
    const workspaceMap = await makeWorkspaceMap(
      new Map([
        ['core', makeSpecRepository({ specs: [coreSpec] })],
        ['cli', makeSpecRepository({ specs: [cliSpec] })],
      ]),
    )

    const included: string[] = []
    await resolveConfiguredContextSpecs({
      config: {
        workspaces: {
          core: { contextIncludeSpecs: ['workspace'] },
          cli: { contextIncludeSpecs: ['project-context'] },
        },
      },
      activeWorkspaces: new Set(['core']),
      workspaceMap,
      warnings: [],
      collector: {
        include: (spec) => included.push(`${spec.workspace}:${spec.capPath}`),
        exclude: () => undefined,
      },
    })

    expect(included).toEqual(['core:workspace'])
  })
})
