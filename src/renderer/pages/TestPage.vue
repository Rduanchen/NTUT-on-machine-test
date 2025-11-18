<template>
  <v-container>
    <v-btn @click="stopTestCase" class="">Force Stop Test Case</v-btn>
    <v-btn @click="outputToZip" class="">Output to zip</v-btn>
    <v-table>
      <thead>
        <tr>
          <th class="text-left">編號</th>
          <th class="text-left">題目名稱</th>
          <th class="text-left">語言</th>
          <th class="text-left">狀態</th>
          <th class="text-left">通過率</th>
          <th class="text-left">上傳程式</th>
        </tr>
      </thead>

      <tbody>
        <tr v-for="item in puzzleInfo" :key="item.id">
          <td>#{{ item.id }}</td>
          <td>{{ item.name }}</td>
          <td>
            <v-chip>{{ item.language }}</v-chip>
          </td>
          <td>
            <!-- 【關鍵修改】: 直接從 computed 屬性中根據 item.id 獲取狀態 -->
            <v-chip :color="puzzleStatuses[item.id]?.color" variant="elevated">
              {{ puzzleStatuses[item.id]?.text }}
            </v-chip>
          </td>
          <td>
            <v-dialog>
              <template v-slot:activator="{ props: activatorProps }">
                <!-- 【關鍵修改】: PassRate 也改為從 computed 獲取 -->
                <v-btn
                  v-bind="activatorProps"
                  :color="puzzlePassRates[item.id]?.color"
                  variant="flat"
                  size="small"
                >
                  {{ puzzlePassRates[item.id]?.text }}
                </v-btn>
              </template>

              <template v-slot:default="{ isActive }">
                <v-card :title="`詳細通過率 for ${item.name}`">
                  <ResultTableCard v-if="testResult[item.id]" :result="testResult[item.id]" />
                  <v-card-text v-else class="text-center my-4">
                    尚無測試結果資料
                  </v-card-text>
                  <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn text="關閉" @click="isActive.value = false"></v-btn>
                  </v-card-actions>
                </v-card>
              </template>
            </v-dialog>
          </td>

          <td>
            <v-dialog max-width="500">
              <template v-slot:activator="{ props: activatorProps }">
                <v-btn
                  v-bind="activatorProps"
                  color="surface-variant"
                  text="上傳"
                  variant="flat"
                  size="small"
                ></v-btn>
              </template>

              <template v-slot:default="{ isActive }">
                <v-card :title="`上傳程式碼給 ${item.name}`">
                  <v-file-upload
                    v-model="selectedFile"
                    density="default"
                    :multiple="false"
                    browse-text="選擇單一檔案"
                    class="pa-4"
                  ></v-file-upload>

                  <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn
                      text="關閉及上傳"
                      color="primary"
                      @click="submitUpload(item.id, isActive)"
                      :disabled="!selectedFile"
                    ></v-btn>
                    <v-btn
                      text="取消上傳"
                      @click="selectedFile = undefined; isActive.value = false;"
                    ></v-btn>
                  </v-card-actions>
                </v-card>
              </template>
            </v-dialog>
          </td>
        </tr>
      </tbody>
    </v-table>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { VFileUpload } from "vuetify/labs/VFileUpload";
import ResultTableCard from "../components/TestCaseResult.vue";

interface StatusInfo {
  text: string;
  color: string;
}

const puzzleInfo = ref<{ id: string | number; name: string; language: string }[]>([]);
const testResult = ref<Record<string, any>>({});
const selectedFile = ref<File | undefined>(undefined);
const onSent = ref<Record<string, boolean>>({});

// 【新增】: 使用 computed 來計算所有題目的狀態
const puzzleStatuses = computed<Record<string, StatusInfo>>(() => {
  const statuses: Record<string, StatusInfo> = {};
  for (const puzzle of puzzleInfo.value) {
    const puzzleId = String(puzzle.id);
    const result = testResult.value[puzzleId];

    // 狀態 5: 測試中 (優先級最高)
    if (onSent.value[puzzleId]) {
      statuses[puzzleId] = { text: '測試中', color: 'info' };
      continue;
    }

    // 狀態 1: 未繳交
    if (!result || typeof result.correctCount !== 'number' || typeof result.testCaseAmount !== 'number') {
      statuses[puzzleId] = { text: '未繳交', color: 'grey' };
      continue;
    }

    const { correctCount, testCaseAmount } = result;

    // 處理 0 個測試案例的邊界情況
    if (testCaseAmount === 0) {
      statuses[puzzleId] = { text: '已完成', color: 'success' };
      continue;
    }
    
    // 狀態 2: 已完成
    if (correctCount === testCaseAmount) {
      statuses[puzzleId] = { text: '已完成', color: 'success' };
      continue;
    }

    // 狀態 3: 部分通過
    if (correctCount > 0) {
      statuses[puzzleId] = { text: '部分通過', color: 'warning' };
      continue;
    }
    
    // 狀態 4: 未通過
    statuses[puzzleId] = { text: '未通過', color: 'error' };
  }
  return statuses;
});

// 【新增】: 同樣為通過率創建 computed
const puzzlePassRates = computed<Record<string, StatusInfo>>(() => {
  const rates: Record<string, StatusInfo> = {};
  for (const puzzle of puzzleInfo.value) {
    const puzzleId = String(puzzle.id);
    const result = testResult.value[puzzleId];

    if (!result || typeof result.correctCount !== 'number' || !result.testCaseAmount) {
      rates[puzzleId] = { text: 'N/A', color: 'grey-lighten-1' };
      continue;
    }

    const { correctCount, testCaseAmount } = result;
    const rate = Math.round((correctCount / testCaseAmount) * 100);

    let color = '';
    if (rate === 100) {
      color = 'success';
    } else if (rate > 0) {
      color = 'warning';
    } else {
      color = 'error';
    }
    rates[puzzleId] = { text: `${rate}%`, color };
  }
  return rates;
});


onMounted(async () => {
  puzzleInfo.value = await window.api.store.getPuzzleInfo();
  
  for (const puzzle of puzzleInfo.value) {
    onSent.value[puzzle.id] = false;
  }
  
  window.api.judger.onJudgeComplete(async () => {
    await updateTestCaseResults();
  });
  await updateTestCaseResults();
});

const updateTestCaseResults = async () => {
  // 讀取新的結果
  testResult.value = await window.api.store.readTestResult();
  
  // 將所有 onSent 狀態重置為 false，因為評測已完成
  // 這裡需要小心，如果多個請求並行，可能會互相干擾
  // 一個更穩健的做法是只重置已完成的那個
  // 但根據您目前的邏輯，評測完成後全部重置是合理的
  for (const puzzle of puzzleInfo.value) {
    if (onSent.value[puzzle.id]) {
      console.log(`Test case results updated for puzzle ID: ${puzzle.id}, resetting 'onSent' flag.`);
      onSent.value[puzzle.id] = false;
    }
  }
};

const submitUpload = (puzzleId: string | number, isActive: { value: boolean }) => {
  if (selectedFile.value instanceof File) {
    window.api.judger.judge(String(puzzleId), selectedFile.value.path);
    // 這個改動會被 computed 捕捉到，並觸發 UI 更新
    onSent.value[String(puzzleId)] = true;
  }
  selectedFile.value = undefined;
  isActive.value = false;
};

const stopTestCase = () => {
  window.api.judger.forceStop();
  // 強制停止後，也應該重置 onSent 狀態
  Object.keys(onSent.value).forEach(key => {
    onSent.value[key] = false;
  });
  console.log("Stop test case invoked and all 'onSent' flags are reset.");
};

const outputToZip = async () => {
  try {
    // 1. 調用新的 API，獲取 Buffer 數據
    const zipDataBuffer = await window.api.localProgram.getZipFile(); // returns Buffer (as Uint8Array)

    if (!zipDataBuffer || zipDataBuffer.length === 0) {
      console.error("Failed to get zip data from main process.");
      return;
    }

    // 2. 在前端創建 Blob
    const blob = new Blob([zipDataBuffer], { type: "application/zip" });

    // 3. 在前端創建指向這個 Blob 的 URL
    const blobUrl = URL.createObjectURL(blob);

    // 4. 執行下載
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = "submission.zip";
    document.body.appendChild(link);
    link.click();

    // 5. 清理
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl); // 釋放內存

    console.log("Output to zip successful.");
  } catch (error) {
    console.error("Error during zip output:", error);
  }
};
</script>