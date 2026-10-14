import { ref } from 'vue';

import { resolveFilePath } from '../utils/file-path';

export function useUpload(onAfterJudge?: () => Promise<void>) {
    const onSent = ref<Record<string, boolean>>({});
    const uploadError = ref('');

    const submitUpload = async ({ file, puzzleId }: { file: File; puzzleId: string | number }) => {
        uploadError.value = '';
        if (file instanceof File && window.api?.judger) {
            /* The path comes from the preload bridge, not from `file.path` —
             * that property is gone in this Electron. A failure to resolve it
             * is reported here rather than passed on as `undefined`. */
            try {
                const filePath = resolveFilePath(file);
                onSent.value[String(puzzleId)] = true;
                await window.api.judger.judge(String(puzzleId), filePath);
            } catch (error) {
                onSent.value[String(puzzleId)] = false;
                uploadError.value = error instanceof Error ? error.message : String(error);
                return;
            }
        }
        if (onAfterJudge) await onAfterJudge();
    };

    return { onSent, uploadError, submitUpload };
}
