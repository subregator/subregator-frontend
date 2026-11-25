import { api, APIError, demoMode } from '#lib/server/api.ts';
import { providersSchema, resultSchema } from '#lib/contracts.ts';
import { allAvailability, buildQuery, defaults } from '#lib/filters.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, fetch, setHeaders }) => {
  setHeaders({ 'Cache-Control': 'no-store' });
  const filters: Record<string, string> = { ...defaults, ...Object.fromEntries(url.searchParams) };
  let query: URLSearchParams;
  try {
    query = buildQuery(url.searchParams);
  } catch (e) {
    return {
      filters,
      demo: demoMode(),
      result: null,
      providers: [],
      facets: null,
      issue: { status: 400, message: (e as Error).message }
    };
  }
  try {
    const [result, providers, options] = await Promise.all([
      api(`offers?${query}`, resultSchema, fetch),
      api('providers', providersSchema, fetch),
      api(`offers?limit=1&availability=${allAvailability}`, resultSchema, fetch)
    ]);
    filters.sort = query.get('sort')!;
    return {
      filters,
      demo: demoMode(),
      result,
      providers: providers.items,
      facets: options.facets,
      issue: null
    };
  } catch (e) {
    const issue =
      e instanceof APIError
        ? e
        : new APIError(502, 'Unable to read the catalogue. Please try again.');
    return {
      filters,
      demo: demoMode(),
      result: null,
      providers: [],
      facets: null,
      issue: { status: issue.status, message: issue.message, retryAfter: issue.retryAfter }
    };
  }
};
