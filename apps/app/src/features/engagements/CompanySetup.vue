<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { createCompany } from '@/api/engagements';
import { useMutation } from '@/composables/query';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSession } from '@/stores/session';

const name = ref('');
const timeZone = ref(Intl.DateTimeFormat().resolvedOptions().timeZone);
const router = useRouter();
const session = useSession();
const { pending, message, submit } = useMutation();

async function save() {
  await submit(async () => {
    const company = await createCompany({ name: name.value, timeZone: timeZone.value });
    const identity = session.identity;
    if (identity) session.setSession({ ...identity, companies: [...identity.companies, company] });
    await router.push({ name: 'company', params: { companyId: company.id } });
  });
}
</script>

<template>
  <h1 tabindex="-1" class="text-3xl font-semibold tracking-tight focus:outline-none">Create a company</h1>
  <Card class="max-w-lg">
    <CardHeader>
      <p class="text-sm text-muted-foreground">Choose the time zone used to calculate statement dates.</p>
    </CardHeader>
    <CardContent>
      <form class="space-y-4" @submit.prevent="save">
        <div class="space-y-2"><Label for="company-name">Company name</Label><Input id="company-name" v-model="name" required class="h-11" /></div>
        <div class="space-y-2"><Label for="time-zone">IANA time zone</Label><Input id="time-zone" v-model="timeZone" required class="h-11" /></div>
        <Alert v-if="message"><AlertDescription>{{ message }}</AlertDescription></Alert>
        <Button type="submit" class="h-11" :disabled="pending">{{ pending ? 'Creating…' : 'Create company' }}</Button>
      </form>
    </CardContent>
  </Card>
</template>
