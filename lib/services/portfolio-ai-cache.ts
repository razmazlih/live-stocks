/** Personal snapshots are generated afresh for every authenticated request.
 * This compatibility wrapper deliberately retains neither values nor in-flight work.
 */
export function cachePortfolioAiSnapshot<T>(load: () => Promise<T>) {
  return () => load();
}
