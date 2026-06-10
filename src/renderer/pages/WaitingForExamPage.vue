<template>
  <v-container fluid class="fill-height d-flex align-center justify-center pa-4">
    <v-card class="pa-8 rounded-2xl text-center" max-width="560" width="100%" elevation="6">
      <!-- Animated waiting graphic -->
      <div class="icon-wrap mx-auto mb-6">
        <v-progress-circular
          indeterminate
          color="primary"
          size="72"
          width="5"
        />
      </div>

      <!-- Exam info -->
      <h1 class="text-h4 font-weight-bold mb-2">{{ examInfo?.testTitle || t('waiting.title') }}</h1>
      <p class="text-body-1 text-medium-emphasis mb-2">
        {{ examInfo?.description || t('waiting.subtitle') }}
      </p>

      <v-chip color="primary" variant="tonal" class="mb-8 font-weight-bold" prepend-icon="mdi-timer-sand">
        {{ t('waiting.statusChip') }}
      </v-chip>

      <v-divider class="mb-6" />

      <!-- Student Info Card -->
      <v-card
        v-if="studentInfo"
        variant="tonal"
        color="primary"
        class="mb-6 text-left"
        rounded="lg"
      >
        <v-card-text class="d-flex align-center">
          <v-avatar color="primary" size="48" class="mr-4">
            <v-icon size="28">mdi-account-school</v-icon>
          </v-avatar>
          <div>
            <div class="text-subtitle-1 font-weight-bold">{{ studentInfo.name }}</div>
            <div class="text-caption text-medium-emphasis font-mono">{{ t('waiting.studentId') }}: {{ studentInfo.id }}</div>
          </div>
          <v-spacer />
          <v-chip color="success" size="small" variant="flat">
            <v-icon start size="14">mdi-check-circle</v-icon>
            {{ t('waiting.verified') }}
          </v-chip>
        </v-card-text>
      </v-card>

      <!-- Auto-login status -->
      <v-alert
        v-if="autoLoginMsg"
        :type="autoLoginSuccess ? 'success' : 'warning'"
        variant="tonal"
        density="compact"
        class="mb-4 text-left"
      >
        {{ autoLoginMsg }}
      </v-alert>

      <p class="text-caption text-medium-emphasis">{{ t('waiting.hint') }}</p>

      <!-- Offline Bypass -->
      <div class="mt-8 text-caption text-disabled" style="cursor: pointer; font-size: 10px;" @click="showPasswordDialog = true">
        start with password
      </div>
    </v-card>

    <!-- Password Dialog -->
    <v-dialog v-model="showPasswordDialog" max-width="400">
      <v-card class="pa-4 rounded-xl">
        <v-card-title class="text-h6 font-weight-bold text-center">Start Exam Manually</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="startPasswordInput"
            label="Start Password"
            variant="outlined"
            :error-messages="passwordError"
            @keyup.enter="submitPassword"
            autofocus
            class="mt-4"
          />
        </v-card-text>
        <v-card-actions class="justify-center mb-2">
          <v-btn color="grey" variant="text" @click="showPasswordDialog = false">Cancel</v-btn>
          <v-btn color="primary" variant="flat" @click="submitPassword">Start</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';

const router = useRouter();
const { t } = useI18n();

const examInfo = ref<{ testTitle: string; description: string } | null>(null);
const studentInfo = ref<{ id: string; name: string } | null>(null);
const autoLoginMsg = ref('');
const autoLoginSuccess = ref(false);

const showPasswordDialog = ref(false);
const startPasswordInput = ref('');
const passwordError = ref('');

let pollTimer: ReturnType<typeof setInterval> | null = null;

async function tryAutoLogin() {
  if (!window.api?.auth) return;
  const already = await window.api.auth.isVerified();
  if (already) {
    studentInfo.value = await window.api.auth.getStudentInfo();
    autoLoginSuccess.value = true;
    autoLoginMsg.value = t('waiting.autoLoginSuccess');
    return;
  }

  const res = await window.api.auth.login();
  if (res.success) {
    studentInfo.value = await window.api.auth.getStudentInfo();
    autoLoginSuccess.value = true;
    autoLoginMsg.value = t('waiting.autoLoginSuccess');
  } else {
    autoLoginSuccess.value = false;
    autoLoginMsg.value = t('waiting.autoLoginFailed');
  }
}

async function checkExamStatus() {
  const status = await window.api?.store?.getExamStatus?.();
  if (status === 'IN_PROGRESS') {
    router.push('/exam');
  } else if (status === 'FINISHED') {
    router.push('/finished');
  } else if (status === 'UNINITIALIZED') {
    router.push('/not-initialized');
  }
}

function generateFallbackPassword(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = ((hash << 5) - hash) + title.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36).padEnd(6, 'a').slice(0, 6);
}

async function submitPassword() {
  passwordError.value = '';
  if (!startPasswordInput.value) return;

  const config = await window.api?.store?.getExamConfig?.();
  if (!config) {
    passwordError.value = 'Exam config not found';
    return;
  }

  const expectedPassword = config.startPassword || generateFallbackPassword(config.testTitle || 'ntut-exam');
  
  if (startPasswordInput.value === expectedPassword) {
    showPasswordDialog.value = false;
    await window.api?.store?.setExamStatus?.('IN_PROGRESS');
  } else {
    passwordError.value = 'Invalid password';
  }
}

let statusUnsubscribe: (() => void) | null = null;

onMounted(async () => {
  if (window.api?.store) {
    examInfo.value = await window.api.store.getExamInfo();
  }

  await tryAutoLogin();
  await checkExamStatus();

  pollTimer = setInterval(checkExamStatus, 5000);

  statusUnsubscribe = window.api?.store?.onExamStatusChanged?.((status: string) => {
    if (status === 'IN_PROGRESS') router.push('/exam');
    else if (status === 'FINISHED') router.push('/finished');
    else if (status === 'UNINITIALIZED') router.push('/not-initialized');
  }) || null;
});

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer);
  if (statusUnsubscribe) statusUnsubscribe();
});
</script>

<style scoped>
.rounded-2xl { border-radius: 20px !important; }
.font-mono { font-family: 'Roboto Mono', monospace; }

.icon-wrap {
  width: 110px;
  height: 110px;
  border-radius: 50%;
  background: rgba(var(--v-theme-primary), 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
