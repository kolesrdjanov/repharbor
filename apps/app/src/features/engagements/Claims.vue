<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import type { components } from '@repharbor/contracts';
import { decideClaim, listClaims, loadAll, registerClaim } from '@/api/engagements';
import { useMutation, useQuery } from '@/composables/query';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import QueryStatus from './QueryStatus.vue';

const props = defineProps<{
  context: { engagement: components['schemas']['Engagement']; viewerRole: 'founder' | 'rep' };
}>();
const id = props.context.engagement.id;
const { data, busy, error, reload } = useQuery((signal) => loadAll((cursor) => listClaims(id, cursor, signal)));
const { pending, message, submit } = useMutation();
const label = ref('');
const email = ref('');
const selected = ref<string>();
const reason = ref('');
const feedback = ref('');

async function register() {
  await submit(async () => {
    await registerClaim(id, { customerLabel: label.value, contactEmail: email.value || undefined });
    label.value = '';
    email.value = '';
    feedback.value = 'Claim registered.';
    await reload();
  });
}

async function showDecline(claimId: string) {
  selected.value = claimId;
  reason.value = '';
  await nextTick();
  document.getElementById(`reason-${claimId}`)?.focus();
}

async function cancelDecline(claimId: string) {
  selected.value = undefined;
  await nextTick();
  document.getElementById(`decline-${claimId}`)?.focus();
}

async function decide(claimId: string, decision: 'approved' | 'declined') {
  await submit(async () => {
    await decideClaim(id, claimId, decision === 'approved' ? { decision } : { decision, reason: reason.value });
    selected.value = undefined;
    feedback.value = decision === 'approved' ? 'Claim approved.' : 'Claim declined.';
    await reload();
    await nextTick();
    document.getElementById(`claim-${claimId}`)?.focus();
  });
}

onMounted(reload);
</script>

<template>
  <QueryStatus :busy="busy" :error="error" @retry="reload" />
  <p v-if="feedback" role="status" class="text-sm">{{ feedback }}</p>
  <Alert v-if="message"><AlertDescription>{{ message }}</AlertDescription></Alert>

  <Card v-if="context.viewerRole === 'rep' && context.engagement.status !== 'closed'">
    <CardHeader><h2 class="text-lg font-semibold">Register a customer</h2></CardHeader>
    <CardContent>
      <form class="space-y-4" @submit.prevent="register">
        <div class="space-y-2"><Label for="customer-name">Customer name</Label><Input id="customer-name" v-model="label" required class="h-11" /></div>
        <div class="space-y-2"><Label for="contact-email">Contact email (optional)</Label><Input id="contact-email" v-model="email" type="email" class="h-11" /></div>
        <Button type="submit" :disabled="pending" class="h-11">{{ pending ? 'Registering…' : 'Register claim' }}</Button>
      </form>
    </CardContent>
  </Card>

  <p v-if="data?.length === 0" class="text-sm text-muted-foreground">No customer claims yet.</p>
  <Card v-for="claim in data" :key="claim.id">
    <CardHeader>
      <h2 :id="`claim-${claim.id}`" tabindex="-1" class="break-words text-lg font-semibold focus:outline-none">{{ claim.customerLabel }}</h2>
      <p class="break-words text-sm text-muted-foreground">{{ claim.contactEmail }}</p>
    </CardHeader>
    <CardContent class="space-y-3">
      <p class="text-sm font-medium capitalize">{{ claim.status === "approved" ? "Approved" : claim.status === "declined" ? "Declined" : "Pending" }}</p>
      <p v-if="claim.reason" class="text-sm">{{ claim.reason }}</p>
      <p v-if="claim.competingClaimCount" class="text-sm">{{ claim.competingClaimCount }} other {{ claim.competingClaimCount === 1 ? 'claim' : 'claims' }} for this customer and product.</p>
      <div v-if="context.viewerRole === 'founder' && claim.status === 'pending'" class="flex flex-wrap gap-2">
        <Button class="h-11" :disabled="pending" @click="decide(claim.id, 'approved')">Approve</Button>
        <Button :id="`decline-${claim.id}`" variant="outline" class="h-11" :disabled="pending" @click="showDecline(claim.id)">Decline</Button>
      </div>
      <form v-if="selected === claim.id" class="space-y-3" @submit.prevent="decide(claim.id, 'declined')">
        <div class="space-y-2">
          <Label :for="`reason-${claim.id}`">Reason for declining</Label>
          <Textarea :id="`reason-${claim.id}`" v-model="reason" required maxlength="1000" />
        </div>
        <div class="flex flex-wrap gap-2">
          <Button type="submit" class="h-11" :disabled="pending">Confirm decline</Button>
          <Button type="button" variant="outline" class="h-11" :disabled="pending" @click="cancelDecline(claim.id)">Cancel</Button>
        </div>
      </form>
    </CardContent>
  </Card>
</template>
