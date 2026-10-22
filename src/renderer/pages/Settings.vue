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

          </v-col>

          <!-- Upload config file -->
          <v-col cols="12" sm="6" class="pl-sm-4 pt-6 pt-sm-0">
            <h3 class="text-subtitle-1 font-weight-bold mb-4 d-flex align-center">
              <v-icon size="20" color="secondary" class="mr-2">mdi-file-cog-outline</v-icon>
              {{ t('examSystem.config.upload.title') }}
            </h3>

            <div class="text-body-2 text-medium-emphasis mb-3">
              {{ t('examSystem.config.upload.description') }}
            </div>

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
                  <span>{{ t('examSystem.config.upload.dragDropHint') }}</span>
                </div>
              </template>
            </v-file-upload>
          </v-col>
        </v-row>
        <v-alert v-if="setupError" type="error" variant="tonal" class="mt-4" data-test="setup-error">
          {{ setupError }}
        </v-alert>
      </v-card-text>

      <v-divider></v-divider>

      <!-- Footer: 固定在底部 (因為是 Flex Column 的最後一個元素) -->
      <v-card-actions class="pa-4 bg-surface-light flex-shrink-0">
        <v-spacer></v-spacer>
        <v-btn
          color="primary"
          variant="elevated"
          size="large"
          :disabled="!canSave || saving"
          :loading="saving"
          @click="saveSettings"
        >
          {{ t('examSystem.config.saveButton') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { VFileUpload } from 'vuetify/labs/VFileUpload';
import { router } from '../router/index';
import { goToDerivedPage } from '../router/navigate';
import { resolveFilePath } from '../utils/file-path';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const serverHost = ref('');
const selectedFile = ref<File | undefined>(undefined);
const serverStatus = ref<'connected' | 'disconnected'>('disconnected');
const verifying = ref(false);
const saving = ref(false);
const setupError = ref('');

const canSave = computed(() => !!serverHost.value.trim() || !!selectedFile.value);

const onFileSelected = (files: File | File[] | undefined) => {
  const file = Array.isArray(files) ? files[0] : files;
  selectedFile.value = file;
  setupError.value = '';
};

const uploadConfigFile = async (file: File): Promise<void> => {
  if (!window.api?.config) return;

  /* Not `file.path` — that property was removed in Electron 32 and this app
   * runs 34. It resolved to `undefined`, which travelled all the way to
   * `path.resolve` before anything complained. */
  let filePath: string;
  try {
    filePath = resolveFilePath(file);
  } catch (error) {
    setupError.value = error instanceof Error ? error.message : String(error);
    return;
  }

  const response = await window.api.config.setJson(filePath);
  if (!response.success) {
    setupError.value = `${t('examSystem.config.upload.failed')}：${response.error?.message || response.error?.code || ''}`;
    return;
  }
  await goToDerivedPage(router);
};

const verifyServerStatus = async (): Promise<boolean> => {
  if (!serverHost.value.trim() || !window.api?.config) return false;
  serverHost.value = serverHost.value.trim().replace(/\/+$/, '');
  verifying.value = true;
  setupError.value = '';
  try {
    const re = await window.api.config.getServerStatus(serverHost.value);
    if (re.success) {
      serverStatus.value = 'connected';
      return true;
    } else {
      serverStatus.value = 'disconnected';
      setupError.value = t('examSystem.config.server.verifyFailed');
      return false;
    }
  } catch (error) {
    serverStatus.value = 'disconnected';
    setupError.value = error instanceof Error ? error.message : String(error);
    return false;
  } finally {
    verifying.value = false;
  }
};

const getConfigFileFromServer = async () => {
  if (!window.api?.config) return;
  if (!(await verifyServerStatus())) return;
  // The backend may not have initialized a paper yet. The URL still needs to
  // be stored so phase and configuration updates can arrive later.
  await window.api.config.getFromServer(serverHost.value);
  await goToDerivedPage(router);
};

const saveSettings = async () => {
  if (saving.value) return;
  saving.value = true;
  setupError.value = '';
  try {
    if (selectedFile.value) {
      await uploadConfigFile(selectedFile.value);
    } else {
      await getConfigFileFromServer();
    }
  } catch (error) {
    setupError.value = error instanceof Error ? error.message : String(error);
  } finally {
    saving.value = false;
  }
};
</script>
