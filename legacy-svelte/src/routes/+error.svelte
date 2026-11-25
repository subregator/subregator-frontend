<script lang="ts">
  import { page } from '$app/state';
  import Icon from '#lib/components/Icon.svelte';
</script>

<svelte:head>
  <title>{page.status} — Subregator</title><meta name="robots" content="noindex" />
</svelte:head>
<main id="main" class="error-page">
  <div class="state-icon"><Icon name="info" size={28} /></div>
  <p class="eyebrow">{page.status}</p>
  <h1>{page.status === 404 ? 'This offer has moved on.' : 'We couldn’t load this page.'}</h1>
  <p>{page.error?.message || 'Please try again shortly.'}</p>
  <a class="button primary" href="/">Back to catalogue <Icon name="right" size={18} /></a>
</main>
