<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { safeReturnPath } from '@repharbor/contracts';
import { requestMagicLink } from '@/api/auth';
import { errorMessage, RequestError } from '@/api/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AuthLayout from './AuthLayout.vue';
import { invitationToken, requestedAddress } from './handoff';

const route = useRoute();
const router = useRouter();
const email = ref(requestedAddress.value);
const pending = ref(false);
const error = ref('');
const invalid = ref(false);

async function submit() {
  if (pending.value) return;
  pending.value = true;
  error.value = '';
  invalid.value = false;
  try {
    await requestMagicLink({
      email: email.value,
      returnPath: safeReturnPath(typeof route.query.next === 'string' ? route.query.next : undefined),
      invitationToken: invitationToken.value,
    });
    requestedAddress.value = email.value.trim().toLowerCase();
    await router.push({ name: 'check-email', query: route.query });
  } catch (failure) {
    const field = failure instanceof RequestError ? failure.fieldErrors?.email?.[0] : undefined;
    error.value = field ?? errorMessage(failure);
    invalid.value = Boolean(field);
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <AuthLayout>
    <h1 tabindex="-1" class="text-3xl font-semibold tracking-tight focus:outline-none">Sign in to RepHarbor</h1>
    <p class="mt-3 text-sm leading-6 text-muted-foreground">Enter your email to receive a link to sign in or create your account.</p>

    <form class="mt-8 space-y-5" @submit.prevent="submit">
      <div class="space-y-2">
        <Label for="email">Email address</Label>
        <Input id="email" v-model="email" class="h-11" name="email" type="email" autocomplete="username"
          spellcheck="false" enterkeyhint="send" required :aria-invalid="invalid || undefined"
          :aria-describedby="invalid ? 'sign-in-error' : undefined" @input="invalid = false; error = ''" />
      </div>
      <Alert v-if="error" id="sign-in-error">
        <AlertDescription>{{ error }}</AlertDescription>
      </Alert>
      <Button class="h-11 w-full" type="submit" :disabled="pending">
        {{ pending ? 'Sending link…' : 'Send sign-in link' }}
      </Button>
      <p class="sr-only" role="status">{{ pending ? 'Sending your sign-in link.' : '' }}</p>
    </form>
  </AuthLayout>
</template>
