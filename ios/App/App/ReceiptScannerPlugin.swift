import AVFoundation
import Capacitor
import Foundation
import UIKit
import Vision
import VisionKit

/*
  自建的 Capacitor plugin，只給這個 App 自己用（不是獨立套件）。
  三個方法對應 src/receiptScanner.js 的介面：
  - scanDocument：叫出系統文件掃描器（VisionKit），回傳已經自動抓邊框、
    拉正、去陰影的掃描結果（一張以上）。
  - recognizeText：把一張圖丟給 Vision 文字辨識，回傳辨識出的文字。
  - openAppSettings：開啟這個 App 在系統設定裡的頁面。

  用 CAPBridgedPlugin 這個 protocol 自我註冊——Capacitor 的 bridge 會在
  執行期掃描所有 @objc 類別找符合這個 protocol 的 plugin，不需要另外在
  Info.plist 或 AppDelegate 裡手動註冊。
*/
@objc(ReceiptScannerPlugin)
public class ReceiptScannerPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "ReceiptScannerPlugin"
  public let jsName = "ReceiptScanner"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "scanDocument", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "recognizeText", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "openAppSettings", returnType: CAPPluginReturnPromise),
  ]

  fileprivate var scanDelegate: ScanDelegate?

  @objc func scanDocument(_ call: CAPPluginCall) {
    guard VNDocumentCameraViewController.isSupported else {
      call.reject("not_supported")
      return
    }
    ensureCameraPermission { granted in
      guard granted else {
        call.reject("permission_denied")
        return
      }
      DispatchQueue.main.async {
        guard let vc = self.bridge?.viewController else {
          call.reject("no_view_controller")
          return
        }
        let scanner = VNDocumentCameraViewController()
        let delegate = ScanDelegate(call: call, plugin: self)
        self.scanDelegate = delegate
        scanner.delegate = delegate
        vc.present(scanner, animated: true)
      }
    }
  }

  @objc func recognizeText(_ call: CAPPluginCall) {
    guard let imageStr = call.getString("image") else {
      call.reject("missing_image")
      return
    }
    guard let uiImage = ReceiptScannerPlugin.decodeImage(imageStr),
      let cgImage = uiImage.cgImage
    else {
      call.reject("bad_image")
      return
    }
    let request = VNRecognizeTextRequest { req, err in
      if let err = err {
        call.reject("recognize_failed", nil, err)
        return
      }
      let observations = (req.results as? [VNRecognizedTextObservation]) ?? []
      // text 保留給還沒更新過、只認舊格式（純字串）的呼叫端用；lines
      // 額外把每一行的座標一起帶出去，JS 端才能自己依「同一橫排」重組
      // 閱讀順序（理由跟 Android 那邊一樣：Vision 是照它自己的區塊順序
      // 回傳，遇到「左邊一整欄標籤、右邊一整欄金額」這種排版，常常會把
      // 兩欄拆成不同區塊，回傳順序變成標籤跟金額脫節）。Vision 的
      // boundingBox 是正規化座標（0–1）、原點在左下角、Y 軸朝上，跟
      // Android Bitmap 慣用的左上原點、Y 軸朝下相反，這裡先轉成一致的
      // 「左上原點、Y 軸朝下」慣例，JS 端就不用管兩個平台座標系不同。
      var linesPayload: [[String: Any]] = []
      var textLines: [String] = []
      for obs in observations {
        guard let text = obs.topCandidates(1).first?.string else { continue }
        textLines.append(text)
        let box = obs.boundingBox
        linesPayload.append([
          "text": text,
          "top": 1.0 - box.maxY,
          "left": box.minX,
          "bottom": 1.0 - box.minY,
          "right": box.maxX,
        ])
      }
      call.resolve([
        "text": textLines.joined(separator: "\n"),
        "lines": linesPayload,
      ])
    }
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["ja-JP", "en-US"]
    request.usesLanguageCorrection = true
    let handler = VNImageRequestHandler(
      cgImage: cgImage,
      orientation: ReceiptScannerPlugin.cgOrientation(uiImage.imageOrientation),
      options: [:]
    )
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        try handler.perform([request])
      } catch {
        call.reject("recognize_failed", nil, error)
      }
    }
  }

  @objc func openAppSettings(_ call: CAPPluginCall) {
    DispatchQueue.main.async {
      guard let url = URL(string: UIApplication.openSettingsURLString) else {
        call.reject("no_settings_url")
        return
      }
      UIApplication.shared.open(url, options: [:]) { _ in
        call.resolve()
      }
    }
  }

  private func ensureCameraPermission(_ completion: @escaping (Bool) -> Void) {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized:
      completion(true)
    case .notDetermined:
      AVCaptureDevice.requestAccess(for: .video) { granted in
        DispatchQueue.main.async { completion(granted) }
      }
    default:
      completion(false)
    }
  }

  static func decodeImage(_ str: String) -> UIImage? {
    var b64 = str
    if let commaIdx = b64.firstIndex(of: ","), b64.contains("base64,") {
      b64 = String(b64[b64.index(after: commaIdx)...])
    }
    guard let data = Data(base64Encoded: b64) else { return nil }
    return UIImage(data: data)
  }

  static func cgOrientation(_ o: UIImage.Orientation) -> CGImagePropertyOrientation {
    switch o {
    case .up: return .up
    case .down: return .down
    case .left: return .left
    case .right: return .right
    case .upMirrored: return .upMirrored
    case .downMirrored: return .downMirrored
    case .leftMirrored: return .leftMirrored
    case .rightMirrored: return .rightMirrored
    @unknown default: return .up
    }
  }
}

private class ScanDelegate: NSObject, VNDocumentCameraViewControllerDelegate {
  let call: CAPPluginCall
  weak var plugin: ReceiptScannerPlugin?

  init(call: CAPPluginCall, plugin: ReceiptScannerPlugin) {
    self.call = call
    self.plugin = plugin
  }

  func documentCameraViewController(
    _ controller: VNDocumentCameraViewController,
    didFinishWith scan: VNDocumentCameraScan
  ) {
    controller.dismiss(animated: true)
    var images: [String] = []
    for i in 0..<scan.pageCount {
      let img = scan.imageOfPage(at: i)
      if let data = img.jpegData(compressionQuality: 0.8) {
        images.append("data:image/jpeg;base64," + data.base64EncodedString())
      }
    }
    if images.isEmpty {
      call.reject("no_pages")
    } else {
      call.resolve(["images": images])
    }
    plugin?.scanDelegate = nil
  }

  func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
    controller.dismiss(animated: true)
    call.reject("cancelled")
    plugin?.scanDelegate = nil
  }

  func documentCameraViewController(
    _ controller: VNDocumentCameraViewController,
    didFailWithError error: Error
  ) {
    controller.dismiss(animated: true)
    call.reject("scan_failed", nil, error)
    plugin?.scanDelegate = nil
  }
}
