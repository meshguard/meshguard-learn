# MeshGuard vs Azure AI Content Safety

A comprehensive comparison of **MeshGuard** and **Azure AI Content Safety** for AI application safety.

## Executive Summary

**Azure AI Content Safety** is Microsoft's cloud service for detecting harmful content in text and images. It excels at content moderation: identifying hate speech, violence, sexual content, self-harm, jailbreak attempts, and prompt injections.

**MeshGuard** is an action governance platform for AI agents. It excels at authorization control: determining whether an agent should be allowed to perform a specific action based on policies, identity, and context.

**Key insight:** Azure focuses on *what content is harmful*; MeshGuard focuses on *what actions are permitted*. These are complementary layers of AI safety.

## What is Azure AI Content Safety?

Azure AI Content Safety is a Microsoft Azure service that uses machine learning models to detect potentially harmful content across multiple modalities. It's designed to help applications comply with content policies, regulations, and community standards.

### Core Capabilities

**1. Text and Image Moderation**

Azure analyzes content across four primary harm categories:
- **Hate:** Content expressing prejudice against protected groups
- **Violence:** Content depicting or promoting physical harm
- **Sexual:** Explicit or suggestive sexual content
- **Self-harm:** Content promoting or depicting self-injury

Each category returns a severity level (0-6), allowing nuanced content policy enforcement.

**2. Prompt Shields**

Detects adversarial inputs designed to manipulate LLMs:
- **User Prompt Attacks:** Jailbreak attempts where users try to bypass system rules
- **Document Attacks:** Malicious instructions hidden in external documents or emails

```json
// Example: Prompt Shield detecting a jailbreak attempt
{
  "attackDetected": true,
  "attackType": "userPromptAttack",
  "details": "Attempt to override system rules detected"
}
```

**3. Groundedness Detection**

Verifies that LLM responses are grounded in provided source materials—helping detect hallucinations and unsupported claims.

**4. Protected Material Detection**

Identifies when AI-generated text contains copyrighted or protected content like song lyrics, articles, or recipes.

**5. Task Adherence (Preview)**

Azure's newest feature detects when AI agent tool invocations are misaligned with user intent—flagging actions that don't match what the user actually requested.

**6. Custom Categories**

Allows organizations to define custom content categories and train detectors for domain-specific harmful content.

## What is MeshGuard?

MeshGuard is an action governance platform that controls what AI agents are authorized to do. Rather than analyzing content for harm, MeshGuard enforces policies about which actions agents can perform, when, and under what conditions.

### Core Capabilities

**1. Policy-Based Action Authorization**

```yaml
# MeshGuard policy example
name: customer-service-policy
rules:
  - action: "read:customer_data"
    effect: allow
    
  - action: "write:refund"
    effect: allow
    conditions:
      - "request.amount <= 100"
      - "time.hour >= 9 AND time.hour <= 17"
    
  - action: "delete:account"
    effect: deny
    reason: "Agents cannot delete customer accounts"
```

**2. Agent Identity and Trust Tiers**

Every agent gets a cryptographic identity with an assigned trust tier (anonymous, basic, verified, privileged). Policies can grant different permissions based on trust level.

**3. Delegation Control**

When Agent A asks Agent B to perform a task, MeshGuard ensures B's permissions never exceed A's—preventing privilege escalation in multi-agent systems.

**4. Comprehensive Audit Trails**

Every authorization decision is logged with full context: who, what, when, why, and which policy applied.

**5. Cross-Framework Support**

Works with any agent framework: LangChain, CrewAI, AutoGen, custom implementations.

## The Fundamental Difference

### Azure: "Is This Content Harmful?"

Azure AI Content Safety asks whether content (text, images, prompts) contains harmful material that violates content policies.

```python
from azure.ai.contentsafety import ContentSafetyClient

client = ContentSafetyClient(endpoint, credential)

# Analyze text for harmful content
result = client.analyze_text({
    "text": "User message here",
    "categories": ["Hate", "Violence", "Sexual", "SelfHarm"]
})

if result.hate_result.severity > 2:
    block_content()
```

**Azure answers:** *"Does this content contain hate speech, violence, or other harmful material?"*

### MeshGuard: "Is This Action Authorized?"

MeshGuard asks whether an agent should be permitted to perform a specific action given its identity, policies, and context.

```python
from meshguard import MeshGuardClient

client = MeshGuardClient(agent_token="support-bot-token")

# Check if action is authorized
decision = client.check(
    action="write:refund",
    resource="order-12345",
    context={"amount": 75.00}
)

if decision.allowed:
    process_refund()
else:
    escalate_to_human(decision.reason)
```

**MeshGuard answers:** *"Is this agent allowed to issue a $75 refund right now?"*

## Feature Comparison Table

| Feature | Azure AI Content Safety | MeshGuard |
|---------|------------------------|-----------|
| **Text Moderation** | ✅ Core feature (hate, violence, sexual, self-harm) | ❌ Not the focus |
| **Image Moderation** | ✅ Multi-category detection | ❌ Not the focus |
| **Prompt Injection Detection** | ✅ Prompt Shields | 🟡 Via policy rules |
| **Jailbreak Detection** | ✅ Built-in | 🟡 Via policy rules |
| **Groundedness Detection** | ✅ Verify LLM outputs against sources | ❌ Not included |
| **Protected Material Detection** | ✅ Detect copyrighted content | ❌ Not included |
| **Task Adherence** | ✅ Detect misaligned tool use | ✅ Policy-enforced alignment |
| **Action Authorization** | ❌ Not included | ✅ Core feature |
| **Policy-Based Control** | 🟡 Severity thresholds only | ✅ Rich policy language |
| **Agent Identity** | ❌ No identity concept | ✅ Tokens + trust tiers |
| **Delegation Control** | ❌ Not included | ✅ Permission ceilings |
| **Centralized Audit Trail** | 🟡 Azure Monitor logs | ✅ Built-in queryable logs |
| **Rate Limiting** | ❌ API rate limits only | ✅ Per-agent, per-action limits |
| **Multi-Framework Support** | ✅ REST API | ✅ SDKs for major frameworks |
| **Custom Categories** | ✅ Train custom detectors | ✅ Define custom actions |
| **Self-Hosted Option** | ❌ Azure cloud only | ✅ Self-hosted available |

## Deep Dive: Where Each Excels

### Azure AI Content Safety Excels At:

#### 1. Harmful Content Detection

Azure's models are trained on massive datasets to detect harmful content with nuanced severity levels:

```python
result = client.analyze_text({"text": user_input})

# Multi-level severity allows nuanced policies
if result.violence_result.severity >= 4:
    block_and_report()
elif result.violence_result.severity >= 2:
    flag_for_review()
else:
    allow()
```

#### 2. Prompt Shield Protection

Sophisticated detection of jailbreak attempts and document-based attacks:

```python
# Detect jailbreak attempts before they reach your LLM
shield_result = client.detect_jailbreak({
    "userPrompt": user_message,
    "documents": [attached_document]
})

if shield_result.user_prompt_attack_detected:
    reject_input("Potentially harmful prompt detected")
    
if shield_result.document_attack_detected:
    reject_input("Suspicious content in attached document")
```

#### 3. Groundedness Verification

Verify that AI responses are actually supported by source materials:

```python
groundedness_result = client.detect_groundedness({
    "text": ai_response,
    "groundingSources": [source_document],
    "reasoning": True
})

if not groundedness_result.is_grounded:
    # AI is hallucinating or making unsupported claims
    flag_for_review()
```

#### 4. Protected Material Detection

Prevent AI from reproducing copyrighted content:

```python
protected_result = client.detect_protected_material({
    "text": ai_generated_content
})

if protected_result.detected:
    # AI output contains protected material
    regenerate_response()
```

### MeshGuard Excels At:

#### 1. Fine-Grained Action Authorization

Control exactly what actions agents can perform:

```yaml
rules:
  # Time-based restrictions
  - action: "write:trade"
    effect: allow
    conditions:
      - "time.hour >= 9 AND time.hour <= 16"
      - "time.weekday IN ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']"
    
  # Amount limits
  - action: "write:payment"
    effect: allow
    conditions:
      - "request.amount <= agent.daily_limit"
    
  # Role-based access
  - action: "read:medical_records"
    effect: allow
    conditions:
      - "agent.role == 'healthcare_assistant'"
```

#### 2. Agent Identity Management

Different agents get different permissions based on verified identity:

```python
# Research agent: read-only access
research_agent = MeshGuardClient(agent_token="research-token")
research_agent.check("delete:records")  # → DENIED

# Admin agent: full access
admin_agent = MeshGuardClient(agent_token="admin-token")  
admin_agent.check("delete:records")  # → ALLOWED (if policy permits)
```

#### 3. Multi-Agent Delegation

Control what happens when agents delegate to other agents:

```python
# Agent A (verified tier) delegates to Agent B
# MeshGuard ensures: B cannot exceed A's permissions
# Even if B has higher potential permissions, it's capped

# Logged: Full delegation chain for audit
# "Agent B performed write:email, delegated by Agent A"
```

#### 4. Compliance-Ready Audit Trails

Every decision is logged with full context:

```python
audit_log = client.get_audit_log(
    agent_id="trading-bot",
    actions=["write:trade"],
    start_date="2026-01-01",
    end_date="2026-01-31"
)

for entry in audit_log:
    print(f"{entry.timestamp}: {entry.action}")
    print(f"  Decision: {entry.decision}")
    print(f"  Policy: {entry.matched_policy}")
    print(f"  Context: {entry.context}")
```

## When to Use Azure AI Content Safety

**Choose Azure AI Content Safety when you need:**

- **User-generated content moderation** — Comments, posts, uploads
- **AI output filtering** — Block harmful LLM responses
- **Prompt injection protection** — Detect jailbreak attempts
- **Hallucination detection** — Verify AI claims against sources
- **Copyright protection** — Prevent reproducing protected material
- **Regulatory compliance** — Content policies for gaming, education, social platforms
- **Azure ecosystem integration** — Already using Azure OpenAI, Cognitive Services

**Example use cases:**
- Social media platform moderating user posts
- Customer service chatbot filtering harmful responses
- Educational platform blocking inappropriate content for students
- Content creation tool preventing copyright infringement

## When to Use MeshGuard

**Choose MeshGuard when you need:**

- **Action-level authorization** — Control what agents can *do*, not just say
- **Policy-based governance** — Centralized rules across your organization
- **Agent identity management** — Different permissions for different agents
- **Multi-agent orchestration** — Control delegation and privilege escalation
- **Compliance audit trails** — SOC 2, HIPAA, financial regulations
- **Cross-framework deployment** — Consistent governance across LangChain, CrewAI, custom agents
- **Self-hosted option** — Keep governance on your infrastructure

**Example use cases:**
- Trading bot with dollar limits and time restrictions
- Healthcare assistant with role-based access to records
- Customer service agent with refund authorization limits
- Multi-agent system where coordinator delegates to specialists

## Using Both Together

For comprehensive AI safety, Azure AI Content Safety and MeshGuard work together as complementary layers:

```
┌─────────────────────────────────────────────────────────────────┐
│                     User Input                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           Azure AI Content Safety                         │  │
│  │   • Prompt Shield: Block jailbreak attempts              │  │
│  │   • Content Moderation: Filter harmful input              │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│                           │                                     │
│                           ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    LLM Processing                         │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│                           │                                     │
│                           ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           Azure AI Content Safety                         │  │
│  │   • Content Moderation: Filter harmful output            │  │
│  │   • Groundedness: Verify claims against sources          │  │
│  │   • Protected Material: Block copyrighted content        │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│                           │                                     │
│                           ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   MeshGuard                               │  │
│  │   • Action Authorization: Is this agent allowed?         │  │
│  │   • Policy Check: Does action meet conditions?           │  │
│  │   • Audit Log: Record decision for compliance            │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│                           │                                     │
│                           ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │               Tool Execution                              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation Example

```python
from azure.ai.contentsafety import ContentSafetyClient
from meshguard import MeshGuardClient
from meshguard.langchain import governed_tool

# Initialize both clients
azure_client = ContentSafetyClient(azure_endpoint, azure_credential)
meshguard_client = MeshGuardClient(agent_token="customer-service-bot")

def process_customer_request(user_input: str):
    # LAYER 1: Azure Content Safety - Check input for harmful content
    content_result = azure_client.analyze_text({"text": user_input})
    if content_result.hate_result.severity > 2:
        return "I can't process that request."
    
    # LAYER 2: Azure Prompt Shield - Check for jailbreak attempts
    shield_result = azure_client.detect_jailbreak({"userPrompt": user_input})
    if shield_result.user_prompt_attack_detected:
        log_security_event(user_input)
        return "I can't process that request."
    
    # Process with LLM...
    llm_response, tool_calls = process_with_llm(user_input)
    
    # LAYER 3: Azure Content Safety - Check output
    output_result = azure_client.analyze_text({"text": llm_response})
    if output_result.violence_result.severity > 2:
        return "I need to rephrase that response."
    
    # LAYER 4: MeshGuard - Authorize any tool calls
    for tool_call in tool_calls:
        decision = meshguard_client.check(
            action=tool_call.action,
            resource=tool_call.resource,
            context=tool_call.context
        )
        if not decision.allowed:
            return f"I'm not authorized to {tool_call.action}. {decision.reason}"
        
        # Execute the tool
        tool_call.execute()
    
    return llm_response

# Or use the governed_tool decorator for cleaner integration
@governed_tool("write:refund", client=meshguard_client)
def issue_refund(order_id: str, amount: float) -> str:
    """MeshGuard automatically checks authorization before execution."""
    return payment_service.refund(order_id, amount)
```

### What Each Layer Provides

| Safety Layer | Azure AI Content Safety | MeshGuard |
|--------------|------------------------|-----------|
| **Input Safety** | Block harmful prompts, detect jailbreaks | — |
| **Output Safety** | Filter harmful responses, verify groundedness | — |
| **Action Safety** | — | Authorize actions, enforce policies |
| **Audit** | Azure Monitor logs | Per-action decision logs |

## Azure Task Adherence vs MeshGuard

Azure's Task Adherence feature is the closest overlap between the two platforms. Let's compare:

### Azure Task Adherence

Detects when an AI agent's *planned* tool use is misaligned with user intent:

```python
# User: "Show me my calendar"
# Agent plans: clear_calendar_events()  ← Misaligned!

task_result = azure_client.detect_task_adherence({
    "userRequest": "Show me my calendar",
    "plannedToolCall": "clear_calendar_events()"
})

# Returns: {"taskRiskDetected": true, "details": "User requested view, agent plans delete"}
```

**Strengths:**
- AI-powered detection of intent misalignment
- Catches subtle mismatches
- No pre-defined policies needed

**Limitations:**
- Binary signal (risk detected or not)
- No authorization framework
- No identity-based permissions

### MeshGuard Authorization

Enforces explicit policies about which actions are allowed:

```yaml
rules:
  - action: "read:calendar"
    effect: allow
    
  - action: "delete:calendar"
    effect: deny
    reason: "Calendar deletion requires human approval"
```

**Strengths:**
- Explicit, auditable policies
- Identity-based permissions
- Conditions and context-aware rules
- Comprehensive audit trail

**Limitations:**
- Requires policy definition
- Won't catch "creative" misalignment not covered by policies

### Best Practice: Use Both

```python
# First: Azure Task Adherence catches intent misalignment
task_check = azure_client.detect_task_adherence({
    "userRequest": user_input,
    "plannedToolCall": agent_plan
})

if task_check.task_risk_detected:
    # Agent's plan doesn't match user intent
    return "Let me clarify what you'd like me to do."

# Then: MeshGuard enforces organizational policies
decision = meshguard_client.check(
    action=agent_plan.action,
    context={"user_intent": user_input}
)

if not decision.allowed:
    # Agent isn't authorized for this action
    return f"I'm not permitted to do that. {decision.reason}"
```

## Pricing Comparison

| Aspect | Azure AI Content Safety | MeshGuard |
|--------|------------------------|-----------|
| **Model** | Pay-per-request | Free tier + usage-based |
| **Free Tier** | 5 RPS (F0 tier) | Yes |
| **Text Analysis** | ~$1-2 per 1000 requests | Included in base |
| **Image Analysis** | ~$1.50 per 1000 requests | N/A |
| **Self-Hosted** | Not available | Available |

## Conclusion

**Azure AI Content Safety** and **MeshGuard** address different dimensions of AI safety:

| Need | Best Solution |
|------|---------------|
| Detect harmful content (hate, violence, etc.) | **Azure AI Content Safety** |
| Block jailbreak and injection attempts | **Azure AI Content Safety** |
| Verify AI outputs are grounded in facts | **Azure AI Content Safety** |
| Prevent copyright infringement | **Azure AI Content Safety** |
| Authorize agent actions by policy | **MeshGuard** |
| Manage agent identity and trust levels | **MeshGuard** |
| Control multi-agent delegation | **MeshGuard** |
| Maintain compliance audit trails | **MeshGuard** |
| Enforce organizational governance | **MeshGuard** |

**For production AI systems, consider using both:**
- Azure AI Content Safety as your **content moderation layer**
- MeshGuard as your **action governance layer**

Together, they provide defense in depth: Azure ensures content is safe, while MeshGuard ensures actions are authorized.

---

::: tip Ready for Action Governance?
[Create your free MeshGuard account →](https://meshguard.app)
:::
