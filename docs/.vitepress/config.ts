import { defineConfig } from 'vitepress'

const SITE_URL = 'https://learn.meshguard.app'
const SITE_TITLE = 'MeshGuard Learn'
const SITE_DESCRIPTION =
  'Guides, comparisons, and conceptual deep dives on AI agent governance. Learn how to design, implement, and operate trustworthy autonomous agent systems with MeshGuard.'

export default defineConfig({
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  appearance: 'force-dark',
  cleanUrls: true,
  ignoreDeadLinks: true,  // Ignore links to pages not yet created
  lastUpdated: true,

  // Auto-generates sitemap.xml from every built page
  sitemap: {
    hostname: SITE_URL,
    transformItems: (items) =>
      items.map((item) => ({
        ...item,
        changefreq: 'weekly',
        priority: item.url === '' || item.url === '/' ? 1.0 : 0.8,
      })),
  },

  head: [
    ['link', { rel: 'icon', href: '/logo.png' }],
    ['meta', { name: 'theme-color', content: '#00D4AA' }],
    ['meta', { name: 'robots', content: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1' }],
    ['meta', { name: 'googlebot', content: 'index, follow' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: SITE_TITLE }],
    ['meta', { property: 'og:image', content: 'https://meshguard.app/og-image.png' }],
    ['meta', { property: 'og:locale', content: 'en_US' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:site', content: '@MeshGuardApp' }],
    ['meta', { name: 'twitter:creator', content: '@MeshGuardApp' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    [
      'script',
      { type: 'application/ld+json' },
      JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'EducationalOrganization',
        name: SITE_TITLE,
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        publisher: {
          '@type': 'Organization',
          name: 'MeshGuard',
          url: 'https://meshguard.app',
          logo: 'https://meshguard.app/logo.png',
        },
        about: 'AI agent governance, identity, policy, audit, trust scoring',
        inLanguage: 'en-US',
      }),
    ],
  ],

  // Per-page canonical URL + OG title/description
  transformPageData(pageData) {
    const canonicalUrl = `${SITE_URL}/${pageData.relativePath}`
      .replace(/index\.md$/, '')
      .replace(/\.md$/, '')
    const title = pageData.frontmatter.title || pageData.title || SITE_TITLE
    const description =
      pageData.frontmatter.description || pageData.description || SITE_DESCRIPTION

    pageData.frontmatter.head ??= []
    pageData.frontmatter.head.push(
      ['link', { rel: 'canonical', href: canonicalUrl }],
      ['meta', { property: 'og:url', content: canonicalUrl }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { name: 'twitter:title', content: title }],
      ['meta', { name: 'twitter:description', content: description }],
    )
  },

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
            { text: 'MeshGuard vs Microsoft Purview', link: '/compare/meshguard-vs-microsoft-purview' },
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
            { text: 'Governing Claude Code Agents', link: '/guides/governing-claude-code-agents' },
            { text: 'Governing OpenAI Agents', link: '/guides/governing-openai-agents' },
            { text: 'Governing Bedrock Agents', link: '/guides/governing-bedrock-agents' },
            { text: 'Governing Vertex AI Agents', link: '/guides/governing-vertex-ai-agents' },
            { text: 'MeshGuard for Small Business', link: '/guides/meshguard-for-small-business' },
            { text: 'Governing Microsoft Copilot', link: '/guides/governing-microsoft-copilot' },
            { text: 'Personal vs Enterprise Governance', link: '/guides/personal-vs-enterprise-governance' },
            { text: 'Understanding the Analytics Dashboard', link: '/guides/understanding-analytics-dashboard' },
            { text: 'Implementing Trust Scores', link: '/guides/implementing-trust-scores' },
            { text: 'Monitoring Agent Behavior', link: '/guides/monitoring-agent-behavior' },
            { text: 'Securing Agent Delegation', link: '/guides/securing-agent-delegation' },
            { text: 'Memory Quarantine', link: '/guides/memory-quarantine' },
            { text: 'Data Exfiltration Prevention', link: '/guides/exfiltration-prevention' },
            { text: 'Guardian Sidecar Deployment', link: '/guides/deploying-guardian-sidecar' },
            { text: 'OpenTelemetry for Agent Governance', link: '/guides/opentelemetry-agent-governance' },
            { text: 'Infrastructure as Code with Terraform', link: '/guides/terraform-agent-governance' },
            { text: 'CI/CD Policy Checks with GitHub Actions', link: '/guides/github-actions-policy-checks' },
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
            { text: 'Behavioral Trust Scoring', link: '/concepts/behavioral-trust-scoring' },
            { text: 'Anomaly Detection in Agent Meshes', link: '/concepts/anomaly-detection-agents' },
            { text: 'Delegation Chains Deep Dive', link: '/concepts/delegation-chains-deep-dive' },
            { text: 'Trust Graph Architecture', link: '/concepts/trust-graph-architecture' },
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
