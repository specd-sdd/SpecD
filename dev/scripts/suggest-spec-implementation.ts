import { createDefaultConfigLoader } from '../../packages/core/src/index.js'
import { createCodeGraphProvider, type SymbolNode, type FileNode, type SpecNode } from '../../packages/code-graph/src/index.js'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

interface CandidateSymbol {
  id: string
  name: string
  kind?: string
  filePath: string
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  reason: string
  score: number
}

interface ImplementationEntrySuggestion {
  file: string
  symbols: string[]
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  reasons: string[]
  score: number
}

interface ExistingImplementation {
  files: string[]
  symbols: string[]
  dependsOn: string[]
}

interface SuggestedSpecDependency {
  specId: string
  title: string
  reason: string
}

interface SpecSuggestionResult {
  specId: string
  title: string
  workspace: string
  existing: ExistingImplementation
  implementationSuggestions: ImplementationEntrySuggestion[]
  suggestedDependsOn: SuggestedSpecDependency[]
}

interface CacheData {
  updatedAt: string
  projectDir: string
  specs: Record<
    string,
    {
      specId: string
      title: string
      implementationSuggestions: ImplementationEntrySuggestion[]
    }
  >
}

function getCacheFilePath(projectDir: string): string {
  return path.join(projectDir, 'dev', 'scripts', 'spec-implementation-cache.json')
}

function normalizePathForMap(p: string, projectDir: string): string {
  let clean = p.includes(':') ? p.split(':')[1]! : p
  if (path.isAbsolute(clean)) {
    clean = path.relative(projectDir, clean).replaceAll('\\', '/')
  }
  return clean.replace(/^\.\//, '').toLowerCase()
}

async function loadCache(projectDir: string): Promise<CacheData | null> {
  const filePath = getCacheFilePath(projectDir)
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as CacheData
    if (parsed && parsed.projectDir === projectDir && parsed.specs) {
      return parsed
    }
  } catch {
    // Cache miss or missing
  }
  return null
}

async function saveCache(projectDir: string, cacheSpecs: CacheData['specs']): Promise<void> {
  const filePath = getCacheFilePath(projectDir)
  try {
    const data: CacheData = {
      updatedAt: new Date().toISOString(),
      projectDir,
      specs: cacheSpecs,
    }
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8')
    console.log(`💾 Saved implementation cache to "${filePath}" (${Object.keys(cacheSpecs).length} specs).`)
  } catch (err) {
    console.warn(`⚠️ Warning: Could not save cache to "${filePath}":`, err)
  }
}

function getKindBonus(kind?: string): number {
  if (!kind) return 0
  switch (kind.toLowerCase()) {
    case 'interface':
    case 'class':
    case 'function':
    case 'type':
    case 'enum':
      return 100
    case 'method':
      return 30
    case 'variable':
    default:
      return 0
  }
}

function extractCodeBlockSymbols(content: string): string[] {
  const symbols = new Set<string>()

  const codeBlockRegex = /```(?:typescript|ts|javascript|js)?\n([\s\S]*?)```/g
  let match: RegExpExecArray | null

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const code = match[1]!
    const declRegex = /(?:class|interface|function|type|enum|const)\s+([A-Za-z0-9_$]+)/g
    let declMatch: RegExpExecArray | null
    while ((declMatch = declRegex.exec(code)) !== null) {
      if (declMatch[1] && declMatch[1].length > 2) {
        symbols.add(declMatch[1])
      }
    }
  }

  return [...symbols]
}

function deriveNameCandidates(specId: string, title: string): string[] {
  const candidates = new Set<string>()

  const baseName = specId.split(':').pop() || specId
  candidates.add(baseName)

  const pascalCase = baseName
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')
  candidates.add(pascalCase)

  const words = baseName.split('-')
  if (words.length > 1) {
    const reversedPascal = [...words.slice(1), words[0]!]
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join('')
    candidates.add(reversedPascal)
  }

  const titleClean = title.replace(/[^a-zA-Z0-9]/g, '')
  if (titleClean) candidates.add(titleClean)

  return [...candidates]
}

function shuffle<T>(array: T[]): T[] {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

async function scanSpecsFromDisk(projectDir: string, targetWorkspace: string): Promise<Array<{ spec: SpecNode; existing: ExistingImplementation }>> {
  const results: Array<{ spec: SpecNode; existing: ExistingImplementation }> = []

  const possiblePaths = [
    path.join(projectDir, 'specs', targetWorkspace),
    path.join(projectDir, 'specs'),
    path.join(projectDir, 'openspec', 'specs'),
  ]

  let specDir = ''
  for (const p of possiblePaths) {
    try {
      const stat = await fs.stat(p)
      if (stat.isDirectory()) {
        specDir = p
        break
      }
    } catch {
      // Ignore missing path
    }
  }

  if (!specDir) return results

  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const hasSpecMd = entries.some((e) => e.isFile() && e.name === 'spec.md')

    if (hasSpecMd) {
      const specMdPath = path.join(dir, 'spec.md')
      const lockPath = path.join(dir, 'spec-lock.json')

      const content = await fs.readFile(specMdPath, 'utf8')
      const relPath = path.relative(specDir, dir).replaceAll('\\', '/')
      const capabilityName = relPath || path.basename(dir)
      const specId = `${targetWorkspace}:${capabilityName}`

      const titleMatch = /^#\s+(.+)$/m.exec(content)
      const title = titleMatch ? titleMatch[1]!.trim() : capabilityName

      let existingFiles: string[] = []
      let existingSymbols: string[] = []
      let existingDependsOn: string[] = []

      try {
        const lockContent = await fs.readFile(lockPath, 'utf8')
        const lockJson = JSON.parse(lockContent)
        if (Array.isArray(lockJson.implementation)) {
          for (const item of lockJson.implementation) {
            if (typeof item === 'string') {
              existingFiles.push(item)
            } else if (typeof item === 'object' && item !== null) {
              if (item.file) existingFiles.push(item.file)
              if (Array.isArray(item.symbols)) existingSymbols.push(...item.symbols)
            }
          }
        }
        if (Array.isArray(lockJson.dependsOn)) {
          existingDependsOn = lockJson.dependsOn.filter((d: unknown) => typeof d === 'string')
        }
      } catch {
        // No lockfile
      }

      results.push({
        spec: {
          specId,
          path: relPath,
          title,
          description: '',
          contentHash: '',
          content,
          dependsOn: existingDependsOn,
          workspace: targetWorkspace,
        },
        existing: {
          files: existingFiles,
          symbols: existingSymbols,
          dependsOn: existingDependsOn,
        },
      })
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name))
      }
    }
  }

  await walk(specDir)
  return results
}

async function main() {
  const args = process.argv.slice(2)
  let singleSpecId: string | null = null
  let isRandom = false
  let forceRebuildCache = false
  let targetWorkspace = 'default'
  let limit = 100
  let projectDir = process.cwd()

  for (const arg of args) {
    if (arg.startsWith('--config=')) {
      projectDir = path.resolve(process.cwd(), arg.replace('--config=', ''))
    } else if (arg.startsWith('--spec=')) {
      singleSpecId = arg.replace('--spec=', '')
      if (singleSpecId.includes(':')) {
        targetWorkspace = singleSpecId.split(':')[0] || 'default'
      }
    } else if (arg === '--rebuild-cache' || arg === '--force-rebuild') {
      forceRebuildCache = true
    } else if (arg.startsWith('--random=')) {
      isRandom = true
      limit = parseInt(arg.replace('--random=', ''), 10) || 5
    } else if (arg === '--random') {
      isRandom = true
    } else if (arg.includes(':')) {
      singleSpecId = arg
      targetWorkspace = singleSpecId.split(':')[0] || 'default'
    } else if (!isNaN(parseInt(arg, 10))) {
      limit = parseInt(arg, 10)
    } else {
      targetWorkspace = arg
    }
  }

  console.log(`\n📁 Project root: "${projectDir}"`)

  const cache = forceRebuildCache ? null : await loadCache(projectDir)
  if (cache) {
    console.log(`⚡ Loaded implementation cache from "${getCacheFilePath(projectDir)}" (${Object.keys(cache.specs).length} specs).`)
  } else if (forceRebuildCache) {
    console.log(`🔄 Rebuilding implementation cache from scratch...`)
  }

  const configLoader = await createDefaultConfigLoader({ startDir: projectDir })
  const config = await configLoader.load()
  const provider = createCodeGraphProvider(config)
  await provider.open()

  try {
    let allSpecs = await provider.getAllSpecs()
    let diskReadFallback = false

    if (allSpecs.length === 0) {
      console.log(`⚠️ Code-graph index is empty for "${projectDir}".`)
      console.log(`⚡ Indexing project graph on-the-fly using code-graph...`)
      try {
        await provider.index({ mode: 'full' })
        allSpecs = await provider.getAllSpecs()
      } catch (err) {
        console.warn(`Index failed: ${String(err)}. Falling back to direct disk read.`)
      }

      if (allSpecs.length === 0) {
        diskReadFallback = true
        console.log(`📂 Reading specs directly from filesystem in "${projectDir}"...`)
      }
    } else {
      console.log(`✅ Loaded ${allSpecs.length} indexed specs from existing code-graph database.`)
    }

    // Populate specsToAnalyze based on target workspace (or all specs across workspaces)
    let specsToAnalyze: Array<{ spec: SpecNode; existing?: ExistingImplementation }> = []

    if (diskReadFallback) {
      specsToAnalyze = await scanSpecsFromDisk(projectDir, targetWorkspace)
    } else {
      // Analyze all indexed specs across workspaces so cross-workspace file mapping is built
      specsToAnalyze = allSpecs.map((spec) => ({ spec }))
    }

    console.log(`\n================================================================================`)
    console.log(`🚀 PASS 1: SUGGESTING IMPLEMENTATIONS FOR ALL ${specsToAnalyze.length} SPECS IN "${targetWorkspace}"`)
    console.log(`================================================================================\n`)

    const results: SpecSuggestionResult[] = []
    const fileToSpecMap = new Map<string, { specId: string; title: string }>()
    const updatedCacheSpecs: CacheData['specs'] = cache ? { ...cache.specs } : {}

    for (const item of specsToAnalyze) {
      const spec = item.spec

      let existingFiles: string[] = item.existing?.files || []
      let existingSymbols: string[] = item.existing?.symbols || []
      let existingDependsOn: string[] = item.existing?.dependsOn || []

      if (!diskReadFallback) {
        const coveredFileRelations = await provider.getCoveredFiles(spec.specId)
        const coveredSymbolRelations = await provider.getCoveredSymbols(spec.specId)
        const specDepsRelations = await provider.getSpecDependencies(spec.specId)
        existingFiles = coveredFileRelations.map((r) => r.target)
        existingSymbols = coveredSymbolRelations.map((r) => r.target)
        existingDependsOn = specDepsRelations.map((r) => r.target)
      }

      let implementationSuggestions: ImplementationEntrySuggestion[] = []

      // Check cache first if available
      if (cache && cache.specs[spec.specId]) {
        implementationSuggestions = cache.specs[spec.specId]!.implementationSuggestions
      } else {
        const candidateSymbolsMap = new Map<string, CandidateSymbol>()

        // Strategy 1: Explicit Code Block AST Symbols
        console.log(`🔍 Analyzing spec "${spec.specId}" for code block symbols...`)
        const codeSymbols = extractCodeBlockSymbols(spec.content)
        for (const symbolCandidate of codeSymbols) {
          const hits = await provider.searchSymbols({ query: symbolCandidate })
          for (const hit of hits) {
            if (hit.symbol.name === symbolCandidate) {
              const key = hit.symbol.id
              const kindBonus = getKindBonus(hit.symbol.kind)
              if (!candidateSymbolsMap.has(key)) {
                candidateSymbolsMap.set(key, {
                  id: hit.symbol.id,
                  name: hit.symbol.name,
                  kind: hit.symbol.kind,
                  filePath: hit.symbol.filePath,
                  confidence: 'HIGH',
                  reason: `Explicit symbol '${hit.symbol.name}' (${hit.symbol.kind}) in spec code blocks`,
                  score: 150 + hit.score + kindBonus,
                })
              }
            }
          }
        }

        // Strategy 2: Naming Convention Derivatives
        console.log(`🔍 Analyzing spec "${spec.specId}" for naming convention derivatives...`)
        const derivedNames = deriveNameCandidates(spec.specId, spec.title)
        for (const derived of derivedNames) {
          const hits = await provider.searchSymbols({ query: derived })
          for (const hit of hits) {
            if (
              hit.symbol.name.toLowerCase() === derived.toLowerCase() ||
              hit.symbol.filePath.toLowerCase().includes(derived.toLowerCase())
            ) {
              const key = hit.symbol.id
              const kindBonus = getKindBonus(hit.symbol.kind)
              if (!candidateSymbolsMap.has(key)) {
                candidateSymbolsMap.set(key, {
                  id: hit.symbol.id,
                  name: hit.symbol.name,
                  kind: hit.symbol.kind,
                  filePath: hit.symbol.filePath,
                  confidence: 'MEDIUM',
                  reason: `Symbol/path matches spec pattern '${derived}' (${hit.symbol.kind})`,
                  score: 100 + hit.score + kindBonus,
                })
              }
            }
          }
        }

        // Strategy 3: BM25 Full-text search on Spec Title
        console.log(`🔍 Analyzing spec "${spec.specId}" for BM25 full-text search...`)
        const searchHits = await provider.searchSymbols({ query: spec.title })
        for (const hit of searchHits.slice(0, 5)) {
          const key = hit.symbol.id
          const kindBonus = getKindBonus(hit.symbol.kind)
          if (!candidateSymbolsMap.has(key)) {
            candidateSymbolsMap.set(key, {
              id: hit.symbol.id,
              name: hit.symbol.name,
              kind: hit.symbol.kind,
              filePath: hit.symbol.filePath,
              confidence: 'LOW',
              reason: `BM25 similarity with spec title "${spec.title}" (${hit.symbol.kind})`,
              score: 50 + hit.score + kindBonus,
            })
          }
        }

        // Strategy 4: Direct File Path Pattern Matching
        console.log(`🔍 Analyzing spec "${spec.specId}" for file path patterns...`)
        const baseSpecName = spec.specId.split(':').pop() || spec.specId
        const cleanSubName = baseSpecName.replace(/^(cli|core|opsx)-/, '')
        const slashPathName = cleanSubName.replaceAll('-', '/')
        const subWords = cleanSubName.split('-').filter((w) => w.length > 2)

        const searchQueries = [cleanSubName, ...subWords]
        for (const queryWord of searchQueries) {
          const fileHits = await provider.searchSymbols({ query: queryWord })
          for (const hit of fileHits) {
            const lowerFile = hit.symbol.filePath.toLowerCase()
            const isMatch =
              lowerFile.endsWith(`/${baseSpecName}.ts`) ||
              lowerFile.endsWith(`/${cleanSubName}.ts`) ||
              lowerFile.endsWith(`/${slashPathName}.ts`) ||
              lowerFile.includes(`/${cleanSubName}/`) ||
              lowerFile.includes(`/${slashPathName}/`) ||
              lowerFile.includes(`/commands/${cleanSubName}.ts`) ||
              lowerFile.includes(`/commands/${slashPathName}.ts`) ||
              lowerFile.includes(`/use-cases/${cleanSubName}.ts`)

            if (isMatch) {
              const key = hit.symbol.id
              const kindBonus = getKindBonus(hit.symbol.kind)
              const existingCand = candidateSymbolsMap.get(key)

              if (!existingCand) {
                candidateSymbolsMap.set(key, {
                  id: hit.symbol.id,
                  name: hit.symbol.name,
                  kind: hit.symbol.kind,
                  filePath: hit.symbol.filePath,
                  confidence: 'HIGH',
                  reason: `File path '${hit.symbol.filePath}' matches capability pattern '${slashPathName}'`,
                  score: 130 + hit.score + kindBonus,
                })
              } else {
                existingCand.confidence = 'HIGH'
                existingCand.score += 50
                existingCand.reason += ` + File path match '${slashPathName}'`
              }
            }
          }
        }

        // Group candidate symbols by implementation file (verifying file exists on disk)
        const fileGroupMap = new Map<string, { symbols: Set<string>; maxScore: number; confidence: 'HIGH' | 'MEDIUM' | 'LOW'; reasons: Set<string> }>()

        for (const cand of candidateSymbolsMap.values()) {
          const rawPath = cand.filePath.includes(':') ? cand.filePath.split(':')[1]! : cand.filePath
          const absPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(projectDir, rawPath)

          try {
            if (!fsSync.existsSync(absPath)) continue
          } catch {
            continue
          }

          const existing = fileGroupMap.get(cand.filePath)
          if (!existing) {
            fileGroupMap.set(cand.filePath, {
              symbols: new Set([cand.name]),
              maxScore: cand.score,
              confidence: cand.confidence,
              reasons: new Set([cand.reason]),
            })
          } else {
            if (cand.kind && ['interface', 'class', 'function', 'type', 'enum'].includes(cand.kind.toLowerCase())) {
              existing.symbols.add(cand.name)
            }
            existing.maxScore = Math.max(existing.maxScore, cand.score)
            existing.reasons.add(cand.reason)
            if (cand.confidence === 'HIGH') existing.confidence = 'HIGH'
          }
        }

        implementationSuggestions = [...fileGroupMap.entries()]
          .map(([filePath, data]) => ({
            file: filePath,
            symbols: [...data.symbols],
            confidence: data.confidence,
            reasons: [...data.reasons],
            score: data.maxScore,
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 2)

        // Cache the newly computed suggestion
        updatedCacheSpecs[spec.specId] = {
          specId: spec.specId,
          title: spec.title,
          implementationSuggestions,
        }
      }

      // Register implementation file mapping (using existing or top suggested file)
      if (existingFiles.length > 0) {
        for (const f of existingFiles) {
          const normF = normalizePathForMap(f, projectDir)
          if (normF) fileToSpecMap.set(normF, { specId: spec.specId, title: spec.title })
        }
      } else if (implementationSuggestions.length > 0) {
        const topF = implementationSuggestions[0]!.file
        const normF = normalizePathForMap(topF, projectDir)
        if (normF) fileToSpecMap.set(normF, { specId: spec.specId, title: spec.title })
      }

      results.push({
        specId: spec.specId,
        title: spec.title,
        workspace: spec.workspace,
        existing: {
          files: existingFiles,
          symbols: existingSymbols,
          dependsOn: existingDependsOn,
        },
        implementationSuggestions,
        suggestedDependsOn: [],
      })
    }

    // Save cache after Pass 1
    await saveCache(projectDir, updatedCacheSpecs)

    // Filter specs to process in Pass 2 (only target single spec or displayed specs to maximize performance)
    let targetResults = results
    if (singleSpecId) {
      targetResults = results.filter((r) => r.specId === singleSpecId)
    } else if (isRandom) {
      targetResults = shuffle(results).slice(0, limit)
    }

    console.log(`================================================================================`)
    console.log(`🔗 PASS 2: INFERRING SPEC-TO-SPEC DEPENDENCIES VIA CODE GRAPH FOR ${targetResults.length} SPECS`)
    console.log(`================================================================================\n`)

    const isTestFile = (f: string) => f.toLowerCase().includes('test/') || f.toLowerCase().includes('.test.ts') || f.toLowerCase().includes('.spec.ts')

    for (const res of targetResults) {
      const seenSpecDeps = new Set<string>()

      let targetImplFile = res.existing.files.find((f) => !isTestFile(f))

      if (!targetImplFile && res.implementationSuggestions.length > 0) {
        const topProdImpl = res.implementationSuggestions.find((s) => !isTestFile(s.file) && s.confidence !== 'LOW') || res.implementationSuggestions.find((s) => !isTestFile(s.file))
        if (topProdImpl && topProdImpl.confidence !== 'LOW') {
          targetImplFile = topProdImpl.file
        }
      }

      if (!targetImplFile) continue

      const cleanImplFile = targetImplFile.includes(':') ? targetImplFile.split(':')[1]! : targetImplFile

      try {
        const fileTargets = [targetImplFile, cleanImplFile, `cli:${cleanImplFile}`, `core:${cleanImplFile}`]
        for (const targetFile of fileTargets) {
          const impact = await provider.analyzeFileImpact(targetFile, 'upstream', 2)

          for (const affFile of impact.affectedFiles) {
            const normUpstream = normalizePathForMap(affFile, projectDir)
            const normCurrent = normalizePathForMap(cleanImplFile, projectDir)

            if (normUpstream && normUpstream !== normCurrent && !isTestFile(normUpstream)) {
              const coveredSpec = fileToSpecMap.get(normUpstream) || fileToSpecMap.get(affFile)
              if (coveredSpec && coveredSpec.specId !== res.specId && !seenSpecDeps.has(coveredSpec.specId)) {
                seenSpecDeps.add(coveredSpec.specId)
                res.suggestedDependsOn.push({
                  specId: coveredSpec.specId,
                  title: coveredSpec.title,
                  reason: `Production file '${cleanImplFile}' imports '${normUpstream}' (covered by spec '${coveredSpec.specId}')`,
                })
              }
            }
          }
        }
      } catch {
        // Ignore traversal errors
      }
    }

    // Print clean report & collect stats
    let totalAnalyzed = targetResults.length
    let totalLinked = 0
    let totalUnlinked = 0
    let highCount = 0
    let medCount = 0
    let lowCount = 0
    let noCandCount = 0

    for (const res of targetResults) {
      console.log(`================================================================================`)
      console.log(`📋 Spec: "${res.title}" (${res.specId})`)

      const existingFiles = res.existing?.files || []
      const existingSymbols = res.existing?.symbols || []
      const existingDeps = res.existing?.dependsOn || []

      const hasExisting = existingFiles.length > 0 || existingSymbols.length > 0 || existingDeps.length > 0
      if (hasExisting) {
        totalLinked++
        console.log(`   📌 Currently Registered in Spec-Lock:`)
        if (existingFiles.length > 0) console.log(`      Files:     [ ${existingFiles.map(f => `"${f}"`).join(', ')} ]`)
        if (existingSymbols.length > 0) console.log(`      Symbols:   [ ${existingSymbols.map(s => `"${s}"`).join(', ')} ]`)
        if (existingDeps.length > 0) console.log(`      DependsOn: [ ${existingDeps.map(d => `"${d}"`).join(', ')} ]`)
        else console.log(`      DependsOn: []`)
      } else {
        totalUnlinked++
        console.log(`   📌 Currently Registered in Spec-Lock: NONE (Unlinked)`)
      }

      console.log(`   💡 Script Suggested Implementation:`)
      if (res.implementationSuggestions.length === 0) {
        noCandCount++
        console.log(`      ⚠️ No candidate suggested`)
      } else {
        const topSug = res.implementationSuggestions[0]!
        if (topSug.confidence === 'HIGH') highCount++
        else if (topSug.confidence === 'MEDIUM') medCount++
        else lowCount++

        for (const sug of res.implementationSuggestions) {
          const badge = sug.confidence === 'HIGH' ? '🟢 [HIGH]' : sug.confidence === 'MEDIUM' ? '🟡 [MED]' : '⚪ [LOW]'
          console.log(`      ${badge} File: "${sug.file}"`)
          if (sug.symbols.length > 0) {
            console.log(`         Symbols: [ ${sug.symbols.map((s) => `"${s}"`).join(', ')} ]`)
          }
        }
      }

      if (res.suggestedDependsOn.length > 0) {
        console.log(`\n   🔗 Suggested Spec-to-Spec Dependencies (dependsOn):`)
        for (const dep of res.suggestedDependsOn) {
          console.log(`      • "${dep.specId}" (${dep.title})`)
          console.log(`        Reason: ${dep.reason}`)
        }
      } else {
        console.log(`\n   🔗 Suggested Spec-to-Spec Dependencies (dependsOn): [] (Independent spec)`)
      }
    }
    console.log(`================================================================================\n`)

    // Summary Statistics Header
    console.log(`📊 SUMMARY STATISTICS (${totalAnalyzed} Specs Displayed)`)
    console.log(`================================================================================`)
    console.log(`• Total Specs Displayed:      ${totalAnalyzed}`)
    console.log(`  ├── 📌 Already Linked Specs:  ${totalLinked} (${totalAnalyzed > 0 ? ((totalLinked / totalAnalyzed) * 100).toFixed(1) : 0}%)`)
    console.log(`  └── 🆕 Unlinked Specs:        ${totalUnlinked} (${totalAnalyzed > 0 ? ((totalUnlinked / totalAnalyzed) * 100).toFixed(1) : 0}%)`)
    console.log(``)
    console.log(`• Implementation Confidence Distribution:`)
    console.log(`  ├── 🟢 HIGH Confidence:       ${highCount} (${totalAnalyzed > 0 ? ((highCount / totalAnalyzed) * 100).toFixed(1) : 0}%)`)
    console.log(`  ├── 🟡 MEDIUM Confidence:     ${medCount} (${totalAnalyzed > 0 ? ((medCount / totalAnalyzed) * 100).toFixed(1) : 0}%)`)
    console.log(`  ├── ⚪ LOW Confidence:        ${lowCount} (${totalAnalyzed > 0 ? ((lowCount / totalAnalyzed) * 100).toFixed(1) : 0}%)`)
    console.log(`  └── ⚠️ No Candidate Found:    ${noCandCount} (${totalAnalyzed > 0 ? ((noCandCount / totalAnalyzed) * 100).toFixed(1) : 0}%)`)
    console.log(`================================================================================\n`)

  } finally {
    await provider.close()
  }
}

main().catch((err) => {
  console.error('Error executing PoC script:', err)
  process.exit(1)
})
