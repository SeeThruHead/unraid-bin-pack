import { Stack, Text, Tree, LoadingOverlay, Group, Button, Checkbox } from '@mantine/core'
import { useTree } from '@mantine/core'
import { IconChevronDown } from '@tabler/icons-react'
import type { RenderTreeNodePayload } from '@mantine/core'
import type { PatternResponse } from '../../../types'
import { consolidatePaths, expandPaths } from '../../../lib/pathConsolidation'

const toTreeData = (patterns: PatternResponse[]) =>
  patterns.map((p) => ({
    value: p.pattern,
    label: p.name,
    children: p.children.map(child => ({
      value: `${p.pattern}/${child}`,
      label: child,
    })),
  }))

interface PathFilterTreeProps {
  patterns: PatternResponse[]
  selectedPaths: string[]
  loading: boolean
  onChange: (paths: string[]) => void
}

const renderTreeNode = (
  { node, expanded, hasChildren, elementProps, tree }: RenderTreeNodePayload,
  onChange: (paths: string[]) => void,
  patterns: PatternResponse[]
) => {
  const checked = tree.isNodeChecked(node.value)
  const indeterminate = tree.isNodeIndeterminate(node.value)

  return (
    <Group gap="xs" {...elementProps}>
      <Checkbox.Indicator
        checked={checked}
        indeterminate={indeterminate}
        onClick={() => {
          !checked ? tree.checkNode(node.value) : tree.uncheckNode(node.value)
          setTimeout(() => onChange(consolidatePaths(tree.checkedState, patterns)), 0)
        }}
      />

      <Group gap={5} onClick={() => tree.toggleExpanded(node.value)}>
        <span>{node.label}</span>

        {hasChildren && (
          <IconChevronDown
            size={14}
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          />
        )}
      </Group>
    </Group>
  )
}

export function PathFilterTree({ patterns, selectedPaths, loading, onChange }: PathFilterTreeProps) {
  const treeData = toTreeData(patterns)
  const tree = useTree({
    initialCheckedState: expandPaths(selectedPaths, patterns),
    initialExpandedState: Object.fromEntries(patterns.map(p => [p.pattern, false])),
  })

  const handleCheckAll = () => {
    tree.checkAllNodes()
    setTimeout(() => onChange(consolidatePaths(tree.checkedState, patterns)), 0)
  }

  const handleCheckNone = () => {
    tree.uncheckAllNodes()
    setTimeout(() => onChange(consolidatePaths(tree.checkedState, patterns)), 0)
  }

  return (
    <Stack gap="md" pos="relative">
      <LoadingOverlay visible={loading} />
      <Text size="sm" c="dimmed">
        Select specific folder patterns to consolidate
      </Text>
      {treeData.length > 0 && (
        <>
          <Group gap="xs" mb="md">
            <Button size="xs" variant="light" onClick={handleCheckAll}>
              Check All
            </Button>
            <Button size="xs" variant="light" onClick={handleCheckNone}>
              Check None
            </Button>
          </Group>
          <Tree
            data={treeData}
            tree={tree}
            levelOffset={23}
            expandOnClick={false}
            renderNode={(payload) => renderTreeNode(payload, onChange, patterns)}
          />
        </>
      )}
    </Stack>
  )
}
