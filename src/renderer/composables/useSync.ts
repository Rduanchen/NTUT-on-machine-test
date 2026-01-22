export function useSync() {
    const outputToZip = async () => {
        if (!window.api?.localProgram) return;
        const zipDataBuffer = await window.api.localProgram.getZipFile();
        const studentInfo = await window.api.store.readStudentInformation();
        if (!zipDataBuffer) return;
        const blob = new Blob([zipDataBuffer], { type: 'application/zip' });
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `${studentInfo.id}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
    };

    const syncCodeToBackend = async () => {
        if (window.api?.localProgram?.syncToBackend) {
            await window.api.localProgram.syncToBackend();
        }
    };

    const syncScoreToBackend = async () => {
        if (window.api?.judger?.syncScoreToBackend) {
            await window.api.judger.syncScoreToBackend();
        }
    };

    return { outputToZip, syncCodeToBackend, syncScoreToBackend };
}