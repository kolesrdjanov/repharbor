<script setup lang="ts">
import { ref, watch } from 'vue';
import type { components } from '@repharbor/contracts';
import { coverage, disconnect, mappings, requestImport, saveMappings } from '@/api/integrations';
import { loadAll } from '@/api/engagements';
import { API_ORIGIN } from '@/config';
import { useMutation, useQuery } from '@/composables/query';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import QueryStatus from '@/features/engagements/QueryStatus.vue';
import SourceDialog from './SourceDialog.vue';

const props = defineProps<{ companyId: string; source: components['schemas']['Connection']; products: components['schemas']['Product'][] }>();
const emit = defineEmits<{ changed: [] }>();
const { pending, message, submit } = useMutation();
const open = ref(false);
const action = ref('');
const rows = ref<components['schemas']['ProductMapping'][]>([]);
const from = ref('');
const to = ref('');
let importIntent: { body: string; key: string } | undefined;
const { data, busy, error, reload } = useQuery(async (signal) => {
  const [current, gaps] = await Promise.all([
    loadAll((cursor) => mappings(props.companyId, props.source.id, cursor, signal)),
    loadAll((cursor) => coverage(props.companyId, props.source.id, cursor, signal)),
  ]);
  rows.value = current;
  return gaps;
});
watch(open, (value) => { if (value) void reload(); });

async function save() {
  await submit(async () => {
    const result = await saveMappings(props.companyId, props.source.id, { items: rows.value });
    rows.value = result.items;
    action.value = 'Product mappings saved.';
  });
}

async function stop() {
  await submit(async () => {
    await disconnect(props.companyId, props.source.id);
    action.value = 'Source disconnected.';
    emit('changed');
  });
}

async function backfill() {
  await submit(async () => {
    const input = { start: `${from.value}T00:00:00Z`, end: `${to.value}T00:00:00Z` };
    const fingerprint = JSON.stringify(input);
    if (importIntent?.body !== fingerprint) importIntent = { body: fingerprint, key: crypto.randomUUID() };
    await requestImport(props.companyId, props.source.id, input, importIntent.key);
    importIntent = undefined;
    action.value = 'History request queued.';
    emit('changed');
  });
}

function showTime(value?: string) {
  return value ? new Date(value).toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }) + ' UTC' : 'Unavailable';
}
</script>

<template>
  <Card>
    <CardHeader class="gap-3">
      <h2 class="text-lg font-semibold capitalize">{{ source.provider }} · {{ source.environment }}</h2>
      <p class="text-sm capitalize text-muted-foreground">{{ source.status }} · {{ source.externalAccount }}</p>
    </CardHeader>
    <CardContent class="space-y-5">
      <dl class="grid gap-3 text-sm sm:grid-cols-3">
        <div><dt class="font-medium">Coverage from</dt><dd>{{ showTime(source.coverageFrom) }}</dd></div>
        <div><dt class="font-medium">Last delivery</dt><dd>{{ showTime(source.lastDeliveryAt) }}</dd></div>
        <div><dt class="font-medium">Last reconciliation</dt><dd>{{ showTime(source.reconciledAt) }}</dd></div>
      </dl>
      <div class="space-y-2">
        <p class="text-sm font-medium">Webhook endpoint</p>
        <code class="block select-all break-all rounded bg-muted p-3 text-xs">{{ API_ORIGIN }}/v1/webhooks/{{ source.provider }}/{{ source.id }}</code>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" class="h-11" @click="open = !open">{{ open ? 'Hide details' : 'Manage mappings and history' }}</Button>
        <SourceDialog :company-id="companyId" :source="source" @saved="$emit('changed')" />
        <Button v-if="source.status !== 'disconnected'" variant="ghost" class="h-11" :disabled="pending" @click="stop">Disconnect</Button>
      </div>
      <Alert v-if="message"><AlertDescription>{{ message }}</AlertDescription></Alert>
      <p v-if="action" role="status" class="text-sm">{{ action }}</p>

      <div v-if="open" class="space-y-5 border-t pt-5">
        <QueryStatus :busy="busy" :error="error" @retry="reload" />
        <template v-if="data">
          <form class="space-y-4" @submit.prevent="save">
            <h3 class="font-semibold">Product mappings</h3>
            <p v-if="!rows.length" class="text-sm text-muted-foreground">No product mappings yet.</p>
            <fieldset v-for="(row,index) in rows" :key="index" class="grid gap-3 rounded border p-3 sm:grid-cols-2">
              <div class="space-y-2"><Label :for="`${source.id}-external-${index}`">Provider product ID</Label><Input :id="`${source.id}-external-${index}`" v-model="row.externalProduct" required class="h-11" /></div>
              <div class="space-y-2">
                <Label :for="`${source.id}-internal-${index}`">RepHarbor product</Label>
                <NativeSelect :id="`${source.id}-internal-${index}`" v-model="row.productId" required class="h-11">
                  <NativeSelectOption value="" disabled>Choose product</NativeSelectOption>
                  <NativeSelectOption v-for="product in products" :key="product.id" :value="product.id">{{ product.name }}</NativeSelectOption>
                </NativeSelect>
              </div>
              <div class="space-y-2"><Label :for="`${source.id}-channel-${index}`">Sales channel</Label><Input :id="`${source.id}-channel-${index}`" v-model="row.channel" required class="h-11" /></div>
              <div class="space-y-2">
                <Label :for="`${source.id}-authority-${index}`">Source authority</Label>
                <NativeSelect :id="`${source.id}-authority-${index}`" :model-value="row.authoritative ? 'primary' : 'secondary'"
                  class="h-11" @update:model-value="row.authoritative = $event === 'primary'">
                  <NativeSelectOption value="primary">Authoritative</NativeSelectOption>
                  <NativeSelectOption value="secondary">Secondary</NativeSelectOption>
                </NativeSelect>
              </div>
              <Button type="button" variant="ghost" class="h-11 justify-self-start" @click="rows.splice(index, 1)">Remove mapping</Button>
            </fieldset>
            <div class="flex flex-wrap gap-2">
              <Button type="button" variant="outline" class="h-11" @click="rows.push({ productId: '', externalProduct: '', channel: 'web', authoritative: true })">Add mapping</Button>
              <Button type="submit" class="h-11" :disabled="pending || source.status === 'disconnected'">Save mappings</Button>
            </div>
          </form>
          <form class="space-y-4 border-t pt-5" @submit.prevent="backfill">
            <h3 class="font-semibold">Import history</h3>
            <div v-if="data.length" class="space-y-2">
              <p v-for="gap in data" :key="gap.id" class="text-sm text-muted-foreground">
                Coverage gap from {{ showTime(gap.startsAt) }} to {{ showTime(gap.endsAt) }} · {{ gap.reason.replaceAll('_', ' ').toLowerCase() }}
              </p>
            </div>
            <div class="flex flex-wrap gap-3">
              <div class="space-y-2"><Label :for="`${source.id}-from`">Start (UTC)</Label><Input :id="`${source.id}-from`" v-model="from" type="date" required class="h-11" /></div>
              <div class="space-y-2"><Label :for="`${source.id}-to`">End (exclusive, UTC)</Label><Input :id="`${source.id}-to`" v-model="to" type="date" required class="h-11" /></div>
            </div>
            <Button type="submit" variant="outline" class="h-11" :disabled="pending || source.status === 'disconnected'">Queue import</Button>
          </form>
        </template>
      </div>
    </CardContent>
  </Card>
</template>
