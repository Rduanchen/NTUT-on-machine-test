import { computed, ref } from 'vue';

/** How long submissions are still accepted after the exam is declared over. */
export const FINISH_BUFFER_SECONDS = 60;

export const isBuffering = ref(false);
export const bufferEndTime = ref(0);
export const bufferSecondsLeft = ref(FINISH_BUFFER_SECONDS);

let ticker: ReturnType<typeof setInterval> | null = null;
let onElapsed: (() => void) | null = null;

/**
 * The collection window, owned in one place.
 *
 * It used to live inside the exam page: that page listened for the phase
 * change, started its own timer, and pushed to `/finished` when it ran out.
 * That made the page responsible for a decision the whole app depends on —
 * the router guard reads `isBuffering` to decide whether a machine may stay on
 * `/exam` after the exam is over — and it meant the window only existed while
 * that particular component happened to be mounted.
 *
 * Starting it is idempotent: a second phase broadcast during the window must
 * not restart the clock.
 */
export function startBuffer(seconds: number = FINISH_BUFFER_SECONDS): void {
  if (isBuffering.value) return;

  isBuffering.value = true;
  bufferEndTime.value = Date.now() + seconds * 1000;
  bufferSecondsLeft.value = seconds;

  ticker = setInterval(() => {
    const remaining = Math.ceil((bufferEndTime.value - Date.now()) / 1000);
    bufferSecondsLeft.value = remaining > 0 ? remaining : 0;
    if (remaining <= 0) {
      const elapsed = onElapsed;
      clearBuffer();
      elapsed?.();
    }
  }, 1000);
}

export function clearBuffer(): void {
  if (ticker) {
    clearInterval(ticker);
    ticker = null;
  }
  isBuffering.value = false;
  bufferEndTime.value = 0;
  bufferSecondsLeft.value = FINISH_BUFFER_SECONDS;
}

/** What to do once the window closes — set once, by whoever owns routing. */
export function onBufferElapsed(handler: (() => void) | null): void {
  onElapsed = handler;
}

export const bufferTimeLeft = computed(() => bufferSecondsLeft.value);
