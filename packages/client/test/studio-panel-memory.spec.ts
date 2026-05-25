import { describe, expect, it } from 'vitest'
import { MemorySpecdDataAdapter } from '../src/adapter-memory-specd-data.js'

describe('MemorySpecdDataAdapter studio panel', () => {
  it('keeps output and log buffers independent', async () => {
    const port = new MemorySpecdDataAdapter()

    await port.appendStudioOutput({
      level: 'info',
      message: 'Saved proposal.md',
      action: 'save-artifact',
    })
    await port.appendProjectLog({
      level: 'debug',
      message: 'save-artifact',
      context: { text: 'Saved proposal.md' },
    })

    const output = await port.listStudioOutput()
    const logs = await port.readProjectLogs({ prettier: true })

    expect(output).toHaveLength(1)
    expect(output[0]?.message).toBe('Saved proposal.md')
    expect(logs.lines?.[0]).toContain('save-artifact')
    expect(logs.lines?.[0]).not.toContain('Saved proposal.md')
  })

  it('listStudioOutput returns newest first', async () => {
    const port = new MemorySpecdDataAdapter()
    await port.appendStudioOutput({ message: 'first', level: 'info' })
    await port.appendStudioOutput({ message: 'second', level: 'info' })
    const list = await port.listStudioOutput(10)
    expect(list[0]?.message).toBe('second')
    expect(list[1]?.message).toBe('first')
  })
})
