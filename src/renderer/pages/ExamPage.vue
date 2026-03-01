<template>
  <v-container fluid class="pa-4 pa-md-6 h-100">
    <v-card class="h-100 d-flex flex-column" elevation="2" rounded="lg">
      <ExamToolbar
        :puzzle-count="puzzleInfo.length"
        @force-stop="stopTestCase"
        @export-zip="exportZip"
        @finish-actions="handleFinish"
      />
      <PuzzleTable
        :puzzles="puzzleInfo"
        :puzzle-statuses="puzzleStatuses"
        :puzzle-pass-rates="puzzlePassRates"
        :test-result="testResult"
        :on-sent="onSent"
        @open-result="openResultDialog"
        @upload="openUploadDialog"
      />
    </v-card>

    <ResultDialog
      v-model="resultDialog.isOpen"
      :item="resultDialog.item"
      :test-result="testResult"
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
import type { PuzzleInfo, JudgeRunResult } from '../../common/types';

// ─── State ──────────────────────────────────────────────────────────

const puzzleInfo = ref<PuzzleInfo[]>([]);
const testResult = ref<Record<string, JudgeRunResult>>({});
const onSent = ref<Record<string, boolean>>({});

const resultDialog = ref({ isOpen: false, item: null as PuzzleInfo | null });
const uploadDialog = ref({ isOpen: false, item: null as PuzzleInfo | null });

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
    if (!result || typeof result.correctCount !== 'number' || !result.totalCases) {
      rates[id] = { text: 'N/A', color: 'grey-lighten-1' };
      continue;
    }
    const rate = Math.round((result.correctCount / result.totalCases) * 100);
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
  for (const puzzle of puzzleInfo.value) {
    const id = String(puzzle.id);
    if (onSent.value[id]) onSent.value[id] = false;
  }
}

function stopTestCase() {
  window.api?.judger?.forceStop();
  onSent.value = {};
}

async function submitUpload({ file, puzzleId }: { file: File; puzzleId: string }) {
  if (file instanceof File && window.api?.judger) {
    onSent.value[String(puzzleId)] = true;
    const result = await window.api.judger.judge(String(puzzleId), (file as any).path);
    if (result.success) {
      await refreshResults();
    }
    onSent.value[String(puzzleId)] = false;
  }
}

async function exportZip() {
  if (!window.api?.judger) return;
  const zipBuffer = await window.api.judger.getZip();
  if (!zipBuffer) return;
  const studentInfo = await window.api.auth.getStudentInfo();
  const blob = new Blob([zipBuffer], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${studentInfo.id}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function handleFinish() {
  await window.api?.judger?.syncResults();
  await window.api?.judger?.syncCode();
  await exportZip();
}

function openResultDialog(item: PuzzleInfo) {
  resultDialog.value = { isOpen: true, item };
}

function openUploadDialog(item: PuzzleInfo) {
  uploadDialog.value = { isOpen: true, item };
}

// ─── Init ───────────────────────────────────────────────────────────

onMounted(async () => {
  if (!window.api?.store) return;
  puzzleInfo.value = await window.api.store.getPuzzleInfo();
  await refreshResults();

  // Listen for test results pushed from main process after config_update rejudge
  window.api.store.onTestResultsUpdated?.((results) => {
    testResult.value = results as Record<string, JudgeRunResult>;
  });
});
</script>
