# Governing OpenAI Agents with MeshGuard

Learn how to add enterprise governance — identity, policy enforcement, delegation control, and unified audit — to agents built with OpenAI's Agents SDK and Responses API.

## The Governance Gap

OpenAI provides powerful tools for building and observing agents:

- **Responses API** — Stateful, multi-turn agent conversations with built-in tools
- **Agents SDK** — Python framework for multi-agent orchestration and handoffs
- **Dashboard** — Traces, logs, and evaluations for what agents did

These tools tell you **what happened**. MeshGuard controls **what can happen**.

```
┌─────────────────────────────────────────────────────┐
│                    Without MeshGuard                 │
│                                                     │
│  User ──→ Agent ──→ Tools ──→ Actions               │
│                       ↓                              │
│               OpenAI Dashboard                       │
│              "Here's what happened"                  │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                    With MeshGuard                    │
│                                                     │
│  User ──→ Agent ──→ MeshGuard ──→ Tools ──→ Actions │
│                       ↓    ↓                         │
│                    Policy   Audit                    │
│                   "Is this  "Here's what             │
│                   allowed?"  was checked"            │
└─────────────────────────────────────────────────────┘
```

## What You'll Build

A customer support agent using the OpenAI Agents SDK with MeshGuard governance that:

1. **Identifies** each agent with a unique token
2. **Enforces** per-agent tool access policies
3. **Controls** agent-to-agent delegation
4. **Audits** every policy decision in a unified log

## Prerequisites

- Python 3.10+
- OpenAI API key
- MeshGuard account ([sign up free](https://meshguard.app))
- Basic familiarity with OpenAI's Responses API

```bash
pip install openai meshguard
```

## Step 1: Understand the Responses API

OpenAI's Responses API is the foundation of the Agents SDK. It provides stateful conversations with built-in tools:

```python
from openai import OpenAI

client = OpenAI()

# Simple agent with web search
response = client.responses.create(
    model="gpt-4.1",
    tools=[{"type": "web_search_preview"}],
    input="What's our current uptime status?"
)

print(response.output_text)
```

This works — but there's no control over:
- **Who** this agent is (just an API key)
- **What** it's allowed to search
- **Whether** it should have web search at all
- **How often** it can search

## Step 2: Add Agent Identity

MeshGuard gives each agent a unique identity with scoped permissions:

```python
from openai import OpenAI
from meshguard import MeshGuardClient

client = OpenAI()

# Each agent gets its own token — no shared API keys
mg = MeshGuardClient(
    gateway_url="https://dashboard.meshguard.app",
    agent_token="tok_support_tier1_abc123"  # Unique to this agent
)

# Now every action is tied to a specific agent identity
result = mg.check("web_search:execute", context={
    "agent": "tier1-support",
    "department": "customer-success",
    "environment": "production"
})
```

**Why this matters:** When three support agents share one OpenAI API key, you can't tell which agent searched for what. MeshGuard's per-agent tokens solve this — every action is attributed to a specific agent with a specific role.

## Step 3: Wrap Tool Calls with Policy

Create a governance layer that sits between your agent and OpenAI's tools:

```python
from openai import OpenAI
from meshguard import MeshGuardClient

client = OpenAI()
mg = MeshGuardClient(
    gateway_url="https://dashboard.meshguard.app",
    agent_token="tok_support_tier1_abc123"
)


class GovernedSupportAgent:
    """Support agent with per-tool governance."""

    TOOL_PERMISSIONS = {
        "web_search_preview": "web_search:execute",
        "file_search": "file_search:query",
        "computer_use_preview": "computer_use:execute"
    }

    def __init__(self, agent_id: str, role: str, tools: list):
        self.agent_id = agent_id
        self.role = role
        self.tools = tools

    def check_tool_access(self, tool_type: str, extra_context: dict = None) -> bool:
        """Check if this agent can use a specific tool."""
        action = self.TOOL_PERMISSIONS.get(tool_type, f"{tool_type}:use")
        context = {
            "agent": self.agent_id,
            "role": self.role,
            "tool": tool_type,
            **(extra_context or {})
        }

        result = mg.check(action, context=context)

        if not result.allowed:
            print(f"⛔ Tool '{tool_type}' blocked for {self.agent_id}: {result.reason}")

        return result.allowed

    def get_allowed_tools(self) -> list:
        """Filter tools to only those this agent is permitted to use."""
        return [
            tool for tool in self.tools
            if self.check_tool_access(tool["type"])
        ]

    def run(self, user_input: str):
        """Run the agent with only its permitted tools."""
        allowed_tools = self.get_allowed_tools()

        if not allowed_tools:
            return "I don't have the tools needed to help with that. Let me escalate."

        response = client.responses.create(
            model="gpt-4.1",
            tools=allowed_tools,
            input=user_input,
            store=True
        )

        # Audit the execution
        mg.log_action("agent:response", context={
            "agent": self.agent_id,
            "role": self.role,
            "tools_used": [t["type"] for t in allowed_tools],
            "response_id": response.id,
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens
        })

        return response.output_text


# Tier 1 agent — can search help docs, not internal systems
tier1 = GovernedSupportAgent(
    agent_id="support-t1-001",
    role="tier1-support",
    tools=[
        {"type": "web_search_preview"},
        {"type": "file_search", "vector_store_ids": ["vs_help_docs"]}
    ]
)

# Tier 3 agent — can search everything including internal systems
tier3 = GovernedSupportAgent(
    agent_id="support-t3-042",
    role="tier3-support",
    tools=[
        {"type": "web_search_preview"},
        {"type": "file_search", "vector_store_ids": ["vs_help_docs", "vs_internal_eng"]},
        {"type": "computer_use_preview"}
    ]
)
```

## Step 4: Govern Agent-to-Agent Delegation

The Agents SDK supports multi-agent handoffs. MeshGuard ensures only authorized handoffs occur:

```python
def governed_handoff(from_agent: str, to_agent: str, task: str, customer_context: dict):
    """Enforce delegation policies on agent handoffs."""
    result = mg.check("agent:delegate", context={
        "from_agent": from_agent,
        "to_agent": to_agent,
        "task": task,
        "customer_tier": customer_context.get("tier", "free"),
        "issue_severity": customer_context.get("severity", "low")
    })

    if not result.allowed:
        raise PermissionError(
            f"Delegation from {from_agent} → {to_agent} denied: {result.reason}"
        )

    # Log the approved delegation
    mg.log_action("agent:delegate", context={
        "from_agent": from_agent,
        "to_agent": to_agent,
        "task": task,
        "delegation_id": result.metadata.get("delegation_id"),
        "customer_context": customer_context
    })

    return True


# Triage agent escalates to billing
governed_handoff(
    from_agent="triage-agent",
    to_agent="billing-agent",
    task="process_refund",
    customer_context={"tier": "enterprise", "severity": "high"}
)
```

**Policy for delegation:**

```yaml
rules:
  # Triage can hand off to support agents
  - action: "agent:delegate"
    effect: allow
    conditions:
      from_agent: "triage-agent"
    constraints:
      allowed_targets:
        - "tier1-support"
        - "tier2-support"
        - "billing-agent"

  # Only tier3 can escalate to engineering
  - action: "agent:delegate"
    effect: allow
    conditions:
      from_agent: "tier3-support"
      issue_severity: "critical"
    constraints:
      allowed_targets: ["engineering-oncall"]

  # Block all other delegations
  - action: "agent:delegate"
    effect: deny
    reason: "Delegation not authorized — check escalation path"
```

## Step 5: Add Unified Audit

MeshGuard captures every policy decision — allowed or denied — across all your agents and providers:

```python
# Every mg.check() and mg.log_action() creates an audit entry.
# Query the audit log programmatically:

audit_entries = mg.get_audit_log(
    agent_id="support-t1-001",
    action="web_search:execute",
    start_time="2025-01-01T00:00:00Z",
    end_time="2025-01-31T23:59:59Z"
)

for entry in audit_entries:
    print(f"{entry.timestamp} | {entry.action} | {entry.decision} | {entry.reason}")
```

**Example audit output:**

```
2025-01-15T10:23:01Z | web_search:execute   | ALLOW | Agent tier1-support within rate limit
2025-01-15T10:23:45Z | file_search:query    | ALLOW | Store vs_help_docs permitted for tier1
2025-01-15T10:24:12Z | file_search:query    | DENY  | Store vs_internal_eng not in allowed_stores
2025-01-15T10:24:13Z | agent:delegate       | ALLOW | Escalation to tier2-support permitted
2025-01-15T10:30:00Z | computer_use:execute | DENY  | Computer use not authorized for tier1-support
```

This audit log spans **all your agents across all providers** — OpenAI, Anthropic, AWS Bedrock, Google Vertex AI — in one unified view.

## Step 6: Write Your Policy

Here's a complete MeshGuard policy for a support organization:

```yaml
# policies/support-agents.yaml
version: "1.0"
name: "Support Agent Governance"
description: "Policies for customer support agents using OpenAI Agents SDK"

agents:
  tier1-support:
    token_prefix: "tok_support_t1_"
    model_allowlist: ["gpt-4.1-mini", "gpt-4.1-nano"]
    rate_limits:
      requests_per_hour: 200
      tokens_per_hour: 100000

  tier3-support:
    token_prefix: "tok_support_t3_"
    model_allowlist: ["gpt-4.1", "gpt-4.1-mini"]
    rate_limits:
      requests_per_hour: 500
      tokens_per_hour: 500000

rules:
  # Tier 1: Help docs + web search only
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
      allowed_stores: ["vs_help_docs", "vs_faq"]

  # Tier 3: Full access
  - action: "web_search:execute"
    effect: allow
    conditions:
      agent_role: "tier3-support"

  - action: "file_search:query"
    effect: allow
    conditions:
      agent_role: "tier3-support"
    constraints:
      allowed_stores: ["vs_help_docs", "vs_faq", "vs_internal_eng", "vs_postmortems"]

  - action: "computer_use:execute"
    effect: allow
    conditions:
      agent_role: "tier3-support"
      environment: "sandbox"

  # Delegation rules
  - action: "agent:delegate"
    effect: allow
    conditions:
      from_agent_role: "tier1-support"
    constraints:
      allowed_target_roles: ["tier2-support", "billing-agent"]

  - action: "agent:delegate"
    effect: allow
    conditions:
      from_agent_role: "tier3-support"
    constraints:
      allowed_target_roles: ["tier2-support", "billing-agent", "engineering-oncall"]

  # Default deny
  - action: "*"
    effect: deny
    reason: "Action not explicitly authorized by policy"
```

## Putting It All Together

Here's the complete governed agent:

```python
import os
from openai import OpenAI
from meshguard import MeshGuardClient


def create_governed_agent():
    client = OpenAI()
    mg = MeshGuardClient(
        gateway_url=os.getenv("MESHGUARD_GATEWAY_URL", "https://dashboard.meshguard.app"),
        agent_token=os.getenv("MESHGUARD_AGENT_TOKEN")
    )

    agent_id = os.getenv("AGENT_ID", "support-agent")
    agent_role = os.getenv("AGENT_ROLE", "tier1-support")

    def run(user_input: str):
        # 1. Identity check
        preflight = mg.check("agent:execute", context={
            "agent": agent_id,
            "role": agent_role
        })
        if not preflight.allowed:
            return f"Agent not authorized: {preflight.reason}"

        # 2. Determine allowed tools
        requested_tools = [
            {"type": "web_search_preview"},
            {"type": "file_search", "vector_store_ids": ["vs_help_docs"]}
        ]

        allowed_tools = []
        for tool in requested_tools:
            check = mg.check(f"{tool['type']}:use", context={
                "agent": agent_id,
                "role": agent_role
            })
            if check.allowed:
                allowed_tools.append(tool)

        # 3. Execute with OpenAI
        response = client.responses.create(
            model="gpt-4.1",
            tools=allowed_tools,
            input=user_input,
            store=True
        )

        # 4. Audit
        mg.log_action("agent:complete", context={
            "agent": agent_id,
            "role": agent_role,
            "response_id": response.id,
            "tools_used": [t["type"] for t in allowed_tools],
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens
        })

        return response.output_text

    return run


if __name__ == "__main__":
    agent = create_governed_agent()
    print(agent("How do I change my subscription plan?"))
```

## Key Takeaways

| Concept | OpenAI Provides | MeshGuard Adds |
|---|---|---|
| **Identity** | API key (shared) | Per-agent tokens |
| **Observability** | Dashboard traces | Pre-execution policy checks |
| **Tool control** | Enable/disable tools | Per-agent, per-tool policies |
| **Delegation** | Handoff mechanism | Delegation policy enforcement |
| **Audit** | Per-provider logs | Unified cross-provider audit |
| **Cost control** | Usage dashboard | Per-agent rate limits + budgets |

## Next Steps

- **[Integration reference →](https://docs.meshguard.app/integrations/openai-agents)** — Full API details
- **[Complete example →](https://github.com/meshguard/meshguard-examples/tree/main/openai-agents-support)** — Production-ready code
- **[Compare →](/compare/meshguard-vs-openai-guardrails)** — MeshGuard vs OpenAI's built-in safety
- **[Policy syntax →](https://docs.meshguard.app/guide/policies)** — Write your own policies
