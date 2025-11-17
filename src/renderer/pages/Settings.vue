<template>
  <v-container class="pa-4 d-flex justify-center" fluid>
    <v-card min-width="700" class="pa-4 mb-4" outlined>
      <v-row>
        <v-col cols="6" class="mb-4">
          <h2 class="my-3">設定</h2>
          <v-text-field
            label="伺服器主機連結"
            v-model="serverHost"
            @input="checkConfigCompletion()"
          ></v-text-field>
          {{ serverStatus }}
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
        <v-btn
          v-if="isConfigCompleted"
          :disabled="!isConfigCompleted"
          color="primary"
          >開始考試</v-btn
        >
        <v-spacer></v-spacer>
      </v-row>
      <v-row>
        <v-btn block>儲存設定</v-btn>
      </v-row>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
import { get } from "node:http";
import { ref, computed } from "vue";
import { VFileUpload } from "vuetify/labs/VFileUpload";

const darkMode = ref(false);
const serverHost = ref("");
const selectedFile = ref<File | undefined>(undefined);
const serverStatus = ref("disconnected");

const toggleDarkMode = () => {
  darkMode.value = !darkMode.value;
  // 這裡可以加入切換深色模式的邏輯，例如修改 CSS 變數或切換主題
};

const uploadConfigFile = (file: File) => {
  // 處理上傳設定檔案的邏輯
  console.log("上傳的設定檔案:", file);
  checkConfigCompletion();
};

const getConfigFileFromServer = () => {
  serverStatus.value = window.api.config.getServerStatus();
  checkConfigCompletion();
};

const isConfigCompleted = ref(false);

const checkConfigCompletion = () => {
  isConfigCompleted.value = true;
  getConfigFileFromServer();
  //   isConfigCompleted.value = serverHost.value !== "" && selectedFile.value !== undefined;
};
</script>
