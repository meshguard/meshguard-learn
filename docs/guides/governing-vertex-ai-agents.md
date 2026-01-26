# Governing Google Vertex AI Agents with MeshGuard

This tutorial shows how to add **enterprise-grade governance** to Google Vertex AI agents—especially **multi-agent** systems built with Google’s **Agent Development Kit (ADK)** and/or **Vertex AI Agent Builder**.

You’ll learn how to:

- Attach **MeshGuard** checks to ADK agents and tools
- Control **A2A (Agent2Agent)** delegation between agents
- Govern a **multi-vendor agent mesh** (Vertex AI + other runtimes) with one policy layer

---

## Why Vertex AI safety features aren’t enough (by themselves)

Vertex AI provides important guardrails like:

- Safety filtering for harmful content
- Grounding checks / retrieval controls (when configured)
- Model-level controls (temperature, system prompts, etc.)

These are necessary, but they don’t fully solve the governance problems enterprises face with production agent systems:

### 1) Safety ≠ authorization

A response can be perfectly “safe” but still violate policy:

- An agent shares customer PII with an internal agent that shouldn’t see it
- An agent performs an action outside its scope (“finance agent” initiates HR workflows)

### 2) Multi-agent introduces delegation risk

In a mesh, agents don’t just call tools—they delegate tasks to other agents.

Without explicit delegation governance:

- A low-trust agent can “launder” requests through a higher-privilege agent
- Sensitive actions become hard to trace across hops

### 3) Enterprise needs identity, audit, and cross-platform enforcement

Your environment rarely stays within one vendor:

- Vertex AI agents interact with internal services
- Some teams run agents in other stacks (LangGraph, OpenAI Assistants, custom runtimes)

You need a consistent enforcement layer for:

- **Agent identity**
- **Least privilege**
- **Delegation chains**
- **Unified audit**

MeshGuard is designed to provide that governance layer.

---

## Governance model: MeshGuard as the Policy Enforcement Point (PEP)

MeshGuard acts as the PEP at runtime:

1. Agent attempts a sensitive action
2. Agent calls `meshguard.check(action, context=...)`
3. If allowed → proceed
4. If denied → block/return an error
5. Always record decision + context (audit)

You can enforce at multiple points:

- **Tool invocation** (e.g., `read:contacts`)
- **Data access** (e.g., `data:pii.read`)
- **A2A communication** (`a2a:send`, `a2a:receive`)
- **Delegation intents** (`a2a:delegate:research`, etc.)

---

## Step 1 — Add MeshGuard to a Vertex AI agent runtime

MeshGuard’s Python SDK usage pattern:

```python
from meshguard import MeshGuardClient

client = MeshGuardClient(
    gateway_url="https://dashboard.meshguard.app",
    agent_token="your-agent-token",
)

result = client.check("read:contacts", context={"user": "agent-1"})
```

### Recommended: one agent token per running agent

Give each agent identity its own token so:

- decisions are attributable
- least privilege can be enforced per agent
- audit logs remain meaningful

---

## Step 2 — Govern ADK tools (tool-level authorization)

Any tool that touches sensitive systems (CRM, ticketing, code repos, payments) should enforce policy.

```python
from meshguard import MeshGuardClient

class TicketingTool:
    def __init__(self, meshguard: MeshGuardClient, *, agent_id: str):
        self.meshguard = meshguard
        self.agent_id = agent_id

    def create_ticket(self, title: str, body: str) -> dict:
        decision = self.meshguard.check(
            "tickets:create",
            context={
                "actor": self.agent_id,
                "resource": {"type": "ticket"},
                "fields": {"title": title},
            },
        )
        if not decision.get("allow", False):
            raise PermissionError(f"Denied tickets:create: {decision}")

        # call your real ticketing API here
        return {"id": "TCK-123", "title": title}
```

---

## Step 3 — Govern A2A delegation (the critical multi-agent control)

A2A governance prevents “privilege laundering” across agents.

### Sender-side enforcement

Before agent A delegates to agent B:

```python
import uuid
from meshguard import MeshGuardClient

class A2A:
    def __init__(self, meshguard: MeshGuardClient, *, sender: str):
        self.meshguard = meshguard
        self.sender = sender

    def send(self, recipient: str, intent: str, payload: dict, trace_id: str | None = None) -> dict:
        decision = self.meshguard.check(
            "a2a:send",
            context={
                "sender": self.sender,
                "recipient": recipient,
                "intent": intent,
                "trace_id": trace_id,
            },
        )
        if not decision.get("allow", False):
            return {"ok": False, "denied": True, "decision": decision}

        msg = {
            "id": str(uuid.uuid4()),
            "sender": self.sender,
            "recipient": recipient,
            "intent": intent,
            "payload": payload,
            "trace_id": trace_id,
        }
        # transport.send(msg)
        return {"ok": True, "message": msg}
```

### Receiver-side enforcement

When agent B receives a delegated task:

```python
from meshguard import MeshGuardClient

def accept(meshguard: MeshGuardClient, msg: dict) -> None:
    decision = meshguard.check(
        "a2a:receive",
        context={
            "sender": msg["sender"],
            "recipient": msg["recipient"],
            "intent": msg["intent"],
            "trace_id": msg.get("trace_id"),
        },
    )
    if not decision.get("allow", False):
        raise PermissionError(f"Denied a2a:receive: {decision}")

    # handle msg
```

### Optional: intent-specific actions

For more control, model the action as:

- `a2a:delegate:research`
- `a2a:delegate:execute_payment`

This lets you restrict not only *who* can delegate, but *what kind of work* can be delegated.

---

## Step 4 — Model delegation chains (traceable, auditable)

To govern multi-hop workflows, pass a `trace_id` (and optionally `parent_trace_id`) through A2A messages.

In MeshGuard policy, you can:

- deny delegation if the chain exceeds N hops
- require approval for certain intents once a chain includes external agents
- enforce “origin agent must be in group X”

---

## Step 5 — Multi-vendor agent mesh scenarios

MeshGuard is useful when your organization runs:

- Vertex AI agents (ADK / Agent Builder)
- internal agent services (custom Python/Go)
- other vendor stacks

Because governance is enforced via `client.check(...)`, every runtime can:

- use the same policy language
- emit consistent audit events
- enforce consistent delegation constraints

This helps you avoid “policy drift” where each team reinvents access rules per framework.

---

## Suggested policy shape

At a minimum, define:

- `a2a:send` and `a2a:receive`
- tool/data actions: `read:contacts`, `tickets:create`, `repo:write`, etc.

Include in context:

- `sender`, `recipient`, `intent`
- `resource` (type/id)
- `environment` (dev/prod)
- `trace_id`

---

## What to do next

- Start with tool governance (fast win)
- Add A2A governance as soon as you have >1 agent (highest risk reducer)
- Expand to chain-aware policy and unified audit

For a full working example, see the `vertex-ai-multiagent` example in the MeshGuard examples repo.

---

## Related reading

- Compare: MeshGuard vs Vertex AI Guardrails
