<script setup lang="ts">
import { ref } from 'vue';
import type { components } from '@repharbor/contracts';
import { resolveReview } from '@/api/integrations';
import { useMutation } from '@/composables/query';
import { Alert, AlertDescription } from '@repharbor/ui/components/ui/alert';
import { Button } from '@repharbor/ui/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@repharbor/ui/components/ui/dialog';
import { Label } from '@repharbor/ui/components/ui/label';
import { Textarea } from '@repharbor/ui/components/ui/textarea';
import { NativeSelect, NativeSelectOption } from '@repharbor/ui/components/ui/native-select';

const props = defineProps<{ companyId: string; item: components['schemas']['ReviewItem'] }>();
const emit = defineEmits<{ saved: [item: components['schemas']['ReviewItem']] }>();
const open = ref(false);
const choice = ref('');
const reason = ref('');
const { message, pending, submit } = useMutation();
let intent: { body: string; key: string } | undefined;

async function resolve() {
  await submit(async () => {
    const input = choice.value === 'ineligible'
      ? { action: 'mark_ineligible' as const, reason: reason.value }
      : { action: 'assign_claim' as const, claimId: choice.value, reason: reason.value };
    const fingerprint = JSON.stringify(input);
    if (intent?.body !== fingerprint) intent = { body: fingerprint, key: crypto.randomUUID() };
    const result = await resolveReview(props.companyId, props.item.id, input, intent.key);
    intent = undefined;
    open.value = false;
    emit('saved', result);
  });
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogTrigger as-child><Button variant="outline">Review sale</Button></DialogTrigger>
    <DialogContent class="max-h-[90dvh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Resolve this sale</DialogTitle>
        <DialogDescription>
          Confirm the customer claim that corresponds to {{ item.customerLabel }}, or mark the sale ineligible.
        </DialogDescription>
      </DialogHeader>
      <form class="space-y-4" @submit.prevent="resolve">
        <div class="space-y-2">
          <Label for="review-decision">Decision</Label>
          <NativeSelect id="review-decision" v-model="choice" required>
            <NativeSelectOption value="" disabled>Choose a decision</NativeSelectOption>
            <NativeSelectOption v-for="candidate in item.candidateClaims" :key="candidate.id" :value="candidate.id">Assign to {{ candidate.customerLabel }}</NativeSelectOption>
            <NativeSelectOption value="ineligible">Mark ineligible</NativeSelectOption>
          </NativeSelect>
        </div>
        <div class="space-y-2"><Label for="review-reason">Reason</Label><Textarea id="review-reason" v-model="reason" maxlength="1000" required /></div>
        <Alert v-if="message"><AlertDescription>{{ message }}</AlertDescription></Alert>
        <DialogFooter><Button type="submit" :disabled="pending">{{ pending ? 'Saving…' : 'Confirm decision' }}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
