<script lang="ts">
  import { page, navigating } from '$app/state';
  import { tick } from 'svelte';
  import type { PageProps } from './$types';
  import Filters from '#lib/components/Filters.svelte';
  import OfferCard from '#lib/components/OfferCard.svelte';
  import Icon from '#lib/components/Icon.svelte';
  import { pageURL } from '#lib/filters.ts';
  import { country, human } from '#lib/format.ts';
  let { data }: PageProps = $props();
  let filterDialog = $state<HTMLDialogElement>()!;
  let mobileOpen = $state(false);
  let result = $derived(data.result);
  let activeFilters = $derived(
    Object.entries(data.filters).filter(
      ([k, v]) =>
        v && !['model', 'currency', 'sort', 'availability', 'offset', 'snapshot'].includes(k)
    )
  );
  let returnTo = $derived(page.url.pathname + page.url.search);
  function change(values: Record<string, string | null>) {
    const next = new URLSearchParams(page.url.search);
    next.delete('offset');
    next.delete('snapshot');
    for (const [key, value] of Object.entries(values))
      value === null ? next.delete(key) : next.set(key, value);
    return `/?${next}`;
  }
  async function openFilters() {
    mobileOpen = true;
    await tick();
    filterDialog.showModal();
  }
  function closeFilters() {
    filterDialog.close();
    mobileOpen = false;
  }
</script>

<svelte:head>
  <title>IP catalogue — Subregator</title>{#if data.demo}<meta
      name="robots"
      content="noindex,nofollow"
    />{/if}
</svelte:head>
<main id="main" class="catalogue-page">
  {#if data.demo}<div class="demo-notice">
      <Icon name="info" size={17} /><span>
        <strong>Demo catalogue.</strong> Fictional providers, prices and documentation networks. Seller
        links are examples.
      </span>
    </div>{/if}
  <section class="catalogue-intro">
    <div>
      <p class="eyebrow"><span class="little-line"></span> THE IP RESOURCE INDEX</p>
      <h1>Your next network.<br /><span>A clearer choice.</span></h1>
      <p class="intro-description">
        Explore IP offers across providers. Understand the price,<br class="desktop-only" /> the terms,
        and the network — before you reach out.
      </p>
    </div>
    <div class="intro-aside">
      <div class="network-art" aria-hidden="true">
        <span></span><span></span><span></span><span></span><span></span><span></span><span
        ></span><span></span><span></span>
      </div>
      <div>
        <Icon name="globe" size={19} />
        <p>One place to explore.<br /><strong>Your choice of provider.</strong></p>
      </div>
    </div>
  </section>
  <section class="catalogue-workspace" aria-label="Search IP offers">
    <div class="workspace-heading">
      <div class="model-tabs" aria-label="Offer model">
        <a
          class:selected={data.filters.model === 'lease'}
          aria-current={data.filters.model === 'lease' ? 'page' : undefined}
          href={change({ model: 'lease' })}
        >
          Lease IPs
        </a><a
          class:selected={data.filters.model === 'purchase'}
          aria-current={data.filters.model === 'purchase' ? 'page' : undefined}
          href={change({ model: 'purchase' })}
        >
          Buy IPs
        </a>
      </div>
      <div class="workspace-note">
        <Icon name="shield" size={17} /> Direct from the source. No checkout here.
      </div>
    </div>
    <div class="catalogue-layout">
      <aside class="desktop-filters" aria-label="Catalogue filters">
        {#key page.url.search}<Filters
            filters={data.filters}
            providers={data.providers}
            facets={data.facets}
          />{/key}
        <div class="filter-note">
          <Icon name="info" size={17} />
          <p>
            A listed offer is an observation, not a guarantee of availability. Always confirm with
            the seller.
          </p>
        </div>
      </aside>
      <div class="catalogue-results" aria-busy={!!navigating.to}>
        <div class="search-toolbar">
          <form action="/" method="GET" class="search-form" role="search">
            {#each Object.entries(data.filters).filter(([key]) => !['q', 'offset', 'snapshot'].includes(key)) as [key, value]}<input
                type="hidden"
                name={key}
                {value}
              />{/each}<Icon name="search" size={20} /><label
              class="visually-hidden"
              for="catalogue-search"
            >
              Search offers
            </label><input
              id="catalogue-search"
              type="search"
              name="q"
              maxlength="200"
              value={data.filters.q ?? ''}
              placeholder="Search a network, country, or provider…"
            /><button type="submit" aria-label="Search offers">
              <Icon name="right" size={19} />
            </button>
          </form>
          <button class="button mobile-filter-button" onclick={openFilters}>
            <Icon name="filters" size={19} /> Filters{#if activeFilters.length}<span
                class="filter-count"
              >
                {activeFilters.length}
              </span>{/if}
          </button>
        </div>
        {#if activeFilters.length}<div class="active-filters" aria-label="Active filters">
            {#each activeFilters as [key, value]}<a
                href={change({ [key]: null })}
                aria-label={`Remove ${key.replaceAll('_', ' ')} filter: ${value}`}
              >
                {key === 'country'
                  ? country(value)
                  : key === 'provider'
                    ? (data.providers.find((p) => p.id === value)?.name ?? value)
                    : `${human(key)}: ${value}`}<Icon name="close" size={13} />
              </a>{/each}<a
              class="clear-all"
              href={change(Object.fromEntries(activeFilters.map(([key]) => [key, null])))}
            >
              Clear filters
            </a>
          </div>{/if}
        <div class="results-toolbar">
          <p aria-live="polite">
            <strong>{result?.total.toLocaleString('en-US') ?? '—'}</strong>
            {data.filters.model === 'purchase' ? 'purchase' : 'lease'} offers
            <span class="results-context">· {data.filters.currency || 'all currencies'}</span>
          </p>
          <form action="/" method="GET" class="sort-form">
            {#each Object.entries(data.filters).filter(([key]) => !['sort', 'offset', 'snapshot'].includes(key)) as [key, value]}<input
                type="hidden"
                name={key}
                {value}
              />{/each}<label for="sort">Sort by</label><select
              id="sort"
              aria-label="Sort by"
              name="sort"
              value={data.filters.sort}
              onchange={(e) => e.currentTarget.form?.requestSubmit()}
            >
              <option value="price_asc" disabled={!data.filters.currency}>
                Price: low to high
              </option><option value="price_desc" disabled={!data.filters.currency}>
                Price: high to low
              </option><option value="updated_desc">Recently observed</option><option
                value="prefix_asc"
              >
                Larger blocks first
              </option><option value="prefix_desc">Smaller blocks first</option>
            </select><button class="sort-submit" type="submit" aria-label="Apply sort">
              <Icon name="right" size={17} />
            </button>
          </form>
        </div>
        {#if data.issue}
          <div class="empty-state" role="alert">
            <div class="state-icon"><Icon name="info" size={26} /></div>
            <p class="eyebrow">
              {data.issue.status === 409
                ? 'CATALOGUE UPDATED'
                : data.issue.status === 400
                  ? 'CHECK YOUR FILTERS'
                  : 'UNABLE TO LOAD'}
            </p>
            <h2>
              {data.issue.status === 409
                ? 'A fresh set of results is ready.'
                : data.issue.status === 400
                  ? 'Let’s adjust that search.'
                  : 'The catalogue needs a moment.'}
            </h2>
            <p>{data.issue.message}</p>
            {#if 'retryAfter' in data.issue && data.issue.retryAfter}<p>
                Retry after: {data.issue.retryAfter}
              </p>{/if}
            <div class="state-actions">
              <a class="button primary" href={change({ offset: null, snapshot: null })}>
                Try again <Icon name="refresh" size={17} />
              </a><a class="button" href="/">Reset filters</a>
            </div>
          </div>
        {:else if result && result.items.length}
          <div class="offer-list">
            <div class="offer-list-heading" aria-hidden="true">
              <span>NETWORK / SIZE</span><span>PROVIDER / RIR</span><span>LOCATION</span><span>
                BASE PRICE
              </span><span>OBSERVED</span><span></span>
            </div>
            {#each result.items as offer (offer.id)}<OfferCard
                {offer}
                provider={data.providers.find((p) => p.id === offer.provider_id)}
                {returnTo}
              />{/each}
          </div>
          <div class="results-bottom">
            <p>
              Lease sorting uses monthly equivalents; displayed prices follow source billing
              periods. Fees and taxes may apply.
            </p>
            <span><Icon name="info" size={14} /> No currency conversion</span>
          </div>
          {#if result.offset > 0 || result.next_offset !== null}<nav
              class="pagination"
              aria-label="Results pages"
            >
              {#if result.offset > 0}<a
                  class="button"
                  href={pageURL(
                    new URLSearchParams(page.url.search),
                    Math.max(0, result.offset - result.limit),
                    result.snapshot
                  )}
                >
                  <Icon name="left" size={17} /> Previous
                </a>{/if}<span>
                {result.offset + 1}–{Math.min(result.offset + result.limit, result.total)} of {result.total}
              </span>{#if result.next_offset !== null}<a
                  class="button"
                  href={pageURL(
                    new URLSearchParams(page.url.search),
                    result.next_offset,
                    result.snapshot
                  )}
                >
                  Next <Icon name="right" size={17} />
                </a>{/if}
            </nav>{/if}
        {:else}
          <div class="empty-state">
            <div class="state-icon"><Icon name="search" size={26} /></div>
            <p class="eyebrow">ROOM TO EXPLORE</p>
            <h2>No offers match these filters.</h2>
            <p>
              Try a different country, a wider prefix range, or another currency. Providers may also
              have no available inventory.
            </p>
            <a class="button primary" href="/">Reset filters <Icon name="right" size={17} /></a>
          </div>
        {/if}
      </div>
    </div>
  </section>
  <section id="how-it-works" class="how-it-works">
    <div>
      <p class="eyebrow">A LITTLE MORE CLARITY</p>
      <h2>Information first.<br />The decision is yours.</h2>
    </div>
    <div>
      <span class="step-number">01</span>
      <h3>Find your fit</h3>
      <p>Explore purchase and lease offers. Compare within the same currency and billing model.</p>
    </div>
    <div>
      <span class="step-number">02</span>
      <h3>See the whole picture</h3>
      <p>
        Read every tariff, fee, routing capability and restriction the provider makes available.
      </p>
    </div>
    <div>
      <span class="step-number">03</span>
      <h3>Talk to the source</h3>
      <p>
        Go straight to the seller. Confirm the details and availability before making a commitment.
      </p>
    </div>
  </section>
</main>
{#if mobileOpen}<dialog
    class="filter-dialog"
    bind:this={filterDialog}
    onclose={() => (mobileOpen = false)}
    aria-labelledby="mobile-filter-title"
  >
    <div class="dialog-heading">
      <h2 id="mobile-filter-title">Filters</h2>
      <button class="icon-button" onclick={closeFilters} aria-label="Close filters">
        <Icon name="close" />
      </button>
    </div>
    <Filters
      prefix="mobile-"
      filters={data.filters}
      providers={data.providers}
      facets={data.facets}
      onapply={closeFilters}
    />
  </dialog>{/if}
