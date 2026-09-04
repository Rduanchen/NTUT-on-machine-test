# Quickstart Validation Guide

本文件說明如何驗證後端測試的覆蓋率是否達標。

## 1. 安裝必要依賴

```bash
npm install -D @vitest/coverage-v8
```

## 2. 執行覆蓋率測試

```bash
# 執行測試並要求產出覆蓋率報告
npm run test -- --coverage
```

## 3. 驗證標準

檢視終端機輸出的 Coverage 報表：
1. 尋找 `src/main/services` 下的所有檔案。
2. 確保 `% Branch` (分支覆蓋率) 欄位顯示 `100%`。
3. 若有未覆蓋的分支，報表將於 `Uncovered Line #s` 標示具體的行號，請補齊對應的 Edge Case。

## 4. (選用) 網頁版視覺化報表
可以在 `vitest.config.ts` 中設定 `coverage.reporter: ['html']`，產生 `/coverage/index.html` 方便在瀏覽器中視覺化檢視未覆蓋的程式碼區塊。
