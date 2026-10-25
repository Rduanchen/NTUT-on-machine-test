import { describe, expect, it } from 'vitest';
import { newerPreparation } from '../../src/renderer/composables/usePaperPreparation';
import type { PaperPreparationState } from '../../src/common/types';
describe('paper preparation snapshot ordering', () => {
  it('ignores an older snapshot arriving after reset or a newer push', () => {
    const reset: PaperPreparationState = { status: 'IDLE', hasUsablePaper: false, revision: 12 };
    expect(newerPreparation(reset, { status: 'READY', hasUsablePaper: true, revision: 11 })).toBe(
      reset
    );
    expect(
      newerPreparation(reset, { status: 'FETCHING', hasUsablePaper: false, revision: 13 }).status
    ).toBe('FETCHING');
  });
  it('preserves the distinction between refresh failure and no usable paper', () => {
    const ready: PaperPreparationState = { status: 'READY', hasUsablePaper: true, revision: 1 };
    const failed: PaperPreparationState = {
      status: 'ERROR',
      hasUsablePaper: true,
      revision: 2,
      error: { code: 'NETWORK_ERROR', message: 'Retry' }
    };
    expect(newerPreparation(ready, failed)).toEqual(failed);
  });
});

import { createRenderer, defineComponent, nextTick } from 'vue';
import { vi } from 'vitest';
import { usePaperPreparation } from '../../src/renderer/composables/usePaperPreparation';
const renderer = createRenderer<object, object>({
  patchProp() {},
  insert() {},
  remove() {},
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  setText() {},
  setElementText() {},
  parentNode: () => null,
  nextSibling: () => null
});
it('subscribes before reading, ignores delayed snapshots, and cleans up after unmount', async () => {
  let deliver: ((state: PaperPreparationState) => void) | undefined;
  let snapshot!: (state: PaperPreparationState) => void;
  const unsubscribe = vi.fn();
  const retry = vi.fn().mockResolvedValue({ success: false });
  vi.stubGlobal('window', {
    api: {
      store: {
        onPaperPreparationChanged: (cb: typeof deliver) => {
          deliver = cb;
          return unsubscribe;
        },
        getPaperPreparation: () =>
          new Promise<PaperPreparationState>((r) => {
            snapshot = r;
          })
      },
      config: { preparePaper: retry }
    }
  });
  let model!: ReturnType<typeof usePaperPreparation>;
  const app = renderer.createApp(
    defineComponent({
      setup() {
        model = usePaperPreparation();
        return () => null;
      }
    })
  );
  try {
    app.mount({});
    deliver!({ status: 'READY', hasUsablePaper: true, revision: 2 });
    snapshot({ status: 'IDLE', hasUsablePaper: false, revision: 1 });
    await nextTick();
    expect(model.state.value.status).toBe('READY');
    await Promise.all([model.retry(), model.retry()]);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(model.unavailable.value).toBe(true);
    app.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    deliver!({ status: 'IDLE', hasUsablePaper: false, revision: 3 });
    expect(model.state.value.status).toBe('READY');
  } finally {
    vi.unstubAllGlobals();
  }
});
