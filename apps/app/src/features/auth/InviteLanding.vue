<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { acceptInvitation, listProducts, loadAll, previewInvitation } from '@/api/engagements';
import { getSession } from '@/api/auth';
import { useMutation, useQuery } from '@/composables/query';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useSession } from '@/stores/session';
import QueryStatus from '@/features/engagements/QueryStatus.vue';
import TermsSummary from '@/features/engagements/TermsSummary.vue';
import AuthLayout from './AuthLayout.vue';
import { invitationToken } from './handoff';

const session = useSession();
const router = useRouter();
const reference = computed(() => invitationToken.value
  ? { token: invitationToken.value }
  : session.identity?.pendingInvitationId ? { invitationId: session.identity.pendingInvitationId } : undefined);
const companies = computed(() => session.identity?.companies ?? []);
const companyId = ref('');
const productId = ref('');
const founderInvite = computed(() => data.value?.invitation.direction === 'invite_founder');

const { data, busy, error, reload } = useQuery(async () => {
  if (reference.value && session.identity) return previewInvitation(reference.value);
});
const products = useQuery((signal) => companyId.value
  ? loadAll((cursor) => listProducts(companyId.value, cursor, signal))
  : Promise.resolve([]));
const { pending, message, submit } = useMutation();
onMounted(reload);
watch(companyId, () => { productId.value = ''; void products.reload(); });

async function join() {
  const currentReference = reference.value;
  if (!currentReference) return;
  await submit(async () => {
    const engagement = await acceptInvitation({
      ...currentReference, ...(founderInvite.value && { companyId: companyId.value, productId: productId.value }),
    });
    invitationToken.value = undefined;
    if (session.identity) session.setSession({ ...session.identity, pendingInvitationId: undefined });
    await router.replace({ name: 'terms', params: { engagementId: engagement.id } });
  });
}

async function switchAccount() {
  await submit(async () => {
    await session.logout();
    await router.push({ name: 'sign-in' });
  });
}

async function retrySession() {
  await submit(async () => {
    session.setSession(await getSession());
    await reload();
  });
}
</script>

<template>
  <AuthLayout>
    <h1 tabindex="-1" class="text-3xl font-semibold tracking-tight focus:outline-none">Invitation</h1>
    <QueryStatus class="mt-4" :busy="busy" :error="error" @retry="reload" />
    <p v-if="message" role="alert" class="mt-4 text-sm">{{ message }}</p>

    <template v-if="session.error">
      <p class="mt-4 text-sm">{{ session.error }}</p>
      <Button variant="outline" class="mt-3 h-11" @click="retrySession">Retry session check</Button>
    </template>
    <template v-else-if="!session.identity">
      <p class="mt-3 text-sm text-muted-foreground">Sign in with the email address that received the invitation.</p>
      <Button as-child class="mt-6 h-11">
        <RouterLink :to="{ name: 'sign-in' }">Sign in</RouterLink>
      </Button>
    </template>
    <template v-else-if="data">
      <p v-if="data.companyName" class="mt-3 text-sm text-muted-foreground">{{ data.companyName }} · {{ data.productName }}</p>
      <p v-else class="mt-3 text-sm text-muted-foreground">Choose the company and product you’d like to work with this sales rep on.</p>
      <div v-if="data.terms" class="mt-6 rounded-lg border bg-card p-5"><TermsSummary :terms="data.terms" /></div>
      <template v-if="data.invitation.status === 'accepted' && data.invitation.engagementId">
        <p class="mt-6 text-sm">You’ve already accepted this invitation.</p>
        <Button as-child class="mt-4 h-11">
          <RouterLink :to="{ name: 'terms', params: { engagementId: data.invitation.engagementId } }">View engagement</RouterLink>
        </Button>
      </template>
      <template v-else-if="founderInvite && !companies.length">
        <Button as-child class="mt-6 h-11">
          <RouterLink :to="{ name: 'onboarding', query: { from: 'invite' } }">Create a company</RouterLink>
        </Button>
      </template>
      <form v-else class="mt-6 space-y-4" @submit.prevent="join">
        <template v-if="founderInvite">
          <div class="space-y-2">
            <Label for="invite-company">Company</Label>
            <NativeSelect id="invite-company" v-model="companyId" class="h-11" required>
              <NativeSelectOption value="" disabled>Choose a company</NativeSelectOption>
              <NativeSelectOption v-for="item in companies" :key="item.id" :value="item.id">{{ item.name }}</NativeSelectOption>
            </NativeSelect>
          </div>
          <QueryStatus :busy="products.busy.value" :error="products.error.value" @retry="products.reload" />
          <div v-if="products.data.value?.length" class="space-y-2">
            <Label for="accept-product">Product</Label>
            <NativeSelect id="accept-product" v-model="productId" class="h-11" required>
              <NativeSelectOption value="" disabled>Choose a product</NativeSelectOption>
              <NativeSelectOption v-for="item in products.data.value" :key="item.id" :value="item.id">{{ item.name }}</NativeSelectOption>
            </NativeSelect>
          </div>
          <Button v-if="companyId && products.data.value?.length === 0 && !products.busy.value" as-child variant="outline">
            <RouterLink :to="{ name: 'company', params: { companyId } }">Add a product first</RouterLink>
          </Button>
        </template>
        <p v-else class="text-sm text-muted-foreground">Joining opens the engagement. You can accept the proposed terms in a separate step.</p>
        <Button type="submit" class="h-11" :disabled="pending || (founderInvite && !productId)">
          {{ pending ? 'Joining…' : 'Accept invitation' }}
        </Button>
      </form>
    </template>
    <template v-else-if="!busy">
      <Alert v-if="!error" class="mt-4"><AlertDescription>Reopen your invitation email to continue.</AlertDescription></Alert>
      <Button v-if="error" variant="outline" class="mt-4 h-11" :disabled="pending" @click="switchAccount">Sign in with another account</Button>
    </template>
  </AuthLayout>
</template>
