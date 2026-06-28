/**
 * Execute a list of D1 prepared statements in chunks to stay within the
 * Cloudflare D1 100-statement limit per batch() call.
 *
 * @param {object} db
 * @param {D1PreparedStatement[]} statements
 * @param {number} [chunkSize=100]
 * @returns {Promise<any[]>}
 */
export async function chunkedBatch(db, statements, chunkSize = 100) {
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
