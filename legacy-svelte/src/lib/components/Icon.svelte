<script lang="ts">
  import {
    IconArrowUpRight,
    IconArrowRight,
    IconArrowLeft,
    IconSearch,
    IconAdjustmentsHorizontal,
    IconX,
    IconChevronDown,
    IconCircleCheck,
    IconClock,
    IconGlobe,
    IconStack2,
    IconExternalLink,
    IconCopy,
    IconCheck,
    IconInfoCircle,
    IconRefresh,
    IconArrowNarrowRight,
    IconNetwork,
    IconShieldCheck
  } from '@tabler/icons-svelte';
  let { name, size = 20 }: { name: string; size?: number } = $props();
  const icons: Record<string, typeof IconSearch> = {
    arrow: IconArrowUpRight,
    right: IconArrowRight,
    left: IconArrowLeft,
    search: IconSearch,
    filters: IconAdjustmentsHorizontal,
    close: IconX,
    down: IconChevronDown,
    fresh: IconCircleCheck,
    stale: IconClock,
    globe: IconGlobe,
    stack: IconStack2,
    external: IconExternalLink,
    copy: IconCopy,
    check: IconCheck,
    info: IconInfoCircle,
    refresh: IconRefresh,
    longarrow: IconArrowNarrowRight,
    network: IconNetwork,
    shield: IconShieldCheck
  };
  let Component = $derived(icons[name] ?? IconInfoCircle);
</script>

<Component {size} stroke={1.6} aria-hidden="true" />
