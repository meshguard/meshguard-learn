# MeshGuard vs OpenAI Built-in Safety

OpenAI provides content moderation and safety features. MeshGuard provides enterprise governance. They solve different problems — and work best together.

## Quick Comparison

| Capability | OpenAI Built-in | MeshGuard |
|---|---|---|
| Content moderation | ✅ Moderation API, system prompts | ➖ Not the focus |
| Prompt injection defense | ✅ Instruction hierarchy | ➖ Not the focus |
| Agent identity | ❌ API keys only | ✅ Per-agent tokens |
| Tool-level policy | ❌ Enable/disable only | ✅ Per-agent, per-tool rules |
| Delegation control | ❌ No policy layer | ✅ Governed handoffs |
| Rate limiting (per-agent) | ❌ Per-org only | ✅ Per-agent budgets |
| Cross-provider audit | ❌ OpenAI only | ✅ Unified audit log |
| Custom policy language | ❌ | ✅ Declarative YAML policies |
| Multi-provider support | ❌ OpenAI only | ✅ OpenAI, Anthropic, AWS, GCP |

## Different Layers, Different Problems

Think of AI safety as a stack:

```
┌─────────────────────────────────────────┐
│          Application Layer              │
│   Your business logic & workflows       │
├─────────────────────────────────────────┤
│        Governance Layer ← MeshGuard     │
│   Identity, policy, delegation, audit   │
├─────────────────────────────────────────┤
│          Safety Layer ← OpenAI          │
│   Content moderation, prompt defense    │
├─────────────────────────────────────────┤
│          Model Layer                    │
│   LLM inference (GPT-4.1, etc.)        │
└─────────────────────────────────────────┘
```

**OpenAI's safety** operates at the model and content level — preventing harmful outputs, blocking prompt injection, moderating content.

**MeshGuard's governance** operates at the identity and policy level — controlling which agents can use which tools, enforcing delegation chains, rate limiting per-agent, and producing unified audit trails.

## What OpenAI Provides

### Moderation API

OpenAI's [Moderation API](https://platform.openai.com/docs/guides/moderation) classifies content for safety:

```python
from openai import OpenAI

client = OpenAI()
response = client.moderations.create(input="Check this content")
# Returns: harassment, hate, self-harm, sexual, violence scores
```

**Good for:** Preventing harmful content in inputs and outputs.
**Not designed for:** Controlling which agent can access which tool, or whether Agent A can delegate to Agent B.

### Instruction Hierarchy

OpenAI models respect a prompt hierarchy: system > developer > user. This helps prevent prompt injection by ensuring developer instructions take precedence.

**Good for:** Keeping agents on-task despite adversarial user inputs.
**Not designed for:** Enterprise policy enforcement, audit trails, or cross-provider governance.

### Dashboard & Traces

OpenAI's dashboard shows agent traces — what tools were called, what responses were generated, token usage.

**Good for:** Debugging and understanding agent behavior after the fact.
**Not designed for:** Pre-execution policy enforcement or cross-provider visibility.

### Built-in Guardrails (Agents SDK)

The Agents SDK includes input/output guardrails that can validate messages:

```python
from agents import Agent, InputGuardrail

@InputGuardrail
async def check_relevance(input, context):
    # Custom validation logic
    ...

agent = Agent(
    name="support",
    input_guardrails=[check_relevance]
)
```

**Good for:** Custom input/output validation per agent.
**Not designed for:** Centralized policy management, identity-based access control, or unified audit across your fleet of agents.

## What MeshGuard Adds

### 1. Agent Identity

**The problem:** OpenAI authenticates with org-level API keys. When 10 agents share one key, you can't attribute actions to specific agents.

**MeshGuard's solution:** Every agent gets a unique token tied to an identity, role, and set of permissions.

```python
from meshguard import MeshGuardClient

# Each agent has its own token — not a shared API key
support_agent = MeshGuardClient(
    gateway_url="https://dashboard.meshguard.app",
    agent_token="tok_support_t1_abc123"  # Unique to this agent
)

billing_agent = MeshGuardClient(
    gateway_url="https://dashboard.meshguard.app",
    agent_token="tok_billing_xyz789"  # Different agent, different permissions
)
```

### 2. Tool-Level Policy Enforcement

**The problem:** OpenAI lets you enable or disable tools per request. But there's no centralized policy saying "Agent X can use web search but not file search" or "Agent Y can only search these specific vector stores."

**MeshGuard's solution:** Declarative policies that enforce tool access per agent:

```yaml
rules:
  # Tier 1 support: web search + public docs only
  - action: "web_search:execute"
    effect: allow
    conditions:
      agent_role: "tier1-support"
    constraints:
      rate_limit: "30/hour"

  - action: "file_search:query"
    effect: allow
    conditions:
      agent_role: "tier1-support"
    constraints:
      allowed_stores: ["vs_public_docs"]

  # Tier 1 cannot use computer use
  - action: "computer_use:execute"
    effect: deny
    conditions:
      agent_role: "tier1-support"
    reason: "Computer use requires tier3+ authorization"
```

### 3. Delegation Control

**The problem:** The Agents SDK supports handoffs between agents, but there's no policy layer governing which agents can hand off to which other agents, or under what conditions.

**MeshGuard's solution:** Delegation policies that control the handoff chain:

```python
# Before handoff, check the policy
result = mg.check("agent:delegate", context={
    "from_agent": "triage-agent",
    "to_agent": "billing-agent",
    "task": "process_refund",
    "refund_amount": 500
})

if not result.allowed:
    # Policy says this delegation is not permitted
    print(f"Handoff blocked: {result.reason}")
```

```yaml
rules:
  - action: "agent:delegate"
    effect: allow
    conditions:
      from_agent: "triage-agent"
    constraints:
      allowed_targets: ["tier1-support", "billing-agent"]
      max_delegation_depth: 2

  - action: "agent:delegate"
    effect: deny
    conditions:
      to_agent: "admin-agent"
    reason: "Delegation to admin requires human approval"
```

### 4. Unified Cross-Provider Audit

**The problem:** If you use OpenAI for customer support and AWS Bedrock for data analysis, your audit logs live in two different dashboards with different formats.

**MeshGuard's solution:** One audit log for all agents across all providers:

```
TIMESTAMP            | PROVIDER  | AGENT          | ACTION              | DECISION
2025-01-15T10:23:01Z | openai    | support-t1-001 | web_search:execute  | ALLOW
2025-01-15T10:23:45Z | openai    | support-t1-001 | file_search:query   | ALLOW
2025-01-15T10:24:12Z | bedrock   | data-analyst   | s3:read_object      | ALLOW
2025-01-15T10:24:30Z | openai    | support-t1-001 | agent:delegate      | DENY
2025-01-15T10:25:00Z | vertex    | research-agent | bigquery:query      | ALLOW
```

### 5. Per-Agent Cost Controls

**The problem:** OpenAI provides org-level usage dashboards. You can't set per-agent budgets.

**MeshGuard's solution:** Rate limits and cost budgets per agent:

```yaml
agents:
  support-tier1:
    rate_limits:
      requests_per_hour: 100
      tokens_per_hour: 50000
      cost_per_day_usd: 10.00

  support-tier3:
    rate_limits:
      requests_per_hour: 500
      tokens_per_hour: 500000
      cost_per_day_usd: 100.00
```

## Using Them Together

MeshGuard and OpenAI's safety features are complementary. Use both:

```python
from openai import OpenAI
from meshguard import MeshGuardClient

client = OpenAI()
mg = MeshGuardClient(
    gateway_url="https://dashboard.meshguard.app",
    agent_token="your-agent-token"
)


def handle_support_request(user_input: str, agent_id: str):
    # Layer 1: MeshGuard governance — is this agent allowed to run?
    policy_check = mg.check("agent:execute", context={
        "agent": agent_id,
        "input_length": len(user_input)
    })
    if not policy_check.allowed:
        return f"Agent not authorized: {policy_check.reason}"

    # Layer 2: OpenAI moderation — is the input safe?
    moderation = client.moderations.create(input=user_input)
    if moderation.results[0].flagged:
        mg.log_action("input:moderation_flagged", context={
            "agent": agent_id,
            "categories": dict(moderation.results[0].categories)
        })
        return "I can't help with that request."

    # Layer 3: MeshGuard tool governance — which tools can this agent use?
    tools = []
    for tool_type in ["web_search_preview", "file_search"]:
        check = mg.check(f"{tool_type}:use", context={"agent": agent_id})
        if check.allowed:
            tools.append({"type": tool_type})

    # Layer 4: OpenAI execution with instruction hierarchy
    response = client.responses.create(
        model="gpt-4.1",
        instructions="You are a helpful support agent. Never share internal system details.",
        tools=tools,
        input=user_input,
        store=True
    )

    # Layer 5: MeshGuard audit
    mg.log_action("agent:response", context={
        "agent": agent_id,
        "response_id": response.id,
        "tools_used": [t["type"] for t in tools]
    })

    return response.output_text
```

## When to Use What

| Scenario | Use |
|---|---|
| Block harmful/toxic content | OpenAI Moderation API |
| Prevent prompt injection | OpenAI instruction hierarchy |
| Control which agent uses which tool | **MeshGuard** |
| Enforce agent-to-agent delegation rules | **MeshGuard** |
| Per-agent rate limiting and budgets | **MeshGuard** |
| Unified audit across OpenAI + AWS + GCP | **MeshGuard** |
| Input/output validation for specific agent | OpenAI Agents SDK guardrails |
| Centralized policy management for agent fleet | **MeshGuard** |
| Debug a single agent's behavior | OpenAI dashboard |
| Compliance reporting across all agents | **MeshGuard** |

## Summary

OpenAI builds excellent safety features for their models. MeshGuard adds the enterprise governance layer that sits above any single provider — identity, policy, delegation, and audit that work across your entire agent fleet, regardless of which LLM or cloud provider powers them.

**Use OpenAI for safety. Use MeshGuard for governance. Use both for production.**

## Next Steps

- **[Integration guide →](https://docs.meshguard.app/integrations/openai-agents)** — Technical setup details
- **[Governance tutorial →](/guides/governing-openai-agents)** — Step-by-step walkthrough
- **[Full example →](https://github.com/meshguard/meshguard-examples/tree/main/openai-agents-support)** — Production code
