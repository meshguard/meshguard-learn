# Securing CrewAI Multi-Agent Systems with MeshGuard

A comprehensive guide to implementing enterprise-grade security for your CrewAI multi-agent orchestrations.

## The Multi-Agent Security Challenge

CrewAI revolutionized how we build AI applications by enabling teams of specialized agents to collaborate on complex tasks. But with this power comes significant security challenges that most organizations discover too late.

Consider a typical CrewAI scenario: you've built a content marketing crew with a researcher agent, a writer agent, and a reviewer agent. The researcher can search the web, the writer can access your CMS, and the reviewer can publish content. Seems harmless — until:

- The researcher decides to delegate a task to the writer, who then uses CMS access for something unexpected
- The writer delegates to an agent that shouldn't have publishing rights
- A malicious prompt convinces one agent to "help" by sharing credentials with another
- Your hierarchical manager agent, with its broad oversight, becomes an attack vector

These aren't hypothetical scenarios. In multi-agent systems, **delegation is the attack surface**. And CrewAI's powerful delegation features — while invaluable for productivity — create security challenges that single-agent guardrails simply cannot address.

This is precisely where MeshGuard shines.

## What You'll Learn

By the end of this guide, you'll understand:

- Why multi-agent systems need different security approaches than single agents
- How CrewAI's delegation mechanism creates security considerations
- The **permission ceiling** concept and why it's crucial for multi-agent security
- How to integrate MeshGuard with CrewAI agents, crews, and flows
- Best practices for governing complex agent hierarchies

## Prerequisites

- Python 3.10+
- CrewAI installed (`pip install crewai crewai-tools`)
- A MeshGuard account ([sign up free](https://meshguard.app))
- Basic familiarity with CrewAI concepts (agents, tasks, crews)

## Installation

```bash
pip install meshguard crewai crewai-tools
```

## Understanding CrewAI's Security Model

Before diving into MeshGuard integration, let's understand what CrewAI provides natively and where the gaps are.

### What CrewAI Offers

CrewAI includes several built-in safety features:

```python
from crewai import Agent

agent = Agent(
    role="Data Analyst",
    goal="Analyze customer data",
    backstory="You're an expert analyst...",
    
    # Built-in safety controls
    allow_delegation=False,           # Prevent delegation to other agents
    allow_code_execution=False,       # Disable code execution
    code_execution_mode="safe",       # Use Docker for code (if enabled)
    max_iter=20,                      # Limit iterations
    max_execution_time=300,           # Timeout in seconds
    max_rpm=10,                       # Rate limit API calls
)
```

CrewAI also supports **guardrails** on tasks:

```python
from crewai import Task

def validate_output(result):
    """Ensure output contains no PII."""
    pii_patterns = ["SSN", "credit card"]
    for pattern in pii_patterns:
        if pattern.lower() in result.raw.lower():
            return (False, "Output contains potential PII. Please redact.")
    return (True, result.raw)

task = Task(
    description="Summarize customer feedback",
    expected_output="Summary without personal data",
    agent=analyst,
    guardrail=validate_output,
    guardrail_max_retries=3,
)
```

### The Security Gaps

While these features are valuable, they have critical limitations in multi-agent scenarios:

| Challenge | CrewAI Native | The Gap |
|-----------|---------------|---------|
| **Delegation Control** | `allow_delegation=True/False` (binary) | No way to specify *which* agents can delegate to *whom*, or *what* actions can be delegated |
| **Hierarchical Managers** | Manager agents have broad oversight | Managers can instruct any agent, creating privilege escalation paths |
| **Tool Access Across Crews** | Tools assigned per-agent | No centralized view of which agent can access what across your system |
| **Cross-Agent Audit** | Verbose logging per execution | No unified audit trail showing delegation chains and who-did-what |
| **Policy Enforcement** | Guardrails on individual tasks | No system-wide policies that apply across all agents |
| **Trust Boundaries** | Not supported | All agents treated equally — no trust tiers |

The most dangerous gap? **Delegation without permission boundaries**. When Agent A delegates to Agent B, there's no mechanism ensuring that Agent B's actions stay within Agent A's permission scope.

## The Permission Ceiling Concept

MeshGuard introduces a critical concept that addresses multi-agent security: the **permission ceiling**.

### What Is a Permission Ceiling?

A permission ceiling is the maximum set of permissions that any agent in a delegation chain can exercise. When Agent A delegates to Agent B:

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│   Agent A (Researcher)                              │
│   Permissions: read:web, read:docs                  │
│                    │                                │
│                    │ delegates task                 │
│                    ▼                                │
│   Agent B (Writer)                                  │
│   Own Permissions: read:docs, write:cms             │
│                                                     │
│   ┌─────────────────────────────────────────────┐   │
│   │ EFFECTIVE PERMISSIONS (intersection)        │   │
│   │                                             │   │
│   │ Agent B can only use: read:docs             │   │
│   │                                             │   │
│   │ ❌ Cannot use write:cms (A doesn't have it) │   │
│   │ ❌ Cannot use read:web (B doesn't have it)  │   │
│   └─────────────────────────────────────────────┘   │
│                                                     │
│   The "ceiling" is Agent A's permissions.           │
│   B cannot exceed what A was allowed to do.         │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**The rule is simple: A delegating agent cannot grant more permissions than it possesses.**

This prevents a common attack pattern where a restricted agent delegates to a more privileged agent to bypass its own restrictions.

### Why This Matters for CrewAI

CrewAI's hierarchical process uses a manager agent that coordinates other agents:

```python
from crewai import Crew, Process

crew = Crew(
    agents=[researcher, analyst, writer, reviewer],
    tasks=[research_task, analysis_task, writing_task, review_task],
    process=Process.hierarchical,
    manager_llm="gpt-4o",  # Manager coordinates all agents
)
```

Without permission ceilings, the manager can instruct *any* agent to do *anything* that agent is capable of. If your reviewer can publish to production, the manager can tell it to publish — even if the original request came from an untrusted source.

With MeshGuard's permission ceiling:

1. The manager's permissions define the ceiling for the entire crew
2. Each agent's effective permissions = their own permissions ∩ the manager's permissions
3. Delegation chains can never escalate privileges

## Basic Integration: Governing Individual Agents

Let's start with the simplest integration — governing a single CrewAI agent's tools.

### Wrapping CrewAI Tools

```python
from crewai import Agent, Task, Crew
from crewai_tools import SerperDevTool, FileReadTool
from meshguard import MeshGuardClient

# Initialize MeshGuard
mesh = MeshGuardClient(
    gateway_url="https://dashboard.meshguard.app",
    agent_token="your-researcher-token",  # Each agent gets its own token
)

# Create a governed version of the search tool
class GovernedSerperTool(SerperDevTool):
    """Search tool with MeshGuard governance."""
    
    def _run(self, query: str) -> str:
        # Check permission before executing
        decision = mesh.check(
            action="read:web_search",
            context={"query": query}
        )
        
        if not decision.allowed:
            return f"Search blocked: {decision.reason}"
        
        # Proceed with the actual search
        return super()._run(query)

# Create the governed agent
researcher = Agent(
    role="Market Researcher",
    goal="Research market trends and competitor analysis",
    backstory="You're an expert market researcher with deep industry knowledge.",
    tools=[GovernedSerperTool()],
    verbose=True,
)

# Every search this agent makes is now:
# 1. Checked against MeshGuard policies
# 2. Logged for audit
# 3. Subject to rate limits, time restrictions, etc.
```

### The MeshGuard Tool Wrapper

For cleaner code, use MeshGuard's CrewAI integration:

```python
from meshguard.crewai import govern_tool, GovernedAgent

# Wrap any CrewAI tool
search_tool = govern_tool(
    tool=SerperDevTool(),
    action="read:web_search",
    client=mesh,
)

file_tool = govern_tool(
    tool=FileReadTool(),
    action="read:local_files",
    client=mesh,
)

# Or create a fully governed agent
researcher = GovernedAgent(
    client=mesh,
    agent_token="researcher-token-here",
    
    # Standard CrewAI agent config
    role="Market Researcher",
    goal="Research market trends",
    backstory="Expert researcher...",
    tools=[search_tool, file_tool],
)
```

## Intermediate Integration: Governing Crews

The real power of MeshGuard emerges when governing entire crews with multiple agents.

### Setting Up a Governed Crew

```python
from crewai import Agent, Task, Crew, Process
from meshguard import MeshGuardClient
from meshguard.crewai import GovernedCrew, govern_tool
from crewai_tools import SerperDevTool, FileReadTool, FileWriterTool

# Initialize MeshGuard clients for each agent
# Each agent has its own identity and permission set
researcher_client = MeshGuardClient(agent_token="researcher-token")
writer_client = MeshGuardClient(agent_token="writer-token")
editor_client = MeshGuardClient(agent_token="editor-token")
publisher_client = MeshGuardClient(agent_token="publisher-token")

# Define governed agents with their specific tools
researcher = Agent(
    role="Content Researcher",
    goal="Research topics thoroughly and provide accurate information",
    backstory="Senior researcher with expertise in fact-checking",
    tools=[
        govern_tool(SerperDevTool(), "read:web_search", researcher_client),
    ],
    allow_delegation=True,  # Can delegate to other agents
)

writer = Agent(
    role="Content Writer",
    goal="Create engaging, well-structured content",
    backstory="Professional writer with journalism background",
    tools=[
        govern_tool(FileReadTool(), "read:content_drafts", writer_client),
        govern_tool(FileWriterTool(), "write:content_drafts", writer_client),
    ],
    allow_delegation=True,
)

editor = Agent(
    role="Content Editor",
    goal="Ensure content quality and accuracy",
    backstory="Experienced editor focused on clarity and precision",
    tools=[
        govern_tool(FileReadTool(), "read:content_drafts", editor_client),
        govern_tool(FileWriterTool(), "write:content_drafts", editor_client),
    ],
    allow_delegation=False,  # Cannot delegate
)

publisher = Agent(
    role="Content Publisher",
    goal="Publish approved content to production",
    backstory="Publishing specialist ensuring proper distribution",
    tools=[
        govern_tool(CMSPublishTool(), "write:cms_production", publisher_client),
    ],
    allow_delegation=False,  # Critical: cannot delegate publishing rights
)
```

### Defining Governed Tasks

```python
research_task = Task(
    description="""
    Research the topic: {topic}
    
    Gather at least 5 credible sources with key statistics and insights.
    Focus on recent developments (last 6 months).
    """,
    expected_output="Research brief with sources and key findings",
    agent=researcher,
)

writing_task = Task(
    description="""
    Write a comprehensive article based on the research provided.
    
    Structure:
    - Compelling headline
    - Executive summary (2-3 sentences)
    - Main content (1500-2000 words)
    - Conclusion with actionable insights
    """,
    expected_output="Complete article draft in markdown format",
    agent=writer,
    context=[research_task],  # Depends on research output
)

editing_task = Task(
    description="""
    Review and edit the article for:
    - Factual accuracy (cross-reference with research)
    - Grammar and clarity
    - Tone consistency
    - SEO optimization
    """,
    expected_output="Edited article ready for publication",
    agent=editor,
    context=[writing_task, research_task],
)

publish_task = Task(
    description="""
    Publish the approved article to the CMS.
    
    - Set appropriate categories and tags
    - Schedule for optimal posting time
    - Verify publication success
    """,
    expected_output="Confirmation of successful publication with URL",
    agent=publisher,
    context=[editing_task],
)
```

### Creating the Governed Crew

```python
# Create the crew with MeshGuard governance
content_crew = GovernedCrew(
    # MeshGuard configuration
    gateway_url="https://dashboard.meshguard.app",
    crew_token="content-crew-token",  # Crew-level identity
    
    # Enable permission ceiling
    enforce_permission_ceiling=True,
    
    # Standard CrewAI configuration
    agents=[researcher, writer, editor, publisher],
    tasks=[research_task, writing_task, editing_task, publish_task],
    process=Process.sequential,
    verbose=True,
)

# Execute the crew
result = content_crew.kickoff(inputs={"topic": "AI Governance in 2025"})
```

### What Happens During Execution

With `GovernedCrew`, every action is governed:

1. **Task Start**: MeshGuard logs task initiation with agent identity
2. **Tool Usage**: Each tool invocation is checked against policies
3. **Delegation**: If an agent delegates, the permission ceiling applies
4. **Task Completion**: Results are logged with full context

```
┌────────────────────────────────────────────────────────────────┐
│ MeshGuard Audit Log: Content Crew Execution                    │
├────────────────────────────────────────────────────────────────┤
│ 14:23:01 | researcher | read:web_search | ALLOWED              │
│ 14:23:03 | researcher | read:web_search | ALLOWED              │
│ 14:23:05 | researcher | read:web_search | ALLOWED              │
│ 14:23:07 | researcher → writer | DELEGATION | ALLOWED          │
│ 14:23:08 | writer     | read:content_drafts | ALLOWED          │
│ 14:23:15 | writer     | write:content_drafts | ALLOWED         │
│ 14:23:17 | writer → publisher | DELEGATION | DENIED            │
│          |            | Reason: writer lacks write:cms_production│
│ 14:23:18 | editor     | read:content_drafts | ALLOWED          │
│ 14:23:25 | editor     | write:content_drafts | ALLOWED         │
│ 14:23:27 | publisher  | write:cms_production | ALLOWED         │
│ 14:23:28 | CREW COMPLETE | Duration: 27s | Actions: 11         │
└────────────────────────────────────────────────────────────────┘
```

Notice how the writer's attempt to delegate directly to the publisher was **denied** — the writer doesn't have `write:cms_production` permission, so it can't delegate that action.

## Advanced Integration: Hierarchical Crews

CrewAI's hierarchical process introduces a manager agent that coordinates all others. This is powerful but requires careful security consideration.

### The Hierarchical Security Challenge

```python
# Standard hierarchical crew — security risk!
crew = Crew(
    agents=[researcher, analyst, executor],
    tasks=[research_task, analysis_task, execution_task],
    process=Process.hierarchical,
    manager_llm="gpt-4o",  # Manager can instruct ANY agent
)
```

In this setup, the manager has implicit control over all agents. A prompt injection targeting the manager could:

- Instruct the executor to take unintended actions
- Bypass the sequential workflow entirely
- Access any tool any agent has

### Securing Hierarchical Crews with MeshGuard

```python
from meshguard.crewai import GovernedCrew, GovernedManagerAgent

# Create a governed manager with explicit permissions
governed_manager = GovernedManagerAgent(
    client=MeshGuardClient(agent_token="manager-token"),
    llm="gpt-4o",
    
    # Manager's permission ceiling
    # The manager can only instruct agents to do things
    # that the manager itself is allowed to do
    permissions=[
        "read:web_search",
        "read:internal_docs",
        "write:analysis_reports",
        # Note: NO write:production permission!
    ],
)

# Create the hierarchical governed crew
crew = GovernedCrew(
    gateway_url="https://dashboard.meshguard.app",
    crew_token="analysis-crew-token",
    enforce_permission_ceiling=True,
    
    agents=[researcher, analyst, executor],
    tasks=[research_task, analysis_task, execution_task],
    process=Process.hierarchical,
    manager_agent=governed_manager,  # Use governed manager
)
```

Now, even if the manager is compromised:

- It cannot instruct the executor to write to production (manager lacks permission)
- Each agent's actions are still logged individually
- The permission ceiling prevents privilege escalation

### Custom Manager Delegation Policies

For fine-grained control, define delegation policies in MeshGuard:

```yaml
# Policy: analysis-crew-manager
name: analysis-crew-manager-policy
version: 1

agent_match:
  token: "manager-token"
  
rules:
  # Manager can delegate research tasks
  - action: "delegate:research"
    effect: allow
    conditions:
      - "target.agent_role == 'researcher'"
    
  # Manager can delegate analysis to verified analysts only
  - action: "delegate:analysis"
    effect: allow
    conditions:
      - "target.agent_role == 'analyst'"
      - "target.trust_tier >= 'verified'"
    
  # Manager CANNOT delegate execution without human approval
  - action: "delegate:execution"
    effect: deny
    reason: "Execution tasks require human approval via escalation queue"
    
  # Manager cannot delegate at all during off-hours
  - action: "delegate:*"
    effect: deny
    conditions:
      - "time.hour < 6 OR time.hour > 22"
    reason: "Delegation disabled outside business hours"
```

## Governing CrewAI Flows

CrewAI Flows enable complex, event-driven workflows. MeshGuard integrates seamlessly:

```python
from crewai.flow.flow import Flow, listen, start
from meshguard import MeshGuardClient
from meshguard.crewai import governed_flow_method

mesh = MeshGuardClient(agent_token="flow-orchestrator-token")

class GovernedContentFlow(Flow):
    """A content creation flow with MeshGuard governance."""
    
    @start()
    @governed_flow_method(mesh, action="flow:start_content_creation")
    def begin_research(self):
        """Initialize the content creation flow."""
        # MeshGuard checks if this flow can start
        research_crew = create_research_crew()
        result = research_crew.kickoff(inputs={"topic": self.state["topic"]})
        self.state["research"] = result.raw
        return result
    
    @listen(begin_research)
    @governed_flow_method(mesh, action="flow:content_generation")
    def generate_content(self, research_output):
        """Generate content based on research."""
        writing_crew = create_writing_crew()
        result = writing_crew.kickoff(inputs={
            "research": research_output,
            "style": self.state.get("style", "professional"),
        })
        self.state["draft"] = result.raw
        return result
    
    @listen(generate_content)
    @governed_flow_method(mesh, action="flow:review_and_publish")
    def review_and_publish(self, draft):
        """Review and publish the content."""
        # This method requires elevated permissions
        publishing_crew = create_publishing_crew()
        result = publishing_crew.kickoff(inputs={"draft": draft})
        return result

# Execute the governed flow
flow = GovernedContentFlow()
result = flow.kickoff(inputs={"topic": "Multi-Agent Security"})
```

### Flow-Level Policies

Control entire flows with MeshGuard policies:

```yaml
# Policy: content-flow
name: content-flow-policy
version: 1

agent_match:
  tags: ["content-flow"]
  
rules:
  # Anyone can start content creation
  - action: "flow:start_content_creation"
    effect: allow
    
  # Content generation requires verified status
  - action: "flow:content_generation"
    effect: allow
    conditions:
      - "agent.trust_tier >= 'verified'"
    
  # Publishing requires privileged status AND business hours
  - action: "flow:review_and_publish"
    effect: allow
    conditions:
      - "agent.trust_tier == 'privileged'"
      - "time.hour >= 9 AND time.hour <= 18"
    
  # Rate limit flow executions
  - action: "flow:*"
    effect: allow
    rate_limit:
      max: 10
      window: "1h"
```

## Comparison: CrewAI Without vs. With MeshGuard

| Capability | CrewAI Alone | CrewAI + MeshGuard |
|------------|--------------|---------------------|
| **Agent Delegation** | Binary (allow/deny) | Granular per-agent delegation rules |
| **Permission Boundaries** | None | Permission ceiling on delegation chains |
| **Tool Access Control** | Per-agent assignment | Centralized policies + runtime checks |
| **Audit Trail** | Verbose logging (local) | Unified audit log with delegation chains |
| **Trust Tiers** | Not supported | Verified → Trusted → Privileged progression |
| **Hierarchical Manager Control** | Full control over all agents | Manager bounded by its own permissions |
| **Cross-Crew Policies** | Manual implementation | Declarative YAML across all crews |
| **Rate Limiting** | `max_rpm` per agent | System-wide rate limits with policies |
| **Time-Based Access** | Not supported | Conditional policies (business hours, etc.) |
| **Compliance Reporting** | Manual log aggregation | Built-in audit exports and dashboards |
| **Prompt Injection Defense** | Task guardrails | Multi-layer: tool + task + delegation |
| **Human Escalation** | `human_input` on tasks | Policy-driven escalation to approval queues |

### Security Posture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                     SECURITY POSTURE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   CrewAI Alone                   CrewAI + MeshGuard            │
│   ─────────────                  ─────────────────              │
│                                                                 │
│   [Agent A]───────┐              [Agent A]───────┐              │
│       │           │                  │           │              │
│       │ delegate  │                  │ governed  │              │
│       ▼           │                  ▼ delegation│              │
│   [Agent B]       │              [Agent B]       │              │
│       │           │                  │           │              │
│       │ tools     │                  │ governed  │              │
│       ▼           │                  ▼ tools     │              │
│   [Database]      │              [Database]      │              │
│   [API]           │              [API]           │              │
│   [FileSystem]    │              [FileSystem]    │              │
│                   │                              │              │
│   ⚠️  No central  │              ✅ MeshGuard    │              │
│      control or   │                 Policy       │              │
│      audit        │                 Engine       │              │
│                   │                    │         │              │
│                   │                    ▼         │              │
│                   │              ✅ Unified      │              │
│                   │                 Audit Log    │              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Real-World Example: Governed Customer Service Crew

Let's build a complete customer service crew with proper security governance:

```python
from crewai import Agent, Task, Crew, Process
from crewai_tools import SerperDevTool
from meshguard import MeshGuardClient
from meshguard.crewai import GovernedCrew, govern_tool
from pydantic import BaseModel
from typing import Optional

# Custom tools for customer service
class CustomerLookupTool:
    name = "customer_lookup"
    description = "Look up customer information by email or ID"
    
    def _run(self, identifier: str) -> str:
        # Implementation here
        return customer_db.lookup(identifier)

class OrderHistoryTool:
    name = "order_history"
    description = "Get order history for a customer"
    
    def _run(self, customer_id: str) -> str:
        return orders_db.get_history(customer_id)

class RefundProcessorTool:
    name = "process_refund"
    description = "Process a refund for an order"
    
    def _run(self, order_id: str, amount: float, reason: str) -> str:
        return payments.refund(order_id, amount, reason)

class TicketEscalatorTool:
    name = "escalate_ticket"
    description = "Escalate a support ticket to human agents"
    
    def _run(self, ticket_id: str, reason: str, priority: str) -> str:
        return ticketing.escalate(ticket_id, reason, priority)

# Initialize MeshGuard clients with appropriate trust tiers
tier1_client = MeshGuardClient(agent_token="tier1-support-token")  # Basic
tier2_client = MeshGuardClient(agent_token="tier2-support-token")  # Verified
tier3_client = MeshGuardClient(agent_token="tier3-support-token")  # Privileged

# Define agents with governed tools
inquiry_handler = Agent(
    role="Customer Inquiry Handler",
    goal="Understand customer inquiries and gather relevant information",
    backstory="""You're the first point of contact for customer inquiries.
    You gather information and route requests appropriately.""",
    tools=[
        govern_tool(CustomerLookupTool(), "read:customer_data", tier1_client),
        govern_tool(OrderHistoryTool(), "read:order_history", tier1_client),
    ],
    allow_delegation=True,  # Can delegate to specialists
)

resolution_specialist = Agent(
    role="Resolution Specialist",
    goal="Resolve customer issues efficiently and satisfactorily",
    backstory="""You're an experienced support specialist who can handle
    most customer issues, including processing refunds within limits.""",
    tools=[
        govern_tool(CustomerLookupTool(), "read:customer_data", tier2_client),
        govern_tool(OrderHistoryTool(), "read:order_history", tier2_client),
        govern_tool(RefundProcessorTool(), "write:refunds", tier2_client),
    ],
    allow_delegation=True,
)

escalation_manager = Agent(
    role="Escalation Manager",
    goal="Handle complex cases and escalate to humans when needed",
    backstory="""You're a senior support manager who handles edge cases
    and ensures proper escalation of issues that need human attention.""",
    tools=[
        govern_tool(CustomerLookupTool(), "read:customer_data", tier3_client),
        govern_tool(RefundProcessorTool(), "write:refunds", tier3_client),
        govern_tool(TicketEscalatorTool(), "write:escalation", tier3_client),
    ],
    allow_delegation=False,  # End of the chain
)

# Define tasks
inquiry_task = Task(
    description="""
    Handle the following customer inquiry:
    {customer_inquiry}
    
    Steps:
    1. Look up the customer's information
    2. Review their recent order history
    3. Understand the nature of their request
    4. Determine if this can be resolved at your level
    
    If the issue requires refunds or complex resolution, prepare
    a summary for the Resolution Specialist.
    """,
    expected_output="Customer context summary and recommended action",
    agent=inquiry_handler,
)

resolution_task = Task(
    description="""
    Based on the inquiry analysis, resolve the customer's issue.
    
    You can:
    - Process refunds up to $100 without escalation
    - Provide order status updates
    - Answer policy questions
    
    If the refund exceeds $100 or the case is complex,
    prepare a summary for the Escalation Manager.
    """,
    expected_output="Resolution outcome or escalation request",
    agent=resolution_specialist,
    context=[inquiry_task],
)

escalation_task = Task(
    description="""
    Review escalated cases and take appropriate action.
    
    You can:
    - Process any refund amount
    - Create escalation tickets for human review
    - Make policy exceptions when warranted
    
    Always document your reasoning for audit purposes.
    """,
    expected_output="Final resolution with documentation",
    agent=escalation_manager,
    context=[inquiry_task, resolution_task],
)

# Create the governed crew
support_crew = GovernedCrew(
    gateway_url="https://dashboard.meshguard.app",
    crew_token="customer-support-crew",
    enforce_permission_ceiling=True,
    
    agents=[inquiry_handler, resolution_specialist, escalation_manager],
    tasks=[inquiry_task, resolution_task, escalation_task],
    process=Process.sequential,
    verbose=True,
)

# Execute
result = support_crew.kickoff(inputs={
    "customer_inquiry": """
    Hi, I ordered a laptop (Order #12345) two weeks ago and it arrived
    with a cracked screen. I need a full refund of $1,299. This is
    unacceptable and I want this resolved immediately.
    """
})
```

### Policy Configuration for the Support Crew

```yaml
# Policy: tier1-support
name: tier1-support-policy
version: 1
agent_match:
  token: "tier1-support-token"
  
rules:
  # Can read customer data and orders
  - action: "read:customer_data"
    effect: allow
  - action: "read:order_history"
    effect: allow
    
  # Cannot process refunds
  - action: "write:refunds"
    effect: deny
    reason: "Tier 1 agents cannot process refunds"
    
  # Can delegate to tier 2
  - action: "delegate:*"
    effect: allow
    conditions:
      - "target.trust_tier >= 'verified'"

---
# Policy: tier2-support  
name: tier2-support-policy
version: 1
agent_match:
  token: "tier2-support-token"
  
rules:
  - action: "read:*"
    effect: allow
    
  # Can process small refunds
  - action: "write:refunds"
    effect: allow
    conditions:
      - "request.context.amount <= 100"
    
  # Large refunds denied (delegate to tier 3)
  - action: "write:refunds"
    effect: deny
    conditions:
      - "request.context.amount > 100"
    reason: "Refunds over $100 require tier 3 approval"
    
  # Can delegate to tier 3
  - action: "delegate:*"
    effect: allow
    conditions:
      - "target.trust_tier == 'privileged'"

---
# Policy: tier3-support
name: tier3-support-policy  
version: 1
agent_match:
  token: "tier3-support-token"
  
rules:
  - action: "read:*"
    effect: allow
    
  # Can process any refund
  - action: "write:refunds"
    effect: allow
    
  # Can escalate to humans
  - action: "write:escalation"
    effect: allow
    
  # Cannot delegate (end of chain)
  - action: "delegate:*"
    effect: deny
    reason: "Tier 3 is the final authority for automated support"
```

## Best Practices for CrewAI + MeshGuard

### 1. Design Your Permission Hierarchy First

Before writing code, map out:
- What actions each agent needs
- Which agents can delegate to whom
- What the permission ceiling should be for each crew

```
┌──────────────────────────────────────────────┐
│ Permission Hierarchy: Content Team           │
├──────────────────────────────────────────────┤
│                                              │
│ Manager (ceiling for all)                    │
│ ├── read:web_search                          │
│ ├── read:internal_docs                       │
│ ├── write:drafts                             │
│ └── write:published (conditional)            │
│                                              │
│ Researcher                                   │
│ ├── read:web_search  ← within ceiling ✓     │
│ └── read:internal_docs ← within ceiling ✓   │
│                                              │
│ Writer                                       │
│ ├── read:internal_docs ← within ceiling ✓   │
│ └── write:drafts ← within ceiling ✓         │
│                                              │
│ Publisher                                    │
│ └── write:published ← requires approval     │
│                                              │
└──────────────────────────────────────────────┘
```

### 2. Use Descriptive Action Names

Make actions self-documenting for audit clarity:

```python
# ❌ Bad: Vague action names
govern_tool(tool, "do_thing", client)
govern_tool(tool, "access", client)

# ✅ Good: Clear, auditable action names
govern_tool(tool, "read:customer_pii", client)
govern_tool(tool, "write:refund_over_100", client)
govern_tool(tool, "delete:user_account", client)
```

### 3. Implement Graceful Denial Handling

Configure agents to handle denials gracefully:

```python
from meshguard.crewai import govern_tool, DenialHandler

def graceful_denial(decision, tool_name, *args, **kwargs):
    """Handle MeshGuard denials gracefully."""
    return f"""I apologize, but I'm unable to {tool_name} at this time.

Reason: {decision.reason}

This has been logged and a human team member will review your request. 
Typical response time is 2-4 business hours. 

Is there anything else I can help you with in the meantime?"""

governed_tool = govern_tool(
    tool=RefundProcessorTool(),
    action="write:refunds",
    client=mesh_client,
    on_deny=graceful_denial,
)
```

### 4. Monitor Delegation Chains

Set up alerts for unusual delegation patterns:

```python
# Query for delegation anomalies
audit = mesh.get_audit_log(
    actions=["delegate:*"],
    time_range="1h",
)

# Check for circular delegations
delegation_chains = {}
for entry in audit:
    source = entry.get("agent_id")
    target = entry.get("delegation_target")
    
    if source in delegation_chains.get(target, []):
        alert("Circular delegation detected", entry)
    
    delegation_chains.setdefault(source, []).append(target)

# Check for excessive delegations (possible attack)
delegation_counts = {}
for entry in audit:
    agent = entry.get("agent_id")
    delegation_counts[agent] = delegation_counts.get(agent, 0) + 1
    
    if delegation_counts[agent] > 20:
        alert(f"Excessive delegations from {agent}", entry)
```

### 5. Use Trust Tiers Appropriately

Assign trust tiers based on actual risk:

| Trust Tier | Use Case | Typical Agents |
|------------|----------|----------------|
| `untrusted` | New, unvetted agents | Experimental, user-created agents |
| `verified` | Standard production agents | Researchers, writers, analysts |
| `trusted` | Agents with elevated access | Payment processors, data modifiers |
| `privileged` | Critical operations | Publishers, deleters, admin actions |

```yaml
# Example tier assignment
agent_match:
  token: "payment-processor-token"
  trust_tier: "trusted"  # Elevated but not maximum
```

### 6. Test Your Permission Boundaries

Create test cases that verify your policies work:

```python
import pytest
from meshguard import MeshGuardClient
from meshguard.testing import MockMeshGuardClient, PolicyTestSuite

def test_tier1_cannot_refund():
    """Verify tier 1 agents cannot process refunds."""
    client = MockMeshGuardClient(
        agent_token="tier1-support-token",
        policies_path="./policies/tier1.yaml"
    )
    
    decision = client.check("write:refunds", context={"amount": 50})
    assert not decision.allowed
    assert "Tier 1 agents cannot process refunds" in decision.reason

def test_tier2_refund_limit():
    """Verify tier 2 agents have refund limits."""
    client = MockMeshGuardClient(
        agent_token="tier2-support-token",
        policies_path="./policies/tier2.yaml"
    )
    
    # Under limit should succeed
    decision = client.check("write:refunds", context={"amount": 50})
    assert decision.allowed
    
    # Over limit should fail
    decision = client.check("write:refunds", context={"amount": 150})
    assert not decision.allowed
    assert "over $100" in decision.reason.lower()

def test_delegation_ceiling():
    """Verify permission ceiling prevents escalation."""
    # Researcher with only read permissions
    researcher_client = MockMeshGuardClient(
        agent_token="researcher-token",
        permissions=["read:web_search", "read:docs"]
    )
    
    # Researcher tries to delegate write action
    decision = researcher_client.check(
        "delegate:write:cms",
        context={"target_agent": "writer-token"}
    )
    
    assert not decision.allowed
    assert "permission ceiling" in decision.reason.lower()
```

## Troubleshooting Common Issues

### Issue: Agents Stuck in Denial Loop

**Symptom:** Agent repeatedly tries an action and gets denied.

**Solution:** Add denial limits and fallback behavior:

```python
from meshguard.crewai import GovernedAgent

agent = GovernedAgent(
    client=mesh,
    max_denial_retries=2,  # Stop after 2 denials
    on_max_denials="escalate",  # Escalate to human
    # OR
    on_max_denials="skip",  # Skip the action
    # OR  
    on_max_denials="fail",  # Fail the task
)
```

### Issue: Delegation Chain Too Long

**Symptom:** Tasks taking too long due to excessive delegation.

**Solution:** Set maximum delegation depth:

```yaml
# Policy with delegation depth limit
rules:
  - action: "delegate:*"
    effect: allow
    conditions:
      - "delegation.depth < 3"  # Max 3 levels of delegation
    
  - action: "delegate:*"
    effect: deny
    conditions:
      - "delegation.depth >= 3"
    reason: "Maximum delegation depth reached. Complete the task or escalate to human."
```

### Issue: Manager Agent Overriding Policies

**Symptom:** Hierarchical manager seems to bypass security.

**Solution:** Ensure manager has its own governed identity:

```python
# Wrong: Manager uses default LLM without governance
crew = Crew(
    process=Process.hierarchical,
    manager_llm="gpt-4o",  # No governance!
)

# Right: Manager has governed identity
governed_manager = GovernedManagerAgent(
    client=MeshGuardClient(agent_token="manager-token"),
    llm="gpt-4o",
)

crew = GovernedCrew(
    process=Process.hierarchical,
    manager_agent=governed_manager,  # Governed!
)
```

## Next Steps

You now have a comprehensive understanding of how to secure CrewAI multi-agent systems with MeshGuard. Here's where to go next:

- **[Python SDK Reference](/integrations/python)** — Complete MeshGuard SDK documentation
- **[Policy Configuration Guide](/concepts/policies)** — Deep dive into policy syntax
- **[Trust Tiers Explained](/concepts/trust-tiers)** — Understanding agent trust levels  
- **[Audit & Compliance](/concepts/audit)** — Query and export audit logs
- **[LangChain Integration](/guides/governing-langchain-agents)** — Govern single-agent LangChain apps

## Summary

Multi-agent systems like CrewAI are incredibly powerful — but that power requires thoughtful security. The delegation capabilities that make CrewAI productive also create attack surfaces that traditional single-agent guardrails can't address.

MeshGuard fills this gap with:

- **Permission ceilings** that prevent delegation-based privilege escalation
- **Granular policies** that control who can do what, when, and to whom
- **Unified audit trails** that track actions across entire agent systems
- **Trust tiers** that formalize agent privilege levels

By integrating MeshGuard with your CrewAI crews, you get the productivity benefits of multi-agent collaboration with the security guarantees your organization needs.

---

::: tip Ready to Secure Your Agents?
Create your free MeshGuard account at **[meshguard.app](https://meshguard.app)** and start governing your CrewAI crews in minutes. No credit card required.
:::
