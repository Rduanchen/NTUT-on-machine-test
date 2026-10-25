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

      <PaperPreparationStatus />

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
      <v-btn 
        color="secondary" 
        variant="outlined" 
        class="mt-8 px-6 font-weight-bold" 
        prepend-icon="mdi-lock-open-outline"
        @click="showPasswordDialog = true"
      >
        Start with Password
      </v-btn>
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
          <v-btn color="grey" variant="text" :disabled="isSubmittingPassword" @click="showPasswordDialog = false">取消</v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :loading="isSubmittingPassword"
            data-test="submit-start-password"
            @click="submitPassword"
          >
            開始考試
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import PaperPreparationStatus from '../components/PaperPreparationStatus.vue';
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { goToDerivedPage } from '../router/navigate';
import { useI18n } from 'vue-i18n';

const router = useRouter();
const { t } = useI18n();

const examInfo = ref<{ testTitle: string; description: string } | null>(null);
const studentInfo = ref<{ id: string; name: string } | null>(null);
const autoLoginMsg = ref('');
const autoLoginSuccess = ref(false);

const showPasswordDialog = ref(false);
const startPasswordInput = ref('');
const isSubmittingPassword = ref(false);
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
  await goToDerivedPage(router);
}

/**
 * Start the exam from the invigilator's spoken password.
 *
 * The password used to be compared against a copy of itself sitting in this
 * machine's own config — a gate whose key was handed to the person being
 * gated. It is now what unwraps the exam key: get it right and the paper
 * opens, get it wrong and the paper stays shut, because there is nothing here
 * to compare against.
 *
 * The unwrap happens in the main process; the key must never reach a window.
 */
async function submitPassword() {
  passwordError.value = '';
  if (!startPasswordInput.value) return;

  isSubmittingPassword.value = true;
  try {
    const res = await window.api?.config?.startWithPassword?.(startPasswordInput.value);

    if (res?.success) {
      showPasswordDialog.value = false;
      startPasswordInput.value = '';
      await goToDerivedPage(router);
    } else {
      passwordError.value = res?.error?.message ?? '口令不正確';
    }
  } finally {
    isSubmittingPassword.value = false;
  }
}

onMounted(async () => {
  if (window.api?.store) {
    examInfo.value = await window.api.store.getExamInfo();
  }

  await tryAutoLogin();
  await checkExamStatus();

  pollTimer = setInterval(checkExamStatus, 5000);

  /* The phase is watched once, in App.vue. */
});

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer);
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
