# Delegation Chains and Permission Ceilings

Understanding how AI agents delegate work to other agents—and the critical security principles that prevent privilege escalation.

## What Is Agent Delegation?

In modern AI systems, agents rarely work alone. A user's request might trigger a cascade of specialized agents, each handling a piece of the puzzle:

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Request                              │
│               "Book a flight and update my calendar"             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Orchestrator   │
                    │     Agent       │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                              ▼
    ┌─────────────────┐           ┌─────────────────┐
    │  Travel Booking │           │    Calendar     │
    │      Agent      │           │     Agent       │
    └────────┬────────┘           └────────┬────────┘
             │                              │
      ┌──────┴──────┐                       ▼
      ▼              ▼              ┌───────────────┐
┌──────────┐  ┌──────────┐         │ Notification  │
│ Airline  │  │  Hotel   │         │    Agent      │
│  Agent   │  │  Agent   │         └───────────────┘
└──────────┘  └──────────┘
```

This is **delegation**—one agent invoking another to perform work on its behalf. It's powerful. It's also dangerous.

## The Danger: Uncontrolled Delegation

Without proper controls, delegation creates exploitable pathways:

**Scenario:** A low-privilege chatbot delegates to a high-privilege data agent. If the data agent performs actions based on the chatbot's instructions without verifying the original permission context, you have a **privilege escalation vulnerability**.

This isn't theoretical. In agentic systems, poorly designed delegation is one of the most common attack vectors.

## The Permission Ceiling Principle

MeshGuard enforces a fundamental rule: **No agent can grant more permissions than it possesses.**

This is the **Permission Ceiling Principle**.

```
┌────────────────────────────────────────────────────────────────┐
│                    PERMISSION CEILING                           │
│                                                                 │
│   Original User Permission: [read, write:own, calendar:view]   │
│   ══════════════════════════════════════════════════════════   │
│                              │                                  │
│                              ▼                                  │
│           ┌─────────────────────────────────────┐              │
│           │         Orchestrator Agent          │              │
│           │  Effective: [read, write:own,       │              │
│           │              calendar:view]         │              │
│           └──────────────────┬──────────────────┘              │
│                              │ DELEGATES                        │
│                              ▼                                  │
│           ┌─────────────────────────────────────┐              │
│           │         Calendar Agent              │              │
│           │  Intrinsic: [calendar:*]            │              │
│           │  Effective: [calendar:view] ◄──────── CEILING      │
│           └─────────────────────────────────────┘              │
│                                                                 │
│   The Calendar Agent CAN'T use calendar:write because the      │
│   delegating chain doesn't include that permission.            │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### Key Insight

The Calendar Agent might have `calendar:*` (full calendar access) in its intrinsic capabilities—but when operating on behalf of this delegation chain, it can only use `calendar:view` because that's what the ceiling allows.

This is **capability attenuation**: permissions can only decrease as they flow down a delegation chain, never increase.

## Anatomy of a Delegation Chain

A delegation chain tracks the complete lineage of an action:

```
┌─────────────────────────────────────────────────────────────────┐
│                      DELEGATION CHAIN                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐     │
│  │   Human     │ ───▶ │  Primary    │ ───▶ │  Secondary  │     │
│  │   User      │      │   Agent     │      │   Agent     │     │
│  │  (origin)   │      │  (depth 1)  │      │  (depth 2)  │     │
│  └─────────────┘      └─────────────┘      └─────────────┘     │
│                                                   │              │
│                                                   ▼              │
│                                            ┌─────────────┐      │
│                                            │  Tertiary   │      │
│                                            │   Agent     │      │
│                                            │  (depth 3)  │      │
│                                            └─────────────┘      │
│                                                                  │
│  Chain Metadata:                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  chain_id: "dlg_8f3a2b1c"                                       │
│  origin: "user:sarah@company.com"                               │
│  origin_permissions: ["read:*", "write:docs", "calendar:view"]  │
│  depth: 3                                                        │
│  max_depth: 5 (policy limit)                                    │
│  created_at: "2025-01-25T19:30:00Z"                             │
│  expires_at: "2025-01-25T20:30:00Z"                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

Every link in the chain carries:

1. **Origin identity**: Who (human or system) initiated the chain
2. **Permission snapshot**: The effective permissions at chain creation
3. **Depth counter**: How many delegation hops have occurred
4. **Timestamps**: When created, when it expires
5. **Chain ID**: Unique identifier for audit correlation

## Computing Effective Permissions

When an agent in a delegation chain requests an action, MeshGuard computes the **effective permissions** by intersecting:

```
Effective Permissions = Origin Permissions ∩ Delegator Permissions ∩ Agent Intrinsic Permissions
```

### Example Calculation

```yaml
# User's original permissions
user_permissions:
  - "read:*"
  - "write:documents"
  - "calendar:view"
  - "email:send"

# Primary agent's intrinsic permissions
primary_agent_permissions:
  - "read:*"
  - "write:*"
  - "calendar:*"

# Secondary agent's intrinsic permissions
secondary_agent_permissions:
  - "calendar:*"
  - "email:*"
  - "contacts:*"

# EFFECTIVE PERMISSIONS for secondary agent:
# = user ∩ primary ∩ secondary
# = ["calendar:view"]  # Only permission that survives all three!
```

In Python:

```python
from meshguard import MeshGuardClient, DelegationChain

# Primary agent receives user request
primary = MeshGuardClient(agent_token="primary-agent-token")

# Create delegation chain from user context
chain = primary.create_delegation_chain(
    user_context=user_token,
    purpose="Calendar update workflow",
    ttl_seconds=3600,  # 1 hour expiry
)

# Delegate to secondary agent
secondary_token = chain.delegate_to(
    agent_id="calendar-agent",
    scope=["calendar:*"],  # Requested scope (will be attenuated)
)

# Secondary agent operates with attenuated permissions
secondary = MeshGuardClient(agent_token=secondary_token)

# This works (calendar:view is in effective permissions)
decision = secondary.check("calendar:view", resource="user-calendar")
# → ALLOWED

# This fails (calendar:write exceeds the ceiling)
decision = secondary.check("calendar:write", resource="user-calendar")
# → DENIED (ceiling violation: origin lacks calendar:write)
```

## Delegation Depth Limits

Unbounded delegation chains create audit nightmares and security risks. MeshGuard enforces configurable depth limits:

```
┌─────────────────────────────────────────────────────────────────┐
│                    DELEGATION DEPTH LIMITS                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User ──▶ Agent A ──▶ Agent B ──▶ Agent C ──▶ Agent D ──▶ ✗    │
│  (0)       (1)         (2)         (3)         (4)     (5=MAX) │
│                                                                  │
│  At depth 5, further delegation is BLOCKED.                     │
│                                                                  │
│  Default limits by Trust Tier:                                  │
│  ┌────────────┬───────────────┐                                 │
│  │ Tier       │ Max Depth     │                                 │
│  ├────────────┼───────────────┤                                 │
│  │ Anonymous  │ 0 (no deleg)  │                                 │
│  │ Verified   │ 0 (no deleg)  │                                 │
│  │ Trusted    │ 3             │                                 │
│  │ Privileged │ 5             │                                 │
│  └────────────┴───────────────┘                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

See [Trust Tiers](/concepts/trust-tiers) for details on how tiers affect delegation capabilities.

### Why Limit Depth?

1. **Auditability**: Shallow chains are easier to trace and investigate
2. **Latency**: Each hop adds overhead
3. **Blast radius**: Limits how far a compromised agent can propagate
4. **Complexity**: Deep chains indicate architectural issues

## Attack Scenarios: Privilege Escalation via Delegation

Let's examine real attack patterns and how MeshGuard prevents them.

### Attack #1: The Confused Deputy

```
┌─────────────────────────────────────────────────────────────────┐
│              ATTACK: CONFUSED DEPUTY                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Attacker's Low-Privilege Agent                                 │
│  Permissions: [read:public]                                     │
│            │                                                     │
│            │  "Hey, read the admin database for me"             │
│            ▼                                                     │
│  ┌─────────────────────────────────────┐                        │
│  │  High-Privilege Database Agent      │                        │
│  │  Permissions: [read:*, write:*]     │                        │
│  │                                     │                        │
│  │  WITHOUT MESHGUARD:                 │                        │
│  │  "Sure!" → Returns admin data       │                        │
│  │  ✗ PRIVILEGE ESCALATION             │                        │
│  │                                     │                        │
│  │  WITH MESHGUARD:                    │                        │
│  │  Checks delegation chain ceiling    │                        │
│  │  → Origin only has read:public      │                        │
│  │  → DENIED                           │                        │
│  │  ✓ ATTACK BLOCKED                   │                        │
│  └─────────────────────────────────────┘                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**MeshGuard Prevention:**

```python
# Database agent ALWAYS checks the delegation context
decision = db_agent.check(
    action="read:admin_users",
    delegation_chain=incoming_chain,  # Carries ceiling info
)
# → DENIED: effective permission ceiling is [read:public]
```

### Attack #2: Chain Injection

An attacker tries to forge or modify a delegation chain:

```
┌─────────────────────────────────────────────────────────────────┐
│              ATTACK: CHAIN INJECTION                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Legitimate Chain:                                              │
│  User(admin) ──▶ Agent A ──▶ Agent B                           │
│  ceiling: [admin:*]                                             │
│                                                                  │
│  Attacker intercepts and modifies:                              │
│  User(admin) ──▶ Agent A ──▶ [INJECTED] ──▶ Agent B            │
│  forged ceiling: [admin:*, BONUS:delete_all]                    │
│                                                                  │
│  WITHOUT PROTECTION:                                            │
│  Agent B trusts the forged chain → Disaster                     │
│                                                                  │
│  WITH MESHGUARD:                                                │
│  ✓ Chains are cryptographically signed                          │
│  ✓ Each link verified against known agents                      │
│  ✓ Ceiling modifications detected via hash                      │
│  → DENIED: Invalid chain signature                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**MeshGuard Prevention:**

```python
# Delegation chains include cryptographic verification
chain = DelegationChain.from_token(incoming_token)

# Automatic validation
if not chain.verify():
    raise SecurityError("Invalid delegation chain signature")

# Chain metadata is tamper-evident
print(chain.signature)  # Ed25519 signature over chain contents
print(chain.hash)       # SHA-256 of permission ceiling
```

### Attack #3: Permission Laundering

An attacker uses intermediate agents to obscure the true origin:

```
┌─────────────────────────────────────────────────────────────────┐
│              ATTACK: PERMISSION LAUNDERING                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Malicious flow:                                                │
│                                                                  │
│  Evil Agent ──▶ Proxy 1 ──▶ Proxy 2 ──▶ Proxy 3 ──▶ Target     │
│                                                                  │
│  Goal: Obscure that Evil Agent is the real origin               │
│        Hope that Proxy 3 → Target looks "clean"                 │
│                                                                  │
│  WITHOUT PROTECTION:                                            │
│  Target only sees "Proxy 3" as caller                           │
│  Origin is hidden → Audit trail broken                          │
│                                                                  │
│  WITH MESHGUARD:                                                │
│  ✓ FULL chain preserved: Evil → P1 → P2 → P3 → Target          │
│  ✓ Original origin identity ALWAYS visible                      │
│  ✓ Each hop logged with timestamps                              │
│  ✓ Depth limit prevents infinite proxying                       │
│  → Audit: "Evil Agent initiated via 3 proxies"                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**MeshGuard Prevention:**

```python
# Target agent can always inspect full lineage
def handle_request(chain: DelegationChain, action: str):
    # See the ENTIRE delegation history
    print(f"Origin: {chain.origin}")           # "evil-agent"
    print(f"Depth: {chain.depth}")             # 3
    print(f"Path: {chain.path}")               # [evil, p1, p2, p3]
    
    # Policy can block based on origin, not just immediate caller
    if chain.origin in BLOCKED_AGENTS:
        raise SecurityError("Blocked origin agent")
    
    # Can also block suspicious patterns
    if chain.depth > 2 and chain.origin_tier == "anonymous":
        raise SecurityError("Deep chain from anonymous origin")
```

### Attack #4: Time-of-Check to Time-of-Use (TOCTOU)

```
┌─────────────────────────────────────────────────────────────────┐
│              ATTACK: TOCTOU RACE CONDITION                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Timeline:                                                      │
│  ─────────────────────────────────────────────────────────────  │
│  T0: User has [read:sensitive]                                  │
│  T1: User creates delegation chain                              │
│  T2: Admin REVOKES user's read:sensitive                        │
│  T3: Delegated agent tries to use read:sensitive                │
│                                                                  │
│  Question: Should T3 succeed?                                   │
│                                                                  │
│  WITHOUT PROTECTION:                                            │
│  Chain was valid at T1 → might still work at T3                 │
│  ✗ Stale permissions honored                                    │
│                                                                  │
│  WITH MESHGUARD:                                                │
│  ✓ Chain has max TTL (default 1 hour)                           │
│  ✓ Permission check queries CURRENT user permissions            │
│  ✓ Revocation propagates to active chains                       │
│  → T3: DENIED (permission revoked at T2)                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**MeshGuard Prevention:**

```python
# Chains have mandatory expiration
chain = primary.create_delegation_chain(
    user_context=user_token,
    ttl_seconds=3600,  # Max 1 hour by default
)

# Permission checks validate CURRENT state, not cached
decision = agent.check(
    action="read:sensitive",
    chain=chain,
    cache=False,  # Force fresh permission lookup
)

# Explicit revocation for immediate effect
admin.revoke_delegation_chain(chain_id="dlg_8f3a2b1c")
# All agents using this chain immediately lose access
```

## Implementing Delegation Policies

### Basic Delegation Policy

```yaml
name: standard-delegation-policy
version: 1

# Who can delegate
delegation_rules:
  # Anonymous and Verified cannot delegate
  - tier: anonymous
    can_delegate: false
    
  - tier: verified
    can_delegate: false
    
  # Trusted can delegate with limits
  - tier: trusted
    can_delegate: true
    max_depth: 3
    allowed_target_tiers: ["anonymous", "verified", "trusted"]
    require_purpose: true
    max_ttl_seconds: 3600
    
  # Privileged has more freedom
  - tier: privileged
    can_delegate: true
    max_depth: 5
    allowed_target_tiers: ["anonymous", "verified", "trusted", "privileged"]
    require_purpose: false
    max_ttl_seconds: 86400

# Global constraints
global:
  # Permissions that can NEVER be delegated
  non_delegatable_permissions:
    - "admin:*"
    - "security:*"
    - "billing:delete"
    
  # Always require these in delegation context
  required_context:
    - purpose
    - origin_ip
```

### Per-Permission Delegation Rules

Some permissions should have stricter delegation rules:

```yaml
name: sensitive-permission-delegation
version: 1

rules:
  # PII access has strict delegation limits
  - permission: "read:pii"
    delegation:
      max_depth: 1  # Only direct delegation allowed
      require_audit: true
      require_justification: true
      
  # Financial operations
  - permission: "write:transactions"
    delegation:
      max_depth: 2
      require_mfa_origin: true  # Origin user must have MFA
      max_ttl_seconds: 300      # 5 minute max
      
  # Admin operations cannot be delegated at all
  - permission: "admin:*"
    delegation:
      enabled: false
      reason: "Administrative permissions are non-delegatable"
```

### Context-Aware Delegation

Delegation rules can depend on context:

```yaml
name: context-aware-delegation
version: 1

rules:
  # During business hours, normal rules
  - permission: "write:*"
    conditions:
      - "time.hour >= 9 AND time.hour < 17"
      - "time.weekday IN [1,2,3,4,5]"
    delegation:
      max_depth: 3
      max_ttl_seconds: 3600
      
  # Outside business hours, stricter
  - permission: "write:*"
    conditions:
      - "time.hour < 9 OR time.hour >= 17"
    delegation:
      max_depth: 1
      max_ttl_seconds: 900
      require_justification: true
      
  # From untrusted networks, no delegation
  - permission: "*"
    conditions:
      - "network.trusted == false"
    delegation:
      enabled: false
      reason: "Delegation disabled from untrusted networks"
```

## Monitoring Delegation Chains

### Audit Log Integration

Every delegation event is logged:

```python
# Query delegation events
audit_entries = client.get_audit_log(
    event_types=["delegation.created", "delegation.used", "delegation.denied"],
    time_range="last_24h",
)

for entry in audit_entries:
    print(f"""
    Event: {entry.type}
    Chain ID: {entry.chain_id}
    Origin: {entry.origin}
    Delegator: {entry.delegator}
    Delegatee: {entry.delegatee}
    Ceiling: {entry.permission_ceiling}
    Depth: {entry.depth}
    Outcome: {entry.outcome}
    """)
```

### Real-Time Alerts

Configure alerts for suspicious delegation patterns:

```yaml
alerts:
  # Alert on deep chains
  - name: deep-delegation-chain
    condition: "delegation.depth >= 4"
    severity: warning
    message: "Unusually deep delegation chain detected"
    
  # Alert on ceiling violations
  - name: ceiling-violation-spike
    condition: "count(delegation.ceiling_violation) > 10 in 5m"
    severity: critical
    message: "Possible privilege escalation attempt"
    
  # Alert on anonymous origin delegation
  - name: anonymous-delegation
    condition: "delegation.origin_tier == 'anonymous'"
    severity: warning
    message: "Delegation chain from anonymous origin"
```

### Delegation Chain Visualization

MeshGuard provides tooling to visualize chains:

```python
from meshguard.viz import render_delegation_chain

# Get a specific chain
chain = client.get_delegation_chain("dlg_8f3a2b1c")

# Render as ASCII (for logs/terminals)
print(render_delegation_chain(chain, format="ascii"))

# Output:
# ┌──────────────────────────────────────────────────────────────┐
# │ Chain: dlg_8f3a2b1c                                          │
# │ Created: 2025-01-25T19:30:00Z (45 min ago)                   │
# │ Expires: 2025-01-25T20:30:00Z (15 min remaining)            │
# ├──────────────────────────────────────────────────────────────┤
# │                                                              │
# │  user:sarah@company.com                                      │
# │  ├── Permissions: [read:*, write:docs, calendar:view]       │
# │  │                                                           │
# │  └─▶ agent:orchestrator-v2 (trusted)                        │
# │      ├── Ceiling: [read:*, write:docs, calendar:view]       │
# │      │                                                       │
# │      └─▶ agent:calendar-bot (verified)                      │
# │          ├── Ceiling: [calendar:view]                       │
# │          └── 3 actions performed                            │
# │                                                              │
# └──────────────────────────────────────────────────────────────┘
```

## Best Practices for Delegation

### 1. Minimize Delegation Scope

Request only the permissions you need:

```python
# ❌ Bad: Requesting full access
chain.delegate_to(
    agent_id="helper",
    scope=["*"],  # Too broad!
)

# ✅ Good: Minimal necessary scope
chain.delegate_to(
    agent_id="helper",
    scope=["calendar:view"],  # Only what's needed
)
```

### 2. Set Short TTLs

Shorter chains are safer chains:

```python
# ❌ Bad: Long-lived delegation
chain = primary.create_delegation_chain(
    user_context=user_token,
    ttl_seconds=86400,  # 24 hours is too long
)

# ✅ Good: Short-lived, task-specific
chain = primary.create_delegation_chain(
    user_context=user_token,
    ttl_seconds=300,  # 5 minutes for this specific task
    purpose="Update calendar event #1234",
)
```

### 3. Always Include Purpose

Document why delegation is happening:

```python
chain.delegate_to(
    agent_id="calendar-agent",
    scope=["calendar:view"],
    purpose="Checking availability for meeting request MR-5678",
    # Audit trail now shows exactly WHY this delegation occurred
)
```

### 4. Validate Incoming Chains

When receiving delegated work, validate the chain:

```python
def handle_delegated_request(token: str, action: str):
    # Parse and validate
    chain = DelegationChain.from_token(token)
    
    if not chain.verify():
        raise SecurityError("Invalid chain signature")
    
    if chain.is_expired():
        raise SecurityError("Delegation chain expired")
    
    if chain.depth > MAX_ACCEPTABLE_DEPTH:
        raise SecurityError("Chain too deep")
    
    # Check action against ceiling
    decision = client.check(action, chain=chain)
    if decision.denied:
        raise PermissionError(decision.reason)
    
    # Proceed with work
    perform_action(action)
```

### 5. Use Delegation for What It's For

Delegation is for **task-specific, time-limited work**. It's not for:

- Permanent permission grants (use role assignment)
- System-to-system authentication (use service accounts)
- Bypassing approval workflows (that's the attack you're preventing)

## Summary: The Delegation Security Model

```
┌─────────────────────────────────────────────────────────────────┐
│              MESHGUARD DELEGATION SECURITY MODEL                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PRINCIPLE 1: Permission Ceiling                                │
│  ──────────────────────────────────                             │
│  Delegated permissions ≤ Delegator permissions                  │
│  Permissions can only attenuate, never amplify                  │
│                                                                  │
│  PRINCIPLE 2: Chain Integrity                                   │
│  ──────────────────────────────                                 │
│  Every chain is cryptographically signed                        │
│  Full lineage preserved from origin to current                  │
│  Tampering is detectable and rejected                           │
│                                                                  │
│  PRINCIPLE 3: Bounded Depth                                     │
│  ─────────────────────────                                      │
│  Delegation chains have maximum depth limits                    │
│  Deeper = more scrutiny, not more access                        │
│                                                                  │
│  PRINCIPLE 4: Temporal Limits                                   │
│  ──────────────────────────                                     │
│  All delegations have mandatory expiration                      │
│  Revocation propagates immediately                              │
│                                                                  │
│  PRINCIPLE 5: Full Auditability                                 │
│  ───────────────────────────                                    │
│  Every delegation event is logged                               │
│  Origin always visible, regardless of depth                     │
│  Real-time alerting on suspicious patterns                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

Delegation chains are the backbone of multi-agent collaboration. With MeshGuard's Permission Ceiling principle and comprehensive chain management, you get the flexibility of agent cooperation without the security nightmares of privilege escalation.

---

::: tip Secure Your Agent Delegation Today
MeshGuard provides enterprise-grade delegation controls out of the box. Stop worrying about confused deputies and permission laundering.

[Get started with MeshGuard →](https://meshguard.app)
:::
