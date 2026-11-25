<script setup lang="ts">
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

defineProps<{ busy: boolean; error: string }>();
defineEmits<{ retry: [] }>();
</script>

<template>
  <Alert v-if="error">
    <AlertDescription class="space-y-3">
      <p>{{ error }}</p>
      <Button variant="outline" class="min-h-11" @click="$emit('retry')">Try again</Button>
    </AlertDescription>
  </Alert>
  <p v-else-if="busy" role="status" class="text-sm text-muted-foreground">Loading…</p>
</template>
