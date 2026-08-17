/*
  自建的 Capacitor plugin（不是 npm 套件，程式碼直接放在 ios/App、android/app 專案裡）。
  提供三個原生能力，網頁上這幾個方法都用不到（EditSheet 只在
  Capacitor.isNativePlatform() 為真時才會呼叫）：

  - scanDocument()：叫出系統文件掃描器（iOS VisionKit / Android ML Kit
    Document Scanner），回傳已經自動抓邊框、拉正、去陰影的掃描結果。
  - recognizeText({ image }）：把一張圖丟給系統文字辨識（iOS Vision /
    Android ML Kit 日文文字辨識），回傳辨識出的文字。
  - openAppSettings()：開啟這個 App 在系統設定裡的頁面（權限被拒時用）。

  三個方法在使用者取消操作、或權限被拒時都會 reject；權限被拒時
  reject 的 error.message 會是 "permission_denied"，呼叫端可以用這個
  區分「使用者按取消」跟「本來就沒權限」。
*/

import { registerPlugin } from '@capacitor/core';

const ReceiptScanner = registerPlugin('ReceiptScanner');

export default ReceiptScanner;
