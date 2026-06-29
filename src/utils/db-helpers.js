/**
 * Execute a list of D1 prepared statements, staying within the Cloudflare
 * D1 100-statement limit per batch() call.
 *
 * For the common case (statements.length <= chunkSize) this is equivalent
 * to `await db.batch(statements)` and is fully atomic. Only when the input
 * exceeds the limit is it split into sequential chunks — in that case the
 * operation is no longer atomic and a partial failure can leave the data
 * in an inconsistent state. Callers that require atomicity for large
 * updates should batch at the application level (one db.batch() per
 * logical unit) rather than passing every statement at once.
 *
 * @param {object} db
 * @param {D1PreparedStatement[]} statements
 * @param {number} [chunkSize=100]
 * @returns {Promise<any[]>}
 */
export async function chunkedBatch(db, statements, chunkSize = 100) {
  if (!Array.isArray(statements) || statements.length === 0) {
    return [];
  }
  if (statements.length <= chunkSize) {
    const results = await db.batch(statements);
    return Array.isArray(results) ? results : [];
  }
  const results = [];
  for (let i = 0; i < statements.length; i += chunkSize) {
    const chunk = statements.slice(i, i + chunkSize);
    const batchResults = await db.batch(chunk);
    if (Array.isArray(batchResults)) {
      results.push(...batchResults);
    }
  }
  return results;
}
