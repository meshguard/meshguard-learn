# A Practical Guide to Monitoring Agent Behavior

How to detect anomalies, build response ladders, and keep your agent mesh healthy—without drowning in alerts.

## Why Traditional Monitoring Fails for AI Agents

If you're coming from a traditional DevOps background, your instinct is to monitor agents the way you'd monitor microservices: CPU usage, memory, error rates, response times. That's necessary, but nowhere near sufficient.

Here's the problem: **a compromised or malfunctioning AI agent can look perfectly healthy by infrastructure metrics while doing something catastrophic.** CPU is normal. Memory is fine. Response times are great. But the agent is slowly exfiltrating customer data, or approving refunds it shouldn't, or hallucinating product information in customer conversations.

AI agents fail differently than traditional software:

- **They drift, not crash.** A misconfigured agent doesn't throw a 500 error—it starts making subtly wrong decisions.
- **They're non-deterministic.** The same input produces different outputs, so simple assertion-based monitoring doesn't work.
- **They compose behavior.** An agent might chain together five individually-allowed actions into a sequence that violates policy.
- **They learn context.** An agent's behavior changes based on conversation history, which means point-in-time checks miss the bigger picture.

You need behavioral monitoring—watching *what agents do* and *how that compares to what they normally do.*

## Setting Up Behavioral Baselines

Before you can detect anomalies, you need to know what "normal" looks like. A behavioral baseline is a statistical profile of an agent's typical activity.

Here's what to capture during your baseline window (typically 14–30 days of stable operation):

```pseudocode
function buildBaseline(agent, windowDays=30):
    actions = getActionLog(agent, lastNDays(windowDays))
    
    baseline = {
        // Volume metrics
        actionsPerHour: distribution(actions, groupBy="hour"),
        actionsPerDay: distribution(actions, groupBy="day"),
        
        // Action type distribution
        actionTypeBreakdown: percentage(actions, groupBy="action.type"),
        // e.g., { "read": 60%, "write": 25%, "delegate": 10%, "escalate": 5% }
        
        // Resource access patterns
        resourceAccessFrequency: histogram(actions, key="resource"),
        uniqueResourcesPerDay: distribution(countUnique(actions.resource, per="day")),
        
        // Timing patterns
        avgResponseTimeMs: statisticalSummary(actions.responseTime),
        activeHoursDistribution: distribution(actions, groupBy="hourOfDay"),
        
        // Error and failure patterns
        errorRate: ratio(actions where status="error", actions.total),
        errorTypeBreakdown: percentage(errorActions, groupBy="error.type"),
        
        // Delegation patterns
        delegationsPerDay: distribution(delegationActions, groupBy="day"),
        delegationScopeDistribution: histogram(delegationActions, key="scope"),
    }
    
    return baseline
```

**Practical tip:** Don't build baselines during rollouts, migrations, or known-unusual periods. You want a baseline that represents *genuine normal behavior*, not launch-week chaos.

**Practical tip:** Build per-agent baselines, not global ones. An agent that handles customer service has a completely different behavioral profile from one doing data analysis. A global baseline would either miss anomalies on the quiet agent or false-positive on the busy one.

## The Detection Rule Pattern: Define Normal, Flag Deviations

Every detection rule follows the same structure:

```pseudocode
rule DetectionRule:
    name: string
    description: string
    metric: function(agent) -> number
    baseline: function(agent) -> statisticalProfile
    threshold: number  // How many standard deviations before alerting
    severity: "low" | "medium" | "high" | "critical"
    cooldown: duration  // Don't re-alert within this window
    
function evaluateRule(rule, agent):
    currentValue = rule.metric(agent)
    expected = rule.baseline(agent)
    
    deviation = abs(currentValue - expected.mean) / expected.stddev
    
    if deviation > rule.threshold:
        if not inCooldown(rule, agent):
            raiseAlert(rule, agent, currentValue, expected, deviation)
```

Here are detection rules that actually matter:

### Action Volume Spike
```pseudocode
rule ActionVolumeSpike:
    name: "Action Volume Spike"
    metric: countActionsInLastHour(agent)
    threshold: 3.0  // 3 standard deviations above normal
    severity: "high"
    cooldown: 15 minutes
```

### New Resource Access
```pseudocode
rule NewResourceAccess:
    name: "Accessing Previously Unused Resource"
    metric: newResourcesAccessed(agent, lastHour)
    // This isn't deviation-based—it's categorical
    condition: any resource in lastHour NOT IN agent.baseline.knownResources
    severity: "medium"
    cooldown: 1 hour
```

### Action Type Shift
```pseudocode
rule ActionTypeDistributionShift:
    name: "Unusual Action Mix"
    metric: chiSquaredDistance(currentActionMix(agent, last4Hours), agent.baseline.actionTypeBreakdown)
    threshold: 2.5
    severity: "medium"
    cooldown: 30 minutes
```

### Error Rate Spike
```pseudocode
rule ErrorRateSpike:
    name: "Error Rate Spike"
    metric: errorRate(agent, lastHour)
    threshold: 2.0
    severity: "high"
    cooldown: 10 minutes
```

## Rate Limiting vs. Rate Spike Detection

These sound similar but serve completely different purposes. Don't conflate them.

**Rate limiting** is a *hard boundary*: "This agent cannot perform more than 100 writes per hour, period." It's enforcement. It prevents damage.

**Rate spike detection** is an *observation*: "This agent is performing 80 writes per hour when it usually does 30. Something changed." It's intelligence. It triggers investigation.

You need both:

```pseudocode
// Rate limiting: hard stop
function enforceRateLimit(agent, action):
    limit = getRateLimit(agent.trustTier, action.type)
    current = getActionCount(agent, action.type, lastHour)
    
    if current >= limit:
        blockAction(action)
        alertOps("Rate limit hit", agent, action)
        return DENIED

// Rate spike detection: soft alert
function detectRateSpike(agent, action):
    current = getActionCount(agent, action.type, lastHour)
    expected = agent.baseline.actionRate(action.type).mean
    stddev = agent.baseline.actionRate(action.type).stddev
    
    if current > expected + (2.5 * stddev):
        alertOps("Rate spike detected", agent, action, severity="medium")
        // Don't block—just flag for review
```

**Set rate limits conservatively.** It's better to have an agent occasionally hit a limit and queue work than to set limits so high they never trigger. The spike detection layer handles the nuance.

## Building an Automated Response Ladder

Not every anomaly deserves the same response. A response ladder defines escalating actions based on severity and persistence:

```pseudocode
responseLadder = [
    {
        level: 1,
        trigger: "Single low-severity anomaly",
        actions: [
            logToAuditTrail(),
            incrementAnomalyCounter(agent),
        ],
        autoResolve: true,
    },
    {
        level: 2,
        trigger: "Multiple low-severity OR single medium-severity",
        actions: [
            logToAuditTrail(),
            reduceRateLimits(agent, factor=0.5),
            notifyOnCall(channel="slack", severity="info"),
        ],
        autoResolve: after(30 minutes, ifNoFurtherAnomalies),
    },
    {
        level: 3,
        trigger: "High-severity anomaly OR 3+ medium in 1 hour",
        actions: [
            logToAuditTrail(),
            restrictToReadOnly(agent),
            notifyOnCall(channel="pager", severity="warning"),
            snapshotAgentState(agent),  // Preserve evidence
        ],
        autoResolve: false,  // Requires human review
    },
    {
        level: 4,
        trigger: "Critical anomaly OR repeated high-severity",
        actions: [
            logToAuditTrail(),
            suspendAgent(agent),
            notifyOnCall(channel="pager", severity="critical"),
            snapshotAgentState(agent),
            freezeAuditLogs(agent),  // Prevent tampering
            revokeAllDelegations(agent),
        ],
        autoResolve: false,  // Requires incident review
    },
]
```

The key principle: **automated responses should buy time for humans, not replace human judgment.** Levels 1–2 handle the noise. Levels 3–4 contain the blast radius while a human figures out what happened.

## Alert Fatigue: How to Tune Your Thresholds

Alert fatigue is the #1 killer of monitoring systems. If your team gets 200 alerts a day, they'll ignore all of them—including the one that matters.

Here's how to keep your signal-to-noise ratio healthy:

### Start Permissive, Then Tighten
Begin with high thresholds (4+ standard deviations) and lower them as you understand your baseline better. It's safer to miss early anomalies than to train your team to ignore alerts.

### Use Alert Tiers
Not every alert needs to wake someone up:

```pseudocode
alertRouting = {
    "info":     -> dashboard only, batch daily digest
    "warning":  -> Slack channel, review within 4 hours
    "high":     -> Pager, review within 30 minutes
    "critical": -> Pager + phone call, review immediately
}
```

### Implement Cooldowns and Deduplication
The same anomaly firing every 30 seconds creates noise, not information:

```pseudocode
function shouldAlert(rule, agent):
    lastAlert = getLastAlert(rule, agent)
    
    if lastAlert and (now() - lastAlert.time) < rule.cooldown:
        return false  // In cooldown
    
    // Dedup: same rule + same agent + same general pattern
    recentSimilar = getSimilarAlerts(rule, agent, last1Hour)
    if recentSimilar.count >= 3:
        consolidateIntoIncident(recentSimilar)
        return false  // Already being tracked as an incident
    
    return true
```

### Track Your Alert Quality
Every week, review: How many alerts led to actual investigation? How many were dismissed? If your dismissal rate is above 80%, your thresholds are too aggressive.

## Dashboard Design for Agent Monitoring

A good agent monitoring dashboard answers three questions at a glance:

1. **Are any agents misbehaving right now?** (Active alerts panel)
2. **What's the overall health of the mesh?** (Trust score distribution, error rates)
3. **What's trending?** (Score changes over time, emerging patterns)

### Layout Principles

**Top row: Fleet-wide health**
- Total active agents
- Agents in each trust tier (pie chart or bar)
- Active alerts by severity
- Fleet-wide error rate trend (7-day sparkline)

**Middle row: Anomaly focus**
- Active incidents (sortable by severity)
- Recently triggered detection rules
- Agents with declining trust scores (last 7 days)

**Bottom row: Drill-down panels**
- Per-agent activity timeline (select an agent, see its last 24 hours)
- Action type breakdown (what is this agent doing?)
- Delegation chain visualization (who delegated to whom?)

### What NOT to Put on Your Dashboard
- Raw log streams (that's for incident investigation, not monitoring)
- Infrastructure metrics alone (CPU and memory belong on a separate ops dashboard)
- More than 15 panels (if you can't parse it in 10 seconds, it's too complex)

## Incident Response for Agent Anomalies

When your monitoring catches something real, you need a structured response:

### Phase 1: Contain (Minutes 0–5)
```pseudocode
function containAgentIncident(agent, incident):
    // Stop the bleeding
    if incident.severity >= "high":
        restrictToReadOnly(agent)
        revokeActiveDelegations(agent)
    
    // Preserve state
    snapshot = captureAgentState(agent)
    freezeRelatedLogs(agent, timeRange=last24Hours())
    
    // Notify
    createIncidentChannel(incident)
    notifyResponders(incident)
```

### Phase 2: Assess (Minutes 5–30)
- What did the agent do? Pull the action log.
- When did behavior change? Compare recent activity to baseline.
- What's the blast radius? Check delegation chains—did this agent delegate to others?
- Is it ongoing? Check if containment actions stopped the anomaly.

### Phase 3: Remediate (Minutes 30+)
- Root cause: Was it a model update? A prompt injection? A legitimate but unusual workload?
- Fix: Patch the configuration, update the policy, or retrain.
- Verify: Confirm the fix by comparing current behavior to baseline.

### Phase 4: Learn (Within 48 hours)
- Update detection rules based on what you learned
- Adjust thresholds if this should have been caught earlier (or if you got a false positive)
- Update baselines if the anomaly revealed that "normal" has legitimately changed
- Document in a post-incident review

## Quick-Start Checklist

Here's how to get behavioral monitoring running:

- [ ] **Instrument your agents** — Log every action with type, resource, timestamp, and outcome
- [ ] **Build baselines** — Run for 14–30 days before enabling detection rules
- [ ] **Start with 4 core rules** — Volume spike, new resource access, action type shift, error rate spike
- [ ] **Set thresholds conservatively** — Start at 3+ standard deviations, tune down over weeks
- [ ] **Define your response ladder** — 4 levels from "log it" to "suspend the agent"
- [ ] **Set up alert routing** — Dashboard for info, Slack for warnings, pager for critical
- [ ] **Build the dashboard** — Fleet health, active anomalies, drill-down panels
- [ ] **Write your incident runbook** — Contain, assess, remediate, learn
- [ ] **Schedule weekly alert reviews** — Track dismissal rates and tune thresholds
- [ ] **Baseline refresh** — Rebuild baselines monthly to account for legitimate drift

## Related Reading

- [Implementing Behavioral Trust Scores](/guides/implementing-trust-scores) — Trust scores are the output; monitoring is how you compute them
- [Securing Agent-to-Agent Delegation](/guides/securing-agent-delegation) — Monitor delegation chains for anomalous patterns
- [What is Agent Governance?](/concepts/what-is-agent-governance) — The big picture of why this matters
- [Audit Logs for Compliance](/concepts/audit-logs) — Turning monitoring data into compliance evidence

Good monitoring isn't about catching every anomaly—it's about reliably catching the ones that matter, responding proportionally, and learning from every incident. Start simple, tune relentlessly, and trust the data over your gut.
