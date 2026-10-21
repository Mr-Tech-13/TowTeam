import ActivityKit
import Foundation

enum LiveActivityManager {
    static func sync(_ tow: Tow) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        Task {
            let matching = Activity<TowActivityAttributes>.activities.filter { $0.attributes.towID == tow.id }
            if hasTimestamp(tow.towPaperCompletedAt) || tow.status == "completed" {
                for activity in matching {
                    await activity.end(nil, dismissalPolicy: .immediate)
                }
                return
            }

            let steps = workflowSteps(for: tow)
            let completed = steps.filter { timestamp(for: $0, tow: tow) != nil }.count
            guard completed > 0 else { return }
            let state = TowActivityAttributes.ContentState(
                step: currentStepLabel(for: tow, steps: steps),
                completedSteps: completed,
                totalSteps: steps.count
            )
            let content = ActivityContent(state: state, staleDate: nil)
            if let activity = matching.first {
                await activity.update(content)
            } else {
                let attributes = TowActivityAttributes(
                    towID: tow.id,
                    aircraft: display(tow.tailNumber, fallback: tow.airline),
                    route: "\(display(tow.gate)) → \(display(tow.towSpot))"
                )
                _ = try? Activity.request(attributes: attributes, content: content, pushType: nil)
            }
        }
    }

    private static func display(_ value: String?, fallback: String = "Unknown") -> String {
        let cleaned = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return cleaned.isEmpty ? fallback : cleaned
    }

    private static func hasTimestamp(_ value: String?) -> Bool {
        !(value?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
    }

    private static func workflowSteps(for tow: Tow) -> [WorkflowStep] {
        var result: [WorkflowStep] = [.setupStartedAt]
        if tow.isWestRamp { result += [.goaaCalledAt, .goaaArrivalAt] }
        return result + [.towStartedAt, .towCompletedAt, .towPaperCompletedAt]
    }

    private static func currentStepLabel(for tow: Tow, steps: [WorkflowStep]) -> String {
        if let next = steps.first(where: { timestamp(for: $0, tow: tow) == nil }) { return "Next: \(next.label)" }
        return "Tow Paper Complete"
    }

    private static func timestamp(for step: WorkflowStep, tow: Tow) -> String? {
        let value: String?
        switch step {
        case .setupStartedAt: value = tow.setupStartedAt
        case .goaaCalledAt: value = tow.goaaCalledAt
        case .goaaArrivalAt: value = tow.goaaArrivalAt
        case .towStartedAt: value = tow.towStartedAt
        case .towCompletedAt: value = tow.towCompletedAt
        case .towPaperCompletedAt: value = tow.towPaperCompletedAt
        }
        guard let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return value
    }
}
