<template>
  <v-container class="pa-4 d-flex justify-center" fluid>
    <v-card min-width="700" class="pa-4 mb-4" outlined>
      <v-row>
        <v-col cols="6" class="mb-4">
          <h2 class="my-3">設定</h2>
          <v-text-field
            label="伺服器主機連結"
            v-model="serverHost"
          ></v-text-field>
          {{ serverStatus }}
          <v-spacer></v-spacer>
          {{ localConfigStatus }}
          <v-btn class="my-2" @click="verifyServerStatus()">驗證伺服器連線</v-btn>
          <v-btn class="my-2" v-if="isServerConnected" @click="getConfigFileFromServer()"
            >從伺服器取得設定檔案</v-btn>
        </v-col>
        <v-col cols="6" class="">
          <h2 class="my-3">上傳設定檔案</h2>
          <v-file-upload
            v-model="selectedFile"
            :multiple="false"
            density="default"
            @update:model-value="uploadConfigFile(selectedFile!)"
          ></v-file-upload>
        </v-col>
      </v-row>
      <v-row>
        <!-- <v-btn v-if="isConfigCompleted" :disabled="!isConfigCompleted" color="primary"
          >開始考試</v-btn
        > -->
        <v-spacer></v-spacer>
      </v-row>
      <v-row>
        <v-btn block>儲存設定</v-btn>
      </v-row>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { VFileUpload } from 'vuetify/labs/VFileUpload';
import { router } from '../router/index';

const darkMode = ref(false);
const serverHost = ref('');
const selectedFile = ref<File | undefined>(undefined);
const serverStatus = ref('disconnected');
const isServerConnected = ref(false);
const localConfigStatus = ref('');


onMounted(async () => {
  let isSetupComplete = await window.api.config.getIsConfigSetupComplete();
  console.log('Is Config Setup Complete:', isSetupComplete);
  if (isSetupComplete) {
    router.push('/Welcome');
  }
  localConfigStatus.value = await window.api.config.getLocalConfigStatus();
});

const toggleDarkMode = () => {
  darkMode.value = !darkMode.value;
  // 這裡可以加入切換深色模式的邏輯，例如修改 CSS 變數或切換主題
};

const uploadConfigFile = async (file: File) => {
  // 處理上傳設定檔案的邏輯
  console.log('上傳的設定檔案:', file);
  let re = await window.api.config.setJson(file.path);
  console.log(re);
  if (re.success) {
    alert('設定檔案上傳成功');
    router.push('/Welcome');
  } else {
    alert('設定檔案上傳失敗');
  }
  // checkConfigCompletion();
};

const verifyServerStatus = async () => {
  // 處理驗證伺服器連線的邏輯
  console.log('驗證伺服器連線:', serverHost.value);
  let re = await window.api.config.getServerStatus(serverHost.value);
  console.log(re);
  if (re.success) {
    alert('伺服器連線成功');
    serverStatus.value = 'connected';
    isServerConnected.value = true;
  } else {
    alert('伺服器連線失敗');
    serverStatus.value = 'disconnected';
    isServerConnected.value = false;
  }
};

const getConfigFileFromServer = async() => {
  let re = await window.api.config.getFromServer(serverHost.value);
  if (re.success) {
    alert('從伺服器取得設定檔案成功');
    router.push('/Welcome');
  } else {
    alert('從伺服器取得設定檔案失敗');
  }
};

const isConfigCompleted = ref(false);

// const checkConfigCompletion = () => {
//   isConfigCompleted.value = true;
//   getConfigFileFromServer();
//   //   isConfigCompleted.value = serverHost.value !== "" && selectedFile.value !== undefined;
// };
</script>
