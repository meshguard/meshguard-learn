# Concepts

Deep dives into the theory and practice of AI agent governance.

## Core Concepts

### [What is Agent Governance?](/concepts/what-is-agent-governance)
The foundational guide to understanding why AI agents need governance. Covers the four pillars: Identity, Policy, Enforcement, and Audit.

### [Trust Tiers Explained](/concepts/trust-tiers)
How MeshGuard uses graduated trust levels to enable different autonomy levels for different agents. From anonymous to privileged.

### [Principle of Least Privilege](/concepts/least-privilege)
Applying the security principle of least privilege to AI agents. Grant only the permissions agents need, nothing more.

### [Delegation Chains](/concepts/delegation-chains)
How agents can delegate permissions to other agents in a controlled, auditable way. Covers scope restrictions, depth limits, and revocation.

### [Policy Design Patterns](/concepts/policy-design-patterns)
Best practices for writing MeshGuard policies that scale. Covers deny-by-default, role-based, time-based, and resource-based patterns with real-world examples.

### [Audit Logs for Compliance](/concepts/audit-logs)
How MeshGuard's audit logging supports compliance requirements. Covers log structure, retention, querying, and export for SOC2, HIPAA, and GDPR.

## Trust & Behavior

### [Behavioral Trust Scoring](/concepts/behavioral-trust-scoring)
How multi-component behavioral scoring computes dynamic trust for AI agents. Covers weighted linear combination, component independence, normalization, and tier quantization.

### [Anomaly Detection in Agent Meshes](/concepts/anomaly-detection-agents)
Detecting anomalous agent behavior through constraint violation over trust graph structures. Severity scoring, auto-response feedback loops, and real-time vs. batch detection.

### [Delegation Chains Deep Dive](/concepts/delegation-chains-deep-dive)
A rigorous exploration of delegation chain mechanics: DAG enforcement, scope monotonicity, depth bounding, time-bounded permissions, and the relationship to capability-based security.

### [Trust Graph Architecture](/concepts/trust-graph-architecture)
The flagship technical paper on modeling agent governance as a directed acyclic graph. Formal definitions, behavioral trust computation, anomaly detection, delegation protocols, and security analysis against compromised-agent and collusion threat models.

---

::: tip Learn by Doing
Chat with [Scout](https://meshguard.app), our governed demo agent, to see these concepts in action.
:::
