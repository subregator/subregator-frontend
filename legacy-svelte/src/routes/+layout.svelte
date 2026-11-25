<script lang="ts">
  import '@fontsource-variable/geist';
  import '@fontsource-variable/geist-mono';
  import '../app.css';
  import { navigating, page } from '$app/state';
  import Icon from '#lib/components/Icon.svelte';
  let { children } = $props();
</script>

<svelte:head>
  <meta
    name="description"
    content="Find and understand IPv4 and IPv6 offers. Compare prices, routing capabilities and terms, then contact the seller directly."
  />
</svelte:head>
<a href="#main" class="skip-link">Skip to content</a>
{#if navigating.to}<div
    class="navigation-progress"
    role="status"
    aria-label="Loading page"
  ></div>{/if}
<header class="site-header">
  <div class="header-inner">
    <a class="brand" href="/" aria-label="Subregator home">
      <span class="brand-mark"><Icon name="stack" size={25} /></span>subregator<span
        class="brand-dot"
      >
        .
      </span>
    </a>
    <nav aria-label="Main navigation">
      <a
        href="/"
        class:active={page.url.pathname === '/' || page.url.pathname.startsWith('/offers/')}
        aria-current={page.url.pathname === '/' || page.url.pathname.startsWith('/offers/')
          ? 'page'
          : undefined}
      >
        IP catalogue
      </a><a href="/#how-it-works">How it works <Icon name="arrow" size={15} /></a>
    </nav>
    <span class="header-note"><span class="status-dot"></span> Independent. Open. Read-only.</span>
  </div>
</header>
{@render children()}
<footer class="site-footer">
  <div>
    <a class="brand footer-brand" href="/">subregator<span class="brand-dot">.</span></a>
    <p>A clearer view of the IP market.</p>
  </div>
  <p>
    We aggregate information. All enquiries and transactions<br class="desktop-only" /> take place directly
    with the seller.
  </p>
  <a href="/#how-it-works">About the data <Icon name="arrow" size={16} /></a>
</footer>
