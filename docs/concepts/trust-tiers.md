# Trust Tiers Explained

How MeshGuard uses trust levels to enable graduated autonomy for AI agents.

## The Problem: Not All Agents Are Equal

In any organization deploying AI agents, you'll have a spectrum:

- A **brand new chatbot** that's still being tested
- A **customer service agent** that's been running for months
- A **data analysis agent** with access to sensitive databases
- An **admin agent** that can modify system configurations

Treating all of these the same is either:
- **Too permissive:** New agents get access they haven't earned
- **Too restrictive:** Proven agents can't do their jobs

## The Solution: Trust Tiers

MeshGuard implements a **graduated trust model** with four tiers:

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   Privileged  ████████████████████████████████  (4)    │
│                                                         │
│   Trusted     ██████████████████████            (3)    │
│                                                         │
│   Verified    ████████████████                  (2)    │
│                                                         │
│   Anonymous   ████████                          (1)    │
│                                                         │
└─────────────────────────────────────────────────────────┘
         Increasing permissions and autonomy →
```

Each tier comes with different default permissions, rate limits, and capabilities.

## The Four Tiers

### 1. Anonymous (Lowest Trust)

**Who:** Unverified agents, public-facing bots, agents in testing.

**Default Permissions:**
- Read-only access to public data
- No write operations
- No external API calls
- Heavily rate-limited

**Use Cases:**
- Public chatbots answering FAQs
- Demo agents on marketing sites
- Agents in development/sandbox

**Example Policy:**
```yaml
tier: anonymous
default_rules:
  - action: "read:public_*"
    effect: allow
  - action: "*"
    effect: deny
    reason: "Anonymous agents have read-only access"
rate_limit: 10/minute
```

### 2. Verified (Basic Trust)

**Who:** Agents with confirmed identity, passed initial validation.

**Default Permissions:**
- Read access to most non-sensitive data
- Limited write operations
- Standard rate limits
- Basic tool access

**Use Cases:**
- Internal chatbots for employees
- Customer service agents (basic tier)
- Data retrieval agents

**Example Policy:**
```yaml
tier: verified
default_rules:
  - action: "read:*"
    effect: allow
  - action: "write:notes"
    effect: allow
  - action: "write:email"
    effect: allow
    conditions:
      - "recipient.internal == true"  # Internal only
  - action: "write:*"
    effect: deny
rate_limit: 100/minute
```

### 3. Trusted (Elevated Trust)

**Who:** Agents with proven track record, handling sensitive operations.

**Default Permissions:**
- Full read access
- Most write operations
- Can delegate to other agents
- Access to sensitive tools

**Use Cases:**
- Senior customer service agents (refunds, account changes)
- Data processing agents
- Workflow automation agents

**Example Policy:**
```yaml
tier: trusted
default_rules:
  - action: "read:*"
    effect: allow
  - action: "write:*"
    effect: allow
  - action: "delete:*"
    effect: deny
    reason: "Deletion requires privileged access"
delegation:
  enabled: true
  max_depth: 2  # Can delegate, delegates cannot re-delegate
rate_limit: 1000/minute
```

### 4. Privileged (Maximum Trust)

**Who:** Critical system agents, admin-level operations.

**Default Permissions:**
- Full access to all operations
- Can modify policies for lower tiers
- Unlimited delegation
- Minimal rate limiting

**Use Cases:**
- System administration agents
- Security monitoring agents
- Incident response automation

**Example Policy:**
```yaml
tier: privileged
default_rules:
  - action: "*"
    effect: allow
delegation:
  enabled: true
  max_depth: unlimited
rate_limit: unlimited
audit_level: enhanced  # Extra logging for privileged actions
```

## Trust Tier Behavior Matrix

| Capability | Anonymous | Verified | Trusted | Privileged |
|------------|:---------:|:--------:|:-------:|:----------:|
| Read public data | ✅ | ✅ | ✅ | ✅ |
| Read internal data | ❌ | ✅ | ✅ | ✅ |
| Read sensitive data | ❌ | ❌ | ✅ | ✅ |
| Write operations | ❌ | 🟡 Limited | ✅ | ✅ |
| Delete operations | ❌ | ❌ | ❌ | ✅ |
| External API calls | ❌ | 🟡 Limited | ✅ | ✅ |
| Delegate to others | ❌ | ❌ | ✅ | ✅ |
| Modify policies | ❌ | ❌ | ❌ | ✅ |

## Implementing Trust Tiers

### Creating Agents with Specific Tiers

```python
from meshguard import MeshGuardClient

# Admin client for agent management
admin = MeshGuardClient(admin_token="your-admin-token")

# Create a verified agent
verified_agent = admin.create_agent(
    name="customer-service-bot",
    trust_tier="verified",
    tags=["customer-service", "support"],
)

# Create a trusted agent
trusted_agent = admin.create_agent(
    name="refund-processor",
    trust_tier="trusted",
    tags=["finance", "refunds"],
)
```

### Checking Permissions Based on Tier

When an agent makes a request, MeshGuard automatically considers its tier:

```python
# Verified agent trying to delete
verified_client = MeshGuardClient(agent_token=verified_agent.token)
decision = verified_client.check("delete:customer_record")
# → DENIED (verified agents can't delete)

# Privileged agent trying to delete
privileged_client = MeshGuardClient(agent_token=privileged_agent.token)
decision = privileged_client.check("delete:customer_record")
# → ALLOWED
```

### Tier-Specific Policies

You can write policies that apply to specific tiers:

```yaml
name: financial-operations
version: 1

rules:
  # All tiers can view balances
  - action: "read:account_balance"
    effect: allow
    
  # Only trusted+ can process refunds
  - action: "write:refund"
    effect: allow
    conditions:
      - "agent.trust_tier IN ['trusted', 'privileged']"
      - "request.amount <= 500"
    
  # Only privileged can process large refunds
  - action: "write:refund"
    effect: allow
    conditions:
      - "agent.trust_tier == 'privileged'"
      - "request.amount > 500"
```

## Promoting and Demoting Agents

Trust isn't static. Agents can be promoted or demoted based on:

### Promotion Criteria

- **Time:** Agent has operated without issues for X days
- **Volume:** Successfully handled Y requests
- **Review:** Human administrator approval
- **Certification:** Passed automated testing

```python
# Promote an agent after review
admin.update_agent(
    agent_id="customer-service-bot",
    trust_tier="trusted",
    reason="Promoted after 30-day review period",
)
```

### Demotion Triggers

- **Policy violations:** Multiple denied actions
- **Anomalies:** Unusual behavior patterns
- **Incidents:** Involvement in a security event
- **Manual:** Administrator decision

```python
# Demote an agent after incident
admin.update_agent(
    agent_id="rogue-bot",
    trust_tier="anonymous",
    reason="Demoted pending investigation",
)
```

## Delegation and Trust Tiers

When agents delegate work to other agents, trust tiers determine what's possible.

### The Permission Ceiling Principle

A delegated agent cannot exceed the permissions of its delegator:

```
Trusted Agent (can: read, write)
    └── Delegates to → Verified Agent
                           └── Effective permissions: read, write
                               (Ceiling applied: can't exceed Trusted)
```

### Tier-Based Delegation Rules

| Delegator Tier | Can Delegate To |
|----------------|-----------------|
| Anonymous | ❌ Cannot delegate |
| Verified | ❌ Cannot delegate |
| Trusted | Anonymous, Verified |
| Privileged | All tiers |

```yaml
# Trusted agent delegation policy
tier: trusted
delegation:
  enabled: true
  allowed_target_tiers: ["anonymous", "verified"]
  max_chain_depth: 2
  require_audit: true
```

## Monitoring Trust Tiers

### Audit Queries by Tier

```python
# Find all actions by verified agents
verified_actions = client.get_audit_log(
    filters={"agent.trust_tier": "verified"},
    limit=1000,
)

# Find denials for trusted agents (potential issues)
trusted_denials = client.get_audit_log(
    filters={
        "agent.trust_tier": "trusted",
        "decision": "deny",
    },
)
```

### Tier Distribution Dashboard

Monitor your agent ecosystem:

```
┌────────────────────────────────────────────┐
│           Agent Distribution               │
├────────────────────────────────────────────┤
│ Privileged  ██                    2 (4%)   │
│ Trusted     ████████             12 (24%)  │
│ Verified    ████████████████████ 30 (60%)  │
│ Anonymous   ██████                6 (12%)  │
└────────────────────────────────────────────┘
```

## Best Practices

### 1. Start Restrictive

New agents should always start at `verified` or lower:

```python
# Default to verified, promote based on behavior
new_agent = admin.create_agent(
    name="new-assistant",
    trust_tier="verified",  # Never start at trusted/privileged
)
```

### 2. Document Promotion Criteria

Define clear criteria for each tier transition:

| From | To | Criteria |
|------|-----|----------|
| Anonymous | Verified | Identity confirmed, basic testing passed |
| Verified | Trusted | 30 days clean operation, 1000+ requests, human review |
| Trusted | Privileged | Security review, business justification, exec approval |

### 3. Audit Privileged Actions

All privileged agent actions should get enhanced logging:

```yaml
tier: privileged
audit:
  level: enhanced
  include_context: true
  notify_on: ["delete:*", "admin:*"]
```

### 4. Regular Reviews

Schedule periodic reviews of agent tiers:

- **Weekly:** Check for anomalies in trusted+ agents
- **Monthly:** Review agents due for promotion
- **Quarterly:** Full tier audit

## Conclusion

Trust tiers enable **graduated autonomy**:

- New agents operate with guardrails
- Proven agents earn more capability
- Critical operations require elevated trust
- The principle of least privilege is systematically enforced

This creates a secure, scalable foundation for deploying AI agents at enterprise scale.

---

::: tip Implement Trust Tiers Today
[Get started with MeshGuard →](https://meshguard.app)
:::
