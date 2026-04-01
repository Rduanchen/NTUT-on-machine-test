import { describe, expect, it } from "vitest";
import { evaluateRules } from "special-rule-engine";

describe("special-rule-engine import (student app)", () => {
    it("can import and run a trivial rule", () => {
        const results = evaluateRules(
            [
                {
                    id: "r1",
                    type: "regex",
                    constraint: "MUST_HAVE",
                    message: "must have printf",
                    params: { pattern: "\\bprintf\\b" },
                },
            ],
            { language: "c", sourceText: "// printf\nint main(){}" },
        );

        // normalization should strip comments for c-like languages, so this should FAIL.
        expect(results[0]?.passed).toBe(false);
    });
});
