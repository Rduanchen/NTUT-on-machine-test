import { ref } from 'vue';

export function useUpload(onAfterJudge?: () => Promise<void>) {
    const onSent = ref<Record<string, boolean>>({});

    const submitUpload = async ({ file, puzzleId }: { file: File; puzzleId: string | number }) => {
        if (file instanceof File && window.api?.judger) {
            window.api.judger.judge(String(puzzleId), file.path);
            onSent.value[String(puzzleId)] = true;
        }
        if (onAfterJudge) await onAfterJudge();
    };

    return { onSent, submitUpload };
}