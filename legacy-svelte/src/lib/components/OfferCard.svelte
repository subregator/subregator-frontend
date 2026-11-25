<script lang="ts">
  import type { Offer, Provider } from '#lib/contracts.ts';
  import {
    addressCount,
    bestQuote,
    country,
    cycle,
    human,
    money,
    relative,
    title
  } from '#lib/format.ts';
  import Icon from './Icon.svelte';
  let { offer, provider, returnTo }: { offer: Offer; provider?: Provider; returnTo: string } =
    $props();
  let quote = $derived(bestQuote(offer));
</script>

<article class="offer-row">
  <div class="offer-resource">
    <span class="family-marker">v{offer.resource.family}</span>
    <div>
      <a
        class="resource-link mono"
        href={`/offers/${encodeURIComponent(offer.id)}?from=${encodeURIComponent(returnTo)}`}
      >
        {title(offer)}
      </a><span class="subline">
        {addressCount(offer.resource.address_count)} addresses <span class="separator">·</span>
        /{offer.resource.prefix_length}{#if !offer.resource.prefix}
          <span class="hidden-prefix">Prefix undisclosed</span>{/if}
      </span>
    </div>
  </div>
  <div class="offer-provider">
    <span class="seller-avatar">{(provider?.name ?? offer.provider_id).slice(0, 1)}</span>
    <div>
      <span>{provider?.name ?? offer.provider_id}</span><span class="subline">
        {offer.resource.rir || 'RIR not specified'}
      </span>
    </div>
  </div>
  <div class="offer-location">
    <span>{country(offer.geography.country)}</span><span class="subline">
      {offer.geography.basis === 'seller_country'
        ? 'Seller location only'
        : offer.geography.city || human(offer.geography.basis)}
    </span>
  </div>
  <div class="offer-price">
    <strong>{money(quote?.price ?? null)}</strong><span class="subline">{cycle(offer, quote)}</span>
  </div>
  <div class="offer-freshness">
    <span class:warning={offer.freshness !== 'fresh'} class="freshness-label">
      <Icon name={offer.freshness === 'fresh' ? 'fresh' : 'stale'} size={15} />{human(
        offer.freshness
      )}
    </span><span class="subline">{relative(offer.observed_at)}</span>
  </div>
  <a
    class="row-open"
    href={`/offers/${encodeURIComponent(offer.id)}?from=${encodeURIComponent(returnTo)}`}
    aria-label={`View ${title(offer)} from ${provider?.name ?? offer.provider_id}`}
  >
    <Icon name="right" size={19} />
  </a>
  <div class="mobile-offer-meta">
    <span>
      {human(offer.model)} <span class="separator">·</span>
      {human(offer.availability)}
    </span>{#if offer.quotes.length > 1}<span>{offer.quotes.length} payment options</span>{/if}
  </div>
</article>
