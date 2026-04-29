---
title: Infrastructure as Code with Terraform
description: How to manage MeshGuard agents, policies, and alert channels as code using the Terraform provider, with complete HCL examples, state management, and team workflows.
outline: deep
---

# Infrastructure as Code with Terraform

How to manage MeshGuard agents, policies, and alert channels as code using the Terraform provider, with complete HCL examples, state management, and team workflows.

## Why IaC for Agent Governance

Click-ops governance doesn't scale. When you have 3 agents and 2 policies, the admin dashboard works fine. When you have 30 agents across 5 teams, each with environment-specific policies and alert channels, you need the same discipline you apply to your infrastructure: version control, code review, automated testing, and repeatable deployments.

The MeshGuard Terraform provider gives you this by managing three core resource types as code:

1. **Agents** — Register and configure agents with trust tiers, tags, and metadata
2. **Policies** — Define YAML policy documents that control what each agent can do
3. **Alert channels** — Configure where governance events are routed (Slack, PagerDuty, etc.)

This means:

- **Every change is reviewed.** A new policy or trust tier change goes through a pull request. Your team sees the diff, reviews the impact, and approves before `terraform apply`.
- **Every change is versioned.** Git history tells you exactly who changed what and when. If a policy change causes unexpected denials, `git log` shows you what changed and `terraform plan` shows you how to revert.
- **Every environment is reproducible.** Staging mirrors production because they're defined by the same Terraform modules with different variable files.
- **Drift is detectable.** `terraform plan` shows you when the live state doesn't match your code — someone made a change through the API that wasn't committed.

## Provider Setup

### Requirements

- [Terraform](https://developer.hashicorp.com/terraform/downloads) >= 1.0
- A running MeshGuard gateway with admin API access
- An admin API token

### Installation

The provider is available from the Terraform Registry:

```hcl
terraform {
  required_providers {
    meshguard = {
      source  = "registry.terraform.io/meshguard/meshguard"
      version = "~> 0.1"
    }
  }
}
```

For local development, you can build the provider from source:

```bash
git clone https://github.com/meshguard/meshguard-terraform.git
cd meshguard-terraform
go build -o terraform-provider-meshguard

# Install locally
mkdir -p ~/.terraform.d/plugins/registry.terraform.io/meshguard/meshguard/0.1.0/$(go env GOOS)_$(go env GOARCH)
cp terraform-provider-meshguard ~/.terraform.d/plugins/registry.terraform.io/meshguard/meshguard/0.1.0/$(go env GOOS)_$(go env GOARCH)/
```

### Provider Configuration

```hcl
provider "meshguard" {
  gateway_url = "https://gw.meshguard.app"
  admin_token = var.meshguard_admin_token
}

variable "meshguard_admin_token" {
  description = "MeshGuard admin API token"
  type        = string
  sensitive   = true
}
```

Both arguments can be set via environment variables instead:

| Argument | Environment Variable | Description |
|---|---|---|
| `gateway_url` | `MESHGUARD_GATEWAY_URL` | MeshGuard gateway URL |
| `admin_token` | `MESHGUARD_ADMIN_TOKEN` | Admin API token |

Using environment variables keeps secrets out of your Terraform files:

```bash
export MESHGUARD_GATEWAY_URL="https://gw.meshguard.app"
export MESHGUARD_ADMIN_TOKEN="msat_your-production-token"
terraform plan
```

## Managing Agents

The `meshguard_agent` resource registers an agent with the MeshGuard gateway, assigning it an identity, trust tier, and metadata.

### Basic Agent

```hcl
resource "meshguard_agent" "code_reviewer" {
  name       = "code-reviewer"
  trust_tier = "verified"
  tags       = ["ci", "code-review"]
  metadata = {
    team        = "platform"
    environment = "production"
  }
}
```

### Trust Tiers

Every agent has a trust tier that determines its baseline permissions. The tiers, from least to most privileged:

| Tier | Use Case |
|---|---|
| `unverified` | New or untrusted agents, most restrictive |
| `verified` | Identity confirmed, moderate access |
| `trusted` | Established agents with track record |
| `privileged` | Administrative agents with broad access |

### Accessing Agent Outputs

When Terraform creates an agent, the gateway returns an API key. Use outputs to capture it:

```hcl
output "code_reviewer_id" {
  description = "ID of the code-reviewer agent"
  value       = meshguard_agent.code_reviewer.id
}

output "code_reviewer_api_key" {
  description = "API key for the code-reviewer agent"
  value       = meshguard_agent.code_reviewer.api_key
  sensitive   = true
}
```

### Multiple Agents with for_each

When you have many agents with similar configuration, use `for_each`:

```hcl
variable "agents" {
  description = "Map of agent configurations"
  type = map(object({
    trust_tier = string
    tags       = list(string)
    team       = string
  }))
  default = {
    code-reviewer = {
      trust_tier = "verified"
      tags       = ["ci", "code-review"]
      team       = "platform"
    }
    doc-summarizer = {
      trust_tier = "trusted"
      tags       = ["docs"]
      team       = "content"
    }
    deployment-bot = {
      trust_tier = "privileged"
      tags       = ["ci", "deploy"]
      team       = "platform"
    }
  }
}

resource "meshguard_agent" "agents" {
  for_each   = var.agents
  name       = each.key
  trust_tier = each.value.trust_tier
  tags       = each.value.tags
  metadata = {
    team        = each.value.team
    environment = var.environment
  }
}
```

## Managing Policies

The `meshguard_policy` resource manages YAML policy documents. You can define policies inline or load them from files.

### Inline Policy

```hcl
resource "meshguard_policy" "code_review_policy" {
  name = "code-review-policy"
  content = yamlencode({
    name          = "code-review-policy"
    version       = "1.0"
    description   = "Policy for code review agents"
    appliesTo     = { tags = ["code-review"] }
    defaultEffect = "deny"
    rules = [
      {
        name   = "allow-read-repos"
        effect = "allow"
        conditions = {
          action = ["read"]
          path   = ["/api/repos/*"]
        }
      },
      {
        name   = "allow-post-comments"
        effect = "allow"
        conditions = {
          action = ["write"]
          path   = ["/api/repos/*/comments"]
        }
      },
    ]
  })
}
```

### File-Based Policy

For complex policies, keep the YAML in a separate file and reference it:

```hcl
resource "meshguard_policy" "production_guardrails" {
  name    = "production-guardrails"
  content = file("policies/production-guardrails.yaml")
}
```

```yaml
# policies/production-guardrails.yaml
name: production-guardrails
version: "1.0"
description: Restrict dangerous actions for unverified agents

appliesTo:
  trustTiers:
    - unverified
    - verified

rules:
  - name: deny-destructive
    effect: deny
    actions:
      - "tool:exec"
      - "admin:*"
      - "write:delete"
  - name: allow-reads
    effect: allow
    actions:
      - "read:*"

defaultEffect: deny
```

### Policy per Agent

Combine `for_each` with templatefile for agent-specific policies:

```hcl
resource "meshguard_policy" "agent_policies" {
  for_each = var.agents
  name     = "${each.key}-policy"
  content  = templatefile("policies/agent-policy.yaml.tpl", {
    agent_name = each.key
    trust_tier = each.value.trust_tier
    tags       = each.value.tags
  })
}
```

```yaml
# policies/agent-policy.yaml.tpl
name: ${agent_name}-policy
version: "1.0"
description: Auto-generated policy for ${agent_name}

appliesTo:
  tags:
%{ for tag in tags ~}
    - ${tag}
%{ endfor ~}

rules:
  - name: allow-reads
    effect: allow
    actions:
      - "read:*"
%{ if trust_tier == "privileged" ~}
  - name: allow-writes
    effect: allow
    actions:
      - "write:*"
%{ endif ~}

defaultEffect: deny
```

## Managing Alert Channels

The `meshguard_alert_channel` resource configures where governance events are sent.

### Slack

```hcl
resource "meshguard_alert_channel" "slack_alerts" {
  type          = "slack"
  endpoint      = "https://hooks.slack.com/services/T00/B00/xxx"
  slack_channel = "#meshguard-alerts"
  severity      = "warning"
  triggers      = ["deny", "error"]
}
```

### PagerDuty

```hcl
resource "meshguard_alert_channel" "pagerduty_critical" {
  type                  = "pagerduty"
  endpoint              = "https://events.pagerduty.com/v2/enqueue"
  pagerduty_routing_key = var.pagerduty_key
  severity              = "critical"
  triggers              = ["deny"]
}

variable "pagerduty_key" {
  description = "PagerDuty routing key"
  type        = string
  sensitive   = true
}
```

### Severity-Based Routing

Route different severity levels to different channels:

```hcl
# Warnings go to Slack
resource "meshguard_alert_channel" "slack_warnings" {
  type          = "slack"
  endpoint      = var.slack_webhook_url
  slack_channel = "#meshguard-warnings"
  severity      = "warning"
  triggers      = ["deny"]
}

# Critical events go to PagerDuty
resource "meshguard_alert_channel" "pagerduty_critical" {
  type                  = "pagerduty"
  endpoint              = "https://events.pagerduty.com/v2/enqueue"
  pagerduty_routing_key = var.pagerduty_key
  severity              = "critical"
  triggers              = ["deny", "error"]
}

# Everything goes to the audit Slack channel for the record
resource "meshguard_alert_channel" "slack_audit" {
  type          = "slack"
  endpoint      = var.slack_webhook_url
  slack_channel = "#meshguard-audit"
  severity      = "info"
  triggers      = ["deny", "allow", "error"]
}
```

## Data Sources

Use data sources to read existing resources from the gateway.

### List All Agents

```hcl
data "meshguard_agents" "all" {}

output "total_agents" {
  value = data.meshguard_agents.all.count
}
```

### Filter by Trust Tier

```hcl
data "meshguard_agents" "trusted_only" {
  trust_tier = "trusted"
}
```

### List All Policies

```hcl
data "meshguard_policies" "all" {}

output "policy_count" {
  value = length(data.meshguard_policies.all.policies)
}
```

## Complete Example

Here's a full Terraform configuration for a team running three agents with environment-specific policies and alerting:

```hcl
terraform {
  required_providers {
    meshguard = {
      source  = "registry.terraform.io/meshguard/meshguard"
      version = "~> 0.1"
    }
  }

  backend "s3" {
    bucket = "your-org-terraform-state"
    key    = "meshguard/production.tfstate"
    region = "us-east-1"
  }
}

# --- Provider ---

provider "meshguard" {
  gateway_url = var.gateway_url
  admin_token = var.admin_token
}

# --- Variables ---

variable "gateway_url" {
  description = "MeshGuard gateway URL"
  type        = string
}

variable "admin_token" {
  description = "MeshGuard admin token"
  type        = string
  sensitive   = true
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "production"
}

variable "slack_webhook_url" {
  description = "Slack webhook URL for alerts"
  type        = string
  sensitive   = true
}

variable "pagerduty_key" {
  description = "PagerDuty routing key"
  type        = string
  sensitive   = true
  default     = ""
}

# --- Agents ---

resource "meshguard_agent" "code_reviewer" {
  name       = "code-reviewer"
  trust_tier = "verified"
  tags       = ["ci", "code-review"]
  metadata = {
    team        = "platform"
    environment = var.environment
  }
}

resource "meshguard_agent" "summarizer" {
  name       = "doc-summarizer"
  trust_tier = "trusted"
  tags       = ["docs"]
  metadata = {
    team        = "content"
    environment = var.environment
  }
}

resource "meshguard_agent" "deployment_bot" {
  name       = "deployment-bot"
  trust_tier = "privileged"
  tags       = ["ci", "deploy"]
  metadata = {
    team        = "platform"
    environment = var.environment
  }
}

# --- Policies ---

resource "meshguard_policy" "code_review" {
  name    = "code-review-policy"
  content = file("policies/code-review.yaml")
}

resource "meshguard_policy" "summarizer" {
  name    = "summarizer-policy"
  content = file("policies/summarizer.yaml")
}

resource "meshguard_policy" "deployment" {
  name    = "deployment-policy"
  content = file("policies/deployment.yaml")
}

resource "meshguard_policy" "global_guardrails" {
  name    = "global-guardrails"
  content = file("policies/global-guardrails.yaml")
}

# --- Alert Channels ---

resource "meshguard_alert_channel" "slack" {
  type          = "slack"
  endpoint      = var.slack_webhook_url
  slack_channel = "#meshguard-${var.environment}"
  severity      = "warning"
  triggers      = ["deny", "error"]
}

resource "meshguard_alert_channel" "pagerduty" {
  count                 = var.pagerduty_key != "" ? 1 : 0
  type                  = "pagerduty"
  endpoint              = "https://events.pagerduty.com/v2/enqueue"
  pagerduty_routing_key = var.pagerduty_key
  severity              = "critical"
  triggers              = ["deny"]
}

# --- Outputs ---

output "agent_ids" {
  description = "Map of agent names to IDs"
  value = {
    code_reviewer  = meshguard_agent.code_reviewer.id
    summarizer     = meshguard_agent.summarizer.id
    deployment_bot = meshguard_agent.deployment_bot.id
  }
}

output "agent_api_keys" {
  description = "Map of agent names to API keys"
  sensitive   = true
  value = {
    code_reviewer  = meshguard_agent.code_reviewer.api_key
    summarizer     = meshguard_agent.summarizer.api_key
    deployment_bot = meshguard_agent.deployment_bot.api_key
  }
}
```

## State Management

Terraform state contains sensitive data — agent API keys, admin tokens referenced in resources, and the full configuration of your governance layer. Treat it accordingly.

### Remote State

Always use a remote backend with encryption:

```hcl
terraform {
  backend "s3" {
    bucket         = "your-org-terraform-state"
    key            = "meshguard/production.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-locks"
  }
}
```

### State Locking

Enable state locking to prevent concurrent modifications. With S3, use a DynamoDB table:

```hcl
resource "aws_dynamodb_table" "terraform_locks" {
  name         = "terraform-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }
}
```

### Workspaces for Environments

Use Terraform workspaces to manage multiple environments with the same code:

```bash
terraform workspace new staging
terraform workspace new production

# Deploy to staging
terraform workspace select staging
terraform apply -var-file="environments/staging.tfvars"

# Deploy to production
terraform workspace select production
terraform apply -var-file="environments/production.tfvars"
```

```hcl
# environments/staging.tfvars
gateway_url       = "https://gw-staging.meshguard.app"
environment       = "staging"
slack_webhook_url = "https://hooks.slack.com/services/staging/..."
```

```hcl
# environments/production.tfvars
gateway_url       = "https://gw.meshguard.app"
environment       = "production"
slack_webhook_url = "https://hooks.slack.com/services/production/..."
pagerduty_key     = "your-production-routing-key"
```

## Team Workflows

### Pull Request Flow

1. Developer creates a branch and modifies a policy file or agent configuration
2. CI runs `terraform plan` and posts the output as a PR comment (see [CI/CD Policy Checks with GitHub Actions](/guides/github-actions-policy-checks))
3. The team reviews the plan diff — they can see exactly which agents, policies, or alerts will change
4. After approval, merge triggers `terraform apply`

### Policy Review Process

Policy changes are the most sensitive Terraform changes. Add a `CODEOWNERS` file to require security team review:

```
# .github/CODEOWNERS
policies/                @your-org/security-team
*.tf                     @your-org/platform-team
environments/production* @your-org/security-team @your-org/platform-team
```

### Import Existing Resources

If you already have agents and policies created through the admin API, import them into Terraform state:

```bash
# Import an existing agent
terraform import meshguard_agent.code_reviewer agent_abc123

# Import an existing policy
terraform import meshguard_policy.production_guardrails policy_def456
```

After import, run `terraform plan` to verify the code matches the live state. Adjust your HCL until the plan shows no changes.

## Common Patterns

### Environment Promotion

Define policies once, promote across environments:

```
infra/
  modules/
    meshguard/
      main.tf        # Agent + policy + alert resources
      variables.tf   # Parameterized by environment
      outputs.tf
  environments/
    staging/
      main.tf        # module "meshguard" with staging vars
    production/
      main.tf        # module "meshguard" with production vars
```

```hcl
# infra/environments/production/main.tf
module "meshguard" {
  source = "../../modules/meshguard"

  environment       = "production"
  gateway_url       = "https://gw.meshguard.app"
  admin_token       = var.admin_token
  slack_webhook_url = var.slack_webhook_url
  pagerduty_key     = var.pagerduty_key
}
```

### Drift Detection

Run `terraform plan` on a schedule to detect configuration drift:

```yaml
# .github/workflows/drift-detection.yml
name: Terraform Drift Detection
on:
  schedule:
    - cron: "0 */6 * * *"    # Every 6 hours

jobs:
  drift-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3

      - name: Terraform Plan
        run: terraform plan -detailed-exitcode -no-color
        env:
          MESHGUARD_GATEWAY_URL: ${{ secrets.MESHGUARD_GATEWAY_URL }}
          MESHGUARD_ADMIN_TOKEN: ${{ secrets.MESHGUARD_ADMIN_TOKEN }}

      - name: Alert on drift
        if: failure()
        run: |
          curl -X POST "$SLACK_WEBHOOK" \
            -H "Content-Type: application/json" \
            -d '{"text":"Terraform drift detected in MeshGuard configuration"}'
```

## Quick-Start Checklist

- [ ] **Install the provider** — Add the `meshguard` provider to your `required_providers` block
- [ ] **Configure authentication** — Set `MESHGUARD_GATEWAY_URL` and `MESHGUARD_ADMIN_TOKEN` as environment variables
- [ ] **Import existing resources** — If you have agents or policies already, import them into state
- [ ] **Define agents as code** — Create `meshguard_agent` resources for each agent in your mesh
- [ ] **Define policies as code** — Store policy YAML in version-controlled files, reference them with `file()`
- [ ] **Configure alert channels** — Route governance events to Slack, PagerDuty, or your preferred platform
- [ ] **Set up remote state** — Use an encrypted remote backend with state locking
- [ ] **Add CI/CD** — Run `terraform plan` on PRs and `terraform apply` on merge
- [ ] **Add CODEOWNERS** — Require security team review for policy changes
- [ ] **Schedule drift detection** — Run `terraform plan` periodically to catch out-of-band changes

## Where This Connects

- [CI/CD Policy Checks with GitHub Actions](/guides/github-actions-policy-checks) validates policy YAML syntax and semantics before Terraform applies them
- [Guardian Sidecar Deployment](/guides/deploying-guardian-sidecar) covers the runtime deployment that consumes these Terraform-managed resources
- [Policy Design Patterns](/concepts/policy-design-patterns) guides how to structure the policies you manage with Terraform
- [Trust Tiers Explained](/concepts/trust-tiers) explains the trust model behind the `trust_tier` field on agent resources
