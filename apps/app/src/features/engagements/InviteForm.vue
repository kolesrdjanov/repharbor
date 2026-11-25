<script setup lang="ts">
import { ref } from 'vue';
import type { components } from '@repharbor/contracts';
import { inviteFounder, inviteRep, revokeInvitation } from '@/api/engagements';
import { useMutation } from '@/composables/query';
import { Alert, AlertDescription } from '@repharbor/ui/components/ui/alert';
import { Button } from '@repharbor/ui/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@repharbor/ui/components/ui/card';
import { Input } from '@repharbor/ui/components/ui/input';
import { Label } from '@repharbor/ui/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@repharbor/ui/components/ui/native-select';
import TermsFields from './TermsFields.vue';
import { useTermsForm } from './terms-form';

const props = defineProps<{ company?: components['schemas']['Company']; products?: components['schemas']['Product'][] }>();
const emit = defineEmits<{ sent: [] }>();
const email = ref('');
const productId = ref('');
const { rate, mode, months, dueDay, effective, input } = useTermsForm();
const { pending, message, submit } = useMutation();
const sent = ref<components['schemas']['Invitation']>();
const feedback = ref('');
let intent: { fingerprint: string; key: string } | undefined;

async function send() {
  await submit(async () => {
    const recipient = { email: email.value };
    const proposed = props.company ? { ...recipient, productId: productId.value, terms: input(props.company.timeZone) } : undefined;
    const fingerprint = JSON.stringify(proposed ?? recipient);
    if (intent?.fingerprint !== fingerprint) intent = { fingerprint, key: crypto.randomUUID() };
    sent.value = props.company && proposed
      ? await inviteRep(props.company.id, proposed, intent.key)
      : await inviteFounder(recipient, intent.key);
    intent = undefined;
    feedback.value = `Invitation queued for ${email.value}.`;
    email.value = '';
    emit('sent');
  });
}

async function revoke() {
  if (!sent.value) return;
  const invitationId = sent.value.id;
  await submit(async () => {
    await revokeInvitation(invitationId);
    sent.value = undefined;
    feedback.value = 'Invitation revoked.';
    emit('sent');
  });
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle><h2>{{ company ? 'Invite a sales rep' : 'Invite a founder' }}</h2></CardTitle>
    </CardHeader>
    <CardContent>
      <form class="space-y-5" @submit.prevent="send">
        <div class="space-y-2">
          <Label for="invite-email">Recipient email</Label>
          <Input id="invite-email" v-model="email" type="email" autocomplete="email" required />
        </div>
        <template v-if="company">
          <div class="space-y-2">
            <Label for="invite-product">Product</Label>
            <NativeSelect id="invite-product" v-model="productId" required>
              <NativeSelectOption value="" disabled>Select a product</NativeSelectOption>
              <NativeSelectOption v-for="item in products" :key="item.id" :value="item.id">{{ item.name }}</NativeSelectOption>
            </NativeSelect>
          </div>
          <TermsFields v-model:rate="rate" v-model:mode="mode" v-model:months="months" v-model:due-day="dueDay"
            v-model:effective="effective" prefix="invite-terms" />
        </template>
        <Alert v-if="message"><AlertDescription>{{ message }}</AlertDescription></Alert>
        <Button type="submit" :disabled="pending">{{ pending ? 'Working…' : 'Send invitation' }}</Button>
      </form>
      <p v-if="feedback" role="status" class="mt-4 text-sm">{{ feedback }}</p>
      <Button v-if="sent" variant="outline" class="mt-3" :disabled="pending" @click="revoke">Revoke invitation</Button>
    </CardContent>
  </Card>
</template>
