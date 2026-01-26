# Governing Claude Code Agents with MeshGuard

A comprehensive guide to adding enterprise-grade governance to Claude Code — Anthropic's autonomous coding agent — using MeshGuard's governance control plane.

## Why Govern Claude Code Agents?

Claude Code is one of the most capable autonomous coding agents available. It can read your entire codebase, write and edit files, execute shell commands, browse the web, and operate for extended periods without human intervention. This makes it extraordinarily productive — and extraordinarily risky without guardrails.

### The Risks

- **Unrestricted file access:** Claude Code can read any file on your system, including `.env` files, SSH keys, AWS credentials, and proprietary source code
- **Arbitrary shell execution:** The `exec` tool runs Bash commands with the permissions of the user who launched Claude Code — including `rm -rf`, `sudo`, and network commands
- **Code deletion:** A single bad command can delete hours of work, or worse, production code
- **Data exfiltration:** Shell commands like `curl`, `wget`, and `scp` can send data to external servers
- **Supply chain attacks:** Compromised instructions (via prompt injection in codebases) could cause Claude Code to install malicious packages or modify build scripts
- **Credential exposure:** Reading and potentially logging contents of secret files
- **Unaudited changes:** Without logging, you can't know what Claude Code did to your codebase after the fact

### What MeshGuard Adds

MeshGuard wraps every Claude Code tool invocation with policy-based governance:

1. **Pre-execution checks** — Every file read, write, shell command, and web request is checked against your policies *before* it runs
2. **Centralized audit trail** — Full log of what Claude Code did, when, and whether it was allowed
3. **Dynamic policies** — Context-aware rules (time of day, resource patterns, command semantics)
4. **Graceful denials** — Claude Code receives clear explanations when actions are blocked
5. **Audit mode** — Test policies without blocking, then switch to enforce

## Prerequisites

Before starting, you'll need:

- **Claude Code** installed and working (`claude` CLI)
- **Python 3.9+** (for the MeshGuard hook scripts)
- **MeshGuard account** — [sign up free](https://meshguard.app)
- **MeshGuard API key** — from the [dashboard](https://dashboard.meshguard.app)
- **A project** to govern (any codebase Claude Code works on)

## Step 1: Set Up MeshGuard Credentials

First, install the MeshGuard SDK and configure your credentials:

```bash
# Install MeshGuard
pip install meshguard

# Set your credentials
export MESHGUARD_API_KEY="mg_live_abc123..."
export MESHGUARD_GATEWAY_URL="https://dashboard.meshguard.app"
export MESHGUARD_AGENT_NAME="claude-code-dev"
```

Add these to your shell profile (`~/.zshrc`, `~/.bashrc`) so they persist across sessions.

Verify the connection:

```bash
meshguard agent ping
# Output: ✅ Connected to MeshGuard gateway (latency: 45ms)
```

## Step 2: Create the Hooks Integration Script

Claude Code supports a **hooks system** that runs scripts before and after each tool invocation. We'll create a pre-tool hook that calls MeshGuard.

### Pre-Tool Hook: `meshguard_hook.py`

Create `.claude/hooks/meshguard_hook.py` in your project:

```python
#!/usr/bin/env python3
"""
MeshGuard Pre-Tool Hook for Claude Code

This script is called by Claude Code before every tool invocation.
It reads the tool name and input from stdin (JSON), checks MeshGuard
policy, and exits with code 0 (allow) or 1 (deny).

Usage in .claude/settings.json:
{
  "hooks": {
    "pre-tool": [{"command": "python3 .claude/hooks/meshguard_hook.py"}]
  }
}
"""

import json
import sys
import os
import logging

logging.basicConfig(
    filename=os.path.expanduser("~/.meshguard/claude-code-hook.log"),
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)

from meshguard import MeshGuardClient, PolicyDeniedError

# Initialize client once (reused across calls)
client = MeshGuardClient(
    gateway_url=os.getenv("MESHGUARD_GATEWAY_URL", "https://dashboard.meshguard.app"),
    agent_token=os.getenv("MESHGUARD_API_KEY"),
)

# Map Claude Code tools to MeshGuard actions
TOOL_ACTION_MAP = {
    "Read": ("read:file", lambda inp: inp.get("path", inp.get("file_path", ""))),
    "Write": ("write:file", lambda inp: inp.get("path", inp.get("file_path", ""))),
    "Edit": ("write:file", lambda inp: inp.get("path", inp.get("file_path", ""))),
    "exec": ("execute:shell", lambda inp: inp.get("command", "")),
    "web_search": ("read:web_search", lambda inp: inp.get("query", "")),
    "web_fetch": ("read:web_fetch", lambda inp: inp.get("url", "")),
    "browser": ("read:web_browse", lambda inp: inp.get("targetUrl", inp.get("action", ""))),
}


def get_action_and_resource(tool_name: str, tool_input: dict) -> tuple:
    """Map a Claude Code tool call to a MeshGuard action + resource."""
    if tool_name in TOOL_ACTION_MAP:
        action, resource_fn = TOOL_ACTION_MAP[tool_name]
        return action, resource_fn(tool_input)
    return f"invoke:{tool_name}", json.dumps(tool_input)[:200]


def main():
    # Read hook input from stdin
    raw = sys.stdin.read()
    if not raw.strip():
        sys.exit(0)  # No input, allow

    hook_input = json.loads(raw)
    tool_name = hook_input.get("tool_name", "")
    tool_input = hook_input.get("tool_input", {})

    action, resource = get_action_and_resource(tool_name, tool_input)

    logging.info(f"Checking: {action} on {resource[:100]}")

    try:
        client.enforce(action, resource=resource, context={
            "tool": tool_name,
            "agent": "claude-code",
            "cwd": os.getcwd(),
        })
        logging.info(f"ALLOW: {action} on {resource[:100]}")
        sys.exit(0)

    except PolicyDeniedError as e:
        logging.warning(f"DENY: {action} on {resource[:100]} — {e.reason}")
        result = {
            "error": f"MeshGuard policy denied: {e.reason}",
            "policy": e.policy,
            "trace_id": e.trace_id,
        }
        print(json.dumps(result))
        sys.exit(1)

    except Exception as e:
        logging.error(f"ERROR: {e}")
        # Fail open or closed depending on your security posture
        # Fail open (allow on error):
        sys.exit(0)
        # Fail closed (deny on error):
        # print(json.dumps({"error": f"MeshGuard unavailable: {e}"}))
        # sys.exit(1)


if __name__ == "__main__":
    main()
```

### Post-Tool Hook: `post_hook.py`

Create `.claude/hooks/post_hook.py` for audit logging:

```python
#!/usr/bin/env python3
"""
MeshGuard Post-Tool Hook for Claude Code

Logs every completed tool invocation to MeshGuard's audit trail.
"""

import json
import sys
import os
from meshguard import MeshGuardClient

client = MeshGuardClient(
    gateway_url=os.getenv("MESHGUARD_GATEWAY_URL", "https://dashboard.meshguard.app"),
    agent_token=os.getenv("MESHGUARD_API_KEY"),
)

TOOL_ACTION_MAP = {
    "Read": "read:file",
    "Write": "write:file",
    "Edit": "write:file",
    "exec": "execute:shell",
    "web_search": "read:web_search",
    "web_fetch": "read:web_fetch",
    "browser": "read:web_browse",
}


def main():
    raw = sys.stdin.read()
    if not raw.strip():
        return

    hook_input = json.loads(raw)
    tool_name = hook_input.get("tool_name", "")
    tool_input = hook_input.get("tool_input", {})
    exit_code = hook_input.get("exit_code", 0)

    action = TOOL_ACTION_MAP.get(tool_name, f"invoke:{tool_name}")

    # Extract resource for audit context
    resource = ""
    if tool_name in ("Read", "Write", "Edit"):
        resource = tool_input.get("path", tool_input.get("file_path", ""))
    elif tool_name == "exec":
        resource = tool_input.get("command", "")[:200]
    elif tool_name == "web_fetch":
        resource = tool_input.get("url", "")
    elif tool_name == "web_search":
        resource = tool_input.get("query", "")

    client.audit_log(
        action=action,
        decision="allow",
        metadata={
            "tool": tool_name,
            "resource": resource,
            "exit_code": exit_code,
            "agent": "claude-code",
            "cwd": os.getcwd(),
        },
    )


if __name__ == "__main__":
    main()
```

## Step 3: Configure Claude Code Settings

Create or update `.claude/settings.json` in your project root:

```json
{
  "hooks": {
    "pre-tool": [
      {
        "command": "python3 .claude/hooks/meshguard_hook.py",
        "timeout": 10000
      }
    ],
    "post-tool": [
      {
        "command": "python3 .claude/hooks/post_hook.py",
        "timeout": 5000
      }
    ]
  },
  "permissions": {
    "allow": [
      "Read",
      "Write",
      "Edit",
      "exec",
      "web_search",
      "web_fetch"
    ]
  }
}
```

The `permissions.allow` list enables tools at the Claude Code level. MeshGuard's hooks then enforce fine-grained policy on top of this.

::: info Why allow tools at the Claude Code level?
Claude Code's built-in permissions are binary — a tool is either enabled or disabled entirely. By enabling tools and using MeshGuard hooks, you get granular control (e.g., allow `exec` for `git` but deny for `rm -rf`).
:::

## Step 4: Define Policies

Create a `policies/` directory in your project and define policies for each tool category.

### File Access Policy

```yaml
# policies/file-access.yaml
name: claude-code-file-access
version: "1.0"
description: Governs Claude Code file read/write operations

appliesTo:
  tags: [claude-code]

rules:
  # Allow reading any file in the project
  - effect: allow
    actions: ["read:file"]
    conditions:
      resource:
        matches: "./**"

  # Allow writing to source, tests, and docs
  - effect: allow
    actions: ["write:file"]
    conditions:
      resource:
        matches:
          - "./src/**"
          - "./tests/**"
          - "./docs/**"
          - "./*.md"
          - "./*.json"
          - "./*.yaml"
          - "./*.toml"

  # Block credential files
  - effect: deny
    actions: ["read:file", "write:file"]
    conditions:
      resource:
        matches:
          - "**/.env*"
          - "**/*.pem"
          - "**/*.key"
          - "**/id_rsa*"
          - "**/.ssh/**"
          - "**/.aws/**"
          - "**/.gcloud/**"
    reason: "Credential and secret file access is prohibited"

  # Block system files
  - effect: deny
    actions: ["read:file", "write:file"]
    conditions:
      resource:
        matches: ["/etc/**", "/var/**", "/usr/**", "/System/**"]
    reason: "System file access is prohibited"

defaultEffect: deny
```

### Shell Command Policy

```yaml
# policies/shell-commands.yaml
name: claude-code-shell-commands
version: "1.0"
description: Governs Claude Code shell command execution

appliesTo:
  tags: [claude-code]

rules:
  # Allow standard dev commands
  - effect: allow
    actions: ["execute:shell"]
    conditions:
      resource:
        startsWith:
          - "git "
          - "npm "
          - "npx "
          - "pnpm "
          - "python"
          - "pip"
          - "pytest "
          - "cargo "
          - "make "
          - "ls "
          - "cat "
          - "head "
          - "tail "
          - "grep "
          - "find "
          - "wc "
          - "echo "
          - "mkdir "

  # Block destructive commands
  - effect: deny
    actions: ["execute:shell"]
    conditions:
      resource:
        contains: ["rm -rf", "sudo ", "chmod 777", "> /dev/", "mkfs", "dd if="]
    reason: "Destructive or privileged commands are blocked"

  # Block network exfiltration
  - effect: deny
    actions: ["execute:shell"]
    conditions:
      resource:
        contains: ["curl ", "wget ", "nc ", "netcat ", "ssh ", "scp "]
    reason: "Network commands require explicit approval"

  # Block package publishing
  - effect: deny
    actions: ["execute:shell"]
    conditions:
      resource:
        contains: ["npm publish", "pip upload", "twine upload", "cargo publish"]
    reason: "Package publishing requires human approval"

defaultEffect: deny
```

### Web Access Policy

```yaml
# policies/web-access.yaml
name: claude-code-web-access
version: "1.0"
description: Governs Claude Code web browsing and fetching

appliesTo:
  tags: [claude-code]

rules:
  # Allow web search (all queries)
  - effect: allow
    actions: ["read:web_search"]

  # Allow documentation and package sites
  - effect: allow
    actions: ["read:web_fetch", "read:web_browse"]
    conditions:
      resource:
        matches:
          - "*docs.*"
          - "*github.com*"
          - "*stackoverflow.com*"
          - "*npmjs.com*"
          - "*pypi.org*"
          - "*crates.io*"
          - "*developer.mozilla.org*"

  # Block social media
  - effect: deny
    actions: ["read:web_fetch", "read:web_browse"]
    conditions:
      resource:
        matches: ["*twitter.com*", "*facebook.com*", "*reddit.com*", "*tiktok.com*"]
    reason: "Social media access is not permitted"

defaultEffect: deny
```

### Apply the Policies

```bash
meshguard policy apply ./policies/file-access.yaml
meshguard policy apply ./policies/shell-commands.yaml
meshguard policy apply ./policies/web-access.yaml

# Or apply all at once
meshguard policy apply ./policies/
```

## Step 5: Test in Audit Mode

Before enforcing policies, run in **audit mode** to see what would be blocked:

```bash
# Enable audit mode
export MESHGUARD_MODE=audit

# Run Claude Code normally
claude

# Claude Code operates without restrictions, but all policy decisions are logged
```

Review the audit log to tune your policies:

```bash
# See what would have been denied
meshguard audit query --agent claude-code-dev --decision deny --limit 50

# Example output:
# 2026-01-26 14:30:22  execute:shell  DENY  "curl https://api.example.com"
#   → Reason: Network commands require explicit approval
#   → Policy: claude-code-shell-commands
#
# 2026-01-26 14:31:05  read:file      DENY  "/etc/hosts"
#   → Reason: System file access is prohibited
#   → Policy: claude-code-file-access
```

If you see legitimate actions being denied, adjust your policies:

```bash
# Test a specific action against policy
meshguard policy test claude-code-dev "execute:shell" --resource "git status"
# Output: ALLOW (rule: allow-dev-commands)

meshguard policy test claude-code-dev "execute:shell" --resource "curl https://api.example.com"
# Output: DENY (rule: deny-network-commands, reason: Network commands require explicit approval)
```

## Step 6: Switch to Enforce Mode

Once you're satisfied with your policies:

```bash
# Switch to enforce mode
export MESHGUARD_MODE=enforce

# Now Claude Code's actions will be blocked when policy denies them
claude
```

When Claude Code tries a denied action, it receives a clear error:

```
MeshGuard policy denied: Network commands require explicit approval
Policy: claude-code-shell-commands
Trace: trace_abc123xyz
```

Claude Code will then explain the denial to the user and suggest alternatives.

## Real-World Scenarios

### Junior Developer Agent

A Claude Code agent for junior developers — read-only access to production code, write only to feature branches:

```yaml
name: junior-dev-agent
version: "1.0"
description: Junior developer with limited write access

appliesTo:
  tags: [claude-code, junior-dev]

rules:
  # Read any file in the repo
  - effect: allow
    actions: ["read:file"]
    conditions:
      resource:
        matches: "./**"

  # Write only to feature branch files (enforced by checking branch)
  - effect: allow
    actions: ["write:file"]
    conditions:
      resource:
        matches: ["./src/**", "./tests/**"]

  # Allow basic git and test commands
  - effect: allow
    actions: ["execute:shell"]
    conditions:
      resource:
        startsWith: ["git ", "npm test", "npm run lint", "pytest "]

  # Block git push to main/production
  - effect: deny
    actions: ["execute:shell"]
    conditions:
      resource:
        contains: ["git push origin main", "git push origin production"]
    reason: "Junior devs cannot push directly to main. Create a PR instead."

  # Block all destructive operations
  - effect: deny
    actions: ["execute:shell"]
    conditions:
      resource:
        contains: ["rm -rf", "git reset --hard", "git force-push"]
    reason: "Destructive operations require senior review"

defaultEffect: deny
```

### Code Review Agent

A Claude Code agent that can only read files — no writing, no execution:

```yaml
name: code-review-agent
version: "1.0"
description: Read-only code review agent

appliesTo:
  tags: [claude-code, code-review]

rules:
  # Read any source file
  - effect: allow
    actions: ["read:file"]
    conditions:
      resource:
        matches: "./**"

  # Allow git log and diff for context
  - effect: allow
    actions: ["execute:shell"]
    conditions:
      resource:
        startsWith: ["git log", "git diff", "git show", "git blame"]

  # Allow searching code
  - effect: allow
    actions: ["execute:shell"]
    conditions:
      resource:
        startsWith: ["grep ", "find ", "wc "]

  # Allow web search for reference
  - effect: allow
    actions: ["read:web_search"]

  # Block ALL writes
  - effect: deny
    actions: ["write:file"]
    reason: "Code review agent is read-only"

  # Block all other shell commands
  - effect: deny
    actions: ["execute:shell"]
    reason: "Code review agent can only run git log/diff/show/blame and search commands"

defaultEffect: deny
```

### CI/CD Agent

A Claude Code agent for CI/CD — can run tests and builds, cannot push to main:

```yaml
name: ci-cd-agent
version: "1.0"
description: CI/CD agent for builds and tests

appliesTo:
  tags: [claude-code, ci-cd]

rules:
  # Read all project files
  - effect: allow
    actions: ["read:file"]
    conditions:
      resource:
        matches: "./**"

  # Write only build outputs and test results
  - effect: allow
    actions: ["write:file"]
    conditions:
      resource:
        matches: ["./dist/**", "./build/**", "./coverage/**", "./.test-results/**"]

  # Allow build and test commands
  - effect: allow
    actions: ["execute:shell"]
    conditions:
      resource:
        startsWith:
          - "npm test"
          - "npm run build"
          - "npm run lint"
          - "pytest "
          - "cargo test"
          - "cargo build"
          - "make test"
          - "make build"
          - "docker build"

  # Allow git operations except push to protected branches
  - effect: allow
    actions: ["execute:shell"]
    conditions:
      resource:
        startsWith: ["git ", "gh "]

  - effect: deny
    actions: ["execute:shell"]
    conditions:
      resource:
        contains: ["git push origin main", "git push origin production", "git push --force"]
    reason: "CI agent cannot push to protected branches. Use PR merge."

  # Block deployments
  - effect: deny
    actions: ["execute:shell"]
    conditions:
      resource:
        contains: ["deploy", "vercel ", "netlify ", "aws s3 sync"]
    reason: "Deployment requires human approval"

defaultEffect: deny
```

## Monitoring and Audit

### Real-Time Monitoring

```bash
# Tail all Claude Code actions in real-time
meshguard audit tail -f --agent claude-code-dev

# Filter by action type
meshguard audit tail -f --agent claude-code-dev --action "execute:shell"

# Monitor denials only
meshguard audit tail -f --agent claude-code-dev --decision deny
```

### Dashboard View

The MeshGuard dashboard at [dashboard.meshguard.app](https://dashboard.meshguard.app) provides:

- **Activity timeline** — Visual timeline of all agent actions
- **Denial breakdown** — Which policies trigger the most denials
- **Action heatmap** — When and what your agents are doing
- **Anomaly alerts** — Unusual patterns (e.g., sudden spike in file reads)

### Compliance Reports

```bash
# Weekly compliance report
meshguard audit export \
  --agent claude-code-dev \
  --from 2026-01-20 \
  --to 2026-01-26 \
  --format csv > weekly-report.csv

# JSON for programmatic analysis
meshguard audit export \
  --agent claude-code-dev \
  --decision deny \
  --format json > denials.json
```

### Alert Configuration

Set up alerts for critical events:

```yaml
# alerts/claude-code-alerts.yaml
alerts:
  - name: high-deny-rate
    condition: "deny_count_1h > 20"
    channels: [slack, email]
    message: "Claude Code agent hitting >20 denials/hour — possible misconfiguration or attack"

  - name: credential-access-attempt
    condition: "action == 'read:file' AND resource MATCHES '**/.env*'"
    channels: [slack, pagerduty]
    message: "Claude Code attempted to read credential file"

  - name: destructive-command
    condition: "action == 'execute:shell' AND resource CONTAINS 'rm -rf'"
    channels: [slack]
    message: "Claude Code attempted destructive shell command"
```

## Best Practices

### 1. Start with Audit Mode

Always start in audit mode to understand what Claude Code does before enforcing:

```bash
export MESHGUARD_MODE=audit
# Run for a few days, review logs, then switch to enforce
```

### 2. Principle of Least Privilege

Start with `defaultEffect: deny` and explicitly allow what's needed:

```yaml
# Good: explicit allowlist
rules:
  - effect: allow
    actions: ["execute:shell"]
    conditions:
      resource:
        startsWith: ["git ", "npm test"]
defaultEffect: deny

# Bad: overly permissive
rules:
  - effect: deny
    actions: ["execute:shell"]
    conditions:
      resource:
        contains: ["rm -rf"]
defaultEffect: allow
```

### 3. Layer Your Defenses

Use all three integration approaches together:

1. **Hooks** — Technical enforcement (primary)
2. **CLAUDE.md** — Agent instructions (advisory)
3. **MCP server** — Governed tool alternatives (supplementary)

### 4. Version Your Policies

Keep policies in version control alongside your code:

```
your-project/
├── .claude/
│   ├── settings.json
│   └── hooks/
│       ├── meshguard_hook.py
│       └── post_hook.py
├── policies/
│   ├── file-access.yaml
│   ├── shell-commands.yaml
│   └── web-access.yaml
├── src/
└── ...
```

### 5. Use Clear Denial Messages

Help Claude Code (and users) understand why actions fail:

```yaml
# Bad: vague
- effect: deny
  actions: ["execute:shell"]
  reason: "Not allowed"

# Good: actionable
- effect: deny
  actions: ["execute:shell"]
  conditions:
    resource:
      contains: "npm publish"
  reason: >
    Package publishing is blocked for autonomous agents. 
    To publish, run 'npm publish' manually from your terminal, 
    or request elevated permissions from your team lead.
```

### 6. Review Audit Logs Regularly

Schedule weekly reviews of your agent's audit logs:

```bash
# Weekly review script
meshguard audit query \
  --agent claude-code-dev \
  --decision deny \
  --from "$(date -d '7 days ago' +%Y-%m-%d)" \
  --limit 100
```

## Comparison with Claude Code's Built-in Permissions

Claude Code has built-in permission controls in `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": ["Read", "Write", "Edit"],
    "deny": ["exec"]
  }
}
```

This is a **binary toggle** — each tool is either fully enabled or fully disabled. Here's how MeshGuard extends this:

| Capability | Built-in Permissions | MeshGuard |
|-----------|---------------------|-----------|
| Disable exec entirely | ✅ `"deny": ["exec"]` | ✅ `defaultEffect: deny` on execute:shell |
| Allow exec for git only | ❌ All or nothing | ✅ `startsWith: ["git "]` |
| Deny writing to .env | ❌ All writes or none | ✅ `matches: "**/.env*"` |
| Allow reads in workspace only | ❌ All reads or none | ✅ `matches: "./**"` |
| Time-based rules | ❌ | ✅ `conditions: time_range: "09:00-18:00"` |
| Centralized management | ❌ Per-machine config | ✅ Dashboard + API |
| Audit trail | ❌ | ✅ Full audit with export |
| Cross-project policies | ❌ Per-project only | ✅ Applied globally via tags |

**Recommendation:** Use both. Enable tools in Claude Code's built-in permissions, then use MeshGuard for fine-grained governance.

## Next Steps

- [Claude Code Integration Reference](/integrations/claude-code) — Full API and configuration reference
- [Claude Code Dev Assistant Example](https://github.com/meshguard/meshguard-examples/tree/main/claude-code-dev-assistant) — Working example project
- [Policy Configuration](/concepts/policies) — Deep dive into policy syntax
- [Trust Tiers](/concepts/trust-tiers) — Understanding agent trust levels
- [Audit Logs](/concepts/audit-logs) — Compliance and monitoring

---

::: tip Get Started
Create your free MeshGuard account at [meshguard.app](https://meshguard.app) and govern your first Claude Code agent in minutes.
:::
