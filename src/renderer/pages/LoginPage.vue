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
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';

const router = useRouter();
const { t } = useI18n();

const formRef = ref();
const studentId = ref('');
const isFormValid = ref(false);
const isLoading = ref(false);
const errorMessage = ref('');
const examInfo = ref<{ testTitle: string; description: string } | null>(null);

const studentIdRules = [
  (v: string) => !!v || t('login.rules.required'),
  (v: string) => v.length >= 2 || t('login.rules.minLength')
];

onMounted(async () => {
  if (window.api?.store) {
    examInfo.value = await window.api.store.getExamInfo();
  }
});

async function handleLogin() {
  if (!isFormValid.value || !window.api?.auth) return;

  isLoading.value = true;
  errorMessage.value = '';

  try {
    const response = await window.api.auth.login(studentId.value);
    if (response.success) {
      router.push('/exam');
    } else {
      errorMessage.value = response.error?.message || t('login.errors.generic');
    }
  } catch (err) {
    errorMessage.value = t('login.errors.generic');
  } finally {
    isLoading.value = false;
  }
}
</script>
