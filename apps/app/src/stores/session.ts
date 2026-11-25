import type { components } from '@repharbor/contracts';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import * as auth from '../api/auth';
import { RequestError, errorMessage } from '../api/client';

export const useSession = defineStore('session', () => {
  const identity = ref<components['schemas']['Session'] | null>(null);
  const ready = ref(false);
  const error = ref('');
  let loading: Promise<void> | undefined;

  function setSession(session: components['schemas']['Session'] | null) {
    identity.value = session;
    error.value = '';
    ready.value = true;
  }

  function bootstrap() {
    if (ready.value) return Promise.resolve();
    if (!loading) {
      error.value = '';
      loading = auth.getSession().then(setSession).catch((failure: unknown) => {
        if (failure instanceof RequestError && failure.status === 401) setSession(null);
        else error.value = errorMessage(failure);
      }).finally(() => { loading = undefined; });
    }
    return loading;
  }

  async function logout() {
    try {
      await auth.signOut();
    } catch (failure) {
      if (!(failure instanceof RequestError && failure.status === 401)) throw failure;
    }
    setSession(null);
  }

  return { identity, ready, error, setSession, bootstrap, logout };
});
