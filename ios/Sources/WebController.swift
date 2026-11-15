import SwiftUI
import WebKit

final class WebController: NSObject, ObservableObject, WKNavigationDelegate {
    @Published var isOffline = false
    @Published var isLoading = true

    let webView: WKWebView
    private let bridge: Bridge
    private var didStart = false

    override init() {
        let bridge = Bridge()
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.allowsInlineMediaPlayback = true
        // 消息处理器必须在 WKWebView 初始化前挂好，建好之后再改配置不会生效
        configuration.userContentController.add(bridge, name: "zzland")

        let webView = WKWebView(frame: .zero, configuration: configuration)

        self.bridge = bridge
        self.webView = webView

        super.init()

        bridge.webView = webView
        webView.navigationDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
    }

    func start() {
        guard !didStart else { return }
        didStart = true
        load()
    }

    func load() {
        guard let text = Bundle.main.object(forInfoDictionaryKey: "RemoteWebURL") as? String,
              let url = URL(string: text),
              url.scheme?.lowercased() == "https" else {
            isLoading = false
            isOffline = true
            return
        }
        isLoading = true
        isOffline = false
        let request = URLRequest(url: url, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 20)
        webView.load(request)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        isLoading = false
        isOffline = false
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handle(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handle(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        load()
    }

    private func handle(_ error: Error) {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled { return }
        isLoading = false
        isOffline = true
    }
}
