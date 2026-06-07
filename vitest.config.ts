import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node", // 測這種 service / schema 用 node 環境就好
        globals: true,       // 這樣可以直接用 describe/it/expect，而不用每次都 import
    },
});