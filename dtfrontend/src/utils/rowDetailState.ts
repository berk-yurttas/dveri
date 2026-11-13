// Pure state helpers for the row detail card / trace panel runtime.
// Keep this file import-free: it is unit-tested by src/utils/rowDetailState.test.mjs.

/** First nested query config (of one level) whose trace panel is enabled. */
export function pickTracePanel<T extends { tracePanel?: { enabled?: boolean } }>(
  nestedQueries: T[] | undefined | null
): T['tracePanel'] | undefined {
  return (nestedQueries || []).find((nq) => nq?.tracePanel?.enabled)?.tracePanel
}

/** A detail card is active only when enabled and its SQL is non-blank. */
export function isDetailCardEnabled(config: { enabled?: boolean; sql?: string } | null | undefined): boolean {
  return !!config?.enabled && !!config.sql && config.sql.trim() !== ''
}

/** Row keys are `${queryId}_${rowIndex}` and nest as `${parentKey}_${rowIndex}`. */
export function isSameOrDescendantRowKey(candidate: string | null | undefined, rowKey: string): boolean {
  if (!candidate) return false
  return candidate === rowKey || candidate.startsWith(`${rowKey}_`)
}

export function isRowKeyOfQuery(rowKey: string | null | undefined, queryId: number): boolean {
  return !!rowKey && rowKey.startsWith(`${queryId}_`)
}

/** Request counter: only the most recently begun request may apply its response. */
export function createRequestTracker() {
  let latest = 0
  return {
    begin: () => ++latest,
    isCurrent: (id: number) => id === latest,
    invalidate: () => {
      latest += 1
    },
  }
}

/** Keys that activate a focused row like a click (Enter / Space). */
export function isActivationKey(key: string): boolean {
  return key === 'Enter' || key === ' '
}
