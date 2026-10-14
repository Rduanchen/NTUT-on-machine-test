<template>
  <v-container fluid class="pa-4 pa-md-6 h-100">
    <v-alert
      v-if="pageError"
      type="error"
      variant="tonal"
      density="comfortable"
      class="mb-4"
      closable
      data-test="exam-page-error"
      @click:close="pageError = ''"
    >
      {{ pageError }}
    </v-alert>

    <v-alert
      v-else-if="puzzleInfo.length === 0"
      type="warning"
      variant="tonal"
      density="comfortable"
      class="mb-4"
      data-test="exam-paper-missing"
    >
      <div class="font-weight-medium mb-1">尚未取得考卷內容</div>
      <div class="text-body-2">
        本機已入場，但考卷還沒開啟。請按「重新取得考卷」；若仍為空白，請通知監考人員。
      </div>
      <template #append>
        <v-btn size="small" variant="tonal" :loading="isRecoveringPaper" @click="recoverPaper">
          重新取得考卷
        </v-btn>
      </template>
    </v-alert>

    <v-card class="h-100 d-flex flex-column" elevation="2" rounded="lg">
      <ExamToolbar
        :puzzle-count="puzzleInfo.length"
        :buffer-time-left="bufferTimeLeft"
        :is-buffering="isBuffering"
        @force-stop="stopTestCase"
        @export-zip="exportZip"
        @finish-exam="handleFinishExam"
      />
      <PuzzleTable
        :puzzles="puzzleInfo"
        :puzzle-statuses="puzzleStatuses"
        :puzzle-pass-rates="puzzlePassRates"
        :test-result="testResult"
        :highest-test-result="highestTestResult"
        :on-sent="onSent"
        :effective-special-rules="effectiveSpecialRules"
        :special-rule-results="specialRuleResults"
        :highest-special-rule-results="highestSpecialRuleResults"
        @open-result="openResultDialog"
        @upload="openUploadDialog"
      />
    </v-card>

    <ResultDialog
      v-model="resultDialog.isOpen"
      :item="resultDialog.item"
      :test-result="testResult"
      :highest-test-result="highestTestResult"
      :effective-special-rules="effectiveSpecialRules"
      :special-rule-results="specialRuleResults"
      :highest-special-rule-results="highestSpecialRuleResults"
    />
    <UploadDialog
      v-model="uploadDialog.isOpen"
      :puzzle="uploadDialog.item"
      @submit="submitUpload"
    />
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import ExamToolbar from '../components/TestPage/ExamToolbar.vue';
import PuzzleTable from '../components/TestPage/PuzzleTable.vue';
import ResultDialog from '../components/TestPage/ResultDialog.vue';
import UploadDialog from '../components/TestPage/UploadDialog.vue';
import type { PuzzleInfo, JudgeRunResult, SpecialRule, SpecialRuleResultRecord } from '../../common/types';
import { resolveFilePath } from '../utils/file-path';

// ─── State ──────────────────────────────────────────────────────────

const puzzleInfo = ref<PuzzleInfo[]>([]);
const testResult = ref<Record<string, JudgeRunResult>>({});
const highestTestResult = ref<Record<string, JudgeRunResult>>({});
const onSent = ref<Record<string, boolean>>({});
const specialRuleResults = ref<Record<string, SpecialRuleResultRecord[]>>({});
const highestSpecialRuleResults = ref<Record<string, SpecialRuleResultRecord[]>>({});
const effectiveSpecialRules = ref<Record<string, SpecialRule[]>>({});

/* Anything that went wrong at page level. An empty question list used to be
 * the only sign that the paper had not arrived — no message, no error, just a
 * blank exam. */
const pageError = ref('');

const resultDialog = ref({ isOpen: false, item: null as PuzzleInfo | null });
const uploadDialog = ref({ isOpen: false, item: null as PuzzleInfo | null });

/* The collection window lives in the shared module, not here. This page only
 * displays it: whether a machine may stay on /exam after the exam is over is
 * read by the router guard, and that answer cannot depend on which component
 * happens to be mounted. */
import { isBuffering, bufferTimeLeft } from '../constants/bufferState';
import { useRouter } from 'vue-router';
const router = useRouter();

// ─── Computed ───────────────────────────────────────────────────────

interface StatusInfo {
  text?: string;
  color: string;
  i18nKey?: string;
}

const puzzleStatuses = computed<Record<string, StatusInfo>>(() => {
  const statuses: Record<string, StatusInfo> = {};
  for (const puzzle of puzzleInfo.value) {
    const id = String(puzzle.id);
    const result = testResult.value[id];
    if (onSent.value[id]) {
      statuses[id] = { color: 'info', i18nKey: 'examSystem.puzzles.status.testing' };
      continue;
    }
    if (!result || typeof result.correctCount !== 'number') {
      statuses[id] = { color: 'grey', i18nKey: 'examSystem.puzzles.status.notSubmitted' };
      continue;
    }
    const { correctCount, totalCases } = result;
    if (totalCases === 0 || correctCount === totalCases) {
      statuses[id] = { color: 'success', i18nKey: 'examSystem.puzzles.status.completed' };
    } else if (correctCount > 0) {
      statuses[id] = { color: 'warning', i18nKey: 'examSystem.puzzles.status.partial' };
    } else {
      statuses[id] = { color: 'error', i18nKey: 'examSystem.puzzles.status.failed' };
    }
  }
  return statuses;
});

const puzzlePassRates = computed<Record<string, StatusInfo>>(() => {
  const rates: Record<string, StatusInfo> = {};
  for (const puzzle of puzzleInfo.value) {
    const id = String(puzzle.id);
    const result = testResult.value[id];
  // Pass rate is calculated by *subtask* (group), not raw testcase count.
  // A subtask is considered passed only if *all* its testcases are AC.
  if (!result || !Array.isArray(result.subtasks) || result.subtasks.length === 0) {
      rates[id] = { text: 'N/A', color: 'grey-lighten-1' };
      continue;
    }

  const totalSubtasks = result.subtasks.length;
  const passedSubtasks = result.subtasks.reduce((acc: number, subtaskCases: any) => {
    if (!Array.isArray(subtaskCases) || subtaskCases.length === 0) return acc;
    return subtaskCases.every((c: any) => c?.statusCode === 'AC') ? acc + 1 : acc;
  }, 0);

  const rate = Math.round((passedSubtasks / totalSubtasks) * 100);
    let color = 'error';
    if (rate === 100) color = 'success';
    else if (rate > 0) color = 'warning';
    rates[id] = { text: `${rate}%`, color };
  }
  return rates;
});

// ─── Actions ────────────────────────────────────────────────────────

async function refreshResults() {
  if (!window.api?.store) return;
  testResult.value = await window.api.store.getTestResults();
  highestTestResult.value = await window.api.store.getHighestTestResults();
  specialRuleResults.value = await window.api.store.getSpecialRuleResults();
  highestSpecialRuleResults.value = await window.api.store.getHighestSpecialRuleResults();
  for (const puzzle of puzzleInfo.value) {
    const id = String(puzzle.id);
    if (onSent.value[id]) onSent.value[id] = false;
  }
}

const isRecoveringPaper = ref(false);

/**
 * Ask the main process to fetch the exam key and open the paper again.
 *
 * The paper is normally opened when the phase turns to IN_PROGRESS. A machine
 * that re-enters mid-exam never sees that turn — the phase was already
 * IN_PROGRESS before it logged in — so it can end up holding the sealed halves
 * and nothing to open them with. This is the same idempotent action, on
 * demand.
 */
async function recoverPaper() {
  if (!window.api?.config?.ensurePaper) return;
  isRecoveringPaper.value = true;
  pageError.value = '';
  try {
    const res = await window.api.config.ensurePaper();
    if (!res?.success) {
      pageError.value = res?.error?.message || '無法取得考卷，請通知監考人員';
      return;
    }
    puzzleInfo.value = await window.api.store.getPuzzleInfo();
    await refreshResults();
    await refreshEffectiveRules();
  } finally {
    isRecoveringPaper.value = false;
  }
}

async function refreshEffectiveRules() {
  if (!window.api?.store?.getEffectiveSpecialRules) {
    effectiveSpecialRules.value = {};
    return;
  }
  effectiveSpecialRules.value = await window.api.store.getEffectiveSpecialRules();
}

function stopTestCase() {
  window.api?.judger?.forceStop();
  onSent.value = {};
}

async function submitUpload({ file, puzzleId }: { file: File; puzzleId: string }) {
  if (!(file instanceof File) || !window.api?.judger) return;

  pageError.value = '';

  /* `file.path` is gone in this Electron — the path comes across the preload
   * bridge now. Reading the old property handed the judger `undefined`, which
   * surfaced as a `paths[0]` type error with nothing pointing back here. */
  let filePath: string;
  try {
    filePath = resolveFilePath(file);
  } catch (error) {
    pageError.value = error instanceof Error ? error.message : String(error);
    return;
  }

  onSent.value[String(puzzleId)] = true;
  const result = await window.api.judger.judge(String(puzzleId), filePath);
  if (result.success) {
    await refreshResults();
  } else {
    pageError.value = result.error?.message || '評測失敗，請通知監考人員';
  }
  onSent.value[String(puzzleId)] = false;
}

async function exportZip() {
  if (!window.api?.judger) return;
  const zipBuffer = await window.api.judger.getZip();
  if (!zipBuffer) return;
  if (!window.api?.auth) return;
  const studentInfo = await window.api.auth.getStudentInfo();
  const blob = new Blob([zipBuffer as any], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${studentInfo.id}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function handleFinishExam() {
  if (window.api?.log) {
    await window.api.log.serverEvent('END_EXAM', '使用者主動結束考試');
  }
  // No need to sync results/code here because they were synced in the toolbar dialog
  router.push('/finished');
}

function openResultDialog(item: PuzzleInfo) {
  resultDialog.value = { isOpen: true, item };
}

function openUploadDialog(item: PuzzleInfo) {
  uploadDialog.value = { isOpen: true, item };
}

import { onBufferElapsed } from '../constants/bufferState';

// ─── Init ───────────────────────────────────────────────────────────

let resultsUnsubscribe: (() => void) | null = null;
let highestResultsUnsubscribe: (() => void) | null = null;
let rulesUnsubscribe: (() => void) | null = null;
let highestRulesUnsubscribe: (() => void) | null = null;
let configUnsubscribe: (() => void) | null = null;

onMounted(async () => {
  if (!window.api?.store) return;
  puzzleInfo.value = await window.api.store.getPuzzleInfo();
  await refreshResults();
  await refreshEffectiveRules();

  configUnsubscribe = window.api.store.onConfigUpdated?.(async () => {
    puzzleInfo.value = await window.api.store.getPuzzleInfo();
    await refreshEffectiveRules();
  }) || null;

  // Listen for test results pushed from main process after config_update rejudge
  resultsUnsubscribe = window.api.store.onTestResultsUpdated?.((results) => {
    testResult.value = results as Record<string, JudgeRunResult>;
  }) || null;

  highestResultsUnsubscribe = window.api.store.onHighestTestResultsUpdated?.((results: any) => {
    highestTestResult.value = results as Record<string, JudgeRunResult>;
  }) || null;

  rulesUnsubscribe = window.api.store.onSpecialRuleResultsUpdated?.((results: any) => {
    specialRuleResults.value = results as Record<string, SpecialRuleResultRecord[]>;
  }) || null;

  highestRulesUnsubscribe = window.api.store.onHighestSpecialRuleResultsUpdated?.((results: any) => {
    highestSpecialRuleResults.value = results as Record<string, SpecialRuleResultRecord[]>;
  }) || null;

  /* Where this page ends up when the window closes. The phase itself is
   * watched once, in App.vue — a page that decides for itself which phases are
   * worth reacting to is how a reset left a machine sitting on the exam screen
   * with the exam already wiped. */
  onBufferElapsed(() => {
    void router.push('/finished');
  });
});

import { onBeforeUnmount } from 'vue';
onBeforeUnmount(() => {
  onBufferElapsed(null);
  if (resultsUnsubscribe) resultsUnsubscribe();
  if (highestResultsUnsubscribe) highestResultsUnsubscribe();
  if (rulesUnsubscribe) rulesUnsubscribe();
  if (highestRulesUnsubscribe) highestRulesUnsubscribe();
  if (configUnsubscribe) configUnsubscribe();
});
</script>
