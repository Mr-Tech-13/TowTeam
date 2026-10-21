import ActivityKit
import Foundation

struct TowActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var step: String
        var completedSteps: Int
        var totalSteps: Int
    }

    let towID: Int
    let aircraft: String
    let route: String
}
