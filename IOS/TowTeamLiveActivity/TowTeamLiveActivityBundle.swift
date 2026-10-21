import ActivityKit
import SwiftUI
import WidgetKit

@main
struct TowTeamLiveActivityBundle: WidgetBundle {
    var body: some Widget { TowTeamLiveActivity() }
}

struct TowTeamLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TowActivityAttributes.self) { context in
            HStack(spacing: 12) {
                Image(systemName: "airplane")
                    .font(.title2)
                    .foregroundStyle(.cyan)
                VStack(alignment: .leading, spacing: 3) {
                    HStack { Text(context.attributes.aircraft).bold(); Spacer(); Text("\(context.state.completedSteps)/\(context.state.totalSteps)").monospacedDigit() }
                    Text(context.attributes.route).font(.subheadline)
                    Text(context.state.step).font(.caption).foregroundStyle(.secondary)
                }
            }
            .padding()
            .activityBackgroundTint(Color.black.opacity(0.88))
            .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { Label(context.attributes.aircraft, systemImage: "airplane") }
                DynamicIslandExpandedRegion(.trailing) { Text("\(context.state.completedSteps)/\(context.state.totalSteps)").monospacedDigit() }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading) {
                        Text(context.attributes.route)
                        Text(context.state.step).font(.caption).foregroundStyle(.secondary)
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }
            } compactLeading: {
                Image(systemName: "airplane")
            } compactTrailing: {
                Text("\(context.state.completedSteps)/\(context.state.totalSteps)").monospacedDigit()
            } minimal: {
                Image(systemName: "airplane")
            }
        }
    }
}
