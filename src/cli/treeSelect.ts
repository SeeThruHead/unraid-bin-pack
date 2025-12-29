/**
 * Simple tree-view checkbox selector for directories
 * Supports 2 levels deep with arrow key navigation
 */

import { Effect } from "effect"

interface TreeNode {
  path: string
  name: string
  children?: TreeNode[]
  expanded: boolean
  selected: boolean
  level: number
}

interface TreeSelectState {
  nodes: TreeNode[]
  flatView: TreeNode[]
  cursor: number
}

/**
 * Scan directories up to 2 levels deep
 */
async function scanDirectories(basePaths: string[]): Promise<TreeNode[]> {
  const nodes: TreeNode[] = []

  for (const basePath of basePaths) {
    try {
      // Level 1: top-level directories
      const entries = await Array.fromAsync(
        new Bun.Glob("*").scan({ cwd: basePath, onlyFiles: false })
      )

      for (const entry of entries) {
        if (entry.startsWith(".")) continue

        const fullPath = `${basePath}/${entry}`
        const node: TreeNode = {
          path: `/${entry}`,
          name: entry,
          expanded: false,
          selected: false,
          level: 0,
          children: [],
        }

        // Level 2: subdirectories
        try {
          const subEntries = await Array.fromAsync(
            new Bun.Glob("*").scan({ cwd: fullPath, onlyFiles: false })
          )

          for (const subEntry of subEntries) {
            if (subEntry.startsWith(".")) continue

            node.children!.push({
              path: `/${entry}/${subEntry}`,
              name: subEntry,
              expanded: false,
              selected: false,
              level: 1,
            })
          }

          if (node.children!.length === 0) {
            delete node.children
          }
        } catch {
          // Can't read subdirectories, skip
          delete node.children
        }

        nodes.push(node)
      }
    } catch {
      // Can't read this base path, skip
    }
  }

  return nodes.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Flatten tree for display (only show expanded nodes)
 */
function flattenTree(nodes: TreeNode[]): TreeNode[] {
  const flat: TreeNode[] = []

  for (const node of nodes) {
    flat.push(node)
    if (node.expanded && node.children) {
      flat.push(...node.children)
    }
  }

  return flat
}

/**
 * Render the tree view
 */
function renderTree(state: TreeSelectState): string {
  const lines: string[] = []

  lines.push("\n📁 Select directories to include:\n")
  lines.push("   ↑↓: Navigate  →: Expand  ←: Collapse  Space: Toggle  Enter: Confirm\n")

  for (let i = 0; i < state.flatView.length; i++) {
    const node = state.flatView[i]
    if (!node) continue

    const isCursor = i === state.cursor
    const indent = "  ".repeat(node.level + 1)

    const expandIcon =
      node.children && node.children.length > 0
        ? node.expanded
          ? "▼ "
          : "▶ "
        : "  "

    const checkbox = node.selected ? "[✓]" : "[ ]"
    const cursor = isCursor ? "→ " : "  "

    lines.push(`${cursor}${indent}${checkbox} ${expandIcon}${node.name}`)
  }

  return lines.join("\n")
}

/**
 * Run interactive tree selection
 */
export async function selectDirectories(diskPaths: string[]): Promise<string[]> {
  // Scan directories
  const nodes = await scanDirectories(diskPaths)

  if (nodes.length === 0) {
    return []
  }

  const state: TreeSelectState = {
    nodes,
    flatView: flattenTree(nodes),
    cursor: 0,
  }

  return new Promise((resolve) => {
    // Clear screen and hide cursor
    process.stdout.write("\x1b[2J\x1b[0f\x1b[?25l")

    // Render initial view
    process.stdout.write(renderTree(state))

    // Set raw mode to capture key presses
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding("utf8")

    const onData = (key: string) => {
      // Handle key presses
      if (key === "\u0003" || key === "\u001b") {
        // Ctrl+C or ESC - cancel
        cleanup()
        resolve([])
        return
      }

      if (key === "\r" || key === "\n") {
        // Enter - confirm selection
        cleanup()
        const selected = collectSelected(state.nodes)
        resolve(selected)
        return
      }

      if (key === " ") {
        // Space - toggle selection
        const current = state.flatView[state.cursor]
        if (!current) return

        current.selected = !current.selected

        // If parent is selected, select all children
        if (current.selected && current.children) {
          for (const child of current.children) {
            child.selected = true
          }
        }

        // If parent is deselected, deselect all children
        if (!current.selected && current.children) {
          for (const child of current.children) {
            child.selected = false
          }
        }

        // If child is selected, check if we should select parent
        if (current.level === 1 && current.selected) {
          const parent = state.nodes.find((n) =>
            n.children?.some((c) => c === current)
          )
          if (parent && parent.children?.every((c) => c.selected)) {
            parent.selected = true
          }
        }

        redraw()
        return
      }

      if (key === "\u001b[A") {
        // Up arrow
        state.cursor = Math.max(0, state.cursor - 1)
        redraw()
        return
      }

      if (key === "\u001b[B") {
        // Down arrow
        state.cursor = Math.min(state.flatView.length - 1, state.cursor + 1)
        redraw()
        return
      }

      if (key === "\u001b[C") {
        // Right arrow - expand
        const current = state.flatView[state.cursor]
        if (!current) return

        if (current.children && current.children.length > 0) {
          current.expanded = true
          state.flatView = flattenTree(state.nodes)
          redraw()
        }
        return
      }

      if (key === "\u001b[D") {
        // Left arrow - collapse
        const current = state.flatView[state.cursor]
        if (!current) return

        if (current.expanded) {
          current.expanded = false
          state.flatView = flattenTree(state.nodes)
          redraw()
        }
        return
      }
    }

    const redraw = () => {
      process.stdout.write("\x1b[2J\x1b[0f")
      process.stdout.write(renderTree(state))
    }

    const cleanup = () => {
      process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stdin.removeListener("data", onData)
      process.stdout.write("\x1b[?25h") // Show cursor
      process.stdout.write("\n")
    }

    process.stdin.on("data", onData)
  })
}

/**
 * Collect all selected paths from tree
 */
function collectSelected(nodes: TreeNode[]): string[] {
  const selected: string[] = []

  for (const node of nodes) {
    if (node.selected) {
      selected.push(node.path)
    }
    if (node.children) {
      for (const child of node.children) {
        if (child.selected && !node.selected) {
          selected.push(child.path)
        }
      }
    }
  }

  return selected
}

/**
 * Effect wrapper for tree selection
 */
export const selectDirectoriesEffect = (
  diskPaths: string[]
): Effect.Effect<string[], Error> =>
  Effect.tryPromise({
    try: () => selectDirectories(diskPaths),
    catch: (error) => new Error(`Failed to select directories: ${error}`),
  })
