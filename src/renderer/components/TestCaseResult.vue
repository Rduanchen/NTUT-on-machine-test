<template>
  <!-- 直接使用 props.result，並用 v-if 確保它不是空物件 -->
  <v-card v-if="result && Object.keys(result).length > 0" class="result">
    <v-card-title>
      判題結果　總通過: {{ result.correctCount }}/{{ result.testCaseAmount }}
    </v-card-title>
    <v-divider></v-divider>
    <v-card-text>
      <div v-for="group in result.groupResults" :key="group.id" class="mb-6">
        <v-card class="mb-2" outlined>
          <v-card-title>
            {{ group.title }}
            <v-chip class="mx-2" size="small" label>ID: {{ group.id }}</v-chip>
            <v-spacer></v-spacer>
            <span class="text-subtitle-1"
              >通過: {{ group.correctCount }}/{{ group.testCaseAmount }}</span
            >
          </v-card-title>
          <v-card-text>
            <v-data-table
              :headers="headers"
              :items="group.testCasesResults"
              class="elevation-1"
              density="compact"
            >
              <template v-slot:item.correct="{ item }">
                <v-chip :color="item.correct ? 'green' : 'red'" dark>
                  {{ item.correct ? "通過 (AC)" : "失敗 (WA)" }}
                </v-chip>
              </template>

              <template v-slot:item.userOutput="{ item }">
                <pre class="output-pre">{{ item.userOutput || "(測資隱藏)" }}</pre>
              </template>
            </v-data-table>
          </v-card-text>
        </v-card>
      </div>
    </v-card-text>
  </v-card>
  <!-- 如果沒有有效的 result 資料，可以顯示一個提示 -->
  <v-card v-else>
    <v-card-text>無有效的測試結果資料。</v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

// 定義傳入的 props
const props = defineProps({
  result: {
    type: Object,
    // 雖然父元件用了 v-if, 但這裡保留 required 也是好的實踐
    required: true, 
  },
});

// 使用 watch 可以在開發時方便地觀察 prop 的變化
watch(() => props.result, (newVal) => {
  console.log("Result prop in child component updated: ", newVal);
}, { immediate: true });


// data-table 的表頭定義
const headers = ref([
  { title: "測試案例 ID", key: "id", sortable: false, width: '15%' },
  { title: "結果", key: "correct", sortable: false, width: '15%' },
  { title: "您的輸出", key: "userOutput", sortable: false },
]);
</script>

<style scoped>
.result {
  width: 100%;
  max-height: 80vh; /* 增加最大高度以支援滾動 */
  overflow-y: auto;
}

.output-pre {
  white-space: pre-wrap; /* 自動換行 */
  word-break: break-all; /* 打斷長字串 */
  margin: 0;
  font-family: monospace;
}
</style>