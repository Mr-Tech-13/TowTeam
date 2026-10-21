import SwiftUI
import UIKit
import WebKit

private enum TowTheme {
    static let background = Color(red: 0.043, green: 0.071, blue: 0.125)
    static let surface = Color(red: 0.122, green: 0.161, blue: 0.216)
    static let border = Color(red: 0.58, green: 0.64, blue: 0.72).opacity(0.22)
    static let green = Color(red: 0.13, green: 0.77, blue: 0.37)
}

private struct TowFormStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .scrollContentBackground(.hidden)
            .background(TowTheme.background)
            .listSectionSpacing(12)
            .toolbarBackground(TowTheme.background, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
    }
}

private extension View {
    func towFormStyle() -> some View { modifier(TowFormStyle()) }
    func towRowStyle() -> some View {
        listRowBackground(TowTheme.surface)
            .listRowSeparatorTint(TowTheme.border)
    }
}

struct RootView: View {
    @EnvironmentObject var session: AppSession
    var body: some View {
        Group {
            if session.workspaces.isEmpty { WorkspaceSetupView(isInitialSetup: true) }
            else if session.user == nil { LoginView() }
            else { MainView() }
        }
            .tint(Color(red: 0.22, green: 0.78, blue: 0.49))
            .alert("TowTeam", isPresented: Binding(get: { session.errorMessage != nil }, set: { if !$0 { session.errorMessage = nil } })) {
                Button("OK") { session.errorMessage = nil }
            } message: { Text(session.errorMessage ?? "") }
    }
}

struct LoginView: View {
    @EnvironmentObject var session: AppSession
    @State private var username = ""
    @State private var password = ""
    @State private var working = false
    @State private var showingWorkspaces = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Workspace", selection: Binding(get: { session.selectedWorkspaceID }, set: { id in if let id { Task { await session.switchWorkspace(to: id) } } })) {
                        ForEach(session.workspaces) { workspace in Text(workspace.name).tag(Optional(workspace.id)) }
                    }
                    LabeledContent("Server", value: session.selectedWorkspace?.serverURL ?? "")
                    TextField("Username", text: $username).textInputAutocapitalization(.never)
                    SecureField("Password", text: $password)
                } header: { Text("Connect to TowTeam") }
                Button { Task { working = true; await session.signIn(username: username, password: password); working = false } } label: {
                    HStack { Spacer(); if working { ProgressView() } else { Text("Sign In").bold() }; Spacer() }
                }.disabled(working || username.isEmpty || password.isEmpty)
                Button("Manage Workspaces") { showingWorkspaces = true }
                Section { Text("Credentials are sent to your server. The returned session token is stored only in iOS Keychain.") }.font(.footnote)
            }
            .navigationTitle("TowTeam")
            .sheet(isPresented: $showingWorkspaces) { WorkspaceSetupView(isInitialSetup: false) }
        }
    }
}

struct MainView: View {
    @EnvironmentObject var session: AppSession
    var body: some View {
        TabView {
            TowListView(status: "active", title: "Active").tabItem { Label("Active", systemImage: "airplane") }
            SetupView().tabItem { Label("Setup", systemImage: "plus.circle") }
            TowListView(status: "completed", title: "History").tabItem { Label("History", systemImage: "clock.arrow.circlepath") }
            SettingsView().tabItem { Label("Settings", systemImage: "gearshape") }
        }
        .toolbarBackground(TowTheme.background, for: .tabBar)
        .toolbarBackground(.visible, for: .tabBar)
        .overlay(alignment: .top) {
            if session.pendingCount > 0 {
                HStack(spacing: 8) {
                    if session.syncTotal > 0 && session.connectionState == .syncing {
                        ProgressView(value: Double(session.syncCompleted), total: Double(session.syncTotal)).frame(width: 56)
                    } else { Image(systemName: "clock.arrow.circlepath") }
                    Text(session.syncStatusText).font(.caption.bold()).lineLimit(1)
                }
                .padding(.horizontal, 12).padding(.vertical, 7)
                .background(.orange, in: Capsule()).padding(.top, 4)
            }
        }
    }
}

struct TowListView: View {
    @EnvironmentObject var session: AppSession
    let status: String
    let title: String
    @State private var tows: [Tow] = []
    @State private var search = ""
    @State private var loading = false
    @State private var loadingMore = false
    @State private var page = 1
    @State private var totalPages = 1
    @State private var path: [Tow] = []

    var body: some View {
        NavigationStack(path: $path) {
            ZStack {
                TowTheme.background.ignoresSafeArea()
                if loading && tows.isEmpty { ProgressView() }
                else if tows.isEmpty { ContentUnavailableView("No \(title.lowercased()) tows", systemImage: "airplane") }
                else {
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(tows) { tow in
                                NavigationLink(value: tow) { TowRow(tow: tow) }.buttonStyle(.plain)
                            }
                            if page < totalPages {
                                Button { Task { await loadMore() } } label: {
                                    HStack { if loadingMore { ProgressView() }; Text(loadingMore ? "Loading…" : "Load More Tows").bold() }
                                        .frame(maxWidth: .infinity, minHeight: 48)
                                }
                                .buttonStyle(.bordered).tint(TowTheme.green).disabled(loadingMore)
                            }
                        }.padding(.horizontal, 14).padding(.vertical, 12)
                    }
                }
            }
            .navigationTitle(title)
            .navigationDestination(for: Tow.self) { tow in TowDetailView(initialTow: tow, onBackToMenu: { path.removeAll() }) }
            .searchable(text: $search, prompt: "Search tows")
            .onSubmit(of: .search) { Task { await load() } }
            .refreshable { await load() }
            .task { await load() }
            .onChange(of: session.pendingCount) { oldValue, newValue in
                if oldValue > 0 && newValue == 0 { Task { await load() } }
            }
            .toolbar {
                if status == "active" { ToolbarItem(placement: .topBarLeading) { ConnectionDot() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { Task { await load() } } label: { Image(systemName: "arrow.clockwise") }
                }
            }
        }
    }

    private func load() async {
        loading = true; defer { loading = false }
        page = 1
        let result = await session.loadTowPage(status: status, search: search, page: 1)
        tows = result.tows; totalPages = result.totalPages
    }
    private func loadMore() async {
        guard !loadingMore, page < totalPages else { return }
        loadingMore = true; defer { loadingMore = false }
        let next = page + 1
        let result = await session.loadTowPage(status: status, search: search, page: next)
        let existing = Set(tows.map(\.id))
        tows.append(contentsOf: result.tows.filter { !existing.contains($0.id) })
        page = result.page; totalPages = result.totalPages
    }
}

struct TowRow: View {
    let tow: Tow
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(tow.tailNumber.nilIfEmpty ?? "Aircraft Reg unknown").font(.title2.bold()).foregroundStyle(.white)
                Spacer()
                StatusPill(status: tow.status)
            }
            HStack { Label(tow.aircraftType.nilIfEmpty ?? "?", systemImage: "airplane"); Spacer(); Text(tow.airline).bold() }.foregroundStyle(.secondary)
            Label("\(tow.gate.nilIfEmpty ?? "?") → \(tow.towSpot.nilIfEmpty ?? "?")", systemImage: "mappin.and.ellipse").foregroundStyle(.white)
            if tow.needsReview { Label("Needs Review", systemImage: "exclamationmark.triangle.fill").foregroundStyle(.red).font(.subheadline.bold()) }
        }
        .padding(15).frame(maxWidth: .infinity, alignment: .leading)
        .background(TowTheme.surface, in: RoundedRectangle(cornerRadius: 8))
        .overlay { RoundedRectangle(cornerRadius: 8).stroke(tow.needsReview ? Color.red.opacity(0.8) : TowTheme.border, lineWidth: tow.needsReview ? 2 : 1) }
    }
}

private struct StatusPill: View {
    let status: String
    private var colors: (Color, Color) {
        switch status {
        case "completed": return (.green.opacity(0.18), Color(red: 0.73, green: 0.97, blue: 0.82))
        case "planned": return (.blue.opacity(0.22), Color(red: 0.75, green: 0.86, blue: 1))
        case "tow_completed": return (.white.opacity(0.12), .secondary)
        default: return (.orange.opacity(0.18), Color(red: 0.99, green: 0.90, blue: 0.54))
        }
    }
    var body: some View {
        Text(status.replacingOccurrences(of: "_", with: " ").uppercased())
            .font(.caption2.bold()).foregroundStyle(colors.1).padding(.horizontal, 9).padding(.vertical, 6)
            .background(colors.0, in: Capsule())
    }
}

struct TowDetailView: View {
    @EnvironmentObject var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @State var tow: Tow
    @State private var copied = false
    @State private var completedPaperURL: URL?
    @State private var preparingPaper = false
    @State private var showingEdit = false
    @State private var showingDelete = false
    @State private var showingUndo = false
    @State private var deleteReason = ""
    @State private var deleting = false
    let onBackToMenu: (() -> Void)?
    init(initialTow: Tow, onBackToMenu: (() -> Void)? = nil) { _tow = State(initialValue: initialTow); self.onBackToMenu = onBackToMenu }

    var steps: [WorkflowStep] {
        var result: [WorkflowStep] = [.setupStartedAt]
        if tow.isWestRamp { result += [.goaaCalledAt, .goaaArrivalAt] }
        return result + [.towStartedAt, .towCompletedAt, .towPaperCompletedAt]
    }

    var body: some View {
        List {
            Section {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(tow.tailNumber.nilIfEmpty ?? "Aircraft Reg unknown").font(.title2.bold())
                        Text([tow.airline, tow.aircraftType.nilIfEmpty].compactMap { $0 }.joined(separator: " · "))
                            .font(.subheadline.bold()).foregroundStyle(.secondary)
                    }
                    Spacer()
                    StatusPill(status: tow.status)
                }
                if tow.needsReview {
                    Label("Needs Review", systemImage: "exclamationmark.triangle.fill")
                        .font(.subheadline.bold()).foregroundStyle(.red)
                }
                LabeledContent("Tow from", value: tow.gate.nilIfEmpty ?? "Unknown")
                LabeledContent("Tow to", value: tow.towSpot.nilIfEmpty ?? "Unknown")
                NavigationLink { PaperEditorView(tow: tow) } label: { Label("Edit Tow Paper", systemImage: "doc.text") }
            }.towRowStyle()
            Section("Workflow") {
                ForEach(Array(steps.enumerated()), id: \.element) { index, step in
                    WorkflowRow(step: step, timestamp: timestamp(for: step), enabled: steps.prefix(index).allSatisfy { timestamp(for: $0) != nil }) {
                        if let updated = await session.log(towID: tow.id, step: step) { tow = updated }
                    }
                }
                if steps.contains(where: { timestamp(for: $0) != nil }) {
                    Button(role: .destructive) { showingUndo = true } label: {
                        Label("Undo Last Step", systemImage: "arrow.uturn.backward")
                    }
                }
            }.towRowStyle()
            if tow.towCompletedAt.nilIfEmpty != nil {
                Section("Completion Summary") {
                    Text(summary).font(.body.monospaced())
                    Button {
                        UIPasteboard.general.string = summary
                        copied = true
                        Task { try? await Task.sleep(for: .seconds(2)); copied = false }
                    } label: { Label(copied ? "Copied" : "Copy to Clipboard", systemImage: copied ? "checkmark" : "doc.on.doc") }
                }.towRowStyle()
                Section("Completed Tow Paper") {
                    if let completedPaperURL {
                        ShareLink(item: completedPaperURL) {
                            Label("Share Completed PDF", systemImage: "square.and.arrow.up")
                        }
                    } else {
                        Button {
                            Task {
                                preparingPaper = true
                                completedPaperURL = await session.completedPaperURL(towID: tow.id)
                                preparingPaper = false
                            }
                        } label: {
                            if preparingPaper { HStack { ProgressView(); Text("Preparing PDF…") } }
                            else { Label("Prepare Completed PDF", systemImage: "doc.badge.arrow.up") }
                        }
                        .disabled(preparingPaper)
                    }
                    Text("Pending tow-paper changes are synchronized before the completed PDF is generated.")
                        .font(.caption).foregroundStyle(.secondary)
                }.towRowStyle()
            }
        }
        .listStyle(.insetGrouped)
        .towFormStyle()
        .navigationTitle(tow.tailNumber.nilIfEmpty ?? "Tow")
        .navigationBarBackButtonHidden(onBackToMenu != nil)
        .toolbar {
            if let onBackToMenu {
                ToolbarItem(placement: .topBarLeading) {
                    Button(action: onBackToMenu) { Label("Back", systemImage: "chevron.left") }
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button { showingEdit = true } label: { Label("Edit Tow Details", systemImage: "pencil") }
                    Button(role: .destructive) { showingDelete = true } label: { Label("Move to Trash", systemImage: "trash") }
                } label: { Image(systemName: "ellipsis.circle") }
            }
        }
        .sheet(isPresented: $showingEdit) {
            EditTowView(tow: tow) { updated in tow = updated }
        }
        .alert("Move Tow to Trash", isPresented: $showingDelete) {
            TextField("Reason required", text: $deleteReason)
            Button("Cancel", role: .cancel) { deleteReason = "" }
            Button("Delete", role: .destructive) {
                Task {
                    deleting = true
                    if await session.deleteTow(tow, reason: deleteReason) { dismiss() }
                    deleting = false
                }
            }.disabled(deleteReason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || deleting)
        } message: { Text("The tow will be removed from Active or History. Administrators can restore synchronized tows from Trash.") }
        .confirmationDialog("Undo the most recently completed workflow step?", isPresented: $showingUndo, titleVisibility: .visible) {
            Button("Undo Last Step", role: .destructive) {
                Task {
                    if let updated = await session.undoLastStep(towID: tow.id) {
                        tow = updated
                        completedPaperURL = nil
                    }
                }
            }
            Button("Cancel", role: .cancel) {}
        }
        .task {
            if let fresh = await session.getTow(id: tow.id) { tow = fresh }
        }
    }

    private func timestamp(for step: WorkflowStep) -> String? {
        switch step {
        case .setupStartedAt: tow.setupStartedAt.nilIfEmpty
        case .goaaCalledAt: tow.goaaCalledAt.nilIfEmpty
        case .goaaArrivalAt: tow.goaaArrivalAt.nilIfEmpty
        case .towStartedAt: tow.towStartedAt.nilIfEmpty
        case .towCompletedAt: tow.towCompletedAt.nilIfEmpty
        case .towPaperCompletedAt: tow.towPaperCompletedAt.nilIfEmpty
        }
    }
    private var summary: String {
        var lines = [tow.tailNumber.nilIfEmpty ?? "Aircraft Reg unknown",
                     "From \(tow.gate.nilIfEmpty ?? "Unknown") to \(tow.towSpot.nilIfEmpty ?? "Unknown")"]
        if let start = tow.towStartedAt?.towDate, let finish = tow.towCompletedAt?.towDate {
            lines.append("\(start.easternTime)-\(finish.easternTime)")
        }
        lines.append("Tractor Driver \(tow.driver.nilIfEmpty ?? "")")
        lines.append("Wing Walker LH \(tow.leftWingWalker.nilIfEmpty ?? "")")
        lines.append("Wing Walker RH \(tow.rightWingWalker.nilIfEmpty ?? "")")
        if let others = tow.otherTeamMembers.nilIfEmpty { lines.append("Other Team: \(others)") }
        if let date = (tow.towCompletedAt ?? tow.createdAt)?.towDate { lines.append(date.easternDate) }
        return lines.joined(separator: "\n")
    }
}

struct EditTowView: View {
    @EnvironmentObject var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @State var tow: Tow
    @State private var airlines: [Airline] = []
    @State private var saving = false
    let onSaved: (Tow) -> Void

    private var aircraftTypes: [String] { airlines.first { $0.code.caseInsensitiveCompare(tow.airline) == .orderedSame }?.aircraftTypes ?? [] }

    var body: some View {
        NavigationStack {
            Form {
                Section("Aircraft") {
                    Picker("Airline", selection: $tow.airline) {
                        if !tow.airline.isEmpty && !airlines.contains(where: { $0.code == tow.airline }) { Text(tow.airline).tag(tow.airline) }
                        ForEach(airlines) { airline in Text(airline.name.nilIfEmpty.map { "\(airline.code) – \($0)" } ?? airline.code).tag(airline.code) }
                    }
                    Picker("Aircraft type", selection: optionalBinding(\.aircraftType)) {
                        Text("Select aircraft type").tag("")
                        if let current = tow.aircraftType.nilIfEmpty, !aircraftTypes.contains(current) { Text(current).tag(current) }
                        ForEach(aircraftTypes, id: \.self) { Text($0).tag($0) }
                    }
                    TextField("Aircraft Reg", text: optionalBinding(\.tailNumber)).textInputAutocapitalization(.characters)
                    TextField("Inbound flight number", text: optionalBinding(\.inboundFlightNumber))
                    TextField("ETA", text: optionalBinding(\.eta))
                }.towRowStyle()
                Section("Route") { TextField("Tow from", text: optionalBinding(\.gate)); TextField("Tow to", text: optionalBinding(\.towSpot)) }.towRowStyle()
                Section("Team") {
                    TextField("Tractor Driver", text: optionalBinding(\.driver))
                    TextField("Wing Walker LH", text: optionalBinding(\.leftWingWalker))
                    TextField("Wing Walker RH", text: optionalBinding(\.rightWingWalker))
                    TextField("Other team members", text: optionalBinding(\.otherTeamMembers))
                }.towRowStyle()
                Section { TextField("Notes", text: optionalBinding(\.notes), axis: .vertical); Toggle("Needs Review", isOn: $tow.needsReview) }.towRowStyle()
            }
            .towFormStyle()
            .navigationTitle("Edit Tow")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button(saving ? "Saving…" : "Save") { Task { await save() } }.disabled(saving || tow.airline.isEmpty) }
            }
            .task { airlines = await session.loadAirlines() }
        }
    }

    private func optionalBinding(_ keyPath: WritableKeyPath<Tow, String?>) -> Binding<String> {
        Binding(get: { tow[keyPath: keyPath] ?? "" }, set: { tow[keyPath: keyPath] = $0 })
    }
    private func save() async {
        saving = true; defer { saving = false }
        if let updated = await session.updateTow(tow) { onSaved(updated); dismiss() }
    }
}

struct WorkflowRow: View {
    let step: WorkflowStep
    let timestamp: String?
    let enabled: Bool
    let action: () async -> Void
    @State private var working = false
    var body: some View {
        HStack {
            Image(systemName: timestamp == nil ? "circle" : "checkmark.circle.fill")
                .foregroundStyle(timestamp == nil ? Color.secondary : Color.green)
            VStack(alignment: .leading) { Text(step.label).bold(); if let timestamp { Text(timestamp.formattedTowDate).font(.caption).foregroundStyle(.secondary) } }
            Spacer()
            if timestamp == nil {
                Button { Task { working = true; await action(); working = false } } label: {
                    HStack { if working { ProgressView() }; Text(working ? "Logging…" : "Log").bold() }
                        .frame(minWidth: 76, minHeight: 36)
                }
                .buttonStyle(.borderedProminent).tint(TowTheme.green).disabled(!enabled || working)
            }
        }
    }
}

struct SetupView: View {
    @EnvironmentObject var session: AppSession
    @State private var tow = NewTow()
    @State private var created: Tow?
    @State private var working = false
    @State private var airlines: [Airline] = []
    private var aircraftTypes: [String] {
        airlines.first { $0.code.caseInsensitiveCompare(tow.airline) == .orderedSame }?.aircraftTypes ?? []
    }
    var body: some View {
        NavigationStack {
            Form {
                Section("Aircraft") {
                    Picker("Airline", selection: $tow.airline) {
                        Text("Select airline").tag("")
                        ForEach(airlines) { airline in
                            Text(airline.name.nilIfEmpty.map { "\(airline.code) – \($0)" } ?? airline.code).tag(airline.code)
                        }
                    }
                    Picker("Aircraft type", selection: $tow.aircraftType) {
                        Text("Select aircraft type").tag("")
                        ForEach(aircraftTypes, id: \.self) { type in Text(type).tag(type) }
                    }
                    .disabled(tow.airline.isEmpty || aircraftTypes.isEmpty)
                    if !tow.airline.isEmpty && aircraftTypes.isEmpty {
                        Text("No aircraft types are configured for this airline.").font(.caption).foregroundStyle(.secondary)
                    }
                    TextField("Aircraft Reg", text: $tow.tailNumber).textInputAutocapitalization(.characters)
                }.towRowStyle()
                Section("Route") { TextField("Tow from", text: $tow.gate); TextField("Tow to", text: $tow.towSpot) }.towRowStyle()
                Section("Team") { TextField("Tractor Driver", text: $tow.driver); TextField("Wing Walker LH", text: $tow.leftWingWalker); TextField("Wing Walker RH", text: $tow.rightWingWalker); TextField("Other team members", text: $tow.otherTeamMembers) }.towRowStyle()
                Section { TextField("Notes", text: $tow.notes, axis: .vertical); Toggle("Needs Review", isOn: $tow.needsReview) }.towRowStyle()
                Button { Task { await save() } } label: { HStack { Spacer(); if working { ProgressView() } else { Text("Create Tow").bold() }; Spacer() } }
                    .buttonStyle(.borderedProminent).tint(TowTheme.green).listRowBackground(Color.clear)
                    .disabled(tow.airline.trimmingCharacters(in: .whitespaces).isEmpty || working)
            }.towFormStyle().navigationTitle("Setup")
            .navigationDestination(item: $created) { TowDetailView(initialTow: $0, onBackToMenu: { created = nil }) }
            .task { airlines = await session.loadAirlines() }
            .onChange(of: tow.airline) { _, _ in
                if !aircraftTypes.contains(tow.aircraftType) { tow.aircraftType = "" }
            }
        }
    }
    private func save() async { working = true; defer { working = false }; if let saved = await session.createTow(tow) { created = saved; tow = NewTow() } }
}

struct ConnectionDot: View {
    @EnvironmentObject var session: AppSession
    private var color: Color {
        if session.pendingCount > 0 || session.connectionState == .syncing { return .yellow }
        return session.connectionState == .online ? .green : .red
    }
    private var label: String {
        if session.pendingCount > 0 || session.connectionState == .syncing { return "Syncing pending changes" }
        return session.connectionState == .online ? "Connected" : "Offline"
    }
    var body: some View {
        Circle().fill(color).frame(width: 9, height: 9).accessibilityLabel(label).help(label)
    }
}

struct PaperEditorView: View {
    @EnvironmentObject var session: AppSession
    let tow: Tow
    @State private var draft = PaperDraft(state: PaperDraftState(), revision: 0, updatedAt: nil)
    @State private var baseState = PaperDraftState()
    @State private var loaded = false
    @State private var saving = false
    @State private var saveTask: Task<Void, Never>?
    @State private var selectedPage = 0
    @State private var confirmReset = false

    private let groups = [("TTWS", 0..<4), ("Preparation", 4..<14), ("During Tow", 14..<19), ("Completion", 19..<25)]
    private let commentKeys = ["undefined_2", "undefined_4", "undefined_6", "undefined_8",
        "If  comment why Is the tow safe to proceed", "undefined_11", "undefined_13", "undefined_15", "undefined_17", "undefined_19", "undefined_20",
        "undefined_21", "undefined_23", "If  comment why Is the tow safe to proceed_2", "undefined_26", "undefined_28", "undefined_30", "undefined_32",
        "If  comment why Is tow safe to proceed", "undefined_36", "undefined_38", "undefined_40", "undefined_42", "undefined_44", "undefined_46"]
    private let detailKeys = ["Airline", "Aircraft Reg", "Aircraft Type", "Date", "Start Time", "Finish Time", "Tow from", "Tow to", "Tractor Driver", "Wing Walker LH", "Brake Operator", "Wing Walker RH", "Headset Operator", "Tail Walker", "Other team", "SupervisorManagers name"]
    private let checklistItems = [
        "Are all TTWS equipment linked (wands with alarm system)?",
        "Have you tested the TTWS alarm and warning light prior to tow operations?",
        "Do the wands have serviceable batteries, or have they been charged to operate?",
        "Has a brief with the tow team been conducted on proper TTWS procedures?",
        "Have you carried out an aircraft walk-around, and have any hazards been removed?",
        "Are the landing gear safety pins and steering bypass pin in place?",
        "Have you visually inspected the front landing gear tow fitting to ensure it isn't damaged (crack, chip, warp, or broken)?",
        "If any aircraft damage is located, have you informed the airline maintenance personnel and your leadership?",
        "Has the brake operator carried out the pre-tow flight deck checklist, if required?",
        "Have you established and tested headset communication with the brake operator?",
        "Have you conducted a briefing with all persons involved in the aircraft movement?",
        "Are wing walkers in possession of TTWS and has the alarm functionality been tested?",
        "Is the stand free of equipment, with chocks and cones removed?",
        "Has ATC given clearance to start moving the aircraft?",
        "Is the headset operator walking on the ramp to monitor clearance during pushback?",
        "Have apron lines and towing speed limits been followed to ensure safe obstacle clearance?",
        "Has visual contact with the connection point and communication with the brake operator been maintained?",
        "When approaching the final position, is the area clear of equipment and FOD, with wing walkers in place?",
        "If an Amber non-standard tow was agreed, is the Supervisor or Manager present during final approach to the designated aircraft parking spot?",
        "Has the brake operator been advised of the final position and asked to set the aircraft brakes?",
        "Has ATC been informed that towing is completed and the frequency will be left?",
        "Have all relevant GSE, chocks, and cones been put in place to secure the aircraft?",
        "Has the brake operator carried out the post-towing flight deck checklist, if required?",
        "Has the nose wheel steering bypass pin been removed and steering reactivated?",
        "Has all TTWS equipment been collected and placed in the hard case for storage until the next tow operation?"
    ]

    var body: some View {
        Form {
            Section("Editable Tow Paper") {
                Text("All fields and checklist items are stored on this device while you edit. The completed draft synchronizes after you leave the editor or reconnect.")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            Section {
                Picker("Paper section", selection: $selectedPage) {
                    Text("Details & Risk").tag(0); Text("TTWS & Preparation").tag(1); Text("Tow & Completion").tag(2)
                }.pickerStyle(.segmented)
                HStack {
                    if session.user?.autofill == true {
                        Button("CHECKLIST") { applyLocalAutofill() }.buttonStyle(.plain).font(.subheadline.bold())
                    } else { Text("Checklist").font(.subheadline.bold()) }
                    Text("\(answeredCount) / 25 answered").foregroundStyle(.secondary)
                    Spacer()
                    if saving { ProgressView().controlSize(.small); Text("Saving…").font(.caption) }
                    else if session.pendingCount > 0 { Label("Pending sync", systemImage: "clock").font(.caption).foregroundStyle(.yellow) }
                }
            }
            if selectedPage == 0 { detailsAndRisk } else { checklist }
            Section {
                Button("Reset Risk and Checklist", role: .destructive) { confirmReset = true }
            }
        }
        .navigationTitle("Tow Paper")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            draft = await session.loadPaperDraft(towID: tow.id)
            baseState = draft.state
            loaded = true
        }
        .onChange(of: draft.state) { _, _ in scheduleSave() }
        .onDisappear {
            saveTask?.cancel()
            if loaded {
                draft = session.stagePaperDraft(towID: tow.id, state: draft.state, baseState: baseState, revision: draft.revision)
                Task { await session.flushQueue() }
            }
        }
        .confirmationDialog("Reset checklist answers, risk selections, and exception comments? Tow details will remain.", isPresented: $confirmReset, titleVisibility: .visible) {
            Button("Reset", role: .destructive) { resetPaper() }; Button("Cancel", role: .cancel) {}
        }
    }

    private var detailsAndRisk: some View {
        Group {
            Section("Tow Details") {
                ForEach(detailKeys, id: \.self) { key in TextField(key, text: textBinding(key)).textInputAutocapitalization(.words) }
            }
            Section("Risk Assessment") {
                RiskPicker(title: "Tow from", selection: riskBinding("Tow from"))
                RiskPicker(title: "Tow to", selection: riskBinding("Tow to"))
                RiskPicker(title: "Final agreed status", selection: riskBinding("Final agreed status"))
            }
        }
    }

    private var checklist: some View {
        Group {
            ForEach(Array(groups.enumerated()), id: \.offset) { _, group in
                if (selectedPage == 1 && group.1.lowerBound < 14) || (selectedPage == 2 && group.1.lowerBound >= 14) {
                    Section(group.0) {
                        if group.0 == "TTWS" { TextField("TTWS tester full name and time", text: textBinding("Full Name")) }
                        ForEach(Array(group.1), id: \.self) { index in
                            ChecklistItem(title: checklistItems[index], answer: answerBinding(index), comment: textBinding(commentKeys[index]))
                        }
                    }
                }
            }
        }
    }

    private var answeredCount: Int { draft.state.answers.values.filter { !$0.isEmpty }.count }
    private func textBinding(_ key: String) -> Binding<String> { Binding(get: { draft.state.text[key] ?? "" }, set: { draft.state.text[key] = String($0.prefix(150)) }) }
    private func answerBinding(_ index: Int) -> Binding<String> { Binding(get: { draft.state.answers[String(index)] ?? "" }, set: { draft.state.answers[String(index)] = $0 }) }
    private func riskBinding(_ key: String) -> Binding<String> { Binding(get: { draft.state.risk[key] ?? "" }, set: { draft.state.risk[key] = $0 }) }
    private func scheduleSave() {
        guard loaded else { return }
        saveTask?.cancel()
        saveTask = Task {
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            await MainActor.run {
                saving = true
                draft = session.stagePaperDraft(towID: tow.id, state: draft.state, baseState: baseState, revision: draft.revision)
                saving = false
            }
        }
    }
    private func applyLocalAutofill() {
        let airline = tow.airline.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        let type = (tow.aircraftType ?? "").uppercased().filter { $0.isLetter || $0.isNumber }
        let noPin = type.hasPrefix("A220") || (type.isEmpty && airline == "MX")
        var exceptions: [Int: (String, String)] = [14: ("undefined_26", "In Pushback")]
        if noPin {
            exceptions[5] = ("undefined_11", "N/A")
            exceptions[23] = ("undefined_44", "N/A - No bypass pin")
        } else if airline == "EK" {
            exceptions[23] = ("undefined_44", "Bypass pin left in")
        }
        for index in 0..<25 where (draft.state.answers[String(index)] ?? "").isEmpty {
            draft.state.answers[String(index)] = exceptions[index] == nil ? "yes" : "no"
            if let (field, comment) = exceptions[index], (draft.state.text[field] ?? "").isEmpty { draft.state.text[field] = comment }
        }
        for field in ["Tow from", "Tow to", "Final agreed status"] where (draft.state.risk[field] ?? "").isEmpty { draft.state.risk[field] = "green" }
        scheduleSave()
    }
    private func resetPaper() {
        draft.state.answers = [:]; draft.state.risk = [:]
        for key in commentKeys { draft.state.text.removeValue(forKey: key) }
    }
}

struct RiskPicker: View {
    let title: String
    @Binding var selection: String
    var body: some View {
        VStack(alignment: .leading) {
            Text(title).font(.subheadline.bold())
            Picker(title, selection: $selection) { Text("None").tag(""); Text("Red").tag("red"); Text("Amber").tag("amber"); Text("Green").tag("green") }.pickerStyle(.segmented)
        }
    }
}

struct ChecklistItem: View {
    let title: String
    @Binding var answer: String
    @Binding var comment: String
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.subheadline.bold())
            Picker(title, selection: $answer) { Text("—").tag(""); Text("Yes").tag("yes"); Text("No").tag("no") }.pickerStyle(.segmented)
            TextField("Exception comment", text: $comment, axis: .vertical)
        }.padding(.vertical, 4)
    }
}

struct SettingsView: View {
    @EnvironmentObject var session: AppSession
    @State private var showingWorkspaces = false
    var body: some View {
        NavigationStack {
            Form {
                Section("Signed in") {
                    LabeledContent("Username", value: session.user?.username ?? "")
                    LabeledContent("Workspace", value: session.selectedWorkspace?.name ?? "")
                    LabeledContent("Server", value: session.selectedWorkspace?.serverURL ?? "")
                }
                Section("Workspace") {
                    Picker("Switch workspace", selection: Binding(get: { session.selectedWorkspaceID }, set: { id in if let id { Task { await session.switchWorkspace(to: id) } } })) {
                        ForEach(session.workspaces) { workspace in Text(workspace.name).tag(Optional(workspace.id)) }
                    }
                    Button("Add or Remove Workspaces") { showingWorkspaces = true }
                }
                Section("TowTeam Web App") {
                    NavigationLink {
                        WebAdministrationView()
                    } label: {
                        Label(session.user?.role == "admin" ? "Administration & Settings" : "Open Full Web App", systemImage: "gearshape.2")
                    }
                    Text("Opens the complete web interface using this workspace and your current secure session.").font(.caption).foregroundStyle(.secondary)
                }
                Section {
                    Button("Retry Pending Actions") { Task { await session.flushQueue() } }
                    Button("Sign Out", role: .destructive) { Task { await session.signOut() } }
                }
            }
            .navigationTitle("Settings")
            .sheet(isPresented: $showingWorkspaces) { WorkspaceSetupView(isInitialSetup: false) }
        }
    }
}

struct WebAdministrationView: View {
    @EnvironmentObject var session: AppSession
    var body: some View {
        Group {
            if let access = session.webSession {
                AuthenticatedWebView(baseURL: access.url, token: access.token, openAdministration: session.user?.role == "admin")
                    .ignoresSafeArea(edges: .bottom)
            } else {
                ContentUnavailableView("Web app unavailable", systemImage: "wifi.slash", description: Text("Sign in to this workspace before opening the web app."))
            }
        }
        .navigationTitle(session.user?.role == "admin" ? "Administration" : "TowTeam Web")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct AuthenticatedWebView: UIViewRepresentable {
    let baseURL: URL
    let token: String
    let openAdministration: Bool

    func makeCoordinator() -> Coordinator { Coordinator(openAdministration: openAdministration) }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        guard let host = baseURL.host else { return webView }
        var properties: [HTTPCookiePropertyKey: Any] = [
            .name: "towteam_session", .value: token, .domain: host, .path: "/",
            .expires: Date().addingTimeInterval(14 * 24 * 60 * 60),
            HTTPCookiePropertyKey(rawValue: "HttpOnly"): "TRUE",
            HTTPCookiePropertyKey(rawValue: "SameSite"): "Lax"
        ]
        if baseURL.scheme?.lowercased() == "https" { properties[.secure] = "TRUE" }
        if let cookie = HTTPCookie(properties: properties) {
            webView.configuration.websiteDataStore.httpCookieStore.setCookie(cookie) {
                webView.load(URLRequest(url: baseURL))
            }
        } else {
            webView.load(URLRequest(url: baseURL))
        }
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate {
        let openAdministration: Bool
        private var opened = false
        init(openAdministration: Bool) { self.openAdministration = openAdministration }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            guard openAdministration, !opened else { return }
            opened = true
            webView.evaluateJavaScript("document.querySelector('button[title=\\\"Users\\\"]')?.click()")
        }
    }
}

struct WorkspaceSetupView: View {
    @EnvironmentObject var session: AppSession
    @Environment(\.dismiss) private var dismiss
    let isInitialSetup: Bool
    @State private var name = ""
    @State private var serverURL = ""

    var body: some View {
        NavigationStack {
            Form {
                if !session.workspaces.isEmpty {
                    Section("Saved Workspaces") {
                        ForEach(session.workspaces) { workspace in
                            Button {
                                Task { await session.switchWorkspace(to: workspace.id); if !isInitialSetup { dismiss() } }
                            } label: {
                                VStack(alignment: .leading, spacing: 3) {
                                    HStack { Text(workspace.name).foregroundStyle(.primary); if workspace.id == session.selectedWorkspaceID { Image(systemName: "checkmark").foregroundStyle(.green) } }
                                    Text(workspace.serverURL).font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                        .onDelete { offsets in
                            let removed = offsets.map { session.workspaces[$0] }
                            Task { for workspace in removed { await session.deleteWorkspace(workspace) } }
                        }
                    }
                }
                Section("Add Workspace") {
                    TextField("Workspace name", text: $name)
                    TextField("Server URL", text: $serverURL).textInputAutocapitalization(.never).keyboardType(.URL)
                    Button("Save Workspace") {
                        if session.addWorkspace(name: name, serverURL: serverURL) {
                            name = ""; serverURL = ""
                            if !isInitialSetup { dismiss() }
                        }
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || serverURL.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                Section { Text("Example: https://towteam.example.com\n\nUse HTTPS for production and physical devices. Each workspace stores its own session securely in Keychain.") }.font(.footnote)
            }
            .navigationTitle(isInitialSetup ? "Add Workspace" : "Workspaces")
            .toolbar { if !isInitialSetup { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } } }
        }
        .interactiveDismissDisabled(!isInitialSetup && session.workspaces.isEmpty)
    }
}

private extension Optional where Wrapped == String { var nilIfEmpty: String? { self?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? self : nil } }
private extension String {
    var towDate: Date? { ISO8601DateFormatter().date(from: self) }
    var formattedTowDate: String {
        guard let date = ISO8601DateFormatter().date(from: self) else { return self }
        return date.formatted(date: .abbreviated, time: .shortened)
    }
}
private extension Date {
    var easternTime: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "America/New_York")
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: self)
    }
    var easternDate: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "America/New_York")
        formatter.dateFormat = "M/d/yy"
        return formatter.string(from: self)
    }
}
