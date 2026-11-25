import { ref } from 'vue';

export const requestedAddress = ref('');
export const invitationToken = ref<string>();
let confirmationToken: string | undefined;

export function captureFragment(path: string, hash: string) {
  const token = new URLSearchParams(hash.slice(1)).get('token');
  if (path === '/auth/confirm') confirmationToken = token ?? undefined;
  if (path === '/invite') invitationToken.value = token ?? undefined;
}

export function takeConfirmationToken() {
  const token = confirmationToken;
  confirmationToken = undefined;
  return token;
}
