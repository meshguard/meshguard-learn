# MeshGuard vs Descope

Understanding the difference between **Agent Governance** and **Agentic Identity**.

## The Core Difference

The most important distinction is what each platform is built to do. They operate on different, though related, problems in the AI agent ecosystem.

- **MeshGuard is for AI Agent Governance.** It focuses on what an AI agent is *allowed to do*. Its primary job is to enforce policies on an agent's actions in real-time.

- **Descope is for Human & Agentic Identity.** It focuses on *who* a user or agent is. Its primary job is to authenticate identity and control access to services.

## Analogy: Securing a Corporate Office

To understand the difference, imagine both tools are securing a high-tech office building.

### Descope: The ID Badge System

Descope provides the high-tech ID card printer and the scanner at the front door. It creates a secure, verifiable ID card for every employee and every autonomous delivery drone (agent). The scanner's job is to ensure no one enters with a fake ID.

**It controls access to the building.**

### MeshGuard: The Internal Rulebook & Chaperones

MeshGuard is the set of rules and the security guards *inside* the building. We don't issue the ID, but we read it. Then, we enforce rules like:

- "Delivery drones are only allowed in the mailroom."
- "They cannot enter the server room."
- "They can only make 3 trips per hour."

**It controls the actions within the building.**

## Feature Comparison

| Aspect | Descope (Identity-First) | MeshGuard (Governance-First) |
|--------|--------------------------|------------------------------|
| **Primary Goal** | **Authenticate** the agent. Prove it is who it claims to be. | **Authorize** the agent's specific actions. |
| **Point of Intervention** | At the network edge, when an agent requests access to a service. | Inside the agent's code, by wrapping the tools it uses. |
| **Core Value Prop** | "Don't let imposter agents access your tools." | "Don't let your legitimate agents misuse their tools." |
| **Example Use Case** | An agent gets a Descope token and presents it to an API gateway. The gateway validates the token before allowing any request through. | An agent tries to call `gdocs.delete_document()`. MeshGuard intercepts the call, checks a policy, and decides whether to permit the action. |

## Technical Architecture

### Descope's Approach

```
Agent → Gets JWT Token → Presents to API Gateway → Service
                              ↓
                    Token Validated (Is this really agent-42?)
```

Descope's question: *"Is this really the 'research-agent-42' from 'acme-corp', and is it allowed to talk to the Google Docs API at all?"*

### MeshGuard's Approach

```
Agent → Calls Tool → MeshGuard SDK Intercepts → Policy Check → Allow/Deny
                                                      ↓
                                          What specific action? Permitted?
```

MeshGuard's question: *"I know this is 'research-agent-42'. It wants to call `gdocs.delete_document(id='important_doc')`. Based on its policies, should I allow this specific action?"*

## Conclusion: Complementary, Not Competitive

For a truly robust system, you can use **both**.

1. **Descope** establishes the agent's identity at the network level
2. **MeshGuard** provides fine-grained control over the agent's actions within your application

They solve two different, but equally important, parts of the agent security puzzle.

---

::: tip Ready to govern your agents?
[Try MeshGuard →](https://meshguard.app)
:::
