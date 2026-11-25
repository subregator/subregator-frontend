# Subregator Offers

A standalone `index.html`: HTML, CSS and vanilla JavaScript, with no framework, browser dependencies or build step. It displays actual IPv4 lease and purchase offers from the Subregator API. Inter and JetBrains Mono load from Google Fonts with system fallbacks.

## Run

Python 3.11+ is sufficient; npm is not required to view the page.

```sh
python3 serve.py
```

Open http://localhost:5173. For a phone on the same trusted LAN:

```sh
python3 serve.py --bind 0.0.0.0
```

The local server serves only the page and a fixed, read-only proxy to `https://api.subregator.com`. It exposes no project files, credentials or administration endpoints. The proxy is needed because the public API does not allow browser requests from localhost. HTTPS certificates are verified, requests time out, and responses are bounded. The same service is shipped in the container behind the existing TLS reverse proxy; the browser UI is the single HTML file. The server bounds active connections to 64 and applies socket and upstream timeouts.

## Container deployment

GitHub Actions runs Python/JavaScript tests, desktop/mobile browser tests and an isolated container smoke test before publishing `ghcr.io/subregator/subregator-frontend`. Images support `linux/amd64` and `linux/arm64`, with `edge`, `sha-<full commit>` and version tags. Production should pin the reviewed image digest.

The image contains the page, server and verification module. It runs as UID/GID 65532 on port 8080, has a `/healthz` probe and supports a read-only root filesystem. Mount a named volume at `/var/lib/subregator-checks` so DROP refresh intervals survive container recreation. No npm runtime, source checkout or host configuration mounts are required.

- `SUBREGATOR_API_URL`: fixed HTTP(S) backend origin, default `https://api.subregator.com`. Compose sets `http://backend:8080`; both catalogue proxying and BGP/RPKI inspection use this origin. Requests cannot select another upstream.
- `SUBREGATOR_CHECKS_DIR`: writable cache directory, default `var/` locally and `/var/lib/subregator-checks` in the image.

The backend repository contains the complete image-only `compose.yaml` and the standalone `compose.production.yaml` for the existing server's Traefik network and domains. Keep the current Compose project name, database credentials and volumes during migration. TLS is handled by Traefik; the Python service is not exposed directly to the public Internet.

For a separate static deployment, route `/api/v1/offer-checks` to this service and the other `/api/v1/*` paths to the catalogue API through the same origin. Opening `index.html` with `file://` cannot bypass CORS.

## Behaviour

- Fetches a complete available IPv4 catalogue in pages of 200, using a consistent snapshot and at most three parallel catalogue requests. Missing pages, duplicate IDs and changed snapshots produce an error rather than silently incomplete results. A failed refresh keeps the previous snapshot visible with a warning.
- Filters by lease/purchase, RIR, exact prefix size or `/20` and larger blocks, selected providers and price per IP. Searches published prefixes and provider names. Hidden prefixes are not inferred.
- Computes per-IP lease prices as source amount divided by billing months and address count. Purchase prices use the one-time amount. Filtering and sorting compare exact integer ratios; per-IP display is rounded to four decimals with `≈` when needed. Source billing totals remain separate. Unknown fees, deposits and taxes stay unknown.
- Keeps one currency selected; there is no exchange conversion. Switching type selects a currency available for that type if the previous currency has no offers.
- Filters persist in the URL; pagination displays 25 rows. Mobile keeps Lease/Buy immediately available, expands other filters above the table and confines horizontal scrolling to the table.
- Offer details show all published tariffs, fees, refundability, terms, routing capabilities, geography provenance, availability, source timestamps and seller links. Links use `noopener noreferrer` and reject executable schemes and embedded credentials.
- Providers, network lookup, MCP connection information and data documentation open in accessible dialogs. Sign in and Create alert are disabled because the API supplies neither accounts nor alerts.

## Checks and history

The Checks controls use independent source observations, not provider capability claims:

- **BGP announced:** an exact-prefix RIS observation from the existing API's RIPEstat `prefix_overview` check. A covering route does not pass. The collector query time, origin ASNs, capture time and expiry are retained. Visibility is not a safety or reachability guarantee.
- **RPKI valid (all origins):** every observed exact-prefix origin ASN must have a matching prefix/ASN validation with status `valid`. No ROA (`unknown` from RIPEstat), invalid ASN/length, mixed results, missing origins, low-visibility filtering and the API's four-origin truncation never pass. Validations expire with the older of the origin observation and validation result.
- **Not listed in DROP:** no address in the prefix may overlap any range in the complete [Spamhaus DROP IPv4 feed](https://www.spamhaus.org/drop/drop_v4.json). This is one named feed; it does not cover every blocklist, SBL/XBL/PBL, or constitute a reputation score. The Spamhaus Project's attribution, copyright, source timestamp, matching CIDRs and SBL references are preserved in evidence. See the [DROP FAQ](https://www.spamhaus.org/faqs/do-not-route-or-peer-drop/).

`verification.py` provides `/api/v1/offer-checks?resource=<public-ipv4-prefix>` through `serve.py`. It uses only fixed upstream URLs, public IPv4 prefixes, bounded responses, two admitted check handlers, a maximum of 30 new prefix inspections per minute per process and a 2,000-entry network cache. Existing upstream API limits are respected. Rate-limited results pause the browser batch. No private prefix is inferred from a masked listing.

Checks are opt-in and run in batches of up to 25 candidate prefixes after applying the other filters. Each batch is cancellable; the next batch requires another click. Counts explicitly describe verified matches in the checked subset, with the attempted and hidden-prefix counts displayed. Unchecked, unknown, stale, partial and failed observations never enter a positive filter. Results are re-evaluated when they expire; no global catalogue verdict is implied.

The DROP cache is persisted in ignored `var/checks.sqlite`. A refresh lease is recorded before fetching, so successful or failed automated downloads are at least 24 hours apart, including across restarts. Every row and the metadata record count are validated before accepting a complete feed. The last valid dataset survives failed refreshes, marked stale. Expiry is the earlier of 24 hours after retrieval or 26 hours after the source timestamp. An old source timestamp cannot become fresh just because HTTP returned 200. The bounded last response is retained locally for parser diagnostics; no raw feed is exposed by the server.

The 30-day column fetches real listing events for visible rows, with at most two parallel history requests. It plots only observed prices for the same tariff, billing period, address count and currency. Coverage shorter than 30 days is labelled. Insufficient data, lifecycle gaps and truncated history produce no invented graph.

## Optional development checks

Node and the dev dependencies are needed only for tests and formatting:

```sh
npm ci
npm test
npm exec playwright install chromium
npm run test:e2e
npm run format:check
```

Python unit tests cover evidence normalization, exact-prefix matching, multi-origin and incomplete RPKI results, malformed responses, CIDR overlap, source freshness, persistent feed refresh intervals and failures. JavaScript unit tests execute the pure functions extracted from the inline script. Browser tests intercept API requests with deterministic fixtures and cover filters, sorting, exact price bounds, pagination, hidden prefixes, seller links, dialogs, keyboard focus, error states, responsive layout and axe accessibility. The running preview always uses the actual API; test fixtures are not part of the delivered page.

The previous Svelte implementation is preserved in `legacy-svelte/` and is not used by the page or default launch commands. Image publishing does not automatically deploy production.

## License

Licensed under the [MIT License](LICENSE). Third-party components retain their own licenses and copyright notices.
