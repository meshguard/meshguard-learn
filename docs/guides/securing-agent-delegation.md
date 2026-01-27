---
title: Securing Agent-to-Agent Delegation
description: How to design delegation boundaries, enforce chain validation, and prevent privilege escalation in multi-agent systems.
outline: deep
---

# Securing Agent-to-Agent Delegation

How to design delegation boundaries, enforce chain validation, and prevent privilege escalation in multi-agent systems.

## The Delegation Problem

In a multi-agent system, agents don't work alone. A customer service agent delegates data lookups to a database agent. A workflow orchestrator delegates subtasks to specialized agents. A planning agent delegates execution to action agents.

This is powerful—and dangerous.

Every delegation is a transfer of authority. When Agent A asks Agent B to perform an action on its behalf, Agent B is now operating with some subset of Agent A's permissions. If you don't design this carefully, you end up with one of two problems:

1. **Over-delegation:** Agents pass more authority than necessary, creating a privilege escalation path. One compromised agent in the chain can access everything upstream.
2. **Under-delegation:** Agents can't pass enough authority to get work done, so operators grant broad static permissions as a workaround—which is worse.

The solution is structured delegation with explicit scopes, time bounds, and chain validation. Let's build it.

## Principle of Least Privilege for Agents

You know this principle from traditional security: grant the minimum permissions necessary to perform a task. For agent delegation, this means:

- **Don't delegate your full permission set.** If you have read/write access to the customer database, but you're asking another agent to look up an order status, delegate `read:orders` — not `read:*`.
- **Don't delegate permanently.** If the task takes 5 minutes, the delegation should expire in 10—not live forever.
- **Don't delegate more than you have.** An agent with `read:orders` can't delegate `write:orders`. This sounds obvious, but without enforcement, it happens.

Here's the core delegation model:

```pseudocode
type Delegation:
    id: string                    // Unique identifier
    delegator: AgentId            // Who is granting authority
    delegate: AgentId             // Who is receiving authority
    scopes: list[Scope]           // What permissions are granted
    ceiling: list[Scope]          // Maximum scopes (can't exceed delegator's)
    expiresAt: timestamp          // When this delegation dies
    maxChainDepth: integer        // How many further re-delegations allowed
    constraints: Constraints      // Additional restrictions
    parentDelegationId: string?   // If this is a sub-delegation, link to parent

type Scope:
    action: "read" | "write" | "execute" | "delegate"
    resource: string              // e.g., "orders", "customers.email", "api.payments"
    conditions: map[string, any]? // e.g., { "customerId": "specific-id" }
```

## Designing Scope Boundaries

Good scope design is the difference between a secure delegation system and security theater. Here's how to think about it:

### The Three Permission Levels

**Read scopes** grant observation without modification:
```pseudocode
read:orders              // Can read all orders
read:orders.status       // Can read only order status fields
read:customers.{id}      // Can read a specific customer record
```

**Write scopes** grant modification within boundaries:
```pseudocode
write:orders.notes           // Can add notes to orders
write:orders.status[pending->shipped]  // Can only change status in this direction
write:refunds{max:50.00}     // Can write refunds up to $50
```

**Execute scopes** grant the ability to trigger actions:
```pseudocode
execute:email.send{template:orderConfirmation}  // Can send this specific email template
execute:api.payments.refund{max:100.00}          // Can trigger refunds up to $100
execute:workflow.escalate                        // Can escalate to human review
```

### Scope Narrowing

When an agent delegates, it can only narrow scopes—never widen them:

```pseudocode
function validateDelegation(delegation):
    delegatorScopes = getEffectiveScopes(delegation.delegator)
    
    for scope in delegation.scopes:
        if not isSubsetOf(scope, delegatorScopes):
            reject("Cannot delegate scope not held: " + scope)
        
        if delegation.ceiling and not isSubsetOf(scope, delegation.ceiling):
            reject("Scope exceeds delegation ceiling: " + scope)
    
    return valid
```

**Example in practice:**

```pseudocode
// Orchestrator has broad permissions
orchestrator.scopes = [
    "read:customers",
    "write:orders",
    "execute:email.send",
    "execute:api.payments.refund{max:500}"
]

// It delegates to a lookup agent — narrow scope
delegation_to_lookup = {
    delegate: lookupAgent,
    scopes: ["read:customers.name", "read:customers.orderHistory"],
    expiresAt: now() + 5 minutes,
    maxChainDepth: 0,  // Cannot re-delegate
}

// It delegates to a refund agent — narrow and constrained
delegation_to_refund = {
    delegate: refundAgent,
    scopes: ["execute:api.payments.refund{max:50}"],  // Narrowed from $500 to $50
    expiresAt: now() + 10 minutes,
    maxChainDepth: 0,
}
```

## Chain Validation at Runtime

In complex meshes, delegations form chains: A delegates to B, B delegates to C. Every link in the chain must be valid for the final action to be authorized.

```pseudocode
function validateDelegationChain(agent, action):
    chain = buildDelegationChain(agent, action)
    
    if chain == null:
        return DENY("No valid delegation chain for this action")
    
    // Validate each link in the chain
    for i, link in enumerate(chain):
        // 1. Is this delegation still alive?
        if link.expiresAt < now():
            return DENY("Delegation expired at link " + i)
        
        // 2. Was the delegator revoked?
        if isRevoked(link.id):
            return DENY("Delegation revoked at link " + i)
        
        // 3. Does this link's scope cover the requested action?
        if not scopeCovers(link.scopes, action):
            return DENY("Insufficient scope at link " + i)
        
        // 4. Is the chain too deep?
        if i > link.maxChainDepth:
            return DENY("Chain depth exceeded at link " + i)
        
        // 5. Does the delegator still have the underlying permission?
        if not agentHasScope(link.delegator, link.scopes):
            return DENY("Delegator lost underlying permission at link " + i)
    
    return ALLOW(chain)
```

**That last check is critical.** If Agent A delegates to Agent B, and then Agent A's own permissions are revoked, Agent B's delegation should immediately become invalid—even if the delegation itself hasn't expired. This is called **transitive revocation**, and missing it is one of the most common delegation security bugs.

## Time-Bounded Delegations: Everything Expires

Permanent delegations are the `chmod 777` of agent governance. Don't do it.

Every delegation should have an explicit expiration time. Here's how to choose:

```pseudocode
function calculateExpiration(delegation):
    // Base: how long should this task take?
    estimatedDuration = estimateTaskDuration(delegation.purpose)
    
    // Add buffer (2x is a reasonable default)
    buffer = estimatedDuration * 2
    
    // Apply maximum based on scope sensitivity
    maxDuration = getMaxDuration(delegation.scopes)
    // read:* → max 24 hours
    // write:* → max 4 hours  
    // execute:* → max 1 hour
    // execute:*.payments → max 15 minutes
    
    expiration = min(estimatedDuration + buffer, maxDuration)
    
    return now() + expiration
```

### Renewal vs. New Delegation

What if a task takes longer than expected? Don't extend the existing delegation—issue a new one. This forces a fresh validation of the entire chain:

```pseudocode
function renewDelegation(existingDelegation):
    // Don't just bump the expiration—create a fresh delegation
    newDelegation = createDelegation(
        delegator: existingDelegation.delegator,
        delegate: existingDelegation.delegate,
        scopes: existingDelegation.scopes,  // Same scopes
        expiresAt: calculateExpiration(existingDelegation),
        parentDelegationId: existingDelegation.id,  // Link for audit trail
    )
    
    // Re-validate everything
    if not validateDelegation(newDelegation):
        return DENY("Renewal failed validation—delegator permissions may have changed")
    
    // Revoke the old one
    revoke(existingDelegation.id)
    
    return newDelegation
```

## Revocation Strategies

When a delegation needs to end—because of a detected anomaly, a policy change, or just routine expiration—you have two strategies:

### Immediate Revocation
The delegation is invalid *right now*. Any in-flight operations using this delegation will fail on their next permission check.

```pseudocode
function revokeImmediate(delegationId):
    delegation = getDelegation(delegationId)
    
    // Mark as revoked
    delegation.status = "revoked"
    delegation.revokedAt = now()
    
    // Revoke all child delegations (transitive)
    children = getChildDelegations(delegationId)
    for child in children:
        revokeImmediate(child.id)
    
    // Notify affected agents
    notifyAgent(delegation.delegate, "delegation_revoked", delegationId)
    
    auditLog.record("delegation_revoked_immediate", delegation)
```

**When to use:** Security incidents, detected anomalies, compromised agents. Speed beats graceful handling.

### Graceful Revocation
The delegation will not be renewed, and in-flight operations are allowed to complete, but no *new* operations are permitted.

```pseudocode
function revokeGraceful(delegationId, gracePeriod):
    delegation = getDelegation(delegationId)
    
    // Mark as winding down
    delegation.status = "winding_down"
    delegation.windDownStartedAt = now()
    delegation.hardDeadline = now() + gracePeriod
    
    // Allow in-flight operations to complete
    // Block new operation initiation
    delegation.allowNewOperations = false
    
    // Schedule hard revocation
    schedule(at=delegation.hardDeadline):
        revokeImmediate(delegationId)
    
    notifyAgent(delegation.delegate, "delegation_winding_down", delegationId, gracePeriod)
    
    auditLog.record("delegation_revoked_graceful", delegation, gracePeriod)
```

**When to use:** Planned changes, routine rotation, trust tier changes. Gives agents time to clean up.

### Choosing Your Strategy

| Scenario | Strategy | Grace Period |
|---|---|---|
| Security incident | Immediate | None |
| Agent anomaly detected | Immediate | None |
| Trust score dropped below threshold | Graceful | 5 minutes |
| Policy update affecting scopes | Graceful | 15 minutes |
| Routine delegation rotation | Graceful | 30 minutes |
| Delegator going offline | Graceful | Match remaining delegation TTL |

## Audit Trail Requirements

Every delegation action must be logged. This isn't optional—it's the foundation of accountability and incident investigation.

Here's what your audit trail must capture:

```pseudocode
type DelegationAuditEntry:
    timestamp: datetime
    eventType: "created" | "used" | "renewed" | "revoked" | "expired" | "denied"
    delegationId: string
    delegator: AgentId
    delegate: AgentId
    scopes: list[Scope]
    chainDepth: integer
    parentDelegationId: string?
    
    // For "used" events
    actionPerformed: string?
    resourceAccessed: string?
    outcome: "success" | "failure" | "denied"?
    
    // For "denied" events
    denialReason: string?
    requestedScopes: list[Scope]?
    
    // For "revoked" events
    revocationType: "immediate" | "graceful"?
    revokedBy: string?  // system, human operator, or automated rule
    revocationReason: string?
```

**Key audit queries you need to support:**
- "Show me every action Agent X took using delegation Y"
- "Who delegated what to Agent X in the last 24 hours?"
- "Show me all delegation chains that touched resource Z"
- "When was Agent X's delegation revoked, and why?"
- "Show me all denied delegation requests in the last week"

If you can't answer these in under 30 seconds, your audit trail needs work.

## Common Anti-Patterns

These are the mistakes we see most often. If you recognize any of them in your system, fix them now.

### 1. Over-Delegation
**The pattern:** Agent A delegates its full permission set to Agent B because "it's easier" or "we don't know exactly what B will need."

**Why it's dangerous:** If Agent B is compromised, the attacker has Agent A's full permissions. You've turned a single-agent breach into a mesh-wide incident.

**The fix:** Require explicit scope enumeration. If an agent can't specify what permissions it needs to delegate, it shouldn't be delegating.

### 2. Permanent Grants
**The pattern:** Delegations with no expiration time, or expiration times set to 10 years from now (same thing).

**Why it's dangerous:** Permissions accumulate. Agents that no longer need access retain it. A delegation created for a one-time task lives forever.

**The fix:** Enforce maximum TTLs per scope type. No exceptions. If a task is recurring, create recurring short-lived delegations—not one immortal one.

### 3. Missing Ceilings
**The pattern:** No limit on how many delegations an agent can create, or how deep a delegation chain can go.

**Why it's dangerous:** An agent could create thousands of delegations, or delegation chains could go 50 levels deep, making it impossible to audit or revoke.

**The fix:**
```pseudocode
delegationLimits = {
    maxActiveDelegationsPerAgent: 10,
    maxChainDepth: 3,
    maxScopesPerDelegation: 5,
    requireExplicitPurpose: true,
}
```

### 4. No Transitive Revocation
**The pattern:** When Agent A's permissions are revoked, Agent B (which received a delegation from A) retains its delegated access.

**Why it's dangerous:** The revocation is incomplete. The security action that was supposed to contain the incident left a backdoor open.

**The fix:** Every delegation check must verify the *entire chain* is still valid, not just the immediate link. See the chain validation section above.

### 5. Scope Creep Through Aggregation
**The pattern:** Agent B receives `read:customers.name` from Agent A and `read:customers.email` from Agent C. Together, these give Agent B access to customer PII that neither A nor C intended to expose as a combined set.

**Why it's dangerous:** Each individual delegation follows least privilege, but the aggregate exceeds what any single delegator intended.

**The fix:** Evaluate an agent's total effective permissions at delegation time, not just the individual grant:
```pseudocode
function validateDelegation(newDelegation):
    existingScopes = getEffectiveScopes(newDelegation.delegate)
    combinedScopes = merge(existingScopes, newDelegation.scopes)
    
    if triggersSensitiveDataCombination(combinedScopes):
        requireHumanApproval(newDelegation)
        // or reject outright
```

## Quick-Start Checklist

Ready to implement secure delegation? Here's your path:

- [ ] **Define your scope taxonomy** — Map every resource and action type to a scope string
- [ ] **Implement scope narrowing** — Agents can only delegate subsets of their own permissions
- [ ] **Add expiration to every delegation** — No exceptions, enforce max TTLs per scope type
- [ ] **Limit chain depth** — Start with a max depth of 3, adjust based on your architecture
- [ ] **Implement chain validation** — Every action checks the full chain, not just the last link
- [ ] **Add transitive revocation** — Revoking a delegation revokes all children
- [ ] **Build your audit trail** — Log create, use, renew, revoke, expire, and deny events
- [ ] **Set delegation limits** — Cap active delegations per agent and scopes per delegation
- [ ] **Add aggregate scope checks** — Detect when combined delegations exceed intended access
- [ ] **Create your revocation playbook** — Document when to use immediate vs. graceful

## Where This Connects

Delegation doesn't exist in isolation. It's part of your broader governance fabric:

- [Trust scores](/guides/implementing-trust-scores) determine whether an agent is *allowed* to delegate and what scope ceilings apply
- [Behavioral monitoring](/guides/monitoring-agent-behavior) detects anomalous delegation patterns (sudden spike in delegations, unusual chain depth)
- [Delegation chains](/concepts/delegation-chains) covers the conceptual model in depth
- [Least privilege](/concepts/least-privilege) is the principle underlying everything in this guide

Delegation is where trust meets action in a multi-agent system. Get it right, and your agents can collaborate safely. Get it wrong, and a single compromised agent becomes an all-access pass. Take the time to build it properly.
