# Policy Design Patterns

Best practices and proven patterns for writing effective MeshGuard policies that scale.

## Why Patterns Matter

Writing AI agent policies is a new discipline. Unlike traditional access control (RBAC for users, IAM for cloud resources), agent policies must handle:

- **Autonomous decision-making:** Agents act without human approval for each action
- **Dynamic contexts:** The same agent might need different permissions at different times
- **Complex delegation:** Agent A asks Agent B to do something on A's behalf
- **High velocity:** Agents can attempt thousands of actions per minute

Without established patterns, policy authors tend to either:
1. **Over-permit:** Grant broad access to "make it work," creating security holes
2. **Over-restrict:** Lock everything down, making agents useless

This guide presents battle-tested patterns that balance security with functionality.

## The Foundation: Deny-by-Default

Every effective policy starts with the same foundation: **deny everything unless explicitly permitted**.

### The Pattern

```yaml
name: foundation-policy
version: 1

rules:
  # Catch-all: deny everything by default
  - action: "*"
    effect: deny
    reason: "Action not explicitly permitted"
    
  # Then add specific allows
  - action: "read:public_data"
    effect: allow
```

### Why It Works

With deny-by-default:
- New actions are blocked until reviewed
- Forgotten permissions don't create vulnerabilities  
- You can audit exactly what's allowed

### The Anti-Pattern: Allow-by-Default

```yaml
# ❌ DANGEROUS: Don't do this
rules:
  - action: "*"
    effect: allow
    
  - action: "admin:*"
    effect: deny  # Trying to block specific things
```

This seems simpler but fails because:
- You must anticipate every dangerous action
- New features are automatically permitted
- One missed deny creates a vulnerability

### Real-World Example: Customer Service Agent

A customer service agent needs to read customer data and create tickets. With deny-by-default:

```yaml
name: customer-service-foundation
version: 1

rules:
  # Start with deny-all
  - action: "*"
    effect: deny
    reason: "Customer service agent has limited permissions"
    
  # Explicitly allow required actions
  - action: "read:customer_profile"
    effect: allow
    
  - action: "read:order_history"
    effect: allow
    
  - action: "write:support_ticket"
    effect: allow
    
  # Note: agent cannot write:customer_profile, delete anything,
  # or access billing — because we didn't allow it
```

## Role-Based Patterns

Different agents have different jobs. Role-based patterns group permissions by function.

### The Pattern

Define policies for roles, then assign agents to roles:

```yaml
name: role-customer-service-basic
version: 1
description: "Basic customer service capabilities"

rules:
  - action: "*"
    effect: deny
    
  - action: "read:customer_profile"
    effect: allow
    
  - action: "read:order_history"
    effect: allow
    
  - action: "write:support_ticket"
    effect: allow
    
  - action: "write:internal_note"
    effect: allow
```

```yaml
name: role-customer-service-senior
version: 1
description: "Senior CS with refund authority"
extends: role-customer-service-basic

rules:
  # Inherits all basic permissions, plus:
  - action: "write:refund"
    effect: allow
    conditions:
      - "request.amount <= 100"
      
  - action: "write:account_credit"
    effect: allow
    conditions:
      - "request.amount <= 50"
```

### Why It Works

Role-based patterns provide:
- **Consistency:** All agents in a role have the same permissions
- **Maintainability:** Update the role, update all agents
- **Clarity:** "What can this agent do?" → "What role is it?"

### Role Hierarchy Example

```
┌─────────────────────────────────────────────────────────┐
│                    admin-agent                          │
│   Can: Everything including policy management           │
└─────────────────────────────────────────────────────────┘
                          │
                          │ extends
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   senior-cs-agent                       │
│   Can: Basic CS + refunds up to $100 + credits          │
└─────────────────────────────────────────────────────────┘
                          │
                          │ extends
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    basic-cs-agent                       │
│   Can: Read customer data, create tickets               │
└─────────────────────────────────────────────────────────┘
```

### The Anti-Pattern: Copy-Paste Policies

```yaml
# ❌ BAD: Duplicated policies for each agent
name: agent-alice-policy
rules:
  - action: "read:customer_profile"
    effect: allow
  # ... 20 more rules

name: agent-bob-policy  
rules:
  - action: "read:customer_profile"
    effect: allow
  # ... same 20 rules, slightly different
```

This creates:
- **Drift:** Policies diverge over time
- **Maintenance burden:** Updates require touching every policy
- **Audit confusion:** Why is Bob different from Alice?

## Time-Based Patterns

Some actions should only be allowed during certain time windows.

### The Pattern

Use time conditions to restrict when actions are permitted:

```yaml
name: business-hours-policy
version: 1

rules:
  - action: "*"
    effect: deny
    
  # Allow customer data access only during business hours
  - action: "read:customer_*"
    effect: allow
    conditions:
      - "time.hour >= 9 AND time.hour < 18"  # 9 AM to 6 PM
      - "time.weekday IN [1,2,3,4,5]"        # Monday-Friday
    
  # After hours: read-only access to knowledge base
  - action: "read:knowledge_base"
    effect: allow
```

### Use Cases

**1. Maintenance Windows**

Allow destructive operations only during scheduled maintenance:

```yaml
name: database-maintenance-policy
version: 1

rules:
  # Normal operations always allowed
  - action: "read:database_*"
    effect: allow
    
  - action: "write:database_*"
    effect: allow
    
  # Destructive operations only in maintenance windows
  - action: "delete:database_*"
    effect: allow
    conditions:
      - "time.weekday == 7"           # Sunday only
      - "time.hour >= 2 AND time.hour < 6"  # 2-6 AM
      
  - action: "admin:database_*"
    effect: allow
    conditions:
      - "time.weekday == 7"
      - "time.hour >= 2 AND time.hour < 6"
```

**2. Trading Hours**

Financial agents restricted to market hours:

```yaml
name: trading-agent-policy
version: 1

rules:
  # Market data always readable
  - action: "read:market_*"
    effect: allow
    
  # Trades only during market hours (9:30 AM - 4 PM ET)
  - action: "write:trade_*"
    effect: allow
    conditions:
      - "time.hour >= 9 AND (time.hour < 16 OR (time.hour == 9 AND time.minute >= 30))"
      - "time.weekday IN [1,2,3,4,5]"
      - "NOT calendar.is_market_holiday"
```

**3. Escalation Windows**

Allow autonomous action during off-hours when humans aren't available:

```yaml
name: incident-response-policy
version: 1

rules:
  # During business hours: alert humans
  - action: "notify:oncall_team"
    effect: allow
    conditions:
      - "time.hour >= 9 AND time.hour < 18"
      
  # After hours: agent can take autonomous action
  - action: "execute:incident_remediation"
    effect: allow
    conditions:
      - "time.hour < 9 OR time.hour >= 18"  # Off hours
      - "incident.severity IN ['critical', 'high']"
```

### The Anti-Pattern: Hardcoded Time Checks

```yaml
# ❌ BAD: Hardcoding times without timezone awareness
conditions:
  - "time.hour >= 9"  # Which timezone? Server? User? Agent?
```

Always specify timezone explicitly:

```yaml
# ✅ GOOD: Explicit timezone
conditions:
  - "time.hour >= 9 AND time.hour < 18"
  - "time.timezone == 'America/New_York'"
```

## Resource-Based Patterns

Different resources require different protection levels.

### The Pattern

Classify resources, then apply policies based on classification:

```yaml
name: resource-classification-policy
version: 1

rules:
  - action: "*"
    effect: deny
    
  # Public resources: broad access
  - action: "read:*"
    effect: allow
    conditions:
      - "resource.classification == 'public'"
      
  # Internal resources: verified agents
  - action: "read:*"
    effect: allow
    conditions:
      - "resource.classification == 'internal'"
      - "agent.trust_tier IN ['verified', 'trusted', 'privileged']"
      
  # Confidential resources: trusted agents only
  - action: "read:*"
    effect: allow
    conditions:
      - "resource.classification == 'confidential'"
      - "agent.trust_tier IN ['trusted', 'privileged']"
      
  # Restricted resources: privileged agents only
  - action: "read:*"
    effect: allow
    conditions:
      - "resource.classification == 'restricted'"
      - "agent.trust_tier == 'privileged'"
```

### Resource Hierarchies

Protect parent-child relationships:

```yaml
name: database-resource-policy
version: 1

rules:
  # All agents can query analytics database
  - action: "read:database.analytics.*"
    effect: allow
    
  # Only trusted agents can query production
  - action: "read:database.production.*"
    effect: allow
    conditions:
      - "agent.trust_tier IN ['trusted', 'privileged']"
      
  # Only privileged agents can write to production
  - action: "write:database.production.*"
    effect: allow
    conditions:
      - "agent.trust_tier == 'privileged'"
      
  # Nobody can drop production tables without explicit approval
  - action: "admin:database.production.drop_table"
    effect: deny
    reason: "Table drops require manual approval process"
```

### Data-Type Policies

Apply rules based on data types:

```yaml
name: pii-protection-policy
version: 1

rules:
  # PII can be read but not exported
  - action: "read:*.pii_*"
    effect: allow
    conditions:
      - "agent.trust_tier IN ['trusted', 'privileged']"
      
  - action: "export:*.pii_*"
    effect: deny
    reason: "PII cannot be exported by agents"
    
  # Anonymized data can be exported
  - action: "export:*.anonymized_*"
    effect: allow
    
  # Financial data requires additional logging
  - action: "*:*.financial_*"
    effect: allow
    conditions:
      - "agent.trust_tier IN ['trusted', 'privileged']"
    audit:
      level: enhanced
      notify: ["compliance@company.com"]
```

### The Anti-Pattern: Flat Resource Permissions

```yaml
# ❌ BAD: No resource distinction
rules:
  - action: "read:database"
    effect: allow
    
  - action: "write:database"
    effect: allow
```

This allows reading/writing anything in any database. Classify and protect.

## Conditional Patterns

Real-world policies often need multiple conditions working together.

### The Pattern: AND Conditions

All conditions must be true:

```yaml
rules:
  - action: "write:refund"
    effect: allow
    conditions:
      - "agent.trust_tier == 'trusted'"      # Must be trusted
      - "request.amount <= 100"               # Must be small
      - "customer.account_age_days >= 30"     # Must be established customer
```

### The Pattern: OR Conditions

Any condition being true is sufficient:

```yaml
rules:
  - action: "read:confidential_docs"
    effect: allow
    conditions:
      any:
        - "agent.department == 'legal'"
        - "agent.department == 'executive'"
        - "agent.has_role == 'auditor'"
```

### Complex Conditionals

Combine AND and OR:

```yaml
rules:
  - action: "write:large_transaction"
    effect: allow
    conditions:
      all:
        - "request.amount > 10000"
        any:
          - "agent.trust_tier == 'privileged'"
          - all:
              - "agent.trust_tier == 'trusted'"
              - "request.has_dual_approval == true"
```

This allows large transactions if:
- Agent is privileged, OR
- Agent is trusted AND has dual approval

### Real-World Example: Data Processing Agent

A data processing agent that handles ETL pipelines:

```yaml
name: data-processor-policy
version: 1
description: "ETL pipeline agent with environment-aware permissions"

rules:
  - action: "*"
    effect: deny
    
  # Read from any source
  - action: "read:source.*"
    effect: allow
    
  # Write to staging in any environment
  - action: "write:staging.*"
    effect: allow
    
  # Write to production only if:
  # - Pipeline has been tested (staging success)
  # - It's during approved deployment window
  # - Data validation passed
  - action: "write:production.*"
    effect: allow
    conditions:
      all:
        - "pipeline.staging_status == 'success'"
        - "pipeline.validation_status == 'passed'"
        - any:
            - "deploy_window.is_active == true"
            - "request.emergency_override == true AND agent.trust_tier == 'privileged'"
    
  # Delete operations only in non-production
  - action: "delete:*"
    effect: allow
    conditions:
      - "resource.environment != 'production'"
```

## Anti-Patterns to Avoid

Learn from common mistakes.

### Anti-Pattern 1: The "God Agent"

```yaml
# ❌ TERRIBLE: One agent that can do everything
name: super-agent-policy
rules:
  - action: "*"
    effect: allow
```

**Why it's bad:**
- No audit granularity
- Compromise means total access
- Impossible to debug behavior

**Fix:** Create specific roles even if one team manages the agent.

### Anti-Pattern 2: Permission Creep

```yaml
# Policy version 1
rules:
  - action: "read:orders"
    effect: allow

# Version 2: "Just add this one thing"
rules:
  - action: "read:orders"
    effect: allow
  - action: "write:orders"    # Added
    effect: allow

# Version 47: "I don't know what this agent can do anymore"
rules:
  - action: "read:*"
    effect: allow
  - action: "write:*"
    effect: allow
  - action: "delete:*"        # How did this get here?
    effect: allow
```

**Fix:** Regular policy reviews. Document why each permission exists.

### Anti-Pattern 3: Overly Broad Wildcards

```yaml
# ❌ BAD: Wildcards without constraints
rules:
  - action: "read:customer_*"
    effect: allow  # Matches customer_pii, customer_credit_card, etc.
```

**Fix:** Be explicit or add conditions:

```yaml
# ✅ GOOD: Explicit actions
rules:
  - action: "read:customer_profile"
    effect: allow
  - action: "read:customer_orders"
    effect: allow
  # Explicitly not including customer_pii

# ✅ ALSO GOOD: Wildcard with exclusions
rules:
  - action: "read:customer_*"
    effect: allow
    conditions:
      - "NOT action MATCHES 'read:customer_pii'"
      - "NOT action MATCHES 'read:customer_payment_*'"
```

### Anti-Pattern 4: Deny Without Reason

```yaml
# ❌ BAD: No context for denials
rules:
  - action: "admin:*"
    effect: deny
```

**Fix:** Always explain why:

```yaml
# ✅ GOOD: Reason helps debugging and auditing
rules:
  - action: "admin:*"
    effect: deny
    reason: "Admin operations require manual approval. Contact platform-team@company.com"
```

### Anti-Pattern 5: Testing in Production

Writing policies directly against production resources without testing.

**Fix:** Use a staged approach (see next section).

## Testing and Iterating on Policies

Policies should be developed like software: write, test, deploy, monitor.

### Stage 1: Dry-Run Mode

Test policies without enforcement:

```yaml
name: new-policy-v1
version: 1
enforcement: dry_run  # Log decisions but don't enforce

rules:
  - action: "write:*"
    effect: deny
```

In dry-run mode:
- All actions are allowed (as if policy didn't exist)
- Decisions are logged with "would have been denied" markers
- You can analyze impact before enforcing

### Stage 2: Shadow Testing

Run the new policy alongside the old one:

```python
# Both policies evaluate, only old one enforces
shadow_config = {
    "active_policy": "existing-policy-v5",
    "shadow_policy": "new-policy-v1",
}
```

Compare decisions:
- Where do they agree?
- Where do they disagree?
- Are the disagreements intentional?

### Stage 3: Gradual Rollout

Enforce for a subset of agents first:

```yaml
name: new-policy-v1
version: 1
enforcement: enabled
rollout:
  percentage: 10  # Only 10% of matching agents
  # OR
  agents: ["test-agent-1", "test-agent-2"]  # Specific agents only
```

### Stage 4: Full Deployment

After validation, remove rollout restrictions:

```yaml
name: new-policy-v1
version: 1
enforcement: enabled
# rollout removed = applies to all matching agents
```

### Monitoring Policy Performance

Track key metrics:

```yaml
# In your policy config
monitoring:
  alert_on:
    - denial_rate > 20%       # Too many denials might indicate policy is too strict
    - denial_rate < 0.1%      # Too few denials might indicate policy is too permissive
    - unknown_actions > 10/hr # Actions hitting catch-all deny (need explicit rules)
```

### Policy Versioning

Always version your policies:

```yaml
name: customer-service-policy
version: 12  # Increment on every change
changelog:
  - version: 12
    date: 2026-01-25
    author: platform-team
    changes: "Added refund limits for fraud prevention"
  - version: 11
    date: 2026-01-10
    changes: "Expanded read access to order history"
```

## Real-World Scenario: Admin Agent

An admin agent needs powerful capabilities but must be tightly controlled.

```yaml
name: admin-agent-policy
version: 1
description: "System administration agent with enhanced logging"

# Require privileged trust tier
required_trust_tier: privileged

rules:
  - action: "*"
    effect: deny
    reason: "Admin actions must be explicitly permitted"
    
  # System health: always allowed
  - action: "read:system.*"
    effect: allow
    
  # Configuration changes: allowed with logging
  - action: "write:config.*"
    effect: allow
    audit:
      level: enhanced
      include_diff: true  # Log what changed
      
  # Service restarts: allowed during maintenance windows
  - action: "admin:service.restart"
    effect: allow
    conditions:
      - "time.is_maintenance_window == true"
    audit:
      level: enhanced
      notify: ["oncall@company.com"]
      
  # User management: requires dual approval
  - action: "admin:user.*"
    effect: allow
    conditions:
      - "request.approval_count >= 2"
    audit:
      level: enhanced
      notify: ["security@company.com"]
      
  # Destructive operations: never automated
  - action: "admin:*.delete"
    effect: deny
    reason: "Destructive admin operations require manual execution"
    
  - action: "admin:*.drop"
    effect: deny
    reason: "Destructive admin operations require manual execution"
```

## Putting It All Together

Here's how patterns combine in practice:

```yaml
name: comprehensive-agent-policy
version: 3
description: "Production policy for customer-facing agents"

# Foundation: Deny by default
default_effect: deny

# Role-based: Inherit from base role
extends: role-customer-service-basic

rules:
  # Resource-based: Different data, different rules
  - action: "read:customer.public_*"
    effect: allow
    
  - action: "read:customer.private_*"
    effect: allow
    conditions:
      - "agent.trust_tier IN ['trusted', 'privileged']"
      
  # Time-based: Refunds only during business hours
  - action: "write:refund"
    effect: allow
    conditions:
      - "agent.trust_tier == 'trusted'"
      - "request.amount <= 100"
      - "time.hour >= 9 AND time.hour < 18"
      - "time.timezone == 'America/New_York'"
      
  # Conditional: Large refunds need approval
  - action: "write:refund"
    effect: allow
    conditions:
      - "request.amount > 100 AND request.amount <= 500"
      - "request.manager_approval == true"

# Monitoring
monitoring:
  alert_on:
    - denial_rate > 15%
    - "action:write:refund denial_count > 50/day"
```

## Key Takeaways

1. **Start with deny-by-default** — it's the only safe foundation
2. **Use roles** — group permissions by function, not by agent
3. **Add time constraints** — not everything should be allowed 24/7
4. **Classify resources** — different data needs different protection
5. **Test before deploying** — use dry-run and shadow modes
6. **Monitor and iterate** — policies are never "done"
7. **Document everything** — reasons, changelogs, and decisions

Good policy design is the difference between AI agents that enhance your business and AI agents that become liabilities.

---

## Next Steps

Ready to dive deeper? Explore these related concepts:

- [What is Agent Governance?](/concepts/what-is-agent-governance) — Understand the foundations
- [Trust Tiers Explained](/concepts/trust-tiers) — Learn how trust levels enable graduated autonomy

::: tip Design Better Policies Today
MeshGuard provides the tools to implement these patterns at scale — policy versioning, dry-run testing, real-time monitoring, and comprehensive audit logs.

[Start building with MeshGuard →](https://meshguard.app)
:::
