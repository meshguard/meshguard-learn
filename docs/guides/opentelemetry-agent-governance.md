---
title: OpenTelemetry for Agent Governance
description: How to enable distributed tracing in MeshGuard, configure OTLP exporters, instrument policy decisions with span attributes, and connect traces to Datadog, Grafana, and other observability platforms.
outline: deep
---

# OpenTelemetry for Agent Governance

How to enable distributed tracing in MeshGuard, configure OTLP exporters, instrument policy decisions with span attributes, and connect traces to Datadog, Grafana, and other observability platforms.

## Why Observability Matters for Governance

A policy engine without observability is a black box. You know an agent was denied — but you don't know *why* it took 47ms instead of 2ms, which rule in the chain produced the denial, or whether the same denial pattern has been escalating over the past hour.

Traditional logging gives you individual events. Distributed tracing gives you the **full story** of a governance decision: from the moment a request arrives at the gateway, through authentication, delegation chain validation, policy evaluation, and final proxy — all connected in a single trace.

This matters because:

- **Policy debugging becomes fast.** When a policy denial surprises you, the trace shows every evaluation step, which rule matched, and what attributes were on the request. No more reading through log files and correlating timestamps.
- **Latency attribution is precise.** The MeshGuard enforcement SLA targets p50 at 5ms and p99 at 50ms. When latency spikes, the trace tells you whether the bottleneck is in policy evaluation, delegation chain validation, or the upstream proxy.
- **Anomaly detection gets context.** When your monitoring detects an unusual spike in denials for a specific agent, the traces for those denials contain the full evaluation chain — you can see exactly what changed.
- **Compliance audits have depth.** Auditors don't just want to know that decisions were logged. They want to see the chain of custody: which policy version was active, what trust tier the agent had, and how the decision was reached.

## How MeshGuard Implements OTEL

MeshGuard uses the official OpenTelemetry SDK for Node.js. The implementation is fully opt-in: when `OTEL_ENABLED` is `false` (the default), the SDK is never loaded and all tracing calls go through the OpenTelemetry no-op tracer — zero overhead.

When enabled, the gateway initializes the SDK at startup with a single OTLP/HTTP trace exporter. Every governance operation is wrapped in a span using helper functions that add MeshGuard-specific attributes:

- **`meshguard.policy.evaluate`** — Wraps policy evaluation with agent ID, action, decision, policy name, and denial reason
- **`meshguard.audit.write`** — Wraps audit log writes with agent ID, action, decision, and trace ID
- **`meshguard.delegation.check`** — Wraps delegation chain validation with chain depth, parent delegation ID, and agent ID

All spans are created via `tracer.startActiveSpan()`, which means they automatically participate in the active context. If your agent application also uses OpenTelemetry, the sidecar's spans will appear as children of the agent's spans — giving you end-to-end traces from agent intent to governance decision to upstream response.

## Enabling OTEL

Set three environment variables on the MeshGuard gateway:

```bash
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME=meshguard-gateway
```

That's it. The gateway will:
1. Dynamically import the OpenTelemetry SDK (not loaded when disabled)
2. Create a resource with the service name and version
3. Configure an OTLP/HTTP trace exporter pointing at your endpoint
4. Start the SDK and begin emitting spans

On shutdown, the gateway flushes all pending spans before exiting.

### Docker Compose Example

```yaml
services:
  meshguard-sidecar:
    image: ghcr.io/meshguard/gateway:latest
    environment:
      MODE: "enforce"
      PROXY_TARGET: "https://api.openai.com"
      ADMIN_TOKEN: "${MESHGUARD_ADMIN_TOKEN}"
      JWT_SECRET: "${MESHGUARD_JWT_SECRET}"
      OTEL_ENABLED: "true"
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector:4318"
      OTEL_SERVICE_NAME: "meshguard-code-reviewer"

  otel-collector:
    image: otel/opentelemetry-collector-contrib:latest
    volumes:
      - ./otel-config.yaml:/etc/otelcol/config.yaml
    ports:
      - "4318:4318"    # OTLP HTTP
      - "4317:4317"    # OTLP gRPC
```

### Kubernetes Example

```yaml
containers:
  - name: meshguard-sidecar
    image: ghcr.io/meshguard/gateway:latest
    env:
      - name: OTEL_ENABLED
        value: "true"
      - name: OTEL_EXPORTER_OTLP_ENDPOINT
        value: "http://otel-collector.monitoring.svc:4318"
      - name: OTEL_SERVICE_NAME
        value: "meshguard-code-reviewer"
```

## Span Attributes Reference

Every MeshGuard span carries structured attributes that you can search, filter, and alert on in your observability platform.

### Policy Evaluation Spans

Span name: `meshguard.policy.evaluate`

| Attribute | Type | Description |
|---|---|---|
| `meshguard.agent_id` | string | The agent whose request is being evaluated |
| `meshguard.action` | string | The action being evaluated (e.g., `read:customers`) |
| `meshguard.decision` | string | The policy decision: `allow` or `deny` |
| `meshguard.policy_name` | string | Name of the policy that produced the decision |
| `meshguard.reason` | string | Human-readable reason for the decision (present on denials) |

### Audit Log Spans

Span name: `meshguard.audit.write`

| Attribute | Type | Description |
|---|---|---|
| `meshguard.agent_id` | string | Agent ID for the audit entry |
| `meshguard.action` | string | Action that was audited |
| `meshguard.decision` | string | Decision that was recorded |
| `meshguard.trace_id` | string | MeshGuard-internal trace ID linking related audit entries |

### Delegation Check Spans

Span name: `meshguard.delegation.check`

| Attribute | Type | Description |
|---|---|---|
| `meshguard.delegation.depth` | number | Current depth in the delegation chain |
| `meshguard.delegation.parent_id` | string | ID of the parent delegation (if a sub-delegation) |
| `meshguard.delegation.agent_id` | string | Agent being evaluated in this chain link |

### Interpreting Spans

A typical governance trace looks like this:

```
[meshguard.policy.evaluate]  agent=code-reviewer  action=read:repos  decision=allow  3ms
  └─ [meshguard.audit.write]  agent=code-reviewer  action=read:repos  decision=allow  1ms
```

A delegation chain trace adds depth:

```
[meshguard.delegation.check]  depth=0  agent=orchestrator  2ms
  ├─ [meshguard.delegation.check]  depth=1  agent=code-reviewer  parent=del_abc123  1ms
  └─ [meshguard.policy.evaluate]  agent=code-reviewer  action=write:comments  decision=allow  2ms
      └─ [meshguard.audit.write]  1ms
```

A denial trace includes the reason:

```
[meshguard.policy.evaluate]  agent=untrusted-bot  action=admin:delete  decision=deny  1ms
  reason="Policy 'production-guardrails' denies admin:* for trust tier 'unverified'"
  └─ [meshguard.audit.write]  agent=untrusted-bot  decision=deny  1ms
```

## Connecting to Observability Platforms

MeshGuard exports traces via OTLP/HTTP, which is supported by every major observability platform either natively or through the OpenTelemetry Collector.

### Direct Export (No Collector)

If your platform accepts OTLP directly, point the exporter at it:

**Grafana Cloud:**
```bash
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-prod-us-east-0.grafana.net/otlp
OTEL_EXPORTER_OTLP_HEADERS="Authorization=Basic <base64-encoded-instance-id:token>"
```

**Honeycomb:**
```bash
OTEL_EXPORTER_OTLP_ENDPOINT=https://api.honeycomb.io
OTEL_EXPORTER_OTLP_HEADERS="x-honeycomb-team=your-api-key"
```

### Via the OpenTelemetry Collector

For most production deployments, route traces through an OpenTelemetry Collector. This gives you buffering, retry, sampling, and the ability to fan out to multiple backends.

```yaml
# otel-config.yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
      grpc:
        endpoint: 0.0.0.0:4317

processors:
  batch:
    timeout: 5s
    send_batch_size: 512

exporters:
  # Datadog
  datadog:
    api:
      key: "${DD_API_KEY}"
      site: datadoghq.com

  # Grafana Tempo
  otlphttp/tempo:
    endpoint: http://tempo:4318

  # Jaeger (for local development)
  otlp/jaeger:
    endpoint: jaeger:4317
    tls:
      insecure: true

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [datadog, otlphttp/tempo]
```

### Datadog

Datadog accepts OTLP natively through the Datadog Agent (v6.32+/v7.32+):

```yaml
# datadog-agent.yaml
otlp_config:
  receiver:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
```

Then point MeshGuard at the Datadog Agent:
```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://datadog-agent:4318
```

In Datadog, MeshGuard spans appear under the service name you configured. Use the `meshguard.decision` attribute to create monitors:

- **Alert on denial spike:** `count:meshguard.policy.evaluate{meshguard.decision:deny} > threshold`
- **Alert on latency:** `p99:meshguard.policy.evaluate.duration > 50ms`

### Grafana + Tempo

Deploy Tempo as a trace backend and Grafana for visualization:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://tempo:4318
```

In Grafana, add Tempo as a data source and use TraceQL to query:

```
{ resource.service.name = "meshguard-code-reviewer" && span.meshguard.decision = "deny" }
```

### New Relic

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.nr-data.net
OTEL_EXPORTER_OTLP_HEADERS="api-key=your-ingest-license-key"
```

## Building Governance Dashboards

With traces flowing, build dashboards that answer operational questions:

### Key Metrics to Track

| Metric | Source | Alert Threshold |
|---|---|---|
| Denial rate by agent | `meshguard.decision = deny` grouped by `meshguard.agent_id` | > 10% of requests |
| p99 evaluation latency | Duration of `meshguard.policy.evaluate` spans | > 50ms (SLA breach) |
| Delegation chain depth | `meshguard.delegation.depth` | > 3 (design issue) |
| Denial rate by policy | `meshguard.decision = deny` grouped by `meshguard.policy_name` | Sudden increase |
| Audit write failures | Error status on `meshguard.audit.write` spans | Any |

### Example Grafana Panel (TraceQL)

```
# Denial rate over time
rate({ resource.service.name =~ "meshguard-.*" && span.meshguard.decision = "deny" })
```

### Example Datadog Monitor

```
# Alert when any agent exceeds 20% denial rate in a 5-minute window
count:meshguard.policy.evaluate{meshguard.decision:deny} by {meshguard.agent_id}.as_rate()
  / count:meshguard.policy.evaluate{} by {meshguard.agent_id}.as_rate()
  > 0.2
```

## Environment Variable Reference

| Variable | Default | Description |
|---|---|---|
| `OTEL_ENABLED` | `false` | Set to `true` to enable OpenTelemetry tracing |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | OTLP HTTP endpoint URL. The gateway appends `/v1/traces` automatically. |
| `OTEL_SERVICE_NAME` | `meshguard-gateway` | Service name reported in traces. Use a unique name per sidecar (e.g., `meshguard-code-reviewer`) to distinguish agents. |

### Additional OTLP Environment Variables

The OpenTelemetry SDK respects the standard OTLP environment variables. While MeshGuard only configures the three above directly, you can set any standard OTEL variable and the SDK will pick it up:

| Variable | Description |
|---|---|
| `OTEL_EXPORTER_OTLP_HEADERS` | Comma-separated key=value headers for authentication |
| `OTEL_EXPORTER_OTLP_TIMEOUT` | Export timeout in milliseconds (default: 10000) |
| `OTEL_EXPORTER_OTLP_COMPRESSION` | Compression algorithm: `gzip` or `none` |
| `OTEL_TRACES_SAMPLER` | Sampling strategy: `always_on`, `always_off`, `traceidratio` |
| `OTEL_TRACES_SAMPLER_ARG` | Argument for the sampler (e.g., `0.1` for 10% sampling) |
| `OTEL_RESOURCE_ATTRIBUTES` | Additional resource attributes as `key=value,key=value` |

## Performance Impact

When OTEL is disabled (the default), the gateway incurs **zero overhead**. The SDK is never imported — helper functions check `isOtelEnabled()` and return immediately, calling the wrapped function without any span creation.

When OTEL is enabled, expect:

- **~0.5ms added per span** — Span creation, attribute setting, and context propagation
- **Background export** — Spans are batched and exported asynchronously; the export does not block the request path
- **Memory** — Each in-flight span uses ~2KB. With the default batch exporter (flush every 5s), memory overhead is proportional to your request rate

For a sidecar handling 100 requests/second, OTEL adds approximately 2MB of memory overhead and negligible CPU. The batch exporter's 5-second flush window means at most ~500 spans are buffered at any time.

If you need to reduce overhead further, use sampling:

```bash
OTEL_TRACES_SAMPLER=traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1    # Sample 10% of traces
```

## Quick-Start Checklist

- [ ] **Set `OTEL_ENABLED=true`** on your gateway or sidecar containers
- [ ] **Choose a service name** that identifies the specific agent (e.g., `meshguard-code-reviewer`, not just `meshguard`)
- [ ] **Deploy a collector** or point directly at your backend's OTLP endpoint
- [ ] **Verify spans arrive** — Check your backend for `meshguard.policy.evaluate` spans
- [ ] **Build a denial dashboard** — Track denial rates by agent and policy
- [ ] **Set latency alerts** — Alert when p99 evaluation latency exceeds 50ms
- [ ] **Add governance monitors** — Alert on sudden denial spikes or new denial patterns

## Where This Connects

- [Guardian Sidecar Deployment](/guides/deploying-guardian-sidecar) covers the full sidecar deployment model that produces these traces
- [Monitoring Agent Behavior](/guides/monitoring-agent-behavior) explains the behavioral signals you can correlate with traces
- [Implementing Trust Scores](/guides/implementing-trust-scores) shows how trust score changes produce governance events visible in traces
- [Audit Logs for Compliance](/concepts/audit-logs) describes the audit data that runs alongside traces
