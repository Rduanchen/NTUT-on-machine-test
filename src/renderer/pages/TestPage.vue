<template>
  <v-container fluid class="pa-4 pa-md-6 h-100">
    <v-card class="h-100 d-flex flex-column" elevation="2" rounded="lg">
      <ExamToolbar
        :puzzle-count="puzzleInfo.length"
        @force-stop="stopTestCase"
        @export-zip="outputToZip"
        @finish-actions="handleFinishActions"
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
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import ExamToolbar from '../components/TestPage/ExamToolbar.vue';
import PuzzleTable from '../components/TestPage/PuzzleTable.vue';
import ResultDialog from '../components/TestPage/ResultDialog.vue';
import UploadDialog from '../components/TestPage/UploadDialog.vue';
import { usePuzzles } from '../composables/usePuzzles';
import { useUpload } from '../composables/useUpload';
import { useSync } from '../composables/useSync';

const { t } = useI18n();

const {
  puzzleInfo,
  testResult,
  puzzleStatuses,
  puzzlePassRates,
  updateTestCaseResults,
  stopTestCase
} = usePuzzles();

const { onSent, submitUpload } = useUpload(updateTestCaseResults);
const { outputToZip, syncScoreToBackend, syncCodeToBackend } = useSync();

const resultDialog = ref({ isOpen: false, item: null as any });
const uploadDialog = ref({ isOpen: false, item: null as any });

const openResultDialog = (item: any) => {
  resultDialog.value = { isOpen: true, item };
};
const openUploadDialog = (item: any) => {
  uploadDialog.value = { isOpen: true, item };
};

const handleFinishActions = async () => {
  await outputToZip();
  await syncScoreToBackend();
  await syncCodeToBackend();
};

onMounted(updateTestCaseResults);
</script>