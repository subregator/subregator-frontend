import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
  SUBREGATOR_API_URL: {
    schema: (value) => {
      const url = new URL(value || 'http://127.0.0.1:8080');
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
        throw new Error('SUBREGATOR_API_URL must be an HTTP(S) origin without credentials');
      return url.origin;
    }
  },
  SUBREGATOR_DEMO: {
    schema: (value) => {
      if (value && !['true', 'false'].includes(value))
        throw new Error('SUBREGATOR_DEMO must be true or false');
      return value === 'true';
    }
  }
});
