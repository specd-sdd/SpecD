import {
  type ArtifactAST,
  type ArtifactNode,
  type DeltaEntry,
  DeltaApplicationError,
} from '../../../application/ports/artifact-parser.js'
import { type Selector } from '../../../domain/value-objects/selector.js'

/** Internal context for a resolved node. */
interface NodeCtx {
  node: ArtifactNode
  parent: ArtifactNode | null
  indexInParent: number
  ancestors: readonly ArtifactNode[]
}

function matchesWhere(node: ArtifactNode, where: Readonly<Record<string, string>>): boolean {
  // The node is a sequence-item or array-item; look at its first child (mapping/object)
  const firstChild = node.children?.[0]
  if (!firstChild) return false

  // Get the key-value pairs from the child
  const pairs = firstChild.children ?? []

  for (const [key, pattern] of Object.entries(where)) {
    const pair = pairs.find((p) => p.label === key)
    if (!pair) return false
    const value = typeof pair.value === 'string' ? pair.value : String(pair.value ?? '')
    try {
      const regex = new RegExp(pattern, 'i')
      if (!regex.test(value)) return false
    } catch {
      if (!value.toLowerCase().includes(pattern.toLowerCase())) return false
    }
  }
  return true
}

function matchesSelector(ctx: NodeCtx, sel: Selector): boolean {
  if (ctx.node.type !== sel.type) return false

  if (sel.matches !== undefined) {
    const label = typeof ctx.node.label === 'string' ? ctx.node.label : ''
    try {
      const regex = new RegExp(sel.matches, 'i')
      if (!regex.test(label)) return false
    } catch {
      if (!label.toLowerCase().includes(sel.matches.toLowerCase())) return false
    }
  }

  if (sel.contains !== undefined) {
    const value = typeof ctx.node.value === 'string' ? ctx.node.value : String(ctx.node.value ?? '')
    try {
      const regex = new RegExp(sel.contains, 'i')
      if (!regex.test(value)) return false
    } catch {
      if (!value.toLowerCase().includes(sel.contains.toLowerCase())) return false
    }
  }

  if (sel.index !== undefined) {
    if (ctx.indexInParent !== sel.index) return false
  }

  if (sel.where !== undefined) {
    if (!matchesWhere(ctx.node, sel.where)) return false
  }

  if (sel.parent !== undefined) {
    // The nearest ancestor must match the parent selector
    // Build approximate contexts for ancestors
    const ancestorCtxs: NodeCtx[] = ctx.ancestors.map((node, i) => ({
      node,
      parent: i > 0 ? ctx.ancestors[i - 1]! : null,
      indexInParent: 0,
      ancestors: ctx.ancestors.slice(0, i),
    }))
    const found = ancestorCtxs.some((a) => matchesSelector(a, sel.parent!))
    if (!found) return false
  }

  return true
}

/** Resolves all nodes in the tree matching a selector. */
export function resolveNodes(root: ArtifactNode, selector: Selector): NodeCtx[] {
  const all: NodeCtx[] = []
  walkTree(root, null, 0, [], all)
  return all.filter((ctx) => matchesSelector(ctx, selector))
}

function walkTree(
  node: ArtifactNode,
  parent: ArtifactNode | null,
  indexInParent: number,
  ancestors: readonly ArtifactNode[],
  result: NodeCtx[],
): void {
  result.push({ node, parent, indexInParent, ancestors })
  if (node.children) {
    for (let i = 0; i < node.children.length; i++) {
      walkTree(node.children[i]!, node, i, [...ancestors, node], result)
    }
  }
}

function walkTreeForPaths(
  node: ArtifactNode,
  path: number[],
  ancestors: ArtifactNode[],
  result: Array<{ ctx: NodeCtx; path: number[] }>,
): void {
  const ctx: NodeCtx = {
    node,
    parent: ancestors.length > 0 ? ancestors[ancestors.length - 1]! : null,
    indexInParent: path.length > 0 ? path[path.length - 1]! : 0,
    ancestors,
  }
  result.push({ ctx, path: [...path] })
  if (node.children) {
    for (let i = 0; i < node.children.length; i++) {
      walkTreeForPaths(node.children[i]!, [...path, i], [...ancestors, node], result)
    }
  }
}

function getPathsMatchingSelector(root: ArtifactNode, selector: Selector): number[][] {
  const all: Array<{ ctx: NodeCtx; path: number[] }> = []
  walkTreeForPaths(root, [], [], all)
  return all.filter(({ ctx }) => matchesSelector(ctx, selector)).map(({ path }) => path)
}

function getNodeAtPath(root: ArtifactNode, path: readonly number[]): ArtifactNode {
  let node = root
  for (const idx of path) {
    node = node.children![idx]!
  }
  return node
}

function deepCloneNode(node: ArtifactNode): ArtifactNode {
  const clone: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith('_')) continue
    if (k === 'children' && Array.isArray(v)) {
      clone[k] = (v as ArtifactNode[]).map(deepCloneNode)
    } else {
      clone[k] = v
    }
  }
  return clone as ArtifactNode
}

function countPlacementHints(pos: NonNullable<DeltaEntry['position']>): number {
  let count = 0
  if (pos.after !== undefined) count++
  if (pos.before !== undefined) count++
  if (pos.first === true) count++
  if (pos.last === true) count++
  return count
}

function isArrayLike(node: ArtifactNode): boolean {
  const arrayTypes = ['array', 'sequence', 'list']
  if (arrayTypes.includes(node.type)) return true
  if (Array.isArray(node.value)) return true
  if (node.children && node.children.length > 0) {
    const itemTypes = ['array-item', 'sequence-item', 'list-item']
    // All-items check
    if (node.children.every((c) => itemTypes.some((t) => c.type === t))) return true
    // Single child that is an array/sequence/list (e.g. property wrapping an array)
    if (node.children.length === 1 && arrayTypes.includes(node.children[0]!.type)) return true
  }
  return false
}

function setChildren(node: ArtifactNode, newChildren: readonly ArtifactNode[]): ArtifactNode {
  const clone: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(node)) {
    if (k === 'children' || k === 'value') continue
    clone[k] = v
  }
  clone['children'] = newChildren
  return clone as ArtifactNode
}

function removeFromParentChildren(parent: ArtifactNode, indexInParent: number): ArtifactNode {
  const newChildren = [...(parent.children ?? [])]
  newChildren.splice(indexInParent, 1)
  return setChildren(parent, newChildren)
}

function updateNodeInTree(
  root: ArtifactNode,
  path: readonly number[],
  updater: (node: ArtifactNode) => ArtifactNode,
): ArtifactNode {
  if (path.length === 0) {
    return updater(root)
  }
  const [first, ...rest] = path as [number, ...number[]]
  const children = [...(root.children ?? [])]
  children[first] = updateNodeInTree(children[first]!, rest, updater)
  return setChildren(root, children)
}

/** Finds the index within children matching a selector, or -1 if not found. */
function findInChildren(children: readonly ArtifactNode[], sel: Selector): number {
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!
    const ctx: NodeCtx = {
      node: child,
      parent: null,
      indexInParent: i,
      ancestors: [],
    }
    if (matchesSelector(ctx, sel)) return i
  }
  return -1
}

/**
 * Applies a sequence of delta entries to an AST and returns a new AST.
 * All selectors are validated before any operation is applied.
 */
export function applyDelta(
  ast: ArtifactAST,
  delta: readonly DeltaEntry[],
  parseContent: (content: string) => ArtifactAST,
  valueToNode: (value: unknown, ctx: { nodeType: string; parentType: string }) => ArtifactNode,
): ArtifactAST {
  // Phase 1 — Validate structural rules and resolve selectors against ORIGINAL AST
  type ResolvedEntry = { entry: DeltaEntry; path: number[] }
  const resolvedModifiedRemoved: ResolvedEntry[] = []

  for (const entry of delta) {
    // content and value mutually exclusive
    if (entry.content !== undefined && entry.value !== undefined) {
      throw new DeltaApplicationError('Delta entry cannot have both `content` and `value`')
    }

    // added with selector is invalid
    if (entry.op === 'added' && entry.selector !== undefined) {
      throw new DeltaApplicationError(
        '`added` entries must not have a `selector`; use `position.parent` instead',
      )
    }

    // rename on added or removed is invalid
    if ((entry.op === 'added' || entry.op === 'removed') && entry.rename !== undefined) {
      throw new DeltaApplicationError(
        `\`rename\` is only valid on \`modified\` entries, not \`${entry.op}\``,
      )
    }

    // strategy: merge-by without mergeKey
    if (entry.strategy === 'merge-by' && entry.mergeKey === undefined) {
      throw new DeltaApplicationError('`strategy: merge-by` requires `mergeKey`')
    }

    // mergeKey without strategy: merge-by
    if (entry.mergeKey !== undefined && entry.strategy !== 'merge-by') {
      throw new DeltaApplicationError('`mergeKey` is only valid with `strategy: merge-by`')
    }

    // added with multiple placement hints
    if (entry.op === 'added' && entry.position !== undefined) {
      if (countPlacementHints(entry.position) > 1) {
        throw new DeltaApplicationError(
          '`added` entry has more than one placement hint (after/before/first/last)',
        )
      }
    }

    // selector.index and selector.where mutually exclusive
    if (entry.selector?.index !== undefined && entry.selector?.where !== undefined) {
      throw new DeltaApplicationError(
        '`selector.index` and `selector.where` are mutually exclusive',
      )
    }

    // For modified and removed: resolve selector against original AST
    if ((entry.op === 'modified' || entry.op === 'removed') && entry.selector !== undefined) {
      const paths = getPathsMatchingSelector(ast.root, entry.selector)

      if (paths.length === 0) {
        throw new DeltaApplicationError(
          `Selector resolved to no node: ${JSON.stringify(entry.selector)}`,
        )
      }
      if (paths.length > 1) {
        throw new DeltaApplicationError(
          `Selector is ambiguous — matched ${paths.length} nodes: ${JSON.stringify(entry.selector)}`,
        )
      }

      const path = paths[0]!
      resolvedModifiedRemoved.push({ entry, path })

      // For modified with rename: check no sibling already has that label
      if (entry.op === 'modified' && entry.rename !== undefined) {
        const parentPath = path.slice(0, -1)
        const parent = parentPath.length === 0 ? ast.root : getNodeAtPath(ast.root, parentPath)
        const myIndex = path[path.length - 1]!
        const siblings = parent.children ?? []
        const collision = siblings.some((s, i) => {
          if (i === myIndex) return false // skip self
          return s.label === entry.rename
        })
        if (collision) {
          throw new DeltaApplicationError(
            `Rename target "${entry.rename}" already exists as a sibling node`,
          )
        }
        // Check for collision with other rename targets in the same parent scope
        for (const other of resolvedModifiedRemoved) {
          if (other.entry === entry) continue
          if (other.entry.op !== 'modified' || other.entry.rename === undefined) continue
          const otherParentPath = other.path.slice(0, -1)
          const sameScope = JSON.stringify(otherParentPath) === JSON.stringify(parentPath)
          if (sameScope && other.entry.rename === entry.rename) {
            throw new DeltaApplicationError(
              `Two modified entries rename to the same target "${entry.rename}" within the same scope`,
            )
          }
        }
      }
    }

    // For added with position.parent: validate parent selector
    if (entry.op === 'added' && entry.position?.parent !== undefined) {
      const paths = getPathsMatchingSelector(ast.root, entry.position.parent)
      if (paths.length === 0) {
        throw new DeltaApplicationError(
          `position.parent selector resolved to no node: ${JSON.stringify(entry.position.parent)}`,
        )
      }
    }
  }

  // Check conflict: no two entries resolve to the same node
  for (let i = 0; i < resolvedModifiedRemoved.length; i++) {
    for (let j = i + 1; j < resolvedModifiedRemoved.length; j++) {
      const a = resolvedModifiedRemoved[i]!
      const b = resolvedModifiedRemoved[j]!
      if (JSON.stringify(a.path) === JSON.stringify(b.path)) {
        throw new DeltaApplicationError(
          `Two delta entries resolve to the same node at path ${JSON.stringify(a.path)}`,
        )
      }
    }
  }

  // Phase 2 — Check strategy validity
  for (const entry of delta) {
    if (
      entry.strategy !== undefined &&
      (entry.op === 'modified' || entry.op === 'removed') &&
      entry.selector !== undefined
    ) {
      const res = resolvedModifiedRemoved.find((r) => r.entry === entry)
      if (res) {
        const node = getNodeAtPath(ast.root, res.path)
        if (!isArrayLike(node)) {
          throw new DeltaApplicationError(
            `\`strategy\` is only valid on array/sequence/list nodes, but got type "${node.type}"`,
          )
        }
      }
    }
  }

  // Phase 3 — Deep clone the AST root
  let newRoot = deepCloneNode(ast.root)

  // Phase 4 — Apply in declaration order (re-resolve selectors against mutating tree)
  for (const entry of delta) {
    if (entry.op === 'removed') {
      const paths = getPathsMatchingSelector(newRoot, entry.selector!)
      if (paths.length !== 1) {
        throw new DeltaApplicationError(
          `Could not re-resolve selector during apply: ${JSON.stringify(entry.selector)}`,
        )
      }
      const path = paths[0]!
      const parentPath = path.slice(0, -1)
      const idx = path[path.length - 1]!
      newRoot = updateNodeInTree(newRoot, parentPath, (parent) =>
        removeFromParentChildren(parent, idx),
      )
    } else if (entry.op === 'modified') {
      const paths = getPathsMatchingSelector(newRoot, entry.selector!)
      if (paths.length !== 1) {
        throw new DeltaApplicationError(
          `Could not re-resolve selector during apply: ${JSON.stringify(entry.selector)}`,
        )
      }
      const path = paths[0]!

      newRoot = updateNodeInTree(newRoot, path, (node) => {
        let updated = node

        // Apply rename
        if (entry.rename !== undefined) {
          const clone: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(updated)) {
            clone[k] = v
          }
          clone['label'] = entry.rename
          updated = clone as ArtifactNode
        }

        // Apply content: parse and replace children (body only — identifier preserved/renamed above)
        if (entry.content !== undefined) {
          const parsed = parseContent(entry.content)
          const bodyChildren = parsed.root.children ?? []
          updated = setChildren(updated, bodyChildren)
        }

        // Apply value
        if (entry.value !== undefined) {
          const parentPath = path.slice(0, -1)
          const parentNode = parentPath.length === 0 ? newRoot : getNodeAtPath(newRoot, parentPath)
          const strategy = entry.strategy ?? 'replace'

          if (strategy === 'replace') {
            const newNode = valueToNode(entry.value, {
              nodeType: updated.type,
              parentType: parentNode.type,
            })
            const clone: Record<string, unknown> = {}
            for (const [k, v] of Object.entries(updated)) {
              if (k !== 'value' && k !== 'children') clone[k] = v
            }
            if (newNode.children !== undefined) {
              clone['children'] = newNode.children
            } else {
              clone['value'] = newNode.value
            }
            updated = clone as ArtifactNode
          } else if (strategy === 'append') {
            const newNode = valueToNode(entry.value, {
              nodeType: updated.type,
              parentType: parentNode.type,
            })
            const newItems = newNode.children ?? []
            // If node is a wrapper (e.g. property containing array), apply to inner array
            const innerArray = getInnerArrayNode(updated)
            if (innerArray) {
              const merged = setChildren(innerArray, [...(innerArray.children ?? []), ...newItems])
              updated = setChildren(updated, [merged])
            } else {
              const existingChildren = updated.children ?? []
              updated = setChildren(updated, [...existingChildren, ...newItems])
            }
          } else if (strategy === 'merge-by') {
            const mergeKey = entry.mergeKey!
            const newNode = valueToNode(entry.value, {
              nodeType: updated.type,
              parentType: parentNode.type,
            })
            const newItems = newNode.children ?? []
            // If node is a wrapper, apply to inner array
            const innerArray = getInnerArrayNode(updated)
            const existingChildren = [...((innerArray ?? updated).children ?? [])]

            // Build map of new items by mergeKey value
            const newItemMap = new Map<string, ArtifactNode>()
            for (const item of newItems) {
              const keyVal = getMergeKeyValue(item, mergeKey)
              if (keyVal !== null) {
                newItemMap.set(keyVal, item)
              }
            }

            // Merge existing: replace matched, preserve unmatched
            const result: ArtifactNode[] = []
            for (const existing of existingChildren) {
              const keyVal = getMergeKeyValue(existing, mergeKey)
              if (keyVal !== null && newItemMap.has(keyVal)) {
                result.push(newItemMap.get(keyVal)!)
                newItemMap.delete(keyVal)
              } else {
                result.push(existing)
              }
            }

            // Append items with new keys
            for (const newItem of newItemMap.values()) {
              result.push(newItem)
            }

            if (innerArray) {
              const merged = setChildren(innerArray, result)
              updated = setChildren(updated, [merged])
            } else {
              updated = setChildren(updated, result)
            }
          }
        }

        return updated
      })
    } else if (entry.op === 'added') {
      // Determine parent scope path
      let scopePath: number[] = []

      if (entry.position?.parent !== undefined) {
        const paths = getPathsMatchingSelector(newRoot, entry.position.parent)
        if (paths.length === 0) {
          throw new DeltaApplicationError(
            `position.parent could not be re-resolved: ${JSON.stringify(entry.position.parent)}`,
          )
        }
        scopePath = paths[0]!
      }

      // Build new node
      let newNode: ArtifactNode
      if (entry.content !== undefined) {
        const parsed = parseContent(entry.content)
        // For added, content starts with the identifying line — take first child
        const firstChild = parsed.root.children?.[0]
        if (firstChild !== undefined) {
          newNode = firstChild
        } else {
          newNode = parsed.root
        }
      } else if (entry.value !== undefined) {
        const scopeNode = scopePath.length === 0 ? newRoot : getNodeAtPath(newRoot, scopePath)
        newNode = valueToNode(entry.value, {
          nodeType: 'unknown',
          parentType: scopeNode.type,
        })
      } else {
        throw new DeltaApplicationError('`added` entry must have either `content` or `value`')
      }

      // Determine insertion point and insert
      newRoot = updateNodeInTree(newRoot, scopePath, (scopeNode) => {
        const children = [...(scopeNode.children ?? [])]
        const pos = entry.position

        if (pos?.first === true) {
          children.unshift(newNode)
        } else if (pos?.after !== undefined) {
          const idx = findInChildren(children, pos.after)
          if (idx === -1) {
            // Fallback: append at end
            children.push(newNode)
          } else {
            children.splice(idx + 1, 0, newNode)
          }
        } else if (pos?.before !== undefined) {
          const idx = findInChildren(children, pos.before)
          if (idx === -1) {
            children.push(newNode)
          } else {
            children.splice(idx, 0, newNode)
          }
        } else {
          // last or no hint: append
          children.push(newNode)
        }

        return setChildren(scopeNode, children)
      })
    }
  }

  return { root: newRoot }
}

/** Extracts the merge key value from an item node (sequence-item / array-item). */
function getMergeKeyValue(item: ArtifactNode, mergeKey: string): string | null {
  // Item may have children containing a mapping/object node with pairs/properties
  const inner = item.children?.[0]
  if (!inner) return null
  const pair = inner.children?.find((c) => c.label === mergeKey)
  if (!pair) return null
  return typeof pair.value === 'string' ? pair.value : String(pair.value ?? '')
}

/**
 * If a node is a wrapper (e.g. property or pair) with a single array/sequence/list child,
 * returns that inner array node. Otherwise returns null.
 */
function getInnerArrayNode(node: ArtifactNode): ArtifactNode | null {
  const arrayTypes = ['array', 'sequence', 'list']
  if (node.children?.length === 1 && arrayTypes.includes(node.children[0]!.type)) {
    return node.children[0]!
  }
  return null
}
