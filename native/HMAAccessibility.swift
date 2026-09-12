import AppKit
import ApplicationServices
import Darwin

final class HMAAccessibility {
    static let bundleIdentifier = "com.privax.osx.provpn"
    let app: AXUIElement
    let readBudget: ReadBudget
    let didLaunch: Bool
    private(set) var lastStatus = HMAStatus()
    private var lastCountries = [Country]()
    private var lastCapabilities = HMAAccessibility.noCapabilities
    static let noCapabilities = ["connect": false, "disconnect": false, "reconnect": false, "countries": false, "nextCountry": false]
    var responseStatus: HMAStatus { readBudget.failure == nil ? lastStatus : HMAStatus() }
    var responseCountries: [Country] { readBudget.failure == nil ? lastCountries : [] }
    var responseCapabilities: [String: Bool] { readBudget.failure == nil ? lastCapabilities : Self.noCapabilities }

    init(timeout: TimeInterval, allowLaunch: Bool = false) throws {
        readBudget = ReadBudget(timeout: timeout)
        var running = NSRunningApplication.runningApplications(withBundleIdentifier: Self.bundleIdentifier).first
        let installed = NSWorkspace.shared.urlForApplication(withBundleIdentifier: Self.bundleIdentifier).map {
            FileManager.default.fileExists(atPath: $0.path)
        } ?? false
        didLaunch = try HMAStartupPolicy.shouldLaunch(installed: installed, running: running != nil,
                                                    launchRequested: allowLaunch, accessibilityTrusted: AXIsProcessTrusted())
        if didLaunch {
            try Self.launchHidden(budget: readBudget)
            repeat {
                running = NSRunningApplication.runningApplications(withBundleIdentifier: Self.bundleIdentifier).first
                if running != nil { break }
                Thread.sleep(forTimeInterval: min(0.1, readBudget.remaining))
            } while readBudget.remaining > 0
        }
        guard let running else {
            throw BridgeError(code: "APP_LAUNCH_FAILED", message: "HMA VPN did not start. Open it normally and complete any sign-in or setup, then try again.")
        }
        app = AXUIElementCreateApplication(running.processIdentifier)
        // The application element's timeout does not apply to its descendants.
        AXUIElementSetMessagingTimeout(AXUIElementCreateSystemWide(), 0.25)
        try readBudget.check()
    }

    private static func launchHidden(budget: ReadBudget) throws {
        try budget.check()
        let opener = Process()
        opener.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        opener.arguments = ["-g", "-j", "-b", bundleIdentifier]
        opener.standardOutput = FileHandle.nullDevice
        opener.standardError = FileHandle.nullDevice
        do { try opener.run() } catch {
            throw BridgeError(code: "APP_LAUNCH_FAILED", message: "HMA VPN could not be started. Open it normally and complete any sign-in or setup, then try again.")
        }
        while opener.isRunning && budget.remaining > 0 { Thread.sleep(forTimeInterval: min(0.05, budget.remaining)) }
        if opener.isRunning {
            opener.terminate()
            throw BridgeError(code: "ACTION_TIMEOUT", message: "HMA did not start within the timeout. Open it normally, then try again.")
        }
        guard opener.terminationStatus == 0 else {
            throw BridgeError(code: "APP_LAUNCH_FAILED", message: "HMA VPN could not be started. Open it normally and complete any sign-in or setup, then try again.")
        }
    }

    func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
        guard prepareAccess(element) else { return nil }
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
        return value
    }

    func string(_ element: AXUIElement, _ name: String) -> String? { attribute(element, name) as? String }

    private func prepareAccess(_ element: AXUIElement) -> Bool {
        guard let timeout = readBudget.messagingTimeout() else { return false }
        return AXUIElementSetMessagingTimeout(element, timeout) == .success
    }

    func descendants(_ element: AXUIElement) -> [AXUIElement] {
        readBudget.descendants([element]) { (attribute($0, "AXChildren") as? [AXUIElement]) ?? [] }
    }

    func nodes() -> [AXUIElement] {
        let windows = Array(((attribute(app, "AXWindows") as? [AXUIElement]) ?? []).prefix(8))
        return readBudget.descendants(windows) { (attribute($0, "AXChildren") as? [AXUIElement]) ?? [] }
    }

    func menuNodes() -> [AXUIElement] {
        guard let extra = attribute(app, "AXExtrasMenuBar"), CFGetTypeID(extra) == AXUIElementGetTypeID() else { return [] }
        return descendants(unsafeBitCast(extra, to: AXUIElement.self))
    }

    func find(_ identifier: String, in nodes: [AXUIElement]) -> AXUIElement? {
        nodes.first { string($0, "AXIdentifier") == identifier }
    }

    func canPress(_ element: AXUIElement?) -> Bool {
        guard let element, prepareAccess(element) else { return false }
        var actions: CFArray?
        guard AXUIElementCopyActionNames(element, &actions) == .success else { return false }
        return ((actions as? [String]) ?? []).contains("AXPress") && (attribute(element, "AXEnabled") as? NSNumber)?.boolValue == true
    }

    func menuItem(titles: [String], in menu: [AXUIElement]) -> AXUIElement? {
        menu.first {
            string($0, "AXRole") == "AXMenuItem" && string($0, "AXIdentifier") == "menuAction:" &&
            titles.contains(string($0, "AXTitle") ?? "") && canPress($0)
        }
    }

    func menuSnapshot(from menu: [AXUIElement]) -> [HMAMenuItem] {
        menu.filter { string($0, "AXRole") == "AXMenuItem" }.map {
            HMAMenuItem(title: string($0, "AXTitle") ?? "", enabled: (attribute($0, "AXEnabled") as? NSNumber)?.boolValue ?? false)
        }
    }

    func passiveWindowStatus(from suppliedNodes: [AXUIElement]? = nil) -> HMAStatus {
        let nodes = suppliedNodes ?? self.nodes()
        let toggle = find("toggle.connection", in: nodes)
        let group = nodes.first { string($0, "AXRole") == "AXGroup" && string($0, "AXTitle") == "VPN status" }
        let statusNodes = group.map { descendants($0) } ?? []
        let change = find("btn.change", in: nodes)
        let parent = change.flatMap { attribute($0, "AXParent") }
        let countryNodes: [AXUIElement]
        if let parent, CFGetTypeID(parent) == AXUIElementGetTypeID() {
            countryNodes = descendants(unsafeBitCast(parent, to: AXUIElement.self))
        } else { countryNodes = [] }
        let texts = countryNodes.filter { string($0, "AXRole") == "AXStaticText" }.compactMap { string($0, "AXValue") }
        let code = countryNodes.first { string($0, "AXRole") == "AXImage" }.flatMap { string($0, "AXDescription") }
        return HMAStatus.parse(
            statusTexts: statusNodes.compactMap { string($0, "AXValue") },
            toggleTitle: toggle.flatMap { string($0, "AXTitle") },
            toggleValue: toggle.flatMap { attribute($0, "AXValue") as? NSNumber }?.intValue,
            countryCode: code, countryTexts: texts)
    }

    func status(from suppliedNodes: [AXUIElement]? = nil) -> HMAStatus {
        let menu = menuNodes()
        let passive = passiveWindowStatus(from: suppliedNodes)
        lastStatus = HMAStatus.parseMenu(menuSnapshot(from: menu), passive: passive)
        lastCountries = countryMenuItems(in: menu).map { $0.0 }
        let toggle = menuItem(titles: ["Turn on VPN", "Turn off", "Turn off VPN"], in: menu) != nil
        let mappedCountries = Set(lastCountries.compactMap { $0.code })
        lastCapabilities = ["connect": toggle, "disconnect": toggle, "reconnect": toggle, "countries": !lastCountries.isEmpty,
                            "nextCountry": mappedCountries.count >= 2]
        return responseStatus
    }

    func countryMenuItems(in suppliedMenu: [AXUIElement]? = nil) -> [(Country, AXUIElement)] {
        let menu = suppliedMenu ?? menuNodes()
        guard let recent = menu.first(where: { string($0, "AXRole") == "AXMenuItem" && string($0, "AXTitle") == "Recent Locations" }) else { return [] }
        var found = Set<String>()
        return descendants(recent).compactMap { element in
            guard !CFEqual(element, recent), string(element, "AXRole") == "AXMenuItem", canPress(element),
                  string(element, "AXIdentifier") == "menuAction:", let title = string(element, "AXTitle") else { return nil }
            let name = Country.cleanMenuName(title)
            guard !name.isEmpty, found.insert(name).inserted else { return nil }
            return (Country(code: Country.code(for: name), name: name), element)
        }
    }

    func requireReady() throws -> HMAStatus {
        let currentNodes = nodes()
        if currentNodes.contains(where: {
            string($0, "AXRole") == "AXSheet" || (attribute($0, "AXModal") as? NSNumber)?.boolValue == true
        }) {
            throw BridgeError(code: "APP_BUSY", message: "Close the dialog in HMA VPN, then try again.")
        }
        let current = status(from: currentNodes)
        try requireTimeRemaining()
        guard current.state == "connected" || current.state == "disconnected" else {
            throw BridgeError(code: current.state == "unknown" ? "STATUS_UNAVAILABLE" : "APP_BUSY",
                              message: "HMA's menu-bar connection status is not ready. Wait for HMA to settle and try again.")
        }
        return current
    }

    func prepare() throws -> HMAStatus {
        // Existing running apps are never reopened or activated. A newly launched app may need time to build its menu.
        if !didLaunch { return try requireReady() }
        var lastFailure = BridgeError(code: "STATUS_UNAVAILABLE", message: "HMA's menu-bar controls are not ready.")
        repeat {
            do { return try requireReady() }
            catch let error as BridgeError {
                if error.code == "APP_BUSY" {
                    let currentNodes = nodes()
                    let dialog = currentNodes.contains {
                        string($0, "AXRole") == "AXSheet" || (attribute($0, "AXModal") as? NSNumber)?.boolValue == true
                    }
                    if dialog || !["connecting", "disconnecting"].contains(status(from: currentNodes).state) { throw error }
                }
                lastFailure = error
            }
            Thread.sleep(forTimeInterval: min(0.15, readBudget.remaining))
        } while readBudget.failure == nil
        if readBudget.failure?.code == "AX_TREE_LIMIT" { try readBudget.check() }
        if lastFailure.code == "APP_BUSY" { throw lastFailure }
        throw BridgeError(code: "APP_STARTUP_TIMEOUT", message: "HMA started, but its VPN controls are not ready. Complete any sign-in or setup in HMA, then try again.")
    }

    func requireTimeRemaining() throws {
        try readBudget.check()
    }

    @discardableResult
    func waitFor(_ predicate: (HMAStatus) -> Bool, description: String) throws -> HMAStatus {
        var matchingSince: TimeInterval?
        repeat {
            try requireTimeRemaining()
            let current = status()
            try requireTimeRemaining()
            if predicate(current) {
                if let since = matchingSince, readBudget.now - since >= 0.5 { return current }
                if matchingSince == nil { matchingSince = readBudget.now }
            } else { matchingSince = nil }
            Thread.sleep(forTimeInterval: min(0.2, readBudget.remaining))
        } while readBudget.failure == nil
        if readBudget.failure?.code == "AX_TREE_LIMIT" { try readBudget.check() }
        throw BridgeError(code: "ACTION_TIMEOUT", message: "HMA did not confirm \(description) within the timeout. Check its current status before trying again.")
    }

    func setConnected(_ connected: Bool) throws -> HMAStatus {
        let current = try requireReady()
        let target = connected ? "connected" : "disconnected"
        if current.state == target { return current }
        let titles = connected ? ["Turn on VPN"] : ["Turn off", "Turn off VPN"]
        guard let toggle = menuItem(titles: titles, in: menuNodes()) else {
            throw BridgeError(code: "CONTROL_UNAVAILABLE", message: "HMA's menu-bar connection control is unavailable. Wait for HMA to settle and try again.")
        }
        try requireTimeRemaining()
        // Directly invoke the actual menu action. Do not display the menu or activate HMA.
        try press(toggle)
        return try waitFor({ $0.state == target }, description: connected ? "the connection" : "the disconnection")
    }

    func reconnect() throws -> [String: Any] {
        let before = try requireReady()
        guard before.state == "connected" else {
            throw BridgeError(code: "NOT_CONNECTED", message: "Turn on the VPN before requesting another IP.")
        }
        _ = try setConnected(false)
        // The same menu toggle reconnects HMA's selected location. The disconnected menu does not expose that selection.
        let after = try setConnected(true)
        if let beforeName = before.countryName, let afterName = after.countryName, beforeName != afterName {
            throw BridgeError(code: "COUNTRY_CHANGED", message: "HMA connected in a different country. Check its selected location.")
        }
        let changed: Any = before.virtualIp != nil && after.virtualIp != nil ? before.virtualIp != after.virtualIp : NSNull()
        let sameCountry: Any = before.countryName != nil && after.countryName != nil ? before.countryName == after.countryName : NSNull()
        return ["ipChanged": changed, "sameCountry": sameCountry]
    }

    func countries() throws -> [Country] {
        _ = status()
        try requireTimeRemaining()
        let countries = lastCountries
        guard !countries.isEmpty else {
            throw BridgeError(code: "COUNTRIES_UNSUPPORTED", message: "HMA has no recent locations available in its menu. Use a location in HMA once to add it to this list.")
        }
        return countries
    }

    func nextCountry(requested: [String], currentCountry: String? = nil) throws -> [String: Any] {
        let before = try requireReady()
        let context = Country.rotationContext(current: before, countryHint: currentCountry)
        let items = countryMenuItems()
        let target = try Country.next(in: requested, available: items.map { $0.0 }, current: context)
        guard let item = items.first(where: { $0.0.name == target.name })?.1 else {
            throw BridgeError(code: "COUNTRY_UNAVAILABLE", message: "HMA's recent locations changed. Reload the list and try again.")
        }
        try requireTimeRemaining()
        try press(item)
        let after = try waitFor({ status in
            status.state == "connected" && (target.code != nil ? status.countryCode == target.code : status.countryName == target.name)
        }, description: "a connection in \(target.name)")
        let changed: Any
        if let code = context.countryCode, let afterCode = after.countryCode { changed = code != afterCode }
        else if let name = context.countryName, let afterName = after.countryName { changed = name != afterName }
        else { changed = NSNull() }
        return ["countryChanged": changed, "country": target.json, "startedDisconnected": before.state == "disconnected"]
    }

    private func press(_ element: AXUIElement) throws {
        try requireTimeRemaining()
        guard prepareAccess(element) else {
            try requireTimeRemaining()
            throw BridgeError(code: "CONTROL_UNAVAILABLE", message: "HMA's menu control is no longer available. Wait for HMA to settle and try again.")
        }
        let result = AXUIElementPerformAction(element, "AXPress" as CFString)
        try Self.validatePressResult(result)
    }

    static func validatePressResult(_ result: AXError) throws {
        // A messaging timeout may mean the action was accepted. Observe it without retrying the press.
        guard result == .success || result == .cannotComplete else {
            throw BridgeError(code: "ACTION_FAILED", message: "HMA did not accept the menu action. Check HMA and try again.")
        }
    }
}

final class CommandLock {
    private let descriptor: Int32
    init() throws {
        let location = FileManager.default.temporaryDirectory.appendingPathComponent("com.vrotek.hma-controls-\(getuid()).lock").path
        descriptor = open(location, O_CREAT | O_RDWR | O_CLOEXEC | O_NOFOLLOW, S_IRUSR | S_IWUSR)
        guard descriptor >= 0 else { throw BridgeError(code: "LOCK_FAILED", message: "Unable to create the HMA command lock.") }
        guard flock(descriptor, LOCK_EX | LOCK_NB) == 0 else {
            close(descriptor)
            throw BridgeError(code: "COMMAND_BUSY", message: "Another HMA action is still running. Wait for it to finish.")
        }
    }
    deinit { flock(descriptor, LOCK_UN); close(descriptor) }
}
