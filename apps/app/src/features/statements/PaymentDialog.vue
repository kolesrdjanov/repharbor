<script setup lang="ts">
import { ref } from 'vue';
import { recordPayment, reversePayment } from '@/api/statements';
import { useMutation } from '@/composables/query';
import { Alert, AlertDescription } from '@repharbor/ui/components/ui/alert';
import { Button } from '@repharbor/ui/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@repharbor/ui/components/ui/dialog';
import { Input } from '@repharbor/ui/components/ui/input';
import { Label } from '@repharbor/ui/components/ui/label';
import { Textarea } from '@repharbor/ui/components/ui/textarea';
import { parseMoney } from './money';

const props = defineProps<{ engagementId: string; currency?: string; paymentId?: string }>();
const emit = defineEmits<{ saved: [] }>();
const open = ref(false);
const currency = ref(props.currency ?? 'EUR');
const amount = ref('');
const paidOn = ref('');
const reference = ref('');
const reason = ref('');
const { pending, message, submit } = useMutation();
let intent: { body: string; key: string } | undefined;

async function save() {
  await submit(async () => {
    const payload = {
      currency: currency.value, amountMinor: props.paymentId ? '' : parseMoney(amount.value, currency.value),
      paidOn: paidOn.value, reference: reference.value.trim() || undefined,
    };
    const fingerprint = JSON.stringify(props.paymentId ? reason.value.trim() : payload);
    if (intent?.body !== fingerprint) intent = { body: fingerprint, key: crypto.randomUUID() };
    if (props.paymentId) {
      await reversePayment(props.engagementId, props.paymentId, intent.key, { reason: reason.value.trim() });
    } else {
      await recordPayment(props.engagementId, intent.key, payload);
    }
    intent = undefined;
    amount.value = '';
    paidOn.value = '';
    reference.value = '';
    reason.value = '';
    open.value = false;
    emit('saved');
  });
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogTrigger as-child>
      <Button :variant="paymentId ? 'outline' : 'default'">{{ paymentId ? 'Reverse payment record' : 'Record external payment' }}</Button>
    </DialogTrigger>
    <DialogContent class="max-h-[90dvh] max-w-sm overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{{ paymentId ? 'Reverse payment record' : 'Record external payment' }}</DialogTitle>
        <DialogDescription>
          {{ paymentId ? 'The original record and the reversal will appear on the statement.' : 'Enter a payment already sent to the rep outside RepHarbor.' }}
        </DialogDescription>
      </DialogHeader>
      <form class="space-y-4" @submit.prevent="save">
        <div v-if="paymentId" class="space-y-2"><Label for="reverse-reason">Reason</Label><Textarea id="reverse-reason" v-model="reason" required maxlength="1000" /></div>
        <template v-else>
          <div class="grid grid-cols-[1fr_6rem] gap-3">
            <div class="space-y-2"><Label for="payment-amount">Amount</Label><Input id="payment-amount" v-model="amount" inputmode="decimal" required /></div>
            <div class="space-y-2"><Label for="payment-currency">Currency</Label><Input id="payment-currency" v-model="currency" pattern="[A-Z]{3}" maxlength="3" required /></div>
          </div>
          <div class="space-y-2"><Label for="payment-date">Date paid</Label><Input id="payment-date" v-model="paidOn" type="date" required /></div>
          <div class="space-y-2"><Label for="payment-reference">Reference (optional)</Label><Input id="payment-reference" v-model="reference" /></div>
        </template>
        <Alert v-if="message"><AlertDescription>{{ message }}</AlertDescription></Alert>
        <DialogFooter>
          <Button type="button" variant="outline" :disabled="pending" @click="open = false">Cancel</Button>
          <Button type="submit" :disabled="pending">{{ pending ? 'Saving…' : paymentId ? 'Reverse record' : 'Save payment' }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
