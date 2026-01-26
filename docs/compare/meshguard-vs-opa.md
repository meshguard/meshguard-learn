# MeshGuard vs Open Policy Agent (OPA)

A detailed comparison of **MeshGuard** and **Open Policy Agent (OPA)** for AI agent governance.

## Executive Summary

**OPA** is a general-purpose policy engine for infrastructure — Kubernetes admission control, API gateway authorization, and microservice access control. It's the industry standard for "can this service talk to that service?"

**MeshGuard** is a purpose-built governance platform for AI agents — controlling what tools an agent can use, what actions it can take, and maintaining complete audit trails. It's designed for "should this agent be allowed to send that email?"

They operate at different layers of your stack and are often **complementary** rather than competitive.

## The Fundamental Difference

### OPA: Infrastructure Policy

OPA answers: *"Is this request allowed to reach this service?"*

```rego
# OPA policy in Rego
package httpapi.authz

default allow := false

allow if {
    input.method == "GET"
    input.path == ["api", "public"]
}

allow if {
    input.method == "POST"
    input.user.role == "admin"
}
```

OPA sits at the network/infrastructure layer. It intercepts requests at API gateways, service meshes (Envoy), or Kubernetes admission controllers. It's incredibly powerful for microservice architectures.

### MeshGuard: Agent Governance

MeshGuard answers: *"Should this agent perform this specific action?"*

```python
# MeshGuard in your agent code
from meshguard import MeshGuardClient

client = MeshGuardClient(agent_token="...")

# Before sending an email
decision = client.check("write:email")
if decision.allowed:
    send_email(to=recipient, body=content)
else:
    log.warning(f"Action blocked: {decision.reason}")
```

MeshGuard sits inside your agent's runtime. It wraps tool calls and enforces policies based on the agent's identity, trust tier, and the specific action being attempted.

## Detailed Comparison

| Aspect | OPA | MeshGuard |
|--------|-----|-----------|
| **Primary Use Case** | Infrastructure authorization | AI agent governance |
| **Policy Language** | Rego (custom DSL) | YAML + natural expressions |
| **Deployment Model** | Self-hosted sidecar or service | Managed SaaS + SDK |
| **Integration Point** | Network edge, API gateways, K8s | Inside agent code, wrapping tools |
| **Decision Context** | HTTP request, service identity | Agent identity, action, resource, history |
| **Audit Trail** | Decision logs | Full agent action history with context |
| **Learning Curve** | Steep (Rego is powerful but complex) | Gentle (simple YAML policies) |
| **AI-Specific Features** | None (general purpose) | Trust tiers, delegation chains, tool governance |

## When to Use Each

### Use OPA When:

- You need **Kubernetes admission control** (validate pod specs, enforce labels)
- You're building **service mesh policies** (Envoy/Istio authorization)
- You need **API gateway authorization** (rate limiting, path-based access)
- Your policies are about **infrastructure resources** (which services can talk to which)
- You have dedicated **platform engineering** resources to write and maintain Rego

### Use MeshGuard When:

- You're building **AI agents** that take autonomous actions
- You need to control **what tools** an agent can use
- You need **per-agent policies** based on trust levels
- You need **audit trails** of every agent action for compliance
- You want **human-readable policies** without learning a new language
- You're dealing with **delegation** between agents

### Use Both When:

- You have AI agents that call microservices protected by OPA
- OPA handles the infrastructure layer ("can this request reach the service?")
- MeshGuard handles the agent layer ("should this agent make this request?")

## Architecture Comparison

### OPA Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Your Infrastructure                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   Service A ──→ [API Gateway] ──→ Service B            │
│                      │                                  │
│                      ▼                                  │
│                   [OPA]                                 │
│                      │                                  │
│            "Is this request allowed?"                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

OPA is deployed alongside your infrastructure (as a sidecar, daemon, or service). Policy decisions happen at the network boundary.

### MeshGuard Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Your AI Agent                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   Agent Logic ──→ [MeshGuard SDK] ──→ Tool Execution   │
│                         │                               │
│                         ▼                               │
│                [MeshGuard Gateway]                      │
│                         │                               │
│           "Should this agent do this?"                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

MeshGuard is integrated into your agent's code. Policy decisions happen before tool execution.

## Policy Language Comparison

### OPA's Rego

Rego is a powerful, Datalog-inspired query language:

```rego
package agent.authz

import future.keywords.if
import future.keywords.in

default allow := false

# Allow read actions for verified agents
allow if {
    input.action == "read"
    input.agent.trust_tier in ["verified", "trusted", "privileged"]
}

# Allow write actions only for trusted+ agents with specific permissions
allow if {
    input.action == "write"
    input.agent.trust_tier in ["trusted", "privileged"]
    input.resource in input.agent.permissions
}
```

**Pros:** Extremely expressive, supports complex logic, great for infrastructure.
**Cons:** Steep learning curve, requires dedicated expertise.

### MeshGuard's YAML Policies

MeshGuard uses simple, readable YAML:

```yaml
name: verified-agent-policy
version: 1
rules:
  - action: "read:*"
    effect: allow
    
  - action: "write:email"
    effect: allow
    conditions:
      - "time.hour >= 9 AND time.hour <= 17"  # Business hours only
      
  - action: "delete:*"
    effect: deny
    reason: "Verified agents cannot delete resources"
```

**Pros:** Human-readable, easy to audit, quick to write.
**Cons:** Less expressive for complex conditional logic.

## Real-World Example: E-Commerce AI Agent

Imagine an AI customer service agent that can:
- Look up orders
- Process refunds
- Send emails to customers

### With OPA (Infrastructure Layer)

```rego
# Protects the Order Service API
package order.api

allow if {
    input.method == "GET"
    input.path[0] == "orders"
    input.headers["x-agent-token"] != ""
}

# Blocks POST to refunds unless specific header
allow if {
    input.method == "POST"
    input.path == ["refunds"]
    input.headers["x-refund-approved"] == "true"
}
```

This ensures only authenticated requests reach your order service, but it doesn't know anything about the agent's context or intent.

### With MeshGuard (Agent Layer)

```python
@governed_tool("read:orders", client=meshguard)
def lookup_order(order_id: str) -> dict:
    """Agent can freely look up orders."""
    return orders_api.get(order_id)

@governed_tool("write:refund", client=meshguard)
def process_refund(order_id: str, amount: float) -> str:
    """Agent needs permission to process refunds."""
    # MeshGuard checks: Is this agent allowed to refund?
    # Is the amount within their limit? Log for audit.
    return payments_api.refund(order_id, amount)
```

MeshGuard knows this is a "customer-service-agent" with trust tier "verified", can refund up to $100, and logs every action for compliance.

### Best of Both Worlds

```
Customer ──→ [AI Agent + MeshGuard] ──→ [API Gateway + OPA] ──→ [Order Service]
                    │                           │
           "Can agent refund?"          "Is request valid?"
```

## Migration Path

### If You're Using OPA Today

You don't need to replace OPA. Add MeshGuard for agent-specific governance:

1. Keep OPA for infrastructure policies
2. Add MeshGuard SDK to your AI agents
3. MeshGuard handles agent logic; OPA handles infrastructure

### If You're Starting Fresh

For AI agent governance specifically, MeshGuard is the faster path:

1. Simpler policies (YAML vs Rego)
2. Built-in agent concepts (trust tiers, delegation)
3. Managed service (no infrastructure to deploy)
4. Purpose-built audit trails

## Conclusion

**OPA and MeshGuard are not direct competitors** — they solve different problems at different layers.

| Need | Solution |
|------|----------|
| Kubernetes admission control | OPA |
| Service mesh authorization | OPA |
| API gateway policies | OPA |
| AI agent tool governance | **MeshGuard** |
| Agent audit trails | **MeshGuard** |
| Agent delegation control | **MeshGuard** |

For enterprises building AI agents, **MeshGuard provides purpose-built governance** that OPA wasn't designed to handle. For infrastructure policy, OPA remains the gold standard.

---

::: tip Ready to govern your AI agents?
[Get started with MeshGuard →](https://meshguard.app)
:::
