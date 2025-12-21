<template>
  <v-container class="fill-height d-flex justify-center align-center pa-4 bg-background" fluid>
    <v-card
      class="config-card w-100 d-flex flex-column"
      max-width="900"
      max-height="90vh"
      elevation="2"
      rounded="lg"
    >
      <!-- Header: 固定在頂部 -->
      <div class="px-6 py-5 border-b flex-shrink-0">
        <div class="d-flex align-center">
          <v-avatar color="primary" variant="tonal" class="mr-4" rounded>
            <v-icon>mdi-cog</v-icon>
          </v-avatar>
          <div>
            <h2 class="text-h6 font-weight-bold">
              {{ t('examSystem.config.title') }}
            </h2>
            <div class="text-caption text-medium-emphasis">
              {{ t('examSystem.config.subtitle') }}
            </div>
          </div>
        </div>
      </div>

      <!-- Main Content: 可捲動區域 (Scrollable) -->
      <v-card-text class="px-6 py-6 flex-grow-1 overflow-y-auto">
        <v-row>
          <!-- Server settings -->
          <v-col cols="12" sm="6" class="pr-sm-4 border-e-sm border-b border-b-sm-0 pb-6 pb-sm-0">
            <h3 class="text-subtitle-1 font-weight-bold mb-4 d-flex align-center">
              <v-icon size="20" color="primary" class="mr-2">mdi-server-network</v-icon>
              {{ t('examSystem.config.server.title') }}
            </h3>

            <v-text-field
              v-model="serverHost"
              :label="t('examSystem.config.server.hostLabel')"
              variant="outlined"
              density="comfortable"
              placeholder="e.g., http://192.168.1.100:3000"
              bg-color="surface"
              hide-details="auto"
              class="mb-3"
            >
              <template #append-inner>
                <v-icon :color="serverStatus === 'connected' ? 'success' : 'grey'">
                  {{ serverStatus === 'connected' ? 'mdi-check-circle' : 'mdi-minus-circle' }}
                </v-icon>
              </template>
            </v-text-field>

            <div class="d-flex align-center mb-4 pl-1">
              <span class="text-caption text-medium-emphasis mr-2">
                {{ t('examSystem.serverStatusLabel') }}:
              </span>
              <span
                class="text-caption font-weight-bold"
                :class="serverStatus === 'connected' ? 'text-success' : 'text-error'"
              >
                {{ t(`examSystem.serverStatus.${serverStatus}`) }}
              </span>
            </div>

            <v-btn
              color="primary"
              variant="tonal"
              block
              class="mb-3"
              :loading="verifying"
              @click="verifyServerStatus"
            >
              <v-icon start>mdi-connection</v-icon>
              {{ t('examSystem.config.server.verifyButton') }}
            </v-btn>

            <v-slide-y-transition>
              <v-btn
                v-if="isServerConnected"
                color="secondary"
                variant="outlined"
                block
                @click="getConfigFileFromServer"
              >
                <v-icon start>mdi-cloud-download-outline</v-icon>
                {{ t('examSystem.config.server.fetchConfigButton') }}
              </v-btn>
            </v-slide-y-transition>
          </v-col>

          <!-- Upload config file -->
          <v-col cols="12" sm="6" class="pl-sm-4 pt-6 pt-sm-0">
            <h3 class="text-subtitle-1 font-weight-bold mb-4 d-flex align-center">
              <v-icon size="20" color="secondary" class="mr-2">mdi-file-cog-outline</v-icon>
              {{ t('examSystem.config.upload.title') }}
            </h3>

            <!-- <div class="text-body-2 text-medium-emphasis mb-3">
              {{ t('examSystem.config.upload.description', 'Alternatively, you can upload a configuration file manually.') }}
            </div> -->

            <v-file-upload
              v-model="selectedFile"
              :multiple="false"
              density="default"
              show-size
              variant="outlined"
              prepend-icon=""
              :label="t('examSystem.config.upload.label')"
              @update:model-value="onFileSelected"
              class="w-100"
            >
                <template #message>
                    <div class="d-flex flex-column align-center text-medium-emphasis">
                         <v-icon size="32" class="mb-2">mdi-upload-outline</v-icon>
                         <span>Drag & Drop or Click</span>
                    </div>
                </template>
            </v-file-upload>
          </v-col>
        </v-row>
      </v-card-text>

      <v-divider></v-divider>

      <!-- Footer: 固定在底部 (因為是 Flex Column 的最後一個元素) -->
      <v-card-actions class="pa-4 bg-surface-light flex-shrink-0">
        <v-spacer></v-spacer>
        <v-btn
          color="primary"
          variant="elevated"
          size="large"
          :disabled="!canSave"
          @click="saveSettings"
        >
          {{ t('examSystem.config.saveButton') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { VFileUpload } from 'vuetify/labs/VFileUpload';
import { router } from '../router/index';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const serverHost = ref('');
const selectedFile = ref<File | undefined>(undefined);
const serverStatus = ref<'connected' | 'disconnected'>('disconnected');
const isServerConnected = ref(false);
const verifying = ref(false);

onMounted(async () => {
  if (window.api?.config) {
    const isSetupComplete = await window.api.config.getIsConfigSetupComplete();
    if (isSetupComplete) {
      router.push('/Welcome');
    }
  }
});

const canSave = computed(() => !!serverHost.value || !!selectedFile.value);

const onFileSelected = async (files: File | File[] | undefined) => {
  const file = Array.isArray(files) ? files[0] : files;
  if (!file) return;
  selectedFile.value = file;
  await uploadConfigFile(file);
};

const uploadConfigFile = async (file: File) => {
  if (!window.api?.config) return;
  const re = await window.api.config.setJson(file.path);
  if (re.success) {
    router.push('/Welcome');
  } else {
    alert(t('examSystem.config.upload.failed'));
  }
};

const verifyServerStatus = async () => {
  if (!serverHost.value || !window.api?.config) return;
  // 合法格式為 http://localhost:3000 自動去掉最後的斜線
  if (serverHost.value.endsWith('/')) {
    serverHost.value = serverHost.value.slice(0, -1);
  }
  verifying.value = true;
  try {
    const re = await window.api.config.getServerStatus(serverHost.value);
    if (re.success) {
      serverStatus.value = 'connected';
      isServerConnected.value = true;
    } else {
      serverStatus.value = 'disconnected';
      isServerConnected.value = false;
      alert(t('examSystem.config.server.verifyFailed'));
    }
  } finally {
    verifying.value = false;
  }
};

const getConfigFileFromServer = async () => {
  if (!window.api?.config) return;
  const re = await window.api.config.getFromServer(serverHost.value);
  if (re.success) {
    router.push('/Welcome');
  } else {
    alert(t('examSystem.config.server.fetchConfigFailed'));
  }
};

const saveSettings = () => {
  // Logic...
  alert(t('examSystem.config.saveSuccess'));
};
</script>