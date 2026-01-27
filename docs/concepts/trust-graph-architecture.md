# Trust Graph Architecture for Enterprise AI Agent Governance

## Abstract

As enterprises deploy autonomous AI agents at scale, traditional access-control models—designed for human users initiating discrete sessions—fail to capture the continuous, delegated, and emergent nature of agent-to-agent interaction. This paper presents a trust graph architecture that models agent governance as a directed acyclic graph (DAG) where agents are nodes annotated with behavioral trust scores, delegations are directed weighted edges with monotonically narrowing scope, and anomalies are constraint violations detected over graph structure and temporal patterns. We formalize the mathematical properties of the model—transitivity ceilings, depth-bounded delegation, and scope monotonicity—and describe a multi-component behavioral trust computation that is computationally tractable (O(n) full recomputation, O(d) chain validation). We analyze the security properties under a threat model that includes compromised agents, privilege escalation, collusion, and Sybil attacks. The architecture bridges the gap between zero-trust network principles and the unique requirements of agentic AI systems where identity, intent, and capability are fluid.

---

## 1. Introduction

The rapid adoption of AI agents in enterprise environments has introduced a governance challenge with no direct precedent. Unlike human users, who authenticate once per session and perform actions through a well-defined UI, AI agents operate continuously, invoke tools programmatically, delegate tasks to sub-agents, and adapt their behavior based on context. A single customer-service deployment might involve a triage agent that delegates to a billing agent, which in turn invokes a refund-processing agent—each with different trust requirements, data access needs, and risk profiles.

Traditional identity and access management (IAM) was designed for a world of human principals and static resources. Role-Based Access Control (RBAC) assigns permissions through roles that map cleanly to organizational hierarchies. Attribute-Based Access Control (ABAC) adds contextual flexibility. OAuth 2.0 provides delegated authorization between services. These models assume a human in the loop, relatively stable permission requirements, and session-bounded interactions.

AI agents violate all three assumptions. They operate autonomously for extended periods. Their permission requirements shift dynamically as they reason about tasks. And they form ad hoc delegation chains that have no analog in traditional IAM. The result is a governance vacuum: enterprises either over-provision agents (creating unacceptable risk) or under-provision them (rendering them ineffective).

This paper proposes a trust graph architecture that addresses these challenges. The key insight is that agent governance is fundamentally a *graph problem*: agents relate to one another through delegation, their trustworthiness is a dynamic property computed from behavioral signals, and policy enforcement requires reasoning about paths and reachability in the delegation graph.

Section 2 surveys related work. Section 3 defines the trust graph model formally. Section 4 describes the behavioral trust computation. Section 5 presents the anomaly detection framework. Section 6 formalizes the delegation protocol. Section 7 analyzes security properties. Section 8 discusses practical considerations. Section 9 concludes.

---

## 2. Related Work

**Zero Trust Architecture.** NIST Special Publication 800-207 [1] defines zero trust as an architecture where "no implicit trust is granted to assets or user accounts based solely on their physical or network location." The core tenets—verify explicitly, use least-privilege access, assume breach—apply directly to agentic systems. However, NIST 800-207 focuses on network access and does not address behavioral trust or delegation chains between autonomous entities.

**RBAC and ABAC.** Sandhu et al. [2] formalized RBAC with role hierarchies and separation-of-duty constraints. ABAC, standardized by NIST [3], extends this with attribute-based policies evaluated at decision time. Both models are well-suited to human users with stable roles but poorly suited to agents whose effective permissions depend on delegation context, behavioral history, and real-time risk assessment.

**OAuth 2.0 and Delegated Authorization.** RFC 6749 [4] defines the OAuth 2.0 framework for delegated authorization. The token-based model with scopes and refresh mechanisms provides a foundation, but OAuth assumes a human resource owner granting consent, a well-defined client-server relationship, and static scope definitions. Agent-to-agent delegation requires dynamic scope narrowing without human intervention.

**PKI and Certificate Chains.** X.509 certificate chains [5] provide a model for transitive trust with depth constraints (path length constraints in the BasicConstraints extension). The trust graph model draws on this concept but extends it to behavioral trust that changes over time, whereas certificate validity is binary (valid or revoked).

**BeyondCorp.** Google's BeyondCorp [6] eliminated the privileged corporate network in favor of device-centric and user-centric access policies. The insight that access decisions should depend on dynamic signals (device state, user context) rather than network location is directly applicable. The trust graph extends this to agent-centric signals: behavioral history, delegation context, and anomaly state.

**Behavioral Analytics.** Security Information and Event Management (SIEM) systems and User and Entity Behavior Analytics (UEBA) [7] use statistical baselines and machine-learning models to detect anomalous behavior. The anomaly detection framework described in Section 5 applies similar principles but operates over the trust graph structure rather than raw log streams, enabling detection of graph-structural anomalies (unusual delegation patterns, trust-boundary violations) that are invisible to traditional UEBA.

**Capability-Based Security.** The capability model, originating with Dennis and Van Horn [8] and refined in systems like KeyKOS [9] and Capsicum [10], models permissions as unforgeable tokens that can be attenuated but not amplified. The delegation protocol in Section 6 shares the attenuation property (scope can only narrow) but adds behavioral trust as a dynamic dimension that capability systems lack.

**Reputation Systems.** Distributed reputation systems in peer-to-peer networks [11, 12] compute trust from transaction histories. The behavioral trust computation in Section 4 shares the history-based approach but differs in three ways: it operates in a managed (not adversarial) environment, it uses multi-component scoring rather than single-dimensional reputation, and it feeds into a policy enforcement system rather than serving as advisory information.

---

## 3. Trust Graph Model

### 3.1 Formal Definition

A trust graph is a tuple *G* = (*A*, *D*, *τ*, *Φ*) where:

- *A* = {*a*₁, *a*₂, …, *a*ₙ} is a finite set of **agents** (nodes).
- *D* ⊆ *A* × *A* × *S* × *T* is a set of **delegations** (directed edges), where *S* is the space of permission scopes and *T* is the space of time intervals.
- *τ* : *A* → [0, 1] is the **trust score function** mapping each agent to a real-valued score.
- *Φ* : *A* ∪ *D* → 𝒫(*F*) is the **anomaly annotation function** mapping agents and delegations to sets of anomaly flags *F*.

Each delegation *d* = (*a*ᵢ, *a*ⱼ, *s*, *t*) represents agent *a*ᵢ delegating scope *s* to agent *a*ⱼ for time interval *t*. Intuitively, *a*ᵢ is the delegator and *a*ⱼ is the delegate.

### 3.2 DAG Constraint

The graph (*A*, *D*) must form a directed acyclic graph. No agent may appear in a delegation chain that leads back to itself:

> **Definition (Acyclicity).** For all agents *a* ∈ *A*, there exists no sequence of delegations *d*₁, *d*₂, …, *d*ₖ such that *d*₁ = (*a*, *a*₂, ·, ·), *d*ₖ = (*a*ₖ, *a*, ·, ·), and the chain is connected.

This constraint is enforced at delegation creation time by performing a reachability check from the proposed delegate back to the delegator. The computational cost is O(|*D*|) in the worst case but typically O(*d*) where *d* is the maximum delegation depth, which is bounded by a system parameter *d*_max.

### 3.3 Transitivity Bounds

Trust does not propagate without attenuation. If agent *a*₁ delegates to *a*₂ with trust score *τ*(*a*₁) = 0.9, and *a*₂ delegates to *a*₃ with *τ*(*a*₂) = 0.8, the effective trust of *a*₃ in the chain rooted at *a*₁ is not simply *τ*(*a*₃) but is bounded by the chain:

> **Definition (Effective Trust).** For a delegation chain *a*₁ → *a*₂ → … → *a*ₖ, the effective trust at depth *k* is:
>
> *τ*_eff(*a*ₖ) = min(*τ*(*a*ₖ), min₁≤ᵢ<ₖ *τ*(*a*ᵢ))

This is a **ceiling function**: the effective trust of any agent in a chain cannot exceed the minimum trust score of any agent upstream in the delegation path. This property ensures that a highly trusted leaf agent cannot launder trust through a low-trust intermediary.

### 3.4 Scope Narrowing

Permission scopes form a partial order (𝒮, ⊆) where *s*₁ ⊆ *s*₂ means scope *s*₁ is a subset of (or equal to) scope *s*₂. Each delegation must satisfy:

> **Property (Scope Monotonicity).** For a delegation (*a*ᵢ, *a*ⱼ, *s*ⱼ, *t*ⱼ), if *a*ᵢ holds scope *s*ᵢ, then *s*ⱼ ⊆ *s*ᵢ. Delegates can never exceed their delegator's permissions.

This is the graph-theoretic analog of the capability attenuation property: capabilities can only be narrowed, never amplified, through delegation.

---

## 4. Behavioral Trust Computation

### 4.1 Multi-Component Scoring Model

The trust score *τ*(*a*) is computed as a weighted linear combination of *m* independent behavioral components:

> *τ*(*a*) = Σᵢ₌₁ᵐ *w*ᵢ · *c*ᵢ(*a*)

where *c*ᵢ : *A* → [0, 1] is the *i*-th component scoring function, *w*ᵢ ∈ [0, 1] is its weight, and Σᵢ *w*ᵢ = 1.

Typical components include:

- **Action compliance** (*c*₁): Fraction of actions that conform to declared policy over a sliding window.
- **Resource-access pattern regularity** (*c*₂): Statistical distance between the agent's resource-access distribution and its historical baseline.
- **Delegation behavior** (*c*₃): Adherence to delegation protocol norms—proper scope narrowing, reasonable chain depths, no rejected delegation attempts.
- **Temporal consistency** (*c*₄): Consistency of activity patterns with expected operational schedules.
- **Voucher score** (*c*₅): Endorsement signals from other agents that have interacted with this agent, weighted by the endorser's own trust score.

### 4.2 Component Independence

The linear model assumes approximate independence between components. In practice, components may exhibit mild correlation (an agent with low action compliance may also show irregular resource access). However, the linear combination is deliberately chosen over models that capture dependencies (e.g., Bayesian networks, neural scoring) for three reasons:

1. **Interpretability.** Each component's contribution to the final score is transparent and auditable—a requirement for compliance in regulated industries.
2. **Monotonicity.** Improving any single component can only increase the trust score, providing clear incentives for agent developers.
3. **Computational tractability.** Full recomputation is O(n · m) where *n* is the agent count and *m* is the component count, enabling real-time updates.

### 4.3 Normalization and Tier Quantization

Raw scores are normalized to [0, 1] using min-max normalization relative to the agent population. The continuous score is then quantized into discrete **trust tiers** for policy enforcement:

| Tier | Score Range | Typical Semantics |
|------|-------------|-------------------|
| Untrusted | [0.0, 0.2) | No autonomous action; human approval required for all operations |
| Restricted | [0.2, 0.4) | Read-only access; limited tool invocation |
| Standard | [0.4, 0.6) | Normal operational permissions |
| Elevated | [0.6, 0.8) | Access to sensitive resources; can delegate to Standard agents |
| Privileged | [0.8, 1.0] | Full operational scope; can delegate to Elevated agents |

Tier boundaries are configurable. Quantization introduces hysteresis: an agent must exceed the upper threshold by a configurable margin *ε* to be promoted, and must fall below the lower threshold by *ε* to be demoted. This prevents oscillation at tier boundaries.

### 4.4 Comparison with Alternative Models

**Bayesian Trust Models.** Beta reputation systems [12] model trust as a Beta distribution updated with positive and negative observations. While mathematically elegant, they compress trust into a single dimension and are vulnerable to whitewashing (an agent accumulates negative history, resets, and starts fresh). The multi-component model resists whitewashing because each component maintains independent history.

**Neural Trust Models.** Deep learning approaches can capture complex nonlinear relationships between behavioral signals. However, they sacrifice interpretability—a critical requirement in governance—and require large training datasets that may not exist for novel agent deployments.

**Reputation Systems.** Distributed reputation (e.g., EigenTrust [11]) is designed for adversarial peer-to-peer environments. Enterprise agent governance operates in a managed environment where the governance system has authoritative visibility into all actions, making the overhead and complexity of distributed consensus unnecessary.

---

## 5. Anomaly Detection Framework

### 5.1 Detection as Constraint Violation

An anomaly is defined as a violation of an expected constraint over the trust graph. Constraints are expressed as predicates over graph properties:

- **Behavioral constraints**: *c*ᵢ(*a*) < *θ*ᵢ for some component threshold *θ*ᵢ.
- **Structural constraints**: Delegation depth exceeds *d*_max, scope widening is attempted, or a cycle is detected.
- **Temporal constraints**: Action frequency exceeds the agent's historical baseline by more than *k* standard deviations.
- **Relational constraints**: An agent accesses resources outside the union of scopes in its delegation chain.

### 5.2 Severity Function

Anomaly severity is computed as a function of three factors:

> *severity*(*a*, *v*) = *f*(*position*(*a*), *tier*(*a*), *context*(*v*))

where *v* is the violation event. Concretely:

- **Graph position** (*position*): Anomalies at higher-trust agents or agents closer to the root of delegation chains are more severe, because compromise propagates downward. Position weight is proportional to the number of transitive delegates.
- **Trust tier** (*tier*): A policy violation by a Privileged agent is inherently more severe than the same violation by a Restricted agent, because the blast radius is larger.
- **Action context** (*context*): A scope violation involving sensitive data (PII, financial records) is weighted more heavily than a violation involving non-sensitive operational data.

### 5.3 Auto-Response Feedback Loop

Detected anomalies trigger automated responses that feed back into the trust graph:

1. **Trust score adjustment.** The relevant behavioral component *c*ᵢ is decremented proportionally to the severity. If the resulting *τ*(*a*) crosses a tier boundary (respecting hysteresis), the agent is demoted.
2. **Delegation revocation.** If the anomalous agent has active delegations, downstream delegates may be suspended pending review. This is equivalent to propagating a revocation signal down the DAG.
3. **Annotation.** The anomaly flag is recorded in *Φ*(*a*), providing a persistent audit trail that affects future trust computations.

This creates a negative feedback loop: anomalous behavior reduces trust, which reduces permissions, which limits the agent's ability to cause further harm. Recovery requires sustained compliant behavior that rebuilds the affected component scores.

---

## 6. Delegation Protocol

### 6.1 Formal Properties

The delegation protocol enforces four invariants:

**Non-circularity (DAG Enforcement).** Before creating delegation (*a*ᵢ, *a*ⱼ, *s*, *t*), the system verifies that *a*ᵢ is not reachable from *a*ⱼ in the current graph. This is a standard graph reachability check with complexity O(|*A*| + |*D*|), reduced in practice to O(*d*) by the depth bound.

**Depth-boundedness.** Every delegation chain has length at most *d*_max. If *a*ᵢ is already at depth *d*_max in some chain, it cannot delegate further. This bounds the trust attenuation path and limits the blast radius of any single compromised agent.

**Scope monotonicity.** As defined in Section 3.4, *s*ⱼ ⊆ *s*ᵢ. The protocol verifies set inclusion at delegation creation time using the scope partial order.

**Time-boundedness.** Every delegation has a finite time interval *t* = [*t*_start, *t*_end]. Delegations are not perpetual; they expire automatically. Renewal requires re-evaluation of all invariants.

### 6.2 Delegation Creation Algorithm

```
DELEGATE(aᵢ, aⱼ, s, t):
  1. Verify τ(aᵢ) ≥ τ_min_delegate        // Delegator meets minimum trust
  2. Verify tier(aᵢ) > tier(aⱼ)            // Delegator tier exceeds delegate
  3. Verify s ⊆ scope(aᵢ)                  // Scope narrowing
  4. Verify depth(aᵢ) < d_max              // Depth bound
  5. Verify ¬reachable(aⱼ, aᵢ, G)         // Acyclicity
  6. Verify t_end - t_start ≤ t_max        // Duration bound
  7. D ← D ∪ {(aᵢ, aⱼ, s, t)}            // Create delegation
  8. Log delegation to audit trail
```

### 6.3 Comparison to Capability-Based Security

The delegation protocol shares the attenuation property with capability-based security: permissions can only be narrowed through delegation, never amplified. However, it differs in three important respects:

1. **Dynamic trust dimension.** Capabilities are static tokens; delegation edges carry dynamic trust scores that affect enforcement.
2. **Revocability.** In pure capability systems, revocation is notoriously difficult (the "revocation problem" [8]). The trust graph supports O(*d*) revocation by removing an edge and propagating the effect downward.
3. **Behavioral gating.** Delegation is gated not only on what permissions an agent *has* but on how it has *behaved*. An agent with the technical capability to delegate may be denied the right to do so if its behavioral trust is insufficient.

---

## 7. Security Analysis

### 7.1 Threat Model

We consider four threat classes:

**T1: Compromised Agent.** An attacker gains control of a single agent and attempts to perform unauthorized actions or escalate privileges.

**T2: Privilege Escalation.** An agent (or attacker controlling an agent) attempts to acquire permissions beyond its authorized scope through delegation manipulation or trust score gaming.

**T3: Collusion.** Multiple compromised agents coordinate to amplify their collective privileges or mask anomalous behavior.

**T4: Sybil Attack on Voucher Scores.** An attacker creates multiple agent identities to artificially inflate the voucher component of a target agent's trust score.

### 7.2 Mitigations

**T1 Mitigation.** The ceiling function on effective trust (Section 3.3) ensures a compromised agent's impact is bounded by its current trust tier. The anomaly detection feedback loop (Section 5.3) degrades the agent's trust in response to anomalous behavior, progressively restricting its capabilities. Time-bounded delegations ensure that even if revocation fails, permissions expire.

**T2 Mitigation.** Scope monotonicity (Section 3.4) prevents privilege amplification through delegation. The tier ordering constraint (Step 2 of DELEGATE) prevents lateral delegation that could be chained to escalate. Trust score computation is performed by the governance system, not by agents themselves, preventing direct score manipulation.

**T3 Mitigation.** Collusion is detectable through relational anomaly detection: coordinated deviations from baseline behavior across agents that share delegation relationships are flagged. The ceiling function limits the benefit of collusion—a chain of compromised agents cannot produce effective trust higher than the minimum trust in the chain.

**T4 Mitigation.** Voucher scores are weighted by the endorser's own trust score (*c*₅ weight includes *τ*(*a*_endorser) as a multiplicative factor). Sybil agents, being newly created, have low trust scores, and their endorsements carry negligible weight. Additionally, the voucher component is only one of *m* components, bounding its maximum influence to *w*₅ of the total score.

---

## 8. Practical Considerations

### 8.1 Computational Performance

**Trust score recomputation.** Full recomputation of all trust scores is O(*n* · *m*) where *n* is the agent count and *m* is the component count. For realistic deployments (*n* ≤ 10⁴, *m* ≤ 10), this completes in milliseconds on commodity hardware.

**Incremental updates.** When a single action occurs, only the acting agent's component scores need updating: O(*m*) per action. Tier reclassification is O(1) per agent.

**Delegation chain validation.** Verifying a delegation chain requires traversing at most *d*_max edges, each requiring a scope inclusion check. With *d*_max typically set to 3–5, this is effectively O(1).

**Anomaly detection.** Per-action anomaly checks are O(*m*) for behavioral constraints and O(*d*) for structural constraints, yielding O(*m* + *d*) per action.

### 8.2 Storage

The trust graph requires persistent storage for agent records (trust scores, component histories), delegation edges (scope, time bounds, status), and anomaly annotations. For *n* agents with *m* components and a rolling window of *w* historical observations, storage is O(*n* · *m* · *w* + |*D*|). With *w* = 10⁴ (approximately one month of per-minute observations), a deployment of 10³ agents requires on the order of 50 MB—well within the capacity of any production database.

### 8.3 Real-Time vs. Batch Processing

Trust scores can be computed in two modes:

- **Real-time (streaming).** Each action triggers incremental component updates and anomaly checks. Suitable for enforcement-critical decisions (delegation approval, sensitive-resource access).
- **Batch (periodic).** Full recomputation runs on a configurable schedule (e.g., every 5 minutes). Suitable for tier reclassification and trend analysis.

A hybrid approach is typical: real-time incremental updates for enforcement, with periodic batch reconciliation to correct drift and incorporate cross-agent relational analysis.

### 8.4 Cold-Start Bootstrapping

Newly registered agents have no behavioral history. The cold-start problem is addressed through:

1. **Default tier assignment.** New agents start at the Restricted tier regardless of their declared capabilities. This is the agentic analog of "deny by default."
2. **Accelerated evaluation.** During a configurable probationary period, component scores are computed over shorter windows with lower confidence thresholds, enabling faster initial tier assignment.
3. **Voucher bootstrapping.** A new agent's creator or deployer may provide an initial voucher, weighted by the voucher's own trust score. This provides a starting signal without bypassing the behavioral evaluation.

---

## 9. Conclusion and Future Work

This paper has presented a trust graph architecture for governing enterprise AI agents. The model formalizes agents as graph nodes, delegations as directed weighted edges, trust as a dynamic node property, and anomalies as constraint violations over graph structure. The key properties—DAG enforcement, transitivity ceilings, scope monotonicity, and behavioral trust computation—together provide a principled framework that extends zero-trust principles to the agentic domain.

Several directions for future work are particularly promising:

**Federated trust graphs.** When agents from different organizations interact, their trust graphs must be composed without requiring full visibility into each other's internal structure. Federated trust could operate analogously to inter-domain BGP routing, where organizations advertise trust summaries for their boundary agents without exposing internal graph topology.

**Cross-organization delegation.** Extending the delegation protocol across organizational boundaries requires solving the trust anchor problem: which organization's trust computation does a cross-boundary delegation rely on? Mutual recognition agreements, analogous to cross-certification in PKI, offer one path forward.

**ML-enhanced anomaly detection.** The constraint-based anomaly detection described in Section 5 could be augmented with learned models that capture complex behavioral patterns not easily expressed as threshold predicates. Graph neural networks operating over the trust graph structure are a natural fit, potentially detecting subtle collusion patterns or gradual trust erosion that rule-based systems miss.

**Formal verification.** The invariants described in Section 6 are amenable to formal verification. Proving that the delegation protocol preserves scope monotonicity and acyclicity under all possible interleavings of concurrent delegation operations would strengthen the security guarantees.

**Human-agent hybrid governance.** As agents become more capable, the boundary between human and agent principals blurs. Extending the trust graph to include human nodes—with their own behavioral trust scores—would unify IAM and agent governance into a single framework.

---

## References

[1] S. Rose, O. Borchert, S. Mitchell, and S. Connelly, "Zero Trust Architecture," NIST Special Publication 800-207, 2020.

[2] R. Sandhu, E. Coyne, H. Feinstein, and C. Youman, "Role-Based Access Control Models," *IEEE Computer*, vol. 29, no. 2, pp. 38–47, 1996.

[3] V. Hu et al., "Guide to Attribute Based Access Control (ABAC) Definition and Considerations," NIST Special Publication 800-162, 2014.

[4] D. Hardt, "The OAuth 2.0 Authorization Framework," RFC 6749, Internet Engineering Task Force, 2012.

[5] D. Cooper et al., "Internet X.509 Public Key Infrastructure Certificate and Certificate Revocation List (CRL) Profile," RFC 5280, Internet Engineering Task Force, 2008.

[6] R. Ward and B. Beyer, "BeyondCorp: A New Approach to Enterprise Security," *;login:*, vol. 39, no. 6, pp. 6–11, 2014.

[7] A. Sapegin, D. Jaeger, F. Cheng, and C. Meinel, "Towards a System for Complex Analysis of Security Events in Large-Scale Networks," *Computers & Security*, vol. 67, pp. 16–34, 2017.

[8] J. Dennis and E. Van Horn, "Programming Semantics for Multiprogrammed Computations," *Communications of the ACM*, vol. 9, no. 3, pp. 143–155, 1966.

[9] N. Hardy, "KeyKOS Architecture," *ACM SIGOPS Operating Systems Review*, vol. 19, no. 4, pp. 8–25, 1985.

[10] J. Anderson, R. Watson, and K. Yoshihama, "Capsicum: Practical Capabilities for UNIX," *Proceedings of the 19th USENIX Security Symposium*, 2010.

[11] S. Kamvar, M. Schlosser, and H. Garcia-Molina, "The EigenTrust Algorithm for Reputation Management in P2P Networks," *Proceedings of the 12th International Conference on World Wide Web (WWW)*, pp. 640–651, 2003.

[12] A. Jøsang and R. Ismail, "The Beta Reputation System," *Proceedings of the 15th Bled Electronic Commerce Conference*, 2002.
