<template>
  <v-container fluid class="fill-height pa-4 pa-md-6 d-flex align-center justify-center">
    <v-card rounded="xl" elevation="4" class="pa-6 w-100" style="max-width: 720px">
      <div class="text-center mb-6">
        <div class="text-h6 mb-3">{{ t('finished.examEnded') }}</div>
        <div class="text-h3 font-weight-black text-primary">{{ formatScore(scoreSummary.total) }}</div>
        <div class="text-caption text-medium-emphasis">
          / {{ formatScore(scoreSummary.maxScore) }} {{ t('finished.points') }}
        </div>
      </div>

      <v-divider class="mb-4" />

      <div v-for="section in scoreSummary.sections" :key="section.id"
        class="d-flex justify-space-between align-center mb-3">
        <span class="text-body-1 font-weight-medium">{{ section.title }}</span>
        <span class="text-body-1 font-weight-bold">
          {{ formatScore(section.score) }} / {{ formatScore(section.maxScore ?? 0) }} {{ t('finished.points') }}
        </span>
      </div>

      <v-btn color="primary" size="large" rounded="lg" variant="tonal" block
        prepend-icon="mdi-folder-zip-outline" @click="downloadCode">
        {{ t('finished.downloadCode') }}
      </v-btn>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import type { JudgeRunResult, ExamConfig, SpecialRuleResultRecord } from '../../common/types';
import { formatScore, summarizeExamScore } from '../../common/exam-score';

const { t } = useI18n();
const testResults = ref<Record<string, JudgeRunResult>>({});
const examConfig = ref<ExamConfig | null>(null);
const specialRuleResults = ref<Record<string, SpecialRuleResultRecord[]>>({});
const scoreSummary = computed(() => summarizeExamScore(
  examConfig.value, testResults.value, specialRuleResults.value,
  t('examSystem.puzzles.defaultSection')
));

async function downloadCode() {
  if (!window.api?.judger) return;
  const zipBuffer = await window.api.judger.getZip();
  if (!zipBuffer) return;
  const studentInfo = await window.api.auth?.getStudentInfo();
  const blob = new Blob([zipBuffer as any], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${studentInfo?.id ?? 'code'}_backup.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

onMounted(async () => {
  if (window.api?.store) {
    const isHighest = await window.api.store.getUploadVersionPreference?.() === 'highest';
    testResults.value = isHighest
      ? await window.api.store.getHighestHiddenTestResults()
      : await window.api.store.getHiddenTestResults();
    specialRuleResults.value = isHighest
      ? await window.api.store.getHighestSpecialRuleResults()
      : await window.api.store.getSpecialRuleResults();
    examConfig.value = await window.api.store.getExamConfig();
  }

  // Keep the existing automatic upload while the finished page stays read only.
  await window.api?.judger?.syncCode?.();
  await window.api?.judger?.syncResults?.();
});
</script>
