<template>
  <v-alert
    :type="
      state.hasUsablePaper
        ? 'success'
        : state.status === 'ERROR' || unavailable
          ? 'warning'
          : 'info'
    "
    variant="tonal"
    density="compact"
    class="mb-4 text-left"
    role="status"
    aria-live="polite"
  >
    <div>
      {{
        t(
          state.hasUsablePaper
            ? 'paperPreparation.ready'
            : `paperPreparation.${state.status.toLowerCase()}`
        )
      }}
    </div>
    <div v-if="state.status === 'ERROR'" class="text-caption mt-1">
      {{
        t(state.hasUsablePaper ? 'paperPreparation.updateFailed' : 'paperPreparation.failedHint')
      }}
    </div>
    <div v-if="unavailable" class="text-caption mt-1">{{ t('paperPreparation.retryFailed') }}</div>
    <v-btn
      v-if="state.status === 'ERROR' || state.status === 'IDLE' || unavailable"
      size="small"
      variant="text"
      class="mt-2"
      :loading="retrying"
      :disabled="retrying || state.status === 'FETCHING'"
      @click="retry"
      >{{ t('paperPreparation.retry') }}</v-btn
    >
  </v-alert>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { usePaperPreparation } from '../composables/usePaperPreparation';
const { t } = useI18n();
const { state, retrying, unavailable, retry } = usePaperPreparation();
</script>
