# PR-Agent Model Routing & Configuration

## Overview

PR-Agent ([The-PR-Agent/pr-agent](https://github.com/The-PR-Agent/pr-agent)) is an open-source AI code
review tool that runs on pull requests. It uses **litellm** as its model backend, which means it
supports **any OpenAI-compatible endpoint**.

## How Model Selection Works

PR-Agent's GitHub Action runner reads two key env vars:

- `OPENAI_KEY` — your API key (sets `openai.key` in Dynaconf config)
- `OPENAI_API_BASE` — your base URL (used by litellm for routing)

Model name and fallback models are **not** passed through env vars — they come from the
**repo-local `.pr_agent.toml` config file** or from the default `configuration.toml` bundled
in the PR-Agent Docker image.

## Custom OpenAI-Compatible Endpoint

To use PR-Agent with any custom OpenAI-compatible proxy:

1. **Set the API key** in `OPENAI_KEY` (env var in the workflow):

   ```yaml
   env:
     OPENAI_KEY: ${{ secrets.PR_AGENT_API_KEY }}
   ```

2. **Set the base URL** in `OPENAI_API_BASE` (used by litellm for routing):

   ```yaml
   env:
     OPENAI_API_BASE: ${{ vars.PR_AGENT_BASE_URL }}
   ```

3. **Set the model** via a **repo-local `.pr_agent.toml`** file:

   ```toml
   [openai]
   api_base = "${{ vars.PR_AGENT_BASE_URL }}"
   model = "${{ vars.PR_AGENT_MODEL }}"
   ```

4. **Alternative: use `.pr_agent.toml` in the repo root** with:

   ```toml
   [config]
   model = "gpt-5-mini"
   fallback_models = ["gpt-4o-mini"]
   ```

## PR-Agent GitHub Action Runner

The PR-Agent Docker-based GitHub Action (`action.yaml`) runs its own entrypoint
(`github_action_runner.py`) which only reads these env vars:

| Env var           | What it sets            | Required? |
| ----------------- | ----------------------- | --------- |
| `OPENAI_KEY`      | `openai.key`            | Yes       |
| `OPENAI_API_BASE` | Used by litellm router  | Yes       |
| `GITHUB_TOKEN`    | For posting PR comments | Yes       |

All other model configuration (model name, fallbacks, token limits, AI timeout)
is set via **`configuration.toml`** in the repo at `pr_agent/settings/`.

## Environment Variable Reference

| Env var           | Where to set | Purpose                      |
| ----------------- | ------------ | ---------------------------- |
| `OPENAI_KEY`      | Secret       | API key for your endpoint    |
| `OPENAI_API_BASE` | Variable     | Base URL for litellm routing |
| `GITHUB_TOKEN`    | Built-in     | GitHub API token (automatic) |

## Recommended model choices for code review

| Model               | Quality (SWE-bench) | Cost ($/1M) | Latency | Best for                      |
| ------------------- | ------------------- | ----------- | ------- | ----------------------------- |
| `gpt-5-mini`        | 82%                 | $0.15/$0.60 | Fast    | Default, general review       |
| `deepseek-v4-flash` | 80.6%               | $0.14/$0.28 | Fast    | Budget-friendly, high quality |
| `gpt-4o-mini`       | 76%                 | $0.15/$0.60 | Fast    | Fallback (cheap)              |
| `gpt-4.1-nano`      | 72%                 | $0.10/$0.40 | Fastest | Lightweight / skip simple PRs |

**Tip:** Set model via `.pr_agent.toml` in the repo root or via repo variables.
