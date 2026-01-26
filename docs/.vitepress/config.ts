import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'MeshGuard Learn',
  description: 'Guides, comparisons, and deep dives on AI agent governance',
  appearance: 'force-dark',
  ignoreDeadLinks: true,  // Ignore links to pages not yet created
  
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
            { text: 'MeshGuard vs OPA', link: '/compare/meshguard-vs-opa' },
            { text: 'MeshGuard vs LangChain Guardrails', link: '/compare/meshguard-vs-langchain-guardrails' },
            { text: 'MeshGuard vs Azure AI Content Safety', link: '/compare/meshguard-vs-azure-content-safety' },
            { text: 'MeshGuard vs Constitutional AI', link: '/compare/meshguard-vs-constitutional-ai' },
          ]
        }
      ],
      '/guides/': [
        {
          text: 'Guides',
          items: [
            { text: 'Overview', link: '/guides/' },
            { text: 'Governing LangChain Agents', link: '/guides/governing-langchain-agents' },
            { text: 'Securing CrewAI', link: '/guides/securing-crewai' },
            { text: 'Preventing Prompt Injection', link: '/guides/preventing-prompt-injection' },
            { text: 'Building a Customer Service Agent', link: '/guides/customer-service-agent' },
            { text: 'Rate Limiting AutoGPT', link: '/guides/rate-limiting-autogpt' },
            { text: 'Governing Clawdbot Agents', link: '/guides/governing-clawdbot-agents' },
            { text: 'MeshGuard for Small Business', link: '/guides/meshguard-for-small-business' },
            { text: 'Personal vs Enterprise Governance', link: '/guides/personal-vs-enterprise-governance' },
          ]
        }
      ],
      '/concepts/': [
        {
          text: 'Concepts',
          items: [
            { text: 'Overview', link: '/concepts/' },
            { text: 'What is Agent Governance?', link: '/concepts/what-is-agent-governance' },
            { text: 'Trust Tiers Explained', link: '/concepts/trust-tiers' },
            { text: 'Delegation Chains', link: '/concepts/delegation-chains' },
            { text: 'Policy Design Patterns', link: '/concepts/policy-design-patterns' },
            { text: 'Principle of Least Privilege', link: '/concepts/least-privilege' },
            { text: 'Audit Logs for Compliance', link: '/concepts/audit-logs' },
          ]
        }
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/meshguard/meshguard' },
      { icon: 'x', link: 'https://x.com/MeshGuardApp' },
      { icon: 'linkedin', link: 'https://www.linkedin.com/company/meshguard/' },
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
