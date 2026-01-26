---
title: MeshGuard vs. Amazon Bedrock Guardrails
description: Understand the differences between MeshGuard and Bedrock Guardrails and how to use them together for comprehensive AI governance.
---

# MeshGuard vs. Amazon Bedrock Guardrails

When deploying generative AI solutions like Amazon Bedrock Agents, governance is a primary concern. Both MeshGuard and Amazon Bedrock Guardrails offer control mechanisms, but they operate at different levels and solve fundamentally different problems.

Understanding their distinct roles is key to building a robust, secure, and compliant AI architecture. This page compares the two and explains how they work best together.

## At a Glance: Feature Comparison

| Feature | Amazon Bedrock Guardrails | MeshGuard |
|---|---|---|
| **Primary Purpose** | **Content Safety & Filtering** | **Access Control & Authorization** |
| **Identity Aware** | No (Anonymous evaluation) | Yes (Principal-based policies) |
| **Core Function** | Filters prompts and responses for harmful content, PII, and denied topics. | Evaluates if a specific principal (user, group, or agent) can perform an action. |
| **Policy Language** | Natural language topic definitions, PII entity selection, regex filters. | Declarative YAML policies (principals, actions, resources, context-based conditions). |
| **Delegation Control** | Not supported. | Yes (Manages trust between agents and users in a delegation chain). |
| **Capability Management** | Not supported. | Yes (Defines and enforces the "capability surface" of an AI agent). |
| **Cross-Platform** | No (Specific to Amazon Bedrock) | Yes (Governs any tool, API, or service, regardless of platform). |
| **Audit Trail** | AWS CloudWatch Logs for invocation and filtering events. | Centralized, immutable audit log of every authorization decision (allow/deny). |
| **Use Case** | Preventing toxic output, redacting sensitive data, enforcing brand voice. | Controlling access to databases, APIs, and business workflows (e.g., "Can this user approve a payment?"). |

## When to Use Bedrock Guardrails

Bedrock Guardrails excel at **content management**. You should use Bedrock Guardrails when you need to:

- **Enforce Content Policies:** Automatically block harmful or inappropriate language in both user inputs (prompts) and model outputs (responses).
- **Prevent Data Leakage in Responses:** Identify and redact Personally Identifiable Information (PII) like names, credit card numbers, or social security numbers from the agent's final response.
- **Keep Conversations On-Topic:** Define denied topics to prevent the agent from engaging in discussions that are irrelevant or prohibited for your use case.
- **Filter Profanity and Custom Word Lists:** Maintain a professional and brand-safe tone in all interactions.

In short, Bedrock Guardrails ensure the *conversation itself* is safe and appropriate.

## When to Use MeshGuard

MeshGuard provides **identity-aware access control for actions**. You need MeshGuard when you have to answer questions like:

- **"Is this user allowed to do this?"** MeshGuard connects the agent's actions to a specific user identity and enforces policies based on that identity's permissions.
- **"Can this agent perform this specific database query?"** It allows you to define fine-grained permissions for the tools and APIs your agent can access, down to the level of specific API calls or database rows.
- **"Can Agent A delegate a task to Agent B?"** It manages trust and delegation, ensuring that permissions are passed securely and audibly in multi-agent workflows.
- **"Who approved the $10,000 transaction?"** MeshGuard provides a unified, human-readable audit trail of every single authorization decision, which is critical for compliance and security.

MeshGuard governs the *consequences* of the conversation—the actions the agent takes in your systems.

## Using Them Together: A Complete Governance Strategy

Bedrock Guardrails and MeshGuard are not competitors; they are complementary layers in a defense-in-depth security model for AI.

Here’s how they work together in a typical request flow:

1.  **User sends a prompt:** `User -> Bedrock Agent`
    > "Hi, I'm Sarah. Please process a $50 refund for order #12345."

2.  **Bedrock Guardrail (Prompt):** The Guardrail inspects the incoming prompt. It finds no harmful content or denied topics. The prompt is allowed to proceed.

3.  **Bedrock Agent invokes Action Group:** The agent determines that this requires the `process_refund` function and invokes the associated Lambda function. The user's identity (`sarah`) is passed in the session state.

4.  **MeshGuard enforces access control:** Inside the Lambda function, before any action is taken, a call is made to MeshGuard.
    - `meshguard.check("billing:process_refund", context={"user": "sarah", "amount": 50})`
    - MeshGuard evaluates its policies. It finds a policy stating that "Sarah" is a `support_lead` and is authorized to issue refunds up to $100.
    - MeshGuard returns `{"allow": true}`. The Lambda function proceeds to call the billing API.

5.  **Bedrock Agent generates a response:** The action is successful. The agent formulates a response.
    > "Your $50 refund for order #12345 has been processed successfully."

6.  **Bedrock Guardrail (Response):** The Guardrail inspects the outgoing response. It checks for any accidental inclusion of PII or harmful content. Finding none, it allows the response to be sent to the user.

7.  **Audit Logs:**
    - An audit event for the successful content filter is logged in **CloudWatch**.
    - A detailed authorization decision (`allow`, `sarah`, `billing:process_refund`) is logged in **MeshGuard**.

By combining both, you achieve end-to-end governance: the conversation is safe, the resulting action is authorized, and the entire flow is auditable.
