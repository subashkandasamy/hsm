/**
 * Reading every row of a query, rather than the first thousand.
 *
 * PostgREST caps an unbounded reply at `db-max-rows` — 1,000 on Supabase — and
 * says nothing when it does. The call succeeds, `error` is null, and the array
 * is simply short. Nothing in the type system or the response marks the
 * difference between "there were 1,000" and "there were more".
 *
 * This is not hypothetical. A hospital's opening stock put 1,027 batches in
 * `drug_batches`; `getStock()` asked for all of them with no range, got 1,000,
 * and the pharmacy screen reported 40,360 units worth ₹19,55,192.48 against a
 * true 40,409 and ₹20,03,199.69. Because the query was ordered by expiry
 * ascending, the 27 rows that fell off the end were the furthest-dated — the
 * hospital's equipment, which carries placeholder expiries decades out. Eleven
 * forceps, an ECG machine, two BP monitors and a traction set were in the
 * database and absent from the only screen that lists stock.
 *
 * The failure is quiet and it scales with the customer: it cannot happen in
 * testing, cannot happen to a small tenant, and appears the day a real hospital
 * loads real data.
 *
 * Usage — pass a function that applies a range to the query you want:
 *
 *   const batches = await pageAll((from, to) =>
 *     supabase.from('drug_batches').select('...').order('expiry').range(from, to))
 *
 * The order must be deterministic, or rows can repeat or be skipped between
 * pages. Every caller here orders by a column; where ties are possible the
 * query should order by `id` as well.
 */
const PAGE = 1000

export async function pageAll<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  { max = 50_000 }: { max?: number } = {},
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < max; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1)
    if (error || !data) break
    out.push(...data)
    // A short page is the last page. A full one might not be, so ask again.
    if (data.length < PAGE) break
  }
  return out
}
