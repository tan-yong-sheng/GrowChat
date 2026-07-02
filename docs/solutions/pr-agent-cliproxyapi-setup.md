# 🔧 PR-Agent + CLIProxyAPI: Model Routing for Code Review

## Problem

We need an automated PR reviewer that runs on every pull request, but we don't want
to pay OpenAI/Anthropic per-review for every PR. Instead, we want to use free or
low-cost models via **CLIProxyAPI** (a local proxy that wraps CLI tools as an
OpenAI-compatible endpoint).

## Solution

**PR-Agent** (`The-PR-Agent/pr-agent`) already supports custom OpenAI-compatible
endpoints via **litellm**. We configure it with our CLIProxyAPI URL as the
`OPENAI_BASE_URL` and pass the model name as an env var.

### Architecture

```
PR (GitHub) ──► PR-Agent (GitHub Action) ──► litellm ──► OPENAI_BASE_URL/CLIProxyAPI ──► model
```

- **PR-Agent** runs as a Docker container in GitHub Actions
- **litellm** (embedded in PR-Agent) handles model routing
- **CLIProxyAPI** (`OPENAI_BASE_URL`) is the OpenAI-compatible endpoint
- **Model name** is passed via `PR_AGENT__CONFIG__MODEL` env var

### Key files

| File                                          | Purpose                      |
| --------------------------------------------- | ---------------------------- |
| `.github/workflows/pr-agent.yml`              | GitHub Action workflow       |
| `.github/workflows/pi-pr-assist.yml`          | Existing Pi agent (parallel) |
| `.env.example`                                | Env var reference            |
| `docs/backend/flows/pr-agent-routing.flow.md` | Architecture docs            |

### Model recommendations

| Model               | For         | Why                                 |
| ------------------- | ----------- | ----------------------------------- |
| `gpt-5-mini`        | Default     | Good balance of quality + speed     |
| `deepseek-v4-flash` | Budget      | Best value at $0.14/$0.28 per 1M    |
| `gpt-4o-mini`       | Fallback    | Cheap, fast, works for simple diffs |
| `gpt-4.1-nano`      | Lightweight | Fastest. Skip trivial PRs           |

### Routing strategy

Use `model` for **primary** (deep review on complex PRs) and `fallback_models`
for **secondary** (quick pass on simple or small PRs). PR-Agent falls back
when the primary is rate-limited or times out.

## Status

- ✅ PR-Agent supports custom endpoints natively
- ✅ Configuration via env vars works
- ✅ No changes needed to PR-Agent source

## Related

- `docs/backend/flows/pr-agent-routing.flow.md` — Detailed model config
- `.github/workflows/pr-agent.yml` — Action workflow
