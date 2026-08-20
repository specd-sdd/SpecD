import * as readline from 'node:readline'
import { execFileSync } from 'node:child_process'
import * as path from 'node:path'
import * as fs from 'node:fs'
import {
  codeGraphVersion,
  createGetGraphHealth,
  openSpecdHost,
  type CodeGraphProvider,
  type OpenSpecdHostResult,
  type SearchCategory,
  type SearchCodeGraphResult,
} from '../../packages/sdk/dist/index.js'

/**
 * PoC for a future SDK `buildIntentPlan` orchestration.
 *
 * Graph: `@specd/sdk` natively (`openSpecdHost` + `CodeGraphProvider`).
 * LLM: opencode (default) or Ollama API (`--llm ollama`) with structured output + tools.
 *
 *   IntentPlanGraphPort.*  → CodeGraphProvider / kernel (see port interface below)
 *   IntentPlanLlmPort.*    → injected agent provider (outside SDK core)
 */

// ---------------------------------------------------------------------------
// Configuration (CLI flags / env — no domain-specific defaults)
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = process.env.SPEC_MODEL ?? 'ollama/qwen2.5-coder:14b'
const DEFAULT_OLLAMA_MODEL = 'qwen3-coder:30b'
const DEFAULT_OLLAMA_BASE_URL = process.env.OLLAMA_HOST ?? 'http://localhost:11434'
const OLLAMA_MAX_TOOL_TURNS = 30
const DEFAULT_LLM_TIMEOUT_MS = 60_000
const MAX_RELEVANT_PROJECT_CONTEXT_CHARS = 2_000
const MAX_PROJECT_CONTEXT_INPUT_CHARS = 80_000
const MAX_IMPACT_SUMMARY_CHARS = 1_500
const DEFAULT_MAX_SPECS_PER_EVAL_BATCH = 6
const DEFAULT_MAX_SPEC_EVAL_BATCH_CHARS = 12_000

interface AgentOptions {
  rawIntent: string
  model: string
  llmProvider: 'opencode' | 'ollama'
  ollamaBaseUrl: string
  llmTimeoutMs: number
  maxCandidateSpecs: number
  maxCodeFiles: number
  searchLimit: number
  specEvalBatchMaxSpecs: number
  specEvalBatchMaxChars: number
  specConfigPath?: string
  useInteractiveTools?: boolean
  useBlindDiscovery?: boolean
  agentArchitecture: 'default' | 'tools' | 'hybrid'
  impactDepth?: number
  maxToolTurns: number
}

interface SdkGraphSession {
  host: OpenSpecdHostResult
  provider: CodeGraphProvider
  dispose(): Promise<void>
}

// ---------------------------------------------------------------------------
// Token tracking
// ---------------------------------------------------------------------------

interface TokenStats {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  promptCount: number
  isExact: boolean
}

const tokenTracker: TokenStats = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  promptCount: 0,
  isExact: false,
}

function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

function recordLLMCall(
  promptText: string,
  responseText: string,
  exactTokens?: { inputTokens?: number; outputTokens?: number },
): { inTok: number; outTok: number; exact: boolean } {
  let inTok = exactTokens?.inputTokens
  let outTok = exactTokens?.outputTokens
  let exact = true

  if (inTok === undefined || outTok === undefined) {
    inTok = estimateTokens(promptText)
    outTok = estimateTokens(responseText)
    exact = false
  } else {
    tokenTracker.isExact = true
  }

  tokenTracker.inputTokens += inTok
  tokenTracker.outputTokens += outTok
  tokenTracker.totalTokens += inTok + outTok
  tokenTracker.promptCount++

  return { inTok, outTok, exact }
}

// ---------------------------------------------------------------------------
// SDK graph session + port adapter
// ---------------------------------------------------------------------------

async function openSdkGraphSession(configPath?: string): Promise<SdkGraphSession> {
  const host = await openSpecdHost(configPath ? { configPath } : undefined)
  const provider = host.createGraphProvider()
  await provider.open()
  return {
    host,
    provider,
    async dispose() {
      await provider.close()
    },
  }
}

function mapSearchCategories(categories: {
  symbols?: boolean
  specs?: boolean
  files?: boolean
}): SearchCategory[] {
  const selected: SearchCategory[] = []
  if (categories.symbols) selected.push('symbols')
  if (categories.specs) selected.push('specs')
  if (categories.files) selected.push('files')
  return selected.length > 0 ? selected : ['symbols']
}

function mapSearchResult(result: SearchCodeGraphResult): GraphSearchResult {
  return {
    symbols: result.symbols.map((row) => ({
      logicalTarget: row.logicalTarget
        ? {
            id: row.logicalTarget.id,
            surface: row.logicalTarget.surface,
            name: row.logicalTarget.name,
          }
        : undefined,
      score: row.score,
      declarations: row.declarations.map((decl) => ({
        declaration: {
          location: {
            filePath: decl.declaration.location.filePath,
          },
        },
      })),
      hits: row.hits.map((hit) => ({
        score: hit.score,
        symbol: {
          id: hit.symbol.id,
          name: hit.symbol.name,
          kind: hit.symbol.kind,
          filePath: hit.symbol.filePath,
          line: hit.symbol.line,
          endLine: hit.symbol.endLine,
        },
      })),
    })),
    files: result.files.map((row) => ({
      path: row.file.path,
      filePath: row.file.path,
      score: row.score,
    })),
    specs: result.specs.map((row) => ({
      specId: row.spec.specId,
      title: row.spec.title,
      description: row.spec.description,
      optimizedDescription: row.spec.optimizedDescription,
      score: row.score,
      content: row.spec.content,
      path: row.spec.path,
    })),
  }
}

function createSdkGraphPort(session: SdkGraphSession): IntentPlanGraphPort {
  const { host, provider } = session
  const getGraphHealth = createGetGraphHealth()

  return {
    async getGraphStats() {
      const workspaces = await host.kernel.project.listWorkspaces.execute()
      const health = await getGraphHealth.execute({
        config: host.config,
        provider,
        codeGraphVersion,
        workspaces: [...workspaces],
      })
      return {
        stale: health.stale ?? false,
        reasonCodes: [...health.reasonCodes],
        specCount: health.specCount,
        fileCount: health.fileCount,
        symbolCount: health.symbolCount,
      }
    },
    async getProjectContext() {
      const result = await host.kernel.project.getProjectContext.execute({})
      return {
        contextEntries: [...result.contextEntries],
        specs: result.specs.map((spec) => ({
          specId: spec.specId,
          title: spec.title,
          description: spec.description,
          mode: spec.mode,
        })),
        warnings: result.warnings ? [...result.warnings] : undefined,
      }
    },
    async getSpecContext(specId) {
      const spec = await provider.getSpec(specId)
      if (!spec) return null

      let description = spec.description
      let optimizedDescription = spec.optimizedDescription
      let optimizedContext: string | undefined

      try {
        const materialized = await host.kernel.specs.getMetadata.execute({ specId })
        if (materialized.metadata.description?.trim()) {
          description = materialized.metadata.description
        }
        if (materialized.metadata.optimizedDescription?.trim()) {
          optimizedDescription = materialized.metadata.optimizedDescription
        }
      } catch {
        // Fall back to graph-indexed metadata.
      }

      try {
        const optimizations = await host.kernel.specs.getPersistedOptimizations.execute({ specId })
        if (optimizations.optimizedContext?.value?.trim()) {
          optimizedContext = optimizations.optimizedContext.value
        }
        if (optimizations.optimizedDescription?.value?.trim()) {
          optimizedDescription = optimizations.optimizedDescription.value
        }
      } catch {
        // Spec may lack persisted state — graph metadata is enough.
      }

      return {
        title: spec.title,
        description,
        optimizedDescription,
        optimizedContext,
        path: spec.path,
        content: spec.content,
      }
    },
    async getSpecDependsOn(specId) {
      const spec = await provider.getSpec(specId)
      if (spec?.dependsOn?.length) {
        return [...spec.dependsOn]
      }

      try {
        const persisted = await host.kernel.specs.getPersistedDeps.execute({ specId })
        return [...persisted.dependsOn]
      } catch {
        return []
      }
    },
    async search(query, categories, limit) {
      const result = await provider.search({
        query,
        categories: mapSearchCategories(categories),
        limit,
        includeSnippet: false,
      })
      return mapSearchResult(result)
    },
    async analyzeFileImpact(filePath, depth = 1) {
      const impact = await provider.analyzeFileImpact(filePath, 'downstream', depth)
      return {
        target: impact.target,
        riskLevel: impact.riskLevel,
        coveringSpecs: impact.coveringSpecs.map((spec) => ({
          specId: spec.specId,
          minDepth: spec.minDepth,
        })),
        affectedFiles: [...impact.affectedFiles],
      }
    },
    async analyzeSymbolImpact(symbolId, depth = 1) {
      const impact = await provider.analyzeImpact(symbolId, 'downstream', depth)
      return {
        target: impact.target,
        symbolId,
        riskLevel: impact.riskLevel,
        affectedFiles: [...impact.affectedFiles],
      }
    },
    async analyzeSpecImpact(specId, depth = 1) {
      const impact = await provider.analyzeSpecImpact(specId, 'downstream', depth)
      return {
        spec: specId,
        impact: {
          affectedSpecs: [...impact.affectedSpecs],
          affectedFiles: [...impact.affectedFiles],
          affectedSymbols: impact.affectedSymbols.map((symbol) => ({
            id: symbol.id,
            name: symbol.name,
            filePath: symbol.filePath,
            line: symbol.line,
          })),
          riskLevel: impact.riskLevel,
        },
      }
    },
  }
}

function createPocLlmPort(): IntentPlanLlmPort {
  return {
    provider: 'opencode',
    async complete(prompt, options) {
      return invokeOpencodePoC(prompt, options.model, options.timeoutMs, (inTok, outTok, exact) => {
        const exactLabel = exact ? '[EXACT API]' : '[ESTIMATED]'
        console.log(`   └─ 📊 Tokens ${exactLabel}: ${inTok} in / ${outTok} out (${inTok + outTok} total)`)
      })
    },
  }
}

// ---------------------------------------------------------------------------
// Graph JSON shapes (subset used by this script)
// ---------------------------------------------------------------------------

interface GraphSearchSpecRow {
  specId: string
  title?: string
  description?: string
  optimizedDescription?: string
  score?: number
  content?: string
  path?: string
}

interface GraphSearchSymbolRow {
  logicalTarget?: { id?: string; surface?: string; name?: string }
  score?: number
  declarations?: Array<{
    declaration?: { location?: { filePath?: string } }
  }>
  hits?: Array<{
    score?: number
    symbol?: { id?: string; name?: string; kind?: string; filePath?: string; line?: number; endLine?: number }
  }>
}

interface GraphSearchResult {
  symbols?: GraphSearchSymbolRow[]
  specs?: GraphSearchSpecRow[]
  files?: Array<{ filePath?: string; path?: string; score?: number }>
}

interface CoveringSpec {
  specId: string
  minDepth: number
}

interface FileImpactResult {
  target?: string
  coveringSpecs?: CoveringSpec[]
  affectedFiles?: string[]
  riskLevel?: string
}

interface SymbolImpactResult {
  target?: string
  symbolId?: string
  affectedFiles?: string[]
  riskLevel?: string
}

interface SymbolSeed {
  id: string
  name: string
  kind?: string
  filePath: string
  score: number
}

interface SpecImpactSymbolLink {
  id: string
  name: string
  filePath: string
  line?: number
}

interface SpecImpactCoverage {
  files: string[]
  symbols: SpecImpactSymbolLink[]
  relatedSpecs: string[]
  riskLevel?: string
}

interface SpecImpactEnvelope {
  spec?: string
  impact?: {
    affectedSpecs?: string[]
    affectedFiles?: string[]
    affectedSymbols?: SpecImpactSymbolLink[]
    riskLevel?: string
  }
}

interface GraphStatsResult {
  stale?: boolean
  reasonCodes?: string[]
  specCount?: number
  fileCount?: number
  symbolCount?: number
}

interface ProjectContextSpecEntry {
  specId: string
  title?: string
  description?: string
  mode?: string
}

interface ProjectContextResult {
  contextEntries?: string[]
  specs?: ProjectContextSpecEntry[]
  warnings?: string[]
}

// ---------------------------------------------------------------------------
// SDK-shaped ports (PoC adapters below — swap for native SDK providers)
// ---------------------------------------------------------------------------

interface SpecContextSnapshot {
  title?: string
  description?: string
  optimizedDescription?: string
  optimizedContext?: string
  path?: string
  content: string
}

interface IntentPlanGraphPort {
  getGraphStats(): Promise<GraphStatsResult>
  getProjectContext(): Promise<ProjectContextResult>
  getSpecContext(specId: string): Promise<SpecContextSnapshot | null>
  getSpecDependsOn(specId: string): Promise<string[]>
  search(
    query: string,
    categories: { symbols?: boolean; specs?: boolean; files?: boolean },
    limit: number,
  ): Promise<GraphSearchResult>
  analyzeFileImpact(filePath: string, depth?: number): Promise<FileImpactResult>
  analyzeSymbolImpact(symbolId: string, depth?: number): Promise<SymbolImpactResult>
  analyzeSpecImpact(specId: string, depth?: number): Promise<SpecImpactEnvelope>
}

interface LlmOptions {
  model: string
  timeoutMs: number
}

interface IntentPlanLlmPort {
  readonly provider: 'opencode' | 'ollama'
  complete(prompt: string, options: LlmOptions): Promise<string>
  completeStructured?<T>(
    prompt: string,
    schema: Record<string, unknown>,
    options: LlmOptions,
  ): Promise<T>
}

/** Active runtime ports — graph via SDK, LLM via opencode or Ollama. */
let runtime!: {
  graph: IntentPlanGraphPort
  llm: IntentPlanLlmPort
  ollamaBaseUrl: string
}

// ---------------------------------------------------------------------------
// LLM (opencode)
// ---------------------------------------------------------------------------

interface OpencodeEvent {
  type?: string
  tokens?: { input?: number; output?: number }
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    input_tokens?: number
    output_tokens?: number
  }
  content?: string
  text?: string
  part?: {
    type?: string
    text?: string
    tokens?: { input?: number; output?: number; total?: number }
  }
}

class LlmError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LlmError'
  }
}

function invokeOpencodePoC(
  promptText: string,
  model: string,
  timeoutMs: number,
  onTokens?: (inTok: number, outTok: number, exact: boolean) => void,
): string {
  let stdout: string
  try {
    stdout = execFileSync(
      'opencode',
      ['run', '--format', 'json', '-m', model, promptText],
      {
        encoding: 'utf8',
        cwd: process.cwd(),
        maxBuffer: 10 * 1024 * 1024,
        timeout: timeoutMs,
      },
    )
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code
    if (code === 'ETIMEDOUT') {
      throw new LlmError(`LLM call to "${model}" exceeded ${timeoutMs / 1000}s`)
    }
    const msg = err instanceof Error ? err.message : String(err)
    throw new LlmError(`LLM execution failed for model "${model}": ${msg}`)
  }

  const lines = stdout.trim().split('\n').filter((line) => line.trim().length > 0)
  let finalResponseText = ''
  let exactInputTokens: number | undefined
  let exactOutputTokens: number | undefined

  for (const line of lines) {
    if (line.includes('Error:') || line.includes('Connection refused')) {
      throw new LlmError(`Provider error (${model}): ${line}`)
    }

    try {
      const ev: OpencodeEvent = JSON.parse(line)
      if (ev.tokens) {
        if (ev.tokens.input !== undefined) exactInputTokens = ev.tokens.input
        if (ev.tokens.output !== undefined) exactOutputTokens = ev.tokens.output
      }
      if (ev.usage) {
        if (ev.usage.prompt_tokens !== undefined) exactInputTokens = ev.usage.prompt_tokens
        if (ev.usage.input_tokens !== undefined) exactInputTokens = ev.usage.input_tokens
        if (ev.usage.completion_tokens !== undefined) exactOutputTokens = ev.usage.completion_tokens
        if (ev.usage.output_tokens !== undefined) exactOutputTokens = ev.usage.output_tokens
      }
      if (ev.part?.tokens) {
        if (ev.part.tokens.input !== undefined) exactInputTokens = ev.part.tokens.input
        if (ev.part.tokens.output !== undefined) exactOutputTokens = ev.part.tokens.output
      }
      if (ev.type === 'text' && ev.part?.text) finalResponseText += ev.part.text
      else if (ev.content) finalResponseText += ev.content
      else if (ev.text) finalResponseText += ev.text
    } catch {
      if (!line.startsWith('{')) finalResponseText += `${line}\n`
    }
  }

  const cleanedText = finalResponseText.trim() || stdout.trim()
  const { inTok, outTok, exact } = recordLLMCall(promptText, cleanedText, {
    inputTokens: exactInputTokens,
    outputTokens: exactOutputTokens,
  })

  const exactLabel = exact ? '[EXACT API]' : '[ESTIMATED]'
  if (onTokens) onTokens(inTok, outTok, exact)
  else console.log(`   └─ 📊 Tokens ${exactLabel}: ${inTok} in / ${outTok} out (${inTok + outTok} total)`)

  return cleanedText
}

// ---------------------------------------------------------------------------
// LLM (Ollama API — structured output + tool calling)
// ---------------------------------------------------------------------------

interface OllamaToolCall {
  id?: string
  function: {
    index?: number
    name: string
    arguments: Record<string, unknown>
  }
}

interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string
  tool_name?: string
  tool_calls?: OllamaToolCall[]
}

interface OllamaToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

interface OllamaChatResponse {
  message: {
    role: string
    content?: string
    tool_calls?: OllamaToolCall[]
  }
  prompt_eval_count?: number
  eval_count?: number
}

function normalizeOllamaModel(model: string): string {
  return model.replace(/^ollama\//, '')
}

function recordOllamaTokens(promptText: string, responseText: string, response: OllamaChatResponse): void {
  const inTok = response.prompt_eval_count
  const outTok = response.eval_count
  const { exact } = recordLLMCall(
    promptText,
    responseText,
    inTok !== undefined && outTok !== undefined ? { inputTokens: inTok, outputTokens: outTok } : undefined,
  )
  const exactLabel = exact ? '[EXACT API]' : '[ESTIMATED]'
  console.log(`   └─ 📊 Tokens ${exactLabel}: ${inTok ?? '?'} in / ${outTok ?? '?'} out`)
}

async function ollamaChat(
  baseUrl: string,
  request: {
    model: string
    messages: OllamaChatMessage[]
    format?: Record<string, unknown> | 'json'
    tools?: OllamaToolDefinition[]
  },
  timeoutMs: number,
  promptForTokenEstimate: string,
): Promise<OllamaChatResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ ...request, stream: false }),
    })
    if (!response.ok) {
      const body = await response.text()
      throw new LlmError(`Ollama HTTP ${response.status}: ${body.slice(0, 300)}`)
    }
    const data = (await response.json()) as OllamaChatResponse
    recordOllamaTokens(promptForTokenEstimate, data.message.content ?? JSON.stringify(data.message.tool_calls ?? []), data)
    return data
  } catch (err: unknown) {
    if (err instanceof LlmError) throw err
    if (err instanceof Error && err.name === 'AbortError') {
      throw new LlmError(`Ollama call to "${request.model}" exceeded ${timeoutMs / 1000}s`)
    }
    const msg = err instanceof Error ? err.message : String(err)
    throw new LlmError(`Ollama request failed: ${msg}`)
  } finally {
    clearTimeout(timer)
  }
}

function createOllamaLlmPort(baseUrl: string): IntentPlanLlmPort {
  return {
    provider: 'ollama',
    async complete(prompt, options) {
      const model = normalizeOllamaModel(options.model)
      const data = await ollamaChat(baseUrl, { model, messages: [{ role: 'user', content: prompt }] }, options.timeoutMs, prompt)
      return data.message.content?.trim() ?? ''
    },
    async completeStructured(prompt, schema, options) {
      const model = normalizeOllamaModel(options.model)
      const data = await ollamaChat(
        baseUrl,
        { model, messages: [{ role: 'user', content: prompt }], format: schema },
        options.timeoutMs,
        prompt,
      )
      const content = data.message.content?.trim() ?? ''
      return safeParseJSON(content, {}) as never
    },
  }
}

const INTENT_PLAN_OLLAMA_TOOLS: OllamaToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_spec_context',
      description: 'Load spec title, description, optimized context, and path for evaluation. Pass a single specId or up to 5 via specIds[].',
      parameters: {
        type: 'object',
        properties: {
          specId: { type: 'string', description: 'Single spec id (use this OR specIds[])' },
          specIds: { type: 'array', items: { type: 'string' }, description: 'Up to 5 spec ids to load in one call', maxItems: 5 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_specs',
      description: 'BM25 search over indexed specs. Pass a single query or up to 5 queries at once via queries[].',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Single query (use this OR queries[])' },
          queries: { type: 'array', items: { type: 'string' }, description: 'Up to 5 queries to run in one call', maxItems: 5 },
          limit: { type: 'integer', description: 'Max results per query (1-10)', default: 5 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_symbols',
      description: 'Search code symbols (functions, classes, interfaces) in the code graph. Pass a single query or up to 5 queries at once via queries[].',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Single query (use this OR queries[])' },
          queries: { type: 'array', items: { type: 'string' }, description: 'Up to 5 symbol queries to run in one call', maxItems: 5 },
          limit: { type: 'integer', description: 'Max results per query (1-10)', default: 5 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_covering_specs',
      description: 'Specs that cover a source file according to the code graph. Pass a single filePath or up to 5 via filePaths[].',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Single workspace file path (use this OR filePaths[])' },
          filePaths: { type: 'array', items: { type: 'string' }, description: 'Up to 5 file paths to query in one call', maxItems: 5 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_spec_depends_on',
      description: 'Declared dependsOn edges for a spec. Pass a single specId or up to 5 via specIds[].',
      parameters: {
        type: 'object',
        properties: {
          specId: { type: 'string', description: 'Single spec id (use this OR specIds[])' },
          specIds: { type: 'array', items: { type: 'string' }, description: 'Up to 5 spec ids in one call', maxItems: 5 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_symbol_impact',
      description: 'Analyze downstream blast radius and risk level of modifying a code symbol',
      parameters: {
        type: 'object',
        required: ['symbolId'],
        properties: {
          symbolId: { type: 'string', description: 'Symbol ID or name e.g. packages/core/src/index.ts#VCSAdapter' },
          depth: { type: 'integer', description: 'Cascade depth (default 1)', default: 1 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_spec_impact',
      description: 'Analyze downstream cascade impact on other specs and files if a spec changes',
      parameters: {
        type: 'object',
        required: ['specId'],
        properties: {
          specId: { type: 'string', description: 'Spec ID e.g. core:config' },
          depth: { type: 'integer', description: 'Cascade depth (default 1)', default: 1 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_file_impact',
      description: 'Analyze downstream impact, risk level, and covering specs for source files. Pass a single filePath or up to 5 via filePaths[].',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Single source file path (use this OR filePaths[])' },
          filePaths: { type: 'array', items: { type: 'string' }, description: 'Up to 5 file paths to analyze in one call', maxItems: 5 },
          depth: { type: 'integer', description: 'Cascade depth (default 1)', default: 1 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_file_symbols',
      description: 'List code symbols (functions, classes, interfaces) defined in a specific source file',
      parameters: {
        type: 'object',
        required: ['filePath'],
        properties: {
          filePath: { type: 'string', description: 'Workspace file path e.g. packages/core/src/index.ts' },
          limit: { type: 'integer', description: 'Max symbols to return (1-20)', default: 10 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_graph_stats',
      description: 'Get project code graph statistics (index freshness, spec count, file count, symbol count)',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_symbol_code',
      description: 'Get source code snippet for one or more symbols. Pass a single symbolQuery or up to 3 via symbols[].',
      parameters: {
        type: 'object',
        properties: {
          symbolQuery: { type: 'string', description: 'Single symbol name (use this OR symbols[])' },
          filePath: { type: 'string', description: 'Optional workspace file path to narrow single-query search' },
          symbols: {
            type: 'array',
            description: 'Up to 3 symbols to fetch in one call',
            maxItems: 3,
            items: {
              type: 'object',
              required: ['symbolQuery'],
              properties: {
                symbolQuery: { type: 'string' },
                filePath: { type: 'string', description: 'Optional workspace file path to narrow search' },
              },
            },
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'score_facet_alignment',
      description: 'Deterministic facet alignment score for a spec id (higher = better match)',
      parameters: {
        type: 'object',
        required: ['specId'],
        properties: {
          specId: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'submit_decisions',
      description: 'Submit final RETAIN/REJECT decisions for ALL specs under review. Terminal tool.',
      parameters: {
        type: 'object',
        required: ['decisions'],
        properties: {
          decisions: {
            type: 'array',
            items: {
              type: 'object',
              required: ['specId', 'action', 'reason'],
              properties: {
                specId: { type: 'string' },
                action: { type: 'string', enum: ['RETAIN', 'REJECT'] },
                summary: { type: 'string', description: 'High-level change intent (RETAIN only)' },
                reason: { type: 'string', description: 'Required for RETAIN and REJECT' },
              },
            },
          },
        },
      },
    },
  },
]

interface ToolExecutionContext {
  facets: IntentFacets
  codeKeywords: ExpandedKeywords
  refinedIntent: string
}

function resolveWorkspacePathToAbsPath(filePath: string, cwd: string = process.cwd()): string {
  const clean = filePath.trim()
  if (path.isAbsolute(clean) && fs.existsSync(clean)) return clean

  // Handle workspace package prefix "core:src/..." -> "packages/core/src/..."
  const prefixMatch = clean.match(/^([a-z0-9_-]+):(.+)$/i)
  if (prefixMatch) {
    const pkg = prefixMatch[1]
    const rel = prefixMatch[2]

    const pkgPath = path.resolve(cwd, 'packages', pkg, rel)
    if (fs.existsSync(pkgPath)) return pkgPath

    const appPath = path.resolve(cwd, 'apps', pkg, rel)
    if (fs.existsSync(appPath)) return appPath

    const directPath = path.resolve(cwd, rel)
    if (fs.existsSync(directPath)) return directPath
  }

  const absPath = path.resolve(cwd, clean)
  if (fs.existsSync(absPath)) return absPath

  const tryPkg = path.resolve(cwd, 'packages', clean)
  if (fs.existsSync(tryPkg)) return tryPkg

  return absPath
}

async function executeIntentPlanTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<string> {
  switch (name) {
    case 'get_spec_context': {
      const rawIds = Array.isArray(args.specIds) ? (args.specIds as string[]) : []
      const ids = rawIds.length > 0 ? rawIds.slice(0, 5) : [String(args.specId ?? '')]
      const parts: string[] = []
      for (const sid of ids) {
        const loaded = await runtime.graph.getSpecContext(sid)
        if (!loaded) { parts.push(`=== ${sid} ===\nSpec not found`); continue }
        const body = formatSpecContextBody({
          title: loaded.title,
          description: loaded.description,
          optimizedDescription: loaded.optimizedDescription,
          optimizedContext: loaded.optimizedContext,
          path: loaded.path,
          content: loaded.content,
        })
        parts.push(`=== ${sid} ===\n${truncate(body, ids.length > 1 ? 2000 : 4000)}`)
      }
      return parts.join('\n\n')
    }
    case 'search_specs': {
      const rawQueries = Array.isArray(args.queries) ? (args.queries as string[]) : []
      const queries = rawQueries.length > 0 ? rawQueries.slice(0, 5) : [String(args.query ?? '')]
      const limit = Math.min(10, Math.max(1, Number(args.limit ?? 5)))
      const parts: string[] = []
      for (const q of queries) {
        const result = await runtime.graph.search(q, { specs: true }, limit)
        const lines = (result.specs ?? []).map((row) => {
          const bits = [`- ${row.specId}`]
          if (row.title) bits.push(`title: ${row.title}`)
          if (row.description) bits.push(`summary: ${truncate(row.description, 120)}`)
          if (row.score !== undefined) bits.push(`score: ${row.score}`)
          return bits.join(' | ')
        })
        parts.push(`[query: ${q}]\n${lines.length > 0 ? lines.join('\n') : '(no specs matched)'}`)
      }
      return parts.join('\n\n')
    }
    case 'search_symbols': {
      const rawQueries = Array.isArray(args.queries) ? (args.queries as string[]) : []
      const queries = rawQueries.length > 0 ? rawQueries.slice(0, 5) : [String(args.query ?? '')]
      const limit = Math.min(10, Math.max(1, Number(args.limit ?? 5)))
      const parts: string[] = []
      for (const q of queries) {
        const result = await runtime.graph.search(q, { symbols: true }, limit)
        const lines = (result.symbols ?? []).flatMap((row) => {
          return (row.hits ?? []).map((hit) => {
            const sym = hit.symbol
            return `- ${sym?.name ?? 'unknown'} (${sym?.kind ?? 'symbol'}) in ${sym?.filePath ?? 'unknown'} | score: ${hit.score ?? row.score ?? 0}`
          })
        })
        parts.push(`[query: ${q}]\n${lines.length > 0 ? lines.join('\n') : '(no symbols matched)'}`)
      }
      return parts.join('\n\n')
    }
    case 'get_file_symbols': {
      const filePath = String(args.filePath ?? '')
      const limit = Math.min(20, Math.max(1, Number(args.limit ?? 10)))
      const result = await runtime.graph.search(filePath, { symbols: true }, 50)
      const matches = (result.symbols ?? [])
        .flatMap((row) => {
          return (row.hits ?? [])
            .filter((hit) => hit.symbol?.filePath === filePath)
            .map((hit) => `- ${hit.symbol?.name ?? 'unknown'} (${hit.symbol?.kind ?? 'symbol'})`)
        })
        .slice(0, limit)
      return matches.length > 0 ? matches.join('\n') : `(no symbols found in ${filePath})`
    }
    case 'get_graph_stats': {
      const liveStats = await runtime.graph.getGraphStats()
      return `stale: ${liveStats.stale}\nspecCount: ${liveStats.specCount ?? 0}\nfileCount: ${liveStats.fileCount ?? 0}\nsymbolCount: ${liveStats.symbolCount ?? 0}`
    }
    case 'get_symbol_code': {
      // Build items list: batch (symbols[]) or single
      const rawSymbols = Array.isArray(args.symbols) ? (args.symbols as Array<{ symbolQuery: string; filePath?: string }>) : []
      const items = rawSymbols.length > 0
        ? rawSymbols.slice(0, 3)
        : [{ symbolQuery: String(args.symbolQuery ?? ''), filePath: args.filePath ? String(args.filePath) : undefined }]

      const resolveOneSymbol = async (symbolQuery: string, filterFile: string | undefined): Promise<string> => {
        const result = await runtime.graph.search(symbolQuery, { symbols: true }, 10)
        let matchedSym: { name?: string; kind?: string; filePath?: string; line?: number; endLine?: number } | undefined
        for (const row of result.symbols ?? []) {
          const candidates = [
            row.logicalTarget,
            ...(row.hits ?? []).map((h) => h.symbol),
          ].filter((s): s is NonNullable<typeof s> => Boolean(s?.filePath))
          for (const sym of candidates) {
            if (!sym.filePath) continue
            if (filterFile) {
              const normSym = sym.filePath.replace(/^[^:]+:/, '').replace(/\\/g, '/').toLowerCase()
              const normFilter = filterFile.replace(/^[^:]+:/, '').replace(/\\/g, '/').toLowerCase()
              if (normSym !== normFilter && !normSym.endsWith(normFilter) && !normFilter.endsWith(normSym)) continue
            }
            matchedSym = sym
            break
          }
          if (matchedSym) break
        }
        if (!matchedSym || !matchedSym.filePath) return `(symbol not found: ${symbolQuery})`
        const absPath = resolveWorkspacePathToAbsPath(matchedSym.filePath)
        if (!fs.existsSync(absPath)) return `Symbol ${matchedSym.name ?? symbolQuery} found at ${matchedSym.filePath}, but file does not exist on disk.`
        const fileLines = fs.readFileSync(absPath, 'utf8').split('\n')
        const startLine = Math.max(1, (matchedSym.line ?? 1) - 1)
        const endLine = Math.min(fileLines.length, matchedSym.endLine ?? (matchedSym.line ?? 1) + 25)
        const snippet = fileLines.slice(startLine - 1, endLine).join('\n')
        const perSnippetLimit = items.length > 1 ? 1500 : 3000
        return `// ${matchedSym.name} (${matchedSym.kind ?? 'symbol'}) in ${matchedSym.filePath}:${startLine}-${endLine}\n${truncate(snippet, perSnippetLimit)}`
      }

      const parts = await Promise.all(items.map((item) => resolveOneSymbol(item.symbolQuery, item.filePath)))
      return parts.join('\n\n')
    }
    case 'get_covering_specs': {
      const rawPaths = Array.isArray(args.filePaths) ? (args.filePaths as string[]) : []
      const filePaths = rawPaths.length > 0 ? rawPaths.slice(0, 5) : [String(args.filePath ?? '')]
      const parts: string[] = []
      for (const fp of filePaths) {
        const impact = await runtime.graph.analyzeFileImpact(fp, 1)
        const specs = (impact.coveringSpecs ?? []).map((s) => `${s.specId} (depth ${s.minDepth})`)
        parts.push(`[${fp}]\n${specs.length > 0 ? specs.join('\n') : '(no covering specs)'}`)
      }
      return parts.join('\n\n')
    }
    case 'get_spec_depends_on': {
      const rawIds = Array.isArray(args.specIds) ? (args.specIds as string[]) : []
      const ids = rawIds.length > 0 ? rawIds.slice(0, 5) : [String(args.specId ?? '')]
      const parts: string[] = []
      for (const sid of ids) {
        const deps = await runtime.graph.getSpecDependsOn(sid)
        parts.push(`[${sid}]: ${deps.length > 0 ? deps.join(', ') : '(no dependsOn)'}`)
      }
      return parts.join('\n')
    }
    case 'analyze_symbol_impact': {
      const symbolId = String(args.symbolId ?? '')
      const depth = Math.min(3, Math.max(1, Number(args.depth ?? 1)))
      const impact = await runtime.graph.analyzeSymbolImpact(symbolId, depth)
      const affected = impact.affectedFiles?.length ? impact.affectedFiles.join(', ') : '(none)'
      return `target: ${impact.target ?? symbolId}\nriskLevel: ${impact.riskLevel ?? 'UNKNOWN'}\naffectedFiles: ${affected}`
    }
    case 'analyze_spec_impact': {
      const specId = String(args.specId ?? '')
      const depth = Math.min(3, Math.max(1, Number(args.depth ?? 1)))
      const env = await runtime.graph.analyzeSpecImpact(specId, depth)
      const imp = env.impact
      const affectedSpecs = imp?.affectedSpecs?.length ? imp.affectedSpecs.join(', ') : '(none)'
      const affectedFiles = imp?.affectedFiles?.length ? imp.affectedFiles.join(', ') : '(none)'
      return `spec: ${specId}\nriskLevel: ${imp?.riskLevel ?? 'UNKNOWN'}\naffectedSpecs: ${affectedSpecs}\naffectedFiles: ${affectedFiles}`
    }
    case 'analyze_file_impact': {
      const rawPaths = Array.isArray(args.filePaths) ? (args.filePaths as string[]) : []
      const filePaths = rawPaths.length > 0 ? rawPaths.slice(0, 5) : [String(args.filePath ?? '')]
      const depth = Math.min(3, Math.max(1, Number(args.depth ?? 1)))
      const parts: string[] = []
      for (const fp of filePaths) {
        const impact = await runtime.graph.analyzeFileImpact(fp, depth)
        const covering = (impact.coveringSpecs ?? []).map((s) => `${s.specId} (depth ${s.minDepth})`).join(', ') || '(none)'
        const affected = impact.affectedFiles?.length ? impact.affectedFiles.join(', ') : '(none)'
        parts.push(`[${fp}]\ntarget: ${impact.target ?? fp}\nriskLevel: ${impact.riskLevel ?? 'UNKNOWN'}\ncoveringSpecs: ${covering}\naffectedFiles: ${affected}`)
      }
      return parts.join('\n\n')
    }
    case 'score_facet_alignment': {
      const specId = String(args.specId ?? '')
      const loaded = await runtime.graph.getSpecContext(specId)
      const score = scoreSpecIdByFacets(specId, loaded?.title, ctx.facets, ctx.codeKeywords, ctx.refinedIntent)
      return `specId: ${specId}\nfacetAlignmentScore: ${score}`
    }
    default:
      return `Unknown tool: ${name}`
  }
}

interface SpecDecisionRow {
  specId: string
  action: 'RETAIN' | 'REJECT'
  summary?: string
  reason: string
}

function logSpecDecision(specId: string, action: 'RETAIN' | 'REJECT', reason?: string): void {
  console.log(`   └─ ${specId}: ${action}`)
  console.log(`      why: ${reason?.trim() || '(no reason returned by LLM)'}`)
}

async function ollamaChatWithTools(
  baseUrl: string,
  model: string,
  messages: OllamaChatMessage[],
  tools: OllamaToolDefinition[],
  ctx: ToolExecutionContext,
  timeoutMs: number,
  maxTurns: number = OLLAMA_MAX_TOOL_TURNS,
): Promise<SpecDecisionRow[]> {
  const workingMessages = [...messages]
  const investigatedSpecs = new Set<string>()

  // Collect initial specIds from user message prompt
  const initialPromptSpecs = extractAllSpecIds(messages.map((m) => m.content ?? '').join(' '))
  for (const id of initialPromptSpecs) investigatedSpecs.add(id)

  for (let turn = 0; turn < maxTurns; turn++) {
    const promptEstimate = workingMessages.map((m) => m.content ?? '').join('\n')
    let data: OllamaChatResponse
    try {
      data = await ollamaChat(
        baseUrl,
        { model: normalizeOllamaModel(model), messages: workingMessages, tools },
        timeoutMs,
        promptEstimate,
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('XML syntax error') || msg.includes('HTTP 500')) {
        console.warn(`   ⚠️  Ollama XML tool parse error on turn ${turn + 1}. Proceeding to resolution pass...`)
        break
      }
      throw err
    }

    const assistant = data.message
    let toolCalls = assistant.tool_calls ?? []

    if (assistant.content && assistant.content.trim().length > 0) {
      console.log(`   💭 LLM Thought: "${truncate(assistant.content.replace(/\s+/g, ' ').trim(), 140)}"`)
    }

    if (toolCalls.length === 0 && assistant.content) {
      const xmlCalls = extractXmlToolCalls(assistant.content)
      if (xmlCalls.length > 0) {
        toolCalls = xmlCalls
      }
    }

    if (toolCalls.length === 0) {
      const content = assistant.content ?? ''
      console.log('\n⚠️  Ollama ended tool calling turn without executing a tool call.')
      console.log('   Raw LLM Output:')
      console.log(content ? content.split('\n').map((l) => `   | ${l}`).join('\n') : '   (empty content)\n')

      const jsonStr = extractJsonSnippet(content)
      const parsed = safeParseJSON<any>(jsonStr, safeParseJSON<any>(content, {}))
      let decisions: SpecDecisionRow[] = Array.isArray(parsed) ? parsed : (parsed?.decisions ?? [])

      if (!decisions.length && parsed && typeof parsed === 'object') {
        const actionVal = String(parsed.decision ?? parsed.action ?? '').toUpperCase()
        const reasonVal = String(parsed.rationale ?? parsed.reason ?? '')
        if (actionVal === 'RETAIN' || actionVal === 'REJECT') {
          const specIdVal = String(parsed.specId ?? '')
          const matchedSpecId = specIdVal || extractSpecIdFromContent(content)
          if (matchedSpecId) {
            decisions = [
              {
                specId: matchedSpecId,
                action: actionVal as 'RETAIN' | 'REJECT',
                reason: reasonVal || 'Decided by LLM json analysis',
                summary: parsed.summary,
              },
            ]
          }
        }
      }

      if (!decisions.length) {
        decisions = parseMarkdownSpecDecisions(content)
      }

      // If we recovered decisions for most/all investigated specs, use them immediately
      const isCompleteFallback = decisions.length >= Math.max(2, Math.floor(investigatedSpecs.size * 0.5))
      if (decisions.length > 0 && isCompleteFallback) {
        console.log(`✅ Recovered ${decisions.length} spec decision(s) from LLM output fallback.`)
        return decisions.map((row: any) => ({
          specId: String(row.specId),
          action: row.action === 'RETAIN' ? 'RETAIN' : 'REJECT',
          summary: row.summary,
          reason: String(row.reason ?? ''),
        }))
      }

      if (runtime.llm.completeStructured) {
        console.log(`   ↪ Requesting final structured JSON decisions for all ${investigatedSpecs.size} investigated spec(s)...\n`)
        const specList = Array.from(investigatedSpecs).map((s) => `- ${s}`).join('\n')
        const transcriptText = workingMessages
          .map((m) => {
            const toolStr = m.tool_calls ? JSON.stringify(m.tool_calls) : ''
            return `${m.role.toUpperCase()}: ${m.content ?? ''} ${toolStr}`.trim()
          })
          .join('\n\n')

        const decisionPrompt = `You are a spec-driven architecture evaluator.
Below is the investigation transcript of your tool calls, code inspections, and summary.

[USER INTENT]
${ctx.refinedIntent}

[ALL SPECS INVESTIGATED (${investigatedSpecs.size}) — DECIDE FOR EACH ONE]
${specList || '(none)'}

[INVESTIGATION TRANSCRIPT]
${transcriptText.slice(-12000)}

Decide RETAIN or REJECT for EVERY spec listed above in [ALL SPECS INVESTIGATED].`

        try {
          const structuredResult = await runtime.llm.completeStructured<{ decisions?: SpecDecisionRow[] }>(
            decisionPrompt,
            SPEC_EVAL_DECISIONS_JSON_SCHEMA,
            { model, timeoutMs },
          )

          if (structuredResult.decisions && structuredResult.decisions.length > 0) {
            console.log(`✅ Structured fallback recovered ${structuredResult.decisions.length} spec decision(s).`)
            return structuredResult.decisions.map((row: any) => ({
              specId: String(row.specId),
              action: row.action === 'RETAIN' ? 'RETAIN' : 'REJECT',
              summary: row.summary,
              reason: String(row.reason ?? ''),
            }))
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          console.warn(`   ⚠️  Structured decision completion failed: ${msg}`)
        }
      }

      throw new LlmError(
        `Ollama returned no tool_calls and no parseable decisions.\n\n[Raw Assistant Output]\n${content || '(empty content)'}`,
      )
    }

    workingMessages.push({
      role: 'assistant',
      content: assistant.content ?? '',
      tool_calls: toolCalls,
    })

    for (const toolCall of toolCalls) {
      const name = toolCall.function.name
      const args = toolCall.function.arguments ?? {}

      console.log(`   🛠️ LLM Tool Call: ${name}(${JSON.stringify(args)})`)

      if (args.specId) investigatedSpecs.add(String(args.specId))

      if (name === 'submit_decisions') {
        const decisions = (args.decisions ?? []) as SpecDecisionRow[]
        return decisions.map((row) => ({
          specId: String(row.specId),
          action: row.action === 'RETAIN' ? 'RETAIN' : 'REJECT',
          summary: row.summary,
          reason: String(row.reason ?? ''),
        }))
      }

      const result = await executeIntentPlanTool(name, args, ctx)
      console.log(`   └─ 📄 Result: ${truncate(result.replace(/\s+/g, ' ').trim(), 120)}`)
      const discovered = extractAllSpecIds(result)
      for (const id of discovered) investigatedSpecs.add(id)
      
      workingMessages.push({
        role: 'tool',
        tool_name: name,
        content: result,
      })
    }
  }

  if (runtime.llm.completeStructured && investigatedSpecs.size > 0) {
    console.log(`\n⚠️  Reached max tool turns (${maxTurns}). Executing final structured JSON resolution for all ${investigatedSpecs.size} investigated spec(s)...\n`)
    const specList = Array.from(investigatedSpecs).map((s) => `- ${s}`).join('\n')
    const transcriptText = workingMessages
      .map((m) => {
        const toolStr = m.tool_calls ? JSON.stringify(m.tool_calls) : ''
        return `${m.role.toUpperCase()}: ${m.content ?? ''} ${toolStr}`.trim()
      })
      .join('\n\n')

    const decisionPrompt = `You are a spec-driven architecture evaluator.
Below is the investigation transcript of your tool calls, code inspections, and summary across ${maxTurns} turns.

[USER INTENT]
${ctx.refinedIntent}

[ALL SPECS INVESTIGATED (${investigatedSpecs.size}) — DECIDE FOR EACH ONE]
${specList || '(none)'}

[INVESTIGATION TRANSCRIPT]
${transcriptText.slice(-15000)}

Decide RETAIN or REJECT for EVERY spec listed above in [ALL SPECS INVESTIGATED].`

    try {
      const structuredResult = await runtime.llm.completeStructured<{ decisions?: SpecDecisionRow[] }>(
        decisionPrompt,
        SPEC_EVAL_DECISIONS_JSON_SCHEMA,
        { model, timeoutMs },
      )

      if (structuredResult.decisions && structuredResult.decisions.length > 0) {
        console.log(`✅ Max-turns fallback recovered ${structuredResult.decisions.length} spec decision(s).`)
        return structuredResult.decisions.map((row: any) => ({
          specId: String(row.specId),
          action: row.action === 'RETAIN' ? 'RETAIN' : 'REJECT',
          summary: row.summary,
          reason: String(row.reason ?? ''),
        }))
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`⚠️ Max-turns structured decision completion failed: ${msg}`)
    }
  }

  throw new LlmError(`Ollama tool loop exceeded ${maxTurns} turns without submit_decisions`)
}

const RECONCILE_PLAN_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['retainedSpecIds', 'retainedNewSpecIds', 'retainedFilePaths', 'prunedItems'],
  properties: {
    retainedSpecIds: { type: 'array', items: { type: 'string' } },
    retainedNewSpecIds: { type: 'array', items: { type: 'string' } },
    retainedFilePaths: { type: 'array', items: { type: 'string' } },
    prunedItems: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'reason'],
        properties: {
          id: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
  },
}

const SPEC_EVAL_DECISIONS_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['decisions'],
  properties: {
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['specId', 'action', 'reason'],
        properties: {
          specId: { type: 'string' },
          action: { type: 'string', enum: ['RETAIN', 'REJECT'] },
          summary: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
  },
}

const STEP0_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    refinedIntent: { type: 'string' },
    facets: {
      type: 'object',
      properties: {
        when: { type: 'array', items: { type: 'string' } },
        what: { type: 'array', items: { type: 'string' } },
        how: { type: 'array', items: { type: 'string' } },
      },
      required: ['when', 'what', 'how'],
    },
    codeKeywords: {
      type: 'object',
      properties: {
        literal: { type: 'array', items: { type: 'string' } },
        expanded: { type: 'array', items: { type: 'string' } },
      },
      required: ['literal', 'expanded'],
    },
    specKeywords: {
      type: 'object',
      properties: {
        literal: { type: 'array', items: { type: 'string' } },
        expanded: { type: 'array', items: { type: 'string' } },
      },
      required: ['literal', 'expanded'],
    },
  },
  required: ['refinedIntent', 'facets', 'codeKeywords', 'specKeywords'],
}

async function callLlm(promptText: string, model: string, timeoutMs: number): Promise<string> {
  return runtime.llm.complete(promptText, { model, timeoutMs })
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

function extractAllSpecIds(text: string): string[] {
  const matches = text.match(/([a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+)/g) ?? []
  return [...new Set(matches)]
}

function extractSpecIdFromContent(content: string): string | undefined {
  const match = content.match(/([a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+)/)
  return match ? match[1] : undefined
}

function extractXmlToolCalls(content: string): OllamaToolCall[] {
  const toolCalls: OllamaToolCall[] = []
  if (!content) return toolCalls

  const funcRegex = /<function=([a-zA-Z0-9_-]+)>([\s\S]*?)<\/function>/g
  let match: RegExpExecArray | null

  while ((match = funcRegex.exec(content)) !== null) {
    const name = match[1]
    const body = match[2]
    const args: Record<string, unknown> = {}

    const paramRegex = /<parameter=([a-zA-Z0-9_-]+)>([\s\S]*?)<\/parameter>/g
    let pMatch: RegExpExecArray | null
    while ((pMatch = paramRegex.exec(body)) !== null) {
      const paramName = pMatch[1]
      const paramVal = pMatch[2].trim()
      args[paramName] = paramVal
    }

    toolCalls.push({
      id: `call_xml_${Date.now()}_${toolCalls.length}`,
      type: 'function',
      function: {
        name,
        arguments: args,
      },
    })
  }

  return toolCalls
}

function extractJsonSnippet(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (match && match[1]) return match[1].trim()
  return text.trim()
}

function parseMarkdownSpecDecisions(text: string): SpecDecisionRow[] {
  const decisions: SpecDecisionRow[] = []
  if (!text.trim()) return decisions

  const blocks = text.split(/(?:^\d+\.|\n\d+\.|\n###?\s+)/g)

  for (const block of blocks) {
    const trimmed = block.trim()
    if (!trimmed) continue

    const specIdMatch = trimmed.match(/(?:\*\*|`)([a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+)(?:\*\*|`)/)
    const specId = specIdMatch ? specIdMatch[1] : undefined

    if (!specId) continue

    const actionMatch = trimmed.match(/Action:\s*(RETAIN|REJECT)/i)
    const action: 'RETAIN' | 'REJECT' = actionMatch
      ? actionMatch[1].toUpperCase() === 'RETAIN'
        ? 'RETAIN'
        : 'REJECT'
      : 'RETAIN'

    const reasonMatch = trimmed.match(/Reason:\s*([^\n]+(?:\n\s*-\s*Summary:)?)/i)
    let reason = ''
    if (reasonMatch) {
      reason = reasonMatch[1].replace(/-\s*Summary:.*$/i, '').replace(/\n+/g, ' ').trim()
    }

    const summaryMatch = trimmed.match(/Summary:\s*([^\n]+)/i)
    const summary = summaryMatch ? summaryMatch[1].trim() : undefined

    decisions.push({
      specId,
      action,
      reason: reason || 'Decided by LLM markdown analysis',
      summary,
    })
  }

  return decisions
}

function safeParseJSON<T>(raw: string, fallback: T): T {
  try {
    let cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim()
    const firstBrace = cleaned.indexOf('{')
    const firstBracket = cleaned.indexOf('[')
    if (firstBracket >= 0 && (firstBrace < 0 || firstBracket < firstBrace)) {
      const lastBracket = cleaned.lastIndexOf(']')
      if (lastBracket > firstBracket) cleaned = cleaned.slice(firstBracket, lastBracket + 1)
    } else if (firstBrace >= 0) {
      const lastBrace = cleaned.lastIndexOf('}')
      if (lastBrace > firstBrace) cleaned = cleaned.slice(firstBrace, lastBrace + 1)
    }
    return JSON.parse(cleaned) as T
  } catch {
    return fallback
  }
}

function dedupeKeywords(terms: string[]): string[] {
  const seen = new Set<string>()
  return terms
    .map((t) => t.trim())
    .filter((t) => {
      const key = t.toLowerCase()
      if (t.length < 2 || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

interface ExpandedKeywords {
  literal: string[]
  expanded: string[]
}

/** Structured intent facets — project-agnostic lifecycle/mechanism decomposition. */
interface IntentFacets {
  when: string[]
  what: string[]
  how: string[]
}

function finalizeSearchKeywords(keywords: ExpandedKeywords): ExpandedKeywords {
  const literal = dedupeKeywords(keywords.literal)
  const literalKeys = new Set(literal.map((term) => normalizeAccents(term).toLowerCase()))
  const expanded = dedupeKeywords(keywords.expanded).filter(
    (term) => !literalKeys.has(normalizeAccents(term).toLowerCase()),
  )
  return { literal, expanded }
}

function parseKeywordGroup(
  raw: string[] | ExpandedKeywords | undefined,
  fallback: string[],
): ExpandedKeywords {
  if (!raw) return { literal: fallback, expanded: [] }
  if (Array.isArray(raw)) return { literal: dedupeKeywords(raw), expanded: [] }
  return {
    literal: dedupeKeywords(raw.literal ?? []),
    expanded: dedupeKeywords(raw.expanded ?? []),
  }
}

function normalizeAccents(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function prefersFrontendIntent(refinedIntent: string, rawIntent: string): boolean {
  const text = normalizeAccents(`${refinedIntent} ${rawIntent}`).toLowerCase()
  return (
    text.includes('frontend') ||
    text.includes('front-end') ||
    text.includes('solo frontend') ||
    text.includes('only frontend') ||
    text.includes('sin backend') ||
    text.includes('without backend')
  )
}

function buildSearchQueries(keywords: ExpandedKeywords, refinedIntent: string): string[] {
  const queries: string[] = []
  if (keywords.literal.length > 0) queries.push(keywords.literal.join(' '))
  if (keywords.expanded.length > 0) queries.push(keywords.expanded.join(' '))

  for (const literal of keywords.literal.slice(0, 2)) {
    for (const expanded of keywords.expanded.slice(0, 4)) {
      queries.push(`${literal} ${expanded}`)
    }
  }

  if (queries.length === 0) queries.push(refinedIntent)
  return dedupeKeywords(queries).slice(0, 8)
}

function parseIntentFacets(
  raw: Partial<IntentFacets> | undefined,
  refinedIntent: string,
  codeKeywords: ExpandedKeywords,
  specKeywords: ExpandedKeywords,
): IntentFacets {
  const normalize = (arr?: string[]) =>
    dedupeKeywords((arr ?? []).map((s) => s.trim()).filter((s) => s.length >= 2))

  const facets: IntentFacets = {
    when: normalize(raw?.when),
    what: normalize(raw?.what),
    how: normalize(raw?.how),
  }

  const hasAny = facets.when.length > 0 || facets.what.length > 0 || facets.how.length > 0
  if (!hasAny) {
    return fallbackIntentFacets(refinedIntent, codeKeywords, specKeywords)
  }

  if (facets.what.length === 0) {
    facets.what = dedupeKeywords([...codeKeywords.literal, ...codeKeywords.expanded.slice(0, 6)])
  }
  if (facets.how.length === 0) {
    facets.how = dedupeKeywords([...specKeywords.literal, ...specKeywords.expanded.slice(0, 6)])
  }
  if (facets.when.length === 0) {
    facets.when = dedupeKeywords([
      ...tokenizeForSearch(refinedIntent, 6),
      ...codeKeywords.expanded.slice(0, 4),
    ])
  }

  return facets
}

function looksLikeCodeIdentifier(phrase: string): boolean {
  const trimmed = phrase.trim()
  if (!trimmed) return false
  if (trimmed.includes('_')) return true
  if (/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/i.test(trimmed)) return true
  return false
}

function sanitizeIntentFacets(
  facets: IntentFacets,
  codeKeywords: ExpandedKeywords,
  specKeywords: ExpandedKeywords,
): { facets: IntentFacets; codeKeywords: ExpandedKeywords; specKeywords: ExpandedKeywords } {
  const misplaced: string[] = []

  const cleanFacet = (phrases: string[]): string[] =>
    phrases.filter((phrase) => {
      if (looksLikeCodeIdentifier(phrase)) {
        misplaced.push(phrase)
        return false
      }
      return true
    })

  const sanitized: IntentFacets = {
    when: cleanFacet(facets.when),
    what: cleanFacet(facets.what),
    how: cleanFacet(facets.how),
  }

  if (misplaced.length === 0) {
    return { facets: sanitized, codeKeywords, specKeywords }
  }

  const codeExpanded = dedupeKeywords([...codeKeywords.expanded, ...misplaced])
  const specExpanded = dedupeKeywords([...specKeywords.expanded, ...misplaced])

  return {
    facets: sanitized,
    codeKeywords: { literal: codeKeywords.literal, expanded: codeExpanded },
    specKeywords: { literal: specKeywords.literal, expanded: specExpanded },
  }
}

function normalizeIntentFacets(
  facets: IntentFacets,
  codeKeywords: ExpandedKeywords,
  specKeywords: ExpandedKeywords,
): IntentFacets {
  const howTerms = new Set(facetSearchTerms(facets.how))
  const what = facets.what.filter((phrase) => {
    const tokens = facetSearchTerms([phrase])
    return !tokens.every((token) => howTerms.has(token))
  })

  const when = dedupeKeywords([
    ...facets.when,
    ...codeKeywords.expanded.filter((term) => {
      const tokens = facetSearchTerms([term])
      return tokens.some((t) => !howTerms.has(t) && !facetSearchTerms(what).includes(t))
    }),
  ]).slice(0, 6)

  return {
    when,
    what: what.length > 0 ? what : facets.what,
    how: facets.how.length > 0 ? facets.how : dedupeKeywords([...specKeywords.literal, ...specKeywords.expanded.slice(0, 4)]),
  }
}

function fallbackIntentFacets(
  refinedIntent: string,
  codeKeywords: ExpandedKeywords,
  specKeywords: ExpandedKeywords,
): IntentFacets {
  return {
    when: dedupeKeywords([
      ...tokenizeForSearch(refinedIntent, 6),
      ...codeKeywords.expanded.slice(0, 4),
    ]),
    what: dedupeKeywords([...codeKeywords.literal, ...codeKeywords.expanded.slice(0, 6)]),
    how: dedupeKeywords([...specKeywords.literal, ...specKeywords.expanded.slice(0, 6)]),
  }
}

function formatIntentFacetsForPrompt(facets: IntentFacets): string {
  return [
    `when (lifecycle moment / trigger): ${facets.when.join('; ') || '(not specified)'}`,
    `what (behavior / artifact): ${facets.what.join('; ') || '(not specified)'}`,
    `how (control / mechanism): ${facets.how.join('; ') || '(not specified)'}`,
  ].join('\n')
}

function facetSearchTerms(facet: string[]): string[] {
  return dedupeKeywords(facet.flatMap((phrase) => tokenizeForSearch(phrase, 6))).map((t) =>
    normalizeAccents(t).toLowerCase(),
  )
}

function countPathTermMatches(filePath: string, terms: string[]): number {
  const lower = normalizePathForMatch(filePath)
  let count = 0
  for (const term of terms) {
    if (term.length >= 3 && lower.includes(term)) count++
  }
  return count
}

function extractPathStemTokens(filePath: string): string[] {
  const name = filePath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? ''
  return name
    .split(/[-_.]/)
    .map((t) => normalizeAccents(t).toLowerCase())
    .filter((t) => t.length >= 3)
}

function enrichWhenTermsForPathSearch(
  facets: IntentFacets,
  codeKeywords: ExpandedKeywords,
  refinedIntent = '',
): string[] {
  const base = dedupeKeywords([
    ...facetSearchTerms(facets.when),
    ...tokenizeForSearch(refinedIntent, 8),
  ])
  const blocked = new Set([
    ...facetSearchTerms(facets.what),
    ...facetSearchTerms(facets.how),
  ])
  const extra = codeKeywords.expanded
    .flatMap((term) => tokenizeForSearch(term, 4))
    .filter((term) => !blocked.has(term) && !base.includes(term))
  return dedupeKeywords([...base, ...extra])
}

function lifecycleStemPenalty(
  filePath: string,
  facets: IntentFacets,
  codeKeywords: ExpandedKeywords,
  refinedIntent = '',
): number {
  const stemTokens = extractPathStemTokens(filePath)
  const whenTerms = enrichWhenTermsForPathSearch(facets, codeKeywords, refinedIntent)
  let penalty = 0
  for (const stem of stemTokens) {
    if (stem.length < 4) continue
    const explainedByWhen = whenTerms.some(
      (term) => term === stem || stem.includes(term) || term.includes(stem),
    )
    if (!explainedByWhen) penalty += 7
  }
  return penalty
}

function scoreStemTokensAgainstTerms(stemTokens: string[], terms: string[]): number {
  let score = 0
  for (const term of terms) {
    if (term.length < 3) continue
    for (const stem of stemTokens) {
      if (stem === term) score += term.length >= 5 ? 6 : 2
      else if (term.length >= 4 && (stem.includes(term) || term.includes(stem))) score += 3
    }
  }
  return score
}

function scoreFileByFacets(
  filePath: string,
  facets: IntentFacets,
  graphScore: number,
  frontendOnly: boolean,
  codeKeywords: ExpandedKeywords = { literal: [], expanded: [] },
  refinedIntent = '',
): number {
  const stemTokens = extractPathStemTokens(filePath)
  const whenTerms = enrichWhenTermsForPathSearch(facets, codeKeywords, refinedIntent)
  const howTerms = facetSearchTerms(facets.how)
  const whatTerms = facetSearchTerms(facets.what)

  const whenScore = scoreStemTokensAgainstTerms(stemTokens, whenTerms)
  const howScore = scoreStemTokensAgainstTerms(stemTokens, howTerms)
  const whatScore = Math.min(countPathTermMatches(filePath, whatTerms), 2)

  const matchedFacets = [whenScore, howScore, whatScore].filter((s) => s > 0).length
  const multiFacetBonus = matchedFacets >= 2 ? 14 : matchedFacets === 1 ? 0 : -4

  let score = whenScore * 5 + howScore * 5 + whatScore * 1 + multiFacetBonus
  score -= lifecycleStemPenalty(filePath, facets, codeKeywords, refinedIntent)

  if (graphScore > 0) score += Math.log10(graphScore + 1) * 0.35

  const allTerms = dedupeKeywords([...whenTerms, ...howTerms, ...whatTerms])
  score += scoreFileCandidate(filePath, allTerms, frontendOnly, 0) * 0.1

  return score
}

function isStrongFacetAlignedFile(
  filePath: string,
  facets: IntentFacets,
  codeKeywords: ExpandedKeywords,
  refinedIntent = '',
): boolean {
  const score = scoreFileByFacets(filePath, facets, 0, false, codeKeywords, refinedIntent)
  const stemTokens = extractPathStemTokens(filePath)
  const howScore = scoreStemTokensAgainstTerms(stemTokens, facetSearchTerms(facets.how))
  const whenScore = scoreStemTokensAgainstTerms(
    stemTokens,
    enrichWhenTermsForPathSearch(facets, codeKeywords, refinedIntent),
  )
  return howScore >= 2 || whenScore >= 4 || score >= 12
}

function minFacetScoreForInclusion(): number {
  return 4
}

function shouldAutoIncludeCoveringSpec(
  facetScore: number,
  alreadyFromSearch: boolean,
): boolean {
  return facetScore >= minFacetScoreForInclusion() || alreadyFromSearch
}

function scoreSpecIdByFacets(
  specId: string,
  title: string | undefined,
  facets: IntentFacets,
  codeKeywords: ExpandedKeywords,
  refinedIntent = '',
): number {
  const idTail = specId.includes(':') ? specId.split(':').pop()! : specId
  const stemTokens = idTail.split(/[-_]/).map((t) => t.toLowerCase())
  const whenScore = scoreStemTokensAgainstTerms(
    stemTokens,
    enrichWhenTermsForPathSearch(facets, codeKeywords, refinedIntent),
  )
  const howScore = scoreStemTokensAgainstTerms(stemTokens, facetSearchTerms(facets.how))
  const whatScore = scoreStemTokensAgainstTerms(stemTokens, facetSearchTerms(facets.what))
  const titleScore = title
    ? countPathTermMatches(title.toLowerCase(), facetSearchTerms([...facets.when, ...facets.how, ...facets.what]))
    : 0
  return whenScore * 4 + howScore * 4 + whatScore + titleScore
}

function buildFacetFileSearchQueries(facets: IntentFacets): string[] {
  const queries: string[] = []
  const when = facets.when.filter((t) => t.length >= 3)
  const what = facets.what.filter((t) => t.length >= 3)
  const how = facets.how.filter((t) => t.length >= 3)

  if (when.length > 0) queries.push(when.slice(0, 4).join(' '))
  if (how.length > 0) queries.push(how.slice(0, 4).join(' '))
  if (when.length > 0 && how.length > 0) {
    queries.push([...when.slice(0, 2), ...how.slice(0, 2)].join(' '))
  }
  if (when.length > 0 && what.length > 0) {
    queries.push([...when.slice(0, 2), ...what.slice(0, 2)].join(' '))
  }

  return dedupeKeywords(queries).slice(0, 6)
}

function buildFacetSpecSearchQueries(facets: IntentFacets, specKeywords: ExpandedKeywords): string[] {
  const facetQueries = buildFacetFileSearchQueries(facets)
  const howWhat = [...facets.how, ...facets.what].filter((t) => t.length >= 3)
  if (howWhat.length > 0) facetQueries.push(howWhat.slice(0, 5).join(' '))

  const whenTerms = facetSearchTerms(facets.when)
  if (whenTerms.length > 0) {
    facetQueries.push(whenTerms.slice(0, 4).join(' '))
    if (facets.what.length > 0) {
      facetQueries.push(
        [...facets.when.slice(0, 2), ...facets.what.slice(0, 2)].filter((t) => t.length >= 3).join(' '),
      )
    }
  }

  return dedupeKeywords([...facetQueries, ...buildSearchQueries(specKeywords, '')]).slice(0, 12)
}

function rankDiscoveredCodeFilesByFacets(
  paths: string[],
  graphScores: Map<string, number>,
  facets: IntentFacets,
  codeKeywords: ExpandedKeywords,
  refinedIntent: string,
  rawIntent: string,
  maxFiles: number,
): string[] {
  const frontendOnly = prefersFrontendIntent(refinedIntent, rawIntent)

  return [...new Set(paths)]
    .filter(isLikelyApplicationSource)
    .map((filePath) => ({
      filePath,
      score: scoreFileByFacets(
        filePath,
        facets,
        graphScores.get(filePath) ?? 0,
        frontendOnly,
        codeKeywords,
        refinedIntent,
      ),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxFiles)
    .map((row) => row.filePath)
}

function buildFileSearchQueries(
  keywords: ExpandedKeywords,
  refinedIntent: string,
  rawIntent: string,
): string[] {
  const queries = new Set<string>()
  const literal = keywords.literal.filter((term) => term.length >= 3)
  const expanded = keywords.expanded.filter((term) => term.length >= 3)

  if (literal.length > 0) queries.add(literal.join(' '))
  if (expanded.length > 0) queries.add(expanded.join(' '))

  for (const lit of literal.slice(0, 2)) {
    for (const exp of expanded.slice(0, 4)) {
      queries.add(`${lit} ${exp}`)
    }
  }

  if (queries.size === 0) {
    const fallback = tokenizeForSearch(`${rawIntent} ${refinedIntent}`, 8)
    if (fallback.length > 0) queries.add(fallback.join(' '))
  }

  return [...queries].slice(0, 6)
}

function mergeGraphSearchResults(results: GraphSearchResult[]): GraphSearchResult {
  const symbols = new Map<string, GraphSearchSymbolRow>()
  const specs = new Map<string, GraphSearchSpecRow>()
  const files = new Map<string, NonNullable<GraphSearchResult['files']>[number]>()

  for (const result of results) {
    for (const row of result.symbols ?? []) {
      const key =
        row.logicalTarget?.id ??
        row.logicalTarget?.surface ??
        row.hits?.[0]?.symbol?.id ??
        JSON.stringify(row)
      if (!symbols.has(key)) symbols.set(key, row)
    }
    for (const row of result.specs ?? []) {
      const existing = specs.get(row.specId)
      if (!existing || (row.score ?? 0) > (existing.score ?? 0)) specs.set(row.specId, row)
    }
    for (const row of result.files ?? []) {
      const key = row.path ?? row.filePath ?? JSON.stringify(row)
      const existing = files.get(key)
      if (!existing || (row.score ?? 0) > (existing.score ?? 0)) files.set(key, row)
    }
  }

  return {
    symbols: [...symbols.values()],
    specs: [...specs.values()],
    files: [...files.values()],
  }
}

async function safeGraphSearchWithTimeout(
  query: string,
  categories: { symbols?: boolean; specs?: boolean; files?: boolean },
  limit: number,
  timeoutMs = 5000,
): Promise<GraphSearchResult> {
  const catLabel = Object.keys(categories).filter((k) => (categories as any)[k]).join('+')
  console.log(`   🔎 CodeGraph search [${catLabel}]: "${query}"`)
  let timer: NodeJS.Timeout
  const timeoutPromise = new Promise<GraphSearchResult>((resolve) => {
    timer = setTimeout(() => resolve({ symbols: [], specs: [], files: [] }), timeoutMs)
  })

  try {
    const res = await Promise.race([
      safeGraphSearch(query, categories, limit),
      timeoutPromise,
    ])
    clearTimeout(timer!)
    return res
  } catch {
    clearTimeout(timer!)
    return { symbols: [], specs: [], files: [] }
  }
}

async function graphSearchMulti(
  queries: string[],
  categories: { symbols?: boolean; specs?: boolean; files?: boolean },
  limit: number,
): Promise<GraphSearchResult> {
  const perQueryLimit = Math.max(limit, Math.ceil(limit / Math.max(queries.length, 1)) + 2)
  const results: GraphSearchResult[] = []

  for (let i = 0; i < queries.length; i += 3) {
    const chunk = queries.slice(i, i + 3)
    const chunkResults = await Promise.all(
      chunk.map((query) => safeGraphSearchWithTimeout(query, categories, perQueryLimit, 5000)),
    )
    results.push(...chunkResults)
  }

  const merged = mergeGraphSearchResults(results)
  return {
    symbols: merged.symbols?.slice(0, limit),
    specs: merged.specs?.slice(0, limit),
    files: merged.files?.slice(0, limit),
  }
}

function extractCodeFilesFromFileSearch(files: GraphSearchResult['files']): string[] {
  const paths = new Set<string>()
  for (const row of files ?? []) {
    const filePath = row.filePath ?? row.path
    if (filePath && isLikelyApplicationSource(filePath)) paths.add(filePath)
  }
  return [...paths]
}

function mergeDiscoveredCodeFiles(...groups: string[][]): string[] {
  return dedupeKeywords(groups.flat())
}

function normalizePathForMatch(filePath: string): string {
  return filePath.replace(/\\/g, '/').trim().toLowerCase()
}

function scoreFileCandidate(
  filePath: string,
  terms: string[],
  frontendOnly = false,
  graphScore = 0,
): number {
  const lower = normalizePathForMatch(filePath)
  let score = 0
  for (const term of terms) {
    if (term.length >= 3 && lower.includes(term)) score += 2
  }
  if (graphScore > 0) score += Math.log10(graphScore + 1)
  if (frontendOnly) {
    if (lower.includes('/js/') || lower.includes('/frontend/') || lower.endsWith('.js') || lower.endsWith('.ts') || lower.endsWith('.tsx') || lower.endsWith('.jsx')) score += 4
    if (lower.includes('/controllers/') || lower.endsWith('.php')) score -= 5
  }
  return score
}

function rankDiscoveredCodeFiles(
  paths: string[],
  graphScores: Map<string, number>,
  refinedIntent: string,
  rawIntent: string,
  maxFiles: number,
): string[] {
  const frontendOnly = prefersFrontendIntent(refinedIntent, rawIntent)
  const terms = dedupeKeywords([
    ...tokenizeForSearch(refinedIntent, 10),
    ...tokenizeForSearch(rawIntent, 10),
  ]).map((t) => normalizeAccents(t).toLowerCase())

  return [...new Set(paths)]
    .filter(isLikelyApplicationSource)
    .map((filePath) => ({
      filePath,
      score: scoreFileCandidate(filePath, terms, frontendOnly, graphScores.get(filePath) ?? 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxFiles)
    .map((row) => row.filePath)
}

function graphFileEvidenceFallback(
  candidates: string[],
  refinedIntent: string,
  rawIntent: string,
  maxFiles: number,
  graphScores: Map<string, number> = new Map(),
): CodeFileProposal[] {
  const frontendOnly = prefersFrontendIntent(refinedIntent, rawIntent)
  const terms = dedupeKeywords([
    ...tokenizeForSearch(refinedIntent, 10),
    ...tokenizeForSearch(rawIntent, 10),
  ]).map((t) => normalizeAccents(t).toLowerCase())

  return candidates
    .filter(isLikelyApplicationSource)
    .map((filePath) => ({
      filePath,
      score: scoreFileCandidate(filePath, terms, frontendOnly, graphScores.get(filePath) ?? 0),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxFiles)
    .map((row) => ({
      filePath: row.filePath,
      summary: 'Graph-discovered file likely involved in implementing the intent',
      reason: `Path matches intent/graph keywords (score ${row.score.toFixed(1)})`,
    }))
}

function tokenizeForSearch(text: string, maxTerms = 4): string[] {
  const stopWords = new Set([
    'about', 'after', 'also', 'been', 'could', 'from', 'have', 'into', 'like',
    'more', 'must', 'need', 'only', 'para', 'que', 'quiero', 'should',
    'some', 'such', 'than', 'that', 'their', 'them', 'then', 'there', 'these',
    'this', 'those', 'through', 'want', 'when', 'where', 'which', 'while',
    'with', 'would',
    'como', 'con', 'decidir', 'del', 'esta', 'estan', 'las', 'los', 'pero',
    'podamos', 'por', 'segun', 'sin', 'una', 'unos', 'según', 'están',
  ])

  const terms = normalizeAccents(text)
    .toLowerCase()
    .split(/[^a-z0-9_-]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !stopWords.has(t))

  return Array.from(new Set(terms)).slice(0, maxTerms)
}

function isProductionSourcePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase()
  return (
    !normalized.includes(':test/') &&
    !normalized.includes('/test/') &&
    !normalized.includes('/tests/') &&
    !normalized.includes('/__tests__/') &&
    !normalized.endsWith('.spec.ts') &&
    !normalized.endsWith('.test.ts') &&
    !normalized.endsWith('.spec.js') &&
    !normalized.endsWith('.test.js')
  )
}

function isLikelyApplicationSource(filePath: string): boolean {
  if (!isProductionSourcePath(filePath)) return false
  const lower = normalizePathForMatch(filePath)
  const vendorHints = [
    'mootools',
    'highcharts',
    'codemirror',
    'tiny_mce',
    '/vendor/',
    '/node_modules/',
    '.min.js',
    '-core-',
    '-more-',
    '/charts/',
    '/exporting-server/',
  ]
  return !vendorHints.some((hint) => lower.includes(hint))
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n… [truncated]`
}

// ---------------------------------------------------------------------------
// Graph discovery
// ---------------------------------------------------------------------------

interface SpecCandidate {
  specId: string
  title?: string
  description?: string
  optimizedDescription?: string
  specContent?: string
  specPath?: string
  searchScore: number
  minImpactDepth?: number
  fromImpact: boolean
  fromSearch: boolean
  fromFacetEnrichment?: boolean
  fromSymbolEnrichment?: boolean
  relatedSpecs: Set<string>
}

interface SymbolSearchHit {
  name: string
  kind?: string
  score: number
}

/** Split PascalCase / camelCase identifiers into lowercase tokens (agnostic). */
function splitIdentifierTokens(name: string): string[] {
  const trimmed = name.trim()
  if (!trimmed) return []

  const withoutUseCaseSuffix = trimmed.replace(/UseCase$/i, '')
  const spaced = withoutUseCaseSuffix
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')

  return spaced
    .split(/[\s_.-]+/)
    .map((token) => token.toLowerCase())
    .filter((token) => token.length >= 2)
}

function looksLikeClassOrUseCaseSymbol(name: string, kind?: string): boolean {
  if (!name || name.length < 4) return false

  const normalizedKind = kind?.toLowerCase()
  if (
    normalizedKind === 'class' ||
    normalizedKind === 'interface' ||
    normalizedKind === 'type' ||
    normalizedKind === 'struct'
  ) {
    return true
  }

  if (/UseCase$/i.test(name)) return true

  const tokens = splitIdentifierTokens(name)
  if (tokens.length < 2) return false

  // PascalCase with multiple segments (CreateChange, ArchiveBatchSnapshot, …)
  return /^[A-Z][a-zA-Z0-9]*(?:[A-Z][a-zA-Z0-9]+)+$/.test(name)
}

function extractSymbolHitsFromSearch(symbols: GraphSearchSymbolRow[]): SymbolSearchHit[] {
  const byName = new Map<string, SymbolSearchHit>()

  const consider = (name: string | undefined, kind: string | undefined, score: number): void => {
    if (!name?.trim()) return
    const key = name.trim()
    const existing = byName.get(key)
    if (!existing || score > existing.score) {
      byName.set(key, { name: key, kind, score })
    }
  }

  for (const row of symbols) {
    const rowScore = row.score ?? 0
    consider(row.logicalTarget?.name, undefined, rowScore)
    for (const hit of row.hits ?? []) {
      consider(hit.symbol?.name, hit.symbol?.kind, hit.score ?? rowScore)
    }
  }

  return [...byName.values()]
}

function buildSpecQueriesFromSymbolHits(
  hits: SymbolSearchHit[],
  facets: IntentFacets,
  codeKeywords: ExpandedKeywords,
  refinedIntent: string,
  maxQueries: number,
): { queries: string[]; sourceSymbols: string[] } {
  const facetTerms = dedupeKeywords([
    ...facetSearchTerms(facets.when),
    ...facetSearchTerms(facets.what),
    ...facetSearchTerms(facets.how),
    ...codeKeywords.literal.map((t) => normalizeAccents(t).toLowerCase()),
    ...tokenizeForSearch(refinedIntent, 8),
  ])

  const ranked = hits
    .filter((hit) => looksLikeClassOrUseCaseSymbol(hit.name, hit.kind))
    .map((hit) => {
      const tokens = splitIdentifierTokens(hit.name)
      const overlap = tokens.filter((token) =>
        facetTerms.some((term) => term === token || term.includes(token) || token.includes(term)),
      ).length
      return { hit, tokens, overlap }
    })
    .filter((row) => row.tokens.length >= 2)
    .sort((a, b) => {
      const scoreA = a.overlap * 1_000 + a.hit.score
      const scoreB = b.overlap * 1_000 + b.hit.score
      return scoreB - scoreA
    })

  const queries: string[] = []
  const sourceSymbols: string[] = []

  for (const row of ranked) {
    if (queries.length >= maxQueries) break
    const literalSymbol = row.hit.name.trim()
    const spaced = row.tokens.join(' ')
    const kebab = row.tokens.join('-')

    if (literalSymbol.length >= 3) {
      queries.push(literalSymbol)
      sourceSymbols.push(literalSymbol)
    }
    if (spaced.length >= 3 && spaced !== literalSymbol && queries.length < maxQueries) {
      queries.push(spaced)
    }
    if (kebab.length >= 3 && kebab !== spaced && kebab !== literalSymbol && queries.length < maxQueries) {
      queries.push(kebab)
    }
  }

  return {
    queries: dedupeKeywords(queries).slice(0, maxQueries),
    sourceSymbols: dedupeKeywords(sourceSymbols).slice(0, 6),
  }
}

async function enrichCandidatesFromSymbolDerivedSpecSearch(
  pool: Map<string, SpecCandidate>,
  symbols: GraphSearchSymbolRow[],
  facets: IntentFacets,
  codeKeywords: ExpandedKeywords,
  refinedIntent: string,
  maxQueries: number,
  maxAdded: number,
): Promise<{ added: string[]; queries: string[]; symbolNames: string[] }> {
  const hits = extractSymbolHitsFromSearch(symbols)
  const { queries, sourceSymbols } = buildSpecQueriesFromSymbolHits(
    hits,
    facets,
    codeKeywords,
    refinedIntent,
    maxQueries,
  )

  if (queries.length === 0) {
    return { added: [], queries: [], symbolNames: [] }
  }

  const result = await graphSearchMulti(queries, { specs: true }, Math.max(8, maxAdded + 2))
  const added: string[] = []

  for (const row of result.specs ?? []) {
    const had = pool.has(row.specId)
    upsertCandidate(pool, row.specId, {
      title: row.title,
      description: row.description,
      optimizedDescription: row.optimizedDescription,
      specContent: row.content,
      specPath: row.path,
      searchScore: row.score ?? 0,
      fromSearch: true,
      fromSymbolEnrichment: true,
    })
    if (!had) added.push(row.specId)
    if (added.length >= maxAdded) break
  }

  return { added, queries, symbolNames: sourceSymbols }
}

function extractCodeFilesFromSearch(symbols: GraphSearchSymbolRow[]): string[] {
  const paths = new Set<string>()

  for (const row of symbols) {
    const surface = row.logicalTarget?.surface
    if (surface && isProductionSourcePath(surface)) paths.add(surface)

    for (const decl of row.declarations ?? []) {
      const filePath = decl.declaration?.location?.filePath
      if (filePath && isProductionSourcePath(filePath)) paths.add(filePath)
    }

    for (const hit of row.hits ?? []) {
      const filePath = hit.symbol?.filePath
      if (filePath && isProductionSourcePath(filePath)) paths.add(filePath)
    }
  }

  return [...paths]
}

function upsertCandidate(
  pool: Map<string, SpecCandidate>,
  specId: string,
  patch: Partial<SpecCandidate>,
): void {
  const existing = pool.get(specId)
  if (existing) {
    pool.set(specId, {
      ...existing,
      ...patch,
      title: patch.title ?? existing.title,
      description: patch.description ?? existing.description,
      optimizedDescription: patch.optimizedDescription ?? existing.optimizedDescription,
      specContent:
        (patch.specContent?.length ?? 0) > (existing.specContent?.length ?? 0)
          ? patch.specContent
          : existing.specContent,
      specPath: patch.specPath ?? existing.specPath,
      searchScore: Math.max(existing.searchScore, patch.searchScore ?? 0),
      minImpactDepth:
        existing.minImpactDepth !== undefined && patch.minImpactDepth !== undefined
          ? Math.min(existing.minImpactDepth, patch.minImpactDepth)
          : (existing.minImpactDepth ?? patch.minImpactDepth),
      fromImpact: existing.fromImpact || (patch.fromImpact ?? false),
      fromSearch: existing.fromSearch || (patch.fromSearch ?? false),
      fromFacetEnrichment: existing.fromFacetEnrichment || (patch.fromFacetEnrichment ?? false),
      fromSymbolEnrichment: existing.fromSymbolEnrichment || (patch.fromSymbolEnrichment ?? false),
      relatedSpecs: new Set([...existing.relatedSpecs, ...(patch.relatedSpecs ?? [])]),
    })
    return
  }

  pool.set(specId, {
    specId,
    title: patch.title,
    description: patch.description,
    optimizedDescription: patch.optimizedDescription,
    specContent: patch.specContent,
    specPath: patch.specPath,
    searchScore: patch.searchScore ?? 0,
    minImpactDepth: patch.minImpactDepth,
    fromImpact: patch.fromImpact ?? false,
    fromSearch: patch.fromSearch ?? false,
    fromFacetEnrichment: patch.fromFacetEnrichment ?? false,
    fromSymbolEnrichment: patch.fromSymbolEnrichment ?? false,
    relatedSpecs: new Set(patch.relatedSpecs ?? []),
  })
}

async function graphSearch(
  query: string,
  categories: { symbols?: boolean; specs?: boolean; files?: boolean },
  limit: number,
): Promise<GraphSearchResult> {
  return runtime.graph.search(query, categories, limit)
}

function sanitizeGraphQuery(query: string): string {
  const terms = query.split(/[\s,]+/).filter((t) => t.trim().length > 0)
  return terms.slice(0, 4).join(' ')
}

async function safeGraphSearch(
  query: string,
  categories: { symbols?: boolean; specs?: boolean; files?: boolean },
  limit: number,
): Promise<GraphSearchResult> {
  const cleanQuery = sanitizeGraphQuery(query)
  if (!cleanQuery) return { symbols: [], specs: [], files: [] }
  try {
    return await graphSearch(cleanQuery, categories, limit)
  } catch {
    return { symbols: [], specs: [], files: [] }
  }
}

function rankCandidate(
  candidate: SpecCandidate,
  facets: IntentFacets = { when: [], what: [], how: [] },
  codeKeywords: ExpandedKeywords = { literal: [], expanded: [] },
  refinedIntent = '',
): number {
  let score = candidate.searchScore
  const facetScore = scoreSpecIdByFacets(candidate.specId, candidate.title, facets, codeKeywords, refinedIntent)

  // Gate impact depth boost so unaligned specs do not crowd out relevant candidates
  const impactMultiplier = facetScore >= 12 ? 1.0 : 0.02

  if (candidate.minImpactDepth === 0) score += 500_000 * impactMultiplier
  else if (candidate.minImpactDepth === 1) score += 250_000 * impactMultiplier
  else if (candidate.fromImpact) score += 50_000 * impactMultiplier
  if (candidate.fromSearch) score += 100_000
  if (candidate.fromSymbolEnrichment) score += 150_000
  if (candidate.fromImpact && candidate.fromSearch) score += 50_000
  return score
}

function scoreSpecIdKeywordMatch(
  specId: string,
  title: string | undefined,
  keywords: string[],
): number {
  const genericStopwords = new Set(['change', 'artifact', 'spec', 'cli', 'core', 'project', 'file', 'state'])
  const idTail = specId.includes(':') ? specId.split(':').pop()! : specId
  const hay = `${idTail} ${title ?? ''}`.toLowerCase()
  let boost = 0
  for (const kw of keywords) {
    const k = kw.toLowerCase().trim()
    if (k.length < 3 || genericStopwords.has(k)) continue
    const tail = idTail.toLowerCase()
    if (tail === k || tail.startsWith(`${k}-`) || tail.endsWith(`-${k}`)) boost += 400_000
    else if (tail.includes(k) || hay.includes(k)) boost += 150_000
  }
  return boost
}

function compositeCandidateScore(
  candidate: SpecCandidate,
  keywordLiterals: string[],
  facets: IntentFacets,
  codeKeywords: ExpandedKeywords,
  refinedIntent = '',
): number {
  const facetScore = scoreSpecIdByFacets(candidate.specId, candidate.title, facets, codeKeywords, refinedIntent)
  return (
    rankCandidate(candidate, facets, codeKeywords, refinedIntent) +
    scoreSpecIdKeywordMatch(candidate.specId, candidate.title, keywordLiterals) +
    facetScore * 50_000
  )
}

/** Reserve slots for BM25 search hits and facet-enriched specs so impact noise does not crowd them out. */
function selectRankedCandidates(
  pool: Map<string, SpecCandidate>,
  maxCandidates: number,
  keywordLiterals: string[] = [],
  facetReservedSpecIds: string[] = [],
  facets: IntentFacets = { when: [], what: [], how: [] },
  codeKeywords: ExpandedKeywords = { literal: [], expanded: [] },
  refinedIntent = '',
): SpecCandidate[] {
  const all = [...pool.values()]
  const reservedSet = new Set(facetReservedSpecIds)

  // 1. Always protect facet-reserved specs (specs covering selected code surfaces & facet anchors)
  const reservedCandidates = all.filter((c) => reservedSet.has(c.specId))
  const remainingCandidates = all.filter((c) => !reservedSet.has(c.specId))

  const byComposite = [...remainingCandidates].sort(
    (a, b) =>
      compositeCandidateScore(b, keywordLiterals, facets, codeKeywords, refinedIntent) -
      compositeCandidateScore(a, keywordLiterals, facets, codeKeywords, refinedIntent),
  )

  const selected = [...reservedCandidates]
  for (const c of byComposite) {
    if (selected.length >= maxCandidates) break
    if (!selected.some((s) => s.specId === c.specId)) {
      selected.push(c)
    }
  }

  return selected
}

/**
 * Derives spec-search queries from a workspace file path.
 * Strategy 1: basename stem (e.g. validate-artifacts.ts -> "validate-artifacts")
 * Strategy 2: PascalCase class name found in the graph for that file (e.g. ValidateArtifacts)
 */
async function deriveSpecQueriesFromFile(filePath: string): Promise<string[]> {
  const queries: string[] = []

  // Strategy 1: basename stem
  const rawPath = filePath.includes(':') ? filePath.split(':').slice(1).join(':') : filePath
  const basename = rawPath.split('/').pop() ?? ''
  const stem = basename.replace(/\.(ts|js|tsx|jsx)$/, '')
  if (stem && stem !== 'index' && stem.length > 3) {
    queries.push(stem)
  }

  // Strategy 2: top class/interface symbol name from the file
  try {
    const result = await runtime.graph.search(filePath, { symbols: true }, 30)
    const classNames = (result.symbols ?? [])
      .flatMap((row) => row.hits ?? [])
      .filter((hit) => {
        const kind = hit.symbol?.kind ?? ''
        return (kind === 'class' || kind === 'interface') && hit.symbol?.filePath === filePath
      })
      .map((hit) => hit.symbol?.name ?? '')
      .filter((name) => name.length > 3)

    for (const name of classNames.slice(0, 2)) {
      // Convert PascalCase to kebab-case for spec search
      const kebab = name.replace(/([A-Z])/g, (m, c, i) => (i === 0 ? c.toLowerCase() : `-${c.toLowerCase()}`))
      if (kebab && !queries.includes(kebab)) queries.push(kebab)
      // Also search the original PascalCase name
      if (!queries.includes(name)) queries.push(name)
    }
  } catch {
    // non-fatal
  }

  return queries
}

/**
 * Always-on enrichment: for each file, derive spec queries from filename and
 * top symbol names, search specs, and upsert facet-aligned matches into the pool.
 * Fires regardless of whether coveringSpecs is populated.
 */
async function enrichPoolFromFilenameAndSymbolSearch(
  pool: Map<string, SpecCandidate>,
  file: string,
  facets: IntentFacets,
  codeKeywords: ExpandedKeywords,
  refinedIntent: string,
): Promise<string[]> {
  const added: string[] = []
  const queries = await deriveSpecQueriesFromFile(file)
  if (queries.length === 0) return added

  for (const query of queries) {
    let result: GraphSearchResult
    try {
      result = await safeGraphSearch(query, { specs: true }, 8)
    } catch {
      continue
    }
    for (const row of result.specs ?? []) {
      if (pool.has(row.specId)) {
        // Still enrich metadata even if already present
        upsertCandidate(pool, row.specId, {
          title: row.title,
          description: row.description,
          optimizedDescription: row.optimizedDescription,
          specContent: row.content,
          specPath: row.path,
          fromSearch: true,
        })
        continue
      }
      const facetScore = scoreSpecIdByFacets(
        row.specId,
        row.title,
        facets,
        codeKeywords,
        refinedIntent,
      )
      if (facetScore < 4) continue
      upsertCandidate(pool, row.specId, {
        title: row.title,
        description: row.description,
        optimizedDescription: row.optimizedDescription,
        specContent: row.content,
        specPath: row.path,
        searchScore: Math.max(row.score ?? 0, facetScore * 500),
        fromSearch: true,
        fromFacetEnrichment: true,
      })
      added.push(row.specId)
    }
  }

  return added
}

async function enrichCandidatesFromAffectedCoveringSpecs(
  pool: Map<string, SpecCandidate>,
  evidence: Map<string, ImpactFileEvidence>,
  facets: IntentFacets,
  codeKeywords: ExpandedKeywords,
  refinedIntent: string,
  fetchFileImpact: (file: string) => Promise<{
    coveringSpecs?: Array<{ specId: string; minDepth?: number }>
  }>,
  maxFiles: number,
): Promise<string[]> {
  const added: string[] = []
  const scored = [...evidence.values()]
    .filter((e) => e.roles.has('affected') || e.roles.has('symbol-affected'))
    .map((e) => ({
      file: e.filePath,
      score: scoreFileByFacets(e.filePath, facets, 0, false, codeKeywords, refinedIntent),
    }))
    .filter(
      (x) =>
        x.score > 0 && isStrongFacetAlignedFile(x.file, facets, codeKeywords, refinedIntent),
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, maxFiles)

  for (const { file } of scored) {
    try {
      const impact = await fetchFileImpact(file)
      for (const covering of impact.coveringSpecs ?? []) {
        const facetScore = scoreSpecIdByFacets(
          covering.specId,
          pool.get(covering.specId)?.title,
          facets,
          codeKeywords,
          refinedIntent,
        )
        const alreadyFromSearch = pool.get(covering.specId)?.fromSearch ?? false
        if (!shouldAutoIncludeCoveringSpec(facetScore, alreadyFromSearch)) continue

        const had = pool.has(covering.specId)
        upsertCandidate(pool, covering.specId, {
          fromImpact: true,
          fromFacetEnrichment: true,
          minImpactDepth: covering.minDepth ?? 1,
        })
        if (!had) added.push(covering.specId)
      }
    } catch {
      // non-fatal
    }
    // Always: also search by filename stem and top symbol names
    const derived = await enrichPoolFromFilenameAndSymbolSearch(pool, file, facets, codeKeywords, refinedIntent)
    for (const s of derived) if (!added.includes(s)) added.push(s)
  }

  return added
}

async function enrichCandidatesFromFacetAlignedFiles(
  pool: Map<string, SpecCandidate>,
  filePaths: string[],
  facets: IntentFacets,
  codeKeywords: ExpandedKeywords,
  refinedIntent: string,
  graphScores: Map<string, number>,
  fetchFileImpact: (file: string) => Promise<{
    coveringSpecs?: Array<{ specId: string; minDepth?: number }>
  }>,
  maxFiles: number,
): Promise<string[]> {
  const added: string[] = []
  const ranked = [...new Set(filePaths)]
    .filter(isLikelyApplicationSource)
    .map((file) => ({
      file,
      score: scoreFileByFacets(file, facets, graphScores.get(file) ?? 0, false, codeKeywords, refinedIntent),
    }))
    .filter(
      (row) =>
        row.score > 0 && isStrongFacetAlignedFile(row.file, facets, codeKeywords, refinedIntent),
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, maxFiles)

  for (const { file } of ranked) {
    try {
      const impact = await fetchFileImpact(file)
      for (const covering of impact.coveringSpecs ?? []) {
        const facetScore = scoreSpecIdByFacets(
          covering.specId,
          pool.get(covering.specId)?.title,
          facets,
          codeKeywords,
          refinedIntent,
        )
        const alreadyFromSearch = pool.get(covering.specId)?.fromSearch ?? false
        if (!shouldAutoIncludeCoveringSpec(facetScore, alreadyFromSearch)) continue

        const had = pool.has(covering.specId)
        upsertCandidate(pool, covering.specId, {
          fromImpact: true,
          fromFacetEnrichment: true,
          minImpactDepth: covering.minDepth ?? 1,
        })
        if (!had) added.push(covering.specId)
      }
    } catch {
      // non-fatal
    }
    // Always: also search by filename stem and top symbol names
    const derived = await enrichPoolFromFilenameAndSymbolSearch(pool, file, facets, codeKeywords, refinedIntent)
    for (const s of derived) if (!added.includes(s)) added.push(s)
  }

  return added
}

async function ensureFacetAnchoredSpecsInPool(
  pool: Map<string, SpecCandidate>,
  facets: IntentFacets,
  codeKeywords: ExpandedKeywords,
  refinedIntent: string,
  specKeywords: ExpandedKeywords,
  maxAdded: number,
): Promise<string[]> {
  const queries = buildFacetSpecSearchQueries(facets, specKeywords).slice(0, 6)

  const result = await graphSearchMulti(queries, { specs: true }, 15)
  const added: string[] = []
  const minScore = minFacetScoreForInclusion()

  const ranked = (result.specs ?? [])
    .map((row) => ({
      row,
      facetScore: scoreSpecIdByFacets(row.specId, row.title, facets, codeKeywords, refinedIntent),
    }))
    .filter((entry) => entry.facetScore >= minScore)
    .sort((a, b) => b.facetScore - a.facetScore)

  for (const { row, facetScore } of ranked) {
    if (added.length >= maxAdded) break
    const had = pool.has(row.specId)
    upsertCandidate(pool, row.specId, {
      title: row.title,
      description: row.description,
      optimizedDescription: row.optimizedDescription,
      specContent: row.content,
      specPath: row.path,
      searchScore: Math.max(row.score ?? 0, facetScore * 1_000),
      fromSearch: true,
      fromFacetEnrichment: true,
    })
    if (!had) added.push(row.specId)
  }

  return added
}

async function enrichCandidatesWithDirectDependsOn(
  pool: Map<string, SpecCandidate>,
  seedSpecIds: string[],
  maxAdded: number,
  markFacetEnrichment = false,
): Promise<string[]> {
  const added: string[] = []
  const seen = new Set<string>()

  for (const specId of seedSpecIds) {
    if (added.length >= maxAdded) break

    let dependsOn: string[]
    try {
      dependsOn = await runtime.graph.getSpecDependsOn(specId)
    } catch {
      continue
    }

    for (const depId of dependsOn) {
      if (added.length >= maxAdded) break
      if (seen.has(depId) || pool.has(depId)) continue
      seen.add(depId)
      upsertCandidate(pool, depId, {
        fromImpact: true,
        fromFacetEnrichment: markFacetEnrichment,
      })
      added.push(depId)
    }
  }

  return added
}

function moduleKeyFromPath(filePath: string): string | null {
  const norm = normalizePathForMatch(filePath)
  const match = norm.match(/(?:packages|apps|libs|modules|src)\/([^/]+)/)
  if (match?.[1]) return match[1]
  const segments = norm.split('/').filter(Boolean)
  return segments.length > 1 ? segments[0] : null
}

interface ImpactFileEvidence {
  filePath: string
  roles: Set<'seed' | 'affected' | 'symbol-affected' | 'spec-impact'>
  sourceSeeds: Set<string>
  minDepth: number
  riskLevel?: string
}

type ImpactFileRole = ImpactFileEvidence['roles'] extends Set<infer R> ? R : never

function recordImpactFile(
  evidence: Map<string, ImpactFileEvidence>,
  filePath: string,
  role: ImpactFileRole,
  sourceSeed: string,
  depth: number,
  riskLevel?: string,
): void {
  const existing = evidence.get(filePath)
  if (existing) {
    existing.roles.add(role)
    existing.sourceSeeds.add(sourceSeed)
    existing.minDepth = Math.min(existing.minDepth, depth)
    if (riskLevel) existing.riskLevel = riskLevel
    return
  }

  evidence.set(filePath, {
    filePath,
    roles: new Set([role]),
    sourceSeeds: new Set([sourceSeed]),
    minDepth: depth,
    riskLevel,
  })
}

async function fetchFileImpact(file: string, depth = 1): Promise<FileImpactResult> {
  console.log(`   🕸️ CodeGraph analyzeFileImpact: "${file}" (depth ${depth})`)
  return runtime.graph.analyzeFileImpact(file, depth)
}

async function fetchSymbolImpact(symbolId: string, depth = 1): Promise<SymbolImpactResult> {
  console.log(`   🕸️ CodeGraph analyzeSymbolImpact: "${symbolId}" (depth ${depth})`)
  return runtime.graph.analyzeSymbolImpact(symbolId, depth)
}

async function enrichFinalSelectedSpecsWithGraphImpact(
  retainedSpecs: RetainedSpec[],
  evidence: Map<string, ImpactFileEvidence>,
  impactSummaries: string[],
): Promise<void> {
  for (let index = 0; index < retainedSpecs.length; index++) {
    const spec = retainedSpecs[index]
    if (spec.isNewSpec) continue
    if (!spec.retainedByLlm || spec.expandedFromDependsOn) continue

    try {
      const envelope = await runtime.graph.analyzeSpecImpact(spec.specId)
      const files = [...new Set(envelope.impact?.affectedFiles ?? [])]
        .filter(isLikelyApplicationSource)
        .sort((a, b) => a.localeCompare(b))
      const symbols = [...(envelope.impact?.affectedSymbols ?? [])].sort((a, b) =>
        a.filePath === b.filePath
          ? a.name.localeCompare(b.name)
          : a.filePath.localeCompare(b.filePath),
      )
      const relatedSpecs = [...new Set(envelope.impact?.affectedSpecs ?? [])]
        .filter((specId) => specId !== spec.specId)
        .sort((a, b) => a.localeCompare(b))

      const coverage: SpecImpactCoverage = {
        files,
        symbols,
        relatedSpecs,
        riskLevel: envelope.impact?.riskLevel,
      }

      for (const filePath of files) {
        recordImpactFile(evidence, filePath, 'spec-impact', spec.specId, 1, coverage.riskLevel)
      }

      retainedSpecs[index] = {
        ...spec,
        graphImpact: coverage,
        reason: appendGraphImpactToReason(spec.reason, coverage),
      }

      const symbolSummary = symbols
        .map((symbol) => formatSpecImpactSymbol(symbol))
        .join(', ')

      impactSummaries.push(
        [
          `retainedSpec: ${spec.specId}`,
          `risk: ${coverage.riskLevel ?? 'unknown'}`,
          `coversFiles: ${files.join(', ') || '(none)'}`,
          `coversSymbols: ${symbolSummary || '(none)'}`,
          `relatedSpecs: ${relatedSpecs.join(', ') || '(none)'}`,
        ].join('\n'),
      )

      console.log(`   └─ spec ${spec.specId}`)
      console.log(`      files:   ${files.length > 0 ? files.join(', ') : '(none)'}`)
      console.log(`      symbols: ${symbolSummary || '(none)'}`)
      if (relatedSpecs.length > 0) {
        console.log(`      specs:   ${relatedSpecs.join(', ')}`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`   └─ ⚠️  spec impact failed for ${spec.specId}: ${msg}`)
    }
  }
}

function formatSpecImpactSymbol(symbol: SpecImpactSymbolLink): string {
  const location = symbol.line ? `${symbol.filePath}:${symbol.line}` : symbol.filePath
  return `${symbol.name} @ ${location}`
}

function formatSpecImpactGraphNote(coverage: SpecImpactCoverage): string {
  const parts: string[] = []
  if (coverage.files.length > 0) {
    parts.push(`covers files: ${coverage.files.join(', ')}`)
  }
  if (coverage.symbols.length > 0) {
    parts.push(`covers symbols: ${coverage.symbols.map(formatSpecImpactSymbol).join(', ')}`)
  }
  if (coverage.relatedSpecs.length > 0) {
    parts.push(`related specs: ${coverage.relatedSpecs.join(', ')}`)
  }
  if (coverage.riskLevel) {
    parts.push(`risk: ${coverage.riskLevel}`)
  }
  return parts.join('; ')
}

function appendGraphImpactToReason(baseReason: string, coverage: SpecImpactCoverage): string {
  const graphNote = formatSpecImpactGraphNote(coverage)
  if (!graphNote) return baseReason
  return `${baseReason} [Graph: ${graphNote}]`
}

function printSpecGraphImpact(coverage?: SpecImpactCoverage): void {
  if (!coverage) {
    console.log('Impact (covers): (not available)\n')
    return
  }

  const hasContent =
    coverage.files.length > 0 || coverage.symbols.length > 0 || coverage.relatedSpecs.length > 0

  if (!hasContent) {
    console.log('Impact (covers): (none)\n')
    return
  }

  console.log('Impact (covers):')
  if (coverage.files.length > 0) {
    console.log('- files:')
    for (const filePath of coverage.files) {
      console.log(`  - ${filePath}`)
    }
  }
  if (coverage.symbols.length > 0) {
    console.log('- symbols:')
    for (const symbol of coverage.symbols) {
      console.log(`  - ${formatSpecImpactSymbol(symbol)}`)
    }
  }
  if (coverage.relatedSpecs.length > 0) {
    console.log('- related specs:')
    for (const specId of coverage.relatedSpecs) {
      console.log(`  - ${specId}`)
    }
  }
  console.log('')
}

type SupplementaryImpactRole = 'spec-impact'

const SUPPLEMENTARY_IMPACT_ROLE_META: Record<
  SupplementaryImpactRole,
  { summary: string; reasonPrefix: string }
> = {
  'spec-impact': {
    summary: 'Implementation surface linked to a retained spec',
    reasonPrefix: 'Retained spec impact',
  },
}

async function attachDepthOneFileImpact(files: CodeFileProposal[]): Promise<CodeFileProposal[]> {
  const enriched: CodeFileProposal[] = []

  for (const file of files) {
    let impactDepth1: string[] = []
    try {
      const impact = await fetchFileImpact(file.filePath)
      impactDepth1 = [...new Set(impact.affectedFiles ?? [])]
        .filter(isLikelyApplicationSource)
        .filter((filePath) => filePath !== file.filePath)
        .sort((a, b) => a.localeCompare(b))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`   └─ ⚠️  d=1 impact failed for ${file.filePath}: ${msg}`)
    }

    enriched.push({ ...file, impactDepth1 })
  }

  return enriched
}

function mergeSupplementaryImpactFiles(
  base: CodeFileProposal[],
  evidence: Map<string, ImpactFileEvidence>,
  roles: readonly SupplementaryImpactRole[],
): CodeFileProposal[] {
  const merged = new Map(base.map((file) => [file.filePath, file]))

  for (const entry of evidence.values()) {
    const role = roles.find((candidate) => entry.roles.has(candidate))
    if (!role) continue
    if (!isLikelyApplicationSource(entry.filePath)) continue
    if (merged.has(entry.filePath)) continue

    const meta = SUPPLEMENTARY_IMPACT_ROLE_META[role]
    merged.set(entry.filePath, {
      filePath: entry.filePath,
      summary: meta.summary,
      reason: `${meta.reasonPrefix}: ${[...entry.sourceSeeds].join(', ')} (risk: ${entry.riskLevel ?? 'unknown'})`,
    })
  }

  return [...merged.values()]
}

function rankSymbolSeeds(
  symbols: GraphSearchSymbolRow[],
  seedFilePaths: string[],
  facets: IntentFacets,
  codeKeywords: ExpandedKeywords,
  refinedIntent: string,
): SymbolSeed[] {
  const seedModules = new Set(seedFilePaths.map((file) => moduleKeyFromPath(file)).filter(Boolean))
  const byId = new Map<string, SymbolSeed>()
  const whenTerms = enrichWhenTermsForPathSearch(facets, codeKeywords, refinedIntent)

  for (const row of symbols) {
    for (const hit of row.hits ?? []) {
      const sym = hit.symbol
      if (!sym?.id || !sym.filePath) continue
      const mod = moduleKeyFromPath(sym.filePath)
      if (seedFilePaths.length > 0) {
        const onSeedFile = seedFilePaths.includes(sym.filePath)
        const sameModule = Boolean(mod && seedModules.has(mod))
        if (!onSeedFile && !sameModule) continue
      }

      const kind = sym.kind ?? ''
      const symName = (sym.name ?? '').toLowerCase()
      let score = hit.score ?? row.score ?? 0
      if (kind === 'method' || kind === 'function') score += 1_000
      if (seedFilePaths.includes(sym.filePath)) score += 500
      score += scoreFileByFacets(sym.filePath, facets, 0, false, codeKeywords, refinedIntent) * 20

      const symTokens = symName.split(/[^a-z0-9]+/).filter((token) => token.length >= 3)
      const whatScore = scoreStemTokensAgainstTerms(symTokens, facetSearchTerms(facets.what))
      const symWhenScore = scoreStemTokensAgainstTerms(symTokens, whenTerms)
      const fileWhenPenalty = lifecycleStemPenalty(sym.filePath, facets, codeKeywords, refinedIntent)
      if (whatScore >= 4 && symWhenScore === 0 && fileWhenPenalty >= 7) {
        score -= 5_000
      }

      const existing = byId.get(sym.id)
      if (!existing || score > existing.score) {
        byId.set(sym.id, {
          id: sym.id,
          name: sym.name ?? 'unknown',
          kind,
          filePath: sym.filePath,
          score,
        })
      }
    }
  }

  return [...byId.values()].sort((a, b) => b.score - a.score)
}

function deriveFilesFromImpact(
  evidence: Map<string, ImpactFileEvidence>,
  seedFiles: string[],
  refinedIntent: string,
  rawIntent: string,
  graphScores: Map<string, number>,
  maxFiles: number,
): CodeFileProposal[] {
  if (evidence.size === 0) return []

  const frontendOnly = prefersFrontendIntent(refinedIntent, rawIntent)
  const terms = dedupeKeywords([
    ...tokenizeForSearch(refinedIntent, 10),
    ...tokenizeForSearch(rawIntent, 10),
  ]).map((t) => normalizeAccents(t).toLowerCase())
  const seedModules = new Set(seedFiles.map((file) => moduleKeyFromPath(file)).filter(Boolean))

  return [...evidence.values()]
    .filter((entry) => isLikelyApplicationSource(entry.filePath))
    .map((entry) => {
      const module = moduleKeyFromPath(entry.filePath)
      const isSeed = entry.roles.has('seed')
      const fromRetainedSpec = entry.roles.has('spec-impact')
      const sameModule = Boolean(module && seedModules.has(module))
      let score = scoreFileCandidate(
        entry.filePath,
        terms,
        frontendOnly,
        graphScores.get(entry.filePath) ?? 0,
      )
      if (isSeed) score += 20
      if (fromRetainedSpec) score += 30
      if (sameModule) score += 15
      if (entry.roles.has('affected') && sameModule) score += 10
      if (entry.roles.has('symbol-affected') && sameModule) score += 8
      if (!isSeed && !sameModule && !fromRetainedSpec) score -= 12
      if (entry.minDepth === 0) score += 5
      return { entry, score, isSeed, sameModule, fromRetainedSpec }
    })
    .filter((row) => row.score > 0 && (row.isSeed || row.sameModule || row.fromRetainedSpec))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxFiles)
    .map(({ entry }) => {
      const isSeed = entry.roles.has('seed')
      const fromSymbol = entry.roles.has('symbol-affected')
      const fromRetainedSpec = entry.roles.has('spec-impact')
      return {
        filePath: entry.filePath,
        summary: isSeed
          ? 'Primary implementation surface identified from graph search'
          : fromRetainedSpec
            ? 'Implementation surface linked to a retained spec'
            : fromSymbol
              ? 'File surfaced by symbol-level graph impact'
              : 'Related file in the same feature module surfaced by graph impact',
        reason: isSeed
          ? `Seed file from graph search (risk: ${entry.riskLevel ?? 'unknown'})`
          : fromRetainedSpec
            ? `Retained spec impact: ${[...entry.sourceSeeds].join(', ')} (risk: ${entry.riskLevel ?? 'unknown'})`
            : fromSymbol
              ? `Symbol impact from ${[...entry.sourceSeeds].join(', ')} (depth ${entry.minDepth})`
              : `File impact from ${[...entry.sourceSeeds].join(', ')} (depth ${entry.minDepth})`,
      }
    })
}

function summarizeCodeSignals(
  codeFiles: string[],
  symbols: GraphSearchSymbolRow[],
  impactSummaries: string[],
  keywordExpansion?: { code: ExpandedKeywords; spec: ExpandedKeywords },
): string {
  const symbolLines = symbols.slice(0, 12).map((row) => {
    const name = row.logicalTarget?.name ?? row.hits?.[0]?.symbol?.name ?? 'unknown'
    const surface = row.logicalTarget?.surface ?? row.hits?.[0]?.symbol?.filePath ?? 'unknown'
    return `- ${name} @ ${surface}`
  })

  const keywordLines = keywordExpansion
    ? [
        'Keyword expansion:',
        `  code literal:   ${keywordExpansion.code.literal.join(', ') || '(none)'}`,
        `  code expanded:  ${keywordExpansion.code.expanded.join(', ') || '(none)'}`,
        `  spec literal:   ${keywordExpansion.spec.literal.join(', ') || '(none)'}`,
        `  spec expanded:  ${keywordExpansion.spec.expanded.join(', ') || '(none)'}`,
        '',
      ]
    : []

  return truncate(
    [
      ...keywordLines,
      'Code files:',
      ...(codeFiles.length > 0 ? codeFiles.map((f) => `- ${f}`) : ['- (none matched)']),
      '',
      'Top symbols:',
      ...(symbolLines.length > 0 ? symbolLines : ['- (none matched)']),
      '',
      'Impact notes:',
      ...(impactSummaries.length > 0 ? impactSummaries : ['- (no file impact analysed)']),
    ].join('\n'),
    MAX_IMPACT_SUMMARY_CHARS,
  )
}

function normalizeProposedSpecs(
  parsed: ProposedNewSpec[],
  maxSpecs: number,
  excludeSpecIds: Set<string> = new Set(),
): ProposedNewSpec[] {
  return parsed
    .filter((row) => row.specId?.trim() && row.reason?.trim() && !excludeSpecIds.has(row.specId.trim()))
    .slice(0, maxSpecs)
    .map((row) => ({
      specId: row.specId.trim(),
      title: row.title?.trim() || row.specId.trim(),
      summary: row.summary?.trim() || row.title?.trim() || row.reason.trim(),
      reason: row.reason.trim(),
      ...(row.suggestedPath?.trim() ? { suggestedPath: row.suggestedPath.trim() } : {}),
      ...(row.relatedCodeFiles?.length ? { relatedCodeFiles: row.relatedCodeFiles.filter(Boolean) } : {}),
    }))
}

function proposedToRetained(specs: ProposedNewSpec[]): RetainedSpec[] {
  return specs.map((spec) => ({
    specId: spec.specId,
    title: spec.title,
    summary: spec.summary,
    reason: spec.reason,
    suggestedPath: spec.suggestedPath,
    relatedCodeFiles: spec.relatedCodeFiles,
    isNewSpec: true,
  }))
}

function mergeRetainedSpecs(existing: RetainedSpec[], additional: ProposedNewSpec[]): RetainedSpec[] {
  const seen = new Set(existing.map((s) => s.specId))
  const merged = [...existing]
  for (const spec of additional) {
    if (seen.has(spec.specId)) continue
    merged.push({
      specId: spec.specId,
      title: spec.title,
      summary: spec.summary,
      reason: spec.reason,
      suggestedPath: spec.suggestedPath,
      relatedCodeFiles: spec.relatedCodeFiles,
      isNewSpec: true,
    })
    seen.add(spec.specId)
  }
  return merged
}

function formatFullProjectContext(result: ProjectContextResult): string {
  const sections: string[] = []
  const entries = (result.contextEntries ?? []).join('\n\n').trim()
  if (entries) {
    sections.push(`## Project directives\n\n${entries}`)
  }

  const specLines = (result.specs ?? [])
    .map((spec) => {
      const bits = [`- ${spec.specId}`]
      if (spec.title) bits.push(`title: ${spec.title}`)
      if (spec.description) bits.push(`summary: ${spec.description}`)
      return bits.join(' | ')
    })
    .filter(Boolean)

  if (specLines.length > 0) {
    sections.push(`## Project spec catalog\n\n${specLines.join('\n')}`)
  }

  return sections.join('\n\n')
}

function buildProjectContextRelevanceTerms(
  facets: IntentFacets,
  codeKeywords: ExpandedKeywords,
  specKeywords: ExpandedKeywords,
): string[] {
  return dedupeKeywords([
    ...facetSearchTerms(facets.when),
    ...facetSearchTerms(facets.what),
    ...facetSearchTerms(facets.how),
    ...codeKeywords.literal,
    ...codeKeywords.expanded.slice(0, 10),
    ...specKeywords.literal,
    ...specKeywords.expanded.slice(0, 10),
  ]).map((term) => normalizeAccents(term).toLowerCase())
}

function scoreProjectContextText(text: string, terms: string[]): number {
  const lower = normalizeAccents(text).toLowerCase()
  let score = 0
  for (const term of terms) {
    if (term.length < 3) continue
    if (lower.includes(term)) score += term.length >= 5 ? 3 : 1
  }
  return score
}

interface SelectedProjectContext {
  passages: string[]
  formatted: string
  selectedCount: number
  totalCount: number
  sources: string[]
}

function selectRelevantProjectContext(
  result: ProjectContextResult,
  facets: IntentFacets,
  codeKeywords: ExpandedKeywords,
  specKeywords: ExpandedKeywords,
  maxPassages: number,
): SelectedProjectContext {
  const terms = buildProjectContextRelevanceTerms(facets, codeKeywords, specKeywords)
  const candidates: Array<{ text: string; score: number; source: string }> = []

  for (const entry of result.contextEntries ?? []) {
    const trimmed = entry.trim()
    if (!trimmed) continue
    candidates.push({
      text: trimmed,
      score: scoreProjectContextText(trimmed, terms),
      source: 'directive',
    })
  }

  for (const spec of result.specs ?? []) {
    const line = [
      spec.specId,
      spec.title ? `title: ${spec.title}` : undefined,
      spec.description ? `summary: ${spec.description}` : undefined,
    ]
      .filter(Boolean)
      .join(' | ')
    candidates.push({
      text: line,
      score:
        scoreProjectContextText(line, terms) +
        scoreSpecIdByFacets(spec.specId, spec.title, facets, codeKeywords, '') * 2,
      source: 'spec-catalog',
    })
  }

  const totalCount = candidates.length
  let selected = candidates
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPassages)

  if (selected.length === 0) {
    selected = candidates
      .filter((candidate) => candidate.source === 'directive')
      .slice(0, Math.min(2, maxPassages))
  }

  const passages = selected.map((row) => row.text)
  const formatted = selected
    .map((row) => `- [${row.source}] ${row.text.replace(/\s+/g, ' ').trim()}`)
    .join('\n')

  return {
    passages,
    formatted: truncate(formatted, MAX_RELEVANT_PROJECT_CONTEXT_CHARS),
    selectedCount: selected.length,
    totalCount,
    sources: selected.map((row) => row.source),
  }
}

function groundingScore(summary: string, sourcePassages: string[]): number {
  const sourceBlob = normalizeAccents(sourcePassages.join('\n')).toLowerCase()
  const sourceTerms = new Set(tokenizeForSearch(sourceBlob, 80))
  const summaryTerms = tokenizeForSearch(summary, 40)
  if (summaryTerms.length === 0) return 0

  const grounded = summaryTerms.filter(
    (term) =>
      sourceTerms.has(term) ||
      [...sourceTerms].some((sourceTerm) => sourceTerm.includes(term) || term.includes(sourceTerm)),
  )
  return grounded.length / summaryTerms.length
}

async function compressSelectedProjectContextPassages(
  passages: string[],
  model: string,
  timeoutMs: number,
): Promise<string> {
  const excerptBlock = passages
    .map((passage, index) => `--- EXCERPT ${index + 1} ---\n${truncate(passage, 1_500)}`)
    .join('\n\n')

  const prompt = `You compress project-context excerpts for downstream planning.

Rules:
- Output ONLY facts explicitly stated in the excerpts below
- Do NOT add requirements, proposals, or implementation steps
- Do NOT invent spec IDs, packages, or file paths
- Use concise bullet points
- If an excerpt is not useful on its own, omit it

[PROJECT CONTEXT EXCERPTS]
${excerptBlock}

Return ONLY plain text bullets (no JSON).`

  const raw = await callLlm(prompt, model, timeoutMs)
  return raw.trim()
}

async function summarizeRelevantProjectContext(
  projectContext: ProjectContextResult,
  intentFacets: IntentFacets,
  codeKeywords: ExpandedKeywords,
  specKeywords: ExpandedKeywords,
  model: string,
  timeoutMs: number,
): Promise<{ summary: string; selection: SelectedProjectContext }> {
  const selection = selectRelevantProjectContext(
    projectContext,
    intentFacets,
    codeKeywords,
    specKeywords,
    8,
  )

  if (selection.passages.length === 0) {
    return { summary: '', selection }
  }

  if (selection.formatted.length <= MAX_RELEVANT_PROJECT_CONTEXT_CHARS * 0.85) {
    return { summary: selection.formatted, selection }
  }

  const compressed = await compressSelectedProjectContextPassages(
    selection.passages,
    model,
    timeoutMs,
  )
  if (!compressed) {
    return { summary: selection.formatted, selection }
  }

  const grounded = groundingScore(compressed, selection.passages)
  if (grounded < 0.35) {
    return { summary: selection.formatted, selection }
  }

  return { summary: truncate(compressed, MAX_RELEVANT_PROJECT_CONTEXT_CHARS), selection }
}

async function proposeGreenfieldSpecs(
  refinedIntent: string,
  projectContextSummary: string,
  codeSignals: string,
  model: string,
  timeoutMs: number,
  maxSpecs: number,
): Promise<ProposedNewSpec[]> {
  const targetSpecs = Math.min(3, maxSpecs)
  const prompt = `You are a spec-driven architecture planner.
This project has NO existing specs in the graph (greenfield). Propose ${targetSpecs} NEW spec boundaries MAX
(prefer 1-2 focused specs) to capture ONLY what the user intent explicitly requires.

Do NOT invent unrelated specs (importers, preview, generic APIs, listing, backend duplication endpoints)
unless the user intent explicitly mentions them.

Derive workspace prefixes from code file paths when present (e.g. "default:app/..." → workspace "default").
Use kebab-case spec names. Each spec MUST list relatedCodeFiles taken from CODE GRAPH SIGNALS when possible.

[PROJECT CONTEXT]
${projectContextSummary || '(not available)'}

[USER INTENT]
${refinedIntent}

[CODE GRAPH SIGNALS]
${codeSignals}

Return ONLY a JSON array (1-${targetSpecs} items):
[
  {
    "specId": "workspace:spec-name",
    "title": "Short human title",
    "summary": "High-level description of what this new spec should cover (no concrete requirements)",
    "reason": "Why this spec boundary is needed",
    "suggestedPath": "specs/spec-name/spec.md",
    "relatedCodeFiles": ["workspace:path/to/file"]
  }
]`

  const raw = await callLlm(prompt, model, timeoutMs)
  return normalizeProposedSpecs(safeParseJSON<ProposedNewSpec[]>(raw, []), targetSpecs)
}

async function proposeGapSpecs(
  refinedIntent: string,
  intentFacets: IntentFacets,
  projectContextSummary: string,
  codeSignals: string,
  retainedSpecs: RetainedSpec[],
  catalogSummary: string,
  model: string,
  timeoutMs: number,
  maxNewSpecs: number,
): Promise<ProposedNewSpec[]> {
  if (maxNewSpecs <= 0) return []

  const retainedSummary =
    retainedSpecs.length > 0
      ? retainedSpecs
          .map(
            (s) =>
              `- ${s.specId}${s.title ? ` (${s.title})` : ''}\n  what: ${s.summary}\n  why: ${s.reason}`,
          )
          .join('\n')
      : '(none retained — existing catalog may still be relevant)'

  const prompt = `You are a spec-driven architecture planner.
The project already has specs. Some were already identified for MODIFICATION (see RETAINED SPECS).
Your job is to decide whether ANY genuinely NEW spec boundaries are still required.

Decision process:
1. Map retained specs against intent facets (when / what / how).
2. First ask: can the user intent be fully satisfied by extending ONLY the retained specs?
3. If yes → return an empty array [].
4. Propose a new spec ONLY when a facet still has no owning spec among retained + catalog.

Rules:
- Return [] when retained specs can absorb the intent (most common case).
- Do NOT duplicate responsibilities already assigned to retained specs.
- Do NOT duplicate any specId listed under RETAINED SPECS or SPEC CATALOG.
- Propose at most ${maxNewSpecs} new specs.
- Each new spec must explain which facet (when/what/how) remains uncovered.

[INTENT FACETS]
${formatIntentFacetsForPrompt(intentFacets)}

[PROJECT CONTEXT]
${projectContextSummary || '(not available)'}

[USER INTENT]
${refinedIntent}

[RETAINED SPECS (already marked for modification — prefer extending these)]
${retainedSummary}

[SPEC CATALOG (existing specs in graph, for context)]
${catalogSummary || '(none)'}

[CODE GRAPH SIGNALS]
${codeSignals}

Return ONLY a JSON array (0-${maxNewSpecs} items, empty if none needed):
[
  {
    "specId": "workspace:spec-name",
    "title": "Short human title",
    "summary": "High-level description of what this new spec should cover (no concrete requirements)",
    "reason": "Why extending retained specs is insufficient and why this new boundary is needed",
    "suggestedPath": "specs/spec-name/spec.md",
    "relatedCodeFiles": ["workspace:path/to/file"]
  }
]`

  const raw = await callLlm(prompt, model, timeoutMs)
  const exclude = new Set([
    ...retainedSpecs.map((s) => s.specId),
    ...catalogSummary
      .split('\n')
      .map((line) => line.match(/^-\s+([^\s:]+:[^\s]+)/)?.[1])
      .filter((id): id is string => Boolean(id)),
  ])
  return normalizeProposedSpecs(safeParseJSON<ProposedNewSpec[]>(raw, []), maxNewSpecs, exclude)
}

type SpecEvaluationBodySource =
  | 'optimizedContext'
  | 'optimizedDescription'
  | 'description'
  | 'content'
  | 'none'

function descriptionAddsContext(description: string, ...others: Array<string | undefined>): boolean {
  const normalized = description.trim()
  if (!normalized) return false
  return others.every((other) => {
    const candidate = other?.trim()
    return !candidate || candidate !== normalized
  })
}

function buildSpecEvaluationBody(snapshot: SpecContextSnapshot): {
  body: string
  source: SpecEvaluationBodySource
} {
  const description = snapshot.description?.trim()
  const optimizedDescription = snapshot.optimizedDescription?.trim()
  const optimizedContext = snapshot.optimizedContext?.trim()
  const content = snapshot.content?.trim()
  const sections: string[] = []

  if (optimizedContext) {
    if (description && descriptionAddsContext(description, optimizedContext, optimizedDescription)) {
      sections.push(`[description]\n${description}`)
    }
    sections.push(`[optimizedContext]\n${optimizedContext}`)
    return { body: sections.join('\n\n'), source: 'optimizedContext' }
  }

  if (optimizedDescription) {
    if (description && descriptionAddsContext(description, optimizedDescription)) {
      sections.push(`[description]\n${description}`)
    }
    sections.push(`[optimizedDescription]\n${optimizedDescription}`)
    return { body: sections.join('\n\n'), source: 'optimizedDescription' }
  }

  if (description) {
    return { body: `[description]\n${description}`, source: 'description' }
  }

  if (content) {
    return { body: content, source: 'content' }
  }

  return { body: '', source: 'none' }
}

function formatSpecContextBody(snapshot: SpecContextSnapshot): string {
  const header = [
    snapshot.title ? `Title: ${snapshot.title}` : undefined,
    snapshot.path ? `Path: ${snapshot.path}` : undefined,
  ]
    .filter(Boolean)
    .join('\n')

  const { body } = buildSpecEvaluationBody(snapshot)
  if (!body) {
    return header || '(no spec context available — evaluate from graph signals only)'
  }

  return header ? `${header}\n\n${body}` : body
}

async function resolveSpecContextForCandidate(candidate: SpecCandidate): Promise<string> {
  const snapshot: SpecContextSnapshot = {
    title: candidate.title,
    description: candidate.description,
    optimizedDescription: candidate.optimizedDescription,
    path: candidate.specPath,
    content: candidate.specContent ?? '',
  }

  const loaded = await runtime.graph.getSpecContext(candidate.specId)
  if (loaded) {
    snapshot.title ??= loaded.title
    snapshot.path ??= loaded.path
    if (loaded.description?.trim()) {
      snapshot.description = loaded.description
    }
    snapshot.optimizedDescription ??= loaded.optimizedDescription
    snapshot.optimizedContext ??= loaded.optimizedContext
    if (!snapshot.content.trim()) {
      snapshot.content = loaded.content
    }
  }

  const { source } = buildSpecEvaluationBody(snapshot)
  if (source !== 'none') {
    return formatSpecContextBody(snapshot)
  }

  return [
    candidate.title ? `Title: ${candidate.title}` : undefined,
    candidate.specPath ? `Path: ${candidate.specPath}` : undefined,
    '(no indexed spec context available — evaluate from metadata and graph signals only)',
  ]
    .filter(Boolean)
    .join('\n')
}

function buildGraphSignalsForCandidate(candidate: SpecCandidate): string {
  return [
    candidate.minImpactDepth !== undefined ? `impactDepth: ${candidate.minImpactDepth}` : undefined,
    candidate.fromSearch ? 'matchedBy: spec-search' : undefined,
    candidate.fromSymbolEnrichment ? 'matchedBy: symbol-derived-spec-search' : undefined,
    candidate.fromImpact ? 'matchedBy: code-impact' : undefined,
    candidate.searchScore > 0 ? `searchScore: ${candidate.searchScore.toFixed(0)}` : undefined,
    candidate.relatedSpecs.size > 0
      ? `relatedSpecs: ${[...candidate.relatedSpecs].join(', ')}`
      : undefined,
  ]
    .filter(Boolean)
    .join('\n')
}

interface PreparedSpecEvaluation {
  candidate: SpecCandidate
  specContext: string
  graphSignals: string
  contextChars: number
}

function batchContextChars(batch: PreparedSpecEvaluation[]): number {
  return batch.reduce((sum, row) => sum + row.contextChars, 0)
}

function buildSpecEvaluationBatches(
  prepared: PreparedSpecEvaluation[],
  maxSpecsPerBatch: number,
  maxBatchChars: number,
): PreparedSpecEvaluation[][] {
  const batches: PreparedSpecEvaluation[][] = []
  let current: PreparedSpecEvaluation[] = []
  let currentChars = 0

  const flush = (): void => {
    if (current.length > 0) {
      batches.push(current)
      current = []
      currentChars = 0
    }
  }

  for (const row of prepared) {
    if (row.contextChars > maxBatchChars) {
      flush()
      batches.push([row])
      continue
    }

    const wouldExceedChars = current.length > 0 && currentChars + row.contextChars > maxBatchChars
    const wouldExceedCount = current.length >= maxSpecsPerBatch

    if (wouldExceedChars || wouldExceedCount) {
      flush()
    }

    current.push(row)
    currentChars += row.contextChars
  }

  flush()
  return rebalanceSpecEvaluationBatches(batches, maxBatchChars)
}

/** Merge a trailing batch into the previous one when combined context still fits. */
function rebalanceSpecEvaluationBatches(
  batches: PreparedSpecEvaluation[][],
  maxBatchChars: number,
): PreparedSpecEvaluation[][] {
  if (batches.length < 2) return batches

  const result = batches.map((batch) => [...batch])
  while (result.length >= 2) {
    const last = result[result.length - 1]
    const previous = result[result.length - 2]
    const combinedChars = batchContextChars(previous) + batchContextChars(last)
    if (combinedChars > maxBatchChars) break

    result[result.length - 2] = [...previous, ...last]
    result.pop()
  }

  return result
}

async function evaluateCandidateSpecBatchViaOllama(
  batch: PreparedSpecEvaluation[],
  refinedIntent: string,
  intentFacets: IntentFacets,
  projectContextSummary: string,
  _codeKeywords: ExpandedKeywords,
  model: string,
  timeoutMs: number,
): Promise<RetainedSpec[]> {
  const specSections = batch
    .map((row, index) => {
      return `--- SPEC ${index + 1} ---
specId: ${row.candidate.specId}

[GRAPH SIGNALS]
${row.graphSignals || '(none)'}

[SPEC CONTEXT]
${row.specContext}`
    })
    .join('\n\n')

  const specIdList = batch.map((row) => row.candidate.specId).join(', ')

  const prompt = `You are a spec-driven architecture evaluator.
Decide for EACH spec below whether it must be updated to fulfil the user intent.

Use RETAIN only when a spec genuinely needs changes.
Use REJECT when the spec is unrelated noise or already sufficient as-is.

[INTENT FACETS]
${formatIntentFacetsForPrompt(intentFacets)}

Evaluation rules (apply to every spec):
- RETAIN only if this spec governs the lifecycle moment in "when" OR owns the behavior in "what" OR defines the mechanism in "how".
- REJECT if the spec only shares vocabulary (same noun/verb) but governs a different lifecycle moment or unrelated domain.
- Do NOT RETAIN solely because unrelated code elsewhere uses a similar term in another context.
- Use only [GRAPH SIGNALS] and [SPEC CONTEXT] for this spec — do not assume global codebase impact.

Evaluate every spec independently. Do NOT write concrete requirements — only high-level change intent when RETAIN.

[PROJECT CONTEXT]
${projectContextSummary || '(not available)'}

[USER INTENT]
${refinedIntent}

[SPECS UNDER REVIEW — ${batch.length} total]
${specSections}

Return decisions for every spec (${specIdList}).
Rules for "reason":
- REQUIRED for every spec, both RETAIN and REJECT.
- REJECT: explain the lifecycle/domain mismatch or why the spec is already sufficient.
- RETAIN: explain which facet(s) this spec owns.`

  if (!runtime.llm.completeStructured) {
    throw new LlmError('Ollama port missing completeStructured')
  }

  const parsed = await runtime.llm.completeStructured<{ decisions?: SpecDecisionRow[] }>(
    prompt,
    SPEC_EVAL_DECISIONS_JSON_SCHEMA,
    { model, timeoutMs },
  )
  const decisions = parsed.decisions ?? []

  const bySpecId = new Map(batch.map((row) => [row.candidate.specId, row.candidate]))
  const retained: RetainedSpec[] = []
  const reported = new Set<string>()

  for (const row of decisions) {
    const specId = row.specId?.trim()
    if (!specId) continue
    reported.add(specId)
    const action = row.action === 'RETAIN' ? 'RETAIN' : 'REJECT'
    logSpecDecision(specId, action, row.reason)
    if (action !== 'RETAIN') continue
    const candidate = bySpecId.get(specId)
    if (!candidate) continue
    retained.push({
      specId,
      title: candidate.title,
      summary: row.summary?.trim() || candidate.description || 'Update spec to address user intent',
      reason: row.reason || 'Relevant to user intent',
      retainedByLlm: true,
    })
  }

  for (const row of batch) {
    if (reported.has(row.candidate.specId)) continue
    logSpecDecision(row.candidate.specId, 'REJECT', 'missing from structured decisions')
  }

  return retained
}

async function evaluateCandidateSpecBatch(
  batch: PreparedSpecEvaluation[],
  refinedIntent: string,
  intentFacets: IntentFacets,
  projectContextSummary: string,
  codeKeywords: ExpandedKeywords,
  model: string,
  timeoutMs: number,
): Promise<RetainedSpec[]> {
  if (runtime.llm.provider === 'ollama') {
    console.log('   └─ 🤖 Ollama structured evaluation (preloaded spec context)')
    return evaluateCandidateSpecBatchViaOllama(
      batch,
      refinedIntent,
      intentFacets,
      projectContextSummary,
      codeKeywords,
      model,
      timeoutMs,
    )
  }

  const specSections = batch
    .map((row, index) => {
      return `--- SPEC ${index + 1} ---
specId: ${row.candidate.specId}

[GRAPH SIGNALS]
${row.graphSignals || '(none)'}

[SPEC CONTEXT]
${row.specContext}`
    })
    .join('\n\n')

  const specIdList = batch.map((row) => row.candidate.specId).join(', ')

  const prompt = `You are a spec-driven architecture evaluator.
Decide for EACH spec below whether it must be updated to fulfil the user intent.

Use RETAIN only when a spec genuinely needs changes.
Use REJECT when the spec is unrelated noise or already sufficient as-is.

[INTENT FACETS]
${formatIntentFacetsForPrompt(intentFacets)}

Evaluation rules (apply to every spec):
- RETAIN only if this spec governs the lifecycle moment in "when" OR owns the behavior in "what" OR defines the mechanism in "how".
- REJECT if the spec only shares vocabulary (same noun/verb) but governs a different lifecycle moment or unrelated domain.
- Do NOT RETAIN solely because unrelated code elsewhere uses a similar term in another context.
- Use only [GRAPH SIGNALS] and [SPEC CONTEXT] for this spec — do not assume global codebase impact.

Evaluate every spec independently. Do NOT write concrete requirements — only high-level change intent when RETAIN.

[PROJECT CONTEXT]
${projectContextSummary || '(not available)'}

[USER INTENT]
${refinedIntent}

[SPECS UNDER REVIEW — ${batch.length} total]
${specSections}

Return ONLY a JSON array with one object per spec (${specIdList}):
[
  {
    "specId": "<specId>",
    "action": "RETAIN" | "REJECT",
    "summary": "What should change in this spec (high level, only if RETAIN)",
    "reason": "REQUIRED — why RETAIN or REJECT; cite which facet (when/what/how) matches or mismatches"
  }
]

Rules for "reason":
- REQUIRED for every spec, both RETAIN and REJECT.
- REJECT: explain the lifecycle/domain mismatch or why the spec is already sufficient.
- RETAIN: explain which facet(s) this spec owns.`

  const raw = await callLlm(prompt, model, timeoutMs)
  const parsed = safeParseJSON<
    Array<{
      specId?: string
      action?: string
      summary?: string
      reason?: string
    }>
  >(raw, [])

  const bySpecId = new Map(batch.map((row) => [row.candidate.specId, row.candidate]))
  const retained: RetainedSpec[] = []

  for (const row of parsed) {
    const specId = row.specId?.trim()
    if (!specId) continue

    const candidate = bySpecId.get(specId)
    const action = row.action?.toUpperCase() === 'RETAIN' ? 'RETAIN' : 'REJECT'
    const reason = row.reason?.trim() || row.summary?.trim()

    console.log(`   └─ ${specId}: ${action}`)
    if (reason) {
      console.log(`      why: ${reason}`)
    } else {
      console.log(`      why: (no reason returned by LLM)`)
    }

    if (action !== 'RETAIN' || !candidate) continue

    retained.push({
      specId,
      title: candidate.title,
      summary:
        row.summary?.trim() ||
        candidate.description ||
        'Update spec to address user intent',
      reason: reason || 'Relevant to user intent',
      retainedByLlm: true,
    })
  }

  for (const row of batch) {
    if (!parsed.some((entry) => entry.specId?.trim() === row.candidate.specId)) {
      console.log(`   └─ ${row.candidate.specId}: REJECT`)
      console.log(`      why: missing from LLM response`)
    }
  }

  return retained
}

async function evaluateCandidateSpecs(
  candidates: SpecCandidate[],
  refinedIntent: string,
  intentFacets: IntentFacets,
  projectContextSummary: string,
  codeKeywords: ExpandedKeywords,
  model: string,
  timeoutMs: number,
  maxSpecsPerBatch: number,
  maxBatchChars: number,
): Promise<RetainedSpec[]> {
  const prepared: PreparedSpecEvaluation[] = []

  for (const candidate of candidates) {
    const specContext = await resolveSpecContextForCandidate(candidate)
    prepared.push({
      candidate,
      specContext,
      graphSignals: buildGraphSignalsForCandidate(candidate),
      contextChars: specContext.length,
    })
  }

  const batches = buildSpecEvaluationBatches(prepared, maxSpecsPerBatch, maxBatchChars)
  const retained: RetainedSpec[] = []

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    const batchChars = batchContextChars(batch)
    const expanded =
      batch.length > maxSpecsPerBatch ? `, expanded to ${batch.length} specs` : ''
    console.log(
      `   📦 batch ${i + 1}/${batches.length}: ${batch.length} spec(s), ${batchChars} context chars${expanded}`,
    )

    try {
      const rows = await evaluateCandidateSpecBatch(
        batch,
        refinedIntent,
        intentFacets,
        projectContextSummary,
        codeKeywords,
        model,
        timeoutMs,
      )
      retained.push(...rows)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      const specIds = batch.map((row) => row.candidate.specId).join(', ')
      console.warn(`   └─ ⚠️  evaluation failed for batch [${specIds}]: ${msg}`)
    }
  }

  return retained
}

async function expandRetainedWithSpecDependencies(
  retained: RetainedSpec[],
  candidates: SpecCandidate[],
  facets: IntentFacets,
  codeKeywords: ExpandedKeywords,
  refinedIntent: string,
  maxAdded = 2,
): Promise<RetainedSpec[]> {
  const llmRetained = retained.filter((spec) => spec.retainedByLlm && !spec.isNewSpec)
  if (llmRetained.length === 0 || candidates.length === 0) return retained

  const candidateById = new Map(candidates.map((candidate) => [candidate.specId, candidate]))
  const result: RetainedSpec[] = [...retained]
  const retainedIds = new Set(retained.map((spec) => spec.specId))
  let added = 0
  const minScore = minFacetScoreForInclusion()

  for (const retainedSpec of llmRetained) {
    if (added >= maxAdded) break

    const parentFacetScore = scoreSpecIdByFacets(
      retainedSpec.specId,
      retainedSpec.title ?? candidateById.get(retainedSpec.specId)?.title,
      facets,
      codeKeywords,
      refinedIntent,
    )

    const dependsOn = await runtime.graph.getSpecDependsOn(retainedSpec.specId)
    for (const depId of dependsOn) {
      if (added >= maxAdded) break
      if (retainedIds.has(depId)) continue

      const candidate = candidateById.get(depId)
      const facetScore = scoreSpecIdByFacets(
        depId,
        candidate?.title,
        facets,
        codeKeywords,
        refinedIntent,
      )
      if (facetScore < minScore) continue
      if (parentFacetScore > 0 && facetScore < parentFacetScore * 0.35) continue

      const addedSpec: RetainedSpec = {
        specId: depId,
        title: candidate?.title,
        summary:
          candidate?.description?.trim() ||
          `Required because retained spec '${retainedSpec.specId}' depends on it`,
        reason: `Graph dependsOn: '${retainedSpec.specId}' → '${depId}' (facet-aligned dependency)`,
        expandedFromDependsOn: true,
      }

      retainedIds.add(depId)
      result.push(addedSpec)
      added++
      console.log(`   ↪ ${depId}: INCLUDED (dependsOn from ${retainedSpec.specId})`)
    }
  }

  return result
}

function graphEvidenceFallback(
  candidates: SpecCandidate[],
  facets: IntentFacets,
  codeKeywords: ExpandedKeywords,
  refinedIntent: string,
): RetainedSpec[] {
  const minScore = minFacetScoreForInclusion()
  const scored = candidates
    .map((candidate) => {
      const facetScore = scoreSpecIdByFacets(
        candidate.specId,
        candidate.title,
        facets,
        codeKeywords,
        refinedIntent,
      )
      const impactBonus =
        candidate.minImpactDepth !== undefined ? Math.max(0, 4 - candidate.minImpactDepth) : 0
      const searchBonus = candidate.fromSearch ? (candidate.searchScore ?? 0) / 2_000 : 0
      const enrichmentBonus = candidate.fromFacetEnrichment ? 2 : 0
      return {
        candidate,
        total: facetScore * 10 + impactBonus + searchBonus + enrichmentBonus,
      }
    })
    .filter((row) => row.total >= minScore)
    .sort((a, b) => b.total - a.total)
    .slice(0, 3)

  if (scored.length > 0) {
    return scored.map(({ candidate }) => ({
      specId: candidate.specId,
      title: candidate.title,
      summary:
        candidate.description?.trim() ||
        candidate.title ||
        'Update spec to address user intent via facet-aligned graph evidence',
      reason: 'Facet-aligned graph evidence fallback (LLM evaluation unavailable or inconclusive)',
      retainedByLlm: false,
    }))
  }

  const linked = candidates.filter((c) => c.fromImpact && c.fromSearch)
  if (linked.length > 0) {
    return linked.slice(0, 3).map((c) => ({
      specId: c.specId,
      title: c.title,
      summary: c.title ?? c.description ?? 'Extend spec to cover the requested behaviour',
      reason: 'Matched by both code impact and spec search',
      retainedByLlm: false,
    }))
  }

  return candidates
    .filter((c) => c.fromSearch)
    .slice(0, 3)
    .map((c) => ({
      specId: c.specId,
      title: c.title,
      summary: c.title ?? c.description ?? 'Update spec to reflect the requested change',
      reason: 'Top-ranked spec search match',
      retainedByLlm: false,
    }))
}

async function runBlindDiscoveryAgent(
  refinedIntent: string,
  intentFacets: IntentFacets,
  options: AgentOptions,
  ctx: ToolExecutionContext,
): Promise<string[]> {
  console.log('🔍 STEP 2b: Blind Discovery Agent (unbiased graph & spec exploration)')
  console.log('------------------------------------------------------')

  const blindPrompt = `You are an unbiased spec-driven discovery agent.
Your objective is to explore the codebase and specifications using your tools to discover ALL specs and code files relevant to the user intent.

CRITICAL: You have NO initial candidate list. Use search_specs, search_symbols, get_symbol_code, analyze_spec_impact, analyze_file_impact to discover specs.

[USER INTENT]
${refinedIntent}

[FACETS]
- When (triggers): ${(intentFacets.when ?? []).join(', ')}
- What (core entity): ${(intentFacets.what ?? []).join(', ')}
- How (mechanisms): ${(intentFacets.how ?? []).join(', ')}

When finished, call submit_decisions or output the specIds you discovered.`

  const discoveredSpecs = new Set<string>()

  try {
    const decisions = await ollamaChatWithTools(
      options.ollamaBaseUrl,
      options.model,
      [{ role: 'user', content: blindPrompt }],
      INTENT_PLAN_OLLAMA_TOOLS,
      ctx,
      options.llmTimeoutMs,
      options.maxToolTurns * 2,
    )

    for (const d of decisions) {
      if (d.specId) discoveredSpecs.add(d.specId)
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`   ⚠️  Blind discovery agent completed: ${msg}`)
  }

  const specList = Array.from(discoveredSpecs)
  if (specList.length > 0) {
    console.log(`✅ Blind discovery agent found ${specList.length} spec(s): ${specList.join(', ')}\n`)
  } else {
    console.log('✅ Blind discovery agent completed (no additional specs discovered)\n')
  }

  return specList
}

function expandRelatedModuleFiles(paths: string[]): string[] {
  return [...new Set(paths)]
}

interface PlanReconciliationResult {
  retainedSpecIds: string[]
  retainedNewSpecIds: string[]
  retainedFilePaths: string[]
  prunedItems: Array<{ id: string; reason: string }>
}

async function reconcileAndPrunePlanGlobally(
  refinedIntent: string,
  modifySpecs: Array<{ specId: string; title?: string; summary: string; reason: string; graphImpact?: SpecImpactCoverage }>,
  createSpecs: Array<{ specId: string; title?: string; summary: string; reason: string; suggestedPath?: string }>,
  modifyFiles: CodeFileProposal[],
  model: string,
  timeoutMs: number,
): Promise<{
  modifySpecs: typeof modifySpecs
  createSpecs: typeof createSpecs
  modifyFiles: typeof modifyFiles
  prunedItems: Array<{ id: string; reason: string }>
}> {
  const totalItems = modifySpecs.length + createSpecs.length + modifyFiles.length
  if (totalItems <= 2) {
    return { modifySpecs, createSpecs, modifyFiles, prunedItems: [] }
  }

  const prompt = `You are a lead architect performing a final holistic review of a spec-driven implementation plan.
Review the complete proposed plan below and eliminate any redundant, overlapping, or non-essential specs or code files.

[USER INTENT]
${refinedIntent}

[PROPOSED SPECS TO MODIFY (${modifySpecs.length})]
${modifySpecs.map((s) => `- ${s.specId}: ${s.summary} (why: ${s.reason})`).join('\n') || '(none)'}

[PROPOSED SPECS TO CREATE (${createSpecs.length})]
${createSpecs.map((s) => `- ${s.specId}: ${s.summary} (why: ${s.reason})`).join('\n') || '(none)'}

[PROPOSED CODE FILES TO MODIFY (${modifyFiles.length})]
${modifyFiles.map((f) => `- ${f.filePath}: ${f.summary}`).join('\n') || '(none)'}

Evaluation rules:
1. Retain only specs and code files strictly required for this intent.
2. If responsibilities overlap between specs, keep the primary spec and remove the redundant one.
3. Ensure the final set of specs and code files is minimal, complete, and non-redundant.

Return JSON matching schema.`

  try {
    const result = await runtime.llm.completeStructured<PlanReconciliationResult>(
      prompt,
      RECONCILE_PLAN_JSON_SCHEMA,
      { model, timeoutMs },
    )

    const retainedSpecSet = new Set(result.retainedSpecIds ?? [])
    const retainedNewSpecSet = new Set(result.retainedNewSpecIds ?? [])
    const retainedFileSet = new Set(result.retainedFilePaths ?? [])

    const filteredModifySpecs = modifySpecs.filter((s) => retainedSpecSet.has(s.specId))
    const filteredCreateSpecs = createSpecs.filter((s) => retainedNewSpecSet.has(s.specId))
    const filteredModifyFiles = modifyFiles.filter((f) => retainedFileSet.has(f.filePath))

    if (filteredModifySpecs.length === 0 && modifySpecs.length > 0) {
      return { modifySpecs, createSpecs, modifyFiles, prunedItems: [] }
    }

    return {
      modifySpecs: filteredModifySpecs,
      createSpecs: filteredCreateSpecs,
      modifyFiles: filteredModifyFiles,
      prunedItems: result.prunedItems ?? [],
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`⚠️ Global plan reconciliation failed: ${msg}`)
    return { modifySpecs, createSpecs, modifyFiles, prunedItems: [] }
  }
}

function printFinalPlan(plan: AgentPlan, model: string): void {
  console.log('\n======================================================')
  console.log(`📌 IMPLEMENTATION PLAN (${model})`)
  console.log('======================================================\n')

  console.log('## Specs to MODIFY\n')
  if (plan.modifySpecs.length === 0) {
    console.log('(none)\n')
  } else {
    for (const spec of plan.modifySpecs) {
      console.log(`### ${spec.specId}`)
      if (spec.title) console.log(`Title: ${spec.title}`)
      console.log(`What: ${spec.summary}`)
      console.log(`Why:  ${spec.reason}`)
      printSpecGraphImpact(spec.graphImpact)
    }
  }

  console.log('## Specs to CREATE\n')
  if (plan.createSpecs.length === 0) {
    console.log('(none)\n')
  } else {
    for (const spec of plan.createSpecs) {
      console.log(`### ${spec.specId}`)
      if (spec.title) console.log(`Title: ${spec.title}`)
      if (spec.suggestedPath) console.log(`Path:  ${spec.suggestedPath}`)
      console.log(`What: ${spec.summary}`)
      console.log(`Why:  ${spec.reason}\n`)
    }
  }

  console.log('## Code files to MODIFY\n')
  if (plan.modifyFiles.length === 0) {
    console.log('(none)\n')
  } else {
    for (const file of plan.modifyFiles) {
      console.log(`### ${file.filePath}`)
      console.log(`What: ${file.summary}`)
      console.log(`Why:  ${file.reason}`)
      printCodeFileImpact(file)
    }
  }
}

// ---------------------------------------------------------------------------
// CLI input
// ---------------------------------------------------------------------------

function createCLI() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const ask = (query: string): Promise<string> =>
    new Promise((resolve) => {
      rl.question(query, (ans) => resolve(ans.trim()))
    })
  return { ask, close: () => rl.close() }
}

function printUsage(): void {
  console.log(`Usage: npx tsx dev/scripts/test-internal-agent.ts [options] [intent]

Discover specs and code to touch for a user intent. Outputs a high-level plan only
(modify/create specs and code files with what/why — no concrete requirements).

Options:
  -p, --prompt <text>     User intent (skips interactive prompt)
  -m, --model <model>     LLM model (default: $SPEC_MODEL or ${DEFAULT_MODEL})
      --llm <provider>    LLM provider: opencode | ollama (default: $SPEC_LLM_PROVIDER or opencode)
      --ollama-url <url>  Ollama API base URL (default: ${DEFAULT_OLLAMA_BASE_URL})
  -c, --config <path>     Path to specd.yaml for another project/repo
      --timeout <ms>      LLM timeout in milliseconds (default: ${DEFAULT_LLM_TIMEOUT_MS})
      --max-specs <n>     Max candidate specs to evaluate (default: 8)
      --max-files <n>     Max code files for impact traversal (default: 5)
      --search-limit <n>  Graph search result limit (default: 15)
      --spec-batch-size <n>   Max specs per evaluation batch (default: ${DEFAULT_MAX_SPECS_PER_EVAL_BATCH})
      --spec-batch-chars <n>  Max total spec-context chars per batch (default: ${DEFAULT_MAX_SPEC_EVAL_BATCH_CHARS})
      --tools, --interactive Enable interactive LLM tool calling (search_symbols, etc.)
      --hybrid                Enable 3-Stage Hybrid Agent (Blind Discovery + Isolated Eval + Reconciliation)
      --blind-discovery       Enable Blind Discovery Agent (explores graph with 0 candidate bias)
      --depth <n>             Impact graph traversal depth (default: 2)
      --max-turns <n>         Max interactive LLM tool turns (default: ${OLLAMA_MAX_TOOL_TURNS})
  -h, --help              Show this help

Examples:
  npx tsx dev/scripts/test-internal-agent.ts --llm ollama -m qwen3-coder:30b -p "Add webhook on archive" --tools --max-turns 30
  npx tsx dev/scripts/test-internal-agent.ts --config ../other-repo/specd.yaml -p "Add OAuth login"
`)
}

function parseArgs(argv: string[]): AgentOptions | null {
  let rawIntent = ''
  let model = DEFAULT_MODEL
  let llmProvider: AgentOptions['llmProvider'] =
    process.env.SPEC_LLM_PROVIDER === 'ollama' ? 'ollama' : 'opencode'
  let ollamaBaseUrl = DEFAULT_OLLAMA_BASE_URL
  let llmTimeoutMs = DEFAULT_LLM_TIMEOUT_MS
  let maxCandidateSpecs = 8
  let maxCodeFiles = 5
  let searchLimit = 15
  let specEvalBatchMaxSpecs = DEFAULT_MAX_SPECS_PER_EVAL_BATCH
  let specEvalBatchMaxChars = DEFAULT_MAX_SPEC_EVAL_BATCH_CHARS
  let specConfigPath: string | undefined
  let useInteractiveTools = false
  let useBlindDiscovery = false
  let impactDepth = 2
  let maxToolTurns = OLLAMA_MAX_TOOL_TURNS

  const positional: string[] = []
  const args = argv

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      return null
    } else if (arg === '--prompt' || arg === '-p') {
      rawIntent = argv[i + 1] ?? ''
      i++
    } else if (arg.startsWith('--prompt=') || arg.startsWith('-p=')) {
      rawIntent = arg.slice(arg.indexOf('=') + 1)
    } else if (arg === '--model' || arg === '-m') {
      model = argv[i + 1] ?? model
      i++
    } else if (arg === '--llm') {
      const provider = argv[i + 1] ?? llmProvider
      if (provider === 'ollama' || provider === 'opencode') llmProvider = provider
      i++
    } else if (arg === '--ollama-url') {
      ollamaBaseUrl = argv[i + 1] ?? ollamaBaseUrl
      i++
    } else if (arg === '--config' || arg === '-c') {
      specConfigPath = argv[i + 1] ?? ''
      i++
    } else if (arg === '--timeout') {
      llmTimeoutMs = Number(argv[i + 1] ?? llmTimeoutMs)
      i++
    } else if (arg === '--max-specs') {
      maxCandidateSpecs = Number(argv[i + 1] ?? maxCandidateSpecs)
      i++
    } else if (arg === '--max-files') {
      maxCodeFiles = Number(argv[i + 1] ?? maxCodeFiles)
      i++
    } else if (arg === '--search-limit') {
      searchLimit = Number(argv[i + 1] ?? searchLimit)
      i++
    } else if (arg === '--spec-batch-size') {
      specEvalBatchMaxSpecs = Number(argv[i + 1] ?? specEvalBatchMaxSpecs)
      i++
    } else if (arg === '--spec-batch-chars') {
      specEvalBatchMaxChars = Number(argv[i + 1] ?? specEvalBatchMaxChars)
      i++
    } else if (arg === '--tools' || arg === '--interactive') {
      useInteractiveTools = true
    } else if (arg === '--blind-discovery') {
      useBlindDiscovery = true
    } else if (arg === '--hybrid') {
      useInteractiveTools = true
      useBlindDiscovery = true
    } else if (arg === '--depth') {
      impactDepth = Number(argv[i + 1] ?? 2)
      i++
    } else if (arg === '--max-turns') {
      maxToolTurns = Number(argv[i + 1] ?? OLLAMA_MAX_TOOL_TURNS)
      i++
    } else if (!arg.startsWith('-')) {
      positional.push(arg)
    }
  }

  if (!rawIntent && positional.length > 0) {
    rawIntent = positional.join(' ')
  }

  return {
    rawIntent,
    model: llmProvider === 'ollama' && model === DEFAULT_MODEL ? DEFAULT_OLLAMA_MODEL : model,
    llmProvider,
    ollamaBaseUrl,
    llmTimeoutMs,
    maxCandidateSpecs,
    maxCodeFiles,
    searchLimit,
    specEvalBatchMaxSpecs,
    specEvalBatchMaxChars,
    useInteractiveTools,
    useBlindDiscovery,
    agentArchitecture: useBlindDiscovery && useInteractiveTools
      ? 'hybrid'
      : useInteractiveTools
        ? 'tools'
        : 'default',
    impactDepth,
    maxToolTurns,
    ...(specConfigPath?.trim() ? { specConfigPath: path.resolve(specConfigPath.trim()) } : {}),
  }
}

async function resolveUserIntent(options: AgentOptions): Promise<string> {
  if (options.rawIntent.trim()) return options.rawIntent.trim()

  const cli = createCLI()
  console.log('\n======================================================')
  console.log(`🤖  specd — Intent Discovery Agent (${options.model})  🤖`)
  console.log('======================================================\n')
  const answer = await cli.ask('👉 Describe what you want to build or change:\n> ')
  cli.close()
  return answer.trim()
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

interface RetainedSpec {
  specId: string
  summary: string
  reason: string
  title?: string
  suggestedPath?: string
  relatedCodeFiles?: string[]
  graphImpact?: SpecImpactCoverage
  isNewSpec?: boolean
  retainedByLlm?: boolean
  expandedFromDependsOn?: boolean
}

interface ProposedNewSpec {
  specId: string
  title: string
  summary: string
  reason: string
  suggestedPath?: string
  relatedCodeFiles?: string[]
}

interface CodeFileProposal {
  filePath: string
  summary: string
  reason: string
  impactDepth1?: string[]
}

function printCodeFileImpact(file: CodeFileProposal): void {
  if (!file.impactDepth1 || file.impactDepth1.length === 0) {
    console.log('Impact (d=1): (none)\n')
    return
  }

  console.log('Impact (d=1):')
  for (const impacted of file.impactDepth1) {
    console.log(`- ${impacted}`)
  }
  console.log('')
}

interface AgentPlan {
  modifySpecs: Array<{
    specId: string
    title?: string
    summary: string
    reason: string
    graphImpact?: SpecImpactCoverage
  }>
  createSpecs: Array<{
    specId: string
    title?: string
    summary: string
    reason: string
    suggestedPath?: string
  }>
  modifyFiles: CodeFileProposal[]
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2))
  if (parsed === null) {
    printUsage()
    return
  }
  const options = parsed

  const graphSession = await openSdkGraphSession(options.specConfigPath)
  const llm =
    options.llmProvider === 'ollama'
      ? createOllamaLlmPort(options.ollamaBaseUrl)
      : createPocLlmPort()
  runtime = {
    graph: createSdkGraphPort(graphSession),
    llm,
    ollamaBaseUrl: options.ollamaBaseUrl,
  }

  try {
    await runIntentPlanPipeline(options, graphSession)
  } finally {
    await graphSession.dispose()
  }
}

async function runIntentPlanPipeline(options: AgentOptions, _graphSession: SdkGraphSession): Promise<void> {
  const rawIntent = await resolveUserIntent(options)

  if (!rawIntent) {
    console.error('❌ User intent is required. Pass --prompt "<intent>" or enter it interactively.')
    process.exit(1)
  }

  console.log('\n======================================================')
  console.log(`🚀 AGENT EXECUTION (llm: ${options.llmProvider}, model: ${options.model}, timeout: ${options.llmTimeoutMs / 1000}s)`)
  if (options.llmProvider === 'ollama') {
    console.log(`🔌 Ollama API: ${options.ollamaBaseUrl}`)
  }
  if (options.specConfigPath) {
    console.log(`📁 specd config: ${options.specConfigPath}`)
  }
  console.log('======================================================\n')

  // Graph health
  let graphSpecCount = 0
  try {
    const stats = await runtime.graph.getGraphStats()
    graphSpecCount = stats.specCount ?? 0
    if (stats.stale) {
      console.warn('⚠️  Graph index is stale. Results may be incomplete. Run: specd graph index\n')
      if (stats.reasonCodes?.length) {
        console.warn(`   Reason codes: ${stats.reasonCodes.join(', ')}\n`)
      }
    }
    if (graphSpecCount === 0) {
      console.warn('🌱 No specs indexed in graph — greenfield mode: will propose NEW spec boundaries\n')
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`⚠️  Could not read graph health: ${msg}\n`)
  }

  let projectContext: ProjectContextResult = { contextEntries: [], specs: [] }
  let fullProjectContext = ''
  let projectContextWarnings: string[] = []
  try {
    projectContext = await runtime.graph.getProjectContext()
    fullProjectContext = formatFullProjectContext(projectContext)
    projectContextWarnings = [...(projectContext.warnings ?? [])]
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`⚠️  Could not load project context: ${msg}\n`)
  }

  // STEP 0 — intent refinement & semantic keyword expansion (user intent only)
  console.log('📋 STEP 0: Intent refinement & keyword expansion')
  console.log('------------------------------------------------------')
  console.log(`📥 Input: "${rawIntent}"\n`)

  const prompt0 = `You prepare inputs for a code-graph BM25 search (symbols, spec docs, file paths).
The index mostly contains English identifiers — but your job is NOT to translate the user message.

## Goal
Infer what the user wants to build or change, decompose it, and emit search terms that match how a codebase would name it.

Work in this order: facets → keywords → refinedIntent (synthesis).

## Task 1 — facets (decompose first)

Split the inferred intent into three independent facets. Short phrases (2-6 words each).

- **when**: lifecycle moment or trigger — what event should run this behavior?
- **what**: artifact or behavior only — the outcome, not how it is toggled
- **how**: control mechanism only — flag, setting, toggle, env var, CLI option (only if configurability is implied)

Rules:
- 1-4 phrases per facet
- Do NOT repeat the same phrase across facets
- Use natural-language phrases only — no snake_case, kebab-case, or identifier-style tokens in facets (those belong in keywords.expanded)
- Use English for generic software vocabulary; keep domain terms the user stated verbatim (e.g. if they say "change" as a workflow noun, keep "change")
- **when** = timing/trigger only — never flags, config keys, or control mechanisms
- **how** = control surface only — never lifecycle verbs like create/start/archive
- Do NOT invent spec IDs, packages, or file paths from this repository

## Task 2 — keywords (two layers, for BOTH codeKeywords and specKeywords)

### literal (2-5 terms)
Tokens the user actually wrote or clearly meant. Preserve their language.
No synonyms here.

### expanded (aim for 6-12 terms)
Search terms derived from the facets — especially **when** and **what** — not from literal.
Nothing in literal may repeat in expanded.

Derive expanded terms by asking:
- What verb+noun stems would appear in file names? (kebab-case / snake_case fragments)
- What class, function, or module names would implement this?
- What words appear in spec titles or requirement headings for this behaviour?

Guidance (principles, not a fixed synonym list):
- Bridge user language to likely code identifiers when the repo is English-named
- Prefer concrete stems over vague words ("snapshot", "create", "config" beats "thing", "stuff")
- codeKeywords.expanded → implementation surfaces: use-cases, loaders, handlers, orchestration, CLI, repositories
- specKeywords.expanded → behaviour, workflow, policies, requirements language

## Task 3 — refinedIntent (synthesis, NOT translation)

One clear technical sentence combining when + what + (+ how if present).

Rules:
- Clarify trigger, scope, and mechanism — do not merely restate the user text in English
- Do not add features the user did not imply
- If ambiguous, state the minimal reasonable interpretation
- Name the workflow moment explicitly (e.g. "at change start", "on draft creation") when the user implies timing

## Example A
User: "activar plugins según la configuración"

facets:
  when: ["plugin activation", "application startup"]
  what: ["enable or disable plugins"]
  how: ["configuration setting"]

refinedIntent: "Control whether plugins are active based on a configuration setting."
(codeKeywords/specKeywords expanded should come from facets — activation, plugin, configuration, enable — not from copying the example)

## Example B
User: "que deberíamos hacer para hacer un snapshot del código al iniciar un change, todo esto controlado con un flag en la config"

facets:
  when: ["start of change", "change initiation", "create change", "init change"]
  what: ["code snapshot"]
  how: ["configuration flag", "config setting", "control flag", "toggle option"]

refinedIntent: "Capture a code snapshot when a change starts, gated by a configuration flag."
(literal keeps user tokens: snapshot, change, config, flag;
 expanded infers identifier stems like change-start, create-change, snapshot — from facets, not copied from this example)

## Output rules
- Each keyword: 1-3 words, lowercase preferred except acronyms (CLI, API)
- expanded must be materially richer than literal
- Return valid JSON only, no markdown

[USER INTENT]
${rawIntent}

{
  "facets": { "when": ["string"], "what": ["string"], "how": ["string"] },
  "codeKeywords": { "literal": ["string"], "expanded": ["string"] },
  "specKeywords": { "literal": ["string"], "expanded": ["string"] },
  "refinedIntent": "string"
}`

  console.log('💡 STEP 0: Extracting intent facets & keywords from prompt...')
  const parsed0 =
    runtime.llm.provider === 'ollama' && runtime.llm.completeStructured
      ? await runtime.llm.completeStructured<{
          refinedIntent?: string
          facets?: Partial<IntentFacets>
          codeKeywords?: string[] | ExpandedKeywords
          specKeywords?: string[] | ExpandedKeywords
        }>(prompt0, STEP0_JSON_SCHEMA, {
          model: options.model,
          timeoutMs: options.llmTimeoutMs,
        })
      : safeParseJSON<{
          refinedIntent?: string
          facets?: Partial<IntentFacets>
          codeKeywords?: string[] | ExpandedKeywords
          specKeywords?: string[] | ExpandedKeywords
        }>(
          await callLlm(prompt0, options.model, options.llmTimeoutMs),
          {},
        )

  if (runtime.llm.provider === 'ollama') {
    console.log('   └─ 📐 Ollama structured output (STEP 0)')
  }

  const refinedIntent = parsed0.refinedIntent?.trim() || rawIntent
  const fallbackTerms = tokenizeForSearch(`${rawIntent} ${refinedIntent}`, 8)
  let codeKeywords = finalizeSearchKeywords(
    parseKeywordGroup(parsed0.codeKeywords, fallbackTerms),
  )
  let specKeywords = finalizeSearchKeywords(
    parseKeywordGroup(parsed0.specKeywords, fallbackTerms),
  )
  const parsedFacets = parseIntentFacets(parsed0.facets, refinedIntent, codeKeywords, specKeywords)
  const sanitizedFacets = sanitizeIntentFacets(parsedFacets, codeKeywords, specKeywords)
  codeKeywords = finalizeSearchKeywords(sanitizedFacets.codeKeywords)
  specKeywords = finalizeSearchKeywords(sanitizedFacets.specKeywords)
  const intentFacets = normalizeIntentFacets(
    sanitizedFacets.facets,
    codeKeywords,
    specKeywords,
  )
  const facetReservedSpecIds = new Set<string>()

  console.log(`✅ Refined intent: "${refinedIntent}"`)
  console.log(`✅ Intent facets:`)
  console.log(`   when: ${JSON.stringify(intentFacets.when)}`)
  console.log(`   what: ${JSON.stringify(intentFacets.what)}`)
  console.log(`   how:  ${JSON.stringify(intentFacets.how)}`)
  console.log(`✅ Code keywords (literal):   ${JSON.stringify(codeKeywords.literal)}`)
  console.log(`✅ Code keywords (expanded): ${JSON.stringify(codeKeywords.expanded)}`)
  console.log(`✅ Spec keywords (literal):   ${JSON.stringify(specKeywords.literal)}`)
  console.log(`✅ Spec keywords (expanded): ${JSON.stringify(specKeywords.expanded)}`)

  let projectContextSummary = ''
  if (fullProjectContext.trim()) {
    console.log('')
    console.log('🧭 STEP 0b: Project context relevance filter')
    console.log('------------------------------------------------------')
    console.log(`   Full project context: ${fullProjectContext.length} chars`)

    const filtered = await summarizeRelevantProjectContext(
      projectContext,
      intentFacets,
      codeKeywords,
      specKeywords,
      options.model,
      options.llmTimeoutMs,
    )
    projectContextSummary = filtered.summary

    console.log(
      `   Selected ${filtered.selection.selectedCount}/${filtered.selection.totalCount} passages (deterministic overlap with facets/keywords)`,
    )
    if (filtered.selection.sources.length > 0) {
      console.log(`   ↪ sources: ${filtered.selection.sources.join(', ')}`)
    }

    for (const warning of projectContextWarnings) {
      console.warn(`⚠️  ${warning}`)
    }

    if (projectContextSummary) {
      console.log(`✅ Relevant project context (${projectContextSummary.length} chars):`)
      console.log(projectContextSummary.split('\n').map((line) => `   ${line}`).join('\n'))
    } else {
      console.log('✅ No relevant project context for this intent')
    }
    console.log('')
  }

  const facetFileQueries = buildFacetFileSearchQueries(intentFacets)
  const codeQueries = dedupeKeywords([
    ...buildSearchQueries(codeKeywords, refinedIntent),
    ...facetFileQueries,
  ]).slice(0, 10)
  const specQueries = buildFacetSpecSearchQueries(intentFacets, specKeywords)
  const fileQueries = dedupeKeywords([
    ...buildFileSearchQueries(codeKeywords, refinedIntent, rawIntent),
    ...facetFileQueries,
  ]).slice(0, 8)
  const intentFallbackQuery = tokenizeForSearch(`${rawIntent} ${refinedIntent}`, 8).join(' ')

  console.log(`✅ Search queries → code: ${JSON.stringify(codeQueries)} | specs: ${JSON.stringify(specQueries)}`)
  console.log(`✅ Facet file queries: ${JSON.stringify(facetFileQueries)}`)
  console.log(`✅ File search queries: ${JSON.stringify(fileQueries)}`)
  if (intentFallbackQuery) console.log(`✅ Intent fallback query: ${JSON.stringify(intentFallbackQuery)}`)
  console.log('')

  // STEP 1 — graph search
  console.log('🔍 STEP 1: Graph search (symbols + specs + files)')
  console.log('------------------------------------------------------')

  const [codeSymbolBatch, fallbackSymbolBatch, whenSymbolBatch, specSearch, fileBatch, whenFileBatch, fallbackFileBatch] =
    await Promise.all([
      graphSearchMulti(codeQueries, { symbols: true }, options.searchLimit),
      intentFallbackQuery
        ? safeGraphSearch(intentFallbackQuery, { symbols: true }, options.searchLimit)
        : Promise.resolve({ symbols: [], specs: [], files: [] }),
      graphSearchMulti(facetFileQueries, { symbols: true }, Math.min(options.searchLimit, 10)),
      graphSearchMulti(specQueries, { specs: true }, options.searchLimit),
      graphSearchMulti(fileQueries, { files: true }, Math.min(options.searchLimit, 8)),
      graphSearchMulti(facetFileQueries, { files: true }, Math.min(options.searchLimit, 10)),
      intentFallbackQuery
        ? safeGraphSearch(intentFallbackQuery, { files: true }, Math.min(options.searchLimit, 6))
        : Promise.resolve({ symbols: [], specs: [], files: [] }),
    ])

  const symbolSearch = mergeGraphSearchResults(
    intentFallbackQuery
      ? [codeSymbolBatch, whenSymbolBatch, fallbackSymbolBatch]
      : [codeSymbolBatch, whenSymbolBatch],
  )
  const fileSearch = mergeGraphSearchResults(
    intentFallbackQuery ? [fileBatch, whenFileBatch, fallbackFileBatch] : [fileBatch, whenFileBatch],
  )

  const graphFileScores = new Map<string, number>()
  for (const row of fileSearch.files ?? []) {
    const filePath = row.filePath ?? row.path
    if (!filePath) continue
    const score = row.score ?? 0
    graphFileScores.set(filePath, Math.max(graphFileScores.get(filePath) ?? 0, score))
  }

  const searchHits = mergeDiscoveredCodeFiles(
    extractCodeFilesFromSearch(symbolSearch.symbols ?? []),
    extractCodeFilesFromFileSearch(fileSearch.files),
  )
  const maxImpactSeeds = Math.max(2, Math.min(4, options.maxCodeFiles))
  const facetRankedFromHits = rankDiscoveredCodeFilesByFacets(
    searchHits,
    graphFileScores,
    intentFacets,
    codeKeywords,
    refinedIntent,
    rawIntent,
    maxImpactSeeds * 2,
  )
  const facetRankedFromFiles = rankDiscoveredCodeFilesByFacets(
    extractCodeFilesFromFileSearch(fileSearch.files),
    graphFileScores,
    intentFacets,
    codeKeywords,
    refinedIntent,
    rawIntent,
    maxImpactSeeds * 2,
  )
  const searchSeedFiles = dedupeKeywords([...facetRankedFromHits, ...facetRankedFromFiles])
    .filter((file) => isStrongFacetAlignedFile(file, intentFacets, codeKeywords, refinedIntent))
    .slice(0, maxImpactSeeds)

  const discoveredCodeFiles = rankDiscoveredCodeFilesByFacets(
    expandRelatedModuleFiles([...searchSeedFiles, ...facetRankedFromFiles]),
    graphFileScores,
    intentFacets,
    codeKeywords,
    refinedIntent,
    rawIntent,
    options.maxCodeFiles * 2,
  )
  const codeFiles = discoveredCodeFiles.slice(0, options.maxCodeFiles)
  console.log(`✅ Code surfaces (${codeFiles.length}):`)
  for (const file of codeFiles) console.log(`   • ${file}`)
  if (searchSeedFiles.length === 0) {
    console.log('   ⚠️  No facet-strong impact seeds — downstream impact may be weak')
  } else {
    console.log(`   ↪ impact seeds: ${searchSeedFiles.join(', ')}`)
  }
  console.log('')

  const candidatePool = new Map<string, SpecCandidate>()

  for (const row of specSearch.specs ?? []) {
    upsertCandidate(candidatePool, row.specId, {
      title: row.title,
      description: row.description,
      optimizedDescription: row.optimizedDescription,
      specContent: row.content,
      specPath: row.path,
      searchScore: row.score ?? 0,
      fromSearch: true,
    })
  }

  const symbolDerivedSpecs = await enrichCandidatesFromSymbolDerivedSpecSearch(
    candidatePool,
    symbolSearch.symbols ?? [],
    intentFacets,
    codeKeywords,
    refinedIntent,
    6,
    6,
  )
  for (const specId of symbolDerivedSpecs.added) facetReservedSpecIds.add(specId)
  if (symbolDerivedSpecs.queries.length > 0 || symbolDerivedSpecs.added.length > 0) {
    console.log('📐 STEP 1a: Symbol-derived spec search')
    console.log('------------------------------------------------------')
    if (symbolDerivedSpecs.symbolNames.length > 0) {
      console.log(`   ↪ class/use-case symbols: ${symbolDerivedSpecs.symbolNames.join(', ')}`)
    }
    if (symbolDerivedSpecs.queries.length > 0) {
      console.log(`   ↪ spec queries: ${symbolDerivedSpecs.queries.join(' | ')}`)
    }
    if (symbolDerivedSpecs.added.length > 0) {
      console.log(`   ↪ added specs: ${symbolDerivedSpecs.added.join(', ')}`)
    } else {
      console.log('   ↪ (no new specs from symbol-derived queries)')
    }
    console.log('')
  }

  const facetAnchoredSpecs = await ensureFacetAnchoredSpecsInPool(
    candidatePool,
    intentFacets,
    codeKeywords,
    refinedIntent,
    specKeywords,
    4,
  )
  for (const specId of facetAnchoredSpecs) facetReservedSpecIds.add(specId)
  if (facetAnchoredSpecs.length > 0) {
    console.log(`   ↪ facet-anchored specs: ${facetAnchoredSpecs.join(', ')}`)
  }

  const coveringFromFacetFiles = await enrichCandidatesFromFacetAlignedFiles(
    candidatePool,
    extractCodeFilesFromFileSearch(fileSearch.files),
    intentFacets,
    codeKeywords,
    refinedIntent,
    graphFileScores,
    fetchFileImpact,
    5,
  )
  for (const specId of coveringFromFacetFiles) facetReservedSpecIds.add(specId)

  const dependsOnFromFacetCovering = await enrichCandidatesWithDirectDependsOn(
    candidatePool,
    coveringFromFacetFiles,
    8,
    true,
  )
  for (const specId of dependsOnFromFacetCovering) facetReservedSpecIds.add(specId)

  if (coveringFromFacetFiles.length > 0 || dependsOnFromFacetCovering.length > 0) {
    console.log('📐 STEP 1b: Facet-aligned covering specs')
    console.log('------------------------------------------------------')
    if (coveringFromFacetFiles.length > 0) {
      console.log(`   ↪ covering specs from facet-aligned files: ${coveringFromFacetFiles.join(', ')}`)
    }
    if (dependsOnFromFacetCovering.length > 0) {
      console.log(`   ↪ dependsOn from facet-aligned covering: ${dependsOnFromFacetCovering.join(', ')}`)
    }
    console.log('')
  }

  // STEP 1c — direct spec search from code keyword pairs
  // Searches each query individually to avoid merge-truncation losing key specs.
  {
    const literals = codeKeywords.literal.filter((k) => k.length > 3)
    const pairQueries: string[] = []
    for (let i = 0; i < Math.min(literals.length, 5); i++) {
      for (let j = i + 1; j < Math.min(literals.length, 5); j++) {
        pairQueries.push(`${literals[i]} ${literals[j]}`)
      }
    }
    // Also add individual literals
    for (const k of literals.slice(0, 4)) pairQueries.push(k)

    const kwAdded: string[] = []
    for (const query of pairQueries.slice(0, 10)) {
      let result: GraphSearchResult
      try {
        result = await safeGraphSearch(query, { specs: true }, 5)
      } catch {
        continue
      }
      for (const row of result.specs ?? []) {
        const facetScore = scoreSpecIdByFacets(row.specId, row.title, intentFacets, codeKeywords, refinedIntent)
        if (facetScore < 4) continue
        const had = candidatePool.has(row.specId)
        upsertCandidate(candidatePool, row.specId, {
          title: row.title,
          description: row.description,
          optimizedDescription: row.optimizedDescription,
          specContent: row.content,
          specPath: row.path,
          searchScore: Math.max(row.score ?? 0, facetScore * 800),
          fromSearch: true,
          fromFacetEnrichment: true,
        })
        if (!had) {
          kwAdded.push(row.specId)
          facetReservedSpecIds.add(row.specId)
        }
      }
    }
    if (kwAdded.length > 0) {
      console.log('📐 STEP 1c: Code keyword pair spec search')
      console.log('------------------------------------------------------')
      console.log(`   ↪ queries: ${pairQueries.slice(0, 10).join(' | ')}`)
      console.log(`   ↪ added: ${kwAdded.join(', ')}`)
      console.log('')
    }
  }

  // STEP 2 — file + symbol impact → covering specs + affected files
  console.log('🔗 STEP 2: Graph impact traversal (file + symbol)')
  console.log('------------------------------------------------------')

  const impactSummaries: string[] = []
  const impactFileEvidence = new Map<string, ImpactFileEvidence>()
  const impactSeedFiles =
    searchSeedFiles.length > 0
      ? searchSeedFiles
      : facetRankedFromFiles.slice(0, maxImpactSeeds)
  const symbolSeeds = rankSymbolSeeds(
    symbolSearch.symbols ?? [],
    impactSeedFiles,
    intentFacets,
    codeKeywords,
    refinedIntent,
  )

  for (const file of impactSeedFiles) {
    recordImpactFile(impactFileEvidence, file, 'seed', file, 0)
    try {
      const impact = await fetchFileImpact(file)

      const linkedSpecs = (impact.coveringSpecs ?? []).map((s) => s.specId)
      for (const covering of impact.coveringSpecs ?? []) {
        upsertCandidate(candidatePool, covering.specId, {
          minImpactDepth: covering.minDepth,
          fromImpact: true,
        })
      }

      const affected = (impact.affectedFiles ?? []).filter(isLikelyApplicationSource)
      for (const affectedFile of affected) {
        recordImpactFile(impactFileEvidence, affectedFile, 'affected', file, 1, impact.riskLevel)
      }

      impactSummaries.push(
        [
          `file: ${file}`,
          `risk: ${impact.riskLevel ?? 'unknown'}`,
          `coveringSpecs: ${linkedSpecs.join(', ') || '(none)'}`,
          `affectedFiles: ${affected.join(', ') || '(none)'}`,
        ].join('\n'),
      )

      console.log(`   └─ file ${file}`)
      console.log(`      specs: ${JSON.stringify(linkedSpecs)}`)
      console.log(`      affected: ${affected.length > 0 ? affected.join(', ') : '(none)'}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`   └─ ⚠️  file impact failed for ${file}: ${msg}`)
    }
    // Always: enrich pool from filename stem and top class/interface symbol names
    const seedDerived = await enrichPoolFromFilenameAndSymbolSearch(candidatePool, file, intentFacets, codeKeywords, refinedIntent)
    if (seedDerived.length > 0) {
      for (const specId of seedDerived) facetReservedSpecIds.add(specId)
      console.log(`      +derived: ${seedDerived.join(', ')}`)
    }
  }

  for (const symbol of symbolSeeds.slice(0, 2)) {
    try {
      const impact = await fetchSymbolImpact(symbol.id)
      const affected = (impact.affectedFiles ?? []).filter(isLikelyApplicationSource)
      for (const affectedFile of affected) {
        recordImpactFile(impactFileEvidence, affectedFile, 'symbol-affected', symbol.id, 1, impact.riskLevel)
      }

      impactSummaries.push(
        [
          `symbol: ${symbol.name} (${symbol.id})`,
          `risk: ${impact.riskLevel ?? 'unknown'}`,
          `affectedFiles: ${affected.join(', ') || '(none)'}`,
        ].join('\n'),
      )

      console.log(`   └─ symbol ${symbol.name} @ ${symbol.filePath}`)
      console.log(`      affected: ${affected.length > 0 ? affected.join(', ') : '(none)'}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`   └─ ⚠️  symbol impact failed for ${symbol.id}: ${msg}`)
    }
  }

  const coveringFromAffected = await enrichCandidatesFromAffectedCoveringSpecs(
    candidatePool,
    impactFileEvidence,
    intentFacets,
    codeKeywords,
    refinedIntent,
    fetchFileImpact,
    5,
  )
  for (const specId of coveringFromAffected) facetReservedSpecIds.add(specId)

  const dependsOnAdded = await enrichCandidatesWithDirectDependsOn(
    candidatePool,
    coveringFromAffected,
    8,
    true,
  )
  for (const specId of dependsOnAdded) facetReservedSpecIds.add(specId)

  if (coveringFromAffected.length > 0) {
    console.log(`   ↪ covering specs from facet-aligned affected files: ${coveringFromAffected.join(', ')}`)
  }
  if (dependsOnAdded.length > 0) {
    console.log(`   ↪ dependsOn from covering specs: ${dependsOnAdded.join(', ')}`)
  }

  // Expand via spec impact only from search/facet seeds — avoid code-graph noise from restore/archive impact
  const seedSpecs = [...candidatePool.values()]
    .filter((c) => c.fromSearch || c.fromFacetEnrichment)
    .sort(
      (a, b) =>
        scoreSpecIdByFacets(b.specId, b.title, intentFacets, codeKeywords, refinedIntent) -
        scoreSpecIdByFacets(a.specId, a.title, intentFacets, codeKeywords, refinedIntent),
    )
    .slice(0, Math.min(3, options.maxCandidateSpecs))
    .map((c) => c.specId)

  for (const specId of seedSpecs) {
    try {
      const envelope = await runtime.graph.analyzeSpecImpact(specId)
      for (const related of envelope.impact?.affectedSpecs ?? []) {
        upsertCandidate(candidatePool, related, {
          fromImpact: true,
          relatedSpecs: [specId],
        })
      }
    } catch {
      // non-fatal: spec may have no impact edges
    }
  }

  if (options.useBlindDiscovery || options.agentArchitecture === 'hybrid') {
    const blindSpecs = await runBlindDiscoveryAgent(refinedIntent, intentFacets, options, {
      facets: intentFacets,
      codeKeywords,
      refinedIntent,
    })

    for (const specId of blindSpecs) {
      upsertCandidate(candidatePool, specId, {
        fromSearch: true,
        fromFacetEnrichment: true,
      })
      facetReservedSpecIds.add(specId)
    }
  }

  const rankedCandidates = selectRankedCandidates(
    candidatePool,
    options.maxCandidateSpecs,
    specKeywords.literal,
    [...facetReservedSpecIds],
    intentFacets,
    codeKeywords,
    refinedIntent,
  )

  const greenfieldMode = graphSpecCount === 0 || rankedCandidates.length === 0
  const codeSignals = summarizeCodeSignals(discoveredCodeFiles, symbolSearch.symbols ?? [], impactSummaries, {
    code: codeKeywords,
    spec: specKeywords,
  })

  let retainedSpecs: RetainedSpec[] = []

  if (greenfieldMode) {
    console.log('🌱 STEP 3: Greenfield spec boundary proposal (no existing specs to evaluate)')
    console.log('------------------------------------------------------')

    const proposed = await proposeGreenfieldSpecs(
      refinedIntent,
      projectContextSummary,
      codeSignals,
      options.model,
      options.llmTimeoutMs,
      options.maxCandidateSpecs,
    )

    if (proposed.length === 0) {
      console.error('❌ Could not propose new specs. Refine the intent or ensure the code graph is indexed.')
      process.exit(1)
    }

    retainedSpecs = proposedToRetained(proposed)

    console.log(`✅ Proposed new specs (${retainedSpecs.length}):`)
    for (const s of retainedSpecs) {
      console.log(`   • ${s.specId}`)
      console.log(`     what: ${s.summary}`)
      console.log(`     why:  ${s.reason}`)
      if (s.suggestedPath) console.log(`     path: ${s.suggestedPath}`)
    }
    console.log('')
  } else {
    console.log(`\n✅ Candidate pool (${rankedCandidates.length}):`)
    for (const c of rankedCandidates) {
      console.log(`   • ${c.specId} (rank=${rankCandidate(c).toFixed(0)})`)
    }
    console.log('')

    const candidateIds = new Set(rankedCandidates.map((c) => c.specId))

    // STEP 3 — batched LLM spec evaluation (context-size aware)
    if (options.useInteractiveTools && options.llmProvider === 'ollama') {
      console.log('🤖 STEP 3: Interactive LLM Tool Calling (ollamaChatWithTools)')
      console.log('------------------------------------------------------')
      const candidateList = rankedCandidates.map((c) => `- ${c.specId}: ${c.title ?? c.description ?? '(no summary)'}`).join('\n')
      const toolPrompt = `You are a spec-driven architecture evaluator.
Evaluate the candidate specs below and decide for EACH whether it must be updated to fulfil the user intent.

STRICT RULES:
- You may only RETAIN spec IDs that appear EXACTLY in the [CANDIDATE SPECS UNDER REVIEW] list below. Do NOT invent, guess, or hallucinate new spec IDs in your RETAIN decisions.
- If you discover via search that a relevant spec exists that is NOT in the candidate list, you may mention it in your reasoning, but you MUST NOT include it in submit_decisions as RETAIN.
- Use tools to read spec content and code only to validate or reject candidates — not to find replacement specs.
- When you finish your evaluation, you MUST call the submit_decisions tool with your decisions.

[USER INTENT]
${refinedIntent}

[CANDIDATE SPECS UNDER REVIEW]
${candidateList}`

      const decisions = await ollamaChatWithTools(
        options.ollamaBaseUrl,
        options.model,
        [{ role: 'user', content: toolPrompt }],
        INTENT_PLAN_OLLAMA_TOOLS,
        { facets: intentFacets, codeKeywords, refinedIntent },
        options.llmTimeoutMs,
        options.maxToolTurns,
      )

      retainedSpecs = decisions
        .filter((d) => d.action === 'RETAIN')
        .map((d) => ({
          specId: d.specId,
          summary: d.summary ?? 'Update spec to address user intent',
          reason: d.reason,
          retainedByLlm: true,
        }))
      // Always restrict to known candidate IDs — prevents hallucinated spec IDs
      retainedSpecs = retainedSpecs.filter((row) => candidateIds.has(row.specId))
    } else {
      console.log(
        `⚖️ STEP 3: Candidate spec evaluation (batches ≤${options.specEvalBatchMaxSpecs} specs, ≤${options.specEvalBatchMaxChars} chars)`,
      )
      console.log('------------------------------------------------------')

      retainedSpecs = await evaluateCandidateSpecs(
        rankedCandidates,
        refinedIntent,
        intentFacets,
        projectContextSummary,
        codeKeywords,
        options.model,
        options.llmTimeoutMs,
        options.specEvalBatchMaxSpecs,
        options.specEvalBatchMaxChars,
      )
    }

    if (!options.useInteractiveTools) {
      retainedSpecs = retainedSpecs.filter((row) => candidateIds.has(row.specId))
    }

    if (retainedSpecs.length === 0) {
      console.warn('⚠️  LLM retained no specs — falling back to graph evidence ranking\n')
      retainedSpecs = graphEvidenceFallback(
        rankedCandidates,
        intentFacets,
        codeKeywords,
        refinedIntent,
      )
    }

    // Deduplicate while preserving order
    const seen = new Set<string>()
    retainedSpecs = retainedSpecs.filter((s) => {
      if (seen.has(s.specId)) return false
      seen.add(s.specId)
      return true
    })

    console.log(`✅ Retained specs (${retainedSpecs.length}):`)
    for (const s of retainedSpecs) {
      console.log(`   • ${s.specId}`)
      console.log(`     what: ${s.summary}`)
      console.log(`     why:  ${s.reason}`)
    }
    console.log('')

    // STEP 3b — gap analysis: propose NEW specs when existing catalog is insufficient
    console.log('➕ STEP 3b: Gap analysis — additional new specs needed?')
    console.log('------------------------------------------------------')

    const catalogSummary = rankedCandidates
      .map((c) => {
        const bits = [
          `- ${c.specId}`,
          c.title ? `title: ${c.title}` : undefined,
          c.description ? `summary: ${truncate(c.description, 120)}` : undefined,
        ].filter(Boolean)
        return bits.join(' | ')
      })
      .join('\n')

    const maxNewSpecs = Math.min(3, options.maxCandidateSpecs)
    const gapSpecs = await proposeGapSpecs(
      refinedIntent,
      intentFacets,
      projectContextSummary,
      codeSignals,
      retainedSpecs,
      catalogSummary,
      options.model,
      options.llmTimeoutMs,
      maxNewSpecs,
    )

    if (gapSpecs.length > 0) {
      console.log(`✅ Additional new specs proposed (${gapSpecs.length}):`)
      for (const s of gapSpecs) {
        console.log(`   • ${s.specId}`)
        console.log(`     what: ${s.summary}`)
        console.log(`     why:  ${s.reason}`)
        if (s.suggestedPath) console.log(`     path: ${s.suggestedPath}`)
      }
      console.log('')
      retainedSpecs = mergeRetainedSpecs(retainedSpecs, gapSpecs)
    } else {
      console.log('✅ Existing spec coverage deemed sufficient — no additional specs proposed\n')
    }

    console.log('🔗 STEP 3c: Spec dependency expansion (graph dependsOn)')
    console.log('------------------------------------------------------')
    const beforeDepExpansion = retainedSpecs.length
    retainedSpecs = await expandRetainedWithSpecDependencies(
      retainedSpecs,
      rankedCandidates,
      intentFacets,
      codeKeywords,
      refinedIntent,
    )
    const addedByDeps = retainedSpecs.length - beforeDepExpansion
    if (addedByDeps === 0) {
      console.log('✅ No additional specs required by dependsOn edges\n')
    } else {
      console.log(`✅ Added ${addedByDeps} spec(s) via dependsOn expansion\n`)
    }
  }

  if (retainedSpecs.length === 0) {
    console.error('❌ No specs identified for the plan. Refine the intent or re-index the graph.')
    process.exit(1)
  }

  const finalExistingSpecs = retainedSpecs.filter((spec) => !spec.isNewSpec)
  if (finalExistingSpecs.length > 0) {
    console.log('🔗 STEP 3d: Final selected specs — graph impact (covers files/symbols)')
    console.log('------------------------------------------------------')
    await enrichFinalSelectedSpecsWithGraphImpact(retainedSpecs, impactFileEvidence, impactSummaries)
    console.log('')
  }

  const modifySpecs = retainedSpecs
    .filter((s) => !s.isNewSpec)
    .map((s) => ({
      specId: s.specId,
      title: s.title,
      summary: s.summary,
      reason: s.reason,
      graphImpact: s.graphImpact,
    }))

  const createSpecs = retainedSpecs
    .filter((s) => s.isNewSpec)
    .map((s) => ({
      specId: s.specId,
      title: s.title,
      summary: s.summary,
      reason: s.reason,
      suggestedPath: s.suggestedPath,
    }))

  // STEP 4 — derive code files from graph impact (no LLM)
  console.log('📂 STEP 4: Code files from graph impact')
  console.log('------------------------------------------------------')

  let modifyFiles = deriveFilesFromImpact(
    impactFileEvidence,
    impactSeedFiles,
    refinedIntent,
    rawIntent,
    graphFileScores,
    options.maxCodeFiles,
  )
  modifyFiles = mergeSupplementaryImpactFiles(
    modifyFiles,
    impactFileEvidence,
    ['spec-impact'],
    new Set(retainedSpecs.filter((spec) => spec.retainedByLlm && !spec.expandedFromDependsOn).map((spec) => spec.specId)),
  )
  if (modifyFiles.length === 0) {
    console.warn('⚠️  No files from impact evidence — falling back to graph ranking\n')
    modifyFiles = graphFileEvidenceFallback(
      discoveredCodeFiles,
      refinedIntent,
      rawIntent,
      options.maxCodeFiles,
      graphFileScores,
    )
  }

  console.log('   Per-file impact (d=1):')
  modifyFiles = await attachDepthOneFileImpact(modifyFiles)

  console.log(`✅ Code files to modify (${modifyFiles.length}):`)
  for (const file of modifyFiles) {
    console.log(`   • ${file.filePath}`)
    if (file.impactDepth1 && file.impactDepth1.length > 0) {
      for (const impacted of file.impactDepth1) {
        console.log(`     └─ d=1: ${impacted}`)
      }
    }
  }
  console.log('')

  // STEP 5 — Global Plan Reconciliation & Pruning
  console.log('⚖️ STEP 5: Global plan reconciliation & holistic pruning')
  console.log('------------------------------------------------------')

  const reconciled = await reconcileAndPrunePlanGlobally(
    refinedIntent,
    modifySpecs,
    createSpecs,
    modifyFiles,
    options.model,
    options.llmTimeoutMs,
  )

  const finalModifySpecs = reconciled.modifySpecs
  const finalCreateSpecs = reconciled.createSpecs
  const finalModifyFiles = reconciled.modifyFiles

  if (reconciled.prunedItems.length > 0) {
    console.log(`✂️ Pruned ${reconciled.prunedItems.length} redundant/non-essential item(s):`)
    for (const item of reconciled.prunedItems) {
      console.log(`   • ${item.id}: ${item.reason}`)
    }
    console.log('')
  } else {
    console.log('✅ Plan holistic evaluation complete — no redundant items pruned\n')
  }

  const plan: AgentPlan = {
    modifySpecs: finalModifySpecs,
    createSpecs: finalCreateSpecs,
    modifyFiles: finalModifyFiles,
  }

  printFinalPlan(plan, options.model)

  const tokenLabel = tokenTracker.isExact ? 'EXACT API TOKEN USAGE' : 'ESTIMATED TOKEN USAGE'
  console.log('------------------------------------------------------')
  console.log(`📊 ${tokenLabel}`)
  console.log('------------------------------------------------------')
  console.log(`  • Prompts executed: ${tokenTracker.promptCount}`)
  console.log(`  • Input tokens:     ${tokenTracker.inputTokens.toLocaleString()}`)
  console.log(`  • Output tokens:    ${tokenTracker.outputTokens.toLocaleString()}`)
  console.log(`  • Total tokens:     ${tokenTracker.totalTokens.toLocaleString()}`)
  console.log('======================================================\n')
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err)
  console.error(`❌ Pipeline stopped: ${msg}`)
  process.exit(1)
})
