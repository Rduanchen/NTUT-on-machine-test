import fs from "fs/promises";
import { describe, it, expect } from "vitest";
import { validatePreSettingsFormat } from "../../src/main/utilities/presettingsFormatChecker";
import validConfig from "../fixtures/valid_presettings_file.json";
import invalidConfig from "../fixtures/invalid_presettings_file.json";

describe("validate test config format", () => {
    it("valid config should pass", async () => {
        const jsonData = validConfig;
        const result = validatePreSettingsFormat(jsonData);
        expect(result.success).toBe(true);
    });

    it("invalid config should fail with proper error messages", async () => {
        const jsonData = invalidConfig;
        const result = validatePreSettingsFormat(jsonData);
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toContain("testTitle: Invalid input: expected string, received undefined");
            expect(result.error).toContain("remoteHost: Invalid URL");
        }
    });
});
