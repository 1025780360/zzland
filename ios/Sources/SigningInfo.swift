import Foundation

/// 读取 App 包内的 embedded.mobileprovision，拿到真实的签名到期时间。
enum SigningInfo {
    private static let installedAtKey = "zzland.installedAt"

    static func installedAt() -> Date {
        let defaults = UserDefaults.standard
        if let saved = defaults.object(forKey: installedAtKey) as? Date {
            return saved
        }
        let now = Date()
        defaults.set(now, forKey: installedAtKey)
        return now
    }

    static func expirationFromProfile() -> Date? {
        guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
              let data = try? Data(contentsOf: url) else {
            return nil
        }
        let startTag = Data("<?xml".utf8)
        let endTag = Data("</plist>".utf8)
        guard let start = data.range(of: startTag),
              let end = data.range(of: endTag, in: start.lowerBound..<data.endIndex) else {
            return nil
        }
        let plistData = data.subdata(in: start.lowerBound..<end.upperBound)
        guard let plist = try? PropertyListSerialization.propertyList(from: plistData, options: [], format: nil) as? [String: Any],
              let expiration = plist["ExpirationDate"] as? Date else {
            return nil
        }
        return expiration
    }

    /// 优先用证书里的到期时间；读不到时按首次打开时间加 7 天估算。
    static func current() -> (expires: Date, source: String) {
        if let expiration = expirationFromProfile() {
            return (expiration, "profile")
        }
        let installed = installedAt()
        let fallback = Calendar.current.date(byAdding: .day, value: 7, to: installed) ?? installed
        return (fallback, "install")
    }

    static func remainingText() -> String {
        let seconds = current().expires.timeIntervalSinceNow
        if seconds <= 0 { return "已过期" }
        let days = Int(seconds / 86400)
        let hours = Int((seconds - Double(days) * 86400) / 3600)
        if days > 0 { return "\(days) 天 \(hours) 小时" }
        if hours > 0 { return "\(hours) 小时" }
        return "不到 1 小时"
    }
}
