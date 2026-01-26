# Rate Limiting AutoGPT to Control Costs

A comprehensive guide to preventing runaway costs when running autonomous AutoGPT agents in production.

## The Autonomous Cost Problem

AutoGPT represents a paradigm shift in how AI agents operate. Unlike conversational AI that waits for human input, AutoGPT agents are designed to run autonomously — planning, executing, and iterating without human intervention. This autonomy is precisely what makes them powerful. It's also what makes them dangerous to your budget.

Consider what happens when you deploy an AutoGPT agent to "research a topic and write a comprehensive report":

1. The agent plans its approach (1-2 API calls)
2. It searches the web (API call)
3. It reads search results and decides what to explore (API call)
4. It follows each promising link (5-10 API calls)
5. It summarizes each source (5-10 API calls)
6. It realizes it needs more information (back to step 2)
7. It outlines the report (API call)
8. It writes each section (5-10 API calls)
9. It reviews and refines the output (3-5 API calls)
10. It decides the report isn't comprehensive enough (back to step 2)

A single "write a report" task can easily trigger 50-100+ API calls. At GPT-4 prices of ~$0.03-0.06 per 1K input tokens and ~$0.06-0.12 per 1K output tokens, a thorough agent can burn through $5-50 in minutes. And that's assuming it doesn't get stuck in a loop.

This guide shows you how to use MeshGuard to implement intelligent rate limiting that keeps your AutoGPT agents productive without letting them drain your API budget.

## Understanding AutoGPT's Architecture

Before we can effectively rate limit AutoGPT, we need to understand how it works and where costs accumulate.

### The AutoGPT Platform Architecture

Modern AutoGPT (the platform, not the classic CLI agent) consists of two main components:

**AutoGPT Server**: The backend that runs your agents. It executes blocks, manages state, and handles the core agent loop.

**AutoGPT Frontend**: The web interface where you build, deploy, and monitor agents through a visual workflow builder.

Agents are built from **blocks** — reusable components that perform specific actions. These blocks include:
- LLM blocks (GPT-4, Claude, etc.) — your primary cost center
- Integration blocks (search, APIs, databases)
- Logic blocks (conditions, loops, transformations)
- Trigger blocks (webhooks, schedules, events)

### Where Costs Explode

The cost explosion points in AutoGPT are:

**1. The Agent Loop**
AutoGPT agents run in a continuous loop: observe → think → act → repeat. Each "think" step typically requires an LLM call. If your agent loops 100 times to complete a task, that's 100 LLM calls minimum.

**2. Recursive Sub-Tasks**
Agents can spawn sub-tasks, each of which spawns its own loop. A hierarchical agent working on a complex problem can create exponential call patterns.

**3. Tool Execution with LLM Parsing**
When an agent uses a tool (web search, API call), it often needs multiple LLM calls:
- One to decide which tool to use
- One to format the tool inputs
- One to parse the tool outputs
- One to decide what to do next

**4. Retry Loops**
When something fails (rate limit, invalid output, tool error), agents retry. Without limits, retry loops can run indefinitely.

**5. Perfectionism Loops**
LLM agents often exhibit "perfectionism" — they'll refine, improve, and iterate on outputs far beyond what's useful, burning tokens on marginal improvements.

### Classic AutoGPT Cost Patterns

The original CLI-based AutoGPT was particularly notorious for cost explosions. It would:
- Continuously loop without human checkpoints
- Spawn unlimited sub-tasks
- Get stuck in infinite research loops
- Generate thousands of API calls overnight

Stories abound of developers waking up to $500+ OpenAI bills from a single overnight AutoGPT session. While the modern platform has more controls, the fundamental risk remains: **autonomous agents will use as many resources as you allow them**.

## Real Cost Explosion Scenarios

Let's examine real-world scenarios where AutoGPT costs spiral out of control, and how rate limiting would have prevented each one.

### Scenario 1: The Infinite Research Loop

**What happened**: A developer deployed an agent to "compile a comprehensive market analysis of the electric vehicle industry." The agent started researching... and never stopped.

**The loop**: Search → Find sources → Realize there's more to research → Search again → Find more sources → Repeat infinitely.

**The damage**: 2,847 API calls over 6 hours. $127 in API costs before someone noticed.

**The problem**: No limit on research iterations. The agent interpreted "comprehensive" as "exhaustive" and kept digging.

**Rate limiting solution**:
```yaml
rules:
  - action: "llm:*"
    effect: allow
    rate_limit:
      max_per_minute: 20        # Slow down the loop
      max_per_task: 100         # Cap total calls per task
      max_per_day: 500          # Hard daily limit
```

With this policy, the agent would have been throttled after 100 calls, prompting it to conclude or escalate rather than continuing indefinitely.

### Scenario 2: The Sub-Agent Explosion

**What happened**: An agent was tasked with "analyzing competitor websites." It spawned a sub-agent for each competitor, and each sub-agent spawned more sub-agents for different analysis aspects.

**The explosion**: 1 agent → 12 competitor sub-agents → 5 analysis sub-agents each = 60 concurrent agents, all making LLM calls.

**The damage**: 4,500+ API calls in 45 minutes. $340 in costs.

**The problem**: No limit on delegation or concurrent operations. Hierarchical explosion.

**Rate limiting solution**:
```yaml
rules:
  - action: "delegate:*"
    effect: allow
    rate_limit:
      max_per_minute: 2         # Limit delegation frequency
      max_concurrent: 5          # Only 5 sub-agents at once
      max_depth: 2               # No sub-sub-sub agents
```

### Scenario 3: The Perfectionism Death Spiral

**What happened**: An agent writing a blog post decided its output wasn't good enough. It rewrote. Still not satisfied. Rewrote again. And again.

**The spiral**: Generate → Self-critique → Improve → Self-critique → Improve → Repeat 50+ times.

**The damage**: 847 API calls for a single blog post. $89 in costs for 1,200 words.

**The problem**: No limit on refinement iterations. The agent's quality bar exceeded what was achievable in reasonable iterations.

**Rate limiting solution**:
```yaml
rules:
  - action: "llm:completion"
    effect: allow
    rate_limit:
      max_per_minute: 10
      max_per_hour: 50
      max_consecutive_failures: 3  # Stop after 3 unsatisfactory outputs
```

### Scenario 4: The Overnight Runaway

**What happened**: A developer started an agent Friday evening to "prepare a presentation for Monday." They assumed it would finish quickly and went home.

**The runaway**: The agent worked all weekend, continuously refining, researching, and regenerating slides.

**The damage**: 72 hours of continuous operation. 15,000+ API calls. $1,847 in costs.

**The problem**: No time boundaries. No cost ceiling. No automatic shutdown.

**Rate limiting solution**:
```yaml
rules:
  - action: "llm:*"
    effect: allow
    rate_limit:
      max_per_day: 1000
    cost_ceiling:
      max_usd_per_day: 50        # Hard stop at $50/day
      max_usd_per_task: 20       # Single task cap
    conditions:
      - "time.hour >= 6 AND time.hour <= 22"  # Only run during day
```

### Scenario 5: The Token Explosion

**What happened**: An agent processing documents started including full document contents in its context window. With each iteration, the context grew.

**The explosion**: Context started at 2K tokens, grew to 128K tokens by iteration 20. Each call cost 10-50x the initial cost.

**The damage**: Token costs grew exponentially. $500+ in 2 hours.

**The problem**: No token limits per call. Growing context windows.

**Rate limiting solution**:
```yaml
rules:
  - action: "llm:*"
    effect: allow
    rate_limit:
      max_tokens_per_call: 16000   # Cap context size
      max_tokens_per_minute: 100000
      max_tokens_per_day: 2000000
```

## MeshGuard Rate Limiting for AutoGPT

MeshGuard provides multi-dimensional rate limiting designed for autonomous AI agents. Unlike simple API rate limits, MeshGuard understands agent behavior and can limit at multiple levels simultaneously.

### Rate Limiting Dimensions

MeshGuard supports rate limiting across several dimensions:

**Time-Based Limits**
- Per-second, per-minute, per-hour, per-day
- Rolling windows or fixed windows
- Time-of-day restrictions

**Count-Based Limits**
- Maximum calls per action
- Maximum calls per task/session
- Maximum concurrent operations

**Token-Based Limits**
- Maximum tokens per call
- Maximum tokens per time window
- Input vs output token limits

**Cost-Based Limits**
- Maximum cost per call
- Maximum cost per time window
- Budget alerts and hard stops

**Behavioral Limits**
- Maximum consecutive similar actions
- Maximum retry attempts
- Maximum delegation depth

### The MeshGuard Rate Limit Object

Rate limits are defined in your policy YAML:

```yaml
rate_limit:
  # Time-based
  max_per_second: 1
  max_per_minute: 20
  max_per_hour: 200
  max_per_day: 1000
  
  # Count-based
  max_per_task: 50
  max_concurrent: 3
  
  # Token-based
  max_tokens_per_call: 16000
  max_input_tokens_per_call: 12000
  max_output_tokens_per_call: 4000
  max_tokens_per_minute: 100000
  max_tokens_per_day: 5000000
  
  # Behavioral
  max_consecutive: 10        # Same action in a row
  max_retries: 3             # Failed attempts
  cooldown_seconds: 60       # After limit hit
```

### How Rate Limiting Integrates with AutoGPT

MeshGuard sits between your AutoGPT agent and the resources it consumes:

```
┌─────────────────────────────────────────────────────────────────┐
│                       AutoGPT Agent                             │
│                                                                 │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐     │
│  │ Planning │──▶│ Research │──▶│ Writing  │──▶│ Review   │     │
│  │  Block   │   │  Block   │   │  Block   │   │  Block   │     │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘     │
│       │              │              │              │            │
└───────┼──────────────┼──────────────┼──────────────┼────────────┘
        │              │              │              │
        ▼              ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MeshGuard Governance Layer                    │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Rate Limiter │  │ Cost Tracker │  │ Audit Logger │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                 │
│  Policy: max 20 calls/min, $50/day ceiling, 5 retries max      │
│                                                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      External Services                          │
│                                                                 │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐     │
│  │  OpenAI  │   │ Anthropic│   │  Search  │   │   APIs   │     │
│  │   API    │   │   API    │   │   API    │   │          │     │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

Every action the agent attempts passes through MeshGuard, which:
1. Checks the action against policy rules
2. Evaluates current rate limit state
3. Allows, denies, or queues the action
4. Logs the attempt and outcome
5. Updates rate limit counters

## YAML Policy Examples for Cost Control

Here are complete policy configurations for different AutoGPT use cases.

### Basic Cost Protection Policy

A starter policy for any AutoGPT deployment:

```yaml
name: autogpt-basic-cost-protection
version: 1
description: "Basic rate limiting for AutoGPT agents"

agent_match:
  tags: ["autogpt", "autonomous"]

# Global rate limits apply to all actions
global_rate_limit:
  max_per_minute: 30
  max_per_hour: 500
  max_per_day: 2000
  max_tokens_per_day: 5000000

rules:
  # LLM calls - primary cost center
  - action: "llm:*"
    effect: allow
    rate_limit:
      max_per_minute: 20
      max_per_hour: 200
      max_tokens_per_call: 16000
      max_tokens_per_minute: 100000
    cost_ceiling:
      max_usd_per_hour: 10
      max_usd_per_day: 50

  # Web search - secondary cost center
  - action: "search:*"
    effect: allow
    rate_limit:
      max_per_minute: 10
      max_per_hour: 100

  # Delegation - prevent sub-agent explosion
  - action: "delegate:*"
    effect: allow
    rate_limit:
      max_per_minute: 2
      max_concurrent: 3
      max_depth: 2

  # Tool execution - general limit
  - action: "tool:*"
    effect: allow
    rate_limit:
      max_per_minute: 30
      max_per_hour: 300

# What to do when limits are hit
on_limit_exceeded:
  action: queue
  queue_timeout_seconds: 300
  notify:
    - channel: slack
      message: "AutoGPT rate limit hit: {action} - {limit_type}"
```

### Production Research Agent Policy

For agents that perform research tasks with higher volume needs:

```yaml
name: autogpt-research-agent-policy
version: 1
description: "Cost-optimized policy for research-intensive AutoGPT agents"

agent_match:
  tags: ["autogpt", "research"]

# Time-of-day restrictions
time_restrictions:
  allowed_hours:
    start: 6
    end: 22
  timezone: "America/New_York"
  on_violation: deny_with_message
  violation_message: "Research agents only run during business hours (6AM-10PM ET)"

rules:
  # High-cost GPT-4 calls - strict limits
  - action: "llm:gpt-4*"
    effect: allow
    rate_limit:
      max_per_minute: 10
      max_per_hour: 100
      max_per_day: 500
      max_tokens_per_call: 8000
    cost_ceiling:
      max_usd_per_hour: 15
      max_usd_per_day: 100
    conditions:
      - "context.task_type in ['analysis', 'synthesis', 'decision']"

  # Lower-cost GPT-3.5 calls - more generous
  - action: "llm:gpt-3.5*"
    effect: allow
    rate_limit:
      max_per_minute: 30
      max_per_hour: 500
      max_per_day: 2000
      max_tokens_per_call: 4000

  # Claude calls - balanced limits
  - action: "llm:claude*"
    effect: allow
    rate_limit:
      max_per_minute: 15
      max_per_hour: 200
      max_per_day: 1000
      max_tokens_per_call: 16000

  # Research-specific: web search
  - action: "search:web"
    effect: allow
    rate_limit:
      max_per_minute: 20
      max_per_hour: 200
      max_per_task: 50
      cooldown_after_limit: 120

  # Document reading - higher limits
  - action: "read:document"
    effect: allow
    rate_limit:
      max_per_minute: 50
      max_per_hour: 500

  # Prevent infinite research loops
  - action: "llm:*"
    effect: allow
    behavioral_limits:
      max_consecutive_research: 20
      max_iterations_per_topic: 30
      require_conclusion_after: 50

# Budget controls
budget:
  daily_limit_usd: 100
  warning_threshold_percent: 75
  critical_threshold_percent: 90
  on_critical:
    - pause_non_essential
    - notify_ops
    - reduce_rate_limits_by: 50

on_limit_exceeded:
  action: graceful_conclude
  message_to_agent: |
    You've reached your research limit for this task. 
    Please synthesize your findings and provide a conclusion 
    with the information gathered so far.
```

### High-Security Enterprise Policy

For enterprise deployments with strict cost and security controls:

```yaml
name: autogpt-enterprise-secure
version: 2
description: "Enterprise-grade AutoGPT governance with comprehensive limits"

agent_match:
  tags: ["autogpt", "enterprise"]
  trust_tier:
    min: verified

# Require approval for high-cost operations
approval_required:
  - action: "llm:gpt-4*"
    when: "estimated_cost_usd > 5"
    approvers: ["admin", "team-lead"]
    timeout_minutes: 30
    on_timeout: deny

# Comprehensive rate limits
rules:
  # Primary LLM - tiered limits
  - action: "llm:*"
    effect: allow
    rate_limit:
      # Burst control
      max_per_second: 2
      max_per_minute: 20
      
      # Sustained control
      max_per_hour: 150
      max_per_day: 1000
      
      # Token limits
      max_input_tokens_per_call: 10000
      max_output_tokens_per_call: 4000
      max_tokens_per_minute: 80000
      max_tokens_per_hour: 500000
      max_tokens_per_day: 3000000
      
      # Behavioral
      max_consecutive: 5
      max_retries: 2
      retry_delay_seconds: 30
      
    cost_ceiling:
      max_usd_per_call: 2
      max_usd_per_minute: 5
      max_usd_per_hour: 25
      max_usd_per_day: 150

  # Delegation controls
  - action: "delegate:*"
    effect: allow
    rate_limit:
      max_per_minute: 1
      max_per_hour: 10
      max_concurrent: 2
      max_depth: 1
    requires:
      - delegation_approved: true
      - delegatee_trust_tier: verified

  # External API calls
  - action: "api:external:*"
    effect: allow
    rate_limit:
      max_per_minute: 10
      max_per_hour: 100
    conditions:
      - "request.domain in allowed_domains"

  # Database operations
  - action: "db:read:*"
    effect: allow
    rate_limit:
      max_per_minute: 100
      
  - action: "db:write:*"
    effect: allow
    rate_limit:
      max_per_minute: 10
      max_per_hour: 100
    audit: detailed

  # Code execution - very restricted
  - action: "code:execute"
    effect: allow
    rate_limit:
      max_per_hour: 10
      max_per_day: 50
    conditions:
      - "code.language in ['python', 'javascript']"
      - "code.sandbox == true"

# Anomaly detection
anomaly_detection:
  enabled: true
  patterns:
    - name: "cost_spike"
      condition: "current_cost > (average_cost * 3)"
      action: pause_and_alert
      
    - name: "loop_detection"
      condition: "same_action_count > 20 in last 5 minutes"
      action: reduce_rate_limit
      
    - name: "token_explosion"
      condition: "tokens_per_call_trend > 2x over 10 calls"
      action: cap_tokens

# Cost tracking and alerts
cost_tracking:
  track_by:
    - agent_id
    - task_id
    - action_type
    
  alerts:
    - threshold_usd: 50
      channel: slack
      message: "Agent {agent_id} has used $50 today"
      
    - threshold_usd: 100
      channel: pagerduty
      severity: warning
      
    - threshold_usd: 150
      channel: pagerduty
      severity: critical
      action: pause_agent

# Automatic cost optimization
optimization:
  model_fallback:
    enabled: true
    rules:
      - when: "daily_cost > 100"
        fallback: 
          from: "gpt-4"
          to: "gpt-3.5-turbo"
          for_actions: ["search", "summarize", "format"]
          
  context_trimming:
    enabled: true
    max_context_tokens: 8000
    trim_strategy: "keep_recent_and_important"
```

### Development/Testing Policy

Generous limits for development, with safety nets:

```yaml
name: autogpt-development
version: 1
description: "Relaxed limits for development and testing"

agent_match:
  tags: ["autogpt", "development"]
  environment: ["dev", "staging"]

rules:
  - action: "llm:*"
    effect: allow
    rate_limit:
      max_per_minute: 60
      max_per_hour: 1000
      max_tokens_per_call: 32000
    cost_ceiling:
      max_usd_per_hour: 20
      max_usd_per_day: 100  # Still have a daily cap!

  - action: "*"
    effect: allow
    rate_limit:
      max_per_minute: 100
      max_per_hour: 2000

# Even in dev, prevent runaway costs
emergency_stop:
  trigger:
    - "cost_last_hour > 30"
    - "calls_last_minute > 100"
  action: pause
  notify: developer
```

## Monitoring and Alerting on Spend

Rate limiting prevents cost explosions, but you also need visibility into what your agents are spending.

### Setting Up Cost Monitoring

```python
from meshguard import MeshGuardClient
from meshguard.monitoring import CostMonitor, AlertChannel

# Initialize client with monitoring
client = MeshGuardClient(
    gateway_url="https://dashboard.meshguard.app",
    agent_token="your-agent-token",
)

# Set up cost monitoring
monitor = CostMonitor(
    client=client,
    track_by=["agent_id", "action", "model"],
    aggregation_window="1h",  # Aggregate costs hourly
)

# Configure alerts
monitor.add_alert(
    name="hourly_cost_warning",
    condition="cost_last_hour > 10",
    severity="warning",
    channels=[
        AlertChannel.slack("#ai-ops"),
        AlertChannel.email("ops@company.com"),
    ],
)

monitor.add_alert(
    name="daily_cost_critical",
    condition="cost_today > 100",
    severity="critical",
    channels=[
        AlertChannel.pagerduty("ai-oncall"),
    ],
    action="pause_agent",
)

monitor.add_alert(
    name="cost_spike_detection",
    condition="cost_last_5min > (avg_cost_5min * 5)",
    severity="warning",
    channels=[
        AlertChannel.slack("#ai-ops"),
    ],
    action="reduce_rate_limits",
)

# Start monitoring
monitor.start()
```

### Real-Time Cost Dashboard

MeshGuard provides a real-time cost dashboard, but you can also build custom monitoring:

```python
from meshguard import MeshGuardClient
from meshguard.analytics import CostAnalytics
import time

client = MeshGuardClient()
analytics = CostAnalytics(client)

def print_cost_report():
    """Print current cost status."""
    
    # Get current costs
    today = analytics.get_costs(period="today")
    this_hour = analytics.get_costs(period="last_hour")
    
    print(f"""
    ╔══════════════════════════════════════════╗
    ║       AutoGPT Cost Dashboard             ║
    ╠══════════════════════════════════════════╣
    ║ Today's Total:     ${today['total']:>8.2f}          ║
    ║ This Hour:         ${this_hour['total']:>8.2f}          ║
    ║ Daily Limit:       ${today['limit']:>8.2f}          ║
    ║ Remaining:         ${today['remaining']:>8.2f}          ║
    ╠══════════════════════════════════════════╣
    ║ Top Actions by Cost:                     ║
    """)
    
    for action, cost in today['by_action'][:5]:
        print(f"    ║   {action:<20} ${cost:>8.2f}      ║")
    
    print("    ╚══════════════════════════════════════════╝")

# Monitor continuously
while True:
    print_cost_report()
    time.sleep(60)  # Update every minute
```

### Cost Attribution by Task

Track costs at the task level to understand which operations are expensive:

```python
from meshguard import MeshGuardClient
from meshguard.analytics import TaskCostTracker

client = MeshGuardClient()
tracker = TaskCostTracker(client)

# Start a task
task_id = tracker.start_task(
    name="market_research_q1",
    metadata={
        "agent": "research-agent-1",
        "requested_by": "marketing-team",
        "priority": "high",
    }
)

# ... agent runs ...

# Get task cost report
report = tracker.get_task_report(task_id)
print(f"""
Task: {report['name']}
Duration: {report['duration_minutes']} minutes
Total Cost: ${report['total_cost']:.2f}

Breakdown:
  - LLM Calls: {report['llm_calls']} (${report['llm_cost']:.2f})
  - Search Calls: {report['search_calls']} (${report['search_cost']:.2f})
  - API Calls: {report['api_calls']} (${report['api_cost']:.2f})

Tokens Used:
  - Input: {report['input_tokens']:,}
  - Output: {report['output_tokens']:,}

Cost per useful output: ${report['cost_per_output']:.4f}
""")
```

### Alerting Integration Examples

**Slack Integration:**

```python
from meshguard.integrations import SlackWebhook

slack = SlackWebhook(
    webhook_url="https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
    channel="#ai-ops",
)

# Configure in policy
cost_tracking:
  alerts:
    - threshold_usd: 50
      channel: slack
      webhook: "https://hooks.slack.com/services/..."
      message: |
        :warning: *AutoGPT Cost Alert*
        Agent `{agent_id}` has spent *${current_cost}* today.
        
        *Top actions:*
        {top_actions_formatted}
        
        <{dashboard_link}|View Dashboard>
```

**PagerDuty Integration:**

```python
from meshguard.integrations import PagerDuty

pagerduty = PagerDuty(
    routing_key="your-pagerduty-routing-key",
    severity_mapping={
        "warning": "warning",
        "critical": "critical",
    }
)

# In policy
alerts:
  - threshold_usd: 200
    channel: pagerduty
    severity: critical
    action: pause_agent
```

## Code Examples: Integrating MeshGuard with AutoGPT

Here's how to integrate MeshGuard rate limiting into your AutoGPT deployment.

### Method 1: Governed Blocks

Wrap AutoGPT blocks with MeshGuard governance:

```python
from autogpt_platform.backend.blocks import Block, BlockOutput
from autogpt_platform.backend.data.block import BlockSchemaInput, BlockSchemaOutput
from meshguard import MeshGuardClient
from meshguard.autogpt import governed_block, CostTracker

# Initialize MeshGuard
mesh = MeshGuardClient(
    gateway_url="https://dashboard.meshguard.app",
    agent_token="autogpt-agent-token",
)

# Original AutoGPT block
class LLMCompletionBlock(Block):
    """Standard LLM completion block."""
    
    class Input(BlockSchemaInput):
        prompt: str
        model: str = "gpt-4"
        max_tokens: int = 1000
    
    class Output(BlockSchemaOutput):
        response: str
        tokens_used: int
    
    def run(self, input_data: Input, **kwargs) -> BlockOutput:
        response = openai.chat.completions.create(
            model=input_data.model,
            messages=[{"role": "user", "content": input_data.prompt}],
            max_tokens=input_data.max_tokens,
        )
        yield "response", response.choices[0].message.content
        yield "tokens_used", response.usage.total_tokens


# Governed version with rate limiting
@governed_block(
    action="llm:completion",
    client=mesh,
    rate_limit={
        "max_per_minute": 20,
        "max_tokens_per_call": 4000,
    },
    track_cost=True,
)
class GovernedLLMCompletionBlock(LLMCompletionBlock):
    """LLM completion with MeshGuard rate limiting."""
    
    def run(self, input_data: Input, **kwargs) -> BlockOutput:
        # MeshGuard automatically:
        # 1. Checks rate limits before execution
        # 2. Tracks token usage and cost
        # 3. Logs the action for audit
        # 4. Denies if limits exceeded
        
        # If we get here, we're within limits
        yield from super().run(input_data, **kwargs)
```

### Method 2: Middleware Integration

Apply governance as middleware to all blocks:

```python
from autogpt_platform.backend.executor import BlockExecutor
from meshguard import MeshGuardClient
from meshguard.autogpt import MeshGuardMiddleware

# Initialize MeshGuard middleware
mesh = MeshGuardClient(agent_token="autogpt-agent-token")
middleware = MeshGuardMiddleware(
    client=mesh,
    default_rate_limit={
        "max_per_minute": 30,
        "max_per_hour": 500,
    },
    block_action_mapping={
        "LLMCompletionBlock": "llm:completion",
        "WebSearchBlock": "search:web",
        "CodeExecutionBlock": "code:execute",
        "APIRequestBlock": "api:external",
    },
)

# Wrap the executor
class GovernedBlockExecutor(BlockExecutor):
    """Block executor with MeshGuard governance."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.middleware = middleware
    
    async def execute_block(self, block, input_data, **kwargs):
        # Check with MeshGuard before execution
        decision = await self.middleware.check(
            block=block,
            input_data=input_data,
            context=kwargs,
        )
        
        if not decision.allowed:
            if decision.should_queue:
                # Wait and retry
                await asyncio.sleep(decision.retry_after_seconds)
                return await self.execute_block(block, input_data, **kwargs)
            else:
                # Return denial as block output
                yield "error", f"Rate limit exceeded: {decision.reason}"
                return
        
        # Execute the block
        async for output in super().execute_block(block, input_data, **kwargs):
            yield output
        
        # Report completion for cost tracking
        await self.middleware.report_completion(
            block=block,
            usage=kwargs.get('usage'),
        )
```

### Method 3: Custom Agent Loop Integration

For maximum control, integrate into the agent loop itself:

```python
from meshguard import MeshGuardClient
from meshguard.rate_limiting import RateLimiter, TokenBucket
from meshguard.cost_tracking import CostTracker

class GovernedAutoGPTAgent:
    """AutoGPT agent with MeshGuard cost controls."""
    
    def __init__(
        self,
        agent_id: str,
        meshguard_token: str,
        max_cost_per_task: float = 50.0,
        max_iterations: int = 100,
    ):
        self.agent_id = agent_id
        self.max_cost_per_task = max_cost_per_task
        self.max_iterations = max_iterations
        
        # Initialize MeshGuard
        self.mesh = MeshGuardClient(agent_token=meshguard_token)
        
        # Set up rate limiter
        self.rate_limiter = RateLimiter(
            client=self.mesh,
            buckets={
                "llm": TokenBucket(
                    capacity=20,
                    refill_rate=20,  # per minute
                    refill_interval=60,
                ),
                "search": TokenBucket(
                    capacity=10,
                    refill_rate=10,
                    refill_interval=60,
                ),
                "api": TokenBucket(
                    capacity=30,
                    refill_rate=30,
                    refill_interval=60,
                ),
            }
        )
        
        # Set up cost tracker
        self.cost_tracker = CostTracker(
            client=self.mesh,
            agent_id=agent_id,
        )
    
    async def run_task(self, task: str) -> str:
        """Run a task with cost controls."""
        
        # Start cost tracking for this task
        task_id = self.cost_tracker.start_task(task)
        
        iteration = 0
        result = None
        
        try:
            while iteration < self.max_iterations:
                iteration += 1
                
                # Check cost ceiling
                current_cost = self.cost_tracker.get_task_cost(task_id)
                if current_cost >= self.max_cost_per_task:
                    return self._conclude_due_to_cost(task_id, current_cost)
                
                # Plan next action
                action = await self._plan_next_action(task)
                
                # Check rate limit
                if not await self.rate_limiter.acquire(action.type):
                    # Wait for rate limit to reset
                    wait_time = self.rate_limiter.get_wait_time(action.type)
                    if wait_time > 300:  # More than 5 minutes
                        return self._conclude_due_to_rate_limit(task_id)
                    await asyncio.sleep(wait_time)
                    continue
                
                # Execute action
                result = await self._execute_action(action)
                
                # Track cost
                self.cost_tracker.record(
                    task_id=task_id,
                    action=action.type,
                    cost=result.cost,
                    tokens=result.tokens,
                )
                
                # Check if task is complete
                if self._is_task_complete(result):
                    break
            
            # Finalize
            self.cost_tracker.complete_task(task_id)
            return result.output
            
        except Exception as e:
            self.cost_tracker.fail_task(task_id, str(e))
            raise
    
    def _conclude_due_to_cost(self, task_id: str, current_cost: float) -> str:
        """Gracefully conclude when cost limit is reached."""
        return f"""
        Task concluded due to cost limit.
        
        Current cost: ${current_cost:.2f}
        Limit: ${self.max_cost_per_task:.2f}
        
        Summary of work completed:
        {self.cost_tracker.get_task_summary(task_id)}
        
        To continue, increase the cost limit or break the task into smaller parts.
        """
    
    def _conclude_due_to_rate_limit(self, task_id: str) -> str:
        """Conclude when rate limits are persistently hit."""
        return f"""
        Task paused due to rate limits.
        
        This task has been queued for later execution.
        Progress saved at: {self.cost_tracker.get_task_progress(task_id)}
        """
```

### Method 4: Docker Sidecar Integration

Run MeshGuard as a sidecar alongside your AutoGPT deployment:

```yaml
# docker-compose.yml
version: '3.8'

services:
  autogpt-server:
    image: autogpt/server:latest
    environment:
      - MESHGUARD_GATEWAY=http://meshguard:8080
      - MESHGUARD_AGENT_TOKEN=${MESHGUARD_TOKEN}
    depends_on:
      - meshguard
      - postgres
      - redis
    networks:
      - autogpt-network

  meshguard:
    image: meshguard/gateway:latest
    environment:
      - MESHGUARD_API_KEY=${MESHGUARD_API_KEY}
      - MESHGUARD_POLICY_FILE=/policies/autogpt-policy.yaml
    volumes:
      - ./policies:/policies:ro
    ports:
      - "8080:8080"
    networks:
      - autogpt-network

  autogpt-frontend:
    image: autogpt/frontend:latest
    ports:
      - "3000:3000"
    depends_on:
      - autogpt-server
    networks:
      - autogpt-network

networks:
  autogpt-network:
    driver: bridge
```

Then configure AutoGPT to route through MeshGuard:

```python
# autogpt_config.py
import os
from meshguard.autogpt import MeshGuardProxy

# Configure MeshGuard proxy for all LLM calls
meshguard_gateway = os.environ.get("MESHGUARD_GATEWAY", "http://meshguard:8080")
agent_token = os.environ.get("MESHGUARD_AGENT_TOKEN")

# Proxy intercepts and governs all LLM calls
llm_proxy = MeshGuardProxy(
    gateway_url=meshguard_gateway,
    agent_token=agent_token,
)

# Patch the LLM client to use the proxy
import openai
openai.api_base = f"{meshguard_gateway}/v1"
openai.api_key = agent_token  # MeshGuard handles actual API key
```

## Best Practices for Production AutoGPT Deployments

### 1. Start Conservative, Expand Carefully

Begin with restrictive limits and expand based on observed behavior:

```yaml
# Week 1: Discovery phase
rate_limit:
  max_per_minute: 10
  max_per_day: 200
  max_usd_per_day: 20

# Week 2: After analyzing patterns
rate_limit:
  max_per_minute: 20
  max_per_day: 500
  max_usd_per_day: 50

# Production: Based on actual needs
rate_limit:
  max_per_minute: 30
  max_per_day: 1000
  max_usd_per_day: 100
```

### 2. Use Tiered Rate Limits by Model

Not all LLM calls are equal. Apply different limits based on cost:

```yaml
rules:
  # Expensive models - strict limits
  - action: "llm:gpt-4"
    rate_limit:
      max_per_minute: 5
      max_per_hour: 50
      
  # Mid-tier models - moderate limits
  - action: "llm:gpt-4-turbo"
    rate_limit:
      max_per_minute: 15
      max_per_hour: 150
      
  # Cheaper models - generous limits
  - action: "llm:gpt-3.5-turbo"
    rate_limit:
      max_per_minute: 50
      max_per_hour: 500
```

### 3. Implement Graceful Degradation

When limits are hit, fall back to cheaper alternatives rather than failing:

```yaml
on_limit_exceeded:
  strategy: graceful_degradation
  fallback_chain:
    - from: "llm:gpt-4"
      to: "llm:gpt-4-turbo"
      when: "cost_limit_hit"
      
    - from: "llm:gpt-4-turbo"
      to: "llm:gpt-3.5-turbo"
      when: "rate_limit_hit"
      
    - from: "llm:gpt-3.5-turbo"
      to: "queue"
      when: "all_limits_hit"
```

### 4. Set Task-Level Budgets

Each task should have its own budget to prevent any single task from consuming all resources:

```python
# When starting a task
task_budget = TaskBudget(
    max_cost_usd=20.0,
    max_iterations=50,
    max_duration_minutes=30,
    on_exceed="conclude_gracefully",
)

agent.run_task(task, budget=task_budget)
```

### 5. Monitor Token Efficiency

Track tokens per useful output to identify inefficient patterns:

```python
# Calculate efficiency metrics
efficiency = analytics.get_efficiency_metrics(
    period="last_24h",
    group_by="task_type",
)

for task_type, metrics in efficiency.items():
    print(f"""
    Task Type: {task_type}
    Average tokens per completion: {metrics['tokens_per_completion']:,}
    Average cost per completion: ${metrics['cost_per_completion']:.2f}
    Completion rate: {metrics['completion_rate']:.1%}
    """)
    
    # Flag inefficient patterns
    if metrics['tokens_per_completion'] > 50000:
        alert(f"High token usage detected for {task_type}")
```

### 6. Implement Circuit Breakers

Automatically stop agents that exhibit runaway behavior:

```yaml
circuit_breaker:
  triggers:
    - name: "cost_spike"
      condition: "cost_last_5min > (avg_cost_5min * 5)"
      action: pause
      cooldown_minutes: 15
      
    - name: "loop_detection"
      condition: "same_action_repeated > 10"
      action: break_loop
      
    - name: "error_storm"
      condition: "error_rate_last_5min > 0.5"
      action: pause
      cooldown_minutes: 30

  on_trip:
    - notify: ops-team
    - log: detailed
    - save_state: true
```

### 7. Use Separate Tokens for Development and Production

Never share tokens between environments:

```yaml
# development-policy.yaml
agent_match:
  tokens: ["dev-agent-*"]
  environment: development
  
rate_limit:
  max_per_day: 500
  max_usd_per_day: 25

# production-policy.yaml  
agent_match:
  tokens: ["prod-agent-*"]
  environment: production
  
rate_limit:
  max_per_day: 5000
  max_usd_per_day: 250
```

### 8. Regular Cost Audits

Schedule regular reviews of agent spending:

```python
# Weekly cost audit
from meshguard.analytics import CostAudit

audit = CostAudit(client)
report = audit.generate_weekly_report()

print(f"""
Weekly AutoGPT Cost Audit
========================

Total Spend: ${report['total_cost']:.2f}
vs Last Week: {report['change_percent']:+.1f}%

Top Cost Centers:
{report['top_agents']}

Anomalies Detected:
{report['anomalies']}

Recommendations:
{report['recommendations']}
""")

# Send to stakeholders
audit.email_report(
    to=["engineering-leads@company.com"],
    subject=f"Weekly AutoGPT Cost Report - ${report['total_cost']:.2f}",
)
```

### 9. Document Your Policies

Maintain clear documentation of your rate limiting policies:

```yaml
# policy-documentation.yaml
name: autogpt-production-v2
version: 2.3.1
last_updated: "2026-01-15"
owner: ai-platform-team
approved_by: engineering-director

description: |
  Production rate limiting policy for AutoGPT agents.
  Designed to balance productivity with cost control.
  
  Key constraints:
  - $150/day maximum per agent
  - 20 LLM calls/minute burst limit
  - Automatic fallback to cheaper models at 75% daily budget
  
rationale: |
  Based on 3 months of production data, we found that:
  - Most productive tasks complete within 100 LLM calls
  - Costs above $50/task rarely produce proportional value
  - GPT-3.5-turbo handles 60% of tasks adequately

changelog:
  - version: 2.3.1
    date: "2026-01-15"
    changes:
      - Increased daily limit from $100 to $150
      - Added circuit breaker for loop detection
      
  - version: 2.3.0
    date: "2025-12-01"
    changes:
      - Initial production policy
```

### 10. Plan for Growth

Design policies that scale with your usage:

```yaml
# Scaling tiers based on usage
scaling:
  tier_1:  # Startup phase
    agents: 1-5
    daily_budget: 100
    per_agent_limit: 25
    
  tier_2:  # Growth phase
    agents: 6-20
    daily_budget: 500
    per_agent_limit: 50
    
  tier_3:  # Scale phase
    agents: 21-100
    daily_budget: 2500
    per_agent_limit: 75
    
  enterprise:  # Custom
    agents: 100+
    daily_budget: custom
    per_agent_limit: custom
    dedicated_support: true
```

## Conclusion

AutoGPT represents the future of AI automation — agents that work autonomously on complex tasks without constant human supervision. But this autonomy comes with real financial risk. Without proper controls, a single agent can consume hundreds of dollars in API costs in hours.

MeshGuard provides the governance layer that makes production AutoGPT deployments safe:

- **Multi-dimensional rate limiting** prevents cost explosions from any angle
- **Token and cost tracking** gives you visibility into exactly where money goes
- **Intelligent policies** allow productive work while preventing runaway spending
- **Graceful degradation** keeps agents working even when limits are hit
- **Comprehensive monitoring** alerts you before problems become expensive

The key insight is that rate limiting isn't about restricting your agents — it's about making them predictable and sustainable. An agent that reliably completes tasks within budget is far more valuable than one that occasionally produces amazing results but might also bankrupt your API account.

Start with conservative limits, observe your agents' behavior, and expand thoughtfully. Your future self (and your finance team) will thank you.

---

::: tip Get Started with MeshGuard
Create your free MeshGuard account at [meshguard.app](https://meshguard.app) and start governing your AutoGPT agents in minutes.

- **Free tier**: Up to 10,000 governed actions/month
- **Pro tier**: Unlimited actions, advanced analytics, priority support
- **Enterprise**: Custom policies, dedicated support, SLA guarantees

[Sign up now →](https://meshguard.app)
:::
