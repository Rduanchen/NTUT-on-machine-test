<template>
  <v-app id="inspire">
    <v-app-bar>
      <v-app-bar-title>北科大考試系統</v-app-bar-title>
    </v-app-bar>

    <v-main>
      <router-view></router-view>
    </v-main>
  </v-app>
</template>

<script setup>
import { ref } from 'vue';
const puzzleList = ref([]);
const fileArray = ref(['', '', '']);
puzzleList.value = [
  { id: 1, name: 'Puzzle 1', language: 'python' },
  { id: 2, name: 'Puzzle 2', language: 'python' },
  { id: 3, name: 'Puzzle 3', language: 'cpp' }
];
</script>
<style scoped>
.clickable {
  cursor: pointer;
}
</style>
