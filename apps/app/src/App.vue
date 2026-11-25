<script setup lang="ts">
import { nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();

watch(() => route.path, async () => {
  document.title = route.meta.title ? `${route.meta.title} · RepHarbor` : 'RepHarbor';
  await nextTick();
  document.querySelector<HTMLElement>('main h1[tabindex="-1"]')?.focus({ preventScroll: true });
}, { flush: 'post' });
</script>

<template>
  <RouterView />
</template>
