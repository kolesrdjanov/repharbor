<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { components } from '@repharbor/contracts';
import { getEngagement } from '@/api/engagements';
import { getStatement, openingBalances } from '@/api/statements';
import { useMutation, useQuery } from '@/composables/query';
import { Alert, AlertDescription } from '@repharbor/ui/components/ui/alert';
import { Button } from '@repharbor/ui/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@repharbor/ui/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repharbor/ui/components/ui/table';
import QueryStatus from '@/features/engagements/QueryStatus.vue';
import BalanceCards from './BalanceCards.vue';
import OpeningBalances from './OpeningBalances.vue';
import PaymentDialog from './PaymentDialog.vue';
import { entryNames } from './EntryLabels';
import { formatMoney } from './money';

const route = useRoute();
const id = String(route.params.engagementId);
const appended = ref<components['schemas']['StatementEntry'][]>([]);
const next = ref<string>();
const { data, busy, error, reload } = useQuery(async (signal) => {
  const [context, statement, openings] = await Promise.all([
    getEngagement(id, signal), getStatement(id, {}, signal), openingBalances(id, signal),
  ]);
  return { context, statement, openings };
});
const { pending, message, submit } = useMutation();
const notice = ref('');
const entries = computed(() => [...(data.value?.statement.entries.items ?? []), ...appended.value]);
const cursor = computed(() => appended.value.length ? next.value : data.value?.statement.entries.nextCursor);

async function refresh() {
  appended.value = [];
  next.value = undefined;
  await reload();
}

async function more() {
  const token = cursor.value;
  if (!token) return;
  await submit(async () => {
    const result = await getStatement(id, { cursor: token });
    if (cursor.value !== token) return;
    appended.value.push(...result.entries.items);
    next.value = result.entries.nextCursor;
  });
}

async function saved(text: string) {
  notice.value = text;
  await refresh();
}

onMounted(refresh);
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-3">
    <h1 tabindex="-1" class="text-3xl font-semibold tracking-tight focus:outline-none">Commission statement</h1>
    <PaymentDialog v-if="data?.context.viewerRole === 'founder'" :engagement-id="id"
      :currency="data.statement.balances[0]?.currency" @saved="saved('Payment recorded.')" />
  </div>
  <nav aria-label="Engagement" class="flex flex-wrap gap-1 border-b pb-2">
    <Button as-child variant="ghost"><RouterLink :to="{ name: 'terms', params: { engagementId: id } }">Terms</RouterLink></Button>
    <Button as-child variant="ghost"><RouterLink :to="{ name: 'claims', params: { engagementId: id } }">Claims</RouterLink></Button>
    <Button as-child variant="ghost"><RouterLink :to="{ name: 'statement', params: { engagementId: id } }">Statement</RouterLink></Button>
  </nav>
  <QueryStatus :busy="busy" :error="error" @retry="refresh" />
  <p v-if="notice" role="status" class="text-sm">{{ notice }}</p>
  <template v-if="data">
    <div class="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>As of {{ new Date(data.statement.asOf).toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }) }} UTC</span>
      <Button variant="outline" :disabled="busy || pending" @click="refresh">Refresh statement</Button>
    </div>
    <Alert v-if="data.statement.coverageIncomplete" role="status">
      <AlertDescription>Sales data may be incomplete. Recent or historical activity may still need reconciliation.</AlertDescription>
    </Alert>
    <BalanceCards v-if="data.statement.balances.length" :balances="data.statement.balances" />
    <p v-else class="text-sm text-muted-foreground">This engagement has no balance yet.</p>
    <Card>
      <CardHeader><CardTitle><h2 id="entries-heading">Statement entries</h2></CardTitle></CardHeader>
      <CardContent>
        <p v-if="!entries.length" class="text-sm text-muted-foreground">There are no statement entries yet.</p>
        <div v-else role="region" aria-labelledby="entries-heading" tabindex="0" class="max-w-full overflow-auto rounded focus-visible:outline-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Entry</TableHead>
                <TableHead scope="col" class="hidden sm:table-cell">Effective date</TableHead>
                <TableHead scope="col" class="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="row in entries" :key="row.id">
                <TableCell class="min-w-32 whitespace-normal">
                  <RouterLink :to="{ name: 'statement-entry', params: { engagementId: id, entryId: row.id } }"
                    class="inline-block rounded font-medium underline underline-offset-4 focus-visible:outline-2">
                    {{ entryNames[row.kind] }}
                  </RouterLink>
                  <p v-if="row.customerLabel" class="mt-1 break-words text-xs text-muted-foreground">{{ row.customerLabel }}</p>
                  <p v-else-if="row.kind === 'external_payment'" class="mt-1 text-xs text-muted-foreground">Recorded by founder</p>
                </TableCell>
                <TableCell class="hidden tabular-nums sm:table-cell">{{ row.paidOn ?? row.effectiveAt.slice(0, 10) }}</TableCell>
                <TableCell class="text-right font-medium tabular-nums">{{ formatMoney(row.deltaMinor, row.currency) }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <Alert v-if="message" class="mt-4"><AlertDescription>{{ message }}</AlertDescription></Alert>
        <Button v-if="cursor" variant="outline" class="mt-4" :disabled="pending || busy" @click="more">Load more entries</Button>
      </CardContent>
    </Card>
    <OpeningBalances :engagement-id="id" :founder="data.context.viewerRole === 'founder'" :items="data.openings"
      @saved="saved('Opening balance updated.')" />
  </template>
</template>
