<template>
  <v-app id="inspire">
    <v-system-bar>
      伺服器狀態:
      <v-chip
        :color="serverStatus === 'connected' ? 'green' : 'red'"
        dark
        class="ml-2"
      >
        {{ serverStatus }}
      </v-chip>
    </v-system-bar>
    <v-app-bar>
      <v-app-bar-title>北科大考試系統</v-app-bar-title>
      <v-spacer></v-spacer>
      <div v-if="studentInfo" class="mr-4">
        學生: {{ studentInfo.name }} | 學號: {{ studentInfo.id }}
      </div>
    </v-app-bar>

    <v-main>
      <router-view></router-view>
    </v-main>
  </v-app>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router'

const route = useRoute();
const studentInfo = ref(null);
const serverStatus = ref('disconnected');

onMounted(async () => {
  
  window.api.store.updateServerAvailability((status) => {
    updateServerAvailability(status);
    console.log('Received server availability update:', status);
  });
});

const updateServerAvailability = (status) => {
  console.log('Server availability updated:', status);
  serverStatus.value = status ? 'connected' : 'disconnected';
};

watch (() => route.path, async (newPath) => {
  if (newPath === '/TestPage') {
    studentInfo.value = await window.api.store.readStudentInformation();
    console.log('Student Info:', studentInfo.value);
  }
})
</script>
<style scoped>
.clickable {
  cursor: pointer;
}
</style>
