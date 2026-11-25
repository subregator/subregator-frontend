import { SUBREGATOR_API_URL, SUBREGATOR_DEMO } from '$app/env/private';
import type { z } from 'zod';
import { demoResponse } from './demo';

export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfter?: string
  ) {
    super(message);
  }
}
export const demoMode = () => SUBREGATOR_DEMO;
export async function api<T>(
  path: string,
  schema: z.ZodType<T>,
  fetcher: typeof fetch
): Promise<T> {
  if (demoMode()) {
    let result: unknown;
    try {
      result = demoResponse(path);
    } catch {
      throw new APIError(
        400,
        'These filters are not supported. Check the values or reset your filters.'
      );
    }
    if (result === null)
      throw new APIError(404, 'This offer is no longer in the current catalogue.');
    return schema.parse(result);
  }
  let response: Response;
  try {
    const base = new URL(SUBREGATOR_API_URL);
    if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Invalid API URL');
    response = await fetcher(new URL(`/api/v1/${path}`, base), {
      signal: AbortSignal.timeout(10000),
      headers: { Accept: 'application/json' }
    });
  } catch {
    throw new APIError(503, 'The catalogue is temporarily unavailable. Please try again shortly.');
  }
  if (!response.ok) {
    const messages: Record<number, string> = {
      400: 'These filters are not supported. Check the values or reset your filters.',
      404: 'This offer is no longer in the current catalogue.',
      409: 'The catalogue changed while you were browsing. Refresh the results to continue.',
      429: 'Too many requests. Please wait a moment before trying again.',
      503: 'The catalogue is busy. Please try again shortly.'
    };
    throw new APIError(
      response.status,
      messages[response.status] || 'Unable to load the catalogue. Please try again.',
      response.headers.get('Retry-After') ?? undefined
    );
  }
  try {
    return schema.parse(await response.json());
  } catch {
    throw new APIError(
      502,
      'The catalogue returned an unexpected response. Please try again later.'
    );
  }
}
