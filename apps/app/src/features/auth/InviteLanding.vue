<script setup lang="ts">
import { useSession } from '@/stores/session';
import AuthLayout from './AuthLayout.vue';
import { Button } from '@/components/ui/button';

const session = useSession();
</script>

<template>
  <AuthLayout>
    <h1 tabindex="-1" class="text-3xl font-semibold tracking-tight focus:outline-none">Invitation</h1>
    <template v-if="session.identity?.pendingInvitationId">
      <p class="mt-3 text-sm text-muted-foreground">You’re signed in with the invited address.</p>
      <Button as-child variant="outline" class="mt-6 h-11">
        <RouterLink to="/portfolio">Open portfolio</RouterLink>
      </Button>
    </template>
    <template v-else>
      <p class="mt-3 text-sm text-muted-foreground">Sign in with the email address that received the invitation.</p>
      <Button as-child class="mt-6 h-11">
        <RouterLink :to="{ name: 'sign-in' }">Sign in</RouterLink>
      </Button>
    </template>
  </AuthLayout>
</template>
