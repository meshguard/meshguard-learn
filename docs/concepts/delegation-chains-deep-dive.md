---
title: "Delegation Chains: How Agents Grant Authority to Other Agents"
description: A deep dive into scoped delegation, chain depth limits, permission ceilings, circular delegation detection, and the security principles that make agent-to-agent authority transfer safe.
outline: deep
---

# Delegation Chains: How Agents Grant Authority to Other Agents

When a human asks an AI agent to "research competitor pricing and update the strategy document," that single request might cascade through four or five specialized agents — a research agent, a web scraping agent, a data analysis agent, a document editor, and a notification agent. Each agent in the chain needs *some* authority to do its job. The question that defines the security of the entire system is: **what authority does each agent get, where does that authority come from, and when does it expire?**

Get this wrong, and you've built a privilege escalation superhighway. Get it right, and you have a composable, auditable system where agents collaborate safely.

This article goes deep on delegation chains — the mechanisms, the constraints, and the principles that make agent-to-agent authority transfer work. For a broader overview, see [Delegation Chains](/concepts/delegation-chains).

## The Fundamental Problem

In traditional computing, authority is straightforward. A user authenticates, receives permissions, and those permissions govern what they can do. If they invoke a service, that service runs with *its own* permissions, not the user's. The boundary is clear.

AI agent meshes blow this model apart. When Agent A invokes Agent B to complete a subtask, Agent B often needs *some* of Agent A's authority — not all of it, but enough to accomplish the delegated work. Agent B might then invoke Agent C, which needs a subset of *that* subset.

This creates a chain of authority:

```
User → Agent A → Agent B → Agent C → Resource
           ↓          ↓          ↓
       Full scope  Subset    Sub-subset
       of user's   of A's    of B's
       grant       scope     scope
```

Each link in this chain introduces risk:

- **Over-delegation:** Agent A passes more authority than Agent B needs
- **Chain amplification:** Each delegation compounds the risk surface
- **Accountability gaps:** When something goes wrong at the end of the chain, who's responsible?
- **Stale authority:** Delegated permissions outlive the task they were granted for

Solving these problems requires a principled approach to delegation — one that draws from decades of security research but adapts to the unique challenges of autonomous agents.

## Scoped Delegation vs. Blanket Permissions

The most important principle in delegation chain security is **scope narrowing**: every delegation should pass the *minimum* authority needed for the subtask, not the delegating agent's full permission set.

### Blanket Delegation (The Wrong Way)

Blanket delegation passes the full authority of the delegating agent to the downstream agent:

```
Agent A (permissions: read_db, write_db, send_email, manage_users)
    │
    └── delegates ALL to Agent B
            │
            └── Agent B now has: read_db, write_db, send_email, manage_users
```

This is equivalent to handing someone your master key because they need to open one door. It's simple. It's also dangerously irresponsible. Agent B now has write access to the database and user management capabilities that have nothing to do with its task.

### Scoped Delegation (The Right Way)

Scoped delegation explicitly narrows permissions to what the subtask requires:

```
Agent A (permissions: read_db, write_db, send_email, manage_users)
    │
    └── delegates {read_db} to Agent B for task "generate_report"
            │
            └── Agent B has: read_db (only)
```

Agent B gets read access — exactly what it needs to generate a report — and nothing else. It can't write to the database, send emails, or manage users. The scope is explicit, bounded, and auditable.

This mirrors the OAuth 2.0 model, where applications request specific scopes (`read:email`, `repo:status`) rather than full account access. The lesson from OAuth's evolution is instructive: early OAuth implementations often requested blanket permissions, and the industry spent years tightening scopes after the damage was done. Agent governance should learn from that history and start with narrow scopes from day one.

## Chain Depth Limits

Every link in a delegation chain adds latency, complexity, and risk. Without limits, chains can grow arbitrarily deep:

```
A → B → C → D → E → F → G → H → ...
```

At each level, new trust relationships form, accountability diffuses, and the blast radius of a compromise expands. A corrupted agent at the end of a 10-level chain is nearly impossible to trace back to the originating request.

Chain depth limits impose a hard ceiling:

- **Depth 1:** Direct delegation only. The agent can invoke other agents but those agents cannot delegate further. Simplest, most restrictive.
- **Depth 2-3:** Practical for most workflows. An orchestrator delegates to specialists, who may delegate to utilities.
- **Depth 4+:** Rarely justified. Any workflow requiring this many levels of delegation should be re-architected.

The right depth limit depends on the workflow's complexity and the trust level of the agents involved. A useful heuristic: [Privileged agents](/concepts/trust-tiers) might be permitted deeper chains (depth 3-4) while Untrusted agents should be limited to depth 1 or even denied delegation entirely.

### Why Depth Limits Prevent Authority Explosion

Consider a mesh where each agent can delegate to three others, with no depth limit:

```
Depth 0:  1 agent
Depth 1:  3 agents
Depth 2:  9 agents
Depth 3:  27 agents
Depth 4:  81 agents
Depth 5:  243 agents
```

At depth 5, a single request has potentially involved 243 agents, each holding some delegated authority derived from the original grant. Even with perfect scope narrowing, the *number of active trust relationships* grows exponentially. A depth limit of 3 caps this at 40 agents — still substantial but manageable and auditable.

## Circular Delegation Detection

Circular delegation occurs when a chain loops back on itself:

```
Agent A → Agent B → Agent C → Agent A  (circular!)
```

Circular delegation is almost never intentional and is always dangerous. It can cause:

- **Infinite loops:** Agents invoking each other endlessly, consuming resources until something crashes.
- **Authority laundering:** An agent delegates to another agent, which delegates back with *different* scope — potentially achieving a net escalation.
- **Accountability collapse:** No clear chain of custody when every agent points to another as its authority source.

Detection is straightforward in principle: maintain a chain ID that tracks the full delegation path, and reject any delegation request where the target agent already appears in the path. In practice, this requires that every delegation includes the full ancestry — not just the immediate parent — so the cycle can be detected regardless of chain length.

The analogy to directed acyclic graph (DAG) enforcement is exact. A delegation chain is a DAG. Cycles violate the DAG invariant and must be rejected at the point of delegation, before the cycle completes.

## Permission Ceilings: You Can't Give What You Don't Have

The permission ceiling principle states: **no agent can delegate more authority than it currently possesses.**

```
Agent A (permissions: read_db, write_db)
    │
    └── delegates {read_db, write_db, send_email} to Agent B
                                        ↑
                               ❌ DENIED: Agent A doesn't have send_email
```

This seems obvious, but it has subtle implications:

### Ceiling Enforcement Through Chains

Permission ceilings are transitive. If Agent A has `{read, write}` and delegates `{read}` to Agent B, then Agent B's ceiling is `{read}` — regardless of what Agent B might otherwise be authorized to do. If Agent B then delegates to Agent C, Agent C can receive at most `{read}`.

```
Agent A {read, write} → Agent B {read} → Agent C {read}  (ceiling maintained)
                                    └──→ Agent C {write}  ❌ DENIED
```

The ceiling shrinks at every level but never expands. This is the delegation equivalent of the [principle of least privilege](/concepts/least-privilege): authority flows downward and narrows, never upward and broadens.

### Interaction with Trust Tiers

An interesting edge case: what if Agent B has a higher trust tier than Agent A? Does Agent B get more authority because it's more trusted?

The answer is no. The trust tier determines what an agent can do *on its own initiative*. Within a delegation chain, the authority comes from the *delegator*, not the *delegate's* inherent capabilities. A Privileged agent receiving a delegation from a Verified agent operates within the Verified agent's ceiling for that chain, even though it could do more on its own.

This prevents a subtle attack where a low-trust agent delegates to a high-trust agent specifically to launder its permissions through a more trusted intermediary.

## Signed Receipts for Auditability

Every delegation in a chain should produce a signed receipt — a tamper-evident record of who delegated what to whom, with what scope, at what time, and under what conditions.

A delegation receipt conceptually contains:

- **Chain ID:** Unique identifier for the entire delegation chain
- **Parent delegation ID:** The receipt of the upstream delegation (forming a linked list)
- **Delegator identity:** Which agent granted the authority
- **Delegate identity:** Which agent received it
- **Scope:** Exact permissions delegated
- **Constraints:** Time bounds, rate limits, conditional restrictions
- **Timestamp:** When the delegation was created
- **Expiry:** When the delegation expires
- **Signature:** Cryptographic signature from the delegator, verifiable by any party

These receipts serve multiple purposes:

**Audit trail.** After the fact, you can reconstruct exactly how authority flowed through the mesh. This is essential for compliance with frameworks like SOC 2, ISO 27001, and NIST 800-53, which require demonstrable access control and accountability.

**Dispute resolution.** When something goes wrong, receipts show the chain of authority. Was the delegation properly scoped? Did the delegate exceed the delegated scope? Was the delegation still valid (not expired or revoked) when the action occurred?

**Revocation propagation.** If a delegation is revoked, the receipt chain identifies all downstream delegations that must also be invalidated. Without receipts, revocation is a best-effort guess.

The closest analogy is X.509 certificate chains. Each certificate in the chain is signed by its issuer, and any verifier can walk the chain from leaf to root to establish trust. Delegation receipts work the same way — each receipt is signed by the delegator, and the chain can be verified from any point back to the origin.

## Expiry and Revocation: Time-Bounded Trust

Delegated authority should be *perishable*. A delegation granted for a specific task should expire when the task completes — or sooner. Indefinite delegations are permission debt: they accumulate, they're forgotten, and they create attack surface.

### Time-Based Expiry

Every delegation should carry an explicit expiration time. The appropriate duration depends on the task:

- **Synchronous subtask:** Seconds to minutes. The delegation expires as soon as the subtask returns.
- **Asynchronous workflow:** Minutes to hours. Long enough for the downstream agent to complete its work, with buffer for retries.
- **Standing delegation:** Hours to days. For ongoing relationships (e.g., a monitoring agent that continuously delegates to alerting agents). These should still expire and require renewal.

Never use indefinite expiry. Even standing delegations should have a maximum lifetime (say, 24 hours) after which they must be explicitly renewed. This creates a natural recertification cadence — if the delegating agent has been revoked, suspended, or had its trust score drop, the renewal will fail and the delegation dies.

### Active Revocation

Expiry handles the normal case. Revocation handles the exceptional case: something has gone wrong and the delegation must end *now*.

Revocation must be:

- **Immediate.** Once revoked, the delegation is invalid. Any in-flight actions using the delegation should be terminated.
- **Cascading.** Revoking a delegation at depth N must invalidate all downstream delegations at depths N+1, N+2, etc. If Agent A revokes its delegation to Agent B, all delegations that B subsequently granted in that chain are also invalid.
- **Auditable.** The revocation itself is recorded, including the reason and the timestamp. This creates a complete lifecycle record: creation → usage → revocation.

The Kerberos ticketing model provides useful precedent here. Kerberos tickets have explicit lifetimes and can be revoked through the KDC. The key insight Kerberos provides is that **short-lived credentials are inherently safer** than long-lived ones because the window of exploitation is smaller. The same applies to delegations.

## Comparison to Established Security Protocols

Delegation chains in agent governance don't exist in a vacuum. They draw from decades of distributed security research:

### OAuth 2.0 Scopes

OAuth's scope model — where applications request specific permissions (`read:email`, `write:repo`) and users approve them — directly parallels scoped delegation. The lessons from OAuth apply:

- Scopes should be granular, not coarse
- The default should be minimal scope, with explicit expansion
- Scope presentation should be legible to whoever is approving

The difference is that OAuth delegations are human-approved, while agent delegations are programmatic. This means agent delegation needs *stronger* automated safeguards because there's no human in the loop checking whether the requested scope makes sense.

### Kerberos Constrained Delegation

Kerberos supports "constrained delegation," where a service can impersonate a user but only when talking to specific other services. This is functionally identical to scoped delegation with target constraints: Agent B can use Agent A's authority, but only for specific downstream operations.

Kerberos also implements "protocol transition" and "S4U2Self/S4U2Proxy" — mechanisms for managing delegation chains with varying levels of constraint. The agent governance equivalent is chain depth limits with per-tier delegation policies.

### X.509 Certificate Chains

X.509 certificate chains are perhaps the closest structural analogy to delegation chains:

| X.509 | Agent Delegation |
|-------|------------------|
| Root CA | Original authority grant (human or system) |
| Intermediate CA | Mid-chain delegating agent |
| Leaf certificate | Terminal agent performing the action |
| Path length constraint | Chain depth limit |
| Certificate expiry | Delegation expiry |
| CRL/OCSP revocation | Delegation revocation |
| Key usage extensions | Scoped permissions |

The X.509 model has been battle-tested for decades. Its failure modes are well-studied: overly long chains, expired but unchecked certificates, revocation delays, name constraint violations. Every one of these failure modes has an analogue in agent delegation, and the mitigations are directly transferable.

### SPIFFE/SPIRE

The SPIFFE (Secure Production Identity Framework for Everyone) model assigns cryptographic identities to workloads, enabling mutual authentication without shared secrets. In agent meshes, SPIFFE-like identity models ensure that delegation chains are authenticated end-to-end — every agent in the chain can verify the identity of the agent delegating to it and the chain of authority behind that delegation.

## Putting It All Together: A Delegation Chain in Practice

Let's trace a complete delegation chain through a realistic scenario:

**Request:** A user asks the orchestrator to "generate a quarterly revenue report and email it to the finance team."

1. **Orchestrator** (Privileged, score 88) creates a delegation chain with ID `chain-7f3a`. It delegates `{read:sales_db, read:finance_db}` to `report-generator` with a 10-minute expiry. Chain depth limit: 3.

2. **Report Generator** (Trusted, score 67) receives the delegation. It needs to query two databases and format the results. It delegates `{read:sales_db}` to `data-fetcher-sales` and `{read:finance_db}` to `data-fetcher-finance`, each with 5-minute expiry. Current chain depth: 2.

3. **Data Fetcher (Sales)** (Verified, score 48) queries the sales database within its delegated scope. It returns results to Report Generator. It cannot delegate further (depth limit reached and its tier restricts delegation). Its delegation expires after the data is returned.

4. **Data Fetcher (Finance)** (Verified, score 51) does the same for the finance database. Same constraints apply.

5. **Report Generator** assembles the report. It now needs to email it. But its delegated scope is `{read:sales_db, read:finance_db}` — it has no `send_email` permission. It returns the report to Orchestrator.

6. **Orchestrator** delegates `{send_email:finance_team}` to `email-agent` with a 2-minute expiry. Note the specificity — not `send_email:*` but `send_email:finance_team`.

7. **Email Agent** (Trusted, score 71) sends the report and confirms delivery. The delegation expires.

8. All delegation receipts are written to the [audit log](/concepts/audit-logs). The chain is complete. Total time: 47 seconds. Total agents involved: 5. Maximum depth: 2. All delegations expired within their bounds.

Now imagine Data Fetcher (Sales) had tried to access the finance database. The delegation scope check would reject the request — its receipt only grants `{read:sales_db}`. Imagine Report Generator tried to delegate `{send_email}` — the ceiling check would reject it, because Report Generator was never delegated email permissions. The constraints work at every level.

## Key Takeaways

::: tip Key Takeaways
- **Scoped delegation** is non-negotiable. Blanket delegation is a privilege escalation vulnerability. Every delegation should carry the minimum authority needed.
- **Chain depth limits** prevent authority explosion. Most workflows need depth 2-3 at most. Deeper chains should trigger architectural review.
- **Circular delegation detection** prevents infinite loops and authority laundering. Enforce DAG structure at delegation time.
- **Permission ceilings are transitive.** Authority can only narrow through a chain, never expand. A Privileged delegate can't exceed the Verified delegator's ceiling.
- **Signed receipts** create an auditable chain of custody. Every delegation has a verifiable record from creation through expiry or revocation.
- **Time-bounded delegation** ensures authority is perishable. Short-lived credentials reduce the window of exploitation. Indefinite delegation is permission debt.
- **These principles map to proven protocols:** OAuth scopes, Kerberos constrained delegation, and X.509 certificate chains all validate this approach.
:::

## Related Concepts

- [Delegation Chains](/concepts/delegation-chains) — Overview of delegation mechanics
- [Trust Tiers Explained](/concepts/trust-tiers) — How trust tiers constrain delegation depth and scope
- [Behavioral Trust Scoring](/concepts/behavioral-trust-scoring) — How delegation success feeds into trust scores
- [Principle of Least Privilege](/concepts/least-privilege) — The foundational principle behind scoped delegation
- [Audit Logs for Compliance](/concepts/audit-logs) — How delegation receipts satisfy compliance requirements
