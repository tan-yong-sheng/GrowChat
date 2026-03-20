# Secrets Rotation

Rotate secrets with the same order every time:

1. Set the new `JWT_SECRET` in Wrangler.
2. Deploy the worker with both old and new sessions still valid.
3. Wait for refresh tokens to expire, or revoke sessions if a compromise is suspected.
4. Replace `OPENAI_API_KEY` and verify upstream calls still succeed.
5. Confirm login, refresh, and chat streaming still work after the rollout.

Notes:
- JWT access tokens are short-lived.
- Refresh tokens are stored hashed in KV and expire automatically.
- Rotation should be paired with a smoke test in staging first.
