---
title: Data Exfiltration Prevention for AI Agents
description: How MeshGuard detects and prevents sensitive data from leaking through public AI tools, with endpoint analysis, prompt inspection, and policy-driven enforcement.
outline: deep
---

# Data Exfiltration Prevention for AI Agents

How MeshGuard detects and prevents sensitive data from leaking through public AI tools, with endpoint analysis, prompt inspection, and policy-driven enforcement.

## The Exfiltration Problem

Every time an AI agent sends a prompt to an external model, data leaves your perimeter. That data might include customer PII, API keys, proprietary source code, health records, or internal business logic. The destination might be ChatGPT, Claude.ai, GitHub Copilot, Perplexity, or any of dozens of public AI services.

This isn't a hypothetical risk. Organizations routinely discover that:

- Customer support agents are pasting ticket contents (including names, emails, and order details) into public chat interfaces to draft responses.
- Developers are sending proprietary code to code completion services that may use the data for training.
- Research agents are submitting internal documents to AI search engines for summarization.
- Browser-based AI tools are silently sending selected text to external APIs.

Traditional DLP (Data Loss Prevention) tools weren't designed for this. They monitor email attachments, USB drives, and file uploads — not conversational AI interactions where sensitive data is woven into natural language prompts.

MeshGuard's exfiltration prevention module addresses this gap with three layers: **endpoint analysis** (where is the data going?), **prompt inspection** (what data is being sent?), and **policy enforcement** (should this be allowed?).

## Endpoint Analysis

The first step is knowing where data is being sent. MeshGuard maintains a registry of known public AI endpoints, categorized by type and risk level.

### Service Categories

| Category | Examples | Description |
|----------|----------|-------------|
| `chat` | ChatGPT, Claude.ai, Google Gemini, Microsoft Copilot | Conversational AI web interfaces |
| `api` | OpenAI API, Anthropic API, Hugging Face, Replicate, Groq, Mistral, Cohere | Direct API endpoints |
| `code` | GitHub Copilot, Cursor, Replit AI, Codeium, Tabnine | Code completion and editing tools |
| `search` | Perplexity, You.com, Phind | AI-powered search engines |
| `image` | DALL-E, Midjourney, Stability AI, Leonardo.AI | Image generation services |
| `assistant` | Character.AI, Poe, Grammarly, Jasper, Copy.ai, Writesonic, Notion AI | Writing assistants and general-purpose AI tools |
| `enterprise` | Azure OpenAI, Google Vertex AI | Enterprise deployments (may be allowed by policy) |

### Risk Levels

Each endpoint is assigned a risk level:

- **Critical** — Services known to use data for training or with unclear data handling policies
- **High** — Public AI services with bidirectional data flow
- **Medium** — Enterprise-grade services or services with limited data flow (e.g., image generation where only prompts are sent outbound)
- **Low** — Services with strong data handling commitments and enterprise agreements

### How Detection Works

MeshGuard matches outgoing request URLs against its endpoint registry using domain matching and optional path pattern matching. The registry covers 30+ services across all categories, with support for wildcard domains (e.g., `*.openai.azure.com`).

For URLs that don't match the built-in registry, you can add custom endpoint definitions for organization-specific services.

## Prompt Inspection

When an outgoing request targets a known AI endpoint (or any monitored URL), MeshGuard inspects the prompt content for sensitive data patterns.

### Detected Patterns

The inspector reuses the same pattern detection engine as [streaming content inspection](https://docs.meshguard.app/guide/streaming-security):

| Pattern | Risk Weight | Description |
|---------|-----------|-------------|
| `SSN` | 40 | Social Security Numbers |
| `CREDIT_CARD` | 35 | Credit card numbers |
| `API_KEY` | 30 | API keys and secrets |
| `PASSWORD` | 25 | Passwords in text |
| `HEALTH_DATA` | 30 | Medical record numbers, ICD codes |
| `PHONE` | 10 | Phone numbers |
| `EMAIL` | 10 | Email addresses |
| `IP_ADDRESS` | 5 | IP addresses |
| `PROMPT_INJECTION` | 50 | Prompt injection patterns (high weight because exfiltration via injection is a known attack vector) |

Plus custom keywords and regex patterns configured per policy.

### Risk Scoring

The inspector calculates a risk score (0-100) based on:

1. **Pattern weights** — Each detected pattern contributes its base weight multiplied by detection confidence.
2. **Target risk multiplier** — The score is adjusted by the target endpoint's risk level (critical: 1.0x, high: 0.9x, medium: 0.7x, low: 0.5x).
3. **Aggregate cap** — The raw score is capped at 100.

A prompt containing an SSN (weight 40, confidence 0.95) sent to a high-risk target (multiplier 0.9) produces a risk score of approximately 34. Add a credit card number and the score jumps to ~66.

### Actions

Based on the risk score and policy, MeshGuard takes one of four actions:

| Action | Behavior |
|--------|----------|
| `allow` | The request proceeds unchanged |
| `warn` | The request proceeds, but warnings are attached listing detected patterns |
| `redact` | Sensitive patterns are replaced with `[REDACTED]` before the request is sent |
| `block` | The request is blocked entirely and an incident is recorded |

## Policy Configuration

Exfiltration policies let you control which tools are allowed, which patterns trigger enforcement, and how violations are handled.

### Policy Structure

```yaml
name: corporate-exfiltration-policy
description: Block sensitive data from leaving via public AI tools
enabled: true

# Scope
orgId: org_abc123
# agentIds: [agent-1, agent-2]  # Optional: restrict to specific agents

# Target controls
allowedTools:
  - azure-openai           # Enterprise Azure deployment is OK
  - google-vertex-ai       # Vertex AI is OK
blockedTools:
  - character-ai           # Always block Character.AI
blockAllPublicAI: false    # Don't blanket-block (use per-tool controls)
allowEnterprise: true      # Enterprise endpoints are generally allowed

# Data controls
sensitivePatterns:
  - SSN
  - CREDIT_CARD
  - API_KEY
  - PASSWORD
  - HEALTH_DATA
customKeywords:
  - "INTERNAL_ONLY"
  - "PROJECT_ATLAS"
customRegex:
  - "\\bACME-\\d{6}\\b"

# Actions
defaultAction: warn
actionOverrides:
  - patternType: SSN
    action: block
  - patternType: CREDIT_CARD
    action: block
  - patternType: API_KEY
    action: block

# Notifications
notifyOnBlock: true
notifyOnWarn: false
notifyChannels:
  - "https://hooks.slack.com/services/T.../B.../..."

# Risk threshold
riskThreshold: 50
```

### Decision Logic

The policy evaluator follows this priority order:

1. **Explicitly blocked tools** — If the target tool is in the `blockedTools` list, block immediately.
2. **Block all public AI** — If `blockAllPublicAI` is true and the target is a public AI tool, block.
3. **Pattern-specific overrides** — If any detected pattern has an `actionOverride` of `block`, block.
4. **Risk threshold** — If the risk score exceeds `riskThreshold`, apply the `defaultAction`.
5. **No violations** — If no sensitive data is found and the tool is allowed, allow.

### Default Behavior (No Policy)

If no exfiltration policy is configured, MeshGuard applies sensible defaults:

- SSN, credit card, and API key detection triggers a `block`
- Risk scores above 50 trigger a `warn`
- Everything else is `allow`

## Incident Tracking

Every blocked or warned request creates an incident record containing:

- **Timestamp and target** — When it happened and where the data was going
- **Detected patterns** — What sensitive data was found and where in the prompt
- **Risk score** — The calculated risk score
- **Action taken** — Whether the request was blocked, warned, or redacted
- **Prompt preview** — First 500 characters of the prompt (for investigation)
- **Prompt hash** — SHA-256 for deduplication (detecting repeated exfiltration attempts)
- **Resolution status** — `open`, `acknowledged`, `resolved`, or `false_positive`

### Incident Dashboard

The incident summary provides aggregate views:

- **By status** — Open vs. acknowledged vs. resolved
- **By action** — How many blocks, warns, redactions, and allows
- **By tool** — Which AI tools are seeing the most violations
- **By risk level** — Distribution of critical, high, medium, and low risk incidents

Use this data to tune your policies. If a specific tool generates many false positives, consider moving it to the `allowedTools` list. If a pattern generates too many low-value warnings, adjust its action override.

## Implementation Examples

### Python: Inspect Before Sending

```python
from meshguard import MeshGuardClient

client = MeshGuardClient(
    gateway_url="https://dashboard.meshguard.app",
    agent_token="your-agent-token",
)

# Check a prompt before sending to external AI
result = client.check_exfiltration(
    url="https://api.openai.com/v1/chat/completions",
    prompt="Customer John Smith (SSN: 123-45-6789) wants a refund.",
    agent_id="support-agent-1",
)

if result.action == "block":
    print(f"Blocked: {result.reason}")
elif result.action == "redact":
    # Use the sanitized version
    safe_prompt = result.sanitized_prompt
    send_to_openai(safe_prompt)
elif result.action == "warn":
    for warning in result.warnings:
        log.warning(warning)
    send_to_openai(prompt)
else:
    send_to_openai(prompt)
```

### JavaScript: Middleware Pattern

```javascript
import { MeshGuardClient } from '@meshguard/sdk';

const client = new MeshGuardClient({
  gatewayUrl: 'https://dashboard.meshguard.app',
  agentToken: 'your-agent-token',
});

async function safeSend(targetUrl, prompt) {
  const check = await client.checkExfiltration({
    url: targetUrl,
    prompt,
    agentId: 'support-agent-1',
  });

  if (check.action === 'block') {
    throw new Error(`Exfiltration blocked: ${check.reason}`);
  }

  const safePrompt = check.action === 'redact'
    ? check.sanitizedPrompt
    : prompt;

  return fetch(targetUrl, {
    method: 'POST',
    body: JSON.stringify({ messages: [{ role: 'user', content: safePrompt }] }),
  });
}
```

### Adding Custom Endpoints

If your organization uses internal AI services that should be monitored:

```python
client.add_custom_endpoint({
    "id": "internal-llm",
    "name": "Internal LLM Service",
    "category": "api",
    "domains": ["llm.internal.company.com"],
    "riskLevel": "low",
    "description": "Company-hosted LLM",
    "dataFlowDirection": "bidirectional",
})
```

## Best Practices

### 1. Start in Warn Mode

Deploy exfiltration prevention with `defaultAction: warn` first. Review incidents for a week before switching to `block` for specific patterns. This avoids disrupting legitimate workflows.

### 2. Allow Enterprise Endpoints Explicitly

If your org uses Azure OpenAI or Google Vertex AI under an enterprise agreement, add them to `allowedTools`. Don't rely on `allowEnterprise: true` alone — be explicit about which enterprise deployments are sanctioned.

### 3. Use Custom Keywords for Proprietary Data

Pattern detection catches generic PII, but your organization has proprietary data that doesn't match standard patterns. Use `customKeywords` for project code names, internal classification markers, and domain-specific identifiers.

### 4. Monitor the Incident Dashboard

A spike in exfiltration incidents often indicates a new workflow or tool adoption that needs governance. Don't just block — investigate why the data is being sent and whether there's a sanctioned alternative.

### 5. Educate Your Team

Exfiltration prevention is most effective when users understand why it exists. A blocked request with a clear reason ("SSN detected in prompt to public AI tool") is a teaching moment. A silent block with no explanation breeds workarounds.

## Where This Connects

- [Streaming Content Inspection](https://docs.meshguard.app/guide/streaming-security) — The same pattern engine inspects both outgoing prompts and incoming LLM responses
- [Preventing Prompt Injection](/guides/preventing-prompt-injection) — Prompt injection is both a security threat and an exfiltration vector
- [Monitoring Agent Behavior](/guides/monitoring-agent-behavior) — Behavioral monitoring can detect exfiltration patterns that single-request inspection misses
- [Understanding the Analytics Dashboard](/guides/understanding-analytics-dashboard) — Exfiltration incidents appear in the analytics dashboard

Data exfiltration through AI tools is one of the fastest-growing data loss vectors in organizations adopting AI. Unlike traditional DLP, it requires understanding the context of AI interactions — where data is going, what it contains, and whether the destination is sanctioned. MeshGuard's exfiltration prevention bridges this gap by combining endpoint intelligence, content inspection, and policy enforcement into a single enforcement layer.
