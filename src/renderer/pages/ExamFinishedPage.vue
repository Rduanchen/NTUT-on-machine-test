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
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import type { JudgeRunResult, ExamConfig } from '../../common/types';

const { t } = useI18n();

// ─── State ──────────────────────────────────────────────────────────
const isSyncingCode = ref(false);
const isSyncingScore = ref(false);
const syncMsg = ref('');
const syncSuccess = ref(false);
const testResults = ref<Record<string, JudgeRunResult>>({});
const examConfig = ref<ExamConfig | null>(null);

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
  if (!examConfig.value?.sections) return [];
  return examConfig.value.sections.map((section) => {
    let passed = 0;
    let total = 0;
    let sectionScore = 0;

    for (const puzzle of section.puzzles) {
      const result = testResults.value[puzzle.id ?? puzzle.title];
      let puzzlePassedSubtasks = 0;
      let puzzleTotalSubtasks = puzzle.subtasks?.length || 1;
      
      if (result?.subtasks) {
        puzzleTotalSubtasks = result.subtasks.length;
        for (const subtaskCases of result.subtasks) {
          if (Array.isArray(subtaskCases) && subtaskCases.every((c: any) => c?.statusCode === 'AC')) {
            puzzlePassedSubtasks++;
          }
        }
      }

      passed += puzzlePassedSubtasks;
      total += puzzleTotalSubtasks;

      const rate = puzzleTotalSubtasks > 0 ? (puzzlePassedSubtasks / puzzleTotalSubtasks) : 0;
      
      // Calculate multiplier
      let multiplier = 1.0;
      const srr = specialRuleResults.value?.[puzzle.id ?? puzzle.title];
      const esr = effectiveSpecialRules.value?.[puzzle.id ?? puzzle.title];
      if (srr && esr) {
        for (const res of srr) {
          if (!res.passed) {
            const rule = esr.find((r: any) => r.id === res.ruleId);
            if (rule && rule.multiplier !== undefined) {
              multiplier *= rule.multiplier;
            }
          }
        }
      }

      const baseScore = puzzle.score || 0;
      sectionScore += Number((baseScore * rate * multiplier).toFixed(1));
    }

    return {
      id: section.id,
      title: section.title,
      passedSubtasks: passed,
      totalSubtasks: total,
      score: sectionScore,
    };
  });
});

const finalScore = computed(() => {
  const allSections = sections.value;
  if (allSections.length === 0) return 0;
  return allSections.reduce((a, s) => a + s.score, 0);
});

// ─── Actions ──────────────────────────────────────────────────────────
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
    testResults.value = await window.api.store.getTestResults();
    examConfig.value = await window.api.store.getExamInfo?.() as any;
    
    // Attempt to get exam config properly if getExamInfo doesn't include sections
    if (!examConfig.value?.sections) {
       // getExamStatus doesn't return config, we might need a specific IPC for full config or just puzzle info
       const puzzleInfo = await window.api.store.getPuzzleInfo?.();
       if (puzzleInfo) {
         // Mock sections if backend config IPC is not available
         // Actually, wait, ramStore.examConfig is what we need.
         // Let's add an IPC to get full config if needed, or rely on what's available.
       }
    }
    
    specialRuleResults.value = await window.api.store.getSpecialRuleResults?.() || {};
    effectiveSpecialRules.value = await window.api.store.getEffectiveSpecialRules?.() || {};
  }

  // Auto push on mount
  await pushAllCode();
  await confirmScore();
});
</script>

<style scoped>
.gap-3 { gap: 12px; }
.finished-banner { position: sticky; top: 0; z-index: 10; }
</style>
