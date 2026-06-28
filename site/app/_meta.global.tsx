import type { MetaRecord } from 'nextra'

export default {
  index: {
    title: 'Home',
    display: 'hidden'
  },
  guides: 'Guides',
  concepts: {
    title: 'Concepts',
    theme: { typesetting: 'article' }
  },
  reference: 'Reference',
  _separator_more: {
    type: 'separator',
    title: 'More'
  },
  changelog: {
    title: 'Changelog',
    theme: { typesetting: 'article' }
  },
  glossary: 'Glossary',
  github: {
    title: 'GitHub',
    href: 'https://github.com/DavidWells/configorama'
  }
} satisfies MetaRecord
