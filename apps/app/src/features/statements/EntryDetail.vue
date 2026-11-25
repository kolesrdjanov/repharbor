<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { getEngagement, listAgreements, loadAll } from '@/api/engagements';
import { getEntry } from '@/api/statements';
import { useQuery } from '@/composables/query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import QueryStatus from '@/features/engagements/QueryStatus.vue';
import { entryNames } from './EntryLabels';
import PaymentDialog from './PaymentDialog.vue';
import { formatMoney } from './money';

const route = useRoute();
const engagement = String(route.params.engagementId);
const id = String(route.params.entryId);
const reversed = ref(false);
const { data, busy, error, reload } = useQuery(async (signal) => {
  const [item, context] = await Promise.all([getEntry(engagement, id, signal), getEngagement(engagement, signal)]);
  const agreement = item.agreementId
    ? (await loadAll((cursor) => listAgreements(engagement, cursor, signal))).find((version) => version.id === item.agreementId)
    : undefined;
  return { item, agreement, context };
});
onMounted(reload);
</script>

<template>
  <Button as-child variant="outline" class="h-11"><RouterLink :to="{ name: 'statement', params: { engagementId: engagement } }">Back to statement</RouterLink></Button>
  <h1 tabindex="-1" class="text-3xl font-semibold tracking-tight focus:outline-none">{{ data ? entryNames[data.item.kind] : 'Statement entry' }}</h1>
  <QueryStatus :busy="busy" :error="error" @retry="reload" />
  <Card v-if="data">
    <CardHeader><p class="text-3xl font-semibold tabular-nums">{{ formatMoney(data.item.deltaMinor, data.item.currency) }}</p></CardHeader>
    <CardContent>
      <dl class="grid gap-4 text-sm sm:grid-cols-2">
        <div><dt class="text-muted-foreground">{{ data.item.paidOn ? 'Date paid' : 'Effective date (UTC)' }}</dt><dd>{{ data.item.paidOn ?? data.item.effectiveAt.slice(0, 10) }}</dd></div>
        <div><dt class="text-muted-foreground">Recorded at (UTC)</dt><dd>{{ data.item.postedAt.replace('T', ' ').slice(0, 19) }}</dd></div>
        <div v-if="data.item.customerLabel"><dt class="text-muted-foreground">Customer</dt><dd>{{ data.item.customerLabel }}</dd></div>
        <div v-if="data.item.basisMinor"><dt class="text-muted-foreground">Eligible basis</dt><dd>{{ formatMoney(data.item.basisMinor, data.item.currency) }}</dd></div>
        <div v-if="data.item.rateBps !== undefined"><dt class="text-muted-foreground">Commission rate</dt><dd>{{ data.item.rateBps / 100 }}%</dd></div>
        <div v-if="data.agreement"><dt class="text-muted-foreground">Agreement revision</dt><dd>{{ data.agreement.revision }}</dd></div>
        <div v-if="data.item.source"><dt class="text-muted-foreground">Provider transaction</dt><dd class="break-all">{{ data.item.source }} · {{ data.item.sourceTransactionRef }}</dd></div>
        <div v-if="data.item.dueOn"><dt class="text-muted-foreground">Due date</dt><dd>{{ data.item.dueOn }}</dd></div>
        <div v-if="data.item.kind === 'external_payment'"><dt class="text-muted-foreground">Source</dt><dd>Recorded by founder</dd></div>
        <div v-if="data.item.paymentReference"><dt class="text-muted-foreground">Payment reference</dt><dd>{{ data.item.paymentReference }}</dd></div>
        <div v-if="data.item.reason"><dt class="text-muted-foreground">Reason</dt><dd>{{ data.item.reason }}</dd></div>
      </dl>
      <Button v-if="data.item.relatedEntryId" as-child variant="outline" class="mt-5 h-11">
        <RouterLink :to="{ name: 'statement-entry', params: { engagementId: engagement, entryId: data.item.relatedEntryId } }">View related entry</RouterLink>
      </Button>
      <PaymentDialog v-if="data.context.viewerRole === 'founder' && data.item.kind === 'external_payment' && data.item.paymentId && !reversed"
        class="mt-5" :engagement-id="engagement" :payment-id="data.item.paymentId" @saved="reversed = true" />
      <p v-if="reversed" role="status" class="mt-5 text-sm">Reversal recorded. It now appears on the statement.</p>
    </CardContent>
  </Card>
</template>
