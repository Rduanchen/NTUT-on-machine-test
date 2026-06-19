<template>
  <v-container fluid class="fill-height pa-4 pa-md-6">
    <!-- Finished Banner -->
    <div class="finished-banner mb-4">
      <v-sheet
        class="d-flex align-center justify-center pa-4 rounded-xl"
        color="error"
        elevation="2"
      >
        <v-icon size="28" class="mr-3">mdi-flag-checkered</v-icon>
        <div>
          <div class="text-h6 font-weight-bold">{{ t('finished.banner') }}</div>
          <div class="text-caption opacity-80">{{ t('finished.bannerSub') }}</div>
        </div>
        <v-spacer />
        <v-chip color="white" text-color="error" variant="elevated" class="font-weight-bold">
          {{ t('finished.examEnded') }}
        </v-chip>
      </v-sheet>
    </div>

    <v-row>
      <!-- Left: Score Summary -->
      <v-col cols="12" md="4">
        <v-card rounded="xl" elevation="4" class="pa-6 h-100">
          <div class="text-center mb-6">
            <v-icon size="52" color="primary" class="mb-2">mdi-trophy-award</v-icon>
            <div class="text-h3 font-weight-black text-primary">{{ finalScore }}</div>
            <div class="text-caption text-medium-emphasis">/ 100 {{ t('finished.points') }}</div>
          </div>

          <v-divider class="mb-4" />

          <!-- Per-section scores -->
          <div v-if="sections.length > 0">
            <div
              v-for="section in sections"
              :key="section.id"
              class="d-flex justify-space-between align-center mb-3"
            >
              <div>
                <div class="text-body-2 font-weight-medium">{{ section.title }}</div>
                <div class="text-caption text-medium-emphasis">
                  {{ section.passedSubtasks }}/{{ section.totalSubtasks }} {{ t('finished.subtasks') }}
                </div>
              </div>
              <v-chip
                :color="section.passedSubtasks === section.totalSubtasks ? 'success' : section.passedSubtasks > 0 ? 'warning' : 'error'"
                size="small"
                variant="flat"
              >
                {{ section.score }}%
              </v-chip>
            </div>
          </div>

          <!-- Warning -->
          <v-alert type="warning" variant="tonal" density="compact" class="mt-4" icon="mdi-alert">
            <div class="text-caption font-weight-medium">{{ t('finished.confirmWarning') }}</div>
          </v-alert>
        </v-card>
      </v-col>

      <!-- Right: Actions -->
      <v-col cols="12" md="8">
        <v-card rounded="xl" elevation="4" class="pa-6">
          <div class="text-h6 font-weight-bold mb-4">
            <v-icon class="mr-2" color="primary">mdi-check-all</v-icon>
            {{ t('finished.actionsTitle') }}
          </div>

          <!-- Upload Status -->
          <v-alert
            v-if="syncMsg"
            :type="syncSuccess ? 'success' : 'error'"
            variant="tonal"
            density="compact"
            class="mb-4"
            closable
            @click:close="syncMsg = ''"
          >
            {{ syncMsg }}
          </v-alert>

          <!-- Version Selection -->
          <div class="mb-4">
            <div class="text-subtitle-2 font-weight-bold mb-2">重新上傳版本選擇</div>
            <v-select
              v-model="selectedVersion"
              :items="[
                { title: '現在版（目前最後一次撰寫的程式碼）', value: 'current' },
                { title: '歷史最高分版（系統紀錄得分最高的版本）', value: 'highest' }
              ]"
              density="compact"
              variant="outlined"
              hide-details
              @update:model-value="updateVersionSelection"
            ></v-select>
            <div class="text-caption text-medium-emphasis mt-1">
              若想更改上傳版本，請選擇後再次點擊下方的「上傳程式」與「上傳分數」。
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="d-flex flex-column gap-3">
            <!-- 1. Push all code -->
            <v-btn
              color="primary"
              size="large"
              rounded="lg"
              variant="tonal"
              :loading="isSyncingCode"
              @click="pushAllCode"
              prepend-icon="mdi-cloud-upload-outline"
            >
              {{ t('finished.pushCode') }}
            </v-btn>

            <!-- 2. Confirm score -->
            <v-btn
              color="success"
              size="large"
              rounded="lg"
              variant="tonal"
              :loading="isSyncingScore"
              @click="confirmScore"
              prepend-icon="mdi-check-circle-outline"
            >
              {{ t('finished.confirmScore') }}
            </v-btn>

            <!-- 3. Download code zip -->
            <v-btn
              color="secondary"
              size="large"
              rounded="lg"
              variant="outlined"
              @click="downloadCode"
              prepend-icon="mdi-download-outline"
            >
              {{ t('finished.downloadCode') }}
            </v-btn>
          </div>

          <v-divider class="my-5" />

          <!-- TA Warning -->
          <v-card color="error" variant="tonal" rounded="lg" class="pa-4">
            <div class="d-flex align-start">
              <v-icon color="error" class="mr-3 mt-1">mdi-alert-octagon</v-icon>
              <div>
                <div class="text-subtitle-2 font-weight-bold mb-1">{{ t('finished.taWarningTitle') }}</div>
                <ul class="text-body-2 pl-4">
                  <li>{{ t('finished.taWarning1') }}</li>
                  <li>{{ t('finished.taWarning2') }}</li>
                  <li>{{ t('finished.taWarning3') }}</li>
                </ul>
              </div>
            </div>
          </v-card>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import type { JudgeRunResult, ExamConfig } from '../../common/types';

const { t } = useI18n();
const router = useRouter();

// ─── State ──────────────────────────────────────────────────────────
const selectedVersion = ref<'current' | 'highest'>('current');
const isSyncingCode = ref(false);
const isSyncingScore = ref(false);
const syncMsg = ref('');
const syncSuccess = ref(false);
const testResults = ref<Record<string, JudgeRunResult>>({});
const examConfig = ref<ExamConfig | null>(null);
let statusUnsubscribe: (() => void) | null = null;

// ─── Computed: sections summary ───────────────────────────────────────
interface SectionSummary {
  id: string;
  title: string;
  passedSubtasks: number;
  totalSubtasks: number;
  score: number;
}

const specialRuleResults = ref<Record<string, any>>({});
const effectiveSpecialRules = ref<Record<string, any>>({});

const sections = computed<SectionSummary[]>(() => {
  if (!examConfig.value) return [];
  
  const allPuzzles = examConfig.value.sections?.flatMap((s: any) => s.puzzles) ?? examConfig.value.puzzles ?? [];
  const rawSections = examConfig.value.sections || [];
  
  if (rawSections.length === 0 && examConfig.value.puzzles && examConfig.value.puzzles.length > 0) {
    rawSections.push({
      id: 'default',
      title: t('examSystem.puzzles.defaultSection'),
      maxScore: 0,
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

// ─── Actions ──────────────────────────────────────────────────────────
async function fetchScores() {
  if (!window.api?.store) return;
  const isHighest = selectedVersion.value === 'highest';
  if (isHighest && window.api.store.getHighestHiddenTestResults) {
    testResults.value = await window.api.store.getHighestHiddenTestResults();
  } else if (window.api.store.getHiddenTestResults) {
    testResults.value = await window.api.store.getHiddenTestResults();
  } else {
    testResults.value = await window.api.store.getTestResults();
  }

  if (isHighest && window.api.store.getHighestSpecialRuleResults) {
    specialRuleResults.value = await window.api.store.getHighestSpecialRuleResults() || {};
  } else {
    specialRuleResults.value = await window.api.store.getSpecialRuleResults?.() || {};
  }
}

async function updateVersionSelection(newVal: string) {
  if (window.api?.store?.setUploadVersionPreference) {
    await window.api.store.setUploadVersionPreference(newVal as any);
  }
  await fetchScores();
}

async function pushAllCode() {
  if (!window.api?.judger) return;
  isSyncingCode.value = true;
  syncMsg.value = '';
  try {
    const res = await window.api.judger.syncCode();
    syncSuccess.value = res?.success ?? false;
    syncMsg.value = res?.success ? t('finished.codePushSuccess') : (res?.error?.message || t('finished.codePushFailed'));
  } catch {
    syncSuccess.value = false;
    syncMsg.value = t('finished.codePushFailed');
  } finally {
    isSyncingCode.value = false;
  }
}

async function confirmScore() {
  if (!window.api?.judger) return;
  isSyncingScore.value = true;
  syncMsg.value = '';
  try {
    const res = await window.api.judger.syncResults();
    syncSuccess.value = res?.success ?? false;
    syncMsg.value = res?.success ? t('finished.scoreConfirmSuccess') : (res?.error?.message || t('finished.scoreConfirmFailed'));
  } catch {
    syncSuccess.value = false;
    syncMsg.value = t('finished.scoreConfirmFailed');
  } finally {
    isSyncingScore.value = false;
  }
}

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

// ─── Init ────────────────────────────────────────────────────────────
onMounted(async () => {
  if (window.api?.store) {
    if (window.api.store.getUploadVersionPreference) {
      selectedVersion.value = await window.api.store.getUploadVersionPreference() as 'current' | 'highest';
    }

    await fetchScores();

    if (window.api.store.getExamConfig) {
      examConfig.value = await window.api.store.getExamConfig();
    } else {
      examConfig.value = await window.api.store.getExamInfo?.() as any;
    }
    
    effectiveSpecialRules.value = await window.api.store.getEffectiveSpecialRules?.() || {};

    statusUnsubscribe = window.api.store.onExamStatusChanged?.((status: string) => {
      if (status === 'IN_PROGRESS') {
        router.push('/exam');
      } else if (status === 'NOT_STARTED') {
        router.push('/login');
      } else if (status === 'UNINITIALIZED') {
        router.push('/not-initialized');
      }
    }) || null;
  }

  // Auto push on mount
  await pushAllCode();
  await confirmScore();
});

onBeforeUnmount(() => {
  if (statusUnsubscribe) statusUnsubscribe();
});
</script>

<style scoped>
.gap-3 { gap: 12px; }
.finished-banner { position: sticky; top: 0; z-index: 10; }
</style>
