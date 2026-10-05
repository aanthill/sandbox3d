/**
 * Runs a long job (a generator that yields between small slices of work) while
 * spending at most `budgetMs` per frame, so the page never freezes (rule 6
 * spirit: long tasks must not block the main thread).
 */
export async function runBudgeted(
  job: Generator<void, void, void>,
  budgetMs = 6,
  nextFrame: () => Promise<void> = () => new Promise((r) => requestAnimationFrame(() => r())),
  now: () => number = () => performance.now(),
): Promise<void> {
  let start = now();
  for (;;) {
    const r = job.next();
    if (r.done) return;
    if (now() - start >= budgetMs) {
      await nextFrame();
      start = now();
    }
  }
}
