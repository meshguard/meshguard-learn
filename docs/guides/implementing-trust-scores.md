---
title: Implementing Behavioral Trust Scores in Your Agent Mesh
description: A hands-on guide to designing, computing, and enforcing trust scores that give your agents exactly the permissions they've earned.
outline: deep
---

# Implementing Behavioral Trust Scores in Your Agent Mesh

A hands-on guide to designing, computing, and enforcing trust scores that give your agents exactly the permissions they've earned.

## The Problem: Equal Permissions, Unequal Risk

Here's a scenario that should make you uncomfortable: your brand-new experimental agent has the same permissions as your battle-tested production agent that's been reliably handling customer requests for six months.

Every agent starts as a stranger. Some prove themselves reliable. Others don't. But if your governance model treats them all the same, you're either giving untested agents too much power or handcuffing your proven ones. Neither is acceptable when agents are making real decisions—moving money, accessing data, talking to customers.

Behavioral trust scoring solves this by quantifying how much confidence you should have in each agent based on *what it's actually done*, not just what it claims it can do.

Let's build one.

## Designing a Trust Scoring Model

A trust score is a numerical value (we'll use 0–100) that represents your system's confidence in an agent's reliability. Think of it like a credit score, but for AI agents. The number itself isn't magic—what matters is how you compute it, when you update it, and what you *do* with it.

The key design principle: **trust is earned through consistent behavior, lost through violations, and always bounded by time.**

Here's the architecture at a high level:

```pseudocode
function computeTrustScore(agent):
    components = [
        weightedScore(taskCompletionRate(agent),     weight=0.25),
        weightedScore(policyComplianceRate(agent),   weight=0.30),
        weightedScore(behavioralConsistency(agent),  weight=0.20),
        weightedScore(peerInteractionScore(agent),   weight=0.10),
        weightedScore(tenureAndStability(agent),      weight=0.15),
    ]
    
    raw = sum(components)
    
    // Apply penalties for recent violations
    penalty = recentViolationPenalty(agent, lookbackDays=30)
    
    return clamp(raw - penalty, min=0, max=100)
```

Let's break down each component.

## The 5 Components (and How to Weight Them)

### 1. Task Completion Rate (Weight: 25%)

This is the most intuitive signal: does the agent finish what it starts?

Track the ratio of successfully completed tasks to total attempted tasks. But don't make it binary—partial completions, retries, and graceful failures all carry signal.

```pseudocode
function taskCompletionRate(agent):
    window = last90Days()
    tasks = getTaskHistory(agent, window)
    
    if tasks.count < MIN_SAMPLE_SIZE:
        return DEFAULT_SCORE  // Not enough data yet
    
    score = 0
    for task in tasks:
        if task.status == "completed":
            score += 1.0
        elif task.status == "partial_completion":
            score += 0.5
        elif task.status == "graceful_failure":
            score += 0.3  // At least it failed cleanly
        elif task.status == "timeout" or task.status == "crash":
            score += 0.0
    
    return (score / tasks.count) * 100
```

**Why 25%:** Completion matters, but it's not everything. An agent that completes every task while violating policies is worse than one that occasionally fails safely.

### 2. Policy Compliance Rate (Weight: 30%)

This is the heaviest weight, and deliberately so. An agent that consistently stays within policy boundaries is far more trustworthy than one that gets results by cutting corners.

```pseudocode
function policyComplianceRate(agent):
    window = last90Days()
    actions = getActionLog(agent, window)
    violations = getViolations(agent, window)
    
    if actions.count == 0:
        return DEFAULT_SCORE
    
    // Weight violations by severity
    weightedViolations = 0
    for v in violations:
        if v.severity == "critical":
            weightedViolations += 10.0
        elif v.severity == "high":
            weightedViolations += 5.0
        elif v.severity == "medium":
            weightedViolations += 2.0
        elif v.severity == "low":
            weightedViolations += 0.5
    
    violationRate = weightedViolations / actions.count
    return max(0, 100 - (violationRate * 100))
```

**Why 30%:** Policy compliance is the single strongest indicator of whether an agent is safe to grant additional permissions to. This should always be your highest-weighted component.

### 3. Behavioral Consistency (Weight: 20%)

Does the agent behave predictably? Sudden changes in resource usage, request patterns, or output characteristics are red flags—even if each individual action is technically within policy.

```pseudocode
function behavioralConsistency(agent):
    baseline = getBaselineBehavior(agent, period=last60Days())
    recent = getRecentBehavior(agent, period=last7Days())
    
    deviations = [
        compareDistribution(baseline.resourceUsage, recent.resourceUsage),
        compareDistribution(baseline.requestPatterns, recent.requestPatterns),
        compareDistribution(baseline.outputCharacteristics, recent.outputCharacteristics),
        compareDistribution(baseline.errorRates, recent.errorRates),
    ]
    
    avgDeviation = mean(deviations)
    
    // Low deviation = high consistency = high score
    return max(0, 100 - (avgDeviation * 200))
```

**Why 20%:** Consistency is a strong trust signal because it's hard to fake. A compromised or malfunctioning agent will almost always show behavioral drift before it does something catastrophic.

### 4. Peer Interaction Score (Weight: 10%)

How does the agent behave when working with other agents? Does it respect delegation boundaries? Does it respond appropriately to revocation requests?

```pseudocode
function peerInteractionScore(agent):
    interactions = getDelegationHistory(agent, last90Days())
    
    metrics = {
        scopeRespected: ratio(interactions where agent stayed within delegated scope),
        cleanHandoffs: ratio(interactions with proper completion signals),
        revocationCompliance: ratio(revocation requests honored within SLA),
        escalationAppropriateness: ratio(escalations that were justified),
    }
    
    return weightedAverage(metrics, equalWeights)
```

**Why 10%:** Peer interactions are meaningful but relatively infrequent for many agents. This component matters most in dense agent meshes with lots of delegation.

### 5. Tenure and Stability (Weight: 15%)

How long has the agent been running, and how stable has its behavior been over time? New agents get lower scores here—not as punishment, but as a reflection of limited evidence.

```pseudocode
function tenureAndStability(agent):
    daysSinceDeployment = daysBetween(agent.deployedAt, now())
    
    // Tenure component (logarithmic curve, maxes out around 180 days)
    tenureScore = min(50, log2(daysSinceDeployment + 1) * 7)
    
    // Stability: how many restarts, version changes, config changes?
    stabilityEvents = getStabilityEvents(agent, last90Days())
    instabilityPenalty = stabilityEvents.count * 3
    stabilityScore = max(0, 50 - instabilityPenalty)
    
    return tenureScore + stabilityScore
```

**Why 15%:** Tenure alone doesn't prove trustworthiness, but it does provide more evidence to base decisions on. A 6-month-old agent with clean history deserves more confidence than a 2-day-old one.

## Bootstrapping Scores for New Agents

New agents present a cold-start problem. You have no behavioral data, so what score do they get?

**Don't default to zero.** A score of 0 might lock the agent out of the basic permissions it needs to even *start* building a track record.

**Don't default to the midpoint.** A score of 50 might grant access to resources the agent hasn't earned yet.

Here's a practical approach:

```pseudocode
function bootstrapScore(agent):
    baseScore = 25  // Start in the "probationary" range
    
    // Boost if deployed by a trusted operator
    if agent.deployer.trustLevel >= "verified":
        baseScore += 10
    
    // Boost if the agent template/model has a track record
    templateHistory = getTemplatePerformance(agent.templateId)
    if templateHistory.avgScore > 70 and templateHistory.sampleSize > 100:
        baseScore += 10
    
    // Boost if deployed in a sandboxed environment
    if agent.environment == "sandboxed":
        baseScore += 5
    
    return min(baseScore, 50)  // Cap at 50—never start in "trusted" range
```

The key insight: **new agents should start with enough trust to operate in limited capacity, but never enough to skip the proving period.**

## When to Recompute: Event-Driven vs. Periodic

You have two strategies, and the right answer is usually both.

**Periodic recomputation** runs on a schedule—every hour, every day. It catches gradual drift and ensures scores reflect recent behavior windows.

**Event-driven recomputation** fires immediately when something significant happens—a policy violation, a failed task, a delegation breach.

```pseudocode
// Periodic: run every hour
scheduler.every("1 hour"):
    for agent in getAllActiveAgents():
        newScore = computeTrustScore(agent)
        if abs(newScore - agent.currentScore) > SIGNIFICANCE_THRESHOLD:
            updateScore(agent, newScore)
            notifyPolicyEngine(agent, newScore)

// Event-driven: fire on violations
on("policy.violation", (event)):
    agent = event.agent
    newScore = computeTrustScore(agent)
    updateScore(agent, newScore)
    
    if event.severity >= "high":
        triggerImmediateReview(agent)
    
    notifyPolicyEngine(agent, newScore)
```

**Practical tip:** Don't recompute on *every* event. Batch low-severity events and process them on the next periodic cycle. Reserve instant recomputation for high-severity violations.

## Handling Edge Cases

### New Agents
Already covered above—use bootstrap scores with a proving period. Track score velocity (how fast is the score changing?) to identify agents that are building trust quickly vs. stagnating.

### Dormant Agents
An agent that hasn't done anything in 30 days shouldn't keep its high score. Apply a decay function:

```pseudocode
function applyDormancyDecay(agent):
    daysSinceLastAction = daysBetween(agent.lastActionAt, now())
    
    if daysSinceLastAction > 30:
        decayRate = 0.02  // 2% per day after 30 days
        decayDays = daysSinceLastAction - 30
        decayFactor = max(0.3, 1.0 - (decayRate * decayDays))
        agent.score = agent.baseScore * decayFactor
```

### Recovered Agents
An agent that violated policy, was suspended, and is now reactivated shouldn't immediately get its old score back. Use a probationary recovery curve:

```pseudocode
function recoveryScore(agent):
    preSuspensionScore = agent.scoreBeforeSuspension
    recoveryTarget = preSuspensionScore * 0.7  // Max recovery is 70% of prior score
    daysSinceRecovery = daysBetween(agent.reactivatedAt, now())
    
    // Logarithmic recovery: fast initial gains, then slower
    recoveryProgress = min(1.0, log2(daysSinceRecovery + 1) / log2(90))
    
    return BOOTSTRAP_SCORE + (recoveryTarget - BOOTSTRAP_SCORE) * recoveryProgress
```

## Integration: Trust Score → Policy Engine → Runtime

The trust score is only useful if it changes what agents can do. Here's the integration flow:

```pseudocode
// At runtime, when an agent requests an action
function evaluateActionRequest(agent, action):
    score = agent.currentTrustScore
    
    // Look up the minimum trust score required for this action
    requiredScore = policyEngine.getRequiredScore(action.type, action.resource)
    
    if score < requiredScore:
        auditLog.record("action_denied", agent, action, score, requiredScore)
        return DENY(reason="Trust score {score} below required {requiredScore}")
    
    // Score is sufficient—but apply rate limits based on tier
    tier = getTrustTier(score)  // e.g., 0-25=probationary, 26-50=limited, 51-75=standard, 76-100=trusted
    rateLimit = policyEngine.getRateLimit(action.type, tier)
    
    if rateLimiter.wouldExceed(agent, action.type, rateLimit):
        auditLog.record("action_rate_limited", agent, action)
        return DENY(reason="Rate limit exceeded for trust tier {tier}")
    
    auditLog.record("action_allowed", agent, action, score)
    return ALLOW
```

Map trust scores to concrete tiers with specific capabilities:

| Score Range | Tier | Capabilities |
|---|---|---|
| 0–25 | Probationary | Read-only, sandboxed, human approval required |
| 26–50 | Limited | Read + limited writes, standard rate limits |
| 51–75 | Standard | Full read/write, elevated rate limits |
| 76–100 | Trusted | Full access, can delegate to other agents |

## Quick-Start Checklist

Ready to implement? Here's your roadmap:

- [ ] **Define your scoring components** — Start with the 5 above, adjust weights to your environment
- [ ] **Instrument your agents** — Make sure you're logging task completions, policy violations, and behavioral metrics
- [ ] **Set bootstrap scores** — Decide your default score and what boosts it for new agents
- [ ] **Implement periodic recomputation** — Start with daily, move to hourly once stable
- [ ] **Add event-driven triggers** — Recompute immediately on high-severity violations
- [ ] **Map scores to tiers** — Define what each tier can and cannot do
- [ ] **Wire up the policy engine** — Every action request checks the trust score before proceeding
- [ ] **Add dormancy decay** — Don't let idle agents keep stale scores
- [ ] **Build a recovery path** — Define how suspended agents earn trust back
- [ ] **Monitor score distributions** — Track the overall health of your mesh

## Where to Go from Here

Trust scoring is the foundation of adaptive governance. Once you have scores flowing, you can:

- Build [automated response ladders](/guides/monitoring-agent-behavior) that use trust scores to determine escalation speed
- Enforce [delegation boundaries](/guides/securing-agent-delegation) based on the delegating agent's trust tier
- Design [policy patterns](/concepts/policy-design-patterns) that adapt to trust levels dynamically
- Understand how scores map to [trust tiers](/concepts/trust-tiers) in your governance framework

The goal isn't perfect scores—it's a system where trust is earned, violations have consequences, and your most reliable agents can do their best work without unnecessary friction.
