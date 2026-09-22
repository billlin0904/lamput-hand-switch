# Lamput 手手按鈕

四個高彩度開關，還有會偷偷探頭、伸手關掉開關的 Lamput。

## 互動

- 等待約 2.5～6.5 秒，隨機選一組已開啟的按鈕。
- 第一次出現有 80% 機率只探頭，下次才伸手關閉。
- 滑鼠靠近按鈕約 10px 時，Lamput 會躲起來；離開後重新等待。
- 支援手機觸控與減少動態效果設定，離開頁籤時暫停。

## 本機預覽

不需安裝套件。開啟 `index.html`，或在這個目錄啟動靜態伺服器：

```sh
python -m http.server 8080
```

然後開啟 `http://localhost:8080`。

## GitHub Pages

使用 `main` 分支的根目錄發布。更新並推送這個分支後，GitHub Pages 會自動重新部署。

網站由 `index.html`、`style.css`、`app.js` 與 `lamput-head.png` 組成，無建置步驟或外部 API。

Lamput 是原作角色，本專案為非官方互動實驗。
