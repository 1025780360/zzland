import SwiftUI
import WebKit

struct ContentView: View {
    @StateObject private var controller = WebController()

    var body: some View {
        ZStack {
            Color(red: 0.957, green: 0.949, blue: 0.925).ignoresSafeArea()
            WebView(controller: controller).ignoresSafeArea()
            if controller.isOffline {
                OfflineView(controller: controller)
            }
            if controller.isLoading && !controller.isOffline {
                ProgressView()
                    .progressViewStyle(.circular)
                    .tint(Color(red: 0.12, green: 0.42, blue: 0.35))
            }
        }
        .preferredColorScheme(.light)
        .onAppear { controller.start() }
    }
}

private struct WebView: UIViewRepresentable {
    let controller: WebController

    func makeUIView(context: Context) -> WKWebView {
        controller.webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

private struct OfflineView: View {
    @ObservedObject var controller: WebController

    var body: some View {
        VStack(spacing: 18) {
            Spacer()

            ZStack {
                Circle()
                    .fill(Color(red: 0.886, green: 0.933, blue: 0.910))
                    .frame(width: 84, height: 84)
                Image(systemName: "antenna.radiowaves.left.and.right.slash")
                    .font(.system(size: 32, weight: .semibold))
                    .foregroundColor(Color(red: 0.12, green: 0.42, blue: 0.35))
            }

            VStack(spacing: 8) {
                Text("暂时连不上服务")
                    .font(.system(size: 24, weight: .bold))
                Text("界面和功能都从服务器加载，恢复网络后重新加载即可。")
                    .font(.system(size: 14))
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
            }

            Button(action: { controller.load() }) {
                Text("重新加载")
                    .font(.system(size: 15, weight: .semibold))
                    .frame(maxWidth: 220)
                    .padding(.vertical, 12)
            }
            .background(Color(red: 0.106, green: 0.114, blue: 0.106))
            .foregroundColor(Color(red: 0.969, green: 0.957, blue: 0.918))
            .clipShape(RoundedRectangle(cornerRadius: 14))

            Spacer()

            VStack(spacing: 4) {
                Text("当前签名剩余 \(SigningInfo.remainingText())")
                    .font(.system(size: 13, weight: .medium))
                Text("到期前记得连接电脑用 Sideloadly 续签")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            }
            .padding(.bottom, 12)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(red: 0.957, green: 0.949, blue: 0.925))
    }
}
