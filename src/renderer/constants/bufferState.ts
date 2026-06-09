import { ref } from 'vue';

export const isBuffering = ref(false);
export const bufferEndTime = ref(0);

export function startBuffer(seconds: number = 60) {
  isBuffering.value = true;
  bufferEndTime.value = Date.now() + seconds * 1000;
}

export function clearBuffer() {
  isBuffering.value = false;
  bufferEndTime.value = 0;
}
