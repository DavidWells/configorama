import type { MetaRecord } from 'nextra'

export default {
  index: {
    title: 'Home',
    display: 'hidden'
  },
  gettingStarted: {
    title: 'Getting started',
    href: '/guides/get-started'
  },
  cli: 'CLI',
  api: 'API',
  forAgents: {
    title: 'For agents',
    href: '/guides/for-agents'
  },
  'variable-sources': 'Variable sources',
  variables: 'Variable types',
  'filters-functions': 'Filters and functions',
  schemas: 'Schemas',
  guides: 'Guides',
  concepts: {
    title: 'Concepts',
    theme: { typesetting: 'article' }
  },
  credits: {
    title: 'Credits',
    theme: { typesetting: 'article' }
  },
  _separator_more: {
    type: 'separator',
    title: 'More'
  },
  glossary: 'Glossary',
  github: {
    title: 'GitHub',
    href: 'https://github.com/DavidWells/configorama'
  }
} satisfies MetaRecord
