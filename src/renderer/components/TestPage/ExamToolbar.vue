<template>
  <div class="px-4 py-3 border-b d-flex flex-wrap align-center gap-2 bg-surface">
    <div class="d-flex align-center flex-grow-1">
      <h2 class="text-h6 font-weight-bold mr-4">{{ t('examSystem.title') }}</h2>
      <v-chip size="small" variant="tonal" color="primary" class="font-weight-medium mr-2">
        {{ t('examSystem.puzzles.summary', { count: puzzleCount }) }}
      </v-chip>
      
      <!-- Buffer Countdown Chip -->
      <v-chip
        v-if="isBuffering"
        color="error"
        variant="elevated"
        class="font-weight-bold pulse-chip"
        prepend-icon="mdi-timer-sand"
      >
        {{ t('examSystem.puzzles.bufferCountdown', { seconds: bufferTimeLeft }) }}
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

      <!-- Download Code Button (Always accessible) -->
      <v-btn
        color="primary"
        variant="elevated"
        prepend-icon="mdi-folder-zip-outline"
        height="40"
        @click="$emit('export-zip')"
      >
        {{ t('examSystem.puzzles.exportZip') }}
      </v-btn>

      <!-- Unified Finish Exam Flow Dialog -->
      <v-dialog v-model="isDialogActive" max-width="700" persistent>
        <template #activator="{ props }">
          <v-btn
            v-if="!isBuffering"
            v-bind="props"
            color="primary"
            variant="elevated"
            prepend-icon="mdi-check-outline"
            height="40"
            @click="startFinishFlow"
          >
            {{ t('examSystem.puzzles.finisheTheExam.label') }}
          </v-btn>
        </template>

        <v-card class="pa-4" elevation="2" rounded="lg">
          <v-card-title class="font-weight-bold">
            {{ t('examSystem.puzzles.finisheTheExam.label') }}
          </v-card-title>
          
          <v-card-text>
            <!-- Version Selection -->
            <div v-if="showSelection" class="py-4">
              <div class="text-subtitle-1 mb-4">{{ t('examSystem.puzzles.finisheTheExam.versionSelectTitle') }}</div>
              <v-radio-group v-model="selectedVersion" color="primary">
                <v-radio :label="t('examSystem.puzzles.finisheTheExam.versionCurrent')" value="current"></v-radio>
                <v-radio :label="t('examSystem.puzzles.finisheTheExam.versionHighest')" value="highest"></v-radio>
              </v-radio-group>
            </div>

            <!-- Loading State -->
            <div v-else-if="isLoading" class="d-flex flex-column align-center justify-center py-6">
              <v-progress-circular indeterminate color="primary" size="64" class="mb-6"></v-progress-circular>
              <div class="text-h6 mb-4">{{ t('examSystem.puzzles.finisheTheExam.syncing') || '評測與同步中...' }}</div>
              
              <v-list class="bg-transparent w-100" style="max-width: 320px;" density="compact">
                <v-list-item v-for="step in steps" :key="step.id" class="px-0">
                  <template #prepend>
                    <v-icon v-if="step.status === 'success'" color="success" class="mr-3">mdi-check-circle</v-icon>
                    <v-progress-circular v-else-if="step.status === 'running'" indeterminate size="18" width="2" color="primary" class="mr-3"></v-progress-circular>
                    <v-icon v-else-if="step.status === 'failed'" color="error" class="mr-3">mdi-close-circle</v-icon>
                    <v-icon v-else color="grey-lighten-1" class="mr-3">mdi-circle-outline</v-icon>
                  </template>
                  <v-list-item-title :class="{'text-medium-emphasis text-grey': step.status === 'waiting', 'font-weight-bold text-primary': step.status === 'running'}">
                    {{ step.name }}
                  </v-list-item-title>
                </v-list-item>
              </v-list>
            </div>

            <!-- Score Preview & Confirmation -->
            <div v-else-if="showPreview">
              <div class="text-center mb-4">
                <v-icon size="48" color="primary" class="mb-2">mdi-trophy-award</v-icon>
                <div class="text-h3 font-weight-black text-primary">{{ finalScore }}</div>
                <div class="text-caption text-medium-emphasis">/ 100 {{ t('finished.points') || '分' }}</div>
              </div>

              <!-- Sections Summary (simplified) -->
              <div v-if="sections.length > 0" class="mb-4">
                <div
                  v-for="section in sections"
                  :key="section.id"
                  class="d-flex justify-space-between align-center mb-2 px-4 py-2 bg-grey-lighten-4 rounded"
                >
                  <div>
                    <div class="text-body-2 font-weight-bold">{{ section.title }}</div>
                    <div class="text-caption">
                      {{ section.passedSubtasks }}/{{ section.totalSubtasks }} subtasks
                    </div>
                  </div>
                  <v-chip
                    :color="section.passedSubtasks === section.totalSubtasks ? 'success' : section.passedSubtasks > 0 ? 'warning' : 'error'"
                    size="small"
                  >
                    {{ section.score }}%
                  </v-chip>
                </div>
              </div>

              <v-alert type="info" variant="tonal" class="mt-4" icon="mdi-information">
                <div class="text-subtitle-2 font-weight-bold">{{ t('examSystem.puzzles.finisheTheExam.confirmWithTA') }}</div>
                <div class="text-body-2">{{ t('examSystem.puzzles.finisheTheExam.confirmWithTADesc') }}</div>
              </v-alert>
              
              <v-alert type="warning" variant="tonal" class="mt-4" icon="mdi-alert">
                <div class="text-subtitle-2 font-weight-bold">{{ t('examSystem.puzzles.finisheTheExam.confirmWarningTitle') }}</div>
                <div class="text-body-2">{{ t('examSystem.puzzles.finisheTheExam.confirmWarningDesc') }}</div>
              </v-alert>
            </div>
          </v-card-text>

          <v-card-actions>
            <v-spacer />
            <v-btn text :disabled="isLoading" @click="cancelDialog">{{ t('examSystem.common.cancel') || '取消' }}</v-btn>
            <v-btn
              v-if="showSelection"
              color="primary"
              variant="elevated"
              @click="startUploadFlow"
            >
              {{ t('examSystem.puzzles.finisheTheExam.startUpload') }}
            </v-btn>
            <v-btn
              v-else-if="!isLoading"
              color="error"
              variant="elevated"
              prepend-icon="mdi-flag-checkered"
              :disabled="countdown > 0"
              @click="confirmAndEndExam"
            >
              {{ t('examSystem.puzzles.finisheTheExam.confirmButton') }} <span v-if="countdown > 0">({{ countdown }})</span>
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { JudgeRunResult, ExamConfig } from '../../common/types';

defineProps<{ 
  puzzleCount: number,
  isBuffering?: boolean,
  bufferTimeLeft?: number
}>();
const emit = defineEmits(['force-stop', 'export-zip', 'finish-exam']);
const { t } = useI18n();

// ─── Finish Exam Flow State ───
const isDialogActive = ref(false);
const showSelection = ref(true);
const selectedVersion = ref('current');
const isLoading = ref(false);
const showPreview = ref(false);
const countdown = ref(5);
let countdownTimer: any = null;

const testResults = ref<Record<string, JudgeRunResult>>({});
const examConfig = ref<ExamConfig | null>(null);
const specialRuleResults = ref<Record<string, any>>({});
const effectiveSpecialRules = ref<Record<string, any>>({});

type StepStatus = 'waiting' | 'running' | 'success' | 'failed';

const stepStatuses = ref({
  rejudge: 'waiting' as StepStatus,
  uploadCode: 'waiting' as StepStatus,
  uploadScore: 'waiting' as StepStatus,
});

const steps = computed(() => [
  {
    id: 'rejudge',
    name: t('examSystem.puzzles.finisheTheExam.steps.rejudge') || '重新評測',
    status: stepStatuses.value.rejudge,
  },
  {
    id: 'uploadCode',
    name: t('examSystem.puzzles.finisheTheExam.steps.uploadCode') || '上傳程式',
    status: stepStatuses.value.uploadCode,
  },
  {
    id: 'uploadScore',
    name: t('examSystem.puzzles.finisheTheExam.steps.uploadScore') || '上傳分數',
    status: stepStatuses.value.uploadScore,
  },
]);

// ─── Score Computed ───
interface SectionSummary {
  id: string;
  title: string;
  passedSubtasks: number;
  totalSubtasks: number;
  score: number;
}

const sections = computed<SectionSummary[]>(() => {
  if (!examConfig.value) return [];
  
  const allPuzzles = examConfig.value.sections?.flatMap((s: any) => s.puzzles) ?? examConfig.value.puzzles ?? [];
  const rawSections = examConfig.value.sections || [];
  
  if (rawSections.length === 0 && examConfig.value.puzzles && examConfig.value.puzzles.length > 0) {
    rawSections.push({
      id: 'default',
      title: t('examSystem.puzzles.defaultSection'),
      puzzles: examConfig.value.puzzles
    });
  }

  return rawSections.map((section: any) => {
    let passed = 0;
    let total = 0;
    let sectionScore = 0;

    for (const puzzle of section.puzzles) {
      const puzzleIndexInAll = allPuzzles.findIndex((p: any) => p.id === puzzle.id && p.title === puzzle.title);
      const fallbackKey = puzzleIndexInAll !== -1 ? String(puzzleIndexInAll) : '';
      const puzzleKey = (puzzle.id && testResults.value[puzzle.id])
        ? puzzle.id
        : (testResults.value[fallbackKey] ? fallbackKey : (puzzle.id ?? puzzle.title ?? ''));

      const result = testResults.value[puzzleKey];
      let puzzlePassedSubtasks = 0;
      let puzzleTotalSubtasks = puzzle.subtasks?.length || 0;
      
      let puzzleScore = 0;
      
      if (puzzle.subtasks && puzzle.subtasks.length > 0) {
        for (let i = 0; i < puzzle.subtasks.length; i++) {
          const subtask = puzzle.subtasks[i];
          const subtaskResult = result?.subtasks?.[i];
          if (subtaskResult && Array.isArray(subtaskResult) && subtaskResult.every((c: any) => c?.statusCode === 'AC')) {
            puzzleScore += (subtask.score || 0);
            puzzlePassedSubtasks++;
          }
        }
      } else {
        if (result?.subtasks) {
          puzzleTotalSubtasks = result.subtasks.length;
          for (const subtaskCases of result.subtasks) {
            if (Array.isArray(subtaskCases) && subtaskCases.every((c: any) => c?.statusCode === 'AC')) {
              puzzlePassedSubtasks++;
            }
          }
        }
        const rate = puzzleTotalSubtasks > 0 ? (puzzlePassedSubtasks / puzzleTotalSubtasks) : 0;
        const baseScore = puzzle.score || 0;
        puzzleScore = baseScore * rate;
      }

      passed += puzzlePassedSubtasks;
      total += puzzleTotalSubtasks;

      let multiplier = 1.0;
      const srr = specialRuleResults.value?.[puzzleKey];
      const esr = effectiveSpecialRules.value?.[puzzleKey] || puzzle.specialRules || [];
      if (srr && esr) {
        for (const res of srr) {
          if (!res.passed) {
            const rule = esr.find((r: any) => r.id === res.ruleId) || examConfig.value?.globalSpecialRules?.find((r: any) => r.id === res.ruleId);
            if (rule && rule.multiplier !== undefined) {
              multiplier *= rule.multiplier;
            }
          }
        }
      }

      const finalPuzzleScore = Math.floor(puzzleScore * multiplier);
      sectionScore += finalPuzzleScore;
    }

    const cappedScore = (section.maxScore !== undefined && section.maxScore !== null && section.maxScore >= 0)
      ? Math.min(sectionScore, section.maxScore)
      : sectionScore;

    return {
      id: section.id,
      title: section.title,
      passedSubtasks: passed,
      totalSubtasks: total,
      score: cappedScore,
    };
  });
});

const finalScore = computed(() => {
  const allSections = sections.value;
  if (allSections.length === 0) return 0;
  return allSections.reduce((a, s) => a + s.score, 0);
});

// ─── Actions ───
function startFinishFlow() {
  isDialogActive.value = true;
  showSelection.value = true;
  isLoading.value = false;
  showPreview.value = false;
  selectedVersion.value = 'current';
  if (countdownTimer) clearInterval(countdownTimer);
}

function cancelDialog() {
  isDialogActive.value = false;
  if (countdownTimer) clearInterval(countdownTimer);
}

async function startUploadFlow() {
  showSelection.value = false;
  isLoading.value = true;
  showPreview.value = false;

  stepStatuses.value.rejudge = 'waiting';
  stepStatuses.value.uploadCode = 'waiting';
  stepStatuses.value.uploadScore = 'waiting';

  try {
    if (window.api?.store?.setUploadVersionPreference) {
      await window.api.store.setUploadVersionPreference(selectedVersion.value);
    }
    // 1. Recheck Code
    stepStatuses.value.rejudge = 'running';
    if (window.api?.judger?.rejudgeAll) {
      const res = await window.api.judger.rejudgeAll();
      if (res && res.success === false) {
        stepStatuses.value.rejudge = 'failed';
      } else {
        stepStatuses.value.rejudge = 'success';
      }
    } else {
      stepStatuses.value.rejudge = 'success';
    }

    // 2. Upload Code
    stepStatuses.value.uploadCode = 'running';
    if (window.api?.judger?.syncCode) {
      const res = await window.api.judger.syncCode();
      if (res && res.success === false) {
        stepStatuses.value.uploadCode = 'failed';
      } else {
        stepStatuses.value.uploadCode = 'success';
      }
    } else {
      stepStatuses.value.uploadCode = 'success';
    }

    // 3. Upload Score
    stepStatuses.value.uploadScore = 'running';
    if (window.api?.judger?.syncResults) {
      const res = await window.api.judger.syncResults();
      if (res && res.success === false) {
        stepStatuses.value.uploadScore = 'failed';
      } else {
        stepStatuses.value.uploadScore = 'success';
      }
    } else {
      stepStatuses.value.uploadScore = 'success';
    }

    // 4. Fetch latest data to show score
    if (window.api?.store) {
      const isHighest = selectedVersion.value === 'highest';
      if (isHighest && window.api.store.getHighestHiddenTestResults) {
        testResults.value = await window.api.store.getHighestHiddenTestResults();
      } else if (window.api.store.getHiddenTestResults) {
        testResults.value = await window.api.store.getHiddenTestResults();
      } else {
        testResults.value = await window.api.store.getTestResults();
      }

      if (window.api.store.getExamConfig) {
        examConfig.value = await window.api.store.getExamConfig();
      } else {
        examConfig.value = (await window.api.store.getExamInfo?.()) as any;
      }

      if (isHighest && window.api.store.getHighestSpecialRuleResults) {
        specialRuleResults.value = await window.api.store.getHighestSpecialRuleResults() || {};
      } else {
        specialRuleResults.value = await window.api.store.getSpecialRuleResults?.() || {};
      }
      effectiveSpecialRules.value = await window.api.store.getEffectiveSpecialRules?.() || {};
    }
  } catch (error) {
    console.error("Failed in finish exam flow:", error);
    if (stepStatuses.value.rejudge === 'running') stepStatuses.value.rejudge = 'failed';
    if (stepStatuses.value.uploadCode === 'running') stepStatuses.value.uploadCode = 'failed';
    if (stepStatuses.value.uploadScore === 'running') stepStatuses.value.uploadScore = 'failed';
  } finally {
    // Slight pause for smooth UI checklist step display
    await new Promise((resolve) => setTimeout(resolve, 800));
    isLoading.value = false;
    showPreview.value = true;

    // Start 5 second countdown for confirm button
    countdown.value = 5;
    countdownTimer = setInterval(() => {
      countdown.value--;
      if (countdown.value <= 0) {
        clearInterval(countdownTimer);
      }
    }, 1000);
  }
}

function confirmAndEndExam() {
  if (countdownTimer) clearInterval(countdownTimer);
  isDialogActive.value = false;
  emit('finish-exam');
}
</script>

<style scoped>
.pulse-chip {
  animation: pulse 1s infinite alternate;
}
@keyframes pulse {
  from { transform: scale(1); opacity: 1; }
  to { transform: scale(1.05); opacity: 0.9; }
}
</style>