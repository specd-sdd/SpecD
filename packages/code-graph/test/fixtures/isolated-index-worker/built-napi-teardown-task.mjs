import { Lang, parse } from '@ast-grep/napi'

function visit(node) {
  node.kind()
  node.text()
  for (const child of node.children()) visit(child)
}

/**
 * Exercises the native AST ownership pattern used by a full graph-index run.
 * The worker must deliver its result and then exit naturally without a native
 * finalizer crash.
 */
export async function runGraphIndexTask(input) {
  const count = Number(input.count)
  const roots = []
  for (let index = 0; index < count; index++) {
    const root = parse(
      Lang.TypeScript,
      `export interface Contract${index} { run(value: string): Promise<string> }
export class Service${index} implements Contract${index} {
  async run(value: string): Promise<string> { return value }
}`,
    )
    visit(root.root())
    roots.push(root)
  }
  roots.length = 0
  return { parsed: count }
}
