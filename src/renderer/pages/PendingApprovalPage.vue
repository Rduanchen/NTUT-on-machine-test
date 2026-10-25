<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { goToDerivedPage } from '../router/navigate';
import { useI18n } from 'vue-i18n';

/**
 * Waiting for the invigilator to let this machine in.
 *
 * Reached whenever a machine arrives after the room has filled — a new seat, a
 * swapped one, or the common case: this machine restarted and lost the key it
 * only ever held in memory. To the backend that is indistinguishable from any
 * other unregistered machine, which is why they all wait here.
 *
 * Polling checks whether the TA has approved or rejected the request. A
 * rejection pauses polling until the student explicitly resubmits.
 */
const router = useRouter();
const { t } = useI18n();

const attempts = ref(0);
const lastMessage = ref('');
const rejected = ref(false);
const isChecking = ref(false);
const resubmitError = ref('');
let waitingSince = Date.now();
const elapsed = ref('0 秒');

let poll: ReturnType<typeof setInterval> | null = null;
let clock: ReturnType<typeof setInterval> | null = null;
let active = true;

async function retry(resubmit = false): Promise<void> {
  if (isChecking.value || (rejected.value && !resubmit)) return;
  isChecking.value = true;
  attempts.value += 1;
  try {
    const res = await window.api?.auth?.register?.(resubmit);

    if (res?.success) {
      lastMessage.value = '';
      await goToDerivedPage(router);
      return;
    }

    if (res?.error?.code === 'ENTRY_REJECTED') {
      rejected.value = true;
      if (poll) clearInterval(poll);
      poll = null;
      return;
    }

    if (resubmit && res?.error?.code === 'ENTRY_PENDING') {
      rejected.value = false;
      resubmitError.value = '';
      attempts.value = 0;
      waitingSince = Date.now();
      tickClock();
      if (active && !poll) poll = setInterval(() => { void retry(); }, 5000);
    } else if (resubmit) {
      resubmitError.value = t('entryApproval.resubmitFailed');
      return;
    }

    lastMessage.value = res?.error?.message ?? '';
  } catch {
    if (resubmit) resubmitError.value = t('entryApproval.resubmitFailed');
    else lastMessage.value = t('entryApproval.checkFailed');
  } finally {
    isChecking.value = false;
  }
}

function tickClock(): void {
  const seconds = Math.round((Date.now() - waitingSince) / 1000);
  elapsed.value = seconds < 60 ? `${seconds} 秒` : `${Math.round(seconds / 60)} 分鐘`;
}

onMounted(async () => {
  active = true;
  await retry();
  if (active && !rejected.value && !poll) poll = setInterval(() => { void retry(); }, 5000);
  if (active) clock = setInterval(tickClock, 1000);
});

onBeforeUnmount(() => {
  active = false;
  if (poll) clearInterval(poll);
  if (clock) clearInterval(clock);
});
</script>

<template>
  <v-container class="fill-height d-flex justify-center align-center pa-4" fluid>
    <v-card class="w-100" max-width="620" elevation="2" rounded="lg">
      <div class="px-6 py-5 border-b d-flex align-center">
        <v-avatar :color="rejected ? 'error' : 'warning'" variant="tonal" class="mr-4" rounded>
          <v-icon>{{ rejected ? 'mdi-close-circle-outline' : 'mdi-account-clock-outline' }}</v-icon>
        </v-avatar>
        <div>
          <h2 class="text-h6 font-weight-bold">{{ rejected ? t('entryApproval.rejectedTitle') : '等待監考人員確認' }}</h2>
          <div class="text-caption text-medium-emphasis">{{ rejected ? t('entryApproval.rejectedSubtitle') : '這台機器需要監考人員核准後才能繼續' }}</div>
        </div>
      </div>

      <v-card-text class="px-6 py-6">
        <v-alert v-if="rejected" type="error" variant="tonal" density="comfortable" class="mb-4" data-test="entry-rejected">
          {{ t('entryApproval.rejectedMessage') }}
        </v-alert>

        <v-alert v-else type="info" variant="tonal" density="comfortable" class="mb-4">
          <div class="font-weight-medium mb-1">請舉手告知監考人員</div>
          <div class="text-body-2">
            考試已進入禁止自行加入的階段。監考人員在管理端核准之後，本畫面會自動繼續，
            <strong>你先前已提交的作答不會遺失</strong>。
          </div>
        </v-alert>

        <v-btn v-if="rejected" color="primary" block :loading="isChecking" @click="retry(true)" data-test="resubmit-entry">
          {{ t('entryApproval.resubmit') }}
        </v-btn>
        <v-alert v-if="rejected && resubmitError" type="warning" variant="tonal" class="mt-4" data-test="resubmit-error">
          {{ resubmitError }}
        </v-alert>

        <div v-if="!rejected" class="d-flex align-center text-body-2 text-medium-emphasis" data-test="waiting-status">
          <v-progress-circular indeterminate size="18" width="2" class="mr-3" />
          已等待 {{ elapsed }}，已嘗試 {{ attempts }} 次
        </div>

        <div v-if="!rejected && lastMessage" class="text-caption text-medium-emphasis mt-3" data-test="last-message">
          {{ lastMessage }}
        </div>
      </v-card-text>
    </v-card>
  </v-container>
</template>
