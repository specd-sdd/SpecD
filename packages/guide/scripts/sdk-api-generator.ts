import * as fs from 'node:fs'
import * as path from 'node:path'
import { extractSections } from './guide-bundler.js'
import { formatGeneratedBody } from './markdown-formatter.js'
import type { GuideTopic } from '../src/domain/models/index.js'

/**
 * Minimal shape of one curated public API entry point, mirroring the public site's
 * `apiPackageEntryPoints` declaration.
 */
export interface ApiEntryPoint {
  readonly id: string
  readonly packageName: string
  readonly entryPoint: string
}

/**
 * Reflection kind identifiers that become individually addressable guide topics.
 *
 * These are the declaration kinds an extension author looks up by name, so each one
 * becomes its own topic instead of being folded into a package index. `typeOnly` marks
 * the kinds that have no value form and must therefore be imported with `import type`.
 */
const ADDRESSABLE_KINDS: readonly {
  kind: number
  kindName: string
  directory: string
  order: number
  typeOnly: boolean
}[] = [
  { kind: 128, kindName: 'Class', directory: 'classes', order: 0, typeOnly: false },
  { kind: 256, kindName: 'Interface', directory: 'interfaces', order: 1, typeOnly: true },
  { kind: 512, kindName: 'Enumeration', directory: 'enumerations', order: 2, typeOnly: false },
  { kind: 64, kindName: 'Function', directory: 'functions', order: 3, typeOnly: false },
  { kind: 16, kindName: 'Type alias', directory: 'types', order: 4, typeOnly: true },
  { kind: 32, kindName: 'Variable', directory: 'variables', order: 5, typeOnly: false },
]

/**
 * TypeDoc member kinds the renderer distinguishes.
 *
 * A constructor and a method are both callable, so their signatures live on
 * `signatures[0]`; a property carries its type directly. An accessor is neither: a getter has
 * no `type` of its own and keeps its signature on `getSignature`, which is why reading only
 * `member.type` silently dropped every getter in the catalog. Branching on the member kind
 * keeps the callable members apart without having to guess from the shape of the member.
 */
const KIND_CONSTRUCTOR = 512
const KIND_METHOD = 2048

/**
 * Structural view of a TypeDoc type reference, whose rendered text is the declaration as
 * written. Only the printed form is needed, so the view stops at `toString`.
 */
interface TypeLike {
  toString(): string
}

/**
 * Structural view of a TypeDoc comment: its prose plus its block tags.
 *
 * `@param` text is split off onto the matching parameter reflection by TypeDoc, but
 * `@returns`, `@throws` and `@example` stay in the block tags, so both halves are read.
 */
interface CommentLike {
  readonly summary?: ReadonlyArray<{ readonly text: string }>
  readonly blockTags?: ReadonlyArray<{
    readonly tag: string
    readonly content?: ReadonlyArray<{ readonly text: string }>
  }>
}

/** Structural view of the modifiers a declaration carries. */
interface FlagsLike {
  readonly isOptional?: boolean
  readonly isRest?: boolean
  readonly isConst?: boolean
  readonly isStatic?: boolean
}

/** Structural view of a declared parameter or type parameter. */
interface ParameterLike {
  readonly name: string
  readonly type?: TypeLike
  readonly flags?: FlagsLike
  readonly comment?: CommentLike
}

/** Structural view of a call signature, on a function, constructor or method. */
interface SignatureLike {
  readonly name?: string
  readonly comment?: CommentLike
  readonly parameters?: ReadonlyArray<ParameterLike>
  readonly typeParameters?: ReadonlyArray<ParameterLike>
  readonly type?: TypeLike
}

/** Structural view of a declared member: a property, an enumerant, or a method. */
interface MemberLike {
  readonly name: string
  readonly kind: number
  readonly flags?: FlagsLike
  readonly comment?: CommentLike
  readonly type?: TypeLike
  readonly signatures?: ReadonlyArray<SignatureLike>
  readonly getSignature?: SignatureLike
  readonly setSignature?: SignatureLike
}

/**
 * Minimal structural view of the TypeDoc reflection the generator consumes.
 *
 * The view carries the whole declaration shape — signatures, parameters, member types and
 * inherited types — because the topic body is the caller's only view of the symbol. A
 * reflection reduced to its name and summary describes what a symbol is for but not how it
 * is called, which leaves a caller without code access unable to use it at all.
 */
interface FlatReflection {
  readonly name: string
  readonly kind: number
  readonly flags?: FlagsLike
  readonly sources?: ReadonlyArray<SourceLike>
  readonly comment?: CommentLike
  readonly children?: ReadonlyArray<MemberLike>
  readonly signatures?: ReadonlyArray<SignatureLike>
  readonly type?: TypeLike
  readonly extendedTypes?: ReadonlyArray<TypeLike>
}

/**
 * Structural typing for a TypeDoc source reference.
 */
interface SourceLike {
  readonly fileName?: string
  readonly fullFileName?: string
}

/**
 * Loads the curated public API entry points declared by the public web app.
 *
 * The bundler reads the same curated list the public site uses, so the generated
 * guide catalog and the published API reference never drift apart.
 *
 * @param repoRoot - Repository root.
 * @returns The curated entry points.
 * @throws Error When the configuration module cannot be read or parsed.
 */
export function loadApiEntryPoints(repoRoot: string): readonly ApiEntryPoint[] {
  const configPath = path.join(repoRoot, 'apps/public-web/src/lib/public-docs-config.ts')
  if (!fs.existsSync(configPath)) {
    throw new Error(`Public docs configuration '${configPath}' does not exist`)
  }

  const source = fs.readFileSync(configPath, 'utf-8')
  const block = source.match(/export const apiPackageEntryPoints\s*=\s*\[([\s\S]*?)\]\s*as const/s)
  if (!block?.[1]) {
    throw new Error(
      `Could not parse 'apiPackageEntryPoints' from public docs configuration '${configPath}'`,
    )
  }

  const entries: ApiEntryPoint[] = []
  const objectPattern =
    /\{\s*id:\s*'([^']+)'\s*,\s*packageName:\s*'([^']+)'\s*,\s*entryPoint:\s*'([^']+)'\s*,?\s*\}/g

  for (const match of block[1].matchAll(objectPattern)) {
    entries.push({ id: match[1]!, packageName: match[2]!, entryPoint: match[3]! })
  }

  if (entries.length === 0) {
    throw new Error(
      `No API entry points were parsed from public docs configuration '${configPath}'`,
    )
  }

  return entries
}

/**
 * Resolves every package directory the pnpm workspace declares.
 *
 * Membership in "this repository" is a property of the workspace, not of the curated API list:
 * a public class may inherit from a type declared in a package that has no entry point of its
 * own, and that member is the repository's own code. Deriving the roots from the entry points
 * instead would quietly discard it, so the workspace file is the source of truth and the
 * curated list stays what it is, a choice of which packages get their own collection.
 *
 * @param repoRoot - Repository root.
 * @returns Absolute package directories holding a `package.json`.
 * @throws Error When the workspace file is missing or declares no packages.
 */
export function loadWorkspacePackageRoots(repoRoot: string): ReadonlyArray<string> {
  const workspacePath = path.join(repoRoot, 'pnpm-workspace.yaml')
  if (!fs.existsSync(workspacePath)) {
    throw new Error(`Workspace configuration '${workspacePath}' does not exist`)
  }

  const source = fs.readFileSync(workspacePath, 'utf-8')
  // Indented list items only, and anchored per line: `\s` spans newlines, so a looser pattern
  // would run past the end of this block and swallow the next key's list as if it were globs.
  const block = source.match(/^packages:[^\n]*\n((?:[ \t]+-[ \t]+.*\n?)+)/m)
  if (!block?.[1]) {
    throw new Error(`Could not parse the 'packages' globs from workspace file '${workspacePath}'`)
  }

  const roots = new Set<string>()
  for (const match of block[1].matchAll(/^[ \t]+-[ \t]+['"]?([^'"\n]+?)['"]?[ \t]*$/gm)) {
    // The globs are read with the platform's own path semantics so a workspace declared on
    // Windows still resolves; a bare `dir` or a `dir/*` pattern both cover a package root.
    for (const entry of fs.globSync(match[1]!.trim(), { cwd: repoRoot })) {
      const absolute = path.resolve(repoRoot, entry)
      if (fs.existsSync(path.join(absolute, 'package.json'))) {
        roots.add(absolute)
      }
    }
  }

  if (roots.size === 0) {
    throw new Error(`No package directories were resolved from workspace file '${workspacePath}'`)
  }

  return [...roots].sort()
}

/**
 * Reads the public site's TypeDoc options so the guide catalog matches the published
 * API reference.
 *
 * @param repoRoot - Repository root.
 * @returns TypeDoc options plus the resolved tsconfig path.
 */
export function loadTypeDocOptions(repoRoot: string): Record<string, unknown> {
  const appRoot = path.join(repoRoot, 'apps/public-web')
  const config = JSON.parse(fs.readFileSync(path.join(appRoot, 'typedoc.json'), 'utf-8')) as Record<
    string,
    unknown
  >

  return {
    ...config,
    // Reflections are rendered into guide topics here, so TypeDoc's own output
    // directory and readme generation are not used.
    readme: 'none',
    tsconfig: path.join(appRoot, 'tsconfig.typedoc.json'),
  }
}

/**
 * Extracts a plain-text summary from a TypeDoc comment.
 *
 * A comment summary may span several paragraphs and may carry markdown lists. Those are kept
 * verbatim apart from line breaks, because a bullet list explaining what a method aggregates
 * is exactly the part a caller cannot recover from the signature alone.
 *
 * @param comment - Comment to read.
 * @returns The summary text with collapsed line breaks, or an empty string.
 */
function summarize(comment: CommentLike | undefined): string {
  return summarizeParts(comment, false)
}

/**
 * Extracts a comment summary with its Markdown structure intact.
 *
 * A comment often explains itself with a bullet list — what a function aggregates, what
 * states an enum can be in. Collapsing that into one line leaves a run of dashes mid-
 * sentence, so the body keeps the line breaks and lets Markdown render the list.
 *
 * @param comment - Comment to read.
 * @returns The summary text, with blank lines between paragraphs.
 */
function summarizeProse(comment: CommentLike | undefined): string {
  return summarizeParts(comment, true)
}

/**
 * Extracts the text of a comment summary.
 *
 * A summary arrives as a list of inline runs of one comment rather than as whole paragraphs:
 * an inline code span, a `{@link}` tag or a plain stretch of text is its own part, and the
 * authored whitespace around each run is what separates it from the next. The runs are
 * therefore rejoined with nothing between them and left to carry their own spacing, because
 * trimming them or spacing them here welds `a ` + "`run:`" + ` hook` into `a`run:` hook` and
 * turns every inline span into a paragraph of its own.
 *
 * @param comment - Comment to read.
 * @param prose - Whether to keep the comment's own line breaks.
 * @returns The summary text.
 */
function summarizeParts(comment: CommentLike | undefined, prose: boolean): string {
  const parts = comment?.summary
  if (!Array.isArray(parts) || parts.length === 0) {
    return ''
  }
  const texts: string[] = []
  for (const part of parts) {
    const text: unknown = (part as { text?: unknown }).text
    if (typeof text === 'string' && text.length > 0) {
      texts.push(text)
    }
  }
  const joined = texts.join('')
  return prose ? joined.trim() : joined.replace(/\s+/g, ' ').trim()
}

/**
 * Reads one block tag's content from a TypeDoc comment.
 *
 * `@param` prose is split onto the matching parameter reflection by TypeDoc, but `@returns`,
 * `@throws` and `@example` stay in the block tags, so both halves have to be read.
 *
 * @param comment - Comment to read.
 * @param tag - Block tag name, including its `@`.
 * @returns The tag content with collapsed line breaks, or an empty string.
 */
function blockTag(comment: CommentLike | undefined, tag: string): string {
  const match = comment?.blockTags?.find((candidate) => candidate.tag === tag)
  if (match === undefined) {
    return ''
  }
  const texts: string[] = []
  for (const part of match.content ?? []) {
    if (typeof part.text === 'string') {
      texts.push(part.text)
    }
  }
  // Rejoined with nothing between the runs, for the same reason as a comment summary: the
  // spacing around each run is authored, and a block tag is a single line of prose.
  return texts.join('').replace(/\s+/g, ' ').trim()
}

/**
 * Reads a block tag without flattening the whitespace inside it.
 *
 * `@example` bodies carry their own indentation and often their own fence, so joining the
 * parts with a space would collapse a readable snippet into one run-on line and, worse, leave
 * a fenced example nested inside the fence this module wraps it in. The parts are joined
 * with a newline instead, which is how TypeDoc splits a multi-line block tag.
 *
 * @param comment - Comment to read.
 * @param tag - Block tag name.
 * @returns The tag's text with its line structure intact, or nothing when absent.
 */
function blockTagText(comment: CommentLike | undefined, tag: string): string {
  const match = comment?.blockTags?.find((candidate) => candidate.tag === tag)
  if (match === undefined) {
    return ''
  }
  const texts: string[] = []
  for (const part of match.content ?? []) {
    if (typeof part.text === 'string') {
      texts.push(part.text)
    }
  }
  // Rejoined with nothing between the runs, for the same reason as a comment summary, and
  // trimmed only at the ends: trimming each line would strip the indentation that makes the
  // example's code readable.
  return texts.join('').trim()
}

/**
 * Renders a type reference as the declaration writes it.
 *
 * @param type - Type reference.
 * @returns The printed type, or an empty string when absent.
 */
function typeText(type: TypeLike | undefined): string {
  return type === undefined ? '' : type.toString()
}

/**
 * Escapes a value so it survives inside a Markdown table cell.
 *
 * A union such as `boolean | null` is common in this codebase, and its pipe would otherwise
 * open a new column and silently shift every field after it. Descriptions arrive as prose
 * that may wrap, and a line break would end the row.
 *
 * @param value - Raw cell value.
 * @returns The value as a single escaped cell.
 */
function cell(value: string): string {
  return value.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim()
}

/**
 * Renders a parameter list as it appears in a signature.
 *
 * @param parameters - Declared parameters.
 * @returns The comma-separated parameter list.
 */
function renderParameterList(parameters: ReadonlyArray<ParameterLike> | undefined): string {
  return (parameters ?? [])
    .map((parameter) => {
      const rest = parameter.flags?.isRest === true ? '...' : ''
      const optional =
        parameter.flags?.isOptional === true && parameter.flags?.isRest !== true ? '?' : ''
      const type = typeText(parameter.type)
      return type.length > 0
        ? `${rest}${parameter.name}${optional}: ${type}`
        : `${rest}${parameter.name}${optional}`
    })
    .join(', ')
}

/**
 * Renders a type parameter list as it appears in a signature.
 *
 * @param typeParameters - Declared type parameters.
 * @returns The comma-separated type parameter list, or an empty string.
 */
function renderTypeParameterList(typeParameters: ReadonlyArray<ParameterLike> | undefined): string {
  return (typeParameters ?? [])
    .map((parameter) => {
      const constraint = typeText(parameter.type)
      return constraint.length > 0 ? `${parameter.name} extends ${constraint}` : parameter.name
    })
    .join(', ')
}

/**
 * Renders the table describing a set of parameters.
 *
 * The `Required` column is dropped when no parameter is optional and the `Description`
 * column when none carries one, so the table states only what is known rather than a column
 * of empty or uniformly negative cells.
 *
 * @param parameters - Declared parameters.
 * @returns The Markdown table, or an empty string when there are no parameters.
 */
function renderParameterTable(parameters: ReadonlyArray<ParameterLike> | undefined): string {
  const list = parameters ?? []
  if (list.length === 0) {
    return ''
  }

  const described = list.some((parameter) => summarize(parameter.comment).length > 0)
  const optional = list.some((parameter) => parameter.flags?.isOptional === true)

  const header = [
    'Parameter',
    'Type',
    ...(optional ? ['Required'] : []),
    ...(described ? ['Description'] : []),
  ]
  const rows = list.map((parameter) => {
    const declared = typeText(parameter.type)
    const row = [`\`${parameter.name}\``, declared.length > 0 ? `\`${cell(declared)}\`` : '—']
    if (optional) {
      row.push(parameter.flags?.isOptional === true ? 'no' : 'yes')
    }
    if (described) {
      row.push(cell(summarize(parameter.comment)) || '—')
    }
    return row
  })

  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n')
}

/**
 * Renders the table describing the properties of an interface, class or type alias.
 *
 * @param members - Declared members.
 * @returns The Markdown table, or an empty string when no member carries a type.
 */
/**
 * Returns the type a member exposes, wherever TypeDoc happened to record it.
 *
 * A plain property carries `type`; a getter keeps its type on `getSignature` because the type
 * belongs to the accessor rather than to the declaration. Reading only one of the two is what
 * made every getter look typeless and disappear from the Fields table.
 *
 * @param member - Member to inspect.
 * @returns The rendered type, or an empty string when the member exposes none.
 */
function memberType(member: MemberLike): string {
  const own = typeText(member.type)
  return own.length > 0 ? own : typeText(member.getSignature?.type)
}

/**
 * Returns a member's documentation, wherever TypeDoc recorded it.
 *
 * @param member - Member to inspect.
 * @returns The summarized description.
 */
function memberSummary(member: MemberLike): string {
  return summarize(member.getSignature?.comment ?? member.comment)
}

/**
 * Renders the table describing a set of properties or fields.
 *
 * @param members - Properties or fields to describe.
 * @returns The Markdown table, or an empty string when none carry a type.
 */
function renderPropertyTable(members: ReadonlyArray<MemberLike>): string {
  const properties = members.filter((member) => memberType(member).length > 0)
  if (properties.length === 0) {
    return ''
  }

  const described = properties.some((member) => memberSummary(member).length > 0)
  const optional = properties.some((member) => member.flags?.isOptional === true)

  const header = [
    'Field',
    'Type',
    ...(optional ? ['Required'] : []),
    ...(described ? ['Description'] : []),
  ]
  const rows = properties.map((member) => {
    const row = [`\`${member.name}\``, `\`${cell(memberType(member))}\``]
    if (optional) {
      row.push(member.flags?.isOptional === true ? 'no' : 'yes')
    }
    if (described) {
      row.push(cell(memberSummary(member)) || '—')
    }
    return row
  })

  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n')
}

/**
 * Renders the table describing an enumeration's members.
 *
 * @param members - Enumerated members.
 * @returns The Markdown table, or an empty string when there are no members.
 */
function renderMemberTable(members: ReadonlyArray<MemberLike>): string {
  if (members.length === 0) {
    return ''
  }
  const values = members.map(memberValue)
  const described = members.some((member) => summarize(member.comment).length > 0)
  const header = ['Member', 'Value', ...(described ? ['Description'] : [])]
  const rows = members.map((member, index) => {
    const row = [
      `\`${member.name}\``,
      `\`${cell(values[index] ?? '')}\``,
      ...(described ? [cell(summarize(member.comment)) || '—'] : []),
    ]
    return row
  })
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n')
}

/**
 * Returns an enumerated member's value as it is declared.
 *
 * An enum member carries its value on `value`, or on `defaultValue` for a computed member,
 * rather than on `type`. Reading `type` for an enum member yields nothing, so a rendered
 * `Value` column would come out empty for exactly the members it exists to describe.
 *
 * @param member - Enumerated member.
 * @returns The declared value, or an empty string when TypeDoc reports none.
 */
function memberValue(member: MemberLike): string {
  const value: unknown =
    (member as { value?: unknown; defaultValue?: unknown }).value ??
    (member as { defaultValue?: unknown }).defaultValue
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  // A value TypeDoc hands over as an object carries no printable form, and stringifying one
  // would yield a literal `[object Object]` in the table.
  return ''
}

/**
 * Builds the guide topic body for a documented reflection.
 *
 * The body is written for a caller who has the symbol's name and no access to the
 * repository. It therefore states how the symbol is called before it says what the symbol is
 * for: the import, the signature, the parameters with their types and requiredness, what the
 * call returns, a usage sketch, and finally the topics that define the types this one names.
 * A one-line summary alone leaves such a caller unable to make the call at all.
 *
 * The declaration path is deliberately absent. It names a location inside the specd
 * repository that does not exist in the caller's own tree, so it cannot be acted on and only
 * invites the reader to go and read the source, which is the thing the topic replaces.
 *
 * @param reflection - Reflection being documented.
 * @param spec - Reflection kind descriptor.
 * @param packageName - Published package the symbol is exported from.
 * @param importStatement - Copy-pasteable import statement.
 * @param summary - One-line description used for the topic's catalogue entry.
 * @param relatedTypes - Topic references for the types this declaration names.
 * @returns Markdown body for the generated topic.
 */
function renderBody(
  reflection: FlatReflection,
  spec: (typeof ADDRESSABLE_KINDS)[number],
  importStatement: string,
  relatedTypes: ReadonlyMap<string, string>,
): string {
  const name = reflection.name
  const signature = reflection.signatures?.[0]
  // A function's documentation sits on its signature, because that is where TypeDoc
  // attaches the `@param` and `@returns` it splits out of the comment block.
  const prose = summarizeProse(signature?.comment ?? reflection.comment)
  const intro =
    prose.length > 0
      ? prose
      : `Auto-generated ${spec.kindName.toLowerCase()} reference for \`${name}\`.`

  return [
    [`# ${name}`, intro, `Import: \`${importStatement}\``].join('\n\n'),
    ...renderDeclarationSections(reflection, spec),
    ...renderUsageSection(reflection, spec, importStatement),
    ...renderRelatedTypesSection(name, relatedTypes),
  ]
    .join('\n\n')
    .concat('\n')
}

/**
 * Joins the parts of a section under its heading, dropping the parts that are empty.
 *
 * Sections are assembled as whole blocks so that the blank lines Markdown needs between a
 * heading, a table and a fenced example cannot be lost to a single misplaced newline.
 *
 * @param heading - Section heading.
 * @param parts - Section body parts, in order.
 * @returns The section as one block.
 */
function section(heading: string, ...parts: string[]): string {
  return [heading, ...parts.filter((part) => part.length > 0)].join('\n\n')
}

/**
 * Renders the sections describing how a declaration is shaped and called.
 *
 * @param reflection - Reflection being documented.
 * @param spec - Reflection kind descriptor.
 * @returns Markdown sections, already separated by blank lines.
 */
function renderDeclarationSections(
  reflection: FlatReflection,
  spec: (typeof ADDRESSABLE_KINDS)[number],
): string[] {
  const extendsClause = renderExtends(reflection)
  const signature = renderSignatureLine(reflection, spec, extendsClause)

  switch (spec.kindName) {
    case 'Class':
      return renderClassSections(reflection, signature)
    case 'Interface':
      return renderInterfaceSections(reflection, signature)
    case 'Function':
      return renderFunctionSections(reflection, signature)
    case 'Enumeration':
      return renderEnumerationSections(reflection, signature)
    case 'Type alias':
      return renderTypeAliasSections(reflection, signature)
    default:
      return ['## Type', '', `\`${signature}\``]
  }
}

/**
 * Renders the `extends` clause naming the types a declaration inherits from.
 *
 * TypeDoc flattens inherited members into a child's member list, so the field table already
 * shows the effective shape. Naming the base type still matters because it is where the
 * inherited half of that shape is documented.
 *
 * @param reflection - Reflection being documented.
 * @returns The clause, or an empty string when nothing is inherited.
 */
function renderExtends(reflection: FlatReflection): string {
  const bases = (reflection.extendedTypes ?? []).map(typeText).filter((base) => base.length > 0)
  return bases.length > 0 ? ` extends ${bases.join(', ')}` : ''
}

/**
 * Renders the one-line declaration a caller reads before anything else.
 *
 * @param reflection - Reflection being documented.
 * @param spec - Reflection kind descriptor.
 * @param extendsClause - Pre-rendered `extends` clause.
 * @returns The declaration as inline code.
 */
function renderSignatureLine(
  reflection: FlatReflection,
  spec: (typeof ADDRESSABLE_KINDS)[number],
  extendsClause: string,
): string {
  const name = reflection.name
  switch (spec.kindName) {
    case 'Class':
      return `class ${name}${extendsClause}`
    case 'Interface':
      return `interface ${name}${extendsClause}`
    case 'Enumeration':
      return `enum ${name}`
    case 'Function': {
      const signatures = reflection.signatures ?? []
      if (signatures.length === 0) {
        const head = `function ${name}()`
        return head
      }
      const signature = signatures[0]!
      const generics = renderTypeParameterList(signature.typeParameters)
      const returns = typeText(signature.type)
      const head = `function ${name}${generics.length > 0 ? `<${generics}>` : ''}(${renderParameterList(signature.parameters)})`
      return returns.length > 0 ? `${head}: ${returns}` : head
    }
    case 'Type alias': {
      const generics = renderTypeParameterList(reflection.signatures?.[0]?.typeParameters)
      return `type ${name}${generics.length > 0 ? `<${generics}>` : ''} = ${typeText(reflection.type)}`
    }
    default: {
      const declared = typeText(reflection.type)
      const keyword = reflection.flags?.isConst === true ? 'const' : 'let'
      return `${keyword} ${name}${declared.length > 0 ? `: ${declared}` : ''}`
    }
  }
}

/**
 * Renders the sections documenting a class: its constructor, methods and properties.
 *
 * @param reflection - Reflection being documented.
 * @param signature - Pre-rendered signature line.
 * @returns Markdown sections, already separated by blank lines.
 */
function renderClassSections(reflection: FlatReflection, signature: string): string[] {
  const members = reflection.children ?? []
  const constructor = members.find((member) => member.kind === KIND_CONSTRUCTOR)
  const methods = members.filter(
    (member) => member.kind === KIND_METHOD && member.signatures !== undefined,
  )
  const properties = members.filter((member) => memberType(member).length > 0)

  const blocks = [section('## Signature', `\`${signature}\``)]

  if (
    constructor === undefined ||
    constructor.signatures === undefined ||
    constructor.signatures.length === 0
  ) {
    blocks.push(section('## Constructor', `\`new ${reflection.name}()\``))
  } else {
    for (let i = 0; i < constructor.signatures.length; i++) {
      const constructorSignature = constructor.signatures[i]!
      const title =
        constructor.signatures.length === 1
          ? '## Constructor'
          : `## Constructor (overload ${i + 1})`
      blocks.push(
        section(
          title,
          summarizeProse(constructorSignature.comment ?? constructor.comment),
          `\`new ${reflection.name}(${renderParameterList(constructorSignature.parameters)})\``,
          renderParameterTable(constructorSignature.parameters),
        ),
      )
    }
  }

  if (methods.length > 0) {
    blocks.push(section('## Methods', ...renderMethods(methods)))
  }

  const propertyTable = renderPropertyTable(properties)
  if (propertyTable.length > 0) {
    blocks.push(section('## Fields', propertyTable))
  }

  return blocks
}

/**
 * Renders one section per method, with its signature, parameters and return type.
 *
 * Classes and interfaces both need this, and an interface is frequently nothing but methods,
 * so the rendering is shared rather than duplicated per kind.
 *
 * @param methods - Methods to document.
 * @returns One Markdown section per method.
 */
function renderMethods(methods: ReadonlyArray<MemberLike>): string[] {
  const blocks: string[] = []
  for (const method of methods) {
    const signatures = method.signatures ?? []
    if (signatures.length === 0) {
      blocks.push(
        section(
          `### ${method.name}`,
          summarizeProse(method.comment),
          `\`${method.name}(): ${typeText(method.type)}\``,
        ),
      )
      continue
    }
    for (let i = 0; i < signatures.length; i++) {
      const signature = signatures[i]!
      const title =
        signatures.length === 1 ? `### ${method.name}` : `### ${method.name} (overload ${i + 1})`
      blocks.push(
        section(
          title,
          summarizeProse(signature.comment ?? method.comment),
          `\`${method.name}(${renderParameterList(signature.parameters)}): ${typeText(signature.type)}\``,
          renderParameterTable(signature.parameters),
          renderReturns(signature),
        ),
      )
    }
  }
  return blocks
}

/**
 * Renders the sections documenting an interface or an object-shaped type alias.
 *
 * @param reflection - Reflection being documented.
 * @param signature - Pre-rendered signature line.
 * @returns Markdown sections, already separated by blank lines.
 */
function renderInterfaceSections(reflection: FlatReflection, signature: string): string[] {
  const members = reflection.children ?? []
  const table = renderPropertyTable(members)
  const blocks = [section('## Signature', `\`${signature}\``)]

  if (table.length > 0) {
    blocks.push(section('## Fields', table))
  }

  // An interface is mostly methods: a port or a provider declares signatures and very few
  // fields. Rendering only the field table therefore documented a large share of the
  // interfaces as a bare name, leaving a caller with no way to know what to implement.
  const methods = members.filter(
    (member) => member.kind === KIND_METHOD && member.signatures !== undefined,
  )
  if (methods.length > 0) {
    blocks.push(section('## Methods', ...renderMethods(methods)))
  }

  for (const call of reflection.signatures ?? []) {
    blocks.push(
      section(
        '## Call signature',
        summarizeProse(call.comment),
        `\`(${renderParameterList(call.parameters)}): ${typeText(call.type)}\``,
        renderParameterTable(call.parameters),
        renderReturns(call),
      ),
    )
  }

  return blocks
}

/**
 * Renders the sections documenting a free function.
 *
 * @param reflection - Reflection being documented.
 * @param signature - Pre-rendered signature line.
 * @returns Markdown sections, already separated by blank lines.
 */
function renderFunctionSections(reflection: FlatReflection, signature: string): string[] {
  const call = reflection.signatures?.[0]
  // The summary is already the body's opening paragraph, so repeating it under the heading
  // would say the same thing twice on the page.
  return [
    section(
      '## Signature',
      `\`${signature}\``,
      renderParameterTable(call?.parameters),
      renderReturns(call),
      renderThrows(call),
    ),
  ]
}

/**
 * Renders what a call hands back.
 *
 * @param signature - Signature to read.
 * @returns The returns line, or an empty string when nothing is documented.
 */
function renderReturns(signature: SignatureLike | undefined): string {
  if (signature === undefined) {
    return ''
  }
  const documented = blockTag(signature.comment, '@returns')
  const declared = typeText(signature.type)
  if (documented.length === 0) {
    return declared.length > 0 ? `**Returns** \`${cell(declared)}\`` : ''
  }
  return declared.length > 0
    ? `**Returns** \`${cell(declared)}\` — ${cell(documented)}`
    : `**Returns** ${cell(documented)}`
}

/**
 * Renders the failures a call documents.
 *
 * @param signature - Signature to read.
 * @returns The throws line, or an empty string when nothing is documented.
 */
function renderThrows(signature: SignatureLike | undefined): string {
  const documented = blockTag(signature?.comment, '@throws')
  return documented.length > 0 ? `**Throws** — ${cell(documented)}` : ''
}

/**
 * Renders the sections documenting an enumeration.
 *
 * @param reflection - Reflection being documented.
 * @param signature - Pre-rendered signature line.
 * @returns Markdown sections, already separated by blank lines.
 */
function renderEnumerationSections(reflection: FlatReflection, signature: string): string[] {
  const table = renderMemberTable(reflection.children ?? [])
  return [
    section('## Signature', `\`${signature}\``),
    ...(table.length > 0 ? [section('## Members', table)] : []),
  ]
}

/**
 * Renders the sections documenting a type alias, expanding an object-shaped target.
 *
 * @param reflection - Reflection being documented.
 * @param signature - Pre-rendered signature line.
 * @returns Markdown sections, already separated by blank lines.
 */
function renderTypeAliasSections(reflection: FlatReflection, signature: string): string[] {
  const declaration = (
    reflection.type as { declaration?: { children?: ReadonlyArray<MemberLike> } } | undefined
  )?.declaration
  const table = declaration === undefined ? '' : renderPropertyTable(declaration.children ?? [])
  return [
    section('## Signature', `\`${signature}\``),
    ...(table.length > 0 ? [section('## Fields', table)] : []),
  ]
}

/**
 * Renders the usage section showing the symbol being reached.
 *
 * A hand-written `@example` wins, because it is the only example that was written against a
 * real call. Failing that the section is derived from the signature: the import, then the
 * call with every argument named after its parameter. The arguments are left as names
 * rather than invented values, because a fabricated value would read as something the caller
 * should pass.
 *
 * @param reflection - Reflection being documented.
 * @param spec - Reflection kind descriptor.
 * @param importStatement - Copy-pasteable import statement.
 * @returns The usage section, or nothing when the kind has no call shape.
 */
function renderUsageSection(
  reflection: FlatReflection,
  spec: (typeof ADDRESSABLE_KINDS)[number],
  importStatement: string,
): string[] {
  // A function's JSDoc lives on its signature, not on the reflection, so both are consulted
  // or every `@example` under a function would silently fall back to a generated skeleton.
  const example = blockTagText(
    reflection.signatures?.[0]?.comment ?? reflection.comment,
    '@example',
  )
  if (example.length > 0) {
    // An example that already carries its own fence is used verbatim; wrapping it again
    // would produce nested fences and break the block.
    const fence = example.includes('```') ? example : '```typescript\n' + example + '\n```'
    return [section('## Usage', fence)]
  }

  const sketch = renderUsageSketch(reflection, spec, importStatement)
  return sketch.length > 0
    ? [section('## Usage', '```typescript\n' + sketch.join('\n') + '\n```')]
    : []
}

/**
 * Derives the call skeleton for a symbol from its signature.
 *
 * @param reflection - Reflection being documented.
 * @param spec - Reflection kind descriptor.
 * @param importStatement - Copy-pasteable import statement.
 * @returns The skeleton lines, or nothing when the kind has no call shape.
 */
function renderUsageSketch(
  reflection: FlatReflection,
  spec: (typeof ADDRESSABLE_KINDS)[number],
  importStatement: string,
): string[] {
  const name = reflection.name

  if (spec.kindName === 'Class') {
    const constructor = reflection.children?.find((member) => member.kind === KIND_CONSTRUCTOR)
    const constructorParameters = constructor?.signatures?.[0]?.parameters
    const method = primaryMethod(reflection)
    const methodSignature = method?.signatures?.[0]
    const awaits = typeText(methodSignature?.type).startsWith('Promise')
    const receiver = `const ${lowerFirst(name)} = new ${name}(${renderArgumentList(constructorParameters)})`
    if (method === undefined || methodSignature === undefined) {
      return [importStatement, '', receiver]
    }
    const call = `const result = ${awaits ? 'await ' : ''}${lowerFirst(name)}.${method.name}(${renderArgumentList(methodSignature.parameters)})`
    return [importStatement, '', receiver, call]
  }

  if (spec.kindName === 'Function') {
    const signature = reflection.signatures?.[0]
    const awaits = typeText(signature?.type).startsWith('Promise')
    const call = `const result = ${awaits ? 'await ' : ''}${name}(${renderArgumentList(signature?.parameters)})`
    return [importStatement, '', call]
  }

  if (spec.kindName === 'Enumeration') {
    const first = reflection.children?.[0]
    if (first === undefined) {
      return [importStatement]
    }
    return [importStatement, '', `const value = ${name}.${first.name}`]
  }

  if (spec.kindName === 'Variable') {
    return [importStatement]
  }

  return []
}

/**
 * Chooses the method a usage sketch should demonstrate.
 *
 * `execute` is the convention every use case in this codebase follows, so it wins outright.
 * A class with exactly one method is unambiguous even when it is not called `execute`; a
 * class with several is left to the Methods section rather than guessed at.
 *
 * @param reflection - Reflection to inspect.
 * @returns The method to demonstrate, or undefined when there is no single obvious one.
 */
function primaryMethod(reflection: FlatReflection): MemberLike | undefined {
  const methods =
    reflection.children?.filter(
      (member) => member.kind === KIND_METHOD && member.signatures !== undefined,
    ) ?? []
  return (
    methods.find((method) => method.name === 'execute') ??
    (methods.length === 1 ? methods[0] : undefined)
  )
}

/**
 * Renders a call's arguments as the parameter names they bind to.
 *
 * @param parameters - Declared parameters.
 * @returns The comma-separated argument list.
 */
function renderArgumentList(parameters: ReadonlyArray<ParameterLike> | undefined): string {
  return (parameters ?? [])
    .map((parameter) =>
      parameter.flags?.isRest === true ? `...${parameter.name}` : parameter.name,
    )
    .join(', ')
}

/**
 * Lowercases the first character so a class name can name its own instance.
 *
 * @param name - Identifier to rewrite.
 * @returns The identifier with a lowercase initial.
 */
function lowerFirst(name: string): string {
  return name.length === 0 ? name : name[0]!.toLowerCase() + name.slice(1)
}

/**
 * Renders the section linking the types a declaration names to their own topics.
 *
 * A symbol's usefulness is mostly the shape of the types it asks for and hands back, and
 * those shapes live in their own topics. TypeDoc does not resolve a referenced type back to
 * its reflection, so names are matched against the catalog instead; a name that resolves to
 * more than one topic is left unlinked rather than guessed at.
 *
 * @param self - Name of the symbol being documented, excluded from its own links.
 * @param relatedTypes - Topic reference per referenced type name.
 * @returns The related-types section, or nothing when no name resolves.
 */
function renderRelatedTypesSection(
  self: string,
  relatedTypes: ReadonlyMap<string, string>,
): string[] {
  const rows = [...relatedTypes.entries()]
    .filter(([name]) => name !== self)
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([name, topic]) => `| \`${name}\` | \`${topic}\` |`)

  if (rows.length === 0) {
    return []
  }

  return [section('## Related types', ['| Type | Topic |', '| --- | --- |', ...rows].join('\n'))]
}

/**
 * Builds the import statement that reaches a reflected symbol from its published package.
 *
 * Interfaces and type aliases have no value form, so they are imported type-only. Classes,
 * enumerations, functions and variables are imported by value, because a type-only import
 * of a value cannot be called or constructed.
 *
 * @param name - Reflection name.
 * @param packageName - Published package name the symbol is exported from.
 * @param spec - Reflection kind descriptor.
 * @returns An import statement that compiles wherever it is pasted.
 */
function renderImportStatement(
  name: string,
  packageName: string,
  spec: (typeof ADDRESSABLE_KINDS)[number],
): string {
  return spec.typeOnly
    ? `import type { ${name} } from '${packageName}'`
    : `import { ${name} } from '${packageName}'`
}

/**
 * Resolves a reflection's declaration path relative to the repository root.
 *
 * Generated topics are declared in the package that owns the symbol, which is not
 * always the package whose barrel re-exported it, so the repository root is the only
 * stable base for a relative source path.
 *
 * @param reflection - Reflection to inspect.
 * @param repoRoot - Absolute repository root.
 * @returns Repository-relative declaration path, or an empty string when unavailable.
 */
function resolveSourcePath(reflection: FlatReflection, repoRoot: string): string {
  const fullFileName = reflection.sources?.[0]?.fullFileName ?? reflection.sources?.[0]?.fileName
  if (!fullFileName) {
    return ''
  }
  const relative = path.relative(repoRoot, path.resolve(repoRoot, fullFileName))
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return fullFileName
  }
  return relative.split(path.sep).join('/')
}

/**
 * Reports whether a declaration comes from inside one of the repository's own packages.
 *
 * TypeDoc walks the whole inheritance chain, so every class also carries the members it
 * inherits from `Error` and the rest of the standard library. Those declarations live in
 * `typescript/lib/*.d.ts` and say nothing about the symbol being documented: `message`,
 * `name` and `stack` apply to any JavaScript error, and their JSDoc is long enough to stretch
 * a table across hundreds of characters. A member declared outside every package root is
 * therefore treated as inherited from elsewhere and left out of the topic.
 *
 * A member TypeDoc gives no source for is kept, because absence of provenance is not evidence
 * of a foreign declaration and dropping it would silently hide a real member.
 *
 * @param reflection - Reflection to inspect.
 * @param packageRoots - Absolute package roots belonging to the workspace.
 * @returns True when the declaration lies within one of the roots.
 */
function isDeclaredInWorkspace(
  reflection: FlatReflection,
  packageRoots: ReadonlyArray<string>,
): boolean {
  const fullFileName = reflection.sources?.[0]?.fullFileName
  if (fullFileName === undefined) {
    return true
  }
  return packageRoots.some((root) => fullFileName.startsWith(`${root}${path.sep}`))
}

/**
 * Drops the members a symbol inherits from outside the workspace.
 *
 * Filtering happens once, where the reflections are collected, rather than inside each
 * renderer: the sections, the usage sketch and the related-type scan all read
 * `reflection.children`, so narrowing it at the source keeps a single rule in force and stops
 * the dropped members from leaking into the type links as well.
 *
 * @param reflection - Reflection whose members are filtered.
 * @param packageRoots - Absolute package roots belonging to the workspace.
 * @returns A copy of the reflection carrying only workspace-declared members.
 */
function withoutInheritedMembers(
  reflection: FlatReflection,
  packageRoots: ReadonlyArray<string>,
): FlatReflection {
  const members = reflection.children ?? []
  const own = members.filter((member) => isDeclaredInWorkspace(member, packageRoots))
  if (own.length === members.length) {
    return reflection
  }
  return { ...reflection, children: own }
}

/**
 * Generates addressable guide topics for every documented public API symbol.
 *
 * Each curated package entry point becomes one collection, and each addressable
 * reflection within it becomes a `collection:kind-directory/Name` topic. The topic's
 * `sourcePath` is the TypeScript declaration the symbol was extracted from, not a
 * synthesized Markdown path, and its `packageName` and `importStatement` name the
 * published package the caller actually imports from.
 *
 * @param repoRoot - Repository root.
 * @returns Promise resolving to generated API topics ordered by collection, kind, then name.
 * @throws Error When TypeDoc cannot convert a curated entry point.
 */
export async function generateSdkApiTopics(repoRoot: string): Promise<GuideTopic[]> {
  const typedoc = (await import('typedoc')) as unknown as TypedocModule
  const entryPoints = loadApiEntryPoints(repoRoot)
  const baseOptions = loadTypeDocOptions(repoRoot)
  const topics: GuideTopic[] = []
  // Membership is judged against every package of the workspace, not the entry point's own.
  // Each collection re-exports the symbols it builds on, so a symbol documented under `sdk`
  // is declared in `core` and carries `core`'s declaration paths for all of its members.
  // Scoping the check to one package would discard those members and leave the re-exported
  // topic with nothing but a signature. The workspace file is read rather than the curated
  // entry point list, so a member declared in a package that has no collection of its own,
  // such as one the API inherits from, is still recognised as this repository's own code.
  const workspaceRoots = loadWorkspacePackageRoots(repoRoot)

  // Every entry point is converted before any body is rendered, because a declaration's
  // types are resolved against the whole catalog: `VcsAdapter` is documented by another
  // package, and a topic that cannot link to it leaves the reader with a bare type name.
  const converted: Array<{
    readonly entryPoint: ApiEntryPoint
    readonly packageRoot: string
    readonly byKind: Map<number, FlatReflection[]>
  }> = []

  for (const entryPoint of entryPoints) {
    const appRoot = path.join(repoRoot, 'apps/public-web')
    const entryPath = path.resolve(appRoot, entryPoint.entryPoint)
    // `packages/code-graph/src/public.ts` declares the package root as `packages/code-graph`.
    const packageRoot = path.dirname(path.dirname(entryPath))
    const application = await typedoc.Application.bootstrapWithPlugins({
      ...baseOptions,
      entryPoints: [entryPath],
    })

    const project = await application.convert()
    if (!project) {
      throw new Error(`TypeDoc could not convert API entrypoint: ${entryPoint.entryPoint}`)
    }

    const byKind = new Map<number, FlatReflection[]>()
    for (const reflection of collectReflections(project)) {
      const bucket = byKind.get(reflection.kind)
      // A member declared in any workspace package counts as this project's own; one
      // declared outside all of them comes from the standard library.
      const own = withoutInheritedMembers(reflection, workspaceRoots)
      if (bucket) {
        bucket.push(own)
      } else {
        byKind.set(reflection.kind, [own])
      }
    }
    converted.push({
      entryPoint,
      packageRoot,
      byKind,
    })
  }

  const resolveTopic = buildTopicNameIndex(converted)

  for (const { entryPoint, byKind } of converted) {
    for (const spec of ADDRESSABLE_KINDS) {
      for (const reflection of byKind.get(spec.kind) ?? []) {
        const sourcePath = resolveSourcePath(reflection, repoRoot)
        const signature = reflection.signatures?.[0]
        // A function's documentation sits on its signature, because that is where TypeDoc
        // attaches the `@param` and `@returns` it splits out of the comment block.
        const summary = summarize(signature?.comment ?? reflection.comment)
        const importStatement = renderImportStatement(reflection.name, entryPoint.packageName, spec)
        const relatedTypes = collectRelatedTypes(reflection, entryPoint.id, resolveTopic)
        const raw = renderBody(reflection, spec, importStatement, relatedTypes)
        // Formatting happens before anything is measured or indexed: `lineCount`,
        // `byteLength` and the section outline all describe the Markdown the reader receives,
        // so they are derived from the formatted body rather than the raw one.
        const body = await formatGeneratedBody(raw, repoRoot)
        const lines = body.split(/\r?\n/)

        topics.push({
          collection: entryPoint.id,
          topic: `${spec.directory}/${reflection.name}`,
          title: reflection.name,
          description:
            summary.length > 0 ? summary : `${spec.kindName} exported by ${entryPoint.packageName}`,
          order: spec.order,
          sourcePath,
          packageName: entryPoint.packageName,
          importStatement,
          content: body,
          lineCount: lines.length,
          byteLength: Buffer.byteLength(body, 'utf-8'),
          outline: extractSections(body),
        })
      }
    }
  }

  return topics.sort((a, b) => {
    const byCollection = a.collection.localeCompare(b.collection, 'en')
    if (byCollection !== 0) return byCollection
    const byOrder = a.order - b.order
    if (byOrder !== 0) return byOrder
    return a.topic.localeCompare(b.topic, 'en')
  })
}

/**
 * Indexes every addressable symbol by name to its fully qualified topic.
 *
 * A name may reach several collections at once, because a package re-exports what it builds
 * on. Each candidate records whether the symbol's declaration lies inside that package, so
 * the caller asking for a topic can be pointed at the declaration rather than the re-export.
 * A name whose candidates cannot be told apart is left unresolved rather than guessed at.
 *
 * @param converted - Converted entry points and their reflections.
 * @returns A resolver mapping a type name and the collection asking for it to a topic.
 */
function buildTopicNameIndex(
  converted: ReadonlyArray<{
    readonly entryPoint: ApiEntryPoint
    readonly packageRoot: string
    readonly byKind: Map<number, FlatReflection[]>
  }>,
): (name: string, collection: string) => string | undefined {
  const candidates = new Map<
    string,
    Array<{ topic: string; collection: string; declared: boolean }>
  >()

  for (const { entryPoint, packageRoot, byKind } of converted) {
    const prefix = `${packageRoot}${path.sep}`
    for (const spec of ADDRESSABLE_KINDS) {
      for (const reflection of byKind.get(spec.kind) ?? []) {
        // The declaration's own absolute path is compared against the package root here.
        // `resolveSourcePath` yields a repo-relative path for storage in the topic, which
        // would never match an absolute prefix and would leave every symbol looking
        // re-exported rather than declared.
        const fullFileName = reflection.sources?.[0]?.fullFileName
        const list = candidates.get(reflection.name) ?? []
        list.push({
          topic: `${entryPoint.id}:${spec.directory}/${reflection.name}`,
          collection: entryPoint.id,
          declared: fullFileName !== undefined && fullFileName.startsWith(prefix),
        })
        candidates.set(reflection.name, list)
      }
    }
  }

  return (name, collection) => {
    const list = candidates.get(name)
    if (list === undefined || list.length === 0) {
      return undefined
    }
    // Every package re-exports the ones it builds on: `sdk` alone re-exports all 1298
    // symbols, and `SpecdConfig` reaches `sdk` from `core`. The declaration's own path is
    // what separates the two, so a type is linked to the package that declares it rather
    // than to whichever barrel happens to re-export it.
    const declaring = list.filter((candidate) => candidate.declared)
    const owners = declaring.length > 0 ? declaring : list
    if (owners.length === 1) {
      return owners[0]!.topic
    }
    const local = owners.find((candidate) => candidate.collection === collection)
    return local?.topic
  }
}

/**
 * Collects the topics documenting every type a declaration names.
 *
 * Parameter, property, return and inherited types are all read, because each one is a shape
 * the caller has to know before the call means anything. Candidates are pulled out of the
 * printed type with an identifier scan rather than parsed, since TypeDoc hands over the type
 * only as text; built-in type names are excluded because they resolve to no topic.
 *
 * @param reflection - Reflection being documented.
 * @param collection - Collection the symbol belongs to, which disambiguates re-exports.
 * @param resolve - Maps a type name to its topic, or nothing when it cannot be resolved.
 * @returns Referenced type name to topic, deduplicated.
 */
function collectRelatedTypes(
  reflection: FlatReflection,
  collection: string,
  resolve: (name: string, collection: string) => string | undefined,
): ReadonlyMap<string, string> {
  const names = new Set<string>()
  const consider = (type: TypeLike | undefined): void => {
    for (const identifier of typeText(type).matchAll(/[A-Za-z_$][\w$]*/g)) {
      const name = identifier[0]
      if (name !== undefined) {
        names.add(name)
      }
    }
  }

  for (const base of reflection.extendedTypes ?? []) {
    consider(base)
  }
  for (const member of reflection.children ?? []) {
    // A getter's type sits on its accessor signature, so both places are read or the types a
    // class exposes as properties would never be linked.
    consider(member.type)
    consider(member.getSignature?.type)
    for (const signature of member.signatures ?? []) {
      considerSignatureTypes(signature, consider)
    }
  }
  for (const signature of reflection.signatures ?? []) {
    considerSignatureTypes(signature, consider)
  }

  const related = new Map<string, string>()
  for (const name of [...names].sort((a, b) => a.localeCompare(b, 'en'))) {
    const topic = resolve(name, collection)
    if (topic !== undefined) {
      related.set(name, topic)
    }
  }
  return related
}

/**
 * Feeds the types named by one signature into a collector.
 *
 * @param signature - Signature to read.
 * @param consider - Callback receiving each type reference.
 */
function considerSignatureTypes(
  signature: SignatureLike,
  consider: (type: TypeLike | undefined) => void,
): void {
  consider(signature.type)
  for (const parameter of signature.parameters ?? []) {
    consider(parameter.type)
  }
  for (const parameter of signature.typeParameters ?? []) {
    consider(parameter.type)
  }
}

/**
 * Structural typing for the subset of the TypeDoc module the generator uses.
 */
interface TypedocModule {
  Application: {
    bootstrapWithPlugins(options: unknown): Promise<{ convert(): Promise<unknown> }>
  }
}

/**
 * Collects every reflection in a converted TypeDoc project.
 *
 * @param project - Converted project.
 * @returns All reflections, excluding the project root itself.
 */
function collectReflections(project: unknown): FlatReflection[] {
  const results: FlatReflection[] = []

  // Only module- and namespace-level declarations become addressable topics.
  // Recursing into class, interface, or enumeration bodies would expose their
  // members (constructors, properties) as separate topics.
  //
  // TypeDoc ReflectionKind values used here:
  //   Module = 2, Project = 4, Enum = 512, Namespace = 1024, ModuleLike = 2048
  const CONTAINER_KINDS = new Set([2, 4, 1024, 2048])

  const visit = (reflection: FlatReflection): void => {
    const children = reflection.children as ReadonlyArray<FlatReflection> | undefined
    for (const child of children ?? []) {
      if (typeof child.name === 'string') {
        results.push(child)
      }
      if (CONTAINER_KINDS.has(child.kind)) {
        visit(child)
      }
    }
  }

  visit(project as FlatReflection)
  return results
}
