import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'MeshGuard Learn',
  description: 'Guides, comparisons, and deep dives on AI agent governance',
  appearance: 'force-dark',
  
  head: [
    ['link', { rel: 'icon', href: '/logo.png' }],
    ['meta', { name: 'theme-color', content: '#00D4AA' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
  ],

  themeConfig: {
    logo: '/logo.png',
    
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Compare', link: '/compare/' },
      { text: 'Guides', link: '/guides/' },
      { text: 'Concepts', link: '/concepts/' },
      { text: 'MeshGuard', link: 'https://meshguard.app' },
    ],

    sidebar: {
      '/compare/': [
        {
          text: 'Comparisons',
          items: [
            { text: 'Overview', link: '/compare/' },
            { text: 'MeshGuard vs Descope', link: '/compare/meshguard-vs-descope' },
          ]
        }
      ],
      '/guides/': [
        {
          text: 'Guides',
          items: [
            { text: 'Overview', link: '/guides/' },
          ]
        }
      ],
      '/concepts/': [
        {
          text: 'Concepts',
          items: [
            { text: 'Overview', link: '/concepts/' },
          ]
        }
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/dbhurley/meshguard' },
    ],

    footer: {
      message: 'Built for the agentic era.',
      copyright: '© 2026 MeshGuard'
    },

    search: {
      provider: 'local'
    },
  },
})
