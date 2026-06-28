import { useMDXComponents as getDocsMDXComponents } from 'nextra-theme-docs'
import { Callout, Cards, FileTree, Steps, Tabs } from 'nextra/components'

const docsComponents = getDocsMDXComponents()

export function useMDXComponents(components?: Record<string, React.ComponentType>) {
  return {
    ...docsComponents,
    Callout,
    Cards,
    FileTree,
    Steps,
    Tabs,
    ...components
  }
}
