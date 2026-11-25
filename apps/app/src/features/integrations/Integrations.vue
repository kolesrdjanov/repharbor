<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { listProducts, loadAll } from '@/api/engagements';
import { listConnections } from '@/api/integrations';
import { useQuery } from '@/composables/query';
import { Button } from '@repharbor/ui/components/ui/button';
import QueryStatus from '@/features/engagements/QueryStatus.vue';
import { useSession } from '@/stores/session';
import SourceCard from './SourceCard.vue';
import SourceDialog from './SourceDialog.vue';

const companyId = String(useRoute().params.companyId);
const session = useSession();
const company = computed(() => session.identity?.companies.find((row) => row.id === companyId));
const { data, busy, error, reload } = useQuery(async (signal) => {
  const [sources, products] = await Promise.all([
    loadAll((cursor) => listConnections(companyId, cursor, signal)),
    loadAll((cursor) => listProducts(companyId, cursor, signal)),
  ]);
  return { sources, products };
});
onMounted(() => { if (company.value) void reload(); });
</script>

<template>
  <h1 tabindex="-1" class="text-3xl font-semibold tracking-tight focus:outline-none">Integrations</h1>
  <p v-if="!company" class="text-sm text-muted-foreground">Choose a company you manage to view integrations.</p>
  <template v-else>
    <div class="flex flex-wrap items-center gap-2">
      <Button as-child variant="outline"><RouterLink :to="{ name: 'company', params: { companyId } }">{{ company.name }}</RouterLink></Button>
      <Button as-child variant="outline"><RouterLink :to="{ name: 'review', params: { companyId } }">Review sales</RouterLink></Button>
      <SourceDialog :company-id="companyId" @saved="reload" />
      <Button variant="ghost" :disabled="busy" @click="reload">Refresh connections</Button>
    </div>
    <QueryStatus :busy="busy" :error="error" @retry="reload" />
    <p v-if="data?.sources.length === 0" class="text-sm text-muted-foreground">Connect a revenue source to track payments for your products.</p>
    <SourceCard v-for="source in data?.sources" :key="source.id" :company-id="companyId" :source="source" :products="data?.products ?? []" @changed="reload" />
  </template>
</template>
