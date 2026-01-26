---
title: "Governing Clawdbot Agents with MeshGuard"
description: "Learn how to add MeshGuard governance to Clawdbot-powered AI assistants — control what your personal or business agent can access, send, and do on your behalf."
---

# Governing Clawdbot Agents with MeshGuard

A practical guide to adding governance controls to your Clawdbot AI assistant, whether it manages your personal life or runs your business.

## What is Clawdbot?

[Clawdbot](https://clawd.bot) is an open-source AI agent platform that turns LLMs into personal and business assistants. It connects to your real-world services — email, calendars, smart home devices, messaging platforms, file storage — and acts on your behalf through modular "skills."

Think of it as your AI butler: it reads your emails, manages your calendar, controls your lights, sends messages, and more. That's incredibly powerful — and exactly why it needs governance.

## Why Personal AI Agents Need Governance

When an AI agent has access to your life, the stakes are personal:

- **Email access** — It could send an embarrassing message to your boss
- **Calendar control** — It could accept a meeting you'd never agree to
- **Smart home** — It could unlock your front door or disable your alarm
- **Financial tools** — It could approve a payment or transfer funds
- **Messaging** — It could reply to contacts in ways you wouldn't

Enterprise agents get security teams. Personal agents get... you. MeshGuard bridges that gap by giving individual users and small teams the same policy engine that enterprises rely on.

## Prerequisites

- A running Clawdbot instance ([setup guide](https://docs.clawd.bot))
- Python 3.9+
- A MeshGuard account ([sign up free](https://meshguard.app))

## Installation

```bash
pip install meshguard
```

## Quick Start: Governing a Clawdbot Skill

Clawdbot skills are modular capabilities. Here's how to wrap one with MeshGuard governance:

```python
from meshguard import MeshGuardClient

# Initialize MeshGuard
client = MeshGuardClient(
    gateway_url="https://dashboard.meshguard.app",
    agent_token="your-clawdbot-agent-token",
)

# Before sending any email, check with MeshGuard
def governed_send_email(to: str, subject: str, body: str):
    decision = client.check(
        action="write:email",
        context={
            "recipient": to,
            "subject": subject,
            "skill": "email",
        }
    )
    if not decision.allowed:
        return f"Blocked: {decision.reason}"
    
    # Proceed with the actual send
    return email_service.send(to, subject, body)
```

Every email send is now checked against your MeshGuard policies before it goes out.

## Example: Limiting What Your Assistant Can Send

Imagine your Clawdbot handles personal email. You want it to draft replies and send routine responses, but not send anything to your work contacts or financial institutions:

```yaml
name: personal-email-policy
version: 1
agent_match:
  tags: ["clawdbot-personal"]

rules:
  # Allow reading all emails
  - action: "read:email"
    effect: allow

  # Allow sending to personal contacts
  - action: "write:email"
    effect: allow
    conditions:
      - "request.recipient NOT IN blocked_domains"

  # Block emails to work and financial domains
  - action: "write:email"
    effect: deny
    conditions:
      - "request.recipient MATCHES '*@company.com' OR request.recipient MATCHES '*@bank.com'"
    reason: "Cannot send emails to work or financial contacts"

  # Block forwarding emails externally
  - action: "write:email_forward"
    effect: deny
    reason: "Email forwarding is disabled for this agent"
```

## Example: Restricting a Business Clawdbot

For a business Clawdbot that handles customer inquiries, you want tighter controls — no access to sensitive internal data, limited messaging scope:

```yaml
name: business-clawdbot-policy
version: 1
agent_match:
  tags: ["clawdbot-business"]

rules:
  # Can read customer-facing knowledge base
  - action: "read:knowledge_base"
    effect: allow

  # Cannot access internal financial data
  - action: "read:financial_data"
    effect: deny
    reason: "Business agent cannot access financial records"

  # Can send messages only to customers, not internal team
  - action: "write:message"
    effect: allow
    conditions:
      - "request.channel IN ['customer-support', 'public']"

  # Cannot access employee records
  - action: "read:employee_data"
    effect: deny
    reason: "Employee data is restricted to HR agents"

  # Rate limit outbound messages
  - action: "write:message"
    effect: allow
    conditions:
      - "rate_limit(100, '1h')"
```

## Policies for Common Clawdbot Skills

Here's a reference policy covering the most popular Clawdbot skills:

```yaml
name: clawdbot-standard-governance
version: 1
agent_match:
  tags: ["clawdbot"]

rules:
  # Email: read freely, send with restrictions
  - action: "read:email"
    effect: allow
  - action: "write:email"
    effect: allow
    conditions:
      - "time.hour >= 8 AND time.hour <= 22"

  # Calendar: read freely, create events but not delete
  - action: "read:calendar"
    effect: allow
  - action: "write:calendar"
    effect: allow
  - action: "delete:calendar"
    effect: deny
    reason: "Agent cannot delete calendar events"

  # Messaging: allow with rate limits
  - action: "write:message"
    effect: allow
    conditions:
      - "rate_limit(50, '1h')"

  # File access: read only, no writes or deletes
  - action: "read:files"
    effect: allow
  - action: "write:files"
    effect: deny
    reason: "File write access requires manual approval"

  # Smart home: read sensors, limited control
  - action: "read:smart_home"
    effect: allow
  - action: "write:smart_home"
    effect: allow
    conditions:
      - "request.device_type IN ['lights', 'thermostat']"
  - action: "write:smart_home"
    effect: deny
    conditions:
      - "request.device_type IN ['locks', 'alarm']"
    reason: "Security devices require manual control"
```

## Audit Trail: What Did Your Agent Do?

Every governed action is logged. You can see exactly what your Clawdbot did and when:

```python
# Query recent actions
audit_log = client.get_audit_log(
    limit=50,
    agent_tags=["clawdbot-personal"],
)

for entry in audit_log:
    print(f"[{entry['timestamp']}] {entry['action']} → {entry['decision']}")
    if entry['decision'] == 'deny':
        print(f"  Reason: {entry['reason']}")
```

Example output:

```
[2026-01-26T10:15:00Z] read:email → allow
[2026-01-26T10:15:30Z] write:email → allow
[2026-01-26T10:22:00Z] write:smart_home → deny
  Reason: Security devices require manual control
[2026-01-26T10:45:00Z] write:message → allow
```

This gives you full visibility into your agent's behavior — essential for building trust with an AI that manages parts of your life.

## Full Integration Example

Here's a complete Python example showing MeshGuard integrated with a Clawdbot skill:

```python
from meshguard import MeshGuardClient
from meshguard.exceptions import PolicyDeniedError

client = MeshGuardClient(
    gateway_url="https://dashboard.meshguard.app",
    agent_token="your-clawdbot-token",
)

def clawdbot_skill_handler(skill: str, action: str, params: dict):
    """Generic governance wrapper for any Clawdbot skill."""
    try:
        decision = client.check(
            action=f"{action}:{skill}",
            context=params,
        )
        if not decision.allowed:
            return {
                "status": "denied",
                "reason": decision.reason,
                "logged": True,
            }
        # Execute the actual skill
        result = execute_skill(skill, action, params)
        return {"status": "success", "result": result}
    except PolicyDeniedError as e:
        return {"status": "denied", "reason": str(e)}

# Usage
result = clawdbot_skill_handler(
    skill="email",
    action="write",
    params={"to": "friend@example.com", "subject": "Dinner Friday?"}
)
```

## Next Steps

- [MeshGuard Documentation](https://docs.meshguard.app) — Full SDK reference and policy syntax
- [What is Agent Governance?](/concepts/what-is-agent-governance) — Understand the fundamentals
- [Trust Tiers Explained](/concepts/trust-tiers) — Configure trust levels for your agents
- [Personal vs Enterprise Governance](/guides/personal-vs-enterprise-governance) — How governance scales from personal to enterprise
- [MeshGuard for Small Business](/guides/meshguard-for-small-business) — Governance for small teams without a security department

---

::: tip Get Started
Create your free MeshGuard account at [meshguard.app](https://meshguard.app) — the Free tier supports up to 5 agents, perfect for governing your Clawdbot setup.
:::
