import { describe, expect, it } from 'vitest'
import { MemorySpecdDataAdapter } from '../src/adapter-memory-specd-data.js'

describe('MemorySpecdDataAdapter studio panel', () => {
  it('stores appended project logs in the log buffer', async () => {
    const port = new MemorySpecdDataAdapter()

    await port.appendProjectLog({
      level: 'debug',
      message: 'save-artifact',
      context: { text: 'Saved proposal.md' },
    })

    const logs = await port.readProjectLogs({ prettier: true })

    expect(logs.lines?.[0]).toContain('save-artifact')
  })

  it('readProjectLogs returns newest first when prettier is enabled', async () => {
    const port = new MemorySpecdDataAdapter()
    await port.appendProjectLog({ message: 'first', level: 'info' })
    await port.appendProjectLog({ message: 'second', level: 'info' })
    const logs = await port.readProjectLogs({ limit: 10, prettier: true })
    expect(logs.lines?.[0]).toContain('second')
    expect(logs.lines?.[1]).toContain('first')
  })
})
