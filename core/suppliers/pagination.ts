export async function paginateRange<T>(fetchPage: (from: number, to: number) => Promise<T[]>, pageSize = 500) {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error('pageSize invalido.');
  const result: T[] = [];
  for (let from = 0;; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    result.push(...page);
    if (page.length < pageSize) return result;
  }
}
