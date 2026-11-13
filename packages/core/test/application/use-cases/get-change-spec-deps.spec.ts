import { describe, it, expect, vi } from 'vitest'
import { GetChangeSpecDeps } from '../../../src/application/use-cases/get-change-spec-deps.js'
import { type GetStatus } from '../../../src/application/use-cases/get-status.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { InvalidSpecIdError } from '../../../src/domain/errors/invalid-spec-id-error.js'
import { WorkspaceNotFoundError } from '../../../src/domain/errors/workspace-not-found-error.js'
import { InvalidInputError } from '../../../src/domain/errors/invalid-input-error.js'

const WORKSPACES = ['default', 'core'] as const

interface StatusStub {
  readonly change?: { readonly specIds: readonly string[] } | null
  readonly draftView?: { readonly specIds: readonly string[] } | null
  readonly specDependsOn?: Record<string, readonly string[]>
}

function makeUc(status: StatusStub | Error) {
  const execute = vi.fn(async () => {
    if (status instanceof Error) throw status
    return { specDependsOn: {}, ...status }
  })
  const getStatus = { execute } as unknown as GetStatus
  return { uc: new GetChangeSpecDeps(getStatus, WORKSPACES), execute }
}

describe('GetChangeSpecDeps', () => {
  it('normalizes a bare ID to default:... and returns its declared deps', async () => {
    const { uc, execute } = makeUc({
      change: { specIds: ['default:auth/login'] },
      specDependsOn: { 'default:auth/login': ['default:auth/jwt', 'core:shared'] },
    })

    const result = await uc.execute({ name: 'my-change', specId: 'auth/login' })

    expect(result).toEqual({
      name: 'my-change',
      specId: 'default:auth/login',
      dependsOn: ['default:auth/jwt', 'core:shared'],
    })
    expect(execute).toHaveBeenCalledWith({ name: 'my-change' })
  })

  it('returns an empty list when the spec declares no deps', async () => {
    const { uc } = makeUc({ change: { specIds: ['default:auth/login'] } })

    const result = await uc.execute({ name: 'c', specId: 'default:auth/login' })

    expect(result.dependsOn).toEqual([])
  })

  it('works for a draft change (draftView)', async () => {
    const { uc } = makeUc({
      change: null,
      draftView: { specIds: ['core:a'] },
      specDependsOn: { 'core:a': ['core:b'] },
    })

    const result = await uc.execute({ name: 'd', specId: 'core:a' })

    expect(result.dependsOn).toEqual(['core:b'])
  })

  it.each([
    ['', "''"],
    ['Bad Id', 'Bad Id'],
  ])('rejects %j with InvalidSpecIdError before any status lookup', async (specId, quoted) => {
    const { uc, execute } = makeUc({ change: { specIds: [] } })

    const err = await uc.execute({ name: 'c', specId }).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(InvalidSpecIdError)
    expect((err as Error).message).toContain(quoted)
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects an unknown workspace with WorkspaceNotFoundError and no status lookup', async () => {
    const { uc, execute } = makeUc({ change: { specIds: [] } })

    await expect(uc.execute({ name: 'c', specId: 'nope:auth/login' })).rejects.toBeInstanceOf(
      WorkspaceNotFoundError,
    )
    expect(execute).not.toHaveBeenCalled()
  })

  it('throws InvalidInputError when the spec is outside the change scope', async () => {
    const { uc } = makeUc({ change: { specIds: ['default:other'] } })

    const err = await uc.execute({ name: 'c', specId: 'auth/login' }).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(InvalidInputError)
    expect((err as Error).message).toBe(
      "spec 'default:auth/login' is not in the scope of change 'c'",
    )
  })

  it('throws InvalidInputError when neither change nor draft view is available', async () => {
    const { uc } = makeUc({ change: null, draftView: null })

    await expect(uc.execute({ name: 'c', specId: 'auth/login' })).rejects.toBeInstanceOf(
      InvalidInputError,
    )
  })

  it('propagates ChangeNotFoundError from GetStatus', async () => {
    const { uc } = makeUc(new ChangeNotFoundError('ghost'))

    await expect(uc.execute({ name: 'ghost', specId: 'auth/login' })).rejects.toBeInstanceOf(
      ChangeNotFoundError,
    )
  })
})
