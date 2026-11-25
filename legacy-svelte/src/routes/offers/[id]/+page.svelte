<script lang="ts">
  import { page } from '$app/state';
  import type { PageProps } from './$types';
  import Icon from '#lib/components/Icon.svelte';
  import {
    addressCount,
    bestQuote,
    country,
    cycle,
    date,
    human,
    money,
    safeURL,
    title,
    yesNo
  } from '#lib/format.ts';
  let { data }: PageProps = $props();
  let offer = $derived(data.offer);
  let provider = $derived(data.provider);
  let quote = $derived(bestQuote(offer));
  let sellerURL = $derived(safeURL(offer.url));
  let providerURL = $derived(safeURL(provider?.url));
  let copied = $state(false);
  let copyFailed = $state(false);
  let backURL = $derived.by(() => {
    const from = page.url.searchParams.get('from');
    if (!from) return '/';
    try {
      const url = new URL(from, 'http://local.invalid');
      return url.origin === 'http://local.invalid' && url.pathname === '/'
        ? url.pathname + url.search
        : '/';
    } catch {
      return '/';
    }
  });
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL(page.url.pathname, window.location.origin).href);
      copied = true;
      copyFailed = false;
    } catch {
      copyFailed = true;
    }
  }
</script>

<svelte:head>
  <title>{title(offer)} — {provider?.name ?? offer.provider_id} — Subregator</title><meta
    name="description"
    content={`${human(offer.model)} offer: ${title(offer)} from ${provider?.name ?? offer.provider_id}. Review prices, fees, routing and terms, then contact the seller.`}
  />{#if data.demo}<meta name="robots" content="noindex,nofollow" />{/if}
</svelte:head>
<main id="main" class="detail-page">
  {#if data.demo}<div class="demo-notice">
      <Icon name="info" size={17} /><span>
        <strong>Demo offer.</strong> Fictional price and provider. This is not real inventory.
      </span>
    </div>{/if}
  <div class="detail-navigation">
    <a href={backURL}><Icon name="left" size={17} /> Back to catalogue</a><button
      class="button quiet"
      onclick={copyLink}
    >
      <Icon name={copied ? 'check' : 'copy'} size={16} />{copied ? 'Link copied' : 'Copy link'}
    </button>
  </div>
  {#if copyFailed}<p role="status" class="inline-notice">
      Copy is unavailable in this browser. You can share the address from your browser’s address
      bar.
    </p>{/if}
  <section class="offer-hero">
    <div>
      <div class="offer-badges">
        <span class="badge">IPv{offer.resource.family}</span><span class="badge">
          {human(offer.model)}
        </span><span class="badge" class:muted-badge={offer.availability !== 'available'}>
          {human(offer.availability)}
        </span>
      </div>
      <h1 class="mono">{title(offer)}</h1>
      <p class="detail-subtitle">
        {addressCount(offer.resource.address_count)} addresses <span>·</span>
        {offer.resource.rir || 'Registry not specified'} <span>·</span>
        {country(offer.geography.country)}
      </p>
      {#if !offer.resource.prefix}<p class="inline-notice">
          <Icon name="info" size={16} /> The prefix is not published. Ask the seller for permitted details.
        </p>{/if}
    </div>
    <div class="offer-hero-provider">
      <span class="seller-avatar large">{(provider?.name ?? offer.provider_id).slice(0, 1)}</span>
      <div>
        <span class="eyebrow">LISTED BY</span><strong>
          {provider?.name ?? offer.provider_id}
        </strong>{#if providerURL}<a href={providerURL} target="_blank" rel="noopener noreferrer">
            Provider website <Icon name="arrow" size={14} /><span class="visually-hidden">
              (opens in a new tab)
            </span>
          </a>{/if}
      </div>
    </div>
  </section>
  <div class="detail-layout">
    <div class="detail-content">
      <section class="detail-section">
        <div class="section-heading">
          <h2>Pricing & payment</h2>
          <span>{offer.quotes.length} {offer.quotes.length === 1 ? 'option' : 'options'}</span>
        </div>
        <p class="section-description">
          Original prices and billing periods. Fees and taxes are listed separately; no currency
          conversion is applied.
        </p>
        {#if !offer.quotes.length}<p class="inline-notice">
            No public tariff is available. Request pricing from the seller.
          </p>{/if}
        <div class="quotes">
          {#each offer.quotes as q}<article class="quote-card">
              <div class="quote-top">
                <div>
                  <p class="eyebrow">
                    {offer.model === 'purchase'
                      ? 'PURCHASE PRICE'
                      : q.billing_months === 1
                        ? 'MONTHLY BILLING'
                        : `${q.billing_months || 'UNSPECIFIED'} MONTH BILLING`}
                  </p>
                  <h3>{money(q.price)}</h3>
                  <p>{cycle(offer, q)}</p>
                </div>
                <span class="badge neutral-badge">
                  {q.minimum_months === null
                    ? 'Minimum term unspecified'
                    : `${q.minimum_months} month minimum`}
                </span>
              </div>
              <dl class="quote-facts">
                <div>
                  <dt>Taxes</dt>
                  <dd>{human(q.taxes)}</dd>
                </div>
                <div>
                  <dt>Tariff reference</dt>
                  <dd class="mono">{q.id}</dd>
                </div>
              </dl>
              <div class="fees">
                <h4>Additional fees & deposits</h4>
                {#if q.fees.length}{#each q.fees as fee}<div class="fee-row">
                      <div>
                        <strong>{human(fee.kind)}</strong>
                        <p>
                          {human(fee.frequency)}{#if fee.refundable !== null}
                            · {fee.refundable ? 'Refundable' : 'Non-refundable'}{/if}
                        </p>
                        {#if fee.condition}<p>{fee.condition}</p>{/if}
                      </div>
                      <strong>{fee.amount ? money(fee.amount) : 'Amount not specified'}</strong>
                    </div>{/each}{:else}<p class="muted">
                    No fee information supplied. Confirm whether additional charges apply.
                  </p>{/if}
              </div>
            </article>{/each}
        </div>
      </section>
      <section class="detail-section">
        <div class="section-heading">
          <h2>Network & location</h2>
          <Icon name="network" size={21} />
        </div>
        <dl class="facts-grid">
          <div>
            <dt>IP version</dt>
            <dd>IPv{offer.resource.family}</dd>
          </div>
          <div>
            <dt>Prefix length</dt>
            <dd class="mono">/{offer.resource.prefix_length}</dd>
          </div>
          <div>
            <dt>Published prefix</dt>
            <dd class="mono">{offer.resource.prefix ?? 'Not disclosed'}</dd>
          </div>
          <div>
            <dt>Address count</dt>
            <dd class="mono">{addressCount(offer.resource.address_count)}</dd>
          </div>
          <div>
            <dt>Regional registry</dt>
            <dd>{offer.resource.rir || 'Not specified'}</dd>
          </div>
          <div>
            <dt>Registration status</dt>
            <dd>{human(offer.resource.registration_status)}</dd>
          </div>
          <div>
            <dt>
              {offer.geography.basis === 'seller_country' ? 'Seller country' : 'Reported country'}
            </dt>
            <dd>{country(offer.geography.country)}</dd>
          </div>
          <div>
            <dt>City</dt>
            <dd>{offer.geography.city || 'Not specified'}</dd>
          </div>
          <div>
            <dt>Location provenance</dt>
            <dd>{human(offer.geography.basis)}</dd>
          </div>
          <div>
            <dt>Transfer registries</dt>
            <dd>{offer.resource.transfer_rirs?.join(', ') || 'Not specified'}</dd>
          </div>
        </dl>
        <p class="section-footnote">
          {offer.geography.basis === 'seller_country'
            ? 'The seller’s country does not establish the network’s location.'
            : 'Provider geolocation and registry data do not guarantee physical routing or location.'}
        </p>
      </section>
      <section class="detail-section">
        <div class="section-heading">
          <h2>Routing capabilities</h2>
          <Icon name="shield" size={21} />
        </div>
        <p class="section-description">
          Reported by the provider. These are advertised capabilities, not independent network test
          results.
        </p>
        <dl class="facts-grid">
          {#each [['BGP', human(offer.routing.bgp)], ['RPKI', human(offer.routing.rpki)], ['Reverse DNS', human(offer.routing.rdns)], ['Letter of authorization', human(offer.routing.loa)], ['Own ASN', yesNo(offer.routing.own_asn)], ['Transit required', yesNo(offer.routing.transit_required)]] as [label, value]}<div>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>{/each}
        </dl>
      </section>
      <section class="detail-section">
        <div class="section-heading"><h2>Terms & acceptable use</h2></div>
        <p class="terms-summary">
          {offer.terms.summary || 'The provider has not supplied a terms summary.'}
        </p>
        <div class="terms-columns">
          <div>
            <h3>Permitted uses</h3>
            {#if offer.terms.allowed_uses?.length}<ul>
                {#each offer.terms.allowed_uses as use}<li>{human(use)}</li>{/each}
              </ul>{:else}<p>Not specified</p>{/if}
          </div>
          <div>
            <h3>Prohibited uses</h3>
            {#if offer.terms.prohibited_uses?.length}<ul>
                {#each offer.terms.prohibited_uses as use}<li>{human(use)}</li>{/each}
              </ul>{:else}<p>Not specified</p>{/if}
          </div>
        </div>
        <dl class="facts-grid">
          <div>
            <dt>Notice period</dt>
            <dd>
              {offer.terms.notice_days === null
                ? 'Not specified'
                : `${offer.terms.notice_days} days`}
            </dd>
          </div>
          <div>
            <dt>Verification</dt>
            <dd>{offer.terms.verification || 'Not specified'}</dd>
          </div>
          <div>
            <dt>Availability</dt>
            <dd>{human(offer.availability)}</dd>
          </div>
          <div>
            <dt>Available from</dt>
            <dd>{date(offer.available_at)}</dd>
          </div>
        </dl>
      </section>
      <section class="detail-section source-section">
        <div class="section-heading">
          <h2>Source & transparency</h2>
          <span class="freshness-label" class:warning={offer.freshness !== 'fresh'}>
            <Icon name={offer.freshness === 'fresh' ? 'fresh' : 'stale'} size={16} />{human(
              offer.freshness
            )}
          </span>
        </div>
        <dl class="facts-grid">
          <div>
            <dt>Offer observed</dt>
            <dd>{date(offer.observed_at)}</dd>
          </div>
          <div>
            <dt>Source last updated</dt>
            <dd>{date(offer.source_updated_at)}</dd>
          </div>
          <div>
            <dt>Provider last successful refresh</dt>
            <dd>{date(provider?.source?.last_success)}</dd>
          </div>
          <div>
            <dt>Provider last refresh attempt</dt>
            <dd>{date(provider?.source?.last_attempt)}</dd>
          </div>
          <div>
            <dt>Provider freshness</dt>
            <dd>{human(provider?.freshness)}</dd>
          </div>
          <div>
            <dt>Last feed complete</dt>
            <dd>{provider?.source ? yesNo(provider.source.complete) : 'Not recorded'}</dd>
          </div>
          <div>
            <dt>Publication basis</dt>
            <dd>{human(provider?.policy.publication)}</dd>
          </div>
          <div>
            <dt>Minimum refresh interval</dt>
            <dd>
              {provider ? `${provider.policy.min_refresh_seconds / 60} minutes` : 'Not specified'}
            </dd>
          </div>
          <div>
            <dt>Listing ID</dt>
            <dd class="mono">{offer.id}</dd>
          </div>
          <div>
            <dt>Provider reference</dt>
            <dd class="mono">{offer.external_id}</dd>
          </div>
        </dl>
        {#if provider?.source?.error}<p class="inline-notice">
            <Icon name="info" size={17} /> The latest provider refresh failed. The last complete observation
            is retained.
          </p>{/if}{#if provider?.description}<p class="section-description">
            {provider.description}
          </p>{/if}{#if provider?.policy.conditions.length}<h3 class="source-conditions-title">
            Source conditions
          </h3>
          <ul class="source-conditions">
            {#each provider.policy.conditions as condition}<li>{condition}</li>{/each}
          </ul>{/if}
        <p class="section-footnote">
          Data reflects what was observed at the source. Unknown information stays unknown. A
          listing does not establish ownership or guarantee availability.
        </p>
      </section>
    </div>
    <aside class="detail-sidebar">
      <div class="seller-panel">
        <p class="eyebrow">{offer.model === 'lease' ? 'LEASE OFFER' : 'PURCHASE OFFER'}</p>
        <p class="seller-price">{money(quote?.price ?? null)}</p>
        <p class="muted">
          {cycle(offer, quote)}{#if offer.quotes.length > 1}
            · {offer.quotes.length} tariffs available{/if}
        </p>
        <div class="seller-panel-divider"></div>
        <p class="seller-panel-summary">Everything starts with a conversation.</p>
        <p class="muted">
          Confirm pricing, fees and current availability directly with {provider?.name ??
            'the seller'}.
        </p>
        {#if sellerURL}<a
            class="button primary seller-button"
            href={sellerURL}
            target="_blank"
            rel="noopener noreferrer"
          >
            View offer at seller <Icon name="arrow" size={19} /><span class="visually-hidden">
              (opens in a new tab)
            </span>
          </a>{:else}<p class="inline-notice">No valid offer link was supplied.</p>{/if}
        <p class="seller-disclaimer">
          You’ll leave Subregator. We don’t sell IPs, handle payments, or act as a broker.
        </p>
        {#if offer.freshness !== 'fresh'}<div class="stale-warning">
            <Icon name="stale" size={18} />
            <p>
              This observation is {human(offer.freshness).toLowerCase()}. Confirm all details before
              proceeding.
            </p>
          </div>{/if}
      </div>
      <div class="detail-sidebar-note">
        <Icon name="info" size={19} />
        <p>Displayed prices are base prices. Taxes, fees and deposits can change the total.</p>
      </div>
    </aside>
  </div>
</main>
