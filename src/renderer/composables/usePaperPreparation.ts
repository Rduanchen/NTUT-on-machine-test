import { onMounted, onUnmounted, ref } from 'vue';
import type { PaperPreparationState } from '../../common/types';

/** Ignore a delayed snapshot if a newer push has already arrived. */
export function newerPreparation(
  current: PaperPreparationState,
  incoming: PaperPreparationState
): PaperPreparationState {
  return incoming.revision > current.revision ? incoming : current;
}

export function usePaperPreparation() {
  const state = ref<PaperPreparationState>({ status: 'IDLE', hasUsablePaper: false, revision: -1 });
  const retrying = ref(false);
  const unavailable = ref(false);
  let unsubscribe: (() => void) | undefined;
  let active = true;
  const accept = (incoming: PaperPreparationState) => {
    if (active) state.value = newerPreparation(state.value, incoming);
  };
  onMounted(async () => {
    try {
      unsubscribe = window.api.store.onPaperPreparationChanged(accept);
      accept(await window.api.store.getPaperPreparation());
    } catch {
      if (active) unavailable.value = true;
    }
  });
  onUnmounted(() => {
    active = false;
    unsubscribe?.();
  });
  const retry = async () => {
    if (retrying.value) return;
    retrying.value = true;
    unavailable.value = false;
    try {
      const result = await window.api.config.preparePaper();
      if (!result.success && active) unavailable.value = true;
    } catch {
      if (active) unavailable.value = true;
    } finally {
      retrying.value = false;
    }
  };
  return { state, retrying, unavailable, retry };
}
