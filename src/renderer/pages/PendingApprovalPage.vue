<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { goToDerivedPage } from '../router/navigate';

/**
 * Waiting for the invigilator to let this machine in.
 *
 * Reached whenever a machine arrives after the room has filled — a new seat, a
 * swapped one, or the common case: this machine restarted and lost the key it
 * only ever held in memory. To the backend that is indistinguishable from any
 * other unregistered machine, which is why they all wait here.
 *
 * There is nothing for the student to do but say so to the invigilator, so the
 * page keeps retrying quietly rather than offering buttons that cannot help.
 */
const router = useRouter();

const attempts = ref(0);
const lastMessage = ref('');
const waitingSince = Date.now();
const elapsed = ref('0 秒');

let poll: ReturnType<typeof setInterval> | null = null;
let clock: ReturnType<typeof setInterval> | null = null;

async function retry(): Promise<void> {
  attempts.value += 1;
  const res = await window.api?.auth?.register?.();

  if (res?.success) {
    lastMessage.value = '';
    await goToDerivedPage(router);
    return;
  }

  lastMessage.value = res?.error?.message ?? '';
}

function tickClock(): void {
  const seconds = Math.round((Date.now() - waitingSince) / 1000);
  elapsed.value = seconds < 60 ? `${seconds} 秒` : `${Math.round(seconds / 60)} 分鐘`;
}

onMounted(async () => {
  await retry();
  poll = setInterval(retry, 5000);
  clock = setInterval(tickClock, 1000);
});

onBeforeUnmount(() => {
  if (poll) clearInterval(poll);
  if (clock) clearInterval(clock);
});
</script>

<template>
  <v-container class="fill-height d-flex justify-center align-center pa-4" fluid>
    <v-card class="w-100" max-width="620" elevation="2" rounded="lg">
      <div class="px-6 py-5 border-b d-flex align-center">
        <v-avatar color="warning" variant="tonal" class="mr-4" rounded>
          <v-icon>mdi-account-clock-outline</v-icon>
        </v-avatar>
        <div>
          <h2 class="text-h6 font-weight-bold">等待監考人員確認</h2>
          <div class="text-caption text-medium-emphasis">這台機器需要監考人員核准後才能繼續</div>
        </div>
      </div>

      <v-card-text class="px-6 py-6">
        <v-alert type="info" variant="tonal" density="comfortable" class="mb-4">
          <div class="font-weight-medium mb-1">請舉手告知監考人員</div>
          <div class="text-body-2">
            考試已進入禁止自行加入的階段。監考人員在管理端核准之後，本畫面會自動繼續，
            <strong>你先前已提交的作答不會遺失</strong>。
          </div>
        </v-alert>

        <div class="d-flex align-center text-body-2 text-medium-emphasis" data-test="waiting-status">
          <v-progress-circular indeterminate size="18" width="2" class="mr-3" />
          已等待 {{ elapsed }}，已嘗試 {{ attempts }} 次
        </div>

        <div v-if="lastMessage" class="text-caption text-medium-emphasis mt-3" data-test="last-message">
          {{ lastMessage }}
        </div>
      </v-card-text>
    </v-card>
  </v-container>
</template>
