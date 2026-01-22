import fs from "fs/promises";
import { describe, it, expect } from "vitest";
import { validateConfigFormat } from "../../src/main/utilities/configFormatChecker";
import validConfig from "../fixtures/valid_config_file.json";
import invalidConfig from "../fixtures/invalid_config_file.json";

describe("validate test config format", () => {
    it("valid config should pass", async () => {
        const jsonData = validConfig;
        const result = validateConfigFormat(jsonData);
        expect(result.success).toBe(true);
    });

    it("invalid config should fail with proper error messages", async () => {
        const jsonData = invalidConfig;
        const result = validateConfigFormat(jsonData);
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toContain("puzzles.0.subtasks.0.visible: Invalid input: expected array, received undefined");
            expect(result.error).toContain("puzzles.0.subtasks.1.title: Invalid input: expected string, received undefined");
            expect(result.error).toContain(`puzzles.1.language: Invalid option: expected one of "C"|"Cpp"|"Python"|"JavaScript"|"Java"`);
        }
    });
});
