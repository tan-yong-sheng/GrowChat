# Role policy and email validation seams

GrowChat keeps coarse role checks in a dedicated `role-policy` module, while permission decisions stay in `authorize.js` and email validation lives in `validation/request.js`. We chose this split because it preserves a deep permission-policy seam, avoids mixing validation concerns into role helpers, and keeps router adapters thin and stable.
