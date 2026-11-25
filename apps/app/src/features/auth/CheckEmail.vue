<script setup lang="ts">
import { useRoute } from 'vue-router';
import { Button } from '@repharbor/ui/components/ui/button';
import AuthLayout from './AuthLayout.vue';
import { requestedAddress } from './handoff';

const route = useRoute();
</script>

<template>
  <AuthLayout>
    <h1 tabindex="-1" class="text-3xl font-semibold tracking-tight focus:outline-none">Check your email</h1>
    <p class="mt-3 text-sm leading-6 text-muted-foreground">
      Open the sign-in link
      <template v-if="requestedAddress"> sent to <strong class="break-all text-foreground">{{ requestedAddress }}</strong></template>.
      It expires in 15 minutes.
    </p>
    <p class="mt-5 text-sm leading-6 text-muted-foreground">If the email hasn’t arrived, check your spam folder or request a new link.</p>
    <Button as-child variant="outline" class="mt-6 justify-self-start">
      <RouterLink :to="{ name: 'sign-in', query: route.query }">Request a new link</RouterLink>
    </Button>
  </AuthLayout>
</template>
