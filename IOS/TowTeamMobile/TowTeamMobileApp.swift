import SwiftUI

@main
struct TowTeamMobileApp: App {
    @StateObject private var session = AppSession()

    var body: some Scene {
        WindowGroup {
            RootView().environmentObject(session)
                .preferredColorScheme(.dark)
        }
    }
}

