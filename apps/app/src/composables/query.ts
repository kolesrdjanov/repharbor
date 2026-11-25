import { onBeforeUnmount, ref, shallowRef } from 'vue';
import { errorMessage } from '@/api/client';

export function useQuery<T>(load: (signal: AbortSignal) => Promise<T>) {
  const data = shallowRef<T>();
  const busy = ref(false);
  const error = ref('');
  let current: AbortController | undefined;

  async function reload() {
    current?.abort();
    const controller = new AbortController();
    current = controller;
    busy.value = true;
    error.value = '';
    try {
      const result = await load(AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]));
      if (current === controller) data.value = result;
    } catch (failure) {
      if (current === controller) error.value = errorMessage(failure);
    } finally {
      if (current === controller) busy.value = false;
    }
  }

  onBeforeUnmount(() => { current?.abort(); current = undefined; });
  return { data, busy, error, reload };
}

export function useMutation() {
  const pending = ref(false);
  const failure = shallowRef<unknown>();
  const message = ref('');

  async function submit(action: () => Promise<void>) {
    if (pending.value) return;
    pending.value = true;
    failure.value = undefined;
    message.value = '';
    try {
      await action();
    } catch (error) {
      failure.value = error;
      message.value = errorMessage(error);
    } finally {
      pending.value = false;
    }
  }
  return { pending, failure, message, submit };
}
