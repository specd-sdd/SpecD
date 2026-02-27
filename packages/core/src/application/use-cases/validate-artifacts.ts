import { createHash } from 'crypto'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { SchemaNotFoundError } from '../errors/schema-not-found-error.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type SchemaRegistry } from '../ports/schema-registry.js'
import {
  type ArtifactParser,
  type ArtifactParserRegistry,
  type ArtifactNode,
  DeltaApplicationError,
} from '../ports/artifact-parser.js'
import { type GitAdapter } from '../ports/git-adapter.js'
import {
  type GitIdentity,
  type SpecApprovedEvent,
  type SignedOffEvent,
} from '../../domain/entities/change.js'
import {
  type ValidationRule,
  type PreHashCleanup,
} from '../../domain/value-objects/validation-rule.js'
import { type Selector } from '../../domain/value-objects/selector.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'

/** Input for the {@link ValidateArtifacts} use case. */
export interface ValidateArtifactsInput {
  /** The change name to validate. */
  name: string
  /**
   * The spec path to validate — must be one of `change.specIds`.
   * Encoded as `<workspace>/<capability-path>` (e.g. `"default/auth/oauth"`).
   */
  specPath: string
  /** The schema reference string from `specd.yaml`. */
  schemaRef: string
  /** Resolved workspace-to-schemas-path map, passed through to `SchemaRegistry.resolve()`. */
  workspaceSchemasPaths: ReadonlyMap<string, string>
}

/** A single validation failure — missing artifact, failed rule, or application error. */
export interface ValidationFailure {
  /** The artifact type ID this failure pertains to. */
  artifactId: string
  /** Human-readable description suitable for CLI output. */
  description: string
}

/** A non-fatal rule mismatch (`required: false` rule that was absent). */
export interface ValidationWarning {
  /** The artifact type ID this warning pertains to. */
  artifactId: string
  /** Human-readable description suitable for CLI output. */
  description: string
}

/** Result returned by {@link ValidateArtifacts.execute}. */
export interface ValidateArtifactsResult {
  /**
   * `true` only if all required artifacts are present and all validations
   * pass with no errors.
   */
  passed: boolean
  /** One entry per failed rule, missing artifact, or `DeltaApplicationError`. */
  failures: ValidationFailure[]
  /** One entry per `required: false` rule that was absent. */
  warnings: ValidationWarning[]
}

/**
 * Validates a change's artifact files against the active schema and marks them
 * complete. The only path through which an artifact may reach `complete` status.
 *
 * Enforces required artifacts, validates structural rules, detects delta
 * conflicts, and invalidates any outstanding approval when artifact content has
 * changed since the approval was recorded.
 */
export class ValidateArtifacts {
  private readonly _changes: ChangeRepository
  private readonly _specs: ReadonlyMap<string, SpecRepository>
  private readonly _schemas: SchemaRegistry
  private readonly _parsers: ArtifactParserRegistry
  private readonly _git: GitAdapter

  /**
   * @param changes - Repository for loading and persisting the change
   * @param specs - Spec repositories keyed by workspace name
   * @param schemas - Registry for resolving schema references
   * @param parsers - Registry of artifact format parsers
   * @param git - Adapter for resolving the actor identity
   */
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    schemas: SchemaRegistry,
    parsers: ArtifactParserRegistry,
    git: GitAdapter,
  ) {
    this._changes = changes
    this._specs = specs
    this._schemas = schemas
    this._parsers = parsers
    this._git = git
  }

  /**
   * Executes the use case.
   *
   * @param input - Validation parameters
   * @returns Validation result with passed flag, failures, and warnings
   * @throws {ChangeNotFoundError} If no change with the given name exists
   * @throws {SchemaNotFoundError} If the schema reference cannot be resolved
   */
  async execute(input: ValidateArtifactsInput): Promise<ValidateArtifactsResult> {
    const change = await this._changes.get(input.name)
    if (change === null) throw new ChangeNotFoundError(input.name)

    const schema = await this._schemas.resolve(input.schemaRef, input.workspaceSchemasPaths)
    if (schema === null) throw new SchemaNotFoundError(input.schemaRef)

    const actor: GitIdentity = await this._git.identity()
    const failures: ValidationFailure[] = []
    const warnings: ValidationWarning[] = []

    const slashIdx = input.specPath.indexOf('/')
    const workspace = slashIdx >= 0 ? input.specPath.slice(0, slashIdx) : input.specPath
    const capabilityPath = slashIdx >= 0 ? input.specPath.slice(slashIdx + 1) : ''
    const specRepo = this._specs.get(workspace)

    // --- Required artifacts check ---
    for (const artifactType of schema.artifacts()) {
      if (!artifactType.optional() && change.effectiveStatus(artifactType.id()) === 'missing') {
        failures.push({
          artifactId: artifactType.id(),
          description: `Required artifact '${artifactType.id()}' is missing`,
        })
      }
    }

    // --- Approval invalidation check ---
    const approval: SpecApprovedEvent | undefined = change.activeSpecApproval
    const signoff: SignedOffEvent | undefined = change.activeSignoff
    if (approval !== undefined || signoff !== undefined) {
      let invalidated = false
      for (const artifactType of schema.artifacts()) {
        if (invalidated) break
        const changeArtifact = change.getArtifact(artifactType.id())
        if (
          changeArtifact === null ||
          changeArtifact.status === 'missing' ||
          changeArtifact.status === 'skipped'
        ) {
          continue
        }
        const artifactFile = await this._changes.artifact(change, changeArtifact.filename)
        if (artifactFile === null) continue
        const cleanedContent = this._applyCleanup(
          artifactFile.content,
          artifactType.preHashCleanup(),
        )
        const cleanedHash = this._sha256(cleanedContent)
        const approvalHash = approval?.artifactHashes[artifactType.id()]
        const signoffHash = signoff?.artifactHashes[artifactType.id()]
        if (
          (approvalHash !== undefined && approvalHash !== cleanedHash) ||
          (signoffHash !== undefined && signoffHash !== cleanedHash)
        ) {
          change.invalidate('artifact-change', actor)
          invalidated = true
        }
      }
    }

    // --- Per-artifact validation ---
    for (const artifactType of schema.artifacts()) {
      const effectiveStatus = change.effectiveStatus(artifactType.id())
      if (effectiveStatus === 'skipped' || effectiveStatus === 'missing') continue

      const blockedBy = artifactType.requires().find((reqId) => {
        const depStatus = change.effectiveStatus(reqId)
        return depStatus !== 'complete' && depStatus !== 'skipped'
      })
      if (blockedBy !== undefined) {
        failures.push({
          artifactId: artifactType.id(),
          description: `Artifact '${artifactType.id()}' is blocked by incomplete dependency '${blockedBy}'`,
        })
        continue
      }

      const changeArtifact = change.getArtifact(artifactType.id())
      if (changeArtifact === null) continue
      const artifactFile = await this._changes.artifact(change, changeArtifact.filename)
      if (artifactFile === null) continue

      const format = artifactType.format() ?? this._inferFormat(changeArtifact.filename)
      const parser = format !== undefined ? this._parsers.get(format) : undefined
      const yamlParser = this._parsers.get('yaml')

      let validationContent = artifactFile.content
      let artifactFailed = false

      // --- Delta processing ---
      if (artifactType.delta()) {
        const deltaFilename =
          capabilityPath.length > 0
            ? `deltas/${workspace}/${capabilityPath}/${changeArtifact.filename}.delta.yaml`
            : `deltas/${workspace}/${changeArtifact.filename}.delta.yaml`
        const deltaFile = await this._changes.artifact(change, deltaFilename)

        if (deltaFile !== null) {
          if (artifactType.deltaValidations().length > 0 && yamlParser !== undefined) {
            const deltaAST = yamlParser.parse(deltaFile.content)
            const result = this._evaluateRules(
              artifactType.deltaValidations(),
              deltaAST.root,
              artifactType.id(),
              yamlParser,
            )
            failures.push(...result.failures)
            warnings.push(...result.warnings)
            if (result.failures.length > 0) artifactFailed = true
          }

          if (!artifactFailed && parser !== undefined && yamlParser !== undefined) {
            if (specRepo !== undefined && capabilityPath.length > 0) {
              try {
                const specPath = SpecPath.parse(capabilityPath)
                const spec = await specRepo.get(specPath)
                if (spec !== null) {
                  const baseArtifact = await specRepo.artifact(spec, changeArtifact.filename)
                  if (baseArtifact !== null) {
                    const baseAST = parser.parse(baseArtifact.content)
                    const deltaEntries = yamlParser.parseDelta(deltaFile.content)
                    const mergedAST = parser.apply(baseAST, deltaEntries)
                    validationContent = parser.serialize(mergedAST)
                  }
                }
              } catch (err) {
                if (err instanceof DeltaApplicationError) {
                  failures.push({
                    artifactId: artifactType.id(),
                    description: `Delta application failed: ${err.message}`,
                  })
                  artifactFailed = true
                } else {
                  throw err
                }
              }
            }
          }
        }
      }

      // --- Structural validation ---
      if (!artifactFailed && artifactType.validations().length > 0 && parser !== undefined) {
        const ast = parser.parse(validationContent)
        const result = this._evaluateRules(
          artifactType.validations(),
          ast.root,
          artifactType.id(),
          parser,
        )
        failures.push(...result.failures)
        warnings.push(...result.warnings)
        if (result.failures.length > 0) artifactFailed = true
      }

      // --- Mark complete ---
      if (!artifactFailed) {
        const cleanedContent = this._applyCleanup(
          artifactFile.content,
          artifactType.preHashCleanup(),
        )
        changeArtifact.markComplete(this._sha256(cleanedContent))
      }
    }

    await this._changes.save(change)
    return { passed: failures.length === 0, failures, warnings }
  }

  private _sha256(content: string): string {
    return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`
  }

  private _applyCleanup(content: string, cleanups: readonly PreHashCleanup[]): string {
    let result = content
    for (const cleanup of cleanups) {
      result = result.replace(new RegExp(cleanup.pattern, 'g'), cleanup.replacement)
    }
    return result
  }

  private _inferFormat(filename: string): string | undefined {
    const parts = filename.split('.')
    const ext = parts[parts.length - 1]
    if (ext === 'md') return 'markdown'
    if (ext === 'json') return 'json'
    if (ext === 'yaml' || ext === 'yml') return 'yaml'
    if (ext === 'txt') return 'plaintext'
    return undefined
  }

  private _evaluateRules(
    rules: readonly ValidationRule[],
    root: ArtifactNode,
    artifactId: string,
    parser: ArtifactParser,
  ): { failures: ValidationFailure[]; warnings: ValidationWarning[] } {
    const failures: ValidationFailure[] = []
    const warnings: ValidationWarning[] = []
    for (const rule of rules) {
      this._evaluateRule(rule, root, artifactId, parser, failures, warnings)
    }
    return { failures, warnings }
  }

  private _evaluateRule(
    rule: ValidationRule,
    root: ArtifactNode,
    artifactId: string,
    parser: ArtifactParser,
    failures: ValidationFailure[],
    warnings: ValidationWarning[],
  ): void {
    const nodes = this._selectNodes(root, rule)
    if (nodes.length === 0) {
      const desc = JSON.stringify(rule.selector ?? rule.path ?? {})
      if (rule.required === true) {
        failures.push({ artifactId, description: `Required rule not satisfied: ${desc}` })
      } else if (rule.required === false) {
        warnings.push({ artifactId, description: `Optional rule not satisfied: ${desc}` })
      }
      return
    }
    for (const node of nodes) {
      if (rule.contentMatches !== undefined) {
        const serialized = parser.renderSubtree(node)
        if (!new RegExp(rule.contentMatches).test(serialized)) {
          failures.push({
            artifactId,
            description: `Node content does not match pattern '${rule.contentMatches}'`,
          })
        }
      }
      if (rule.children !== undefined) {
        for (const childRule of rule.children) {
          this._evaluateRule(childRule, node, artifactId, parser, failures, warnings)
        }
      }
    }
  }

  private _selectNodes(root: ArtifactNode, rule: ValidationRule): ArtifactNode[] {
    if (rule.path !== undefined) return this._selectByJsonPath(root, rule.path)
    if (rule.selector !== undefined) return this._selectBySelector(root, rule.selector)
    return [root]
  }

  private _selectBySelector(root: ArtifactNode, selector: Selector): ArtifactNode[] {
    if (selector.parent !== undefined) {
      const parentNodes = this._selectBySelector(root, selector.parent)
      const result: ArtifactNode[] = []
      for (const parentNode of parentNodes) {
        const children = parentNode.children ?? []
        result.push(...children.filter((child) => this._nodeMatches(child, selector)))
      }
      if (selector.index !== undefined) {
        const node = result[selector.index]
        return node !== undefined ? [node] : []
      }
      return result
    }
    const all = this._collectNodes(root)
    const matched = all.filter((node) => this._nodeMatches(node, selector))
    if (selector.index !== undefined) {
      const node = matched[selector.index]
      return node !== undefined ? [node] : []
    }
    return matched
  }

  private _nodeMatches(node: ArtifactNode, selector: Selector): boolean {
    if (node.type !== selector.type) return false
    if (selector.matches !== undefined) {
      const re = new RegExp(selector.matches)
      const labelOk = node.label !== undefined && re.test(node.label)
      const valueOk = node.value !== undefined && re.test(String(node.value))
      if (!labelOk && !valueOk) return false
    }
    if (selector.contains !== undefined) {
      const sub = selector.contains
      const labelOk = node.label !== undefined && node.label.includes(sub)
      const valueOk = node.value !== undefined && String(node.value).includes(sub)
      if (!labelOk && !valueOk) return false
    }
    if (selector.where !== undefined) {
      for (const [k, v] of Object.entries(selector.where)) {
        const nodeVal = (node as Record<string, unknown>)[k]
        if (String(nodeVal) !== v) return false
      }
    }
    return true
  }

  private _collectNodes(root: ArtifactNode): ArtifactNode[] {
    const result: ArtifactNode[] = [root]
    if (root.children !== undefined) {
      for (const child of root.children) {
        result.push(...this._collectNodes(child))
      }
    }
    return result
  }

  private _selectByJsonPath(root: ArtifactNode, path: string): ArtifactNode[] {
    if (path === '$') return [root]
    const tokens = this._tokenizeJsonPath(path)
    let current: unknown[] = [root]
    for (const token of tokens) {
      const next: unknown[] = []
      if (token === '$') {
        current = [root]
        continue
      }
      if (token.startsWith('..')) {
        const field = token.slice(2)
        for (const node of current) next.push(...this._recursiveCollect(node, field))
      } else if (token.startsWith('.')) {
        const field = token.slice(1)
        for (const node of current) {
          if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
            const val = (node as Record<string, unknown>)[field]
            if (val !== undefined) next.push(val)
          }
        }
      } else if (token === '[*]') {
        for (const node of current) {
          if (Array.isArray(node)) {
            for (const item of node as unknown[]) next.push(item)
          }
        }
      } else if (/^\[\d+\]$/.test(token)) {
        const idx = parseInt(token.slice(1, -1), 10)
        for (const node of current) {
          if (Array.isArray(node) && node[idx] !== undefined) next.push(node[idx])
        }
      }
      current = next
    }
    return current.filter(
      (n): n is ArtifactNode =>
        n !== null &&
        typeof n === 'object' &&
        !Array.isArray(n) &&
        typeof (n as Record<string, unknown>)['type'] === 'string',
    )
  }

  private _tokenizeJsonPath(path: string): string[] {
    const tokens: string[] = []
    let i = 0
    while (i < path.length) {
      if (path[i] === '$') {
        tokens.push('$')
        i++
      } else if (path[i] === '.' && path[i + 1] === '.') {
        const rest = path.slice(i + 2)
        const dotIdx = rest.indexOf('.')
        const brIdx = rest.indexOf('[')
        const stop =
          dotIdx === -1 && brIdx === -1
            ? rest.length
            : dotIdx === -1
              ? brIdx
              : brIdx === -1
                ? dotIdx
                : Math.min(dotIdx, brIdx)
        tokens.push('..' + rest.slice(0, stop))
        i += 2 + stop
      } else if (path[i] === '.') {
        const rest = path.slice(i + 1)
        const dotIdx = rest.indexOf('.')
        const brIdx = rest.indexOf('[')
        const stop =
          dotIdx === -1 && brIdx === -1
            ? rest.length
            : dotIdx === -1
              ? brIdx
              : brIdx === -1
                ? dotIdx
                : Math.min(dotIdx, brIdx)
        tokens.push('.' + rest.slice(0, stop))
        i += 1 + stop
      } else if (path[i] === '[') {
        const close = path.indexOf(']', i)
        tokens.push(path.slice(i, close + 1))
        i = close + 1
      } else {
        i++
      }
    }
    return tokens
  }

  private _recursiveCollect(node: unknown, field: string): unknown[] {
    const result: unknown[] = []
    if (node === null || typeof node !== 'object') return result
    if (Array.isArray(node)) {
      for (const item of node) result.push(...this._recursiveCollect(item, field))
      return result
    }
    const obj = node as Record<string, unknown>
    if (obj[field] !== undefined) result.push(obj[field])
    for (const val of Object.values(obj)) result.push(...this._recursiveCollect(val, field))
    return result
  }
}
