# Audit Logs: Building Compliance-Ready Systems

How MeshGuard captures, stores, and analyzes every decision to keep your AI agents accountable and your organization compliant.

## Why Audit Logs Matter for AI Agents

Traditional software is deterministic—given the same inputs, you get the same outputs. You can debug by stepping through code. AI agents are different:

- **Non-deterministic:** The same prompt might yield different actions
- **Context-dependent:** Decisions depend on conversation history, memory, external data
- **Autonomous:** Agents make choices without human intervention
- **Chained:** One agent delegates to another, creating complex execution graphs

When something goes wrong—a customer gets an incorrect refund, sensitive data is exposed, or an agent runs amok—you need to answer:

1. **What happened?** The exact sequence of events
2. **Why did it happen?** The reasoning and context behind each decision
3. **Who authorized it?** The delegation chain and policy evaluations
4. **When did it happen?** Precise timestamps for forensic analysis
5. **How do we prevent it?** Data to improve policies and training

Without comprehensive audit logs, you're flying blind. And when auditors come knocking—SOC 2, HIPAA, GDPR—"we don't know" isn't an acceptable answer.

## The Compliance Landscape

### SOC 2: Trust Services Criteria

SOC 2 audits evaluate your system against five Trust Services Criteria. Audit logs are central to several:

**CC6.1 - Logical Access Controls**
> The entity implements logical access security software, infrastructure, and architectures to protect information assets.

For AI agents, this means:
- Logging every permission check
- Recording who (which agent) accessed what
- Capturing policy decisions with reasoning

**CC7.2 - System Monitoring**
> The entity monitors system components for anomalies indicative of malicious acts, natural disasters, and errors.

AI agents require:
- Behavior baselines and anomaly detection
- Real-time alerting on suspicious patterns
- Historical analysis capabilities

**CC7.3 - Incident Response**
> The entity evaluates security events to determine whether they could constitute incidents.

MeshGuard logs enable:
- Root cause analysis
- Impact assessment
- Forensic reconstruction

### HIPAA: The Audit Trail Requirement

HIPAA's Security Rule (45 CFR § 164.312(b)) explicitly requires:

> Implement hardware, software, and/or procedural mechanisms that record and examine activity in information systems that contain or use electronic protected health information.

For healthcare organizations deploying AI agents, this means:

| Requirement | MeshGuard Implementation |
|-------------|-------------------------|
| Record access to ePHI | Log every action involving health data |
| Log user activity | Track agent identity and delegation chains |
| System activity logs | Capture policy evaluations, context, reasoning |
| Six-year retention | Configurable retention with compliance tiers |

```yaml
# HIPAA-compliant audit configuration
audit:
  enabled: true
  retention:
    default: 6y  # HIPAA minimum
    phi_access: 6y
  include:
    - action
    - agent_identity
    - delegation_chain
    - accessed_resources
    - policy_evaluation
    - timestamp_utc
```

### GDPR: The Right to Explanation

Under GDPR, data subjects have the right to understand automated decisions that affect them (Article 22). When an AI agent makes a decision about a person, you must be able to explain:

- **What data was used** in making the decision
- **What logic was applied** (the policy evaluation)
- **What the outcome was** and why

MeshGuard's audit logs capture:

```json
{
  "decision_id": "dec_8x7k2m9p",
  "subject_id": "user_123",
  "data_accessed": [
    "user.profile",
    "user.purchase_history",
    "user.support_tickets"
  ],
  "reasoning": {
    "policy": "customer-tier-classification",
    "inputs": {
      "total_purchases": 15000,
      "account_age_days": 730,
      "support_escalations": 0
    },
    "rule_matched": "premium_customer_threshold",
    "output": "tier:premium"
  },
  "timestamp": "2024-03-15T14:22:33.847Z"
}
```

This creates an auditable trail for any data subject access request (DSAR).

## What to Log: The Anatomy of an Audit Event

MeshGuard captures comprehensive audit events. Understanding the structure helps you query effectively and design policies.

### Core Event Structure

```json
{
  "event_id": "evt_9f8e7d6c5b4a",
  "timestamp": "2024-03-15T14:22:33.847Z",
  "event_type": "policy_decision",
  
  "agent": {
    "id": "agent_customer_service_01",
    "name": "Customer Service Bot",
    "trust_tier": "trusted",
    "tags": ["customer-service", "refunds"],
    "session_id": "sess_abc123"
  },
  
  "action": {
    "type": "write:refund",
    "resource": "order/ord_12345",
    "parameters": {
      "amount": 149.99,
      "reason": "product_defect",
      "customer_id": "cust_67890"
    }
  },
  
  "decision": {
    "effect": "allow",
    "policy_id": "pol_refund_policy_v3",
    "rule_matched": "trusted_agent_refund_limit",
    "evaluation_time_ms": 12,
    "conditions_evaluated": [
      {
        "expression": "agent.trust_tier IN ['trusted', 'privileged']",
        "result": true
      },
      {
        "expression": "request.amount <= 500",
        "result": true
      }
    ]
  },
  
  "context": {
    "conversation_id": "conv_xyz789",
    "user_message": "I received a damaged product, order #12345",
    "agent_reasoning": "Customer reported product defect with photo evidence. Order confirmed. Initiating refund within policy limits.",
    "external_data_accessed": [
      "orders_api:/orders/ord_12345",
      "customers_api:/customers/cust_67890"
    ]
  },
  
  "delegation": {
    "chain": [
      {
        "agent_id": "agent_orchestrator",
        "delegated_at": "2024-03-15T14:22:31.102Z",
        "permissions_granted": ["read:orders", "write:refund"]
      }
    ],
    "depth": 1,
    "root_agent": "agent_orchestrator"
  },
  
  "metadata": {
    "client_ip": "10.0.1.45",
    "sdk_version": "meshguard-python/1.4.2",
    "environment": "production"
  }
}
```

### Event Types

MeshGuard logs several distinct event types:

| Event Type | Description | Key Fields |
|------------|-------------|------------|
| `policy_decision` | Permission check result | action, decision, policy_id |
| `delegation_start` | Agent delegated to another | delegator, delegate, permissions |
| `delegation_end` | Delegation chain completed | chain, outcome, duration |
| `context_access` | Agent accessed external context | resource, data_classification |
| `anomaly_detected` | Behavior outside baseline | anomaly_type, severity, details |
| `policy_update` | Policy was modified | policy_id, changes, updated_by |
| `agent_lifecycle` | Agent created/modified/deleted | agent_id, change_type |

### What to Always Log

At minimum, every policy decision should capture:

```python
# Required audit fields
REQUIRED_AUDIT_FIELDS = [
    "event_id",           # Unique identifier
    "timestamp",          # ISO 8601 UTC
    "agent.id",           # Who performed the action
    "action.type",        # What was attempted
    "decision.effect",    # allow/deny
    "decision.policy_id", # Which policy decided
]
```

### What to Log for Compliance

Different compliance regimes require additional fields:

```yaml
# SOC 2 additions
soc2:
  - decision.rule_matched
  - metadata.client_ip
  - context.session_id

# HIPAA additions (when PHI involved)
hipaa:
  - context.data_classification
  - context.external_data_accessed
  - agent.authentication_method
  
# GDPR additions (when PII involved)  
gdpr:
  - context.data_subject_id
  - decision.conditions_evaluated
  - agent.reasoning  # For right to explanation
```

## MeshGuard's Audit Architecture

Understanding how MeshGuard captures, processes, and stores audit data helps you optimize for your use case.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Your Application                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │   Agent A   │  │   Agent B   │  │   Agent C   │                 │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                 │
│         │                │                │                         │
│         └────────────────┼────────────────┘                         │
│                          │                                          │
│                          ▼                                          │
│              ┌───────────────────────┐                              │
│              │   MeshGuard SDK       │                              │
│              │   (Policy Decisions)  │                              │
│              └───────────┬───────────┘                              │
└──────────────────────────┼──────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     MeshGuard Cloud                                  │
│                                                                      │
│  ┌──────────────────┐    ┌─────────────────┐    ┌────────────────┐  │
│  │  Audit Ingestion │───▶│  Event Stream   │───▶│  Hot Storage   │  │
│  │  (< 50ms p99)    │    │  (Kafka/Kinesis)│    │  (ClickHouse)  │  │
│  └──────────────────┘    └────────┬────────┘    └───────┬────────┘  │
│                                   │                     │           │
│                                   ▼                     │           │
│                          ┌────────────────┐             │           │
│                          │  Anomaly       │             │           │
│                          │  Detection     │◀────────────┘           │
│                          └───────┬────────┘                         │
│                                  │                                  │
│                                  ▼                                  │
│  ┌──────────────────┐    ┌────────────────┐    ┌────────────────┐  │
│  │  Cold Storage    │◀───│  Aggregation   │    │  Alert Engine  │  │
│  │  (S3/GCS)        │    │  & Rollup      │    │  (PagerDuty,   │  │
│  └──────────────────┘    └────────────────┘    │   Slack, etc.) │  │
│                                                └────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### Write Path (Ingestion)

When your agent makes a policy check, the audit event flows through:

1. **SDK Capture:** The SDK constructs the audit event with full context
2. **Async Buffering:** Events are buffered locally (configurable batch size)
3. **Batch Upload:** Batches are sent to the ingestion endpoint (< 50ms p99)
4. **Stream Processing:** Events flow through the event stream for real-time processing
5. **Storage:** Events land in hot storage (ClickHouse) for fast queries

```python
from meshguard import MeshGuardClient

client = MeshGuardClient(
    api_key="your-api-key",
    audit_config={
        "batch_size": 100,          # Events per batch
        "flush_interval_ms": 1000,  # Max time before flush
        "include_context": True,    # Include reasoning/context
        "include_chain": True,      # Include delegation chain
    }
)
```

### Read Path (Querying)

MeshGuard provides multiple query interfaces:

```python
# Python SDK - Structured queries
logs = client.audit.query(
    filters={
        "agent.id": "agent_customer_service_01",
        "decision.effect": "deny",
        "timestamp": {"gte": "2024-03-01", "lt": "2024-03-15"}
    },
    order_by="-timestamp",
    limit=100
)

# For complex analytics, use the SQL interface
results = client.audit.sql("""
    SELECT 
        agent.id,
        COUNT(*) as total_decisions,
        SUM(CASE WHEN decision.effect = 'deny' THEN 1 ELSE 0 END) as denials,
        AVG(decision.evaluation_time_ms) as avg_eval_time
    FROM audit_events
    WHERE timestamp >= now() - INTERVAL 7 DAY
    GROUP BY agent.id
    ORDER BY denials DESC
    LIMIT 10
""")
```

### Storage Tiers

Audit data moves through storage tiers based on age:

| Tier | Storage | Retention | Query Speed | Use Case |
|------|---------|-----------|-------------|----------|
| Hot | ClickHouse | 30 days | < 100ms | Real-time dashboards, recent queries |
| Warm | ClickHouse (compressed) | 90 days | < 500ms | Investigation, trend analysis |
| Cold | S3/GCS (Parquet) | Per policy | Seconds | Compliance, forensics, ML training |

## Querying and Analyzing Audit Logs

### Common Query Patterns

**Find all actions by a specific agent:**

```python
agent_history = client.audit.query(
    filters={"agent.id": "agent_refund_processor"},
    order_by="-timestamp",
    limit=1000
)

for event in agent_history:
    print(f"{event.timestamp}: {event.action.type} -> {event.decision.effect}")
```

**Investigate a specific decision:**

```python
# Get full context for a decision
event = client.audit.get("evt_9f8e7d6c5b4a")

print(f"Action: {event.action.type}")
print(f"Decision: {event.decision.effect}")
print(f"Policy: {event.decision.policy_id}")
print(f"Reasoning: {event.context.agent_reasoning}")
print(f"Delegation chain: {event.delegation.chain}")
```

**Find all denials in a time range:**

```python
denials = client.audit.query(
    filters={
        "decision.effect": "deny",
        "timestamp": {
            "gte": "2024-03-01T00:00:00Z",
            "lt": "2024-03-08T00:00:00Z"
        }
    },
    order_by="-timestamp"
)

# Group by reason
from collections import Counter
reasons = Counter(e.decision.reason for e in denials)
print("Top denial reasons:", reasons.most_common(10))
```

**Trace a delegation chain:**

```python
# Find all events in a delegation chain
chain_events = client.audit.query(
    filters={
        "delegation.root_agent": "agent_orchestrator",
        "delegation.chain_id": "chain_abc123"
    },
    order_by="timestamp"
)

print("Delegation chain timeline:")
for event in chain_events:
    depth = event.delegation.depth
    indent = "  " * depth
    print(f"{indent}{event.agent.name}: {event.action.type}")
```

### Analytics Queries

**Agent performance dashboard:**

```python
# Agent decision metrics for the past week
metrics = client.audit.sql("""
    SELECT 
        agent.name,
        agent.trust_tier,
        COUNT(*) as total_decisions,
        SUM(CASE WHEN decision.effect = 'allow' THEN 1 ELSE 0 END) as allowed,
        SUM(CASE WHEN decision.effect = 'deny' THEN 1 ELSE 0 END) as denied,
        ROUND(100.0 * SUM(CASE WHEN decision.effect = 'deny' THEN 1 ELSE 0 END) / COUNT(*), 2) as denial_rate,
        ROUND(AVG(decision.evaluation_time_ms), 2) as avg_latency_ms
    FROM audit_events
    WHERE timestamp >= now() - INTERVAL 7 DAY
    GROUP BY agent.name, agent.trust_tier
    ORDER BY total_decisions DESC
""")

for row in metrics:
    print(f"{row['agent.name']}: {row['total_decisions']} decisions, "
          f"{row['denial_rate']}% denial rate")
```

**Policy effectiveness analysis:**

```python
# Which policies are triggering the most denials?
policy_analysis = client.audit.sql("""
    SELECT 
        decision.policy_id,
        decision.rule_matched,
        COUNT(*) as trigger_count,
        COUNT(DISTINCT agent.id) as unique_agents
    FROM audit_events
    WHERE decision.effect = 'deny'
      AND timestamp >= now() - INTERVAL 30 DAY
    GROUP BY decision.policy_id, decision.rule_matched
    ORDER BY trigger_count DESC
    LIMIT 20
""")
```

**Data access patterns (for privacy compliance):**

```python
# What data is being accessed and by whom?
data_access = client.audit.sql("""
    SELECT 
        context.data_classification,
        arrayJoin(context.external_data_accessed) as resource,
        agent.trust_tier,
        COUNT(*) as access_count
    FROM audit_events
    WHERE context.data_classification IN ('pii', 'phi', 'confidential')
      AND timestamp >= now() - INTERVAL 7 DAY
    GROUP BY context.data_classification, resource, agent.trust_tier
    ORDER BY access_count DESC
""")
```

## Retention Policies by Plan Tier

MeshGuard offers flexible retention policies to balance cost, compliance, and query performance.

### Plan Comparison

| Feature | Starter | Professional | Enterprise |
|---------|:-------:|:------------:|:----------:|
| Hot retention | 7 days | 30 days | 90 days |
| Warm retention | 30 days | 90 days | 1 year |
| Cold retention | 90 days | 1 year | Custom (up to 10 years) |
| Custom retention policies | ❌ | ✅ | ✅ |
| Compliance presets | ❌ | ✅ | ✅ |
| Export to your storage | ❌ | ❌ | ✅ |
| Real-time streaming | ❌ | ❌ | ✅ |

### Configuring Retention

```yaml
# Organization-level retention settings
retention:
  default:
    hot: 30d
    warm: 90d
    cold: 1y
    
  # Override for specific event types
  overrides:
    - event_type: "policy_decision"
      data_classification: "phi"
      hot: 90d
      warm: 1y
      cold: 6y  # HIPAA requirement
      
    - event_type: "anomaly_detected"
      severity: "critical"
      hot: 90d
      warm: 2y
      cold: 7y
      
    - event_type: "agent_lifecycle"
      hot: 30d
      warm: 1y
      cold: 5y
```

### Compliance Presets

MeshGuard provides pre-configured retention policies for common compliance frameworks:

```python
# Apply HIPAA preset
client.org.apply_compliance_preset("hipaa")

# Apply SOC 2 + GDPR presets (merged)
client.org.apply_compliance_presets(["soc2", "gdpr"])
```

**HIPAA Preset:**
- All PHI access: 6-year cold retention
- Audit log modifications: 6-year cold retention
- Agent lifecycle events: 6-year cold retention

**SOC 2 Preset:**
- Policy decisions: 1-year cold retention
- Anomaly events: 2-year cold retention
- Access reviews: 1-year cold retention

**GDPR Preset:**
- PII access events: Include full reasoning for right to explanation
- Data subject requests: 3-year cold retention
- Consent events: 5-year cold retention

## Alerting on Anomalies

MeshGuard's anomaly detection engine monitors your audit stream in real-time, alerting on suspicious patterns before they become incidents.

### Built-in Anomaly Detectors

**Denial Spike Detector:**
Alerts when an agent's denial rate exceeds its historical baseline.

```yaml
anomaly_rules:
  - name: denial_spike
    type: statistical
    metric: denial_rate
    scope: per_agent
    baseline_window: 7d
    threshold: 3_sigma  # 3 standard deviations
    min_sample_size: 100
    alert:
      severity: warning
      channels: [slack, pagerduty]
```

**Unusual Access Pattern:**
Detects when an agent accesses resources outside its normal pattern.

```yaml
anomaly_rules:
  - name: unusual_resource_access
    type: behavioral
    model: resource_access_baseline
    scope: per_agent
    baseline_window: 14d
    threshold: 0.95  # 95% confidence interval
    alert:
      severity: critical
      channels: [pagerduty, email]
      include_context: true
```

**Privilege Escalation:**
Alerts when an agent attempts actions above its trust tier.

```yaml
anomaly_rules:
  - name: privilege_escalation_attempt
    type: rule_based
    condition: |
      decision.effect == 'deny' AND
      decision.reason CONTAINS 'insufficient_trust_tier' AND
      count_last_hour(agent.id, same_condition) >= 5
    alert:
      severity: critical
      channels: [pagerduty, slack]
      auto_demote: true  # Automatically demote to anonymous
```

**Delegation Chain Depth:**
Monitors for unusually deep delegation chains.

```yaml
anomaly_rules:
  - name: deep_delegation_chain
    type: rule_based
    condition: |
      delegation.depth > 5
    alert:
      severity: warning
      channels: [slack]
```

### Alert Configuration

```python
from meshguard import AlertConfig, SlackChannel, PagerDutyChannel

# Configure alert channels
client.alerts.configure_channels([
    SlackChannel(
        name="security-alerts",
        webhook_url="https://hooks.slack.com/...",
        severity_filter=["warning", "critical"]
    ),
    PagerDutyChannel(
        name="on-call",
        routing_key="your-routing-key",
        severity_filter=["critical"]
    )
])

# Configure alert rules
client.alerts.create_rule(
    name="high-value-action-monitoring",
    condition="""
        action.type LIKE 'write:refund' AND
        action.parameters.amount > 1000 AND
        decision.effect = 'allow'
    """,
    alert=AlertConfig(
        severity="info",
        channels=["security-alerts"],
        include_fields=["agent.name", "action.parameters", "context.agent_reasoning"]
    )
)
```

### Alert Response Automation

MeshGuard can automatically respond to certain alerts:

```yaml
alert_responses:
  - trigger: privilege_escalation_attempt
    action: demote_agent
    parameters:
      target_tier: anonymous
      duration: 1h
      notify: [security-team]
      
  - trigger: denial_spike
    condition: "severity == 'critical'"
    action: reduce_rate_limit
    parameters:
      reduction_factor: 0.5
      duration: 30m
      
  - trigger: unusual_resource_access
    action: require_human_approval
    parameters:
      duration: until_reviewed
      approval_channel: security-reviews
```

## Building Compliance Reports from Audit Data

MeshGuard provides built-in reports for common compliance needs, plus the flexibility to build custom reports.

### Standard Compliance Reports

**SOC 2 Access Review Report:**

```python
# Generate quarterly access review
report = client.reports.generate(
    report_type="soc2_access_review",
    period={"start": "2024-01-01", "end": "2024-03-31"},
    format="pdf"
)

# Report includes:
# - All agents and their trust tiers
# - Permission changes during period
# - Access patterns by data classification
# - Anomalies detected and resolutions
# - Policy changes with approvals
```

**HIPAA Audit Trail Report:**

```python
# Generate for specific PHI access
report = client.reports.generate(
    report_type="hipaa_phi_access",
    period={"start": "2024-03-01", "end": "2024-03-31"},
    filters={"context.data_classification": "phi"},
    format="csv"
)
```

**GDPR Data Subject Report:**

```python
# Generate report for a data subject access request
report = client.reports.generate(
    report_type="gdpr_dsar",
    data_subject_id="user_12345",
    period={"start": "2023-01-01", "end": "2024-03-31"},
    include_reasoning=True,  # For right to explanation
    format="json"
)
```

### Custom Report Builder

```python
# Build a custom executive summary report
from meshguard.reports import ReportBuilder

report = (ReportBuilder()
    .title("AI Agent Governance - Q1 2024")
    .period("2024-01-01", "2024-03-31")
    
    # Agent overview section
    .section("Agent Overview")
    .metric("Total Agents", "COUNT(DISTINCT agent.id)")
    .metric("Total Decisions", "COUNT(*)")
    .metric("Overall Denial Rate", "100.0 * SUM(decision.effect = 'deny') / COUNT(*)")
    .chart("decisions_by_tier", type="pie", group_by="agent.trust_tier")
    
    # Security section
    .section("Security Events")
    .metric("Anomalies Detected", "COUNT(*)", filter="event_type = 'anomaly_detected'")
    .metric("Critical Anomalies", "COUNT(*)", filter="event_type = 'anomaly_detected' AND severity = 'critical'")
    .table("top_anomalies", 
           query="SELECT anomaly_type, COUNT(*) as count FROM audit_events WHERE event_type = 'anomaly_detected' GROUP BY anomaly_type ORDER BY count DESC LIMIT 10")
    
    # Compliance section
    .section("Compliance Metrics")
    .metric("PHI Access Events", "COUNT(*)", filter="context.data_classification = 'phi'")
    .metric("PII Access Events", "COUNT(*)", filter="context.data_classification = 'pii'")
    .chart("sensitive_data_access_trend", type="line", 
           x="DATE(timestamp)", y="COUNT(*)", 
           filter="context.data_classification IN ('phi', 'pii')")
    
    .build()
    .export(format="pdf", destination="s3://reports/q1-2024-governance.pdf")
)
```

### Scheduled Reports

```yaml
# Automated report schedule
reports:
  - name: weekly_security_summary
    type: security_summary
    schedule: "0 9 * * MON"  # Every Monday at 9 AM
    recipients: [security-team@company.com]
    format: pdf
    
  - name: monthly_compliance_report
    type: compliance_summary
    schedule: "0 9 1 * *"  # First of each month
    recipients: [compliance@company.com, ciso@company.com]
    format: pdf
    
  - name: quarterly_soc2_review
    type: soc2_access_review
    schedule: "0 9 1 1,4,7,10 *"  # Quarterly
    recipients: [auditors@company.com]
    format: pdf
    attachments:
      - raw_data: csv
```

## Integration with SIEM Systems

Enterprise security teams need audit data in their existing SIEM (Security Information and Event Management) systems. MeshGuard supports multiple integration patterns.

### Real-Time Streaming

**Splunk Integration:**

```python
from meshguard.integrations import SplunkHEC

# Configure Splunk HTTP Event Collector
splunk = SplunkHEC(
    url="https://splunk.company.com:8088",
    token="your-hec-token",
    index="meshguard_audit",
    source="meshguard",
    sourcetype="meshguard:audit"
)

# Enable real-time streaming
client.audit.stream_to(splunk)
```

**Datadog Integration:**

```python
from meshguard.integrations import DatadogLogs

datadog = DatadogLogs(
    api_key="your-datadog-api-key",
    site="datadoghq.com",  # or datadoghq.eu
    service="meshguard",
    env="production",
    tags=["team:security", "compliance:soc2"]
)

client.audit.stream_to(datadog)
```

**Generic Webhook:**

```python
from meshguard.integrations import WebhookSink

webhook = WebhookSink(
    url="https://your-siem.com/api/events",
    headers={"Authorization": "Bearer your-token"},
    batch_size=100,
    format="json"
)

client.audit.stream_to(webhook)
```

### Event Format for SIEM

MeshGuard events are formatted for easy SIEM ingestion:

```json
{
  "timestamp": "2024-03-15T14:22:33.847Z",
  "source": "meshguard",
  "event_type": "policy_decision",
  "severity": "info",
  
  "meshguard": {
    "event_id": "evt_9f8e7d6c5b4a",
    "agent_id": "agent_customer_service_01",
    "agent_name": "Customer Service Bot",
    "trust_tier": "trusted",
    "action": "write:refund",
    "resource": "order/ord_12345",
    "decision": "allow",
    "policy_id": "pol_refund_policy_v3",
    "delegation_depth": 1,
    "evaluation_time_ms": 12
  },
  
  "tags": ["ai-agent", "customer-service", "refund"]
}
```

### SIEM Query Examples

**Splunk - Find high-risk agent activity:**

```spl
index=meshguard_audit sourcetype="meshguard:audit"
| where 'meshguard.decision'="deny" OR 'meshguard.trust_tier'="privileged"
| stats count by meshguard.agent_name, meshguard.action, meshguard.decision
| sort -count
```

**Datadog - Alert on anomaly spike:**

```
logs("source:meshguard event_type:anomaly_detected") 
| count by severity
| alert when critical > 5 in 1h
```

**Elastic - Correlation with other security events:**

```json
{
  "query": {
    "bool": {
      "must": [
        {"match": {"source": "meshguard"}},
        {"match": {"meshguard.decision": "deny"}}
      ],
      "filter": {
        "range": {
          "timestamp": {"gte": "now-1h"}
        }
      }
    }
  },
  "aggs": {
    "by_agent": {
      "terms": {"field": "meshguard.agent_id.keyword"}
    }
  }
}
```

### Correlation with Application Logs

For full observability, correlate MeshGuard audit logs with your application logs using trace IDs:

```python
import opentelemetry.trace as trace

# Get current trace context
span = trace.get_current_span()
trace_id = span.get_span_context().trace_id

# Include in MeshGuard context
decision = client.check(
    action="write:refund",
    resource="order/ord_12345",
    context={
        "trace_id": format(trace_id, '032x'),
        "span_id": format(span.get_span_context().span_id, '016x')
    }
)
```

This enables queries like:
```spl
index=* trace_id="abc123..."
| sort timestamp
| table timestamp, source, message
```

## Best Practices

### 1. Log Context, Not Just Decisions

```python
# ❌ Minimal logging
decision = client.check("write:refund")

# ✅ Rich context logging
decision = client.check(
    action="write:refund",
    resource="order/ord_12345",
    context={
        "customer_request": "Refund for damaged item",
        "evidence_reviewed": ["photo_damage_01.jpg"],
        "agent_reasoning": "Product defect confirmed via photo. Order within return window.",
        "conversation_id": "conv_xyz789"
    }
)
```

### 2. Use Structured Action Names

```python
# ❌ Unstructured
client.check("refund")

# ✅ Structured hierarchy
client.check("write:refund:full")      # Full refund
client.check("write:refund:partial")   # Partial refund
client.check("read:customer:pii")      # PII access
client.check("delete:customer:account") # Account deletion
```

### 3. Include Data Classification

```python
# Tag data access with classification
decision = client.check(
    action="read:patient_record",
    resource="patient/pat_12345",
    context={
        "data_classification": "phi",  # HIPAA-relevant
        "purpose": "treatment_support"
    }
)
```

### 4. Implement Log Integrity

For compliance, ensure audit logs cannot be tampered with:

```yaml
# Enable log integrity features
audit:
  integrity:
    enabled: true
    hash_algorithm: sha256
    chain_verification: true  # Each event references previous hash
    signing:
      enabled: true
      key_id: your-signing-key
```

### 5. Plan for Scale

```yaml
# High-volume configuration
audit:
  sampling:
    enabled: true
    rules:
      # Log all denials and privileged actions at 100%
      - condition: "decision.effect = 'deny' OR agent.trust_tier = 'privileged'"
        rate: 1.0
      # Sample routine allows at 10%
      - condition: "decision.effect = 'allow' AND agent.trust_tier IN ['anonymous', 'verified']"
        rate: 0.1
      # Default to 50%
      - condition: "*"
        rate: 0.5
```

## Conclusion

Audit logs are the foundation of accountable AI systems. They enable:

- **Compliance:** Meet SOC 2, HIPAA, GDPR, and other regulatory requirements
- **Forensics:** Understand exactly what happened when things go wrong
- **Improvement:** Data to refine policies and train better agents
- **Trust:** Demonstrate governance to customers, partners, and regulators

MeshGuard's audit architecture captures every decision with full context—who, what, when, why, and how. Combined with flexible retention, real-time alerting, and SIEM integration, you have the observability needed to deploy AI agents with confidence.

The question isn't whether to implement comprehensive audit logging. It's whether you can afford not to.

---

::: tip Start Building Compliance-Ready Systems
[Get started with MeshGuard →](https://meshguard.app)
:::
