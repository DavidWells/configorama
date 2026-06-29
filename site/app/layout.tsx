import { Footer, LastUpdated, Layout, Navbar } from 'nextra-theme-docs'
import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-docs/style.css'
import './globals.css'

export const metadata = {
  metadataBase: new URL('https://configorama.netlify.app'),
  title: {
    default: 'Configorama Docs',
    template: '%s - Configorama'
  },
  description: 'Resolve, inspect, and safely audit dynamic configuration files.',
  openGraph: {
    url: './',
    siteName: 'Configorama Docs',
    locale: 'en_US',
    type: 'website'
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const pageMap = await getPageMap()

  const navbar = (
    <Navbar
      logo={
        <span className="nav-brand">
          <strong>Configorama</strong>
          <span className="nav-tagline">Modern config for humans &amp; agents</span>
        </span>
      }
      projectLink="https://github.com/DavidWells/configorama"
    />
  )

  const footer = <Footer>MIT {new Date().getFullYear()} David Wells</Footer>

  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head faviconGlyph="C" />
      <body>
        <Layout
          pageMap={pageMap}
          navbar={navbar}
          footer={footer}
          docsRepositoryBase="https://github.com/DavidWells/configorama/blob/master/site/content"
          editLink="Edit this page on GitHub"
          feedback={{ content: 'Question? Give feedback' }}
          lastUpdated={<LastUpdated locale="en-US">Last updated on</LastUpdated>}
          sidebar={{ defaultMenuCollapseLevel: 1, autoCollapse: true }}
          toc={{ float: true }}
          navigation={{ prev: true, next: true }}
          darkMode
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}
