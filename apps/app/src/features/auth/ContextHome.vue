<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useSession } from '@/stores/session';

const session = useSession();
const route = useRoute();
const company = computed(() => session.identity?.companies.find(({ id }) => id === route.params.companyId));
</script>

<template>
  <h1 tabindex="-1" class="text-3xl font-semibold tracking-tight focus:outline-none">
    {{ route.name === 'portfolio' ? 'Your portfolio' : company?.name ?? 'Company unavailable' }}
  </h1>
  <p class="text-sm text-muted-foreground">Signed in as {{ session.identity?.email }}.</p>
</template>
