/**
 * Shared helper: collect stdout/stderr from a fallow child process.
 *
 * Returns { stdout, stderr } after the process finishes.
 * Does NOT add event listeners — callers must attach 'close' on the child.
 */
export function collectOutput(child) {
  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  return { stdout, stderr };
}
