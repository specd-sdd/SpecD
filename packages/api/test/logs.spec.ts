import { describe, expect, it } from 'vitest'
import { apiJson, expectProblem } from './helpers/http-client.js'

describe('project logs', () => {
  it('GET /v1/logs returns in-memory entries after POST', async () => {
    const { res: postRes } = await apiJson<{ ok: true }>('/logs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        level: 'debug',
        message: 'studio action',
        context: { action: 'test' },
      }),
    })
    expect(postRes.status).toBe(200)

    const { res, data } = await apiJson<{ entries?: { message: string }[] }>('/logs?limit=10')
    expect(res.status).toBe(200)
    const messages = (data.entries ?? []).map((e) => e.message)
    expect(messages).toContain('studio action')
  })

  it('GET /v1/logs?prettier=true returns plain text without ansi codes', async () => {
    await apiJson('/logs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        level: 'info',
        message: 'plain log line',
        context: { workspace: 'core' },
      }),
    })

    const { res, data } = await apiJson<{ lines?: string[] }>('/logs?limit=5&prettier=true')
    expect(res.status).toBe(200)
    const line = data.lines?.find((l) => l.includes('plain log line'))
    expect(line).toBeDefined()
    expect(line).not.toMatch(/\u001b\[[0-9;]*m/)
  })

  it('GET /v1/studio/output is not exposed', async () => {
    const body = await expectProblem('/studio/output?limit=50', { method: 'GET' }, 404)
    expect(body.code).toBe('NOT_FOUND')
  })

  it('POST /v1/logs rejects invalid level', async () => {
    const body = await expectProblem(
      '/logs',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          level: 'trace',
          message: 'bad-level',
        }),
      },
      400,
    )
    expect(body.code).toBe('INVALID_REQUEST')
  })

  it('POST /v1/studio/output is not exposed', async () => {
    const body = await expectProblem('/studio/output', { method: 'POST' }, 404)
    expect(body.code).toBe('NOT_FOUND')
  })
})
