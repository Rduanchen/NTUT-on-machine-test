<template>
  <v-container class="d-flex justify-center align-center h-100" fluid fill-height>
    <v-card min-width="500" min-height="400" class="pa-4">
      <v-card-title>{{ testInfo.testTitle }}</v-card-title>
      <v-text-field
        label="請輸入學號"
        v-model="studentId"
        @input="checkConfigCompletion()"
      ></v-text-field>
      <v-card-text>{{ testInfo.description }}</v-card-text>
      <v-btn block @click="saveStudentInfo">開始測驗</v-btn>
    </v-card>
  </v-container>
</template>
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { router } from '../router';
const studentId = ref('');
const checkConfigCompletion = () => {};
const testInfo = ref<{
  testTitle: string;
  description: string;
  testTime: number;
}>({
  testTitle: '',
  description: '',
  testTime: 0
});

const saveStudentInfo = async () => {
  let re = await window.api.store.updateStudentInformation({ studentID: studentId.value });
  console.log('Save Student Info Result:', re);
  if (re.success) {
    router.push('/TestPage');
  } else {
    alert('儲存失敗，請重試');
  }
};

onMounted(async () => {
  const info = await window.api.store.getTestInfo();
  testInfo.value.testTitle = info.testTitle;
  testInfo.value.description = info.description;
  testInfo.value.testTime = info.testTime;
  console.log('Test Info:', info);
});
</script>
