/**
 * Shared helper: collect stdout/stderr from a fallow child process.
 *
 * Returns { stdout, stderr } after the process finishes.
 * Does NOT add event listeners — callers must attach 'close' on the child.
 */
export function collectOutput(child) {
  const state = { stdout: '', stderr: '' };

  child.stdout.on('data', (chunk) => {
    state.stdout += chunk;
  });

  child.stderr.on('data', (chunk) => {
    state.stderr += chunk;
  });

  return state;
}
