/**
 * CORS Origin Validation Middleware
 *
 * Validates that incoming requests with an Origin header are from allowed origins.
 * This provides defense-in-depth protection for production deployments.
 *
 * For local development, ALLOWED_ORIGINS may be empty or unset, allowing all origins.
 */

/**
 * Validate request origin against allowed origins list
 *
 * @param {Request} req - The incoming request
 * @param {Object} env - Environment bindings containing ALLOWED_ORIGINS
 * @returns {Response|null} - Returns 403 response if origin not allowed, null if allowed
 */
export function validateOrigin(req, env) {
	const origin = req.headers.get("Origin");

	// Allow requests without Origin header (same-origin requests, mobile apps, curl, etc.)
	if (!origin) return null;

	const allowedOrigins = (env.ALLOWED_ORIGINS || "")
		.split(",")
		.map((o) => o.trim())
		.filter(Boolean);

	// If no allowed origins configured, allow all (development mode)
	if (allowedOrigins.length === 0) return null;

	// Wildcard means allow any origin.
	if (allowedOrigins.includes("*")) return null;

	// Check if origin is in allowed list
	if (allowedOrigins.includes(origin)) return null;

	// Origin not allowed - return 403
	return new Response("Origin not allowed", {
		status: 403,
		headers: { "Content-Type": "text/plain" },
	});
}
