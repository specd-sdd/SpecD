import { Square, SquareCheck } from 'lucide-react'
import * as React from 'react'
import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { cn } from '../lib/utils.js'
import { MermaidBlock } from './MermaidBlock.js'
import { useStudioDocumentTheme } from './studio-markdown-theme.js'

export type StudioMarkdownPreviewProps = {
  content: string
  className?: string
  /** When true, use compact typography classes (Spec context). Default false. */
  compact?: boolean
}

type MarkdownTaskCheckboxProps = {
  checked: boolean
}

function MarkdownTaskCheckbox({ checked }: MarkdownTaskCheckboxProps): React.ReactElement {
  const Icon = checked ? SquareCheck : Square
  return (
    <span
      role="checkbox"
      aria-checked={checked}
      aria-disabled="true"
      className={cn(
        'mr-1.5 inline-block shrink-0 align-text-top text-muted-foreground',
        checked && 'text-studio-success',
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  )
}

function isMermaidCodeClassName(className: string | undefined): boolean {
  return className?.split(/\s+/).includes('language-mermaid') ?? false
}

function extractTextContent(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }
  if (Array.isArray(node)) {
    return node.map(extractTextContent).join('')
  }
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return extractTextContent(node.props.children)
  }
  return ''
}

type HastLikeNode = {
  type?: string
  value?: string
  children?: HastLikeNode[]
}

function extractHastText(node: HastLikeNode | undefined): string {
  if (!node) {
    return ''
  }
  if (node.type === 'text' && typeof node.value === 'string') {
    return node.value
  }
  if (Array.isArray(node.children)) {
    return node.children.map((child) => extractHastText(child)).join('')
  }
  return ''
}

/**
 * Shared Studio markdown preview renderer for inspector, Spec context, and Tasks.
 */
export function StudioMarkdownPreview({
  content,
  className,
  compact = false,
}: StudioMarkdownPreviewProps): React.ReactElement {
  const theme = useStudioDocumentTheme()

  if (!content.trim()) {
    return (
      <div className={cn('text-xs text-muted-foreground', className)}>(empty)</div>
    )
  }

  const components = React.useMemo<Components>(
    () => ({
      input: (inputProps) => {
        const { type, checked } = inputProps
        if (type === 'checkbox') {
          return <MarkdownTaskCheckbox checked={Boolean(checked)} />
        }
        return <input {...inputProps} />
      },
      pre: ({ children, node, ...props }) => {
        const codeNode = node?.children?.[0]
        const classNameValue =
          codeNode?.type === 'element' ? codeNode.properties?.className : undefined
        const classes = Array.isArray(classNameValue)
          ? classNameValue.join(' ')
          : typeof classNameValue === 'string'
            ? classNameValue
            : undefined

        if (isMermaidCodeClassName(classes)) {
          const source =
            codeNode?.type === 'element'
              ? extractHastText(codeNode)
              : extractTextContent(children)
          return <MermaidBlock source={source.replace(/\n$/, '')} theme={theme} />
        }

        return <pre {...props}>{children}</pre>
      },
      code: ({ className: codeClassName, children, ...props }) => (
        <code className={codeClassName} {...props}>
          {children}
        </code>
      ),
    }),
    [theme],
  )

  return (
    <article
      className={cn(
        'studio-markdown-preview max-w-none text-foreground',
        theme === 'light' ? 'studio-markdown-preview--light' : 'studio-markdown-preview--dark',
        compact ? 'text-[11px]' : 'text-sm',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </article>
  )
}
