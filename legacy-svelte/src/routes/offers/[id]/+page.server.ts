import { error } from '@sveltejs/kit';
import { api, APIError, demoMode } from '#lib/server/api.ts';
import { offerSchema, providersSchema } from '#lib/contracts.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, fetch, setHeaders }) => {
  setHeaders({ 'Cache-Control': 'no-store' });
  try {
    const [offer, providers] = await Promise.all([
      api(`offers/${encodeURIComponent(params.id)}`, offerSchema, fetch),
      api('providers', providersSchema, fetch)
    ]);
    return {
      offer,
      provider: providers.items.find((p) => p.id === offer.provider_id),
      demo: demoMode()
    };
  } catch (e) {
    if (e instanceof APIError)
      error(e.status >= 400 && e.status <= 599 ? e.status : 502, e.message);
    error(404, 'This offer is not in the current catalogue.');
  }
};
