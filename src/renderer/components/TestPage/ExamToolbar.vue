<template>
  <div class="px-4 py-3 border-b d-flex flex-wrap align-center gap-2 bg-surface">
    <div class="d-flex align-center flex-grow-1">
      <h2 class="text-h6 font-weight-bold mr-4">{{ t('examSystem.title') }}</h2>
      <v-chip size="small" variant="tonal" color="primary" class="font-weight-medium">
        {{ t('examSystem.puzzles.summary', { count: puzzleCount }) }}
      </v-chip>
    </div>

    <div class="d-flex align-center ga-3">
      <v-btn
        color="error"
        variant="tonal"
        prepend-icon="mdi-stop-circle-outline"
        height="40"
        @click="$emit('force-stop')"
      >
        {{ t('examSystem.puzzles.forceStop') }}
      </v-btn>

      <v-btn
        color="primary"
        variant="elevated"
        prepend-icon="mdi-folder-zip-outline"
        height="40"
        @click="$emit('export-zip')"
      >
        {{ t('examSystem.puzzles.exportZip') }}
      </v-btn>

      <v-dialog max-width="700">
        <template #activator="{ props }">
          <v-btn
            v-bind="props"
            color="primary"
            variant="elevated"
            prepend-icon="mdi-check-outline"
            height="40"
          >
            {{ t('examSystem.puzzles.finisheTheExam.label') }}
          </v-btn>
        </template>

        <template #default="{ isActive }">
          <v-card class="pa-4" elevation="2" rounded="lg">
            <v-card-title class="font-weight-bold">
              {{ t('examSystem.puzzles.finisheTheExam.label') }}
            </v-card-title>
            <v-card-text>
              <p class="text-body-2">{{ t('examSystem.puzzles.finisheTheExam.finisheTheExamIntro') }}</p>
              <v-btn
                color="primary"
                class="mt-3"
                variant="elevated"
                prepend-icon="mdi-folder-zip-outline"
                height="40"
                @click="$emit('export-zip')"
              >
                {{ t('examSystem.puzzles.exportZip') }}
              </v-btn>
              <v-btn
                color="primary"
                class="mt-3"
                variant="elevated"
                prepend-icon="mdi-upload-circle-outline"
                height="40"
                @click="$emit('finish-actions')"
              >
                {{ t('examSystem.puzzles.finisheTheExam.updateResult') }} /
                {{ t('examSystem.puzzles.finisheTheExam.updateFile') }}
              </v-btn>
              <p class="text-body-2 mt-4">{{ t('examSystem.puzzles.finisheTheExam.end') }}</p>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn text @click="isActive.value = false">Close</v-btn>
            </v-card-actions>
          </v-card>
        </template>
      </v-dialog>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
defineProps<{ puzzleCount: number }>();
defineEmits(['force-stop', 'export-zip', 'finish-actions']);
const { t } = useI18n();
</script>