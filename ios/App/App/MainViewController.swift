import UIKit
import Capacitor

/*
  Capacitor 預設不會開 WKWebView 的左緣滑動返回手勢（
  allowsBackForwardNavigationGestures 預設是 false）。這支 App 的
  返回邏輯整個建立在 history.pushState/popstate 上（見 src/App.jsx
  的 useBackClose），iOS 沒有實體返回鍵，唯一的手勢入口就是這顆
  開關——打開之後，左緣滑動會被 WKWebView 直接轉成 history.back()，
  跟畫面上的「‹」按鈕、Android 實體返回鍵走同一條路。
*/
class MainViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        webView?.allowsBackForwardNavigationGestures = true
    }
}
