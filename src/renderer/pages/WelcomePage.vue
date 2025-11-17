<template>
  <v-container
    class="d-flex justify-center align-center h-100"
    fluid
    fill-height
  >
    <v-card min-width="500" min-height="400" class="pa-4">
      <v-card-title>{{ testInfo.testTitle }}</v-card-title>
      <v-text-field
        label="請輸入學號"
        v-model="studentId"
        @input="checkConfigCompletion()"
      ></v-text-field>
      <v-card-text>{{ testInfo.messeage }}</v-card-text>
      <v-btn block>開始測驗</v-btn>
    </v-card>
  </v-container>
</template>
<script setup lang="ts">
import { ref } from "vue";
const studentId = ref("");
const checkConfigCompletion = () => {
  // 可以在這裡加入檢查學號格式的邏輯
};

const testInfo = ref({
  testTitle: "北科大114 學年度計算機程式設計期中考",
  description: `the test will be start at 18:00 and end at 20:00`,
});
</script>
