# Architecture guardrails for role and validation seams

GrowChat should use import guardrails and Semgrep rules to prevent routers from embedding inline role checks or reintroducing email validation helpers into authz modules. We chose this because the seams are easy to drift from once a helper exists, and guardrails keep the policy modules deep without forcing callers to rediscover the same rules.
