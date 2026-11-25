<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { components } from '@repharbor/contracts';
import { loadAll } from '@/api/engagements';
import { listReview } from '@/api/integrations';
import { useQuery } from '@/composables/query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import QueryStatus from '@/features/engagements/QueryStatus.vue';
import { formatMoney } from '@/features/statements/money';
import { useSession } from '@/stores/session';
import ReviewDialog from './ReviewDialog.vue';

const companyId = String(useRoute().params.companyId);
const session = useSession();
const allowed = computed(() => session.identity?.companies.some((row) => row.id === companyId));
const { data, busy, error, reload } = useQuery((signal) => loadAll((cursor) => listReview(companyId, cursor, signal)));
const resolved = ref<components['schemas']['ReviewItem']>();
const reasons: Record<string, string> = {
  CUSTOMER_UNMATCHED: 'Customer match required',
  PRODUCT_UNMAPPED: 'Product mapping required',
  BASIS_UNKNOWN: 'Eligible amount needs review',
  TERMS_REQUIRED: 'Accepted terms required',
  COLLECTION_UNVERIFIED: 'Collection could not be verified',
  REFUND_ALLOCATION_UNKNOWN: 'Refund could match multiple sale lines',
  REFUND_BASIS_UNKNOWN: 'Refund basis needs review',
};
async function saved(item: components['schemas']['ReviewItem']) {
  resolved.value = item;
  await reload();
  document.getElementById('review-result')?.focus();
}
onMounted(() => { if (allowed.value) void reload(); });
</script>

<template>
  <h1 tabindex="-1" class="text-3xl font-semibold tracking-tight focus:outline-none">Sales review</h1>
  <p v-if="!allowed" class="text-sm text-muted-foreground">Choose a company you manage to review sales.</p>
  <template v-else>
    <Button as-child variant="outline" class="h-11"><RouterLink :to="{ name: 'integrations', params: { companyId } }">Back to integrations</RouterLink></Button>
    <QueryStatus :busy="busy" :error="error" @retry="reload" />
    <div v-if="resolved" id="review-result" role="status" tabindex="-1" class="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
      <p class="text-sm">Sales review decision saved.</p>
      <Button v-if="resolved.postedEngagementId && resolved.postedEntryId" as-child variant="outline" class="h-11">
        <RouterLink :to="{ name: 'statement-entry', params: { engagementId: resolved.postedEngagementId, entryId: resolved.postedEntryId } }">View statement entry</RouterLink>
      </Button>
    </div>
    <p v-if="data?.length === 0" class="text-sm text-muted-foreground">No sales need review.</p>
    <Card v-for="item in data" :key="item.id">
      <CardHeader><h2 class="break-all text-lg font-semibold">{{ item.customerLabel }}</h2></CardHeader>
      <CardContent class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p class="text-sm text-muted-foreground">{{ reasons[item.reason] ?? item.reason.replaceAll('_', ' ').toLowerCase() }}</p>
          <p v-if="item.currency && item.amountMinor" class="mt-1 font-medium tabular-nums">{{ formatMoney(item.amountMinor, item.currency) }}</p>
        </div>
        <ReviewDialog :company-id="companyId" :item="item" @saved="saved" />
      </CardContent>
    </Card>
  </template>
</template>
