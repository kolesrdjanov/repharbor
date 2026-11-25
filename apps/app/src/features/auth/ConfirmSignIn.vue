<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { safeReturnPath } from '@repharbor/contracts';
import { exchangeMagicLink } from '@/api/auth';
import { RequestError, errorMessage } from '@/api/client';
import { Alert, AlertDescription } from '@repharbor/ui/components/ui/alert';
import { Button } from '@repharbor/ui/components/ui/button';
import { useSession } from '@/stores/session';
import AuthLayout from './AuthLayout.vue';
import { requestedAddress, takeConfirmationToken } from './handoff';

const router = useRouter();
const session = useSession();
const token = ref(takeConfirmationToken());
const pending = ref(false);
const error = ref('');

async function confirm() {
  if (!token.value || pending.value) return;
  pending.value = true;
  error.value = '';
  try {
    const identity = await exchangeMagicLink({ token: token.value });
    token.value = undefined;
    requestedAddress.value = '';
    session.setSession(identity);
    await router.replace(identity.pendingInvitationId ? '/invite' : safeReturnPath(identity.returnPath) ?? '/portfolio');
  } catch (failure) {
    error.value = errorMessage(failure);
    if (failure instanceof RequestError && failure.status === 410) token.value = undefined;
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <AuthLayout>
    <h1 tabindex="-1" class="text-3xl font-semibold tracking-tight focus:outline-none">
      {{ token ? 'Confirm sign-in' : 'Sign-in link unavailable' }}
    </h1>
    <p class="mt-3 text-sm leading-6 text-muted-foreground">
      {{ token ? 'Confirm to sign in on this device.' : 'Request a new email link to continue.' }}
    </p>
    <Alert v-if="error" class="mt-5"><AlertDescription>{{ error }}</AlertDescription></Alert>
    <Button v-if="token" class="mt-6 w-full" :disabled="pending" @click="confirm">
      {{ pending ? 'Signing in…' : 'Confirm sign-in' }}
    </Button>
    <Button v-else as-child class="mt-6">
      <RouterLink :to="{ name: 'sign-in' }">Request a new link</RouterLink>
    </Button>
    <p class="sr-only" role="status">{{ pending ? 'Signing in.' : '' }}</p>
  </AuthLayout>
</template>
