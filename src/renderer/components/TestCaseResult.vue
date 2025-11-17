<template>
  <v-card class="result">
    <v-card-title>
      判題結果　總通過: {{ result.correctCount }}/{{ result.testCaseAmount }}
    </v-card-title>
    <v-divider></v-divider>
    <v-card-text>
      <div v-for="group in result.groupResults" :key="group.id" class="mb-6">
        <v-card class="mb-2" outlined>
          <v-card-title>
            {{ group.title }}（ID: {{ group.id }}）
            <span class="ml-auto"
              >通過: {{ group.correctCount }}/{{ group.testCaseAmount }}</span
            >
          </v-card-title>
          <v-card-text>
            <v-data-table
              :headers="headers"
              :items="group.testCasesResults"
              class="elevation-1"
              hide-default-footer
              dense
            >
              <template v-slot:item.correct="{ item }">
                <v-chip :color="item.correct ? 'green' : 'red'" dark small>
                  {{ item.correct ? "✔️" : "❌" }}
                </v-chip>
              </template>
            </v-data-table>
          </v-card-text>
        </v-card>
      </div>
    </v-card-text>
  </v-card>
</template>

<script>
export default {
  name: "ResultTableCard",
  props: {
    result: {
      type: Object,
      required: true,
    },
  },
  data() {
    return {
      headers: [
        { text: "測試案例 ID", value: "id", sortable: false },
        { text: "結果", value: "correct", sortable: false },
        { text: "輸出", value: "userOutput", sortable: false },
      ],
    };
  },
};
</script>
<style scoped>
.result {
  width: 100%;
  overflow-y: auto;
}
</style>
