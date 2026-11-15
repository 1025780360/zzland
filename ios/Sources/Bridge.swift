import Foundation
import UIKit
import WebKit
import UserNotifications

/// 网页与原生壳之间的桥：存储、通知、签名信息。
final class Bridge: NSObject, WKScriptMessageHandler {
    weak var webView: WKWebView?

    private let storePrefix = "zzland."

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let id = body["id"] as? String,
              let action = body["action"] as? String else {
            return
        }
        let payload = body["payload"] as? [String: Any] ?? [:]

        switch action {
        case "store.get":
            let key = payload["key"] as? String ?? ""
            if let value = UserDefaults.standard.string(forKey: storePrefix + key) {
                reply(id: id, ok: true, data: value)
            } else {
                reply(id: id, ok: true, data: NSNull())
            }

        case "store.set":
            let key = payload["key"] as? String ?? ""
            let value = payload["value"] as? String ?? ""
            UserDefaults.standard.set(value, forKey: storePrefix + key)
            reply(id: id, ok: true, data: true)

        case "store.remove":
            let key = payload["key"] as? String ?? ""
            UserDefaults.standard.removeObject(forKey: storePrefix + key)
            reply(id: id, ok: true, data: true)

        case "secure.get":
            let key = payload["key"] as? String ?? ""
            if let value = Keychain.get(key) {
                reply(id: id, ok: true, data: value)
            } else {
                reply(id: id, ok: true, data: NSNull())
            }

        case "secure.set":
            let key = payload["key"] as? String ?? ""
            let value = payload["value"] as? String ?? ""
            Keychain.set(value, for: key)
            reply(id: id, ok: true, data: true)

        case "clipboard.state":
            let pasteboard = UIPasteboard.general
            reply(id: id, ok: true, data: [
                "hasStrings": pasteboard.hasStrings,
                "changeCount": pasteboard.changeCount,
            ])

        case "clipboard.read":
            reply(id: id, ok: true, data: UIPasteboard.general.string ?? "")

        case "signing.info":
            let info = SigningInfo.current()
            reply(id: id, ok: true, data: [
                "expiresAt": isoString(info.expires),
                "installedAt": isoString(SigningInfo.installedAt()),
                "source": info.source,
            ])

        case "notify.status":
            UNUserNotificationCenter.current().getNotificationSettings { settings in
                self.reply(id: id, ok: true, data: Self.statusText(settings.authorizationStatus))
            }

        case "notify.request":
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in
                UNUserNotificationCenter.current().getNotificationSettings { settings in
                    self.reply(id: id, ok: true, data: Self.statusText(settings.authorizationStatus))
                }
            }

        case "notify.schedule":
            scheduleNotification(id: id, payload: payload)

        case "notify.cancel":
            let identifier = payload["id"] as? String ?? ""
            let center = UNUserNotificationCenter.current()
            center.removePendingNotificationRequests(withIdentifiers: [identifier])
            center.removeDeliveredNotifications(withIdentifiers: [identifier])
            reply(id: id, ok: true, data: true)

        case "app.badge":
            let count = max(0, payload["count"] as? Int ?? 0)
            let center = UNUserNotificationCenter.current()
            if #available(iOS 16.0, *) {
                center.setBadgeCount(count) { _ in
                    self.reply(id: id, ok: true, data: true)
                }
            } else {
                DispatchQueue.main.async {
                    UIApplication.shared.applicationIconBadgeNumber = count
                    self.reply(id: id, ok: true, data: true)
                }
            }

        case "app.info":
            let info = Bundle.main.infoDictionary
            reply(id: id, ok: true, data: [
                "version": info?["CFBundleShortVersionString"] as? String ?? "0",
                "build": info?["CFBundleVersion"] as? String ?? "0",
                "sdk": info?["ZZBuildSDK"] as? String ?? "",
                "stamp": info?["ZZBuildStamp"] as? String ?? "",
            ])

        case "app.screen":
            let screen = webView?.window?.screen ?? UIScreen.main
            let window = webView?.window?.bounds ?? screen.bounds
            let web = webView?.bounds ?? .zero
            let safe = webView?.safeAreaInsets ?? .zero
            reply(id: id, ok: true, data: [
                "screen": [Int(screen.bounds.width.rounded()), Int(screen.bounds.height.rounded())],
                "window": [Int(window.width.rounded()), Int(window.height.rounded())],
                "web": [Int(web.width.rounded()), Int(web.height.rounded())],
                "safeTop": Double(safe.top),
                "safeRight": Double(safe.right),
                "safeBottom": Double(safe.bottom),
                "safeLeft": Double(safe.left),
                "scale": Double(screen.scale),
            ])

        case "app.reload":
            DispatchQueue.main.async { [weak self] in
                self?.webView?.reload()
            }
            reply(id: id, ok: true, data: true)

        default:
            reply(id: id, ok: false, error: "unknown_action")
        }
    }

    private func scheduleNotification(id: String, payload: [String: Any]) {
        guard let atText = payload["at"] as? String,
              let date = parseISO(atText),
              date > Date() else {
            reply(id: id, ok: true, data: ["scheduled": false, "reason": "past"])
            return
        }

        let identifier = payload["id"] as? String ?? UUID().uuidString
        let content = UNMutableNotificationContent()
        content.title = payload["title"] as? String ?? "提醒"
        content.body = payload["body"] as? String ?? ""
        content.sound = .default

        let components = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
        let request = UNNotificationRequest(identifier: identifier, content: content, trigger: trigger)

        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [identifier])
        center.add(request) { error in
            if error == nil {
                self.reply(id: id, ok: true, data: ["scheduled": true])
            } else {
                self.reply(id: id, ok: true, data: ["scheduled": false, "reason": "add_failed"])
            }
        }
    }

    private func reply(id: String, ok: Bool, data: Any? = nil, error: String? = nil) {
        var body: [String: Any] = ["id": id, "ok": ok]
        if let data = data { body["data"] = data }
        if let error = error { body["error"] = error }
        guard JSONSerialization.isValidJSONObject(body),
              let json = try? JSONSerialization.data(withJSONObject: body),
              let text = String(data: json, encoding: .utf8) else {
            return
        }
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript("window.__zzlandReply(\(text));", completionHandler: nil)
        }
    }

    private func isoString(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    private func parseISO(_ text: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: text) { return date }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: text)
    }

    private static func statusText(_ status: UNAuthorizationStatus) -> String {
        switch status {
        case .authorized, .ephemeral: return "granted"
        case .denied: return "denied"
        case .provisional: return "provisional"
        case .notDetermined: return "unknown"
        @unknown default: return "unknown"
        }
    }
}
