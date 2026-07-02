---
name: PR-Agent Model Routing
about: Request support for a specific model/provider combination in PR-Agent
title: 'feat: support [model] via [provider] for code review'
labels: 'model-routing'
assignees: ''
---

## Model Request

**Provider:** (e.g., OpenAI, Azure, OpenRouter, NVIDIA NIM, Groq, Together AI, DeepInfra, Fireworks, or custom OpenAI-compatible endpoint)

**Model:** (e.g., gpt-5.5-mini, gemini-3.5-flash, deepseek-v4-flash, claude-sonnet-4.7, mistral-codestral)

**API format:** OpenAI-compatible (`/v1/chat/completions`) / Anthropic / Google / Other

## Why this model?

- **Benchmark scores** (SWE-bench, LiveCodeBench, Terminal-Bench, etc.)
- **Latency** (time-to-first-token, tokens/sec)
- **Cost** ($/1M tokens input/output)
- **Availability** (free tier? self-hosted? BYOK?)

## Configuration

```yaml
env:
  OPENAI__API_BASE: '${{ secrets.MY_PROVIDER_URL }}'
  OPENAI__KEY: '${{ secrets.MY_PROVIDER_KEY }}'
  PR_AGENT__CONFIG__MODEL: 'my-model-name'
```

## Checklist

- [ ] Provider has an OpenAI-compatible `/v1/chat/completions` endpoint
- [ ] PR-Agent can reach this provider via litellm
- [ ] I have tested this model on real PRs in my repo
- [ ] Documentation updated in `changing_a_model.md`
