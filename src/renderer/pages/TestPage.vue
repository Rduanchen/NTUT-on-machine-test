<template>
  <v-container>
    <v-btn @click="stopTestCase" class="">Force Stop Test Case</v-btn>

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
            <v-chip>{{ item.status }}</v-chip>
          </td>

          <td>
            <v-dialog>
              <template v-slot:activator="{ props: activatorProps }">
                <v-btn v-bind="activatorProps" color="surface-variant" text>{{
                  item.passRate || "N/A"
                }}</v-btn>
              </template>

              <template v-slot:default="{ isActive }">
                <v-card :title="`詳細通過率 for ${item.name}`">
                  <ResultTableCard :result="yourResultObj" />

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
                      @click="
                        selectedFile = undefined;

                        isActive.value = false;
                      "
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
import { ref, onMounted } from "vue";

import { VFileUpload } from "vuetify/labs/VFileUpload";

import ResultTableCard from "../components/TestCaseResult.vue";

const puzzleInfo = ref([]);

const selectedFile = ref<File | File[] | undefined>(undefined);

onMounted(async () => {
  // 從主進程獲取題目資訊
  puzzleInfo.value = await window.api.store.getPuzzleInfo();
});

const submitUpload = (puzzleId: string, isActive: { value: boolean }) => {
  // 檢查是否有選定的單個檔案

  if (selectedFile.value instanceof File) {
    // uploadFileToJudge(puzzleId, selectedFile.value);

    window.api.judger.judge(puzzleId, selectedFile.value);

    console.log(
      `Uploading file for puzzle ${puzzleId}: ${selectedFile.value.name}`
    );
  } else {
    // 處理沒有選擇檔案或多個檔案的情況

    console.log(`Upload cancelled or file is missing for puzzle ${puzzleId}.`);
  }

  // 重置 selectedFile 並關閉對話框

  selectedFile.value = undefined;

  isActive.value = false;
};

const stopTestCase = () => {
  //   window.api.testEnv.stopCurrentTestCase();

  console.log("Stop test case invoked");
};
</script>
