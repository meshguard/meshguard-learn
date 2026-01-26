---
title: "MeshGuard for Small Business: Governing AI Agents Without a Security Team"
description: "How small businesses can use MeshGuard to govern AI agents — protect customers, control costs, and stay safe without a dedicated security team."
---

# MeshGuard for Small Business: Governing AI Agents Without a Security Team

You don't need a CISO or a security operations center to govern your AI agents. MeshGuard gives small teams enterprise-grade controls with zero overhead.

## The Problem: AI Agents Are Everywhere, Security Teams Are Not

Small businesses are adopting AI agents fast. A customer support bot here, an inventory assistant there, maybe an AI that handles email or schedules appointments. These agents are genuinely useful — but they come with real risk.

And here's the uncomfortable truth: **most small businesses have no one responsible for AI governance.** No security team. No compliance officer. No one watching what the agent does at 2 AM on a Saturday.

## Why Governance Matters for a 3-Person Team

"We're only three people — what's the worst that could happen?"

Plenty:

- **A customer service agent promises a full refund** your policy doesn't support — and you have to honor it
- **An AI email assistant sends the wrong attachment** with another client's confidential data
- **An ordering agent goes haywire** and places 500 units instead of 5, costing you thousands
- **A research agent scrapes and stores data** that violates privacy regulations

One rogue agent action can cost more than your monthly revenue. Governance isn't bureaucracy — it's insurance.

## MeshGuard's Free Tier: Built for Small Teams

MeshGuard's Free tier includes **5 governed agents** — more than enough for most small businesses. No credit card required. No time limit.

| Feature | Free Tier |
|---------|-----------|
| Governed agents | 5 |
| Policy checks | 1,000/month |
| Audit log retention | 7 days |
| Support | Community |
| Price | $0 |

## Real-World Scenarios

### 🛒 E-Commerce: Governing Customer Support

A small online shop uses an AI agent to handle customer inquiries — order status, returns, basic troubleshooting.

**Risks without governance:**
- Agent promises refunds beyond your return policy
- Agent shares other customers' order details
- Agent agrees to custom deals or discounts it shouldn't

**MeshGuard policy:**

```yaml
name: ecommerce-support-agent
version: 1
agent_match:
  tags: ["customer-support"]

rules:
  # Can look up orders
  - action: "read:orders"
    effect: allow

  # Can process refunds up to $25
  - action: "write:refund"
    effect: allow
    conditions:
      - "request.amount <= 25"

  # Block refunds over $25 — escalate to owner
  - action: "write:refund"
    effect: deny
    conditions:
      - "request.amount > 25"
    reason: "Refunds over $25 require owner approval"

  # Cannot offer custom discounts
  - action: "write:discount"
    effect: deny
    reason: "Custom discounts are not available through automated support"

  # Rate limit customer emails to prevent spam
  - action: "write:email"
    effect: allow
    conditions:
      - "rate_limit(30, '1h')"
```

### 💼 Consulting Firm: Protecting Client Data

A 5-person consulting firm uses an AI research agent to gather information, draft reports, and summarize documents.

**Risks without governance:**
- Agent accesses Client A's data while working on Client B's project
- Agent sends research externally (email, API calls) containing proprietary info
- Agent stores sensitive data in unencrypted locations

**MeshGuard policy:**

```yaml
name: research-agent-policy
version: 1
agent_match:
  tags: ["research"]

rules:
  # Can read public data sources
  - action: "read:web"
    effect: allow

  # Can read project files for the assigned client only
  - action: "read:client_files"
    effect: allow
    conditions:
      - "request.client_id == agent.assigned_client"

  # Cannot access other clients' files
  - action: "read:client_files"
    effect: deny
    reason: "Access restricted to assigned client data only"

  # Cannot send data externally
  - action: "write:external_api"
    effect: deny
    reason: "External data transmission is not permitted"

  # Cannot write to shared storage
  - action: "write:shared_drive"
    effect: deny
    reason: "Write access to shared storage requires manual approval"
```

### 🍕 Restaurant: AI for Reservations and Ordering

A restaurant uses an AI agent to handle phone reservations, online ordering, and basic customer questions.

**Risks without governance:**
- Agent accepts reservations for dates you're closed
- Agent takes orders for items that are 86'd (out of stock)
- Agent processes an unreasonable number of orders (bot attack)

**MeshGuard policy:**

```yaml
name: restaurant-agent-policy
version: 1
agent_match:
  tags: ["restaurant-front"]

rules:
  # Can read menu and availability
  - action: "read:menu"
    effect: allow
  - action: "read:availability"
    effect: allow

  # Can create reservations during operating hours
  - action: "write:reservation"
    effect: allow
    conditions:
      - "request.party_size <= 10"
      - "request.date IN available_dates"

  # Block oversized parties — needs manager
  - action: "write:reservation"
    effect: deny
    conditions:
      - "request.party_size > 10"
    reason: "Large party reservations require manager confirmation"

  # Rate limit orders to prevent abuse
  - action: "write:order"
    effect: allow
    conditions:
      - "rate_limit(60, '1h')"
      - "request.total <= 500"

  # Block abnormally large orders
  - action: "write:order"
    effect: deny
    conditions:
      - "request.total > 500"
    reason: "Large orders require phone confirmation"
```

## Getting Started in 10 Minutes

### Step 1: Sign Up

Go to [meshguard.app](https://meshguard.app) and create a free account. No credit card needed.

### Step 2: Install the SDK

```bash
pip install meshguard
```

### Step 3: Get Your Agent Token

In the MeshGuard dashboard, create a new agent and copy its token.

### Step 4: Add Governance to Your Agent

```python
from meshguard import MeshGuardClient

client = MeshGuardClient(
    gateway_url="https://dashboard.meshguard.app",
    agent_token="your-agent-token",
)

# Before any sensitive action, check with MeshGuard
def handle_refund(order_id: str, amount: float):
    decision = client.check(
        action="write:refund",
        context={"order_id": order_id, "amount": amount}
    )
    if not decision.allowed:
        return f"Cannot process refund: {decision.reason}"
    
    return process_refund(order_id, amount)
```

### Step 5: Create Your First Policy

In the dashboard, create a policy (or use one of the templates above) and attach it to your agent. That's it — your agent is now governed.

## Cost: Free for Most Small Businesses

The Free tier (5 agents, 1,000 checks/month) covers the vast majority of small business use cases. A typical customer support agent might make 20-30 policy checks per day — well within the free limit.

If you grow beyond that, the **Starter tier** at $29/month gives you 25 agents and 10,000 checks — enough for a growing team with multiple agents.

| Tier | Agents | Checks/Month | Price |
|------|--------|-------------|-------|
| Free | 5 | 1,000 | $0 |
| Starter | 25 | 10,000 | $29/mo |
| Pro | 100 | 100,000 | $99/mo |

## When to Upgrade

You've outgrown the Free tier when:

- You have more than 5 agents
- You need more than 7 days of audit log retention
- You want priority support or SLA guarantees
- You need team collaboration features (multiple admins)

The jump to Starter is painless — same policies, same SDK, just more capacity.

## Next Steps

- [MeshGuard Pricing](https://meshguard.app/pricing) — Compare all tiers
- [MeshGuard Documentation](https://docs.meshguard.app) — Full reference
- [What is Agent Governance?](/concepts/what-is-agent-governance) — Understand the fundamentals
- [Building a Customer Service Agent](/guides/customer-service-agent) — Detailed tutorial with full code
- [Governing Clawdbot Agents](/guides/governing-clawdbot-agents) — If you're using Clawdbot as your agent platform
- [Personal vs Enterprise Governance](/guides/personal-vs-enterprise-governance) — How governance needs differ by scale

---

::: tip Start Free
[Sign up at meshguard.app](https://meshguard.app) — 5 agents, 1,000 checks/month, no credit card. Your AI agents will thank you.
:::
