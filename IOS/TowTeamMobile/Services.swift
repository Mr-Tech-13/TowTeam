import Foundation
import Combine
import Network
import Security

enum AppError: LocalizedError {
    case invalidServer, invalidResponse, network, server(String), unauthorized
    var errorDescription: String? {
        switch self {
        case .invalidServer: "Enter a valid TowTeam server URL."
        case .invalidResponse: "The server returned an unexpected response."
        case .network: "The TowTeam server is unavailable."
        case .server(let message): message
        case .unauthorized: "Your session expired. Please sign in again."
        }
    }
}

enum ConnectionState { case offline, online, syncing }

final class KeychainStore {
    private let service = "com.towteam.mobile"
    func save(_ token: String, workspaceID: UUID) throws {
        delete(workspaceID: workspaceID)
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service, kSecAttrAccount as String: workspaceID.uuidString,
            kSecValueData as String: Data(token.utf8), kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        guard SecItemAdd(query as CFDictionary, nil) == errSecSuccess else { throw AppError.invalidResponse }
    }
    func load(workspaceID: UUID) -> String? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service, kSecAttrAccount as String: workspaceID.uuidString,
            kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    func delete(workspaceID: UUID) {
        SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                       kSecAttrAccount as String: workspaceID.uuidString] as CFDictionary)
    }
}

actor APIClient {
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()
    private var baseURL: URL?
    private var token: String?

    func configure(server: String, token: String?) throws {
        guard let url = URL(string: server.trimmingCharacters(in: .whitespacesAndNewlines)),
              ["http", "https"].contains(url.scheme?.lowercased() ?? "") else { throw AppError.invalidServer }
        baseURL = url; self.token = token
    }

    private func data(_ path: String, method: String = "GET", body: Data? = nil) async throws -> Data {
        guard let url = URL(string: "api\(path)", relativeTo: baseURL) else { throw AppError.invalidServer }
        var request = URLRequest(url: url)
        request.httpMethod = method; request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let result: (Data, URLResponse)
        do { result = try await URLSession.shared.data(for: request) }
        catch { throw AppError.network }
        guard let http = result.1 as? HTTPURLResponse else { throw AppError.invalidResponse }
        if http.statusCode == 401 { throw AppError.unauthorized }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? decoder.decode([String: String].self, from: result.0)["error"]) ?? "Request failed (\(http.statusCode))."
            throw AppError.server(message)
        }
        return result.0
    }

    private func request<T: Decodable>(_ path: String, method: String = "GET", body: Data? = nil) async throws -> T {
        try decoder.decode(T.self, from: await data(path, method: method, body: body))
    }
    func login(username: String, password: String) async throws -> TokenResponse { try await request("/auth/token", method: "POST", body: encoder.encode(["username": username, "password": password])) }
    func me() async throws -> MeResponse { try await request("/auth/me") }
    func logout() async throws { _ = try await data("/auth/logout", method: "POST", body: Data("{}".utf8)) }
    func airlines() async throws -> [Airline] { try await request("/airlines") }
    func tows(status: String, search: String = "", page: Int = 1, pageSize: Int = 25) async throws -> TowPage {
        var components = URLComponents()
        components.queryItems = [URLQueryItem(name: "status", value: status), URLQueryItem(name: "search", value: search), URLQueryItem(name: "paginated", value: "true"), URLQueryItem(name: "page", value: String(page)), URLQueryItem(name: "pageSize", value: String(pageSize))]
        return try await request("/tows?\(components.percentEncodedQuery ?? "")")
    }
    func tow(id: Int) async throws -> Tow { try await request("/tows/\(id)") }
    func create(_ tow: NewTow) async throws -> Tow { try await request("/tows", method: "POST", body: encoder.encode(tow)) }
    func update(_ tow: Tow) async throws -> Tow { try await request("/tows/\(tow.id)", method: "PUT", body: encoder.encode(tow)) }
    func delete(towID: Int, reason: String) async throws { _ = try await data("/tows/\(towID)", method: "DELETE", body: encoder.encode(["reason": reason])) }
    func log(towID: Int, step: WorkflowStep, timestamp: String) async throws -> Tow { try await request("/tows/\(towID)/steps/\(step.rawValue)", method: "POST", body: encoder.encode(["timestamp": timestamp])) }
    func undoLastStep(towID: Int) async throws -> Tow { try await request("/tows/\(towID)/steps/undo", method: "POST", body: Data("{}".utf8)) }
    func paperDraft(towID: Int) async throws -> PaperDraft { try await request("/tows/\(towID)/paper-draft") }
    func savePaperDraft(towID: Int, state: PaperDraftState, revision: Int) async throws -> PaperDraft {
        struct Body: Encodable { let state: PaperDraftState; let revision: Int }
        return try await request("/tows/\(towID)/paper-draft", method: "PUT", body: encoder.encode(Body(state: state, revision: revision)))
    }
    func autofillPaper(towID: Int, revision: Int) async throws -> PaperDraft { try await request("/tows/\(towID)/paper-draft/autofill", method: "POST", body: encoder.encode(["revision": revision])) }
    func paper(towID: Int) async throws -> Data { try await data("/tows/\(towID)/tow-checklist.pdf") }
    func paperPage(_ page: Int) async throws -> Data { try await data("/paper-editor/assets/page-\(page).png") }
}

@MainActor
final class AppSession: ObservableObject {
    @Published var user: User?
    @Published private(set) var workspaces: [Workspace] = []
    @Published private(set) var selectedWorkspaceID: UUID?
    @Published var errorMessage: String?
    @Published private(set) var pendingCount = 0
    @Published private(set) var connectionState: ConnectionState = .offline
    @Published private(set) var syncCompleted = 0
    @Published private(set) var syncTotal = 0
    @Published private(set) var syncDetail: String?
    let api = APIClient()
    private let keychain = KeychainStore()
    private let monitor = NWPathMonitor()
    private let workspaceKey = "towteam.workspaces"
    private let selectedWorkspaceKey = "towteam.selectedWorkspace"
    private var flushing = false
    private var workspaceEpoch = 0
    private var appSupport: URL { FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0] }
    private var workspacePrefix: String { selectedWorkspaceID?.uuidString ?? "unselected" }
    private var queueURL: URL { appSupport.appendingPathComponent("workflow-queue-\(workspacePrefix).json") }
    private var snapshotURL: URL { appSupport.appendingPathComponent("snapshot-\(workspacePrefix).json") }
    private var papersDirectory: URL { appSupport.appendingPathComponent("completed-papers-\(workspacePrefix)", isDirectory: true) }
    var selectedWorkspace: Workspace? { workspaces.first { $0.id == selectedWorkspaceID } }
    var syncStatusText: String {
        if flushing && syncTotal > 0 { return "Syncing \(syncCompleted) of \(syncTotal) changes" }
        if let syncDetail, pendingCount > 0 { return syncDetail }
        if pendingCount > 0 { return "\(pendingCount) change\(pendingCount == 1 ? "" : "s") waiting to sync" }
        return connectionState == .offline ? "Offline" : "Connected"
    }
    var webSession: (url: URL, token: String)? {
        guard let workspace = selectedWorkspace, let url = URL(string: workspace.serverURL),
              let token = keychain.load(workspaceID: workspace.id) else { return nil }
        return (url, token)
    }

    init() {
        if let data = UserDefaults.standard.data(forKey: workspaceKey) { workspaces = (try? JSONDecoder().decode([Workspace].self, from: data)) ?? [] }
        selectedWorkspaceID = UserDefaults.standard.string(forKey: selectedWorkspaceKey).flatMap(UUID.init(uuidString:)) ?? workspaces.first?.id
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                guard let self else { return }
                if path.status == .satisfied { await self.connectionReturned() } else { self.connectionState = .offline }
            }
        }
        monitor.start(queue: DispatchQueue(label: "TowTeam.NetworkMonitor"))
        Task { await restore() }
    }

    func restore() async {
        let context = (selectedWorkspaceID, workspaceEpoch)
        guard let workspace = selectedWorkspace, let token = keychain.load(workspaceID: workspace.id) else { user = nil; return }
        let cached = loadSnapshot()
        user = cached.user
        pendingCount = loadQueue().count
        do {
            try await api.configure(server: workspace.serverURL, token: token)
            let remote = try await api.me().user
            guard context.0 == selectedWorkspaceID, context.1 == workspaceEpoch else { return }
            user = remote; connectionState = pendingCount > 0 ? .syncing : .online
            var snapshot = cached; snapshot.user = remote; saveSnapshot(snapshot)
            if remote != nil { await flushQueue() }
        } catch AppError.network {
            connectionState = .offline
        } catch AppError.unauthorized {
            keychain.delete(workspaceID: workspace.id); user = nil; connectionState = .online
        } catch { connectionState = .offline }
    }

    func signIn(username: String, password: String) async {
        let context = (selectedWorkspaceID, workspaceEpoch)
        guard let workspace = selectedWorkspace else { return }
        do {
            try await api.configure(server: workspace.serverURL, token: nil)
            let response = try await api.login(username: username, password: password)
            guard context.0 == selectedWorkspaceID, context.1 == workspaceEpoch else { return }
            try keychain.save(response.token, workspaceID: workspace.id)
            try await api.configure(server: workspace.serverURL, token: response.token)
            user = response.user; connectionState = .online
            var snapshot = loadSnapshot(); snapshot.user = response.user; saveSnapshot(snapshot)
            await refreshAll(); await flushQueue()
        } catch { errorMessage = error.localizedDescription }
    }

    func signOut() async {
        try? await api.logout()
        if let id = selectedWorkspaceID { keychain.delete(workspaceID: id) }
        workspaceEpoch += 1; user = nil
    }

    @discardableResult func addWorkspace(name: String, serverURL: String) -> Bool {
        let cleanedName = name.trimmingCharacters(in: .whitespacesAndNewlines), cleanedURL = serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanedName.isEmpty, let url = URL(string: cleanedURL), ["http", "https"].contains(url.scheme?.lowercased() ?? "") else { errorMessage = "Enter a workspace name and a valid HTTP or HTTPS server URL."; return false }
        let workspace = Workspace(id: UUID(), name: cleanedName, serverURL: cleanedURL.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
        workspaceEpoch += 1; workspaces.append(workspace); selectedWorkspaceID = workspace.id
        UserDefaults.standard.set(workspace.id.uuidString, forKey: selectedWorkspaceKey); persistWorkspaces(); user = nil
        Task { await restore() }; return true
    }

    func switchWorkspace(to id: UUID) async {
        guard workspaces.contains(where: { $0.id == id }) else { return }
        workspaceEpoch += 1
        selectedWorkspaceID = id; UserDefaults.standard.set(id.uuidString, forKey: selectedWorkspaceKey)
        user = nil; pendingCount = 0; connectionState = .offline; await restore()
    }

    func deleteWorkspace(_ workspace: Workspace) async {
        keychain.delete(workspaceID: workspace.id); workspaces.removeAll { $0.id == workspace.id }; persistWorkspaces()
        if selectedWorkspaceID == workspace.id {
            selectedWorkspaceID = workspaces.first?.id
            if let id = selectedWorkspaceID { UserDefaults.standard.set(id.uuidString, forKey: selectedWorkspaceKey) } else { UserDefaults.standard.removeObject(forKey: selectedWorkspaceKey) }
            user = nil; await restore()
        }
    }

    func loadTowPage(status: String, search: String = "", page: Int = 1, pageSize: Int = 25) async -> TowPage {
        let context = (selectedWorkspaceID, workspaceEpoch)
        do {
            let result = try await api.tows(status: status, search: search, page: page, pageSize: pageSize)
            guard context.0 == selectedWorkspaceID, context.1 == workspaceEpoch else { return emptyPage(page: page, pageSize: pageSize) }
            connectionState = pendingCount > 0 ? .syncing : .online
            let rows = page == 1 ? mergePendingTows(into: result.tows, status: status) : result.tows
            if search.isEmpty { cachePage(rows, status: status, replacing: page == 1) }
            if pendingCount > 0 && !flushing { await flushQueue() }
            return TowPage(tows: rows, page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages)
        } catch AppError.network {
            guard context.0 == selectedWorkspaceID, context.1 == workspaceEpoch else { return emptyPage(page: page, pageSize: pageSize) }
            connectionState = .offline
            let rows = status == "active" ? loadSnapshot().active : loadSnapshot().history
            let filtered = filter(rows, search: search)
            let start = min((page - 1) * pageSize, filtered.count)
            let end = min(start + pageSize, filtered.count)
            return TowPage(tows: Array(filtered[start..<end]), page: page, pageSize: pageSize, total: filtered.count,
                           totalPages: max(1, Int(ceil(Double(filtered.count) / Double(pageSize)))))
        } catch {
            errorMessage = error.localizedDescription
            return emptyPage(page: page, pageSize: pageSize)
        }
    }

    func loadAirlines() async -> [Airline] {
        let context = (selectedWorkspaceID, workspaceEpoch)
        do {
            let airlines = try await api.airlines()
            guard context.0 == selectedWorkspaceID, context.1 == workspaceEpoch else { return [] }
            var snapshot = loadSnapshot(); snapshot.airlines = airlines; saveSnapshot(snapshot)
            connectionState = pendingCount > 0 ? .syncing : .online
            return airlines
        } catch AppError.network {
            connectionState = .offline
            return loadSnapshot().airlines ?? []
        } catch {
            errorMessage = error.localizedDescription
            return loadSnapshot().airlines ?? []
        }
    }

    func getTow(id: Int) async -> Tow? {
        if id < 0 { return cachedTow(id: id) }
        let context = (selectedWorkspaceID, workspaceEpoch)
        do {
            let tow = try await api.tow(id: id)
            guard context.0 == selectedWorkspaceID, context.1 == workspaceEpoch else { return nil }
            cache(tow); connectionState = pendingCount > 0 ? .syncing : .online
            return tow
        } catch AppError.network { connectionState = .offline; return cachedTow(id: id) }
        catch { errorMessage = error.localizedDescription; return cachedTow(id: id) }
    }

    func createTow(_ input: NewTow) async -> Tow? {
        let context = (selectedWorkspaceID, workspaceEpoch)
        do {
            let tow = try await api.create(input)
            guard context.0 == selectedWorkspaceID, context.1 == workspaceEpoch else { return nil }
            cache(tow); return tow
        }
        catch AppError.network {
            guard context.0 == selectedWorkspaceID, context.1 == workspaceEpoch else { return nil }
            connectionState = .offline
            let localID = -Int(Date().timeIntervalSince1970 * 1000)
            let tow = input.offlineTow(id: localID); cache(tow)
            append(PendingOperation(id: UUID(), kind: .createTow, towID: localID, step: nil, timestamp: ISO8601DateFormatter().string(from: Date()), newTow: input, paperState: nil, paperRevision: nil, towPayload: nil, deleteReason: nil, attempts: 0))
            return tow
        } catch { errorMessage = error.localizedDescription; return nil }
    }

    func updateTow(_ tow: Tow) async -> Tow? {
        let context = (selectedWorkspaceID, workspaceEpoch)
        if tow.id < 0 { cache(tow); queueTowUpdate(tow); return tow }
        do {
            let updated = try await api.update(tow)
            guard context.0 == selectedWorkspaceID, context.1 == workspaceEpoch else { return nil }
            cache(updated); return updated
        }
        catch AppError.network { connectionState = .offline; cache(tow); queueTowUpdate(tow); return tow }
        catch { errorMessage = error.localizedDescription; return nil }
    }

    func deleteTow(_ tow: Tow, reason: String) async -> Bool {
        let context = (selectedWorkspaceID, workspaceEpoch)
        let cleaned = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { errorMessage = "Delete reason is required."; return false }
        if tow.id < 0 {
            var queue = loadQueue(); queue.removeAll { $0.towID == tow.id }; saveQueue(queue); removeCachedTow(id: tow.id); return true
        }
        do {
            try await api.delete(towID: tow.id, reason: cleaned)
            guard context.0 == selectedWorkspaceID, context.1 == workspaceEpoch else { return false }
            removeCachedTow(id: tow.id); return true
        }
        catch AppError.network {
            guard context.0 == selectedWorkspaceID, context.1 == workspaceEpoch else { return false }
            connectionState = .offline; removeCachedTow(id: tow.id)
            append(PendingOperation(id: UUID(), kind: .deleteTow, towID: tow.id, step: nil, timestamp: ISO8601DateFormatter().string(from: Date()), newTow: nil, paperState: nil, paperRevision: nil, towPayload: nil, deleteReason: cleaned, attempts: 0)); return true
        } catch { errorMessage = error.localizedDescription; return false }
    }

    func log(towID: Int, step: WorkflowStep) async -> Tow? {
        let context = (selectedWorkspaceID, workspaceEpoch)
        let timestamp = ISO8601DateFormatter().string(from: Date())
        if towID < 0 { let tow = optimisticallyLog(towID: towID, step: step, timestamp: timestamp); append(PendingOperation(id: UUID(), kind: .workflowStep, towID: towID, step: step, timestamp: timestamp, newTow: nil, paperState: nil, paperRevision: nil, towPayload: nil, deleteReason: nil, attempts: 0)); return tow }
        do {
            let tow = try await api.log(towID: towID, step: step, timestamp: timestamp)
            guard context.0 == selectedWorkspaceID, context.1 == workspaceEpoch else { return nil }
            cache(tow); return tow
        }
        catch AppError.network {
            guard context.0 == selectedWorkspaceID, context.1 == workspaceEpoch else { return nil }
            connectionState = .offline
            let tow = optimisticallyLog(towID: towID, step: step, timestamp: timestamp)
            append(PendingOperation(id: UUID(), kind: .workflowStep, towID: towID, step: step, timestamp: timestamp, newTow: nil, paperState: nil, paperRevision: nil, towPayload: nil, deleteReason: nil, attempts: 0)); return tow
        } catch { errorMessage = error.localizedDescription; return cachedTow(id: towID) }
    }

    func undoLastStep(towID: Int) async -> Tow? {
        let context = (selectedWorkspaceID, workspaceEpoch)
        guard let local = optimisticallyUndo(towID: towID) else { errorMessage = "There is no completed workflow step to undo."; return nil }
        if towID < 0 {
            append(PendingOperation(id: UUID(), kind: .undoWorkflow, towID: towID, step: nil, timestamp: ISO8601DateFormatter().string(from: Date()), newTow: nil, paperState: nil, paperRevision: nil, towPayload: nil, deleteReason: nil, attempts: 0))
            return local
        }
        do {
            let remote = try await api.undoLastStep(towID: towID)
            guard context.0 == selectedWorkspaceID, context.1 == workspaceEpoch else { return nil }
            cache(remote); return remote
        }
        catch AppError.network {
            guard context.0 == selectedWorkspaceID, context.1 == workspaceEpoch else { return nil }
            connectionState = .offline
            append(PendingOperation(id: UUID(), kind: .undoWorkflow, towID: towID, step: nil, timestamp: ISO8601DateFormatter().string(from: Date()), newTow: nil, paperState: nil, paperRevision: nil, towPayload: nil, deleteReason: nil, attempts: 0))
            return local
        } catch {
            cache(await getTow(id: towID) ?? local)
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func flushQueue() async {
        if flushing {
            while flushing {
                try? await Task.sleep(for: .milliseconds(75))
            }
            return
        }
        let context = (selectedWorkspaceID, workspaceEpoch)
        var queue = loadQueue(); guard !queue.isEmpty else { pendingCount = 0; if connectionState != .offline { connectionState = .online }; return }
        flushing = true
        syncTotal = queue.count; syncCompleted = 0; syncDetail = nil
        defer { flushing = false }
        connectionState = .syncing
        let index = 0
        while index < queue.count {
            var operation = queue[index]
            do {
                switch operation.kind {
                case .createTow:
                    syncDetail = "Uploading pending tow"
                    guard let input = operation.newTow else { queue.remove(at: index); continue }
                    let remote = try await api.create(input); replaceCachedTow(localID: operation.towID, with: remote)
                    for later in queue.indices where queue[later].towID == operation.towID { queue[later].towID = remote.id }
                case .workflowStep:
                    syncDetail = "Uploading \(operation.step?.label ?? "workflow step")"
                    guard let step = operation.step else { queue.remove(at: index); continue }
                    let remote = try await api.log(towID: operation.towID, step: step, timestamp: operation.timestamp); cache(remote)
                case .undoWorkflow:
                    syncDetail = "Undoing last workflow step"
                    let remote = try await api.undoLastStep(towID: operation.towID); cache(remote)
                case .updateTow:
                    syncDetail = "Uploading tow details"
                    guard var payload = operation.towPayload else { queue.remove(at: index); continue }
                    payload = towWithID(payload, id: operation.towID)
                    let remote = try await api.update(payload); cache(remote)
                case .deleteTow:
                    syncDetail = "Deleting tow"
                    try await api.delete(towID: operation.towID, reason: operation.deleteReason ?? "Deleted offline")
                    removeCachedTow(id: operation.towID)
                case .paperDraft:
                    syncDetail = "Uploading tow paper"
                    guard let state = operation.paperState else { queue.remove(at: index); continue }
                    do {
                        let saved = try await api.savePaperDraft(towID: operation.towID, state: state, revision: operation.paperRevision ?? 0)
                        cacheDraft(saved, towID: operation.towID)
                    } catch AppError.server(let message) where message.localizedCaseInsensitiveContains("another user") {
                        let remote = try await api.paperDraft(towID: operation.towID)
                        let merged = mergePaper(remote.state, base: operation.paperBaseState ?? PaperDraftState(), local: state)
                        let saved = try await api.savePaperDraft(towID: operation.towID, state: merged, revision: remote.revision)
                        cacheDraft(saved, towID: operation.towID)
                    }
                }
                guard context.0 == selectedWorkspaceID, context.1 == workspaceEpoch else { return }
                queue.remove(at: index); syncCompleted += 1; saveQueue(queue)
            } catch AppError.network {
                guard context.0 == selectedWorkspaceID, context.1 == workspaceEpoch else { return }
                saveQueue(queue); syncDetail = "Waiting for connection"; connectionState = .offline; return
            }
            catch AppError.server(let message) where operation.kind == .workflowStep && message.localizedCaseInsensitiveContains("already") {
                guard context.0 == selectedWorkspaceID, context.1 == workspaceEpoch else { return }
                if let remote = try? await api.tow(id: operation.towID) { cache(remote) }
                queue.remove(at: index); syncCompleted += 1; saveQueue(queue)
            }
            catch { operation.attempts += 1; queue[index] = operation; saveQueue(queue); syncDetail = "Sync paused: \(error.localizedDescription)"; errorMessage = "A pending change needs attention: \(error.localizedDescription)"; connectionState = .online; break }
        }
        pendingCount = queue.count
        if queue.isEmpty { syncDetail = nil; connectionState = .online; await refreshAll() }
    }

    func loadPaperDraft(towID: Int) async -> PaperDraft {
        do { let draft = try await api.paperDraft(towID: towID); cacheDraft(draft, towID: towID); return draft }
        catch AppError.network { connectionState = .offline; return cachedDraft(towID: towID) ?? PaperDraft(state: PaperDraftState(), revision: 0, updatedAt: nil) }
        catch { errorMessage = error.localizedDescription; return cachedDraft(towID: towID) ?? PaperDraft(state: PaperDraftState(), revision: 0, updatedAt: nil) }
    }

    func stagePaperDraft(towID: Int, state: PaperDraftState, baseState: PaperDraftState, revision: Int) -> PaperDraft {
        let local = PaperDraft(state: state, revision: revision, updatedAt: ISO8601DateFormatter().string(from: Date()))
        cacheDraft(local, towID: towID)
        queuePaperDraft(towID: towID, state: state, baseState: baseState, revision: revision)
        return local
    }

    func completedPaperURL(towID: Int) async -> URL? {
        guard towID > 0 else { errorMessage = "This tow must synchronize before its completed document can be shared."; return nil }
        errorMessage = nil
        await flushQueue()
        guard loadQueue().isEmpty else {
            errorMessage = connectionState == .offline ? "Connect to the workspace to generate the completed tow paper." : "Pending changes must finish synchronizing before the completed tow paper can be shared."
            return nil
        }
        do {
            let data = try await api.paper(towID: towID)
            try FileManager.default.createDirectory(at: papersDirectory, withIntermediateDirectories: true)
            let url = papersDirectory.appendingPathComponent("tow-\(towID)-completed.pdf")
            try data.write(to: url, options: .atomic)
            errorMessage = nil
            return url
        } catch AppError.network {
            connectionState = .offline
            errorMessage = "Connect to the workspace to generate the completed tow paper."
            return nil
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func autofillPaper(towID: Int, revision: Int) async -> PaperDraft? {
        do { let draft = try await api.autofillPaper(towID: towID, revision: revision); cacheDraft(draft, towID: towID); return draft }
        catch { errorMessage = error.localizedDescription; return nil }
    }
    private func connectionReturned() async { guard user != nil else { return }; connectionState = loadQueue().isEmpty ? .online : .syncing; await flushQueue() }
    private func refreshAll() async { _ = await loadAirlines(); _ = await loadTowPage(status: "active"); _ = await loadTowPage(status: "completed") }
    private func persistWorkspaces() { UserDefaults.standard.set(try? JSONEncoder().encode(workspaces), forKey: workspaceKey) }
    private func loadSnapshot() -> OfflineSnapshot { (try? Data(contentsOf: snapshotURL)).flatMap { try? JSONDecoder().decode(OfflineSnapshot.self, from: $0) } ?? OfflineSnapshot() }
    private func saveSnapshot(_ snapshot: OfflineSnapshot) { try? FileManager.default.createDirectory(at: appSupport, withIntermediateDirectories: true); if let data = try? JSONEncoder().encode(snapshot) { try? data.write(to: snapshotURL, options: .atomic) } }
    private func loadQueue() -> [PendingOperation] { (try? Data(contentsOf: queueURL)).flatMap { try? JSONDecoder().decode([PendingOperation].self, from: $0) } ?? [] }
    private func saveQueue(_ queue: [PendingOperation]) { try? FileManager.default.createDirectory(at: appSupport, withIntermediateDirectories: true); if let data = try? JSONEncoder().encode(queue) { try? data.write(to: queueURL, options: .atomic) }; pendingCount = queue.count }
    private func append(_ operation: PendingOperation) { var queue = loadQueue(); queue.append(operation); saveQueue(queue); syncCompleted = 0; syncTotal = queue.count; syncDetail = "Waiting to sync"; connectionState = .syncing }
    private func filter(_ rows: [Tow], search: String) -> [Tow] { guard !search.isEmpty else { return rows }; let term = search.lowercased(); return rows.filter { [$0.airline, $0.tailNumber, $0.aircraftType, $0.gate, $0.towSpot, $0.driver].compactMap { $0?.lowercased() }.contains { $0.contains(term) } } }
    private func cachedTow(id: Int) -> Tow? { let snapshot = loadSnapshot(); return (snapshot.active + snapshot.history).first { $0.id == id } }
    private func cachedDraft(towID: Int) -> PaperDraft? { loadSnapshot().drafts?[String(towID)] }
    private func cacheDraft(_ draft: PaperDraft, towID: Int) { var snapshot = loadSnapshot(); var drafts = snapshot.drafts ?? [:]; drafts[String(towID)] = draft; snapshot.drafts = drafts; saveSnapshot(snapshot) }
    private func queuePaperDraft(towID: Int, state: PaperDraftState, baseState: PaperDraftState, revision: Int) {
        var queue = loadQueue()
        queue.removeAll { $0.kind == .paperDraft && $0.towID == towID }
        queue.append(PendingOperation(id: UUID(), kind: .paperDraft, towID: towID, step: nil, timestamp: ISO8601DateFormatter().string(from: Date()), newTow: nil, paperState: state, paperBaseState: baseState, paperRevision: revision, towPayload: nil, deleteReason: nil, attempts: 0))
        saveQueue(queue); syncCompleted = 0; syncTotal = queue.count; syncDetail = "Waiting to sync"; connectionState = .syncing
    }
    private func mergePaper(_ remote: PaperDraftState, base: PaperDraftState, local: PaperDraftState) -> PaperDraftState {
        PaperDraftState(
            text: mergeChanged(remote: remote.text, base: base.text, local: local.text),
            answers: mergeChanged(remote: remote.answers, base: base.answers, local: local.answers),
            risk: mergeChanged(remote: remote.risk, base: base.risk, local: local.risk)
        )
    }
    private func mergeChanged(remote: [String: String], base: [String: String], local: [String: String]) -> [String: String] {
        var result = remote
        for key in Set(base.keys).union(local.keys) where base[key] != local[key] {
            if let value = local[key] { result[key] = value } else { result.removeValue(forKey: key) }
        }
        return result
    }
    private func cachePage(_ rows: [Tow], status: String, replacing: Bool) {
        var snapshot = loadSnapshot()
        var existing = status == "active" ? snapshot.active : snapshot.history
        if replacing { existing = [] }
        let ids = Set(rows.map(\.id))
        existing.removeAll { ids.contains($0.id) }
        existing.append(contentsOf: rows)
        if status == "active" { snapshot.active = existing } else { snapshot.history = existing }
        saveSnapshot(snapshot)
    }
    private func emptyPage(page: Int, pageSize: Int) -> TowPage {
        TowPage(tows: [], page: page, pageSize: pageSize, total: 0, totalPages: 1)
    }
    private func cache(_ tow: Tow) { var snapshot = loadSnapshot(); snapshot.active.removeAll { $0.id == tow.id }; snapshot.history.removeAll { $0.id == tow.id }; if tow.status == "completed" { snapshot.history.insert(tow, at: 0) } else { snapshot.active.insert(tow, at: 0) }; saveSnapshot(snapshot); LiveActivityManager.sync(tow) }
    private func removeCachedTow(id: Int) { var snapshot = loadSnapshot(); snapshot.active.removeAll { $0.id == id }; snapshot.history.removeAll { $0.id == id }; saveSnapshot(snapshot) }
    private func queueTowUpdate(_ tow: Tow) {
        var queue = loadQueue(); queue.removeAll { $0.kind == .updateTow && $0.towID == tow.id }
        queue.append(PendingOperation(id: UUID(), kind: .updateTow, towID: tow.id, step: nil, timestamp: ISO8601DateFormatter().string(from: Date()), newTow: nil, paperState: nil, paperRevision: nil, towPayload: tow, deleteReason: nil, attempts: 0)); saveQueue(queue); connectionState = .syncing
    }
    private func towWithID(_ tow: Tow, id: Int) -> Tow { Tow(id: id, airline: tow.airline, inboundFlightNumber: tow.inboundFlightNumber, inboundStation: tow.inboundStation, aircraftType: tow.aircraftType, eta: tow.eta, gate: tow.gate, fromLocation: tow.fromLocation, toLocation: tow.toLocation, towSpot: tow.towSpot, tailNumber: tow.tailNumber, driver: tow.driver, leftWingWalker: tow.leftWingWalker, rightWingWalker: tow.rightWingWalker, otherTeamMembers: tow.otherTeamMembers, notes: tow.notes, status: tow.status, needsReview: tow.needsReview, parserWarnings: tow.parserWarnings, setupStartedAt: tow.setupStartedAt, goaaCalledAt: tow.goaaCalledAt, goaaArrivalAt: tow.goaaArrivalAt, pushStartedAt: tow.pushStartedAt, towStartedAt: tow.towStartedAt, towCompletedAt: tow.towCompletedAt, towPaperCompletedAt: tow.towPaperCompletedAt, createdAt: tow.createdAt, updatedAt: tow.updatedAt) }
    private func replaceCachedTow(localID: Int, with remote: Tow) {
        var snapshot = loadSnapshot()
        let local = (snapshot.active + snapshot.history).first { $0.id == localID }
        snapshot.active.removeAll { $0.id == localID }; snapshot.history.removeAll { $0.id == localID }
        if let localDraft = snapshot.drafts?[String(localID)] { snapshot.drafts?[String(remote.id)] = localDraft; snapshot.drafts?.removeValue(forKey: String(localID)) }
        saveSnapshot(snapshot)
        if let local { cache(remap(local: local, onto: remote)) } else { cache(remote) }
    }
    private func remap(local: Tow, onto remote: Tow) -> Tow {
        var result = remote
        result.setupStartedAt = local.setupStartedAt; result.goaaCalledAt = local.goaaCalledAt; result.goaaArrivalAt = local.goaaArrivalAt
        result.towStartedAt = local.towStartedAt; result.towCompletedAt = local.towCompletedAt; result.towPaperCompletedAt = local.towPaperCompletedAt
        result.status = local.status
        return result
    }
    private func mergePendingTows(into remote: [Tow], status: String) -> [Tow] {
        let snapshot = loadSnapshot(), cached = snapshot.active + snapshot.history
        let pendingIDs = Set(loadQueue().map(\.towID))
        let pending = cached.filter { pendingIDs.contains($0.id) && (status == "active" ? $0.status != "completed" : $0.status == "completed") }
        var merged = remote.filter { id in !pendingIDs.contains(id.id) }
        merged.insert(contentsOf: pending, at: 0)
        return merged
    }
    private func optimisticallyLog(towID: Int, step: WorkflowStep, timestamp: String) -> Tow? {
        guard var tow = cachedTow(id: towID) else { return nil }
        switch step { case .setupStartedAt: tow.setupStartedAt = timestamp; tow.status = "setup_started"; case .goaaCalledAt: tow.goaaCalledAt = timestamp; tow.status = "goaa_called"; case .goaaArrivalAt: tow.goaaArrivalAt = timestamp; tow.status = "goaa_arrival"; case .towStartedAt: tow.towStartedAt = timestamp; tow.status = "tow_started"; case .towCompletedAt: tow.towCompletedAt = timestamp; tow.status = "tow_completed"; case .towPaperCompletedAt: tow.towPaperCompletedAt = timestamp; tow.status = "completed" }
        cache(tow); return tow
    }
    private func optimisticallyUndo(towID: Int) -> Tow? {
        guard var tow = cachedTow(id: towID) else { return nil }
        let order: [WorkflowStep] = tow.isWestRamp
            ? [.setupStartedAt, .goaaCalledAt, .goaaArrivalAt, .towStartedAt, .towCompletedAt, .towPaperCompletedAt]
            : [.setupStartedAt, .towStartedAt, .towCompletedAt, .towPaperCompletedAt]
        guard let step = order.reversed().first(where: { workflowTimestamp($0, tow: tow) != nil }) else { return nil }
        switch step {
        case .setupStartedAt: tow.setupStartedAt = nil; tow.status = "planned"
        case .goaaCalledAt: tow.goaaCalledAt = nil; tow.status = "setup_started"
        case .goaaArrivalAt: tow.goaaArrivalAt = nil; tow.status = "goaa_called"
        case .towStartedAt: tow.towStartedAt = nil; tow.status = tow.isWestRamp ? "goaa_arrival" : "setup_started"
        case .towCompletedAt: tow.towCompletedAt = nil; tow.status = "tow_started"
        case .towPaperCompletedAt: tow.towPaperCompletedAt = nil; tow.status = "tow_completed"
        }
        cache(tow); return tow
    }
    private func workflowTimestamp(_ step: WorkflowStep, tow: Tow) -> String? {
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
