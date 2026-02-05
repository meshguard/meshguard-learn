# Governing LangChain Agents with MeshGuard

A comprehensive guide to adding enterprise-grade governance to your LangChain agents.

## Why Govern LangChain Agents?

LangChain makes it easy to build powerful AI agents. But with power comes risk:

- **Uncontrolled tool usage:** Agents can call any tool you give them
- **No audit trail:** Hard to know what an agent did and why
- **Privilege escalation:** Agents might take actions beyond their intended scope
- **Compliance gaps:** No way to prove your agent followed policy

MeshGuard addresses all of these by wrapping your agent's tools with governance controls.

## Prerequisites

- Python 3.9+
- LangChain installed
- A MeshGuard account ([sign up free](https://meshguard.app))

## Installation

```bash
pip install meshguard langchain langchain-openai
```

## Quick Start: Govern a Single Tool

The simplest integration — wrap one tool with MeshGuard:

```python
from langchain.tools import tool
from meshguard import MeshGuardClient

# Initialize MeshGuard
client = MeshGuardClient(
    gateway_url="https://dashboard.meshguard.app",
    agent_token="your-agent-token",  # From MeshGuard signup
)

@tool
def send_email(to: str, subject: str, body: str) -> str:
    """Send an email to a recipient."""
    # Check with MeshGuard before executing
    decision = client.check("write:email")
    if not decision.allowed:
        return f"Action blocked: {decision.reason}"
    
    # Proceed with the actual email send
    return email_service.send(to, subject, body)
```

That's it. Every time your agent tries to send an email, MeshGuard will:
1. Verify the agent is allowed to perform `write:email`
2. Log the action attempt for audit
3. Return allow/deny based on your policies

## Full Integration: Governed Tool Decorator

For cleaner code, use the `governed_tool` decorator:

```python
from langchain.tools import tool
from meshguard import MeshGuardClient
from meshguard.langchain import governed_tool

client = MeshGuardClient()

@governed_tool("read:database", client=client)
@tool
def query_database(sql: str) -> str:
    """Run a read-only database query."""
    return db.execute(sql)

@governed_tool("write:database", client=client)
@tool
def update_database(sql: str) -> str:
    """Run a write operation on the database."""
    return db.execute(sql)

@governed_tool("delete:records", client=client)
@tool
def delete_records(table: str, condition: str) -> str:
    """Delete records from a table."""
    return db.delete(table, condition)
```

Now your tools are automatically governed. If an agent lacks permission, the tool returns a denial message instead of executing.

## Governing Existing LangChain Tools

You can wrap tools you didn't write (like built-in LangChain tools):

```python
from langchain_community.tools import DuckDuckGoSearchRun
from meshguard import MeshGuardClient
from meshguard.langchain import GovernedTool

client = MeshGuardClient()

# Original LangChain tool
search_tool = DuckDuckGoSearchRun()

# Wrapped with governance
governed_search = GovernedTool(
    tool=search_tool,
    action="read:web_search",
    client=client,
)
```

## Building a Fully Governed Agent

Here's a complete example of a customer service agent with tiered permissions:

```python
from langchain_openai import ChatOpenAI
from langchain.agents import create_tool_calling_agent, AgentExecutor
from langchain_core.prompts import ChatPromptTemplate
from langchain.tools import tool
from meshguard import MeshGuardClient
from meshguard.langchain import governed_tool

# Initialize MeshGuard with your agent's token
client = MeshGuardClient(
    gateway_url="https://dashboard.meshguard.app",
    agent_token="cs-agent-token-here",
)

# Define governed tools
@governed_tool("read:customer", client=client)
@tool
def lookup_customer(email: str) -> str:
    """Look up a customer by their email address."""
    customer = crm.get_by_email(email)
    return f"Customer: {customer.name}, Status: {customer.status}"

@governed_tool("read:orders", client=client)
@tool
def get_order_history(customer_id: str) -> str:
    """Get order history for a customer."""
    orders = orders_db.get_by_customer(customer_id)
    return f"Found {len(orders)} orders: {orders}"

@governed_tool("write:refund", client=client)
@tool
def process_refund(order_id: str, amount: float, reason: str) -> str:
    """Process a refund for an order. Requires elevated permissions."""
    result = payments.refund(order_id, amount, reason)
    return f"Refund processed: ${amount} for order {order_id}"

@governed_tool("write:email", client=client)
@tool  
def send_customer_email(to: str, subject: str, body: str) -> str:
    """Send an email to a customer."""
    email_service.send(to, subject, body)
    return f"Email sent to {to}"

# Create the agent
llm = ChatOpenAI(model="gpt-4o")
tools = [lookup_customer, get_order_history, process_refund, send_customer_email]

prompt = ChatPromptTemplate.from_messages([
    ("system", """You are a customer service agent for Acme Corp.
    
Your capabilities are governed by enterprise policy. If an action is blocked, 
apologize to the customer and explain that you need to escalate to a human agent.

Always be helpful, professional, and transparent about your limitations."""),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])

agent = create_tool_calling_agent(llm, tools, prompt)
executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

# Run the agent
result = executor.invoke({
    "input": "I need a refund for order #12345, the product was damaged."
})
```

## Policy Configuration

In the MeshGuard dashboard, create policies for your agent:

```yaml
# Policy for customer-service-agent (trust tier: verified)
name: customer-service-policy
version: 1
agent_match:
  tags: ["customer-service"]
  
rules:
  # Can freely look up customers and orders
  - action: "read:customer"
    effect: allow
    
  - action: "read:orders"
    effect: allow
    
  # Can send emails during business hours
  - action: "write:email"
    effect: allow
    conditions:
      - "time.hour >= 9 AND time.hour <= 18"
    
  # Refunds under $50 are auto-approved
  - action: "write:refund"
    effect: allow
    conditions:
      - "request.amount <= 50"
    
  # Larger refunds are denied (escalate to human)
  - action: "write:refund"
    effect: deny
    conditions:
      - "request.amount > 50"
    reason: "Refunds over $50 require human approval"
```

## Handling Denied Actions Gracefully

When MeshGuard denies an action, you want the agent to handle it gracefully:

```python
from meshguard.exceptions import PolicyDeniedError

def denial_handler(error: PolicyDeniedError, *args, **kwargs):
    """Custom handler when an action is denied."""
    return f"""I apologize, but I'm unable to complete that action.

Reason: {error.reason}

I've logged this request for a human agent to review. They'll follow up 
with you within 24 hours. Is there anything else I can help with?"""

@governed_tool(
    "write:refund", 
    client=client,
    on_deny=denial_handler,  # Custom denial message
)
@tool
def process_refund(order_id: str, amount: float) -> str:
    """Process a refund."""
    return payments.refund(order_id, amount)
```

## Audit Trail and Compliance

Every governed action is logged. Query the audit log for compliance:

```python
# Get recent actions by this agent
audit_log = client.get_audit_log(
    limit=100,
    actions=["write:refund", "write:email"],
)

for entry in audit_log:
    print(f"""
    Timestamp: {entry['timestamp']}
    Action: {entry['action']}
    Decision: {entry['decision']}
    Agent: {entry['agent_id']}
    """)
```

Export for compliance reports:

```python
import json

# Export as JSON for compliance
with open("agent_audit_log.json", "w") as f:
    json.dump(audit_log, f, indent=2)
```

## Comparing MeshGuard to LangChain's Built-in Guardrails

LangChain has its own guardrails (PII detection, human-in-the-loop). How do they compare?

| Feature | LangChain Guardrails | MeshGuard |
|---------|---------------------|-----------|
| PII Detection | ✅ Built-in middleware | ✅ Can implement via policies |
| Human-in-the-loop | ✅ Interrupt + resume | ✅ Deny action → escalate |
| Custom Policies | 🟡 Via custom middleware | ✅ Declarative YAML |
| Multi-Agent Governance | ❌ No native support | ✅ Agent identity + delegation |
| Centralized Audit | ❌ Logs per agent | ✅ Unified audit log |
| Trust Tiers | ❌ Not supported | ✅ Built-in (verified/trusted/privileged) |
| Cross-Framework | ❌ LangChain only | ✅ LangChain, CrewAI, AutoGPT, custom |

**Use LangChain Guardrails for:** Simple PII filtering, basic content moderation within a single agent.

**Use MeshGuard for:** Enterprise governance, multi-agent systems, compliance requirements, centralized policy management.

**Use Both:** LangChain guardrails for content filtering + MeshGuard for action governance.

## Best Practices

### 1. Principle of Least Privilege
Start with minimal permissions and expand as needed:

```yaml
# Start restrictive
rules:
  - action: "*"
    effect: deny
    
  - action: "read:*"
    effect: allow
```

### 2. Use Meaningful Action Names
Make actions descriptive for audit clarity:

```python
# ❌ Bad: Too vague
@governed_tool("do_thing", client=client)

# ✅ Good: Clear and auditable  
@governed_tool("write:customer_refund", client=client)
```

### 3. Add Context to Denials
Help the agent (and users) understand why actions fail:

```yaml
- action: "delete:*"
  effect: deny
  reason: "Agents cannot delete data. Contact support for data deletion requests."
```

### 4. Monitor Your Audit Log
Set up alerts for unusual patterns:

```python
# Check for repeated denials (possible misconfiguration or attack)
denied_actions = [e for e in audit_log if e['decision'] == 'deny']
if len(denied_actions) > 10:
    alert_ops_team("High denial rate detected")
```

## Next Steps

- [Python SDK Reference](/integrations/python) — Full MeshGuard SDK documentation
- [Policy Configuration](/concepts/policies) — Deep dive into policy syntax
- [CrewAI Integration](/guides/securing-crewai) — Govern multi-agent systems
- [Trust Tiers Explained](/concepts/trust-tiers) — Understanding agent trust levels

---

::: tip Get Started
Create your free MeshGuard account at [meshguard.app](https://meshguard.app) and govern your first LangChain agent in minutes.
:::
