import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const apiRoot = path.resolve(testDir, '..')

describe('API graph index uses injected long-lived provider', () => {
  it('passes provider into runIndexProjectGraph without release/refresh', () => {
    const handlerSource = readFileSync(
      path.join(apiRoot, 'src/delivery/http/handlers/handler-graph.ts'),
      'utf8',
    )
    const contextSource = readFileSync(
      path.join(apiRoot, 'src/composition/create-api-context.ts'),
      'utf8',
    )

    expect(handlerSource).toContain('runIndexProjectGraph(ctx, {')
    expect(handlerSource).toContain('provider,')
    expect(handlerSource).toContain('ctx.withGraphProvider')
    expect(handlerSource).not.toContain('releaseGraphProviderForIndex')
    expect(handlerSource).not.toContain('refreshGraphProvider')
    expect(handlerSource).not.toContain('withOpenGraphProvider')
    expect(handlerSource).not.toContain('createCodeGraphProvider')

    expect(contextSource).not.toContain('releaseGraphProviderForIndex')
    expect(contextSource).not.toContain('refreshGraphProvider')
    expect(contextSource).toContain('withHealthyGraphProvider')
  })
})
