import Foundation

struct Workspace: Codable, Identifiable, Hashable {
    let id: UUID
    var name: String
    var serverURL: String
}

struct User: Codable, Identifiable {
    let id: Int
    let username: String
    var accountType: String?
    var autofill: Bool?
    var role: String?
    var canManageSettings: Bool?
    var canManageAutofill: Bool?
    var isSuperAdministrator: Bool?
    var isLocalAdministrator: Bool?
}

struct TokenResponse: Codable {
    let token: String
    let tokenType: String
    let expiresAt: String
    let user: User
}

struct MeResponse: Codable { let user: User? }

struct PaperDraftState: Codable, Equatable {
    var text: [String: String] = [:]
    var answers: [String: String] = [:]
    var risk: [String: String] = [:]
}

struct PaperDraft: Codable, Equatable {
    var state: PaperDraftState
    var revision: Int
    var updatedAt: String?
}

struct Tow: Codable, Identifiable, Hashable {
    let id: Int
    var airline: String
    var inboundFlightNumber: String?
    var inboundStation: String?
    var aircraftType: String?
    var eta: String?
    var gate: String?
    var fromLocation: String?
    var toLocation: String?
    var towSpot: String?
    var tailNumber: String?
    var driver: String?
    var leftWingWalker: String?
    var rightWingWalker: String?
    var otherTeamMembers: String?
    var notes: String?
    var status: String
    var needsReview: Bool
    var parserWarnings: [String]?
    var setupStartedAt: String?
    var goaaCalledAt: String?
    var goaaArrivalAt: String?
    var pushStartedAt: String?
    var towStartedAt: String?
    var towCompletedAt: String?
    var towPaperCompletedAt: String?
    var createdAt: String?
    var updatedAt: String?

    var isWestRamp: Bool {
        [toLocation, towSpot].compactMap { $0?.uppercased() }.contains { $0.hasPrefix("WR") }
    }
}

struct TowPage: Codable {
    let tows: [Tow]
    let page: Int
    let pageSize: Int
    let total: Int
    let totalPages: Int
}

struct Airline: Codable, Identifiable {
    var id: String { code }
    let code: String
    let name: String?
    let color: String?
    let aircraftTypes: [String]?
}

struct NewTow: Codable {
    var clientRequestId = UUID().uuidString
    var airline = ""
    var aircraftType = ""
    var gate = ""
    var towSpot = ""
    var tailNumber = ""
    var driver = ""
    var leftWingWalker = ""
    var rightWingWalker = ""
    var otherTeamMembers = ""
    var notes = ""
    var needsReview = false

    func offlineTow(id: Int) -> Tow {
        Tow(id: id, airline: airline, inboundFlightNumber: nil, inboundStation: nil,
            aircraftType: aircraftType, eta: nil, gate: gate, fromLocation: gate,
            toLocation: towSpot, towSpot: towSpot, tailNumber: tailNumber, driver: driver,
            leftWingWalker: leftWingWalker, rightWingWalker: rightWingWalker,
            otherTeamMembers: otherTeamMembers, notes: notes, status: "planned",
            needsReview: needsReview, parserWarnings: [], setupStartedAt: nil,
            goaaCalledAt: nil, goaaArrivalAt: nil, pushStartedAt: nil,
            towStartedAt: nil, towCompletedAt: nil, towPaperCompletedAt: nil,
            createdAt: ISO8601DateFormatter().string(from: Date()), updatedAt: nil)
    }
}

enum WorkflowStep: String, Codable, CaseIterable {
    case setupStartedAt, goaaCalledAt, goaaArrivalAt, towStartedAt, towCompletedAt, towPaperCompletedAt

    var label: String {
        switch self {
        case .setupStartedAt: "Start Tow Setup"
        case .goaaCalledAt: "GOAA Called"
        case .goaaArrivalAt: "GOAA Arrival"
        case .towStartedAt: "Tow Started"
        case .towCompletedAt: "Tow Completed"
        case .towPaperCompletedAt: "Tow Paper Complete"
        }
    }
}

enum PendingOperationKind: String, Codable { case createTow, updateTow, deleteTow, workflowStep, undoWorkflow, paperDraft }

struct PendingOperation: Codable, Identifiable {
    let id: UUID
    let kind: PendingOperationKind
    var towID: Int
    var step: WorkflowStep?
    let timestamp: String
    var newTow: NewTow?
    var paperState: PaperDraftState?
    var paperBaseState: PaperDraftState? = nil
    var paperRevision: Int?
    var towPayload: Tow?
    var deleteReason: String?
    var attempts: Int
}

struct OfflineSnapshot: Codable {
    var user: User?
    var active: [Tow] = []
    var history: [Tow] = []
    var drafts: [String: PaperDraft]? = [:]
    var airlines: [Airline]? = []
}
