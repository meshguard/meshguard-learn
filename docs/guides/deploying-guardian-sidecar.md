---
title: Guardian Sidecar Deployment
description: How to deploy the MeshGuard gateway as a sidecar container for per-agent policy enforcement, covering Docker, Kubernetes, policy caching, signed bundles, disconnected operation, and enforcement modes.
outline: deep
---

# Guardian Sidecar Deployment

How to deploy the MeshGuard gateway as a sidecar container for per-agent policy enforcement, covering Docker, Kubernetes, policy caching, signed bundles, disconnected operation, and enforcement modes.

## What the Guardian Sidecar Does

The MeshGuard gateway can run as a standalone service, but for production agent meshes the recommended pattern is a **sidecar deployment**: one gateway instance per agent, running in the same pod or container group. Every outbound request from the agent passes through its local gateway before reaching the target service.

This gives you:

1. **Per-agent enforcement.** Each sidecar evaluates policy for exactly one agent identity. No shared state, no noisy-neighbor risk.
2. **Sub-millisecond latency.** The sidecar runs on localhost. The default enforcement SLA targets p50 at 5ms, p95 at 20ms, and p99 at 50ms — with a hard circuit breaker at 100ms.
3. **Fault isolation.** If a sidecar crashes, only its agent loses governance. Every other agent in the mesh keeps running with its own sidecar intact.
4. **Full audit trail.** Each sidecar writes its own audit log. In Kubernetes, these can be aggregated via a shared volume or log collector.

The gateway middleware chain processes every proxied request in this order: **auth → audit → delegation-fuse → policy → privilege → provenance-gate → risk-wallet → proxy**. The sidecar runs this full chain locally — it is the same gateway binary, just scoped to a single agent.

## Enforcement Modes

The gateway supports three modes, controlled by the `MODE` environment variable:

### Enforce Mode (Default)

```bash
MODE=enforce
```

This is the production default. Policy denials block the request and return an error to the agent. The execution gate checks intent verification, action token validation, and policy evaluation — if any check fails, the action is denied. Denied requests are logged to the audit trail and trigger alerts if configured.

Use enforce mode when you trust your policies and want hard guarantees.

### Audit Mode

```bash
MODE=audit
```

The sidecar evaluates every policy rule and logs the decision, but **never blocks** the request. Denied actions are recorded in the audit trail with full context — policy ID, rule index, denial reason — but the proxy forwards the request anyway.

Use audit mode when:
- You are rolling out new policies and want to see what *would* be blocked before enforcing
- You are onboarding a new agent and need to tune its trust tier and scopes
- You need production traffic data to reduce false positives before switching to enforce

### Bypass Mode

```bash
MODE=bypass
```

The sidecar proxies all requests without evaluation. No policy checks, no audit logging. This exists for debugging and local development only. Never run bypass mode in production.

### Switching Modes at Runtime

You can change the mode without restarting the sidecar by updating the `MODE` environment variable and sending a restart signal to the process, or by redeploying the container. In Kubernetes, use a ConfigMap so you can roll mode changes across the fleet:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: meshguard-sidecar-config
data:
  MODE: "audit"         # Switch to "enforce" when ready
  POLICIES_DIR: "/policies"
  AUDIT_DB_PATH: "/data/audit.db"
```

## Docker Deployment

### Basic Sidecar with Docker Compose

The simplest sidecar deployment pairs your agent container with a MeshGuard gateway container on the same network:

```yaml
version: "3.9"

services:
  my-agent:
    image: your-org/your-agent:latest
    environment:
      # Point the agent's API calls at the sidecar
      API_BASE_URL: "http://meshguard-sidecar:3100/proxy"
    depends_on:
      meshguard-sidecar:
        condition: service_healthy

  meshguard-sidecar:
    image: ghcr.io/meshguard/gateway:latest
    environment:
      MODE: "enforce"
      PORT: "3100"
      PROXY_TARGET: "https://api.openai.com"   # The real upstream
      ADMIN_TOKEN: "${MESHGUARD_ADMIN_TOKEN}"
      JWT_SECRET: "${MESHGUARD_JWT_SECRET}"
      POLICIES_DIR: "/policies"
      AUDIT_DB_PATH: "/data/audit.db"
    volumes:
      - ./policies:/policies:ro
      - audit-data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3100/health"]
      interval: 10s
      timeout: 5s
      retries: 3
    ports:
      - "3100:3100"    # Expose for admin API access

volumes:
  audit-data:
```

**Key points:**

- The agent sends all requests to `http://meshguard-sidecar:3100/proxy/*` instead of directly to the upstream API.
- The sidecar's `PROXY_TARGET` is the real upstream (OpenAI, Anthropic, your internal service, etc.).
- Policies are mounted read-only from the host. The sidecar watches the directory and hot-reloads on changes.
- The audit database is persisted on a named volume so it survives container restarts.

### Multi-Agent Compose

For a mesh with multiple agents, each gets its own sidecar:

```yaml
version: "3.9"

services:
  code-reviewer:
    image: your-org/code-reviewer:latest
    environment:
      API_BASE_URL: "http://code-reviewer-sidecar:3100/proxy"
    depends_on:
      code-reviewer-sidecar:
        condition: service_healthy

  code-reviewer-sidecar:
    image: ghcr.io/meshguard/gateway:latest
    environment:
      MODE: "enforce"
      PROXY_TARGET: "https://api.openai.com"
      ADMIN_TOKEN: "${MESHGUARD_ADMIN_TOKEN}"
      JWT_SECRET: "${MESHGUARD_JWT_SECRET}"
      POLICIES_DIR: "/policies/code-reviewer"
      AUDIT_DB_PATH: "/data/code-reviewer/audit.db"
    volumes:
      - ./policies/code-reviewer:/policies/code-reviewer:ro
      - audit-data:/data

  summarizer:
    image: your-org/doc-summarizer:latest
    environment:
      API_BASE_URL: "http://summarizer-sidecar:3100/proxy"
    depends_on:
      summarizer-sidecar:
        condition: service_healthy

  summarizer-sidecar:
    image: ghcr.io/meshguard/gateway:latest
    environment:
      MODE: "enforce"
      PROXY_TARGET: "https://api.anthropic.com"
      ADMIN_TOKEN: "${MESHGUARD_ADMIN_TOKEN}"
      JWT_SECRET: "${MESHGUARD_JWT_SECRET}"
      POLICIES_DIR: "/policies/summarizer"
      AUDIT_DB_PATH: "/data/summarizer/audit.db"
    volumes:
      - ./policies/summarizer:/policies/summarizer:ro
      - audit-data:/data

volumes:
  audit-data:
```

## Kubernetes Deployment

### Pod Sidecar Pattern

In Kubernetes, the sidecar runs as a second container in the same pod. The agent communicates with it over localhost:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: code-reviewer
  labels:
    app: code-reviewer
spec:
  replicas: 2
  selector:
    matchLabels:
      app: code-reviewer
  template:
    metadata:
      labels:
        app: code-reviewer
    spec:
      containers:
        # The agent container
        - name: agent
          image: your-org/code-reviewer:latest
          env:
            - name: API_BASE_URL
              value: "http://localhost:3100/proxy"
          resources:
            requests:
              cpu: "250m"
              memory: "256Mi"

        # The MeshGuard sidecar
        - name: meshguard-sidecar
          image: ghcr.io/meshguard/gateway:latest
          ports:
            - containerPort: 3100
              name: gateway
          env:
            - name: MODE
              valueFrom:
                configMapKeyRef:
                  name: meshguard-sidecar-config
                  key: MODE
            - name: PORT
              value: "3100"
            - name: PROXY_TARGET
              value: "https://api.openai.com"
            - name: ADMIN_TOKEN
              valueFrom:
                secretKeyRef:
                  name: meshguard-secrets
                  key: admin-token
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: meshguard-secrets
                  key: jwt-secret
            - name: POLICIES_DIR
              value: "/policies"
            - name: AUDIT_DB_PATH
              value: "/data/audit.db"
          volumeMounts:
            - name: policies
              mountPath: /policies
              readOnly: true
            - name: audit-data
              mountPath: /data
          livenessProbe:
            httpGet:
              path: /health
              port: 3100
            initialDelaySeconds: 5
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ready
              port: 3100
            initialDelaySeconds: 3
            periodSeconds: 5
          resources:
            requests:
              cpu: "100m"
              memory: "128Mi"
            limits:
              cpu: "250m"
              memory: "256Mi"

      volumes:
        - name: policies
          configMap:
            name: code-reviewer-policies
        - name: audit-data
          emptyDir: {}
```

### Secrets and ConfigMaps

Store sensitive values in Kubernetes Secrets, and tunable configuration in ConfigMaps:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: meshguard-secrets
type: Opaque
stringData:
  admin-token: "msat_your-production-token"
  jwt-secret: "your-production-jwt-secret"
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: meshguard-sidecar-config
data:
  MODE: "enforce"
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: code-reviewer-policies
data:
  code-review-policy.yaml: |
    name: code-review-policy
    version: "1.0"
    description: Policy for code review agents
    appliesTo:
      tags:
        - code-review
    rules:
      - effect: allow
        actions:
          - "read:*"
      - effect: allow
        actions:
          - "write:comments"
      - effect: deny
        actions:
          - "write:delete"
          - "admin:*"
    defaultEffect: deny
```

### Network Policy

Lock down the sidecar so only the agent container can reach it:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: meshguard-sidecar-isolation
spec:
  podSelector:
    matchLabels:
      app: code-reviewer
  policyTypes:
    - Ingress
  ingress:
    # Only allow traffic to the sidecar port from within the pod (localhost)
    - ports:
        - port: 3100
          protocol: TCP
```

## Policy Caching

The sidecar loads all policy YAML files from `POLICIES_DIR` at startup and keeps them in memory. This is why enforcement latency is sub-millisecond for the policy evaluation step — there is no disk I/O or network call on the hot path.

When policy files change on disk (new mount, ConfigMap update, volume sync), the sidecar detects the change and hot-reloads. There is no downtime during reload. The old policy set remains active until the new set is fully parsed and validated.

You can control how many policy versions the sidecar retains in memory with `POLICY_VERSION_LIMIT` (default: 10). This is useful for audit and rollback — you can query the admin API to see which policy version was active at any point in time.

### Cache Warming

On startup, the sidecar:
1. Reads all YAML files from `POLICIES_DIR`
2. Parses and validates each policy
3. Indexes policies by agent tag, trust tier, and agent ID for fast lookup
4. Logs the number of loaded policies and any validation errors

If any policy file fails validation, the sidecar logs a warning but continues with the valid policies. It does not crash on a bad policy file — this is intentional, because a single typo in one policy should not take down governance for every agent.

## Signed Policy Bundles

In production, you want to guarantee that the policies running in the sidecar are the same policies that were reviewed and approved. Signed policy bundles solve this.

The workflow:

1. **Bundle policies** — Collect all YAML policy files into a tarball
2. **Sign the bundle** — Use your CI/CD pipeline to sign the tarball with a private key
3. **Distribute the bundle** — Push the signed tarball to your container registry or artifact store
4. **Verify on load** — The sidecar verifies the signature before loading any policy

```bash
# In CI: create and sign a policy bundle
tar czf policies.tar.gz -C policies/ .
cosign sign-blob --key cosign.key policies.tar.gz > policies.tar.gz.sig

# In the sidecar init container: verify and extract
cosign verify-blob --key cosign.pub --signature policies.tar.gz.sig policies.tar.gz
tar xzf policies.tar.gz -C /policies/
```

A Kubernetes init container handles verification before the sidecar starts:

```yaml
initContainers:
  - name: policy-loader
    image: gcr.io/projectsigstore/cosign:latest
    command: ["/bin/sh", "-c"]
    args:
      - |
        cosign verify-blob \
          --key /keys/cosign.pub \
          --signature /bundle/policies.tar.gz.sig \
          /bundle/policies.tar.gz && \
        tar xzf /bundle/policies.tar.gz -C /policies/
    volumeMounts:
      - name: policy-bundle
        mountPath: /bundle
        readOnly: true
      - name: signing-keys
        mountPath: /keys
        readOnly: true
      - name: policies
        mountPath: /policies
```

## Disconnected Operation

Not every environment has reliable network access to a central MeshGuard control plane. Edge deployments, air-gapped environments, and regions with intermittent connectivity all need the sidecar to keep working when the network goes away.

The sidecar is designed to operate fully disconnected:

- **Policies are local.** The sidecar reads from `POLICIES_DIR` on the local filesystem. It never requires a network call to evaluate policy.
- **Audit logs are local.** The audit database at `AUDIT_DB_PATH` is a local SQLite file. Decisions are logged locally even when the network is down.
- **Identity is local.** The sidecar validates JWTs using a local secret (`JWT_SECRET`). No token introspection endpoint required.

### Sync When Connected

When connectivity returns, you can sync audit logs and policy updates:

```bash
# Push local audit logs to the central control plane
curl -X POST https://gw.meshguard.app/admin/audit/ingest \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F "audit=@/data/audit.db"

# Pull latest policies
curl -s https://gw.meshguard.app/admin/policies/bundle \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -o /tmp/policies.tar.gz
tar xzf /tmp/policies.tar.gz -C /policies/
```

For Kubernetes, a CronJob can handle periodic sync:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: meshguard-policy-sync
spec:
  schedule: "*/5 * * * *"    # Every 5 minutes
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: sync
              image: curlimages/curl:latest
              command: ["/bin/sh", "-c"]
              args:
                - |
                  curl -sf https://gw.meshguard.app/admin/policies/bundle \
                    -H "Authorization: Bearer $ADMIN_TOKEN" \
                    -o /tmp/policies.tar.gz && \
                  tar xzf /tmp/policies.tar.gz -C /policies/
              env:
                - name: ADMIN_TOKEN
                  valueFrom:
                    secretKeyRef:
                      name: meshguard-secrets
                      key: admin-token
              volumeMounts:
                - name: policies
                  mountPath: /policies
          restartPolicy: OnFailure
          volumes:
            - name: policies
              persistentVolumeClaim:
                claimName: meshguard-policies
```

## Batch Enforcement

When an agent needs to check multiple actions at once — for example, a planning agent validating its entire action plan before execution — individual per-request enforcement adds unnecessary overhead. The gateway's execution gate supports batch evaluation through the SDK API.

Send a batch of actions to `/api/v1/governance/batch` and get back a single response with the decision for each action:

```bash
curl -X POST http://localhost:3100/api/v1/governance/batch \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "actions": [
      { "action": "read:customers", "resource": "customer-db" },
      { "action": "write:orders.notes", "resource": "order-db" },
      { "action": "execute:email.send", "resource": "email-service" },
      { "action": "admin:delete", "resource": "customer-db" }
    ]
  }'
```

Response:

```json
{
  "results": [
    { "action": "read:customers", "decision": "allow", "latencyMs": 2 },
    { "action": "write:orders.notes", "decision": "allow", "latencyMs": 1 },
    { "action": "execute:email.send", "decision": "allow", "latencyMs": 2 },
    { "action": "admin:delete", "decision": "deny", "reason": "Policy denies admin:* for this trust tier", "latencyMs": 1 }
  ],
  "totalLatencyMs": 6,
  "traceId": "abc123"
}
```

Batch enforcement is evaluated atomically — all actions are checked against the same policy snapshot. This prevents TOCTOU (time-of-check-to-time-of-use) issues where a policy update between individual checks could produce inconsistent results.

## Environment Variable Reference

| Variable | Default | Description |
|---|---|---|
| `MODE` | `enforce` | Enforcement mode: `enforce`, `audit`, or `bypass` |
| `PORT` | `3100` | Gateway listen port |
| `HOST` | `0.0.0.0` | Gateway listen address |
| `PROXY_TARGET` | `https://httpbin.org` | Upstream service URL |
| `ADMIN_TOKEN` | — | Admin API authentication token |
| `JWT_SECRET` | — | Secret for JWT signing and validation |
| `JWT_EXPIRES_IN` | `24h` | JWT token expiration |
| `POLICIES_DIR` | `./policies` | Path to YAML policy files |
| `POLICY_VERSION_LIMIT` | `10` | Number of policy versions to retain |
| `AUDIT_DB_PATH` | `./data/audit.db` | Path to the audit SQLite database |
| `OTEL_ENABLED` | `false` | Enable OpenTelemetry tracing |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | OTLP exporter endpoint |
| `OTEL_SERVICE_NAME` | `meshguard-gateway` | Service name for traces |

## Deployment Checklist

- [ ] **Choose your mode** — Start with `audit` to observe behavior, switch to `enforce` when policies are tuned
- [ ] **Set production secrets** — Use strong, unique values for `ADMIN_TOKEN` and `JWT_SECRET`; never use the defaults
- [ ] **Mount policies read-only** — Use ConfigMaps or signed bundles; never let the agent container write to the policy directory
- [ ] **Persist audit data** — Use a PersistentVolumeClaim or named volume for `AUDIT_DB_PATH`
- [ ] **Configure health checks** — Point liveness probes at `/health` and readiness probes at `/ready`
- [ ] **Set resource limits** — The sidecar is lightweight (128-256 MB RAM typical), but set limits to prevent runaway memory
- [ ] **Enable OTEL** — Connect traces to your existing observability stack (see [OpenTelemetry for Agent Governance](/guides/opentelemetry-agent-governance))
- [ ] **Plan for disconnected operation** — If your environment has unreliable connectivity, set up a sync CronJob for policies and audit logs
- [ ] **Sign your policy bundles** — In production, verify policy integrity with cosign or equivalent before the sidecar loads them
- [ ] **Lock down the network** — Use NetworkPolicies to ensure only the agent container can reach the sidecar

## Where This Connects

- [OpenTelemetry for Agent Governance](/guides/opentelemetry-agent-governance) covers connecting sidecar traces to your observability platform
- [Infrastructure as Code with Terraform](/guides/terraform-agent-governance) manages agents, policies, and alerts as code across your fleet
- [CI/CD Policy Checks with GitHub Actions](/guides/github-actions-policy-checks) validates policies in pull requests before they reach your sidecars
- [Monitoring Agent Behavior](/guides/monitoring-agent-behavior) explains the behavioral signals the sidecar produces
- [Trust Tiers Explained](/concepts/trust-tiers) covers the trust model that policies enforce
