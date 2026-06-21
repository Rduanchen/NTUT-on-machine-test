<template>
  <v-container class="fill-height d-flex align-center justify-center" fluid>
    <v-card class="pa-8 rounded-xl" elevation="8" min-width="400" max-width="500">
      <div class="text-center mb-6">
        <v-icon size="64" color="primary" class="mb-4">mdi-account-school</v-icon>
        <h1 class="text-h4 font-weight-bold">{{ t('login.title') }}</h1>
        <p class="text-body-2 text-medium-emphasis mt-2">{{ t('login.subtitle') }}</p>
      </div>

      <!-- Exam Info -->
      <v-card v-if="examInfo" variant="tonal" color="primary" class="mb-6 pa-3 rounded-lg">
        <div class="text-subtitle-1 font-weight-bold">{{ examInfo.testTitle }}</div>
        <div class="text-body-2 text-medium-emphasis">{{ examInfo.description }}</div>
      </v-card>

      <!-- Auto-login in progress -->
      <div v-if="isAutoLoggingIn" class="text-center py-6">
        <v-progress-circular indeterminate color="primary" size="48" class="mb-4" />
        <div class="text-body-1 text-medium-emphasis">{{ t('login.autoLoginProgress') }}</div>
      </div>

      <!-- Auto-login success state -->
      <div v-else-if="isAutoLoginSuccess" class="text-center py-4">
        <v-icon size="56" color="success" class="mb-3">mdi-check-circle-outline</v-icon>
        <div class="text-h6 font-weight-bold text-success mb-2">{{ t('login.autoLoginSuccess') }}</div>
        <div class="text-body-2 text-medium-emphasis mb-4">
          {{ t('login.waitingForExam') }}
        </div>
        <v-progress-linear indeterminate color="primary" rounded height="4" />
      </div>

      <!-- Binding Blocked State -->
      <div v-else-if="isBindingBlocked" class="text-center py-6">
        <v-icon size="64" color="error" class="mb-4">mdi-shield-lock-outline</v-icon>
        <h2 class="text-h5 font-weight-bold text-error mb-2">Device Registration Blocked</h2>
        <p class="text-body-1 text-medium-emphasis mb-6">{{ errorMessage }}</p>
        <v-btn
          color="primary"
          size="large"
          variant="flat"
          block
          class="rounded-lg text-none font-weight-bold"
          @click="tryAutoLogin"
          :loading="isAutoLoggingIn"
        >
          <v-icon start>mdi-refresh</v-icon>
          Retry Connection
        </v-btn>
      </div>

      <!-- Manual login form (fallback) -->
      <template v-else>
        <v-alert
          v-if="autoLoginFailed && !isBindingBlocked"
          type="info"
          variant="tonal"
          density="compact"
          class="mb-4"
          icon="mdi-information-outline"
        >
          {{ t('login.autoLoginFailed') }}
        </v-alert>

        <v-form ref="formRef" v-model="isFormValid" @submit.prevent="handleLogin">
          <v-text-field
            v-model="studentId"
            :label="t('login.studentIdLabel')"
            :placeholder="t('login.studentIdPlaceholder')"
            :rules="studentIdRules"
            variant="outlined"
            prepend-inner-icon="mdi-card-account-details"
            class="mb-4"
            :disabled="isLoading"
            autofocus
          />

          <v-alert
            v-if="errorMessage"
            type="error"
            variant="tonal"
            class="mb-4"
            closable
            @click:close="errorMessage = ''"
          >
            {{ errorMessage }}
          </v-alert>

          <v-btn
            type="submit"
            color="primary"
            size="large"
            block
            :loading="isLoading"
            :disabled="!isFormValid || isLoading"
            class="text-none font-weight-bold"
            rounded="lg"
          >
            <v-icon start>mdi-login</v-icon>
            {{ t('login.loginButton') }}
          </v-btn>
        </v-form>
      </template>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';

const router = useRouter();
const route = useRoute();
const { t } = useI18n();

const formRef = ref();
const studentId = ref('');
const isFormValid = ref(false);
const isLoading = ref(false);
const errorMessage = ref('');
const examInfo = ref<{ testTitle: string; description: string } | null>(null);
const isAutoLoggingIn = ref(false);
const isAutoLoginSuccess = ref(false);
const autoLoginFailed = ref(false);
const isBindingBlocked = ref(false);

// 1 minute buffer before redirect to /exam when IN_PROGRESS
const BUFFER_MS = 60_000;
let redirectTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

const studentIdRules = [
  (v: string) => !!v || t('login.rules.required'),
  (v: string) => v.length >= 1 || t('login.rules.minLength')
];

async function tryAutoLogin() {
  if (!window.api?.auth) return;

  isAutoLoggingIn.value = true;
  autoLoginFailed.value = false;
  isBindingBlocked.value = false;
  errorMessage.value = '';

  try {
    // Check if already verified
    const already = await window.api.auth.isVerified();
    if (already) {
      isAutoLoginSuccess.value = true;
      redirectToWaiting();
      return;
    }

    // Attempt IP-based login
    const res = await window.api.auth.login();
    if (res.success) {
      isAutoLoginSuccess.value = true;
      redirectToWaiting();
    } else {
      if (res.error?.code === 'REGISTRATION_FAILED') {
        isBindingBlocked.value = true;
        errorMessage.value = res.error.message;
      } else if (res.error?.code === 'BINDING_LOCKED' || res.error?.code === 'ALREADY_LOGGED_IN') {
        // Device is registered but bound to another student
        // Show manual login form so user can enter a different student ID
        autoLoginFailed.value = true;
        errorMessage.value = res.error.message;
      } else {
        autoLoginFailed.value = true;
        errorMessage.value = res.error?.message || t('login.autoLoginFailed');
      }
    }
  } catch (err: any) {
    autoLoginFailed.value = true;
    errorMessage.value = err?.message || t('login.autoLoginFailed');
  } finally {
    isAutoLoggingIn.value = false;
  }
}

async function redirectToWaiting() {
  const status = await window.api?.store?.getExamStatus?.();
  if (status === 'IN_PROGRESS') {
    router.push('/exam');
  } else {
    router.push('/waiting');
  }
}

async function checkExamStatus() {
  const status = await window.api?.store?.getExamStatus?.();
  if (status === 'UNINITIALIZED') router.push('/not-initialized');
  else if (status === 'IN_PROGRESS') router.push('/exam');
  else if (status === 'FINISHED') router.push('/finished');
}

async function handleLogin() {
  if (!isFormValid.value || !window.api?.auth) return;

  isLoading.value = true;
  errorMessage.value = '';

  try {
    // Manual fallback: IP auto-login ignores student ID input — try calling login() once more
    const response = await window.api.auth.login(studentId.value);
    if (response.success) {
      await redirectToWaiting();
    } else {
      if (response.error?.code === 'REGISTRATION_FAILED') {
        isBindingBlocked.value = true;
        errorMessage.value = response.error.message;
      } else {
        errorMessage.value = response.error?.message || t('login.errors.generic');
      }
    }
  } catch (err) {
    errorMessage.value = t('login.errors.generic');
  } finally {
    isLoading.value = false;
  }
}

let statusUnsubscribe: (() => void) | null = null;

onMounted(async () => {
  if (window.api?.store) {
    examInfo.value = await window.api.store.getExamInfo();
  }

  // Skip auto-login if redirected here from a force-logout (TA unbind)
  if (route.query.skipAutoLogin !== '1') {
    await tryAutoLogin();
  } else {
    autoLoginFailed.value = true;
  }
  await checkExamStatus();

  pollTimer = setInterval(checkExamStatus, 5000);

  statusUnsubscribe = window.api?.store?.onExamStatusChanged?.((status: string) => {
    if (status === 'UNINITIALIZED') router.push('/not-initialized');
    else if (status === 'IN_PROGRESS') {
      // Buffer before redirecting
      if (!redirectTimer) {
        redirectTimer = setTimeout(() => router.push('/exam'), BUFFER_MS);
      }
    } else if (status === 'FINISHED') router.push('/finished');
  }) || null;
});

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer);
  if (redirectTimer) clearTimeout(redirectTimer);
  if (statusUnsubscribe) statusUnsubscribe();
});
</script>
