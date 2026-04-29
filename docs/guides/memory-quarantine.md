---
title: Memory Quarantine — Trust Lanes for Agent Memory
description: How MeshGuard's memory quarantine system classifies, gates, and promotes agent memory to prevent poisoned or low-trust data from driving high-impact actions.
outline: deep
---

# Memory Quarantine — Trust Lanes for Agent Memory

How MeshGuard's memory quarantine system classifies, gates, and promotes agent memory to prevent poisoned or low-trust data from driving high-impact actions.

## The Problem with Agent Memory

AI agents remember things. They store conversation history, learned procedures, RAG documents, tool outputs, and user preferences. This memory directly influences future actions — an agent that "remembers" a user wants daily email summaries will keep sending them. An agent that learned a refund procedure from a tool output will follow it the next time a customer asks.

This creates a dangerous trust gap. Not all memory is equally trustworthy:

- A procedure approved by a human operator is not the same as a procedure an agent learned from scraping a blog post.
- A fact retrieved from your internal knowledge base is not the same as a claim extracted from a third-party API response.
- A constraint configured by an admin is not the same as a preference inferred from a single user conversation.

Without trust classification, all memory looks the same to the agent. A poisoned memory chunk — injected via a compromised data source, a prompt injection attack, or simple hallucination — can drive the agent to take actions you never intended.

Memory quarantine solves this by assigning every piece of agent memory a **trust lane** and gating access to that memory based on the sensitivity of the action it will influence.

## Trust Lanes

MeshGuard classifies memory into four trust lanes, from least to most trusted:

| Lane | Name | Description | Example Sources |
|------|------|-------------|-----------------|
| **0** | Untrusted | External or unverified sources | Web scrapes, third-party API responses, user input, RAG documents, tool outputs |
| **1** | Observed | Agent-generated, not yet verified | LLM-generated summaries, agent-learned procedures |
| **2** | Verified | Passed adversarial validation checks | Memory that survived injection scans and contradiction checks |
| **3** | Approved Procedural | Explicitly human-approved | Admin-approved procedures, system configuration, human-verified facts |

Trust lanes are assigned at intake based on the source type:

- **Lane 3** is reserved for `human_approved` and `system_config` sources.
- **Lane 1** is assigned to `agent_generation` and `learned_procedure` sources.
- **Lane 0** is assigned to everything else: `external_api`, `web_scrape`, `user_input`, `tool_output`, `rag_document`.

Memory can be **promoted** up lanes through a structured pipeline, and **demoted** or **quarantined** when trust is lost.

## The Three Guards

Memory quarantine operates through three enforcement points that form a complete trust perimeter around agent memory.

### 1. Intake Firewall

Every memory write passes through the intake firewall before it enters the memory store. The firewall:

- **Classifies content** into types: `claim` (factual assertion), `procedure` (how-to instructions), `evidence` (raw reference data), `context` (background information), `preference` (user/system preference), or `constraint` (rule or limitation). Classification is automatic based on text analysis, but can be overridden.
- **Assigns a trust lane** based on the memory's source type.
- **Attaches provenance** — full lineage tracking including source type, source URL, which agent fetched it, the session context, and timestamps.
- **Deduplicates** by content hash (SHA-256). If the same content already exists, the existing chunk is returned.
- **Computes a content hash** for integrity verification.

Human-approved content (where `approvedBy` is set) automatically receives Lane 3. Admin trust lane overrides are supported but require admin authentication and are fully audit-logged.

### 2. Retrieval Guard

When an agent retrieves memory to influence an action, the retrieval guard filters chunks based on the action's sensitivity:

| Action Sensitivity | Required Minimum Lane | Example Actions |
|-------------------|-----------------------|-----------------|
| `low` | Lane 0 (any memory) | Read public data, log events |
| `medium` | Lane 1 (observed+) | Send notifications, update records |
| `high` | Lane 2 (verified+) | Process payments, modify permissions |
| `critical` | Lane 3 (approved only) | Delete data, change security settings |

The guard resolves the minimum trust lane by matching the intended action against configured trust requirements. If no explicit requirement exists, the default sensitivity-to-lane mapping applies.

Chunks that fall below the required lane are silently filtered from the retrieval results. The response includes a count of filtered chunks and warnings if all available memory is below the required threshold.

The retrieval guard also detects **conflicts** between retrieved chunks — for example, two chunks about the same topic (matching tags) with significantly different trust lanes (difference of 2 or more), which may indicate contradictory information from sources of different reliability.

### 3. Action Guard

The action guard is the final enforcement point. Before an action executes, it validates that every memory chunk that influenced the decision meets the action's trust requirements. This catches cases where memory that was acceptable at retrieval time has since been demoted or quarantined.

The action guard:

- Records which chunks influenced each action (full influence audit trail)
- Checks the lowest trust lane in the influencing set against the action's requirement
- Blocks execution if any influencing chunk is below the threshold
- Supports preflight checks for dry-run evaluation
- Allows admin overrides with approval workflow

## The Promotion Pipeline

Memory doesn't stay at its initial lane forever. The promotion pipeline provides a structured path for elevating trust through validation:

### Promotion Paths and Required Tests

| From | To | Required Tests |
|------|----|---------------|
| Lane 0 → Lane 1 | `injection_scan` |
| Lane 0 → Lane 2 | `injection_scan`, `contradiction_check` |
| Lane 0 → Lane 3 | `injection_scan`, `contradiction_check`, `human_review` |
| Lane 1 → Lane 2 | `injection_scan`, `contradiction_check` |
| Lane 1 → Lane 3 | `injection_scan`, `contradiction_check`, `human_review` |
| Lane 2 → Lane 3 | `human_review` |

### Promotion Tests

**Injection scan** — Runs the prompt injection detector against the memory content. If injection patterns are found above the confidence threshold, the test fails.

**Contradiction check** — Compares the memory chunk against known facts and existing verified memory. If the content contradicts established knowledge, the test fails.

**Replay test** — Replays the memory with synthetic data to verify it produces consistent, expected behavior.

**Human review** — Requires manual approval from a human reviewer. This is the only path to Lane 3 — no amount of automated testing can substitute for explicit human approval of procedural memory.

**Age threshold** — Time-based promotion: memory must be at least 168 hours (1 week) old.

**Usage threshold** — Usage-based promotion: memory must have been accessed at least 10 times without incident.

### Promotion Workflow

1. **Request promotion** — Specify the chunk ID and target lane. The system validates the chunk is active and the target lane is higher.
2. **Run automated tests** — The system runs all required automated tests (injection scan, contradiction check, etc.). Human review is skipped and must be completed separately.
3. **Complete human review** (if required) — A reviewer approves or rejects the promotion with notes.
4. **Finalize** — If all tests pass, the chunk's trust lane is updated. If any test fails, the request is auto-rejected.

## Quarantine and Demotion

When a memory chunk becomes suspect — due to a detected injection pattern, a contradiction with verified facts, or an admin decision — it can be quarantined or demoted.

### Quarantine Status

| Status | Meaning |
|--------|---------|
| `active` | Available for retrieval and use |
| `quarantined` | Blocked from all retrieval and use |
| `pending_review` | Awaiting human review |
| `expired` | Past its TTL, no longer active |

### Quarantine Actions

- **Quarantine** a single chunk or batch of chunks
- **Quarantine by lineage** — quarantine all chunks from a specific source (source type, source agent, date range)
- **Unquarantine** — restore a chunk after review
- **Revoke** — permanent removal
- **Lane override** — manually change a chunk's trust lane (admin only, audit-logged)
- **Bulk update** — change lanes for multiple chunks at once

### Content TTLs

Memory chunks have default time-to-live values by content type:

| Content Type | Default TTL |
|-------------|-------------|
| `claim` | 1 week |
| `procedure` | 1 day |
| `evidence` | 30 days |
| `context` | 1 week |
| `preference` | 90 days |
| `constraint` | 1 year |

Procedures have a deliberately short TTL because stale procedures are one of the highest-risk memory types — an agent following an outdated procedure can cause significant harm.

## Configuration

The memory quarantine system is configured per organization:

```yaml
# Default TTLs by content type (hours)
defaultTtlHours:
  claim: 168
  procedure: 24
  evidence: 720
  context: 168
  preference: 2160
  constraint: 8760

# Auto-promotion thresholds
autoPromoteAfterUsageCount: 10
autoPromoteAfterHours: 168

# Quarantine behavior
quarantineOnInjectionDetection: true
quarantineOnContradiction: true

# Audit retention
influenceAuditRetentionDays: 90
```

### Action Trust Requirements

Configure minimum trust lanes for specific action patterns:

```yaml
# High-impact actions require verified memory
- actionPattern: "delete:*"
  sensitivity: critical
  minTrustLane: 3
  allowOverride: false

- actionPattern: "write:payment*"
  sensitivity: high
  minTrustLane: 2
  allowOverride: true
  overrideRequiresApproval: true

- actionPattern: "read:*"
  sensitivity: low
  minTrustLane: 0
```

## When to Use Memory Quarantine

Memory quarantine is most valuable when your agents:

- **Ingest external data** — RAG pipelines, web scraping, API calls, or user-provided documents that could contain poisoned content.
- **Learn procedures** — Agents that learn how to do things from observation or instruction, where a bad procedure could cause repeated harm.
- **Make high-impact decisions** — Agents that process payments, modify access controls, or take actions that are difficult to reverse.
- **Operate in multi-agent systems** — Where one agent's output becomes another agent's memory, and a single poisoned source can propagate through the chain.
- **Need compliance audit trails** — Regulated industries where you need to prove which data influenced each decision.

If your agents only consume static, pre-approved knowledge bases and don't learn or ingest external data, memory quarantine adds overhead without significant benefit.

## Monitoring

The memory quarantine system exposes statistics per organization:

- Chunk counts by lane, status, content type, and source type
- Trust gate evaluation counts (passes vs. blocks and block rate)
- Promotion request counts (approvals vs. rejections)
- Quarantine action counts and active quarantine count

Use these metrics to tune your trust requirements. A high gate block rate may indicate your trust requirements are too strict for your data sources, or that you need to invest in promotion pipelines to elevate trustworthy memory faster.

## Where This Connects

- [Preventing Prompt Injection](/guides/preventing-prompt-injection) — The injection scan used in promotion tests uses the same detection engine
- [Monitoring Agent Behavior](/guides/monitoring-agent-behavior) — Behavioral anomalies can trigger automated quarantine actions
- [Securing Agent Delegation](/guides/securing-agent-delegation) — Delegated agents inherit memory trust constraints from their delegator
- [Trust Tiers Explained](/concepts/trust-tiers) — Agent trust tiers are separate from memory trust lanes, but both feed into enforcement decisions

Memory quarantine is the difference between an agent that treats all data as gospel and one that knows the difference between a verified fact and an unverified claim. For agents that ingest external data or learn from their environment, it is a critical layer of defense.
