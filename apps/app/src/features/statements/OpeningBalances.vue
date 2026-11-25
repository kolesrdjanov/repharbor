<script setup lang="ts">
import { ref } from 'vue';
import type { components } from '@repharbor/contracts';
import { acceptOpening, proposeOpening } from '@/api/statements';
import { useMutation } from '@/composables/query';
import { Alert, AlertDescription } from '@repharbor/ui/components/ui/alert';
import { Button } from '@repharbor/ui/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@repharbor/ui/components/ui/card';
import { Input } from '@repharbor/ui/components/ui/input';
import { Label } from '@repharbor/ui/components/ui/label';
import { formatMoney, parseMoney } from './money';

const props = defineProps<{ engagementId: string; founder: boolean; items: components['schemas']['OpeningBalance'][] }>();
const emit = defineEmits<{ saved: [] }>();
const { pending, message, submit } = useMutation();
const show = ref(false);
const amount = ref('');
const currency = ref('EUR');
const date = ref('');
const note = ref('');
let intent: { body: string; key: string } | undefined;

function save() {
  return submit(async () => {
    const body = { currency: currency.value, amountMinor: parseMoney(amount.value, currency.value, true), asOf: date.value, note: note.value };
    const fingerprint = JSON.stringify(body);
    if (intent?.body !== fingerprint) intent = { body: fingerprint, key: crypto.randomUUID() };
    await proposeOpening(props.engagementId, intent.key, body);
    intent = undefined;
    show.value = false;
    emit('saved');
  });
}

function accept(id: string) {
  return submit(async () => {
    await acceptOpening(props.engagementId, id, crypto.randomUUID());
    emit('saved');
  });
}
</script>

<template>
  <Card>
    <CardHeader><CardTitle><h2>Opening balances</h2></CardTitle></CardHeader>
    <CardContent class="space-y-3">
      <p v-if="!items.length" class="text-sm text-muted-foreground">No opening balance has been agreed. Earlier history may be incomplete.</p>
      <ul v-else class="divide-y">
        <li v-for="item in items" :key="item.id" class="space-y-2 py-3 first:pt-0">
          <p class="text-sm font-medium tabular-nums">{{ formatMoney(item.amountMinor, item.currency) }} on {{ item.asOf }}</p>
          <p class="text-sm">{{ item.note }}</p>
          <p class="text-xs text-muted-foreground">{{ item.acceptedAt ? 'Accepted by both parties' : 'Awaiting rep confirmation' }}</p>
          <Button v-if="!founder && !item.acceptedAt" variant="outline" :disabled="pending" @click="accept(item.id)">Accept opening balance</Button>
        </li>
      </ul>
      <Button v-if="founder && !show" variant="outline" @click="show = true">Propose an opening balance</Button>
      <form v-if="show" class="grid max-w-lg gap-4 pt-2 sm:grid-cols-2" @submit.prevent="save">
        <div class="space-y-2"><Label for="opening-amount">Amount</Label><Input id="opening-amount" v-model="amount" inputmode="decimal" required /></div>
        <div class="space-y-2"><Label for="opening-currency">Currency</Label><Input id="opening-currency" v-model="currency" pattern="[A-Z]{3}" required /></div>
        <div class="space-y-2"><Label for="opening-date">As of</Label><Input id="opening-date" v-model="date" type="date" required /></div>
        <div class="space-y-2 sm:col-span-2"><Label for="opening-note">Supporting note</Label><Input id="opening-note" v-model="note" required /></div>
        <Button class="justify-self-start" type="submit" :disabled="pending">Send for confirmation</Button>
      </form>
      <Alert v-if="message"><AlertDescription>{{ message }}</AlertDescription></Alert>
    </CardContent>
  </Card>
</template>
