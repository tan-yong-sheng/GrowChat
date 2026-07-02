# PR-Agent Model Routing & Configuration

## Overview

PR-Agent ([The-PR-Agent/pr-agent](https://github.com/The-PR-Agent/pr-agent)) is an open-source AI code
review tool that runs on pull requests. It uses **litellm** as its model backend, which means it
supports **any OpenAI-compatible endpoint** — including custom proxies like CLIProxyAPI.

## How Model Selection Works

PR-Agent reads its model from the `[config]` section of `configuration.toml`:

```toml
[config]
model = "gpt-5-mini"               # Primary model for review
fallback_models = ["gpt-4o-mini"]   # Fallback if primary fails
```

These values can be **overridden by environment variables** in the GitHub Action:

```yaml
env:
  PR_AGENT__CONFIG__MODEL: 'gpt-5-mini' # → [config] model
  PR_AGENT__CONFIG__FALLBACK_MODELS: 'gpt-4o-mini' # → [config] fallback_models
```

The double-underscore (`__`) pattern maps the env var to the nested TOML key.

## Custom OpenAI-Compatible Endpoint (CLIProxyAPI)

To use PR-Agent with CLIProxyAPI (or any custom OpenAI-compatible proxy):

1. **Set the endpoint URL** in `OPENAI__API_BASE`:

   ```yaml
   OPENAI__API_BASE: http://your-cliproxyapi:port/v1
   ```

2. **Set the API key** in `OPENAI__KEY`:

   ```yaml
   OPENAI__KEY: sk-your-key-here
   ```

3. **Set the model name** (exposed by CLIProxyAPI):
   ```yaml
   PR_AGENT__CONFIG__MODEL: gpt-5-mini
   ```

## Supported Providers

PR-Agent (via litellm) supports any provider with an OpenAI-compatible `/v1/chat/completions`
endpoint. This includes:

| Provider         | API format            | Notes                                            |
| ---------------- | --------------------- | ------------------------------------------------ |
| OpenAI           | `openai/` + model     | Default                                          |
| Azure            | `azure/` + deployment | Requires `api_type`, `api_base`, `deployment_id` |
| OpenRouter       | `openai/` + model     | Routes through OpenAI-compatible endpoint        |
| **CLIProxyAPI**  | `openai/` + model     | Custom endpoint at `OPENAI_BASE_URL`             |
| Any custom proxy | `openai/` + model     | Must implement OpenAI `/v1` spec                 |

## Configuration Reference

### Environment variables (GitHub Action)

| Env var                             | Maps to                    | Default        | Description                     |
| ----------------------------------- | -------------------------- | -------------- | ------------------------------- |
| `PR_AGENT__CONFIG__MODEL`           | `[config] model`           | `gpt-5-mini`   | Primary LLM for reviews         |
| `PR_AGENT__CONFIG__FALLBACK_MODELS` | `[config] fallback_models` | `gpt-4o-mini`  | Comma-separated fallbacks       |
| `OPENAI__API_BASE`                  | `[openai] api_base`        | (required)     | Your OpenAI-compatible endpoint |
| `OPENAI__KEY`                       | `[openai] api_key`         | (required)     | API key for the endpoint        |
| `GITHUB_TOKEN`                      | GitHub API                 | `github.token` | For posting PR comments         |

### Recommended model choices for code review

| Model               | Quality (SWE-bench) | Cost ($/1M) | Latency | Best for                      |
| ------------------- | ------------------- | ----------- | ------- | ----------------------------- |
| `gpt-5-mini`        | 82%                 | $0.15/$0.60 | Fast    | Default, general review       |
| `deepseek-v4-flash` | 80.6%               | $0.14/$0.28 | Fast    | Budget-friendly, high quality |
| `gpt-4o-mini`       | 76%                 | $0.15/$0.60 | Fast    | Fallback (cheap)              |
| `gpt-4.1-nano`      | 72%                 | $0.10/$0.40 | Fastest | Lightweight / skip simple PRs |

**Tip:** Set `model` to your best model and `fallback_models` to cheaper ones for
cost optimization. PR-Agent uses the fallback when the primary is rate-limited or
times out.
