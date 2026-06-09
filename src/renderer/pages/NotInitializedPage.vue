<template>
  <v-container fluid class="fill-height d-flex align-center justify-center pa-4">
    <v-card
      class="pa-8 rounded-2xl text-center"
      max-width="520"
      width="100%"
      elevation="6"
    >
      <!-- Animated icon -->
      <div class="icon-wrap mx-auto mb-6">
        <v-icon size="72" color="warning" class="pulse-icon">mdi-clock-time-four-outline</v-icon>
      </div>

      <h1 class="text-h4 font-weight-bold mb-2">{{ t('notInitialized.title') }}</h1>
      <p class="text-body-1 text-medium-emphasis mb-6">{{ t('notInitialized.subtitle') }}</p>

      <!-- Status chip -->
      <v-chip color="warning" variant="tonal" size="large" class="mb-8 font-weight-bold" prepend-icon="mdi-alert-circle-outline">
        {{ t('notInitialized.statusChip') }}
      </v-chip>

      <v-divider class="mb-6" />

      <!-- Device Registration Section -->
      <div class="text-left mb-4">
        <div class="d-flex align-center mb-3">
          <v-icon color="primary" class="mr-2">mdi-devices</v-icon>
          <span class="text-subtitle-1 font-weight-bold">{{ t('notInitialized.registerSection') }}</span>
        </div>

        <v-alert
          v-if="registerMsg"
          :type="registerSuccess ? 'success' : 'error'"
          variant="tonal"
          density="compact"
          class="mb-3"
          closable
          @click:close="registerMsg = ''"
        >
          {{ registerMsg }}
        </v-alert>

        <v-btn
          color="primary"
          variant="tonal"
          block
          size="large"
          rounded="lg"
          :loading="isRegistering"
          @click="handleRegisterDevice"
          class="mb-3"
        >
          <v-icon start>mdi-badge-account-outline</v-icon>
          {{ t('notInitialized.registerBtn') }}
        </v-btn>
      </div>

      <!-- Retry connection -->
      <v-btn
        variant="text"
        color="grey"
        size="small"
        :loading="isChecking"
        @click="checkStatus"
        class="mt-2"
      >
        <v-icon start size="16">mdi-refresh</v-icon>
        {{ t('notInitialized.retryBtn') }}
      </v-btn>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';

const router = useRouter();
const { t } = useI18n();

const isRegistering = ref(false);
const isChecking = ref(false);
const registerMsg = ref('');
const registerSuccess = ref(false);

// Poll for exam status every 5 seconds
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function checkStatus() {
  if (!window.api?.store) return;
  isChecking.value = true;
  try {
    const examStatus = await window.api.store.getExamStatus?.();
    if (examStatus && examStatus !== 'UNINITIALIZED') {
      // Transition away: NOT_STARTED → login, IN_PROGRESS → exam, FINISHED → finished
      if (examStatus === 'NOT_STARTED') {
        router.push('/login');
      } else if (examStatus === 'IN_PROGRESS') {
        router.push('/exam');
      } else if (examStatus === 'FINISHED') {
        router.push('/finished');
      }
    }
  } finally {
    isChecking.value = false;
  }
}

async function handleRegisterDevice() {
  if (!window.api?.auth) return;
  isRegistering.value = true;
  registerMsg.value = '';
  try {
    const res = await window.api.auth.register();
    registerSuccess.value = res.success;
    registerMsg.value = res.success
      ? t('notInitialized.registerSuccess')
      : (res.error?.message || t('notInitialized.registerFailed'));
  } catch {
    registerSuccess.value = false;
    registerMsg.value = t('notInitialized.registerFailed');
  } finally {
    isRegistering.value = false;
  }
}

let statusUnsubscribe: (() => void) | null = null;

onMounted(() => {
  checkStatus();
  pollTimer = setInterval(checkStatus, 5000);
  
  // Automatically register device to establish crypto state,
  // so that messageSyncService can successfully fetch exam status.
  handleRegisterDevice();

  // Listen for status changes pushed from main process
  statusUnsubscribe = window.api?.store?.onExamStatusChanged?.((status: string) => {
    if (status === 'NOT_STARTED') router.push('/login');
    else if (status === 'IN_PROGRESS') router.push('/exam');
    else if (status === 'FINISHED') router.push('/finished');
  }) || null;
});

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer);
  if (statusUnsubscribe) statusUnsubscribe();
});
</script>

<style scoped>
.rounded-2xl {
  border-radius: 20px !important;
}

.icon-wrap {
  width: 110px;
  height: 110px;
  border-radius: 50%;
  background: rgba(var(--v-theme-warning), 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
}

.pulse-icon {
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.12); opacity: 0.8; }
}
</style>
