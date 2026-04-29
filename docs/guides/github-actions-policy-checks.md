---
title: CI/CD Policy Checks with GitHub Actions
description: How to validate MeshGuard policies in pull requests using the meshguard-action GitHub Action, with workflow examples for validate mode, dry-run mode, branch protection, and multi-environment pipelines.
outline: deep
---

# CI/CD Policy Checks with GitHub Actions

How to validate MeshGuard policies in pull requests using the meshguard-action GitHub Action, with workflow examples for validate mode, dry-run mode, branch protection, and multi-environment pipelines.

## Shift-Left Governance

A policy error in production is an incident. A policy error in a pull request is a review comment.

The MeshGuard GitHub Action (`meshguard/meshguard-action@v1`) brings governance checks into your CI/CD pipeline, so policy misconfigurations are caught before they reach your gateway. It supports two modes:

1. **Validate mode** — Parses YAML policy files locally and checks structural correctness. No gateway required. Fast, offline, good for every PR.
2. **Dry-run mode** — Sends policies to a live gateway for semantic validation and tests specific actions against them. Catches issues that syntax checking alone can't find.

Both modes produce structured output (pass/fail result + JSON details) that you can use in downstream workflow steps, pull request comments, and branch protection rules.

## The Action

### Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `gateway-url` | Yes | — | MeshGuard gateway URL |
| `api-key` | Yes | — | MeshGuard API key |
| `policy-path` | No | `policies/` | Path to YAML policy files |
| `check-mode` | No | `validate` | `validate` (syntax only) or `dry-run` (test against gateway) |
| `fail-on-warning` | No | `false` | Fail the action if any warnings are found |
| `agent-id` | No | — | Agent ID for dry-run checks |
| `actions` | No | — | Comma-separated actions to test in dry-run mode |

### Outputs

| Output | Description |
|---|---|
| `result` | `pass` or `fail` |
| `details` | JSON string with validation results |

## Validate Mode

Validate mode parses each YAML policy file and checks its structure without contacting the gateway. It verifies:

- The file contains a valid YAML object
- Required fields are present: `name`, `rules`, `appliesTo`
- `rules` is a non-empty array
- Each rule has a valid `effect` (`allow` or `deny`) and a non-empty `actions` array
- `defaultEffect` is `allow` or `deny` if present

It also produces warnings for:
- Missing `version` field
- `appliesTo` with no `trustTiers`, `agentIds`, `tags`, or `orgIds` (policy would match no agents)
- Missing or invalid `defaultEffect` (defaults to `deny`)

### Basic Validate Workflow

```yaml
name: Validate Policies
on:
  pull_request:
    paths:
      - "policies/**"

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: MeshGuard policy check
        uses: meshguard/meshguard-action@v1
        with:
          gateway-url: ${{ secrets.MESHGUARD_GATEWAY_URL }}
          api-key: ${{ secrets.MESHGUARD_API_KEY }}
          policy-path: policies/
          check-mode: validate
```

This workflow runs on every PR that touches files in `policies/`. If any policy file has a structural error, the action fails and the PR check turns red.

### Validate with Strict Warnings

To catch warnings as well as errors, set `fail-on-warning`:

```yaml
      - name: MeshGuard policy check (strict)
        uses: meshguard/meshguard-action@v1
        with:
          gateway-url: ${{ secrets.MESHGUARD_GATEWAY_URL }}
          api-key: ${{ secrets.MESHGUARD_API_KEY }}
          policy-path: policies/
          check-mode: validate
          fail-on-warning: "true"
```

With `fail-on-warning: "true"`, a missing `version` field or an `appliesTo` with no targets will fail the check. This is recommended for production policy directories.

## Dry-Run Mode

Dry-run mode goes beyond syntax checking. It sends each policy to the gateway's `/admin/policies/validate` endpoint for semantic validation, then tests specific actions against `/admin/policies/test` to verify that the policy produces the expected decisions.

This catches issues that validate mode cannot:
- Action patterns that don't match any known action types
- `appliesTo` configurations that conflict with existing policies
- Policy ordering issues where a deny rule shadows an allow rule (or vice versa)
- Trust tier references that don't exist in the gateway

### Basic Dry-Run Workflow

```yaml
name: Dry-Run Policy Tests
on:
  pull_request:
    paths:
      - "policies/**"

jobs:
  dry-run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: MeshGuard dry-run check
        id: policy-check
        uses: meshguard/meshguard-action@v1
        with:
          gateway-url: ${{ secrets.MESHGUARD_GATEWAY_URL }}
          api-key: ${{ secrets.MESHGUARD_API_KEY }}
          policy-path: policies/
          check-mode: dry-run
          agent-id: agent-ci-test
          actions: "read:data,write:config,tool:exec"
          fail-on-warning: "true"

      - name: Show results
        if: always()
        run: |
          echo "Result: ${{ steps.policy-check.outputs.result }}"
          echo '${{ steps.policy-check.outputs.details }}' | jq .
```

The `agent-id` and `actions` inputs tell the action which agent identity and which actions to test against the policy. In the example above, the action tests whether `agent-ci-test` would be allowed or denied for `read:data`, `write:config`, and `tool:exec` under the proposed policies.

### Dry-Run with Action Testing Matrix

For thorough testing, define a matrix of agent/action combinations:

```yaml
name: Policy Test Matrix
on:
  pull_request:
    paths:
      - "policies/**"

jobs:
  test-policies:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        include:
          - agent: code-reviewer
            actions: "read:repos,write:comments"
            expect: pass
          - agent: doc-summarizer
            actions: "read:docs,read:repos"
            expect: pass
          - agent: untrusted-bot
            actions: "admin:delete,tool:exec"
            expect: fail    # These should be denied

    steps:
      - uses: actions/checkout@v4

      - name: Test ${{ matrix.agent }}
        id: check
        uses: meshguard/meshguard-action@v1
        with:
          gateway-url: ${{ secrets.MESHGUARD_GATEWAY_URL }}
          api-key: ${{ secrets.MESHGUARD_API_KEY }}
          policy-path: policies/
          check-mode: dry-run
          agent-id: ${{ matrix.agent }}
          actions: ${{ matrix.actions }}

      - name: Verify expected outcome
        run: |
          RESULT="${{ steps.check.outputs.result }}"
          EXPECTED="${{ matrix.expect }}"
          if [ "$RESULT" != "$EXPECTED" ]; then
            echo "FAIL: Expected $EXPECTED but got $RESULT for agent ${{ matrix.agent }}"
            exit 1
          fi
          echo "OK: ${{ matrix.agent }} returned $RESULT (expected $EXPECTED)"
```

This pattern lets you encode your governance expectations as test cases. If a policy change would accidentally allow `tool:exec` for `untrusted-bot`, the matrix catch catches it.

## Using Outputs in Downstream Steps

The action produces two outputs: `result` (pass/fail) and `details` (JSON). Use them to gate deployments, post PR comments, or trigger alerts.

### Gate a Deployment

```yaml
      - name: Deploy policies
        if: steps.policy-check.outputs.result == 'pass'
        run: |
          # Only deploy if policy checks passed
          ./scripts/deploy-policies.sh

      - name: Block deployment
        if: steps.policy-check.outputs.result == 'fail'
        run: |
          echo "Policy check failed — blocking deploy"
          echo '${{ steps.policy-check.outputs.details }}' | jq .
          exit 1
```

### Post Results as PR Comment

```yaml
      - name: Comment on PR
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            const result = '${{ steps.policy-check.outputs.result }}';
            const details = JSON.parse('${{ steps.policy-check.outputs.details }}');
            const icon = result === 'pass' ? ':white_check_mark:' : ':x:';
            const body = `## ${icon} MeshGuard Policy Check: ${result.toUpperCase()}

            \`\`\`json
            ${JSON.stringify(details, null, 2)}
            \`\`\``;

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: body,
            });
```

## Branch Protection Integration

Use GitHub branch protection rules to require the policy check to pass before merging.

### Setup

1. Go to **Settings > Branches > Branch protection rules** for your repository
2. Select or create a rule for your main branch
3. Check **Require status checks to pass before merging**
4. Search for and add the job name (e.g., `validate` or `dry-run`)
5. Optionally check **Require branches to be up to date** to ensure the check runs on the latest code

### Required Checks Workflow

Name the job clearly so it's easy to find in branch protection settings:

```yaml
name: Policy Governance
on:
  pull_request:
    paths:
      - "policies/**"
      - "*.tf"

jobs:
  policy-check:     # This is the name you add to branch protection
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Validate syntax
        uses: meshguard/meshguard-action@v1
        with:
          gateway-url: ${{ secrets.MESHGUARD_GATEWAY_URL }}
          api-key: ${{ secrets.MESHGUARD_API_KEY }}
          check-mode: validate
          fail-on-warning: "true"

      - name: Dry-run against gateway
        uses: meshguard/meshguard-action@v1
        with:
          gateway-url: ${{ secrets.MESHGUARD_GATEWAY_URL }}
          api-key: ${{ secrets.MESHGUARD_API_KEY }}
          check-mode: dry-run
          agent-id: agent-ci-test
          actions: "read:data,write:config,tool:exec,admin:delete"
          fail-on-warning: "true"
```

Now no PR that touches policies or Terraform files can merge without passing both validate and dry-run checks.

## Multi-Environment Pipeline

For teams that promote policies from staging to production, run checks against both environments:

```yaml
name: Policy Promotion Pipeline
on:
  pull_request:
    paths:
      - "policies/**"
  push:
    branches:
      - main
    paths:
      - "policies/**"

jobs:
  # Always run: validate syntax
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Validate syntax
        uses: meshguard/meshguard-action@v1
        with:
          gateway-url: ${{ secrets.MESHGUARD_GATEWAY_URL_STAGING }}
          api-key: ${{ secrets.MESHGUARD_API_KEY_STAGING }}
          check-mode: validate
          fail-on-warning: "true"

  # PR only: dry-run against staging
  staging-dry-run:
    if: github.event_name == 'pull_request'
    needs: validate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Dry-run (staging)
        uses: meshguard/meshguard-action@v1
        with:
          gateway-url: ${{ secrets.MESHGUARD_GATEWAY_URL_STAGING }}
          api-key: ${{ secrets.MESHGUARD_API_KEY_STAGING }}
          check-mode: dry-run
          agent-id: agent-ci-test
          actions: "read:data,write:config,tool:exec"
          fail-on-warning: "true"

  # On merge to main: deploy to staging, then dry-run against production
  deploy-staging:
    if: github.event_name == 'push'
    needs: validate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to staging
        run: ./scripts/deploy-policies.sh staging

  production-dry-run:
    if: github.event_name == 'push'
    needs: deploy-staging
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Dry-run (production)
        uses: meshguard/meshguard-action@v1
        with:
          gateway-url: ${{ secrets.MESHGUARD_GATEWAY_URL_PRODUCTION }}
          api-key: ${{ secrets.MESHGUARD_API_KEY_PRODUCTION }}
          check-mode: dry-run
          agent-id: agent-ci-test
          actions: "read:data,write:config,tool:exec"
          fail-on-warning: "true"
```

## Policy File Format Reference

For completeness, here's the full policy YAML schema that the action validates:

```yaml
# Required
name: production-guardrails
rules:
  - effect: deny               # Required: "allow" or "deny"
    actions:                    # Required: non-empty array
      - "tool:exec"
      - "admin:*"

# Validated but optional
version: "1.0"                  # Warning if missing
description: Human-readable description

appliesTo:                      # Warning if no targets
  trustTiers:
    - unverified
    - verified
  agentIds:
    - agent-abc123
  tags:
    - production
  orgIds:
    - org-xyz789

defaultEffect: deny             # Warning if missing; defaults to "deny"
```

### Validation Rules Summary

| Check | Level | Description |
|---|---|---|
| File is valid YAML object | Error | Must parse as a YAML mapping |
| `name` is present | Error | Required string field |
| `rules` is non-empty array | Error | Must have at least one rule |
| `rules[].effect` is `allow` or `deny` | Error | Required on each rule |
| `rules[].actions` is non-empty array | Error | Required on each rule |
| `version` is present | Warning | Recommended for tracking |
| `appliesTo` has at least one target | Warning | Policy matches no agents without targets |
| `defaultEffect` is `allow` or `deny` | Warning | Defaults to `deny` if missing |

## Secrets Management

The action needs two secrets: your gateway URL and an API key. Store them as GitHub Actions secrets:

1. Go to **Settings > Secrets and variables > Actions**
2. Add `MESHGUARD_GATEWAY_URL` — your gateway endpoint (e.g., `https://gw.meshguard.app`)
3. Add `MESHGUARD_API_KEY` — an API key with permission to validate and test policies

For multi-environment setups, use environment-scoped secrets:

1. Create GitHub environments: `staging`, `production`
2. Add `MESHGUARD_GATEWAY_URL` and `MESHGUARD_API_KEY` to each environment
3. Reference them in workflow jobs:

```yaml
jobs:
  staging-check:
    environment: staging
    runs-on: ubuntu-latest
    steps:
      - uses: meshguard/meshguard-action@v1
        with:
          gateway-url: ${{ secrets.MESHGUARD_GATEWAY_URL }}
          api-key: ${{ secrets.MESHGUARD_API_KEY }}
```

## Combining with Terraform

If you manage MeshGuard resources with the [Terraform provider](/guides/terraform-agent-governance), run both the policy check and `terraform plan` in the same pipeline:

```yaml
name: Governance CI
on:
  pull_request:
    paths:
      - "policies/**"
      - "infra/**"

jobs:
  policy-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Validate policies
        uses: meshguard/meshguard-action@v1
        with:
          gateway-url: ${{ secrets.MESHGUARD_GATEWAY_URL }}
          api-key: ${{ secrets.MESHGUARD_API_KEY }}
          check-mode: validate
          fail-on-warning: "true"

  terraform-plan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3

      - name: Terraform Init
        working-directory: infra/
        run: terraform init

      - name: Terraform Plan
        working-directory: infra/
        run: terraform plan -no-color
        env:
          MESHGUARD_GATEWAY_URL: ${{ secrets.MESHGUARD_GATEWAY_URL }}
          MESHGUARD_ADMIN_TOKEN: ${{ secrets.MESHGUARD_ADMIN_TOKEN }}
```

## Quick-Start Checklist

- [ ] **Add secrets** — Store `MESHGUARD_GATEWAY_URL` and `MESHGUARD_API_KEY` as repository secrets
- [ ] **Create a validate workflow** — Run syntax checks on every PR that touches policies
- [ ] **Enable fail-on-warning** — Catch missing `version` fields and empty `appliesTo` targets
- [ ] **Add dry-run checks** — Test actions against a staging gateway for semantic validation
- [ ] **Set up branch protection** — Require the policy check job to pass before merging
- [ ] **Post PR comments** — Surface check results directly in the pull request
- [ ] **Add a test matrix** — Encode governance expectations as agent/action test cases
- [ ] **Combine with Terraform** — Run policy validation alongside `terraform plan`

## Where This Connects

- [Infrastructure as Code with Terraform](/guides/terraform-agent-governance) manages the resources that these policy checks validate
- [Guardian Sidecar Deployment](/guides/deploying-guardian-sidecar) is the runtime target where validated policies are deployed
- [Policy Design Patterns](/concepts/policy-design-patterns) guides how to write the policies that this action validates
- [Preventing Prompt Injection](/guides/preventing-prompt-injection) covers the threats that well-tested policies defend against
