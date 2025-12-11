<template>
  <v-container fluid class="pa-4 pa-md-6 h-100">
    <v-card class="h-100 d-flex flex-column" elevation="2" rounded="lg">
      <!-- Toolbar -->
      <div class="px-4 py-3 border-b d-flex flex-wrap align-center gap-2 bg-surface">
        <div class="d-flex align-center flex-grow-1">
          <h2 class="text-h6 font-weight-bold mr-4">{{ t('examSystem.title') }}</h2>
          <v-chip size="small" variant="tonal" color="primary" class="font-weight-medium">
            {{ t('examSystem.puzzles.summary', { count: puzzleInfo.length }) }}
          </v-chip>
        </div>

        <div class="d-flex align-center gap-2">
          <v-btn
            color="error"
            variant="tonal"
            prepend-icon="mdi-stop-circle-outline"
            @click="stopTestCase"
            height="40"
          >
            {{ t('examSystem.puzzles.forceStop') }}
          </v-btn>

          <v-btn
            color="primary"
            variant="elevated"
            prepend-icon="mdi-folder-zip-outline"
            @click="outputToZip"
            height="40"
          >
            {{ t('examSystem.puzzles.exportZip') }}
          </v-btn>
          <v-dialog max-width="400">
            <template #activator="{ props: activatorProps }">
              <v-btn
                v-bind="activatorProps"
                color="primary"
                variant="elevated"
                prepend-icon="mdi-folder-zip-outline"
                height="40"
              >
                {{ t('examSystem.puzzles.finisheTheExam.label') }}
              </v-btn>
            </template>

            <template v-slot:default="{ isActive }">
              <v-card title="Dialog">
                <v-card-text>
                  <text>{{ t('examSystem.puzzles.finisheTheExam.finisheTheExamIntro') }}</text>
                  <v-spacer></v-spacer>
                  <v-btn
                    color="primary"
                    class="mt-2"
                    variant="elevated"
                    prepend-icon="mdi-folder-zip-outline"
                    @click="outputToZip"
                    height="40"
                  >
                    {{ t('examSystem.puzzles.exportZip') }}
                  </v-btn>
                  <v-spacer></v-spacer>
                  <v-btn
                    color="primary"
                    class="mt-2"
                    variant="elevated"
                    prepend-icon="mdi-folder-zip-outline"
                    @click="syncScoreToBackend"
                    height="40"
                  >
                    {{ t('examSystem.puzzles.finisheTheExam.updateResult') }}
                  </v-btn>
                  <v-btn
                    color="primary"
                    class="mt-2"
                    variant="elevated"
                    prepend-icon="mdi-folder-zip-outline"
                    @click="syncCodeToBackend"
                    height="40"
                  >
                    {{ t('examSystem.puzzles.finisheTheExam.updateFile') }}
                  </v-btn>
                  <v-spacer></v-spacer>
                  <text>{{ t('examSystem.puzzles.finisheTheExam.end') }}</text>
                </v-card-text>
                <v-card-actions>
                  <v-spacer></v-spacer>

                  <v-btn text="Close Dialog" @click="isActive.value = false"></v-btn>
                </v-card-actions>
              </v-card>
            </template>
          </v-dialog>
        </div>
      </div>

      <!-- Table Container with Scroll -->
      <v-card-text class="pa-0 flex-grow-1 overflow-auto">
        <v-table density="comfortable" hover fixed-header class="h-100 text-body-2">
          <thead>
            <tr>
              <th
                class="text-left font-weight-bold text-uppercase text-medium-emphasis"
                style="width: 80px"
              >
                {{ t('examSystem.puzzles.headers.id') }}
              </th>
              <th class="text-left font-weight-bold text-uppercase text-medium-emphasis">
                {{ t('examSystem.puzzles.headers.name') }}
              </th>
              <th
                class="text-left font-weight-bold text-uppercase text-medium-emphasis"
                style="width: 100px"
              >
                {{ t('examSystem.puzzles.headers.language') }}
              </th>
              <th
                class="text-left font-weight-bold text-uppercase text-medium-emphasis"
                style="width: 140px"
              >
                {{ t('examSystem.puzzles.headers.status') }}
              </th>
              <th
                class="text-left font-weight-bold text-uppercase text-medium-emphasis"
                style="width: 100px"
              >
                {{ t('examSystem.puzzles.headers.passRate') }}
              </th>
              <th
                class="text-left font-weight-bold text-uppercase text-medium-emphasis"
                style="width: 120px"
              >
                {{ t('examSystem.puzzles.headers.upload') }}
              </th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="item in puzzleInfo" :key="item.id" class="transition-colors">
              <td class="font-weight-bold text-medium-emphasis">#{{ item.id }}</td>

              <td class="py-3">
                <div class="d-flex flex-column">
                  <span class="text-body-1 font-weight-medium text-high-emphasis">{{
                    item.name
                  }}</span>
                </div>
              </td>

              <td>
                <v-chip size="x-small" label class="font-weight-bold text-uppercase">
                  {{ item.language }}
                </v-chip>
              </td>

              <td>
                <v-chip
                  size="small"
                  :color="puzzleStatuses[String(item.id)]?.color"
                  variant="tonal"
                  class="font-weight-bold"
                >
                  <v-icon start size="14" v-if="onSent[String(item.id)]"
                    >mdi-loading mdi-spin</v-icon
                  >
                  {{
                    t(
                      puzzleStatuses[String(item.id)]?.i18nKey ||
                        'examSystem.puzzles.status.unknown'
                    )
                  }}
                </v-chip>
              </td>

              <td>
                <v-dialog scrollable max-width="900">
                  <template #activator="{ props: activatorProps }">
                    <div
                      v-bind="activatorProps"
                      class="cursor-pointer d-inline-flex align-center hover-scale"
                    >
                      <v-progress-circular
                        :model-value="getNumericRate(item.id)"
                        :color="puzzlePassRates[String(item.id)]?.color"
                        size="32"
                        width="3"
                        class="mr-2"
                        bg-color="grey-lighten-2"
                      >
                        <span class="text-caption font-weight-bold" style="font-size: 10px">
                          {{ getNumericRate(item.id) }}
                        </span>
                      </v-progress-circular>
                    </div>
                  </template>

                  <template #default="{ isActive }">
                    <v-card rounded="lg" class="d-flex flex-column" style="max-height: 85vh">
                      <v-card-title class="d-flex align-center py-3 px-4 border-b bg-surface">
                        <span class="text-h6 font-weight-bold">
                          {{ item.name }}
                        </span>
                        <v-spacer />
                        <v-btn icon variant="text" @click="isActive.value = false">
                          <v-icon>mdi-close</v-icon>
                        </v-btn>
                      </v-card-title>

                      <v-card-text class="pa-0 bg-background overflow-hidden d-flex flex-column">
                        <div class="pa-4 overflow-y-auto custom-scrollbar">
                          <ResultTableCard
                            v-if="testResult[String(item.id)]"
                            :result="testResult[String(item.id)]"
                          />
                          <div v-else class="text-center py-8 text-medium-emphasis">
                            <v-icon size="48" class="mb-2 opacity-50"
                              >mdi-clipboard-text-outline</v-icon
                            >
                            <div>{{ t('examSystem.judge.noResult') }}</div>
                          </div>
                        </div>
                      </v-card-text>
                    </v-card>
                  </template>
                </v-dialog>
              </td>

              <td>
                <v-dialog max-width="500">
                  <template #activator="{ props: activatorProps }">
                    <v-btn
                      v-bind="activatorProps"
                      color="primary"
                      variant="text"
                      size="small"
                      prepend-icon="mdi-upload"
                    >
                      {{ t('examSystem.puzzles.upload.button') }}
                    </v-btn>
                  </template>

                  <template #default="{ isActive }">
                    <v-card rounded="lg">
                      <v-card-title class="px-4 pt-4 pb-2 text-h6 font-weight-bold">
                        {{ t('examSystem.puzzles.upload.title', { name: item.name }) }}
                      </v-card-title>

                      <v-card-text class="px-4 py-2">
                        <p class="text-body-2 text-medium-emphasis mb-4">
                          {{
                            t(
                              'examSystem.puzzles.upload.description',
                              'Please select your source code file to upload.'
                            )
                          }}
                        </p>
                        <v-file-upload
                          v-model="selectedFile"
                          :multiple="false"
                          density="default"
                          variant="outlined"
                          prepend-icon="mdi-file-code-outline"
                          :label="t('examSystem.puzzles.upload.label')"
                          clearable
                          show-size
                        />
                      </v-card-text>

                      <v-card-actions class="px-4 pb-4 pt-2">
                        <v-spacer />
                        <v-btn variant="text" @click="onUploadCancel(isActive)">
                          {{ t('examSystem.common.cancel') }}
                        </v-btn>
                        <v-btn
                          color="primary"
                          variant="elevated"
                          :disabled="!selectedFile"
                          @click="submitUpload(item.id, isActive)"
                        >
                          {{ t('examSystem.puzzles.upload.confirm') }}
                        </v-btn>
                      </v-card-actions>
                    </v-card>
                  </template>
                </v-dialog>
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { VFileUpload } from 'vuetify/labs/VFileUpload';
import { useI18n } from 'vue-i18n';
import ResultTableCard from '../components/TestCaseResult.vue';

const { t } = useI18n();

interface StatusInfo {
  text: string;
  color: string;
  i18nKey?: string;
}

const puzzleInfo = ref<{ id: string | number; name: string; language: string }[]>([]);
const testResult = ref<Record<string, any>>({});
const selectedFile = ref<File | undefined>(undefined);
const onSent = ref<Record<string, boolean>>({});

// ... (保留原有的狀態計算邏輯不變)
// 為了節省篇幅，重複邏輯未修改部分省略，請確保 puzzleStatuses, puzzlePassRates, onMounted 等邏輯與原檔一致

// 新增 Helper
const getNumericRate = (id: string | number): number => {
  const result = testResult.value[String(id)];
  if (!result || !result.testCaseAmount) return 0;
  return Math.round((result.correctCount / result.testCaseAmount) * 100);
};

// 狀態計算
const puzzleStatuses = computed<Record<string, StatusInfo>>(() => {
  const statuses: Record<string, StatusInfo> = {};
  for (const puzzle of puzzleInfo.value) {
    const puzzleId = String(puzzle.id);
    const result = testResult.value[puzzleId];

    if (onSent.value[puzzleId]) {
      statuses[puzzleId] = {
        text: '',
        color: 'info',
        i18nKey: 'examSystem.puzzles.status.testing'
      };
      continue;
    }

    if (!result || typeof result.correctCount !== 'number') {
      statuses[puzzleId] = {
        text: '',
        color: 'grey',
        i18nKey: 'examSystem.puzzles.status.notSubmitted'
      };
      continue;
    }

    const { correctCount, testCaseAmount } = result;
    if (testCaseAmount === 0 || correctCount === testCaseAmount) {
      statuses[puzzleId] = {
        text: '',
        color: 'success',
        i18nKey: 'examSystem.puzzles.status.completed'
      };
    } else if (correctCount > 0) {
      statuses[puzzleId] = {
        text: '',
        color: 'warning',
        i18nKey: 'examSystem.puzzles.status.partial'
      };
    } else {
      statuses[puzzleId] = {
        text: '',
        color: 'error',
        i18nKey: 'examSystem.puzzles.status.failed'
      };
    }
  }
  return statuses;
});

const puzzlePassRates = computed<Record<string, StatusInfo>>(() => {
  // ... (保留原始邏輯)
  const rates: Record<string, StatusInfo> = {};
  for (const puzzle of puzzleInfo.value) {
    const puzzleId = String(puzzle.id);
    const result = testResult.value[puzzleId];
    if (!result || typeof result.correctCount !== 'number' || !result.testCaseAmount) {
      rates[puzzleId] = { text: 'N/A', color: 'grey-lighten-1' };
      continue;
    }
    const rate = Math.round((result.correctCount / result.testCaseAmount) * 100);
    let color = 'error';
    if (rate === 100) color = 'success';
    else if (rate > 0) color = 'warning';
    rates[puzzleId] = { text: `${rate}%`, color };
  }
  return rates;
});

onMounted(async () => {
  if (window.api?.store) {
    puzzleInfo.value = await window.api.store.getPuzzleInfo();
    window.api.judger.onJudgeComplete(async () => {
      await updateTestCaseResults();
    });
    await updateTestCaseResults();
  }
});

const updateTestCaseResults = async () => {
  if (window.api?.store) {
    testResult.value = await window.api.store.readTestResult();
    for (const puzzle of puzzleInfo.value) {
      if (onSent.value[puzzle.id]) {
        onSent.value[puzzle.id] = false;
      }
    }
  }
};

const submitUpload = (puzzleId: string | number, isActive: { value: boolean }) => {
  if (selectedFile.value instanceof File && window.api?.judger) {
    window.api.judger.judge(String(puzzleId), selectedFile.value.path);
    onSent.value[String(puzzleId)] = true;
  }
  selectedFile.value = undefined;
  isActive.value = false;
};

const onUploadCancel = (isActive: { value: boolean }) => {
  selectedFile.value = undefined;
  isActive.value = false;
};

const stopTestCase = () => {
  if (window.api?.judger) window.api.judger.forceStop();
  onSent.value = {};
};

const syncCodeToBackend = async () => {
  try {
    if (window.api?.localProgram?.syncToBackend) {
      await window.api.localProgram.syncToBackend();
    } else {
      console.error('syncToBackend method not available');
    }
  } catch (error) {
    console.error('Error', error);
  }
};

const syncScoreToBackend = async () => {
  try {
    if (window.api?.judger?.syncScoreToBackend) {
      await window.api.judger.syncScoreToBackend();
    } else {
      console.error('syncScoreToBackend method not available');
    }
  } catch (error) {
    console.error('Error', error);
  }
};

const outputToZip = async () => {
  // ... (保留原始邏輯)
  try {
    if (!window.api?.localProgram) return;
    const zipDataBuffer = await window.api.localProgram.getZipFile();
    const studentInfo = await window.api.store.readStudentInformation();
    if (!zipDataBuffer) return;
    const blob = new Blob([zipDataBuffer], { type: 'application/zip' });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `${studentInfo.id}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.error('Error', error);
  }
};
</script>

<style scoped>
.gap-2 {
  gap: 8px;
}
.cursor-pointer {
  cursor: pointer;
}
.hover-scale {
  transition: transform 0.2s;
}
.hover-scale:hover {
  transform: scale(1.1);
}
/* 自定義滾動條 */
.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(128, 128, 128, 0.3);
  border-radius: 4px;
}
</style>
