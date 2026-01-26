# MeshGuard vs LangChain Guardrails

A detailed comparison of **MeshGuard** and **LangChain's built-in Guardrails** for AI agent safety.

## Executive Summary

**LangChain Guardrails** are middleware components built into the LangChain framework. They excel at content-level safety: PII detection, human-in-the-loop approval, and content filtering.

**MeshGuard** is a standalone governance platform that works across frameworks. It excels at action-level control: policy enforcement, audit trails, agent identity, and multi-agent governance.

**Key insight:** They solve different problems and work well together.

## The Fundamental Difference

### LangChain Guardrails: Content Safety

LangChain Guardrails answer: *"Is this content safe to process or return?"*

```python
from langchain.agents import create_agent
from langchain.agents.middleware import PIIMiddleware

agent = create_agent(
    model="gpt-4o",
    tools=[customer_tool],
    middleware=[
        # Redact emails before sending to model
        PIIMiddleware("email", strategy="redact", apply_to_input=True),
    ],
)
```

Guardrails intercept content at specific points (input, output, tool results) and apply filters.

### MeshGuard: Action Governance

MeshGuard answers: *"Should this agent be allowed to perform this action?"*

```python
from meshguard import MeshGuardClient
from meshguard.langchain import governed_tool

client = MeshGuardClient(agent_token="...")

@governed_tool("write:email", client=client)
def send_email(to: str, body: str) -> str:
    """Only executes if policy allows."""
    return mailer.send(to, body)
```

MeshGuard wraps tools and enforces policies based on agent identity, action type, and organizational rules.

## Feature Comparison

| Feature | LangChain Guardrails | MeshGuard |
|---------|---------------------|-----------|
| **PII Detection** | ✅ Built-in (email, credit card, etc.) | 🟡 Via policy rules |
| **Content Filtering** | ✅ Custom middleware | 🟡 Not primary focus |
| **Human-in-the-Loop** | ✅ Interrupt + resume flow | ✅ Deny → escalate pattern |
| **Action Authorization** | ❌ No native support | ✅ Core feature |
| **Agent Identity** | ❌ No agent identity concept | ✅ Per-agent tokens + trust tiers |
| **Centralized Policies** | ❌ Per-agent configuration | ✅ Organization-wide policies |
| **Audit Trail** | ❌ Local logs only | ✅ Centralized, queryable logs |
| **Multi-Agent Governance** | ❌ No delegation control | ✅ Delegation chains + permission ceilings |
| **Cross-Framework** | ❌ LangChain only | ✅ LangChain, CrewAI, AutoGPT, custom |
| **Rate Limiting** | ❌ Not included | ✅ Per-agent, per-action limits |

## Deep Dive: What Each Does Best

### LangChain Guardrails Excel At:

#### 1. PII Detection and Handling

```python
middleware=[
    # Multiple strategies for different PII types
    PIIMiddleware("email", strategy="redact"),      # [REDACTED_EMAIL]
    PIIMiddleware("credit_card", strategy="mask"),   # ****-****-****-1234
    PIIMiddleware("api_key", strategy="block"),      # Raise exception
]
```

LangChain's PII detection is battle-tested with support for:
- Email addresses
- Credit card numbers (Luhn validated)
- IP addresses, MAC addresses, URLs
- Custom regex patterns

#### 2. Human-in-the-Loop Workflows

```python
middleware=[
    HumanInTheLoopMiddleware(
        interrupt_on={
            "send_email": True,      # Requires approval
            "delete_database": True,  # Requires approval
            "search": False,          # Auto-approved
        }
    ),
]
```

LangChain's HITL integrates with LangGraph's persistence, allowing:
- Pause execution at sensitive points
- Resume after human approval
- Maintain conversation state across interrupts

#### 3. Middleware Composition

```python
middleware=[
    ContentFilterMiddleware(banned_keywords=["hack"]),  # Layer 1
    PIIMiddleware("email", strategy="redact"),          # Layer 2
    HumanInTheLoopMiddleware(interrupt_on={...}),       # Layer 3
    SafetyGuardrailMiddleware(),                        # Layer 4
]
```

Stack multiple middleware for layered protection.

### MeshGuard Excels At:

#### 1. Policy-Based Action Control

```yaml
# Organization-wide policy
name: customer-service-policy
rules:
  - action: "read:*"
    effect: allow
    
  - action: "write:email"
    effect: allow
    conditions:
      - "time.hour >= 9 AND time.hour <= 17"
      
  - action: "write:refund"
    effect: allow
    conditions:
      - "request.amount <= 50"
    
  - action: "delete:*"
    effect: deny
    reason: "Agents cannot delete data"
```

Policies are centralized, version-controlled, and applied consistently.

#### 2. Agent Identity and Trust Tiers

```python
# Different agents get different permissions
research_agent = MeshGuardClient(agent_token="research-token")  # verified tier
admin_agent = MeshGuardClient(agent_token="admin-token")        # privileged tier

# Same action, different outcomes based on trust
research_agent.check("delete:records")  # → DENIED
admin_agent.check("delete:records")     # → ALLOWED
```

#### 3. Comprehensive Audit Trails

```python
# Query what happened
audit = client.get_audit_log(
    agent_id="customer-service-bot",
    actions=["write:refund"],
    start_date="2026-01-01",
)

# Every entry includes:
# - Timestamp
# - Agent identity
# - Action attempted
# - Decision (allow/deny)
# - Policy that matched
# - Full context
```

#### 4. Multi-Agent Delegation Control

```python
# Agent A delegates to Agent B
# MeshGuard enforces: B's permissions ≤ A's permissions
# And logs the complete delegation chain
```

## When to Use Each

### Use LangChain Guardrails When:

- You need **PII detection** in inputs/outputs
- You're building a **single LangChain agent**
- You need **human approval workflows** with state persistence
- Your safety needs are primarily **content-focused**
- You want **quick, built-in solutions** without external dependencies

### Use MeshGuard When:

- You need **action-level authorization** (not just content filtering)
- You have **multiple agents** with different permission levels
- You need **centralized policy management** across your org
- You need **audit trails for compliance** (SOC 2, HIPAA, etc.)
- You're using **multiple frameworks** (LangChain + CrewAI + custom)
- You need **delegation control** between agents

### Use Both When:

You want comprehensive protection at multiple layers:

```python
from langchain.agents import create_agent
from langchain.agents.middleware import PIIMiddleware, HumanInTheLoopMiddleware
from meshguard import MeshGuardClient
from meshguard.langchain import governed_tool

# MeshGuard for action governance
client = MeshGuardClient(agent_token="...")

@governed_tool("write:email", client=client)
def send_email(to: str, body: str) -> str:
    """MeshGuard checks: Is this agent allowed to send email?"""
    return mailer.send(to, body)

# LangChain for content safety
agent = create_agent(
    model="gpt-4o",
    tools=[send_email],
    middleware=[
        # LangChain handles: Is this content safe?
        PIIMiddleware("email", strategy="redact", apply_to_output=True),
        HumanInTheLoopMiddleware(interrupt_on={"send_email": True}),
    ],
)
```

**Result:** 
- MeshGuard checks if the agent is *allowed* to send email
- LangChain's HITL gets human approval for *this specific* email
- LangChain's PII filter sanitizes the response

## Architecture Comparison

### LangChain Guardrails Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    LangChain Agent                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   Input → [Before Middleware] → Model → [After MW] → Output
│                                   │                     │
│                            [Around Tool MW]             │
│                                   │                     │
│                               Tool Call                 │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

Middleware runs inline within the agent. No external dependencies.

### MeshGuard Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Any Agent Framework                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   Agent → [MeshGuard SDK] → MeshGuard Gateway → Tool   │
│                │                    │                   │
│           API Call            Policy Check              │
│                                    │                    │
│                              Audit Logged               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

SDK calls external gateway. Centralized policy + audit.

## Migration Guide

### From LangChain Guardrails to MeshGuard

If you're outgrowing LangChain Guardrails:

**Before (LangChain only):**
```python
agent = create_agent(
    model="gpt-4o",
    tools=[send_email, delete_records],
    middleware=[
        HumanInTheLoopMiddleware(
            interrupt_on={"send_email": True, "delete_records": True}
        ),
    ],
)
```

**After (MeshGuard + LangChain):**
```python
from meshguard.langchain import governed_tool

@governed_tool("write:email", client=client)
def send_email(to: str, body: str) -> str:
    # Policy: allow for verified+ agents, business hours only
    return mailer.send(to, body)

@governed_tool("delete:records", client=client)
def delete_records(ids: list) -> str:
    # Policy: deny for all non-privileged agents
    return db.delete(ids)

agent = create_agent(
    model="gpt-4o",
    tools=[send_email, delete_records],
    # Keep PII filtering from LangChain
    middleware=[PIIMiddleware("email", strategy="redact")],
)
```

## Cost Comparison

| Aspect | LangChain Guardrails | MeshGuard |
|--------|---------------------|-----------|
| **Price** | Free (open source) | Free tier available |
| **Infrastructure** | None (runs in your agent) | Managed SaaS or self-hosted |
| **Maintenance** | You manage middleware code | Policies managed via dashboard |
| **Scaling** | Scales with your agent | Independent scaling |

## Conclusion

**LangChain Guardrails** and **MeshGuard** are complementary:

| Need | Best Solution |
|------|---------------|
| PII detection in content | LangChain Guardrails |
| Human approval for specific actions | LangChain Guardrails |
| Content filtering | LangChain Guardrails |
| Action authorization by policy | **MeshGuard** |
| Agent identity and trust levels | **MeshGuard** |
| Centralized audit for compliance | **MeshGuard** |
| Multi-agent delegation control | **MeshGuard** |
| Cross-framework governance | **MeshGuard** |

**For most production systems, use both** — LangChain Guardrails for content safety, MeshGuard for action governance.

---

::: tip Ready for Enterprise Governance?
[Create your free MeshGuard account →](https://meshguard.app)
:::
