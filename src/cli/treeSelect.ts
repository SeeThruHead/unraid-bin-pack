import { Effect } from "effect";

interface TreeNode {
  path: string;
  name: string;
  children?: TreeNode[];
  expanded: boolean;
  selected: boolean;
  level: number;
}

interface TreeSelectState {
  nodes: TreeNode[];
  flatView: TreeNode[];
  cursor: number;
}

async function scanDirectories(basePaths: string[]): Promise<TreeNode[]> {
  const nodeMap = new Map<string, TreeNode>();

  for (const basePath of basePaths) {
    try {
      const entries = await Array.fromAsync(
        new Bun.Glob("*").scan({ cwd: basePath, onlyFiles: false })
      );

      for (const entry of entries) {
        if (entry.startsWith(".")) continue;

        const fullPath = `${basePath}/${entry}`;
        const nodePath = `/${entry}`;

        const node =
          nodeMap.get(nodePath) ??
          (() => {
            const newNode: TreeNode = {
              path: nodePath,
              name: entry,
              expanded: false,
              selected: false,
              level: 0,
              children: []
            };
            nodeMap.set(nodePath, newNode);
            return newNode;
          })();

        try {
          const subEntries = await Array.fromAsync(
            new Bun.Glob("*").scan({ cwd: fullPath, onlyFiles: false })
          );

          const childrenMap = new Map<string, TreeNode>();
          if (node.children) {
            for (const child of node.children) {
              childrenMap.set(child.name, child);
            }
          }

          for (const subEntry of subEntries) {
            if (subEntry.startsWith(".")) continue;

            if (!childrenMap.has(subEntry)) {
              childrenMap.set(subEntry, {
                path: `/${entry}/${subEntry}`,
                name: subEntry,
                expanded: false,
                selected: false,
                level: 1
              });
            }
          }

          node.children = Array.from(childrenMap.values()).sort((a, b) =>
            a.name.localeCompare(b.name)
          );

          if (node.children.length === 0) {
            delete node.children;
          }
        } catch {}
      }
    } catch {}
  }

  return Array.from(nodeMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function flattenTree(nodes: TreeNode[]): TreeNode[] {
  const flat: TreeNode[] = [];

  for (const node of nodes) {
    flat.push(node);
    if (node.expanded && node.children) {
      flat.push(...node.children);
    }
  }

  return flat;
}

function renderTree(state: TreeSelectState): string {
  const lines: string[] = [];

  lines.push("\n📁 Select directories to include:\n");
  lines.push("   ↑↓: Navigate  →: Expand  ←: Collapse  Space: Toggle  Enter: Confirm\n");

  const nodeLines = state.flatView.map((node, i) => {
    const isCursor = i === state.cursor;
    const indent = "  ".repeat(node.level + 1);

    const expandIcon =
      node.children && node.children.length > 0 ? (node.expanded ? "▼ " : "▶ ") : "  ";

    const checkbox = node.selected ? "[✓]" : "[ ]";
    const cursor = isCursor ? "→ " : "  ";

    return `${cursor}${indent}${checkbox} ${expandIcon}${node.name}`;
  });

  return [...lines, ...nodeLines].join("\n");
}

export async function selectDirectories(diskPaths: string[]): Promise<string[]> {
  const nodes = await scanDirectories(diskPaths);

  if (nodes.length === 0) {
    return [];
  }

  const state: TreeSelectState = {
    nodes,
    flatView: flattenTree(nodes),
    cursor: 0
  };

  return new Promise((resolve) => {
    process.stdout.write("\x1b[2J\x1b[0f\x1b[?25l");

    process.stdout.write(renderTree(state));

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    const onData = (key: string) => {
      if (key === "\u0003" || key === "\u001b") {
        cleanup();
        resolve([]);
        return;
      }

      if (key === "\r" || key === "\n") {
        cleanup();
        const selected = collectSelected(state.nodes);
        resolve(selected);
        return;
      }

      if (key === " ") {
        const current = state.flatView[state.cursor];
        if (!current) return;

        current.selected = !current.selected;

        if (current.selected && current.children) {
          for (const child of current.children) {
            child.selected = true;
          }
        }

        if (!current.selected && current.children) {
          for (const child of current.children) {
            child.selected = false;
          }
        }

        if (current.level === 1 && current.selected) {
          const parent = state.nodes.find((n) => n.children?.some((c) => c === current));
          if (parent?.children?.every((c) => c.selected)) {
            parent.selected = true;
          }
        }

        redraw();
        return;
      }

      if (key === "\u001b[A") {
        state.cursor = Math.max(0, state.cursor - 1);
        redraw();
        return;
      }

      if (key === "\u001b[B") {
        state.cursor = Math.min(state.flatView.length - 1, state.cursor + 1);
        redraw();
        return;
      }

      if (key === "\u001b[C") {
        const current = state.flatView[state.cursor];
        if (!current) return;

        if (current.children && current.children.length > 0) {
          current.expanded = true;
          state.flatView = flattenTree(state.nodes);
          redraw();
        }
        return;
      }

      if (key === "\u001b[D") {
        const current = state.flatView[state.cursor];
        if (!current) return;

        if (current.expanded) {
          current.expanded = false;
          state.flatView = flattenTree(state.nodes);
          redraw();
        }
        return;
      }
    };

    const redraw = () => {
      process.stdout.write("\x1b[2J\x1b[0f");
      process.stdout.write(renderTree(state));
    };

    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stdout.write("\x1b[?25h");
      process.stdout.write("\n");
    };

    process.stdin.on("data", onData);
  });
}

function collectSelected(nodes: TreeNode[]): string[] {
  const selected: string[] = [];

  for (const node of nodes) {
    if (node.selected) {
      selected.push(node.path);
    }
    if (node.children) {
      for (const child of node.children) {
        if (child.selected && !node.selected) {
          selected.push(child.path);
        }
      }
    }
  }

  return selected;
}

export const selectDirectoriesEffect = (diskPaths: string[]): Effect.Effect<string[], Error> =>
  Effect.tryPromise({
    try: () => selectDirectories(diskPaths),
    catch: (error) => new Error(`Failed to select directories: ${error}`)
  });
