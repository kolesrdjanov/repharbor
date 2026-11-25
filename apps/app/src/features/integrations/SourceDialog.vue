<script setup lang="ts">
import { ref } from 'vue';
import type { components } from '@repharbor/contracts';
import { connect, reconnect } from '@/api/integrations';
import { useMutation } from '@/composables/query';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

const props = defineProps<{ companyId: string; source?: components['schemas']['Connection'] }>();
const emit = defineEmits<{ saved: [] }>();
const open = ref(false);
const provider = ref<components['schemas']['Connection']['provider']>(props.source?.provider ?? 'stripe');
const providerDetails = {
  stripe: { name: 'Stripe', label: 'Stripe account ID', hint: 'acct_…' },
  dodo: { name: 'Dodo Payments', label: 'Dodo business ID', hint: 'bus_…' },
  whop: { name: 'Whop', label: 'Whop account ID', hint: 'biz_…' },
  revenuecat: { name: 'RevenueCat', label: 'RevenueCat project ID/app ID', hint: 'proj_…/app_…' },
};
const environment = ref<'test' | 'live'>(props.source?.environment ?? 'test');
const account = ref('');
const apiKey = ref('');
const webhookSecret = ref('');
const authorizationToken = ref('');
const { message, pending, submit } = useMutation();

function clearSecrets() {
  apiKey.value = '';
  webhookSecret.value = '';
  authorizationToken.value = '';
}

async function save() {
  await submit(async () => {
    const credentials = {
      apiKey: apiKey.value.trim() || undefined,
      webhookSecret: provider.value !== 'revenuecat' ? webhookSecret.value.trim() || undefined : undefined,
      authorizationToken: provider.value === 'revenuecat' ? authorizationToken.value.trim() || undefined : undefined,
    };
    clearSecrets();
    if (props.source) await reconnect(props.companyId, props.source.id, { credentials });
    else await connect(props.companyId, { provider: provider.value, environment: environment.value, externalAccount: account.value.trim(), credentials });
    open.value = false;
    emit('saved');
  });
}
</script>

<template>
  <Dialog v-model:open="open" @update:open="(value) => { if (!value) clearSecrets() }">
    <DialogTrigger as-child><Button :variant="source ? 'outline' : 'default'" class="h-11">{{ source ? 'Reconnect' : 'Connect provider' }}</Button></DialogTrigger>
    <DialogContent class="max-h-[90dvh] overflow-y-auto sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ source ? 'Reconnect source' : 'Connect revenue source' }}</DialogTitle>
        <DialogDescription>Use credentials for the revenue account that collects payments for this product.</DialogDescription>
      </DialogHeader>
      <form class="space-y-4" @submit.prevent="save">
        <template v-if="!source">
          <div class="space-y-2">
            <Label for="source-provider">Provider</Label>
            <NativeSelect id="source-provider" v-model="provider" class="h-11" @update:model-value="clearSecrets">
              <NativeSelectOption v-for="(details, key) in providerDetails" :key="key" :value="key">{{ details.name }}</NativeSelectOption>
            </NativeSelect>
          </div>
          <div class="space-y-2">
            <Label for="source-account">{{ providerDetails[provider].label }}</Label>
            <Input id="source-account" v-model="account" required class="h-11" :placeholder="providerDetails[provider].hint" />
          </div>
          <div class="space-y-2">
            <Label for="source-mode">Environment</Label>
            <NativeSelect id="source-mode" v-model="environment" class="h-11">
              <NativeSelectOption value="test">Test</NativeSelectOption><NativeSelectOption value="live">Live</NativeSelectOption>
            </NativeSelect>
          </div>
        </template>
        <div class="space-y-2"><Label for="source-api-key">{{ providerDetails[provider].name }} API key</Label><Input id="source-api-key" v-model="apiKey" type="password" autocomplete="off" class="h-11" /></div>
        <div v-if="provider === 'revenuecat'" class="space-y-2">
          <Label for="source-auth-header">Webhook authorization header</Label>
          <Input id="source-auth-header" v-model="authorizationToken" type="password" autocomplete="off" required class="h-11" />
        </div>
        <div v-else class="space-y-2"><Label for="source-webhook-secret">Webhook signing secret</Label><Input id="source-webhook-secret" v-model="webhookSecret" type="password" autocomplete="off" required class="h-11" /></div>
        <Alert v-if="message"><AlertDescription>{{ message }}</AlertDescription></Alert>
        <DialogFooter><Button type="submit" class="h-11" :disabled="pending">{{ pending ? 'Connecting…' : 'Save connection' }}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
