/**
 * Running a query whose filter is a long list of ids.
 *
 * PostgREST takes `.in('col', ids)` as part of the request URL, so a few
 * hundred UUIDs make a URL too long for the gateway. The request does not come
 * back with a clear error: it hangs for several seconds and then fails, and a
 * caller that ignores `error` carries on with nothing. Found by the lab E2E
 * run: a hospital with the whole master switched on (~420 tests) waited ~8 s
 * for the ward's "Order Lab Test" window, and every panel lost its
 * "28 tests" badge. Like `pageAll`, it scales with the customer.
 *
 *   const { data, error } = await inChunks(ids, (slice) =>
 *     supabase.from('lab_test_analytes').select('lab_master_id').in('lab_master_id', slice))
 *
 * Slices run side by side; the rows are joined in slice order. Each slice is
 * still subject to PostgREST's 1,000-row cap, so keep it to queries returning a
 * few rows per id.
 */
export async function inChunks<T>(
  ids: readonly string[],
  run: (slice: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  size = 100,
): Promise<{ data: T[]; error: string | null }> {
  const slices: string[][] = []
  for (let i = 0; i < ids.length; i += size) slices.push(ids.slice(i, i + size))
  const results = await Promise.all(slices.map((s) => run(s)))
  const failed = results.find((r) => r.error)
  return { data: results.flatMap((r) => r.data ?? []), error: failed?.error?.message ?? null }
}
