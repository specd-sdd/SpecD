import { describe, expect, it } from 'vitest'
import { InvalidInputError } from '../../../src/domain/errors/index.js'
import { makeSpec } from '../../helpers/make-spec.js'
import { ResolveContextSpecs } from '../../../src/application/use-cases/resolve-context-specs.js'
import { type CompileContextConfig } from '../../../src/application/use-cases/compile-context.js'
import { makeListWorkspaces, makeSpecRepository } from './helpers.js'

function makeSut(
  config: CompileContextConfig,
  repos: Map<string, ReturnType<typeof makeSpecRepository>>,
) {
  return new ResolveContextSpecs(makeListWorkspaces(repos), config)
}

describe('ResolveContextSpecs', () => {
  it('lists the same ID under project and workspace when both layers include it', async () => {
    const shared = makeSpec({
      workspace: 'core',
      name: 'workspace',
      filenames: ['spec.md'],
    })
    const onlyProject = makeSpec({
      workspace: 'default',
      name: '_global/architecture',
      filenames: ['spec.md'],
    })
    const onlyWorkspace = makeSpec({
      workspace: 'core',
      name: 'compile-context',
      filenames: ['spec.md'],
    })

    const defaultRepo = makeSpecRepository({ specs: [onlyProject] })
    const coreRepo = makeSpecRepository({ specs: [shared, onlyWorkspace] })

    const config: CompileContextConfig = {
      contextIncludeSpecs: ['core:workspace', 'default:_global/architecture'],
      contextExcludeSpecs: [],
      workspaces: {
        core: { contextIncludeSpecs: ['workspace', 'compile-context'] },
      },
    }

    const result = await makeSut(
      config,
      new Map([
        ['default', defaultRepo],
        ['core', coreRepo],
      ]),
    ).execute()

    expect(result.project).toEqual(
      expect.arrayContaining(['core:workspace', 'default:_global/architecture']),
    )
    expect(result.project).not.toContain('core:compile-context')
    expect(result.workspaces.core).toEqual(
      expect.arrayContaining(['core:workspace', 'core:compile-context']),
    )
    // Dual provenance: shared ID appears in both partitions.
    expect(result.project).toContain('core:workspace')
    expect(result.workspaces.core).toContain('core:workspace')
  })

  it('keeps project-only IDs out of workspace buckets', async () => {
    const globalSpec = makeSpec({
      workspace: 'default',
      name: '_global/architecture',
      filenames: ['spec.md'],
    })
    const coreSpec = makeSpec({
      workspace: 'core',
      name: 'compile-context',
      filenames: ['spec.md'],
    })

    const result = await makeSut(
      {
        contextIncludeSpecs: ['default:_global/*'],
        workspaces: {
          core: { contextIncludeSpecs: ['compile-context'] },
        },
      },
      new Map([
        ['default', makeSpecRepository({ specs: [globalSpec] })],
        ['core', makeSpecRepository({ specs: [coreSpec] })],
      ]),
    ).execute()

    expect(result.project).toEqual(['default:_global/architecture'])
    expect(result.workspaces.core).toEqual(['core:compile-context'])
    expect(result.project).not.toContain('core:compile-context')
    expect(Object.values(result.workspaces).flat()).not.toContain('default:_global/architecture')
  })

  it('limits workspaces map to workspaces filter while project still applies', async () => {
    const globalSpec = makeSpec({
      workspace: 'default',
      name: '_global/architecture',
      filenames: ['spec.md'],
    })
    const coreSpec = makeSpec({
      workspace: 'core',
      name: 'compile-context',
      filenames: ['spec.md'],
    })
    const cliSpec = makeSpec({
      workspace: 'cli',
      name: 'project-context',
      filenames: ['spec.md'],
    })

    const result = await makeSut(
      {
        contextIncludeSpecs: ['default:_global/*'],
        workspaces: {
          core: { contextIncludeSpecs: ['compile-context'] },
          cli: { contextIncludeSpecs: ['project-context'] },
        },
      },
      new Map([
        ['default', makeSpecRepository({ specs: [globalSpec] })],
        ['core', makeSpecRepository({ specs: [coreSpec] })],
        ['cli', makeSpecRepository({ specs: [cliSpec] })],
      ]),
    ).execute({ workspaces: ['core'] })

    expect(result.project).toEqual(['default:_global/architecture'])
    expect(Object.keys(result.workspaces)).toEqual(['core'])
    expect(result.workspaces.core).toEqual(['core:compile-context'])
  })

  it('skips project-level patterns when workspacesOnly is true', async () => {
    const globalSpec = makeSpec({
      workspace: 'default',
      name: '_global/architecture',
      filenames: ['spec.md'],
    })
    const coreSpec = makeSpec({
      workspace: 'core',
      name: 'compile-context',
      filenames: ['spec.md'],
    })

    const result = await makeSut(
      {
        contextIncludeSpecs: ['default:_global/*', 'core:compile-context'],
        workspaces: {
          core: { contextIncludeSpecs: ['compile-context'] },
        },
      },
      new Map([
        ['default', makeSpecRepository({ specs: [globalSpec] })],
        ['core', makeSpecRepository({ specs: [coreSpec] })],
      ]),
    ).execute({ workspaces: ['core'], workspacesOnly: true })

    expect(result.project).toEqual([])
    expect(result.workspaces.core).toEqual(['core:compile-context'])
  })

  it('treats empty workspaces array like omitted filter', async () => {
    const coreSpec = makeSpec({
      workspace: 'core',
      name: 'compile-context',
      filenames: ['spec.md'],
    })
    const cliSpec = makeSpec({
      workspace: 'cli',
      name: 'project-context',
      filenames: ['spec.md'],
    })

    const result = await makeSut(
      {
        workspaces: {
          core: { contextIncludeSpecs: ['compile-context'] },
          cli: { contextIncludeSpecs: ['project-context'] },
        },
      },
      new Map([
        ['core', makeSpecRepository({ specs: [coreSpec] })],
        ['cli', makeSpecRepository({ specs: [cliSpec] })],
      ]),
    ).execute({ workspaces: [] })

    expect(Object.keys(result.workspaces).sort()).toEqual(['cli', 'core'])
    expect(result.workspaces.core).toEqual(['core:compile-context'])
    expect(result.workspaces.cli).toEqual(['cli:project-context'])
  })

  it('fails hard on a single unknown workspace', async () => {
    const sut = makeSut({}, new Map([['core', makeSpecRepository({ specs: [] })]]))
    const err = await sut.execute({ workspaces: ['missing'] }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(InvalidInputError)
    expect((err as InvalidInputError).code).toBe('INVALID_INPUT')
    expect((err as InvalidInputError).message).toBe("Unknown workspace 'missing'")
  })

  it('lists multiple unknown workspaces in one InvalidInputError', async () => {
    const sut = makeSut({}, new Map([['core', makeSpecRepository({ specs: [] })]]))
    const err = await sut.execute({ workspaces: ['a', 'b'] }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(InvalidInputError)
    expect((err as InvalidInputError).code).toBe('INVALID_INPUT')
    expect((err as InvalidInputError).message).toBe("Unknown workspaces: 'a', 'b'")
  })

  it('clears dual-listed IDs from every partition when excluded', async () => {
    const shared = makeSpec({
      workspace: 'core',
      name: 'workspace',
      filenames: ['spec.md'],
    })
    const result = await makeSut(
      {
        contextIncludeSpecs: ['core:workspace'],
        workspaces: {
          core: {
            contextIncludeSpecs: ['workspace'],
            contextExcludeSpecs: ['workspace'],
          },
        },
      },
      new Map([['core', makeSpecRepository({ specs: [shared] })]]),
    ).execute()

    expect(result.project).not.toContain('core:workspace')
    expect(result.workspaces.core).not.toContain('core:workspace')
    expect(result.workspaces.core).toEqual([])
  })

  it('emits empty workspace arrays for active workspaces with no matches', async () => {
    const result = await makeSut(
      {
        workspaces: {
          core: { contextIncludeSpecs: ['does-not-exist'] },
        },
      },
      new Map([['core', makeSpecRepository({ specs: [] })]]),
    ).execute({ workspaces: ['core'] })

    expect(result.workspaces).toEqual({ core: [] })
  })
})
