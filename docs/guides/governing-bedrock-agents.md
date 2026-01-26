---
title: Governing Amazon Bedrock Agents with MeshGuard
description: Learn why content filtering isn't enough and how to implement true, identity-aware governance for enterprise Bedrock agents.
---

# Governing Amazon Bedrock Agents with MeshGuard

Amazon Bedrock Agents are a powerful tool for automating complex tasks and building sophisticated conversational interfaces. Combined with Bedrock Guardrails, you get a solid foundation for content safety, preventing your models from generating harmful, toxic, or off-topic responses.

But for the enterprise, content safety is just one piece of the governance puzzle.

Real-world business processes require more than just filtering inputs and outputs. They demand robust, identity-aware access control. Who is allowed to query the finance database? Can a marketing agent approve a refund? Can a junior analyst access PII?

This is where MeshGuard comes in. It complements Bedrock Guardrails by providing the critical layer of authorization and audit needed to deploy agents safely in a complex enterprise environment. This guide will walk you through why this is so important and how to achieve it.

## The Limits of Content Filtering

Imagine you've built a Bedrock Agent for your customer support team. Its purpose is to look up customer orders and process refunds. You've configured Bedrock Guardrails to:
- **Filter PII:** It redacts social security numbers and credit card details.
- **Deny Topics:** It blocks conversations about inappropriate subjects.
- **Block Harmful Content:** It prevents toxic or hateful language.

This is a great start. Your agent won't leak sensitive data in its responses and will communicate professionally.

But now, consider these questions:
1.  **Who is using the agent?** Is it a senior support lead or a newly hired trainee?
2.  **What if the user asks, "Please refund the last 5 transactions for customer ACME Corp?"** The request itself contains no toxic language or PII. Bedrock Guardrails would likely allow it to pass.
3.  **What if a different agent, say one for marketing analytics, is compromised and attempts to call the `process_refund` tool?**

Bedrock Guardrails, by design, focus on the *content* of the conversation. They don't have a concept of **agent identity** or **user permissions**. They can't distinguish between a legitimate request from an authorized user and a malicious one from an unauthorized source.

This is the governance gap that MeshGuard is designed to fill.

## True Governance: Identity, Capabilities, and Audit

True enterprise governance for AI agents is built on three pillars: Agent Identity, Capability Surfaces, and a Unified Audit Trail.

### 1. Agent Identity: Knowing *Who* is Asking

Before you can decide to allow or deny an action, you must know who is requesting it. MeshGuard brings strong, verifiable identity to your agents.

In our customer support scenario, you need to pass the user's identity into the Bedrock session when you invoke the agent.

```python
# When a user interacts with your app, invoke the agent with their ID
response = bedrock_agent_runtime.invoke_agent(
    agentId='...',
    sessionId='...',
    sessionState={
        'sessionAttributes': {
            'userId': 'sarah.j@example-corp.com', # The logged-in user
            'userRole': 'support_lead'
        }
    },
    inputText='Process a $50 refund for order #12345.'
)
```

Your action group's Lambda function then uses this identity in its check with MeshGuard.

```python
# Inside the Lambda handler for the "process_refund" action
user_id = event.get('sessionAttributes', {}).get('userId', 'anonymous')
user_role = event.get('sessionAttributes', {}).get('userRole', 'guest')

check_result = meshguard_client.check(
    "billing:process_refund",
    context={
        "user": user_id,
        "role": user_role,
        "amount_usd": 50,
        "order_id": "12345"
    }
)

if not check_result.get('allow'):
    return {"status": "DENIED", "reason": "User does not have permission for refunds."}
```
Now, you can write a MeshGuard policy that grants permissions based on identity:

```yaml
# policies/refunds.yaml
policies:
  - id: "allow-refunds-for-support-leads"
    description: "Allow support leads to process refunds up to $100."
    effect: "allow"
    principals:
      - "role:support_lead"
    actions:
      - "billing:process_refund"
    conditions:
      - "context.amount_usd <= 100"
```
With this policy, Sarah the support lead can process the refund, but a trainee with the `support_trainee` role would be denied. This is identity-aware governance that content filters alone cannot provide.

### 2. Capability Surfaces: Controlling *What* an Agent Can Do

An agent's "capability surface" is the set of all actions it is authorized to perform. Without explicit controls, this surface can be dangerously large. MeshGuard allows you to define and enforce these boundaries.

For example, you might have two agents:
- **Finance Agent:** Needs to query financial databases and generate reports.
- **Marketing Agent:** Needs to access social media APIs and query campaign data.

You would create separate MeshGuard agent tokens for each. Then, you can write policies that restrict actions to a specific agent, preventing a compromised marketing agent from ever accessing financial data.

```yaml
# policies/finance-db.yaml
policies:
  - id: "allow-finance-agent-to-query-db"
    effect: "allow"
    # The principal is the MeshGuard agent identity, not the end user
    principals:
      - "agent:bedrock-finance-agent-prod" 
    actions:
      - "db:query:financials"
```

### 3. Unified Audit Trail: A Single Source of Truth

Bedrock provides logs through CloudWatch, but these are service-specific. When agents start interacting with dozens of different tools and APIs, you need a single, centralized place to see every governance decision.

Every `meshguard.check()` call creates a detailed, immutable audit record in the MeshGuard log. This log answers critical questions for security and compliance:
- Who requested the action? (User `sarah.j`)
- What action was requested? (`billing:process_refund`)
- Was it allowed or denied? (`allow`)
- Which policy made the decision? (`allow-refunds-for-support-leads`)
- What was the full context? (`{"amount_usd": 50, ...}`)

This unified view is indispensable for security reviews, incident response, and regulatory compliance.

## Complementary, Not Competitive

Bedrock Guardrails and MeshGuard are powerful complements. Use them together for comprehensive, defense-in-depth governance:
- **Bedrock Guardrails** act as the first line of defense, ensuring the *content* of the conversation is safe and appropriate.
- **MeshGuard** acts as the second, more critical line of defense, ensuring the *actions* resulting from the conversation are authorized and audited.

By combining both, you can build Bedrock agents that are not only intelligent and helpful but also secure, compliant, and ready for the enterprise.
