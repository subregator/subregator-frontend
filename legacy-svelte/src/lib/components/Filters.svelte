<script lang="ts">
  import type { Provider, Result } from '#lib/contracts.ts';
  import { allAvailability } from '#lib/filters.ts';
  import { country } from '#lib/format.ts';
  import Icon from './Icon.svelte';
  let {
    filters,
    providers,
    facets,
    onapply,
    prefix = ''
  }: {
    filters: Record<string, string>;
    providers: Provider[];
    facets: Result['facets'] | null;
    onapply?: () => void;
    prefix?: string;
  } = $props();
</script>

<form action="/" method="GET" class="filters-form" onsubmit={onapply}>
  <input type="hidden" name="q" value={filters.q ?? ''} />
  <input type="hidden" name="model" value={filters.model ?? 'lease'} />
  <div class="filter-heading">
    <h2>Refine your search</h2>
    <a href="/">Reset</a>
  </div>
  <label for={prefix + 'family'}>IP version</label><select
    id={prefix + 'family'}
    name="family"
    value={filters.family ?? ''}
  >
    <option value="">IPv4 & IPv6</option><option value="4">IPv4</option><option value="6">
      IPv6
    </option>
  </select>
  <fieldset>
    <legend>Prefix length</legend>
    <div class="field-pair">
      <label class="visually-hidden" for={prefix + 'min-prefix'}>Minimum prefix length</label><input
        id={prefix + 'min-prefix'}
        name="min_prefix"
        type="number"
        min="0"
        max="128"
        placeholder="Min /"
        value={filters.min_prefix ?? ''}
      /><span>–</span><label class="visually-hidden" for={prefix + 'max-prefix'}>
        Maximum prefix length
      </label><input
        id={prefix + 'max-prefix'}
        name="max_prefix"
        type="number"
        min="0"
        max="128"
        placeholder="Max /"
        value={filters.max_prefix ?? ''}
      />
    </div>
  </fieldset>
  <label for={prefix + 'country'}>Country</label><select
    id={prefix + 'country'}
    name="country"
    value={filters.country ?? ''}
  >
    <option value="">
      All countries
    </option>{#each Object.keys(facets?.countries ?? {}).sort( (a, b) => country(a).localeCompare(country(b)) ) as code}<option
        value={code}
      >
        {country(code)}
      </option>{/each}
  </select>
  <label for={prefix + 'rir'}>Regional registry</label><select
    id={prefix + 'rir'}
    name="rir"
    value={filters.rir ?? ''}
  >
    <option value="">
      All registries
    </option>{#each ['RIPE NCC', 'ARIN', 'APNIC', 'LACNIC', 'AFRINIC'] as rir}<option value={rir}>
        {rir}
      </option>{/each}
  </select>
  <label for={prefix + 'provider'}>Provider</label><select
    id={prefix + 'provider'}
    name="provider"
    value={filters.provider ?? ''}
  >
    <option value="">All providers</option>{#each providers as p}<option value={p.id}>
        {p.name}
      </option>{/each}
  </select>
  <div class="filter-divider"></div>
  <label for={prefix + 'currency'}>Price currency</label><select
    id={prefix + 'currency'}
    name="currency"
    value={filters.currency ?? 'USD'}
  >
    <option value="">
      All currencies
    </option>{#each [...new Set( ['USD', 'EUR', ...Object.keys(facets?.currencies ?? {})] )].sort() as c}<option
        value={c}
      >
        {c}
      </option>{/each}
  </select>
  <fieldset>
    <legend>Base price range</legend>
    <div class="field-pair">
      <label class="visually-hidden" for={prefix + 'min-price'}>Minimum price</label><input
        id={prefix + 'min-price'}
        name="min_price"
        type="number"
        min="0"
        step="0.01"
        placeholder="From"
        value={filters.min_price ?? ''}
      /><span>–</span><label class="visually-hidden" for={prefix + 'max-price'}>
        Maximum price
      </label><input
        id={prefix + 'max-price'}
        name="max_price"
        type="number"
        min="0"
        step="0.01"
        placeholder="To"
        value={filters.max_price ?? ''}
      />
    </div>
    <p class="field-help">Monthly equivalent for leases. Full amount for purchases. Fees extra.</p>
  </fieldset>
  <label for={prefix + 'availability'}>Availability</label><select
    id={prefix + 'availability'}
    name="availability"
    value={filters.availability ?? 'available'}
  >
    <option value="available">Available now</option><option value={allAvailability}>
      All statuses
    </option><option value="upcoming">Upcoming</option><option value="waitlist">
      Waitlist
    </option><option value="unavailable">Unavailable</option><option value="unknown">
      Unknown
    </option>
  </select>
  <details class="advanced-filters">
    <summary>More filters <Icon name="down" size={16} /></summary><label
      for={prefix + 'billing-months'}
    >
      Billing period (months)
    </label><input
      id={prefix + 'billing-months'}
      name="billing_months"
      type="number"
      min="1"
      max="1200"
      placeholder="Any period"
      value={filters.billing_months ?? ''}
    /><label for={prefix + 'geography-basis'}>Location data source</label><select
      id={prefix + 'geography-basis'}
      name="geography_basis"
      value={filters.geography_basis ?? ''}
    >
      <option value="">Network location</option><option value="provider_geolocation">
        Provider geolocation
      </option><option value="registry">Registry record</option><option value="seller_country">
        Seller country
      </option><option value="unknown">Unknown</option>
    </select><label for={prefix + 'within'}>Within a network (CIDR)</label><input
      id={prefix + 'within'}
      name="within"
      placeholder="e.g. 192.0.2.0/24"
      value={filters.within ?? ''}
    /><label class="checkbox-label">
      <input
        type="checkbox"
        name="fresh_only"
        value="true"
        checked={filters.fresh_only === 'true'}
      /> Fresh observations only
    </label>
  </details>
  <input type="hidden" name="sort" value={filters.sort ?? 'price_asc'} />
  <button class="button primary apply-filters" type="submit">
    Apply filters <Icon name="right" size={17} />
  </button>
</form>
