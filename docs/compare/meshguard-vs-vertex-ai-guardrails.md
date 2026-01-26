# MeshGuard vs Vertex AI Guardrails (and how they work together)

Google Vertex AI provides important **model safety and grounding** capabilities. MeshGuard provides **enterprise governance** for agent identity, authorization, delegation, and audit—across vendors and runtimes.

They are complementary:

- Vertex AI Guardrails help ensure content is safe and aligned.
- MeshGuard helps ensure actions are **authorized**, **traceable**, and **policy-compliant**, especially in **multi-agent** systems.

---

## What Vertex AI guardrails are great at

Vertex AI commonly provides controls such as:

- **Safety filtering / content moderation**
  - reduces harmful/unsafe outputs
  - helps enforce content policies
- **Grounding and retrieval controls** (when configured)
  - improves factuality by grounding outputs in approved sources
  - reduces hallucinations
- **Model configuration and prompt constraints**
  - system instructions, temperature, and other generation settings

These are essential for producing safer, higher-quality agent responses.

---

## What MeshGuard is designed for

MeshGuard focuses on governance for **agents acting in the world**:

- **Agent identity**
  - distinguish “which agent” is calling a tool or delegating work
- **Cross-platform authorization**
  - enforce policies consistently whether an agent runs on Vertex AI, another vendor stack, or a custom runtime
- **Delegation chains (A2A / Agent2Agent)**
  - control which agents can delegate to which other agents
  - prevent privilege escalation via delegation (“privilege laundering”)
  - preserve trace context across hops
- **Unified audit & compliance**
  - record allow/deny decisions with context for incident response and compliance

---

## Key differences (quick view)

### Primary goal

- **Vertex AI guardrails**: safe and grounded *content*
- **MeshGuard**: authorized and auditable *actions + delegation*

### Scope

- **Vertex AI**: within the Vertex AI runtime / product surface
- **MeshGuard**: across tools, services, and multi-agent meshes (including multi-vendor)

### Multi-agent delegation governance

- **Vertex AI**: orchestration may exist, but delegation authorization is not a full enterprise governance layer by itself
- **MeshGuard**: explicit A2A controls (`a2a:send`, `a2a:receive`, intent-based delegation rules)

---

## Where they complement each other (recommended)

Use both:

1. **Vertex AI guardrails** to ensure model outputs meet safety and grounding requirements.
2. **MeshGuard** to ensure that:
   - tool calls are authorized
   - data access follows least privilege
   - A2A delegation is controlled and traceable
   - audits are consistent across your stack

In practice:

- The agent uses Vertex AI to reason and generate
- Before taking an external action (tool call, data fetch, delegation), the agent calls:

```python
from meshguard import MeshGuardClient

meshguard = MeshGuardClient(
    gateway_url="https://dashboard.meshguard.app",
    agent_token="your-agent-token",
)

decision = meshguard.check(
    "a2a:send",
    context={"sender": "agent-a", "recipient": "agent-b", "intent": "research:vendor"},
)
```

---

## Example: “safe” but still not allowed

Even if Vertex AI correctly produces a safe response, enterprise policy may still deny action:

- Agent tries to read a customer’s contact record without permission
- Agent delegates a finance task to an external vendor agent
- Agent attempts to write to production infrastructure

MeshGuard is the layer that decides **allow/deny** for those actions.

---

## When you should add MeshGuard

MeshGuard is particularly valuable when:

- you have more than one agent (delegation risk)
- agents access sensitive systems (CRM/ERP/HR/payments)
- you need consistent policy across teams and runtimes
- compliance requires auditable authorization decisions

---

## Summary

- Vertex AI guardrails: content safety + grounding
- MeshGuard: identity + authorization + delegation governance + unified audit

Together, they provide a stronger foundation for production multi-agent systems.

---

## Related reading

- Guide: Governing Google Vertex AI Agents with MeshGuard
