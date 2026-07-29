import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Escapes special regex characters in a string.
 *
 * @param str - String to escape.
 * @returns Escaped regex string.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Checks whether a file exists at the given path.
 *
 * @param filePath - Path to check.
 * @returns True if file exists, false otherwise.
 */
async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * Injects or updates a specd instruction comment block in a target file.
 * Automatically tracks registered plugins in the block opening tag (`<!-- <specd agents="..."> -->`).
 * Deduplicates multiple specd blocks if any are present in the file.
 *
 * @param filePath - Target file path.
 * @param content - Content to place inside the specd block.
 * @param blockId - Optional plugin identifier for shared-file registration markers.
 */
export async function injectSpecdBlock(
  filePath: string,
  content: string,
  blockId?: string,
): Promise<void> {
  let trimmed = content.trim()

  // Strip redundant outer base tags if content is already wrapped
  const baseOuterRegex =
    /^<!-- <specd(?:\s+agents="[^"]*")?\s*> -->\s*([\s\S]*?)\s*<!-- <\/specd> -->$/
  const baseMatch = baseOuterRegex.exec(trimmed)
  if (baseMatch && baseMatch[1] !== undefined) {
    trimmed = baseMatch[1].trim()
  }

  // Strip redundant outer plugin-specific tags if passed in content
  if (blockId !== undefined) {
    const pluginOuterRegex = new RegExp(
      `^<!-- <specd-plugin:${escapeRegExp(blockId)}> -->\\s*([\\s\\S]*?)\\s*<!-- </specd-plugin:${escapeRegExp(blockId)}> -->$`,
    )
    const pluginMatch = pluginOuterRegex.exec(trimmed)
    if (pluginMatch && pluginMatch[1] !== undefined) {
      trimmed = pluginMatch[1].trim()
    }
  }

  if (trimmed.length === 0) {
    if (blockId !== undefined) {
      await removeSpecdBlock(filePath, blockId)
    }
    return
  }

  const fileExists = await checkFileExists(filePath)
  let existingContent = fileExists ? await readFile(filePath, 'utf8') : ''

  // Purge any legacy plugin-specific comment blocks if present
  if (blockId !== undefined) {
    const legacyRegex = new RegExp(
      `\\n?<!-- <specd-plugin:${escapeRegExp(blockId)}> -->[\\s\\S]*?<!-- </specd-plugin:${escapeRegExp(blockId)}> -->\\n?`,
      'g',
    )
    existingContent = existingContent.replace(legacyRegex, '\n').trim()
  }

  // Scan all existing <specd ...> ... </specd> blocks in the file to collect all registered agents
  const specdGlobalRegex = /<!-- <specd(?:\s+agents="([^"]*)")?\s*> -->[\s\S]*?<!-- <\/specd> -->/g
  const agentsSet = new Set<string>()
  let match: RegExpExecArray | null
  while ((match = specdGlobalRegex.exec(existingContent)) !== null) {
    if (match[1] && match[1].trim().length > 0) {
      for (const agent of match[1].split(',')) {
        if (agent.trim()) agentsSet.add(agent.trim())
      }
    }
  }

  if (blockId !== undefined) {
    agentsSet.add(blockId)
  }

  const agents = Array.from(agentsSet)
  const startTag =
    agents.length > 0 ? `<!-- <specd agents="${agents.join(',')}"> -->` : '<!-- <specd> -->'
  const endTag = '<!-- </specd> -->'
  const blockText = `${startTag}\n${trimmed}\n${endTag}`

  if (!fileExists) {
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, `${blockText}\n`, 'utf8')
    return
  }

  const hasSpecdBlock = specdGlobalRegex.test(existingContent)
  specdGlobalRegex.lastIndex = 0

  if (hasSpecdBlock) {
    // Replace the first specd block with the single consolidated block, and strip any duplicate specd blocks
    let isFirst = true
    const updated = existingContent.replace(specdGlobalRegex, () => {
      if (isFirst) {
        isFirst = false
        return blockText
      }
      return ''
    })
    await writeFile(filePath, updated.endsWith('\n') ? updated : `${updated}\n`, 'utf8')
  } else {
    const separator = existingContent.length === 0 || existingContent.endsWith('\n') ? '\n' : '\n\n'
    const newContent = `${existingContent}${separator}${blockText}\n`
    await writeFile(filePath, newContent, 'utf8')
  }
}

/**
 * Removes a specd instruction comment block or unregisters a plugin from a target file.
 * Performs reference-counted cleanup on shared files: removes base block if no registered agents remain.
 *
 * @param filePath - Target file path.
 * @param blockId - Optional plugin identifier matching the block to remove.
 */
export async function removeSpecdBlock(filePath: string, blockId?: string): Promise<void> {
  const fileExists = await checkFileExists(filePath)
  if (!fileExists) return

  let existingContent = await readFile(filePath, 'utf8')

  // Always purge legacy plugin-specific comment block if present
  if (blockId !== undefined) {
    const legacyRegex = new RegExp(
      `\\n?<!-- <specd-plugin:${escapeRegExp(blockId)}> -->[\\s\\S]*?<!-- </specd-plugin:${escapeRegExp(blockId)}> -->\\n?`,
      'g',
    )
    existingContent = existingContent.replace(legacyRegex, '\n').trim()
  }

  const specdRegex = /\n?<!-- <specd(?:\s+agents="([^"]*)")?\s*> -->[\s\S]*?<!-- <\/specd> -->\n?/g
  const specdMatchRegex = /<!-- <specd(?:\s+agents="([^"]*)")?\s*> -->[\s\S]*?<!-- <\/specd> -->/

  const match = specdMatchRegex.exec(existingContent)
  if (!match) {
    // If legacy block was purged and left empty file, handle cleanup
    if (existingContent.trim().length === 0) {
      await rm(filePath, { force: true })
    } else {
      await writeFile(filePath, `${existingContent.trim()}\n`, 'utf8')
    }
    return
  }

  if (blockId === undefined) {
    // Remove block unconditionally
    const updated = existingContent.replace(specdRegex, '\n').trim()
    if (updated.length === 0) {
      await rm(filePath, { force: true })
    } else {
      await writeFile(filePath, `${updated}\n`, 'utf8')
    }
    return
  }

  // Collect all agents across any specd blocks in the file
  const specdGlobalRegex = /<!-- <specd(?:\s+agents="([^"]*)")?\s*> -->[\s\S]*?<!-- <\/specd> -->/g
  const agentsSet = new Set<string>()
  let scanMatch: RegExpExecArray | null
  while ((scanMatch = specdGlobalRegex.exec(existingContent)) !== null) {
    if (scanMatch[1] && scanMatch[1].trim().length > 0) {
      for (const a of scanMatch[1].split(',')) {
        if (a.trim()) agentsSet.add(a.trim())
      }
    }
  }

  agentsSet.delete(blockId)
  const updatedAgents = Array.from(agentsSet)

  if (updatedAgents.length === 0) {
    // All registered agents removed — delete all specd blocks!
    const updated = existingContent.replace(specdRegex, '\n').trim()
    if (updated.length === 0) {
      await rm(filePath, { force: true })
    } else {
      await writeFile(filePath, `${updated}\n`, 'utf8')
    }
  } else {
    // Other agents remain — replace first block with updated agents attribute, strip duplicates
    const newStartTag = `<!-- <specd agents="${updatedAgents.join(',')}"> -->`
    let isFirst = true
    const updated = existingContent.replace(specdGlobalRegex, (fullMatch) => {
      if (isFirst) {
        isFirst = false
        return fullMatch.replace(/<!-- <specd(?:\s+agents="[^"]*")?\s*> -->/, newStartTag)
      }
      return ''
    })
    await writeFile(filePath, `${updated.trim()}\n`, 'utf8')
  }
}
