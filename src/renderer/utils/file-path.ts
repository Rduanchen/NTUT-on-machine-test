/**
 * The on-disk path of a file the student picked or dropped.
 *
 * `File.path` was never part of the DOM — it was an Electron extension, and it
 * was removed in Electron 32. This project runs 34, so every reader of it has
 * been getting `undefined` and passing that along: judging failed several
 * frames later with `The "paths[0]" argument must be of type string`, which
 * names `path.resolve` and not the upload that fed it.
 *
 * Kept as one function so the three call sites cannot drift apart again, and
 * so an environment without the bridge fails here — where the file is still in
 * hand and the message can say so — rather than in the judger.
 */
export function resolveFilePath(file: File): string {
  const path = window.api?.files?.getPath?.(file);
  if (typeof path !== 'string' || path.length === 0) {
    throw new Error('無法取得檔案路徑，請改用「選擇檔案」重新上傳');
  }
  return path;
}
