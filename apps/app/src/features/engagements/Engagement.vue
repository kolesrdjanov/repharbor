<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { acceptAgreement, closeEngagement, getEngagement, listAgreements, loadAll, proposeAgreement } from '@/api/engagements';
import { RequestError } from '@/api/client';
import { useMutation, useQuery } from '@/composables/query';
import { Alert, AlertDescription } from '@repharbor/ui/components/ui/alert';
import { Button } from '@repharbor/ui/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@repharbor/ui/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@repharbor/ui/components/ui/alert-dialog';
import { useSession } from '@/stores/session';
import Claims from './Claims.vue';
import QueryStatus from './QueryStatus.vue';
import TermsFields from './TermsFields.vue';
import TermsSummary from './TermsSummary.vue';
import { useTermsForm } from './terms-form';

const route = useRoute();
const session = useSession();
const id = String(route.params.engagementId);
const { data, busy, error, reload } = useQuery(async (signal) => {
  const context = await getEngagement(id, signal);
  const agreements = route.name === 'terms'
    ? (await loadAll((cursor) => listAgreements(id, cursor, signal))).sort((a, b) => b.revision - a.revision)
    : [];
  return { ...context, agreements };
});
const { pending, message, failure, submit } = useMutation();
const { rate, mode, months, dueDay, effective, input } = useTermsForm();
const feedback = ref('');
const latest = computed(() => data.value?.agreements[0]);
const accepted = computed(() => data.value?.agreements.find((item) => item.repAcceptedAt));
const canEdit = computed(() => data.value?.viewerRole === 'founder' && data.value.engagement.status !== 'closed');
const timeZone = computed(() => session.identity?.companies.find((company) => company.id === data.value?.engagement.companyId)?.timeZone ?? 'UTC');

async function propose() {
  await submit(async () => {
    const proposal = await proposeAgreement(id, { previousRevision: latest.value?.revision ?? 0, terms: input(timeZone.value) });
    feedback.value = `Revision ${proposal.revision} proposed.`;
    await reload();
  });
}

async function accept() {
  const proposal = latest.value;
  if (!proposal) return;
  await submit(async () => {
    await acceptAgreement(id, proposal.id, { revision: proposal.revision });
    feedback.value = `Revision ${proposal.revision} accepted.`;
    await reload();
  });
}

async function close() {
  await submit(async () => {
    await closeEngagement(id);
    feedback.value = 'Engagement closed.';
    await reload();
  });
}

onMounted(reload);
</script>

<template>
  <h1 tabindex="-1" class="text-3xl font-semibold tracking-tight focus:outline-none">{{ route.name === 'claims' ? 'Customer claims' : 'Agreement terms' }}</h1>
  <nav aria-label="Engagement" class="flex flex-wrap gap-2 border-b pb-3">
    <Button as-child variant="ghost"><RouterLink :to="{ name: 'terms', params: { engagementId: id } }">Terms</RouterLink></Button>
    <Button as-child variant="ghost"><RouterLink :to="{ name: 'claims', params: { engagementId: id } }">Claims</RouterLink></Button>
    <Button as-child variant="ghost"><RouterLink :to="{ name: 'statement', params: { engagementId: id } }">Statement</RouterLink></Button>
  </nav>
  <QueryStatus :busy="busy" :error="error" @retry="reload" />
  <template v-if="data">
    <Claims v-if="route.name === 'claims'" :context="data" />
    <template v-else>
      <p v-if="feedback" role="status" class="text-sm">{{ feedback }}</p>
      <Alert v-if="message"><AlertDescription class="space-y-3">
        <p>{{ message }}</p>
        <Button v-if="failure instanceof RequestError && failure.code === 'STALE_REVISION'" variant="outline" @click="reload">Refresh terms</Button>
      </AlertDescription></Alert>
      <p v-if="!latest" class="text-sm text-muted-foreground">{{ canEdit ? 'Propose terms for the sales rep to review.' : 'The founder can propose terms for your review.' }}</p>
      <p v-else-if="accepted && latest.id !== accepted.id" class="text-sm">Revision {{ accepted.revision }} is accepted. Revision {{ latest.revision }} is awaiting acceptance.</p>
      <Card v-for="version in data.agreements" :key="version.id">
        <CardHeader><CardTitle><h2>Revision {{ version.revision }}{{ version.repAcceptedAt ? ' · Accepted' : ' · Proposed' }}</h2></CardTitle></CardHeader>
        <CardContent class="space-y-5">
          <TermsSummary :terms="version" />
          <Button v-if="data.viewerRole === 'rep' && data.engagement.status === 'active' && version.id === latest?.id && !version.repAcceptedAt"
            :disabled="pending" @click="accept">Accept revision {{ version.revision }}</Button>
        </CardContent>
      </Card>
      <Card v-if="canEdit">
        <CardHeader><CardTitle><h2>{{ latest ? 'Propose an amendment' : 'Propose terms' }}</h2></CardTitle></CardHeader>
        <CardContent>
          <form class="space-y-4" @submit.prevent="propose">
            <TermsFields v-model:rate="rate" v-model:mode="mode" v-model:months="months" v-model:due-day="dueDay"
              v-model:effective="effective" prefix="proposal-terms" />
            <Button type="submit" :disabled="pending">Propose terms</Button>
          </form>
        </CardContent>
      </Card>
      <AlertDialog v-if="canEdit">
        <AlertDialogTrigger as-child><Button variant="outline" :disabled="pending">Close engagement</Button></AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close this engagement?</AlertDialogTitle>
            <AlertDialogDescription>Closing stops new customer claims. Both participants retain access to terms and claim history.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep open</AlertDialogCancel>
            <AlertDialogAction @click="close">Close engagement</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </template>
  </template>
</template>
