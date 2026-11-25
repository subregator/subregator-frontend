# Subregator Frontend

Mobile-ready, read-only IPv4/IPv6 catalogue. Find lease and purchase offers, inspect every published tariff, fee, routing capability and term, then visit the seller directly. Subregator does not sell resources, handle payments or broker transactions.

Built with SvelteKit 3, Svelte 5, TypeScript 6 and Vite 8. Pages render on the server, fonts are self-hosted, filter state lives in the URL, and API responses are validated before rendering. The Node adapter produces a standalone production server.

## Development

Requires Node 22.17+ and npm. The lockfile pins the tested dependency versions.

```sh
npm ci
# Start the Go backend separately on port 8080, then:
npm run dev
```

Open http://localhost:5173. To use another backend:

```sh
SUBREGATOR_API_URL=http://127.0.0.1:8080 npm run dev
```

`SUBREGATOR_API_URL` is a server-only HTTP(S) origin without credentials. Requests go from SvelteKit to `/api/v1/` on that origin; browser CORS configuration is not required. A 10-second timeout bounds upstream calls. Upstream errors, rate limits, invalid payloads and changed pagination snapshots produce visible recovery states. Failed requests never fall back to sample data.

The dev server listens on all interfaces for testing with a phone on the same trusted LAN. Use the computer's LAN address with port 5173. To restrict access to this machine: `npm run dev -- --host 127.0.0.1`.

## Demonstration

```sh
npm run dev:demo
```

This explicitly enables synthetic data, displays a demo banner and adds `noindex,nofollow`. Providers and prices are fictional; published example prefixes are documentation networks, and seller links lead to example.com. Includes hidden prefixes, IPv6, multiple tariffs, unknown pricing, stale observations and upcoming inventory. This mode is off by default. Do not enable `SUBREGATOR_DEMO` for a public catalogue.

## Behaviour

- Separate lease/purchase views; IP version, prefix range, country, RIR, provider, currency, base-price range, availability, billing period, location provenance, containing CIDR and freshness filters.
- Default: available leases in USD, ordered by base monthly equivalent. Choose all currencies to include unpriced offers and other currencies; price sorting then switches to recently observed.
- Source billing amounts remain unchanged. Lease price filters use a monthly equivalent; purchase filters use the full base price. Taxes, deposits and conditional fees stay separate. No exchange rates or inferred totals.
- Unknown values remain explicit. Hidden prefixes are not inferred. Seller country is labelled separately from network location.
- Details include all published quotes, minimum terms, taxes, fees, refundability, routing capabilities, use restrictions, verification, availability and source timestamps/publication conditions.
- Pagination carries the API snapshot. A changed snapshot asks the user to restart pagination. Returning from details preserves filters.
- Mobile filter dialog supports keyboard focus, Escape and focus return. Seller links open in a new tab with `noopener noreferrer`; non-HTTP(S) and credential-bearing links are rejected.

## Validation

```sh
npm run format:check
npm run check
npm test
npm run build
npm exec playwright install chromium
npm run test:e2e
```

Browser checks use a production build in explicit demo mode, with desktop and mobile Chromium projects. They cover search, filters, direct details, source links, back navigation, empty/error states, hidden prefixes, exact IPv6 counts, keyboard behaviour, reduced motion, responsive widths and axe accessibility checks. `tests/fixtures/go-api.json` was captured from the actual local Go handler with its Peaktera test fixture; it is not live inventory. Unit tests also cover API errors and malformed payloads.

## Production

```sh
npm ci
npm run build
SUBREGATOR_API_URL=http://127.0.0.1:8080 HOST=127.0.0.1 PORT=3000 ORIGIN=https://subregator.com npm start
```

Place a TLS reverse proxy in front of the Node server. Set the real backend origin in the runtime environment; keep demo mode disabled. A build does not deploy the service. This repository has no accounts, checkout, alerts, currency conversion or purchasing operations.
