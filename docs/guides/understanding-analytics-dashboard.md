# Understanding the MeshGuard Analytics Dashboard

A practical guide to using the Analytics Dashboard to monitor agent activity, catch problems early, and demonstrate governance compliance.

## Why Agent Analytics Matter

If you're running AI agents in production, you already know the uncomfortable truth: without visibility, your agent mesh is a black box. Agents make requests, policies enforce rules, delegation chains form—but unless you can *see* what's happening, you're flying blind.

Analytics change the game in three critical ways:

- **Pattern recognition**: Spot anomalies before they become incidents. A sudden spike in policy denials might mean a misconfigured policy—or an active attack. You won't know unless you're watching.
- **Early problem detection**: An agent consuming 80% of your request volume isn't necessarily a problem, but it's definitely something you should know about. Analytics surface these patterns automatically.
- **Compliance evidence**: When auditors ask "how do you govern your AI agents?", a dashboard full of enforcement data, audit trails, and trust distribution charts is worth a thousand policy documents.

MeshGuard's Analytics Dashboard gives you all of this in a single view. Let's walk through it.

## Dashboard Overview

The Analytics Dashboard is organized into seven sections, each designed to answer a specific operational question. You can access it from the MeshGuard admin panel or embed it in your own monitoring setup.

### Overview Stats

The top of the dashboard shows four key metrics at a glance:

- **Total Requests**: The number of governance checks processed in the selected time window. This is your baseline for understanding system load.
- **Enforcement Rate**: The percentage of requests that hit an active policy rule (allow or deny). A low enforcement rate might mean agents are operating outside your policy coverage.
- **Active Agents**: How many unique agents made requests. Compare this to your expected agent count—unexpected agents could indicate a misconfiguration or unauthorized access.
- **Average Latency**: The mean time MeshGuard takes to evaluate a policy decision. This should stay in the low milliseconds; if it climbs, your policies may need optimization.

These four numbers tell you whether your governance layer is healthy at a glance. If you only check one thing each morning, check these.

### Request Volume Trends

The request volume chart plots governance checks over time, broken down by decision (allow, deny, require approval). This is your primary tool for spotting anomalies.

What to look for:

- **Steady growth**: Normal. Your agents are doing more work over time.
- **Sudden spikes**: Investigate immediately. Could be a legitimate burst (batch processing, new feature launch) or something concerning (runaway agent loop, denial-of-service).
- **Periodic patterns**: Most agent meshes have daily or weekly cycles. Once you know your baseline pattern, deviations become obvious.
- **Capacity planning**: If your request volume is approaching your plan limits, the trend line will tell you when you need to scale up.

### Agent Leaderboard

The agent leaderboard ranks agents by request volume, showing each agent's total requests, approval rate, and average latency. This answers the question: "Which agents are doing the most work, and are they behaving?"

Key uses:

- **Identify top consumers**: Know which agents drive the most governance traffic. These are your highest-impact agents—if one goes wrong, it'll generate the most noise.
- **Detect rogue agents**: An agent you don't recognize appearing in the top 10 is a red flag. Investigate its identity and trust level.
- **Compare approval rates**: If most agents have a 95%+ approval rate but one sits at 60%, that agent is hitting policy boundaries frequently. It might need different permissions—or it might be misbehaving.

### Policy Enforcement Breakdown

This section breaks down policy decisions by rule, showing which policies trigger most often and whether they allow or deny. Think of it as a health check for your policy configuration.

Use this to:

- **Tune policies**: If a deny rule fires hundreds of times per day for legitimate requests, your policy is too restrictive. Adjust the conditions or add an exception.
- **Reduce false denials**: Every false denial is a frustrated developer or a broken workflow. The enforcement breakdown helps you find the noisiest rules and fix them.
- **Validate new policies**: After deploying a new policy, watch this section to confirm it's triggering as expected—not too much, not too little.
- **Identify unused rules**: A policy rule that never fires might be redundant, or it might be misconfigured. Either way, it's worth reviewing.

### Trust Distribution

The trust distribution chart shows how your agents break down by trust tier: unverified, basic, verified, trusted, and privileged. This is your governance health check.

A healthy trust distribution typically looks like a pyramid—many basic agents, fewer verified ones, and only a handful with privileged access. If your distribution looks inverted (lots of privileged agents, few basic ones), your trust model may be too permissive.

Questions this chart answers:

- **Are we following least privilege?** If most agents are "trusted" or "privileged," you're probably over-permissioning.
- **Are unverified agents active?** Unverified agents making production requests is a governance gap. Tighten your trust requirements.
- **Is trust distribution changing?** A sudden shift—say, 20 agents jumping from "basic" to "trusted"—might indicate a bulk misconfiguration.

### Delegation Chains

The delegation chain visualization maps agent-to-agent relationships: which agents delegate to which others, how deep the chains go, and how frequently each delegation path is used.

Delegation is powerful but dangerous. A chain of A → B → C → D means agent D is acting with permissions that originated from agent A, potentially through intermediaries with different trust levels. The deeper the chain, the harder it is to reason about effective permissions.

Use this section to:

- **Map your agent topology**: Understand how agents actually interact, which may differ from how you *designed* them to interact.
- **Spot deep chains**: Chains deeper than 3-4 levels are hard to audit and may indicate architectural issues. Consider whether the intermediary agents are necessary.
- **Identify bottlenecks**: If one agent is the delegation root for 50 others, it's a single point of failure for your entire mesh.

### Latency Heatmap

The latency heatmap shows policy evaluation times broken down by hour and day, highlighting when your governance layer is slowest. This is your performance optimization tool.

What the heatmap reveals:

- **Peak hours**: When do your agents make the most requests? Latency typically correlates with volume.
- **Slow policy evaluations**: If certain hours consistently show higher latency, investigate what's different—more complex policies triggering, database contention, or resource constraints.
- **Regional patterns**: If your agents operate across time zones, the heatmap will show distinct activity windows for each region.

## Common Patterns to Watch For

After running MeshGuard analytics for a while, you'll develop intuition for normal vs. abnormal patterns. Here are five patterns that should trigger immediate investigation:

### Sudden Spike in Denials

**What it looks like**: Denial rate jumps from 5% to 40%+ in a short window.

**What it usually means**: Either a policy was misconfigured during a recent deployment, or an agent is attempting actions it shouldn't. Check your recent policy changes first—if nothing changed on your end, treat it as a potential security incident.

**Action**: Review the policy enforcement breakdown to identify which specific rules are firing. Cross-reference with the agent leaderboard to see if it's one agent or many.

### One Agent Consuming 80%+ of Requests

**What it looks like**: The agent leaderboard shows a single agent dominating request volume.

**What it usually means**: This agent might be in a retry loop, processing a large batch job, or simply doing more work than expected. It's not always a problem, but it's always worth knowing about.

**Action**: Check the agent's approval rate. If it's high (95%+), the agent is probably working normally at high volume. If it's low, the agent may be stuck retrying denied requests. Review its rate limits either way.

### Unverified Agents Making Lots of Requests

**What it looks like**: The trust distribution shows significant activity from the "unverified" tier.

**What it usually means**: Development or test agents are hitting your production governance layer, or new agents were deployed without proper trust configuration.

**Action**: Identify the unverified agents in the leaderboard. Either promote them to the appropriate trust tier or block them if they shouldn't have access.

### High Latency at Specific Hours

**What it looks like**: The latency heatmap shows consistent hot spots at certain times of day.

**What it usually means**: Your policy evaluation is contending with peak agent traffic. Complex policies (deep condition chains, external lookups) amplify this effect.

**Action**: Review the policies that trigger most during peak hours. Consider simplifying conditions, caching external lookups, or scaling your MeshGuard gateway.

### Deep Delegation Chains

**What it looks like**: The delegation chain visualization shows chains of 5+ agents deep.

**What it usually means**: Your agent architecture has grown organically and may need refactoring. Deep chains make it hard to reason about effective permissions and increase the blast radius if any link in the chain is compromised.

**Action**: Review whether intermediate agents in the chain are necessary. Consider flattening the architecture by having agents delegate directly rather than through intermediaries. Check your delegation depth limits in policy configuration.

## Using Analytics for Compliance

Analytics aren't just an operational tool—they're your compliance evidence trail.

### SOC 2 Evidence Gathering

SOC 2 audits require evidence that you monitor and control access to systems. MeshGuard analytics provide:

- **Access logs**: Every agent request is logged with agent identity, action, decision, and timestamp.
- **Enforcement evidence**: The enforcement rate and policy breakdown prove that governance controls are active and effective.
- **Anomaly detection**: The patterns you monitor (denial spikes, unauthorized agents) map directly to SOC 2 monitoring requirements.

Export your analytics data for the audit period and include it in your evidence package. The dashboard's time-range selector makes it easy to pull exactly the window auditors need.

### Generating Audit Reports

For periodic governance reviews, the analytics dashboard provides the data you need:

- **Agent inventory**: The active agents count and leaderboard serve as your agent registry.
- **Permission verification**: Trust distribution confirms that least-privilege principles are applied.
- **Policy effectiveness**: Enforcement breakdown shows that policies are working as designed.
- **Incident history**: Denial spikes and anomalies are visible in the request volume timeline.

### Demonstrating Governance to Stakeholders

When leadership asks "are our AI agents under control?", the analytics dashboard is your answer. The overview stats provide a quick executive summary, while the detailed sections support deeper questions. Being able to pull up real-time governance data during a meeting is worth more than any slide deck.

## API Access

Everything you see in the dashboard is available programmatically via the Analytics API at `/admin/analytics/*`. This means you can:

- **Build custom dashboards**: Embed MeshGuard metrics in your existing monitoring tools (Grafana, Datadog, etc.)
- **Automate alerting**: Set up alerts based on denial rates, latency thresholds, or unexpected agents.
- **Generate reports**: Script periodic compliance reports that pull data directly from the API.

A quick example to fetch the overview stats:

```bash
curl -H "Authorization: Bearer $MESHGUARD_TOKEN" \
  https://dashboard.meshguard.app/admin/analytics/overview
```

```json
{
  "totalRequests": 142857,
  "enforcementRate": 0.97,
  "activeAgents": 23,
  "avgLatencyMs": 4.2,
  "period": "last_24h"
}
```

For the full API reference—including all seven endpoints, query parameters, and response schemas—see the [Analytics API documentation](https://docs.meshguard.app/api/analytics).

## Next Steps

Now that you understand what the dashboard shows and why it matters, put it to work:

- **[Policy Design Patterns](/concepts/policy-design-patterns)** — Write better policies informed by your analytics data
- **[Trust Tiers Explained](/concepts/trust-tiers)** — Understand the trust distribution you're monitoring
- **[Delegation Chains](/concepts/delegation-chains)** — Deep dive into agent-to-agent relationships
- **[Audit Logs for Compliance](/concepts/audit-logs)** — Connect analytics to your compliance workflow

---

::: tip Start Monitoring Today
The Analytics Dashboard is available on all MeshGuard plans. Log in to your dashboard at **[meshguard.app](https://meshguard.app)** and start understanding what your agents are actually doing.
:::
