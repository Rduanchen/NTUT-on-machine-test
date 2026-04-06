import { ref, computed, onMounted } from 'vue';
import type { Puzzle, StatusInfo } from '../constants/puzzle';

export function usePuzzles() {
    const puzzleInfo = ref<Puzzle[]>([]);
    const testResult = ref<Record<string, any>>({});
    const onSent = ref<Record<string, boolean>>({});

    const updateTestCaseResults = async () => {
        if (!window.api?.store) return;
        testResult.value = await window.api.store.readTestResult();
        for (const puzzle of puzzleInfo.value) {
            if (onSent.value[puzzle.id]) onSent.value[puzzle.id] = false;
        }
    };

    const stopTestCase = () => {
        if (window.api?.judger) window.api.judger.forceStop();
        onSent.value = {};
    };

    const puzzleStatuses = computed<Record<string, StatusInfo>>(() => {
        const statuses: Record<string, StatusInfo> = {};
        for (const puzzle of puzzleInfo.value) {
            const id = String(puzzle.id);
            const result = testResult.value[id];

            if (onSent.value[id]) {
                statuses[id] = { color: 'info', i18nKey: 'examSystem.puzzles.status.testing' };
                continue;
            }
            if (!result || typeof result.correctCount !== 'number') {
                statuses[id] = { color: 'grey', i18nKey: 'examSystem.puzzles.status.notSubmitted' };
                continue;
            }
            const { correctCount, testCaseAmount } = result;
            if (testCaseAmount === 0 || correctCount === testCaseAmount) {
                statuses[id] = { color: 'success', i18nKey: 'examSystem.puzzles.status.completed' };
            } else if (correctCount > 0) {
                statuses[id] = { color: 'warning', i18nKey: 'examSystem.puzzles.status.partial' };
            } else {
                statuses[id] = { color: 'error', i18nKey: 'examSystem.puzzles.status.failed' };
            }
        }
        return statuses;
    });

    const puzzlePassRates = computed<Record<string, StatusInfo>>(() => {
        const rates: Record<string, StatusInfo> = {};
        for (const puzzle of puzzleInfo.value) {
            const id = String(puzzle.id);
            const result = testResult.value[id];
            // Pass rate is calculated by *subtask* (group), not raw testcase count.
            // A subtask is considered passed only if *all* its testcases are AC.
            if (!result || !Array.isArray(result.subtasks) || result.subtasks.length === 0) {
                rates[id] = { text: 'N/A', color: 'grey-lighten-1' };
                continue;
            }

            const totalSubtasks = result.subtasks.length;
            const passedSubtasks = result.subtasks.reduce((acc: number, subtaskCases: any) => {
                if (!Array.isArray(subtaskCases) || subtaskCases.length === 0) return acc;
                return subtaskCases.every((c: any) => c?.statusCode === 'AC') ? acc + 1 : acc;
            }, 0);

            const rate = Math.round((passedSubtasks / totalSubtasks) * 100);
            let color: StatusInfo['color'] = 'error';
            if (rate === 100) color = 'success';
            else if (rate > 0) color = 'warning';
            rates[id] = { text: `${rate}%`, color };
        }
        return rates;
    });

    onMounted(async () => {
        if (!window.api?.store) return;
        puzzleInfo.value = await window.api.store.getPuzzleInfo();
        window.api.judger.onJudgeComplete(async () => {
            await updateTestCaseResults();
        });
        await updateTestCaseResults();
    });

    return {
        puzzleInfo,
        testResult,
        onSent,
        puzzleStatuses,
        puzzlePassRates,
        updateTestCaseResults,
        stopTestCase
    };
}