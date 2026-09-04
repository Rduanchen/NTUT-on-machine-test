import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node", // 測這種 service / schema 用 node 環境就好
        globals: true,       // 這樣可以直接用 describe/it/expect，而不用每次都 import
        setupFiles: ["./test/setup.ts"],
        coverage: {
            provider: "v8",
            include: ["src/main/services/**/*.ts", "src/main/ipc/**/*.ts"],
            reporter: ["text", "html"],
            all: true,
        },
    },
});