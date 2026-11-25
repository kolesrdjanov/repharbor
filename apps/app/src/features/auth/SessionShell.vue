<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { safeReturnPath } from '@repharbor/contracts';
import { errorMessage } from '@/api/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useSession } from '@/stores/session';
import { invitationToken } from './handoff';

const route = useRoute();
const router = useRouter();
const session = useSession();
const busy = ref(false);
const error = ref('');
const companies = computed(() => session.identity?.companies ?? []);

async function retry() {
  await session.bootstrap();
  if (session.ready && !session.identity) {
    await router.replace({ name: 'sign-in', query: { next: safeReturnPath(route.fullPath) } });
  }
}

async function signOut() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await session.logout();
    await router.replace({ name: 'sign-in' });
  } catch (failure) {
    error.value = errorMessage(failure);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <header class="border-b bg-card">
    <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
      <RouterLink to="/portfolio" class="flex items-center gap-2.5 rounded font-semibold focus-visible:outline-2 focus-visible:outline-offset-4">
        <span aria-hidden="true" class="grid size-8 place-items-center rounded-md bg-foreground text-sm text-background">R</span>
        RepHarbor
      </RouterLink>
      <div v-if="session.identity" class="flex min-w-0 items-center gap-3">
        <span class="hidden max-w-64 truncate text-sm text-muted-foreground sm:inline">{{ session.identity.email }}</span>
        <Button variant="outline" class="min-h-11" :disabled="busy" @click="signOut">{{ busy ? 'Signing out…' : 'Sign out' }}</Button>
      </div>
    </div>
  </header>

  <div class="mx-auto grid max-w-6xl gap-6 px-5 py-8 sm:px-8 md:grid-cols-[14rem_minmax(0,1fr)]">
    <nav v-if="session.identity" aria-label="Workspace" class="flex flex-wrap content-start gap-2 md:flex-col">
      <Button as-child variant="ghost" class="min-h-11 justify-start">
        <RouterLink to="/portfolio">Portfolio</RouterLink>
      </Button>
      <Button v-if="session.identity.pendingInvitationId || invitationToken" as-child variant="ghost" class="min-h-11 justify-start">
        <RouterLink to="/invite">Open invitation</RouterLink>
      </Button>
      <Button v-for="company in companies" :key="company.id" as-child variant="ghost" class="min-h-11 justify-start">
        <RouterLink :to="{ name: 'company', params: { companyId: company.id } }">{{ company.name }}</RouterLink>
      </Button>
      <Button as-child variant="outline" class="min-h-11 justify-start">
        <RouterLink to="/onboarding">Create a company</RouterLink>
      </Button>
    </nav>
    <main class="min-w-0 space-y-5">
      <Alert v-if="error || session.error"><AlertDescription>{{ error || session.error }}</AlertDescription></Alert>
      <Button v-if="session.error" variant="outline" class="min-h-11" @click="retry">Retry session check</Button>
      <RouterView v-if="session.identity" v-slot="{ Component }">
        <component :is="Component" :key="route.path" />
      </RouterView>
    </main>
  </div>
</template>
