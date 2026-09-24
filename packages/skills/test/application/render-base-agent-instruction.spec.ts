import { describe, expect, it } from 'vitest'
import { renderBaseAgentInstruction } from '../../src/application/render-base-agent-instruction.js'

describe('renderBaseAgentInstruction', () => {
  it('given no options, when rendered, then returns clean base prompt with specd tags and entry points', async () => {
    const rendered = await renderBaseAgentInstruction()

    expect(rendered).toContain('<!-- <specd> -->')
    expect(rendered).toContain('<!-- </specd> -->')
    expect(rendered).toContain('# specd — Agent Protocol & Instructions')
    expect(rendered).toContain('/specd')
    expect(rendered).toContain('/specd-new')
    expect(rendered).toContain('specd graph search')
    expect(rendered).not.toContain('## 7. Agent-Specific Instructions')
  })

  it('given extraInstructions option, when rendered, then includes extraInstructions inside specd block', async () => {
    const extra = 'Use custom linter before submitting commits.'
    const rendered = await renderBaseAgentInstruction({ extraInstructions: extra })

    expect(rendered).toContain('<!-- <specd> -->')
    expect(rendered).toContain('## 7. Agent-Specific Instructions')
    expect(rendered).toContain(extra)
    expect(rendered).toContain('<!-- </specd> -->')
  })

  it('when rendered, includes on-demand documentation protocol with specd guide examples', async () => {
    const rendered = await renderBaseAgentInstruction()

    expect(rendered).toContain('## 3. Mandatory On-Demand Documentation Protocol (Guide-First)')
    expect(rendered).toContain('Do NOT guess, assume, or hallucinate')
    expect(rendered).toContain('specd guide --format toon')
    expect(rendered).toContain('specd guide <topic> --meta --format toon')
    expect(rendered).toContain('specd guide <topic> --section "<heading|index>" --format toon')
    expect(rendered).toContain('specd guide search "<query>" --format toon')
  })
})
