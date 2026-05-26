import { describe, expect, it } from 'vitest'
import { apiJson } from './helpers/http-client.js'

describe('project logs and studio output', () => {
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

  it('GET /v1/studio/output lists appended output', async () => {
    const { res: postRes } = await apiJson<{ id: string }>('/studio/output', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        level: 'warn',
        message: '⚠ scope warning',
        action: 'scope-invalidate',
      }),
    })
    expect(postRes.status).toBe(200)

    const { res, data } = await apiJson<{ entries: { message: string }[] }>(
      '/studio/output?limit=5',
    )
    expect(res.status).toBe(200)
    expect(data.entries.some((e) => e.message.includes('scope warning'))).toBe(true)
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

  it('POST /v1/logs does not append to studio output', async () => {
    const { data: before } = await apiJson<{ entries: { id: string }[] }>('/studio/output?limit=50')
    const countBefore = before.entries.length

    const { res: postRes } = await apiJson<{ ok: true }>('/logs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        level: 'debug',
        message: 'save-artifact',
        context: { text: 'only-in-logs' },
      }),
    })
    expect(postRes.status).toBe(200)

    const { data: after } = await apiJson<{
      entries: { id: string; message: string }[]
    }>('/studio/output?limit=50')
    expect(after.entries.length).toBe(countBefore)
    expect(after.entries.some((e) => e.message === 'only-in-logs')).toBe(false)
  })
})
