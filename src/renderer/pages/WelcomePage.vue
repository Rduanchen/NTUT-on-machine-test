<template>
  <v-container class="fill-height d-flex justify-center align-center pa-4">
    <v-card
      class="welcome-card mx-auto"
      elevation="8"
      width="100%"
      max-width="480"
      rounded="xl"
    >
      <div class="header-bg pt-8 pb-6 text-center">
        <v-avatar
          color="primary"
          size="80"
          class="mb-4 elevation-4"
        >
          <v-icon size="40" color="white">mdi-account-school-outline</v-icon>
        </v-avatar>
        <h1 class="text-h5 font-weight-bold mb-2 px-4">
          {{ testInfo.testTitle || t('examSystem.title') }}
        </h1>
        <p class="text-body-2 text-medium-emphasis px-6 text-truncate-2">
          {{ testInfo.description }}
        </p>
      </div>

      <v-divider></v-divider>

      <v-card-text class="pa-6 pt-8">
        <v-form @submit.prevent="saveStudentInfo">
          <div class="text-subtitle-2 font-weight-bold mb-2 text-medium-emphasis ml-1">
            {{ t('examSystem.welcome.studentIdLabel') }}
          </div>
          <v-text-field
            v-model="studentId"
            :placeholder="t('examSystem.welcome.studentIdLabel')"
            variant="outlined"
            color="primary"
            bg-color="surface"
            prepend-inner-icon="mdi-card-account-details-outline"
            :error="!!formError"
            :error-messages="formError"
            autocomplete="off"
            single-line
            @input="validateStudentId"
            class="mb-2"
          />

          <v-expand-transition>
            <v-alert
              v-if="serverMessage"
              type="error"
              variant="tonal"
              density="compact"
              class="mb-4 text-body-2"
              icon="mdi-alert-circle"
            >
              {{ serverMessage }}
            </v-alert>
          </v-expand-transition>

          <v-btn
            block
            color="primary"
            size="x-large"
            height="56"
            class="mt-4 text-capitalize font-weight-bold"
            rounded="lg"
            :loading="submitting"
            :disabled="!canSubmit"
            elevation="2"
            @click="saveStudentInfo"
          >
            {{ t('examSystem.welcome.startButton') }}
            <v-icon end class="ml-2">mdi-arrow-right</v-icon>
          </v-btn>
        </v-form>
      </v-card-text>

      <v-card-actions class="justify-center pb-6 pt-0">
        <div class="d-flex align-center text-caption text-disabled">
          <v-icon size="14" class="mr-1">mdi-information-outline</v-icon>
          {{ t('examSystem.welcome.helpText') }}
        </div>
      </v-card-actions>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { router } from '../router';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const studentId = ref('');
const formError = ref('');
const serverMessage = ref('');
const submitting = ref(false);

const testInfo = ref<{
  testTitle: string;
  description: string;
  testTime: number;
}>({
  testTitle: '',
  description: '',
  testTime: 0,
});

const validateStudentId = () => {
  serverMessage.value = '';
  if (!studentId.value) {
    formError.value = t('examSystem.welcome.errors.empty');
    return;
  }
  formError.value = '';
};

const canSubmit = computed(() => {
  return !!studentId.value && !formError.value && !submitting.value;
});

const saveStudentInfo = async () => {
  validateStudentId();
  if (!canSubmit.value) return;

  submitting.value = true;
  serverMessage.value = '';

  try {
    const re = await window.api.store.updateStudentInformation({
      studentID: studentId.value,
    });

    if (re.success) {
      router.push('/TestPage');
    } else {
      serverMessage.value = t('examSystem.welcome.errors.saveFailed');
    }
  } catch (e) {
    console.error(e);
    serverMessage.value = t('examSystem.welcome.errors.unexpected');
  } finally {
    submitting.value = false;
  }
};

onMounted(async () => {
  if (window.api?.store) {
    const isStudentVerified = await window.api.store.isStudentInfoVerified();
    if (isStudentVerified) {
      router.push('/TestPage');
      return;
    }

    const info = await window.api.store.getTestInfo();
    testInfo.value.testTitle = info.testTitle;
    testInfo.value.description = info.description;
    testInfo.value.testTime = info.testTime;
  }
});
</script>

<style scoped>
.header-bg {
  background: linear-gradient(to bottom, rgba(var(--v-theme-primary), 0.05), transparent);
}

.text-truncate-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>