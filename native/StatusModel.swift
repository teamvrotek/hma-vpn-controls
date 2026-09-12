import Foundation

struct HMAMenuItem {
    let title: String
    let enabled: Bool
}

struct HMAStartupPolicy {
    static func shouldLaunch(installed: Bool, running: Bool, launchRequested: Bool, accessibilityTrusted: Bool) throws -> Bool {
        guard installed || running else {
            throw BridgeError(code: "APP_NOT_INSTALLED", message: "HMA VPN is not installed. Install HMA VPN and sign in, then use this key again.")
        }
        guard running || launchRequested else {
            throw BridgeError(code: "APP_NOT_RUNNING", message: "HMA VPN is installed but not running. Press the key to start it.")
        }
        guard accessibilityTrusted else {
            throw BridgeError(code: "ACCESSIBILITY_PERMISSION_REQUIRED", message: "Allow Stream Deck in System Settings > Privacy & Security > Accessibility, then restart Stream Deck. When testing from Terminal, allow Terminal instead.")
        }
        return launchRequested && !running
    }
}

struct HMAStatus {
    var state = "unknown"
    var countryCode: String?
    var countryName: String?
    var virtualIp: String?

    var json: [String: Any] {
        ["state": state, "countryCode": countryCode as Any? ?? NSNull(),
         "countryName": countryName as Any? ?? NSNull(), "virtualIp": virtualIp as Any? ?? NSNull()]
    }

    static func parseMenu(_ items: [HMAMenuItem], passive: HMAStatus = HMAStatus()) -> HMAStatus {
        var result = HMAStatus()
        let titles = items.map { $0.title.lowercased().trimmingCharacters(in: .whitespacesAndNewlines) }
        let canTurnOn = items.contains { $0.title == "Turn on VPN" && $0.enabled }
        let canTurnOff = items.contains { ["Turn off", "Turn off VPN"].contains($0.title) && $0.enabled }
        if titles.contains(where: { $0.hasPrefix("turning off") || $0.hasPrefix("disconnecting") }) {
            result.state = "disconnecting"
        } else if titles.contains(where: { $0.hasPrefix("turning on") || $0.hasPrefix("connecting") || $0.hasPrefix("reconnecting") }) {
            result.state = "connecting"
        } else if titles.contains("vpn is on") && canTurnOff && !canTurnOn {
            result.state = "connected"
        } else if canTurnOn && !canTurnOff && !titles.contains("vpn is on") {
            result.state = "disconnected"
        }
        if result.state == "connected", let connected = items.first(where: { $0.title.hasPrefix("Connected to:") }) {
            let name = Country.cleanMenuName(String(connected.title.dropFirst("Connected to:".count)))
            if !name.isEmpty {
                result.countryName = name
                result.countryCode = Country.code(for: name)
            }
        }
        // Window details are optional and passive. The menu always determines the connection state.
        if result.state == "connected", passive.state == "connected", passive.countryName == result.countryName {
            result.virtualIp = passive.virtualIp
            if result.countryCode == nil { result.countryCode = passive.countryCode }
        } else if result.state == "disconnected", passive.state == "disconnected" {
            result.countryName = passive.countryName
            result.countryCode = passive.countryCode
        }
        return result
    }

    static func parse(statusTexts: [String], toggleTitle: String?, toggleValue: Int?,
                      countryCode: String?, countryTexts: [String]) -> HMAStatus {
        var result = HMAStatus()
        let text = statusTexts.map { $0.lowercased().trimmingCharacters(in: .whitespacesAndNewlines) }
        if text.contains(where: { $0.contains("disconnecting") }) {
            result.state = "disconnecting"
        } else if text.contains(where: { $0.contains("connecting") || $0.contains("reconnecting") }) {
            result.state = "connecting"
        } else if text.contains("vpn is on") && toggleValue == 1 {
            result.state = "connected"
        } else if text.contains("vpn is off") && toggleValue == 0 {
            result.state = "disconnected"
        }
        // Require agreement between the status label and toggle. Missing UI is never VPN off.
        if result.state == "connected", toggleTitle?.lowercased() == "turn on vpn" {
            result.state = "unknown"
        }
        if result.state == "disconnected", toggleTitle?.lowercased() == "turn off vpn" {
            result.state = "unknown"
        }
        if let code = countryCode?.uppercased(), code.range(of: "^[A-Z]{2}$", options: .regularExpression) != nil {
            result.countryCode = code
        }
        result.countryName = countryTexts.first { !$0.hasPrefix("Virtual IP:") && !$0.isEmpty }
        if let ipLabel = countryTexts.first(where: { $0.hasPrefix("Virtual IP:") }) {
            let ip = String(ipLabel.dropFirst("Virtual IP:".count)).trimmingCharacters(in: .whitespacesAndNewlines)
            // The address comes only from HMA. Do not contact an external IP lookup service.
            if ip.range(of: "^(?:[0-9]{1,3}\\.){3}[0-9]{1,3}$", options: .regularExpression) != nil ||
                (ip.contains(":") && ip.range(of: "^[0-9a-fA-F:]+$", options: .regularExpression) != nil) {
                result.virtualIp = ip
            }
        }
        if result.state == "disconnected" { result.virtualIp = nil }
        return result
    }
}

struct BridgeError: Error {
    let code: String
    let message: String
    var json: [String: String] { ["code": code, "message": message] }
}

final class ReadBudget {
    private let clock: () -> TimeInterval
    private let deadline: TimeInterval
    private var treeLimitReached = false
    private var visitedNodes = 0
    private let maximumTotalNodes: Int

    init(timeout: TimeInterval, maximumTotalNodes: Int = 50_000,
         clock: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {
        self.clock = clock
        self.deadline = clock() + timeout
        self.maximumTotalNodes = maximumTotalNodes
    }

    var now: TimeInterval { clock() }
    var remaining: TimeInterval { max(0, deadline - clock()) }
    var failure: BridgeError? {
        if remaining <= 0 {
            return BridgeError(code: "ACTION_TIMEOUT", message: "The HMA command timeout expired. Check its current status before trying again.")
        }
        if treeLimitReached {
            return BridgeError(code: "AX_TREE_LIMIT", message: "HMA's interface exceeded the inspection limit. Close extra HMA windows and try again.")
        }
        return nil
    }

    func check() throws { if let failure { throw failure } }

    func messagingTimeout() -> Float? {
        guard failure == nil else { return nil }
        // Zero resets the AX timeout to its default, so never pass it to AX.
        let seconds = Float(min(0.25, remaining))
        return seconds > 0 ? seconds : nil
    }

    func descendants<Node>(_ roots: [Node], maximumNodes: Int = 2_048,
                           children: (Node) -> [Node]) -> [Node] {
        var result = [Node]()
        var pending = roots.reversed().map { ($0, 0) }
        while let (node, depth) = pending.popLast() {
            guard failure == nil else { break }
            guard result.count < maximumNodes, visitedNodes < maximumTotalNodes, depth < 16 else {
                treeLimitReached = true
                break
            }
            visitedNodes += 1
            result.append(node)
            let next = children(node)
            guard failure == nil else { break }
            guard next.count <= 600 else { treeLimitReached = true; break }
            pending.append(contentsOf: next.reversed().map { ($0, depth + 1) })
        }
        return result
    }
}

struct Country {
    let code: String?
    let name: String
    var json: [String: Any] { ["code": code as Any? ?? NSNull(), "name": name] }

    static func cleanMenuName(_ title: String) -> String {
        title.replacingOccurrences(of: "\u{fffc}", with: "").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func validatedCode(_ value: String) throws -> String {
        let code = value.uppercased()
        guard code.count == 2, Locale.Region.isoRegions.contains(where: { $0.identifier == code }) else {
            throw BridgeError(code: "INVALID_ARGUMENT", message: "Current country must be a two-letter ISO country code.")
        }
        return code
    }

    static func rotationContext(current: HMAStatus, countryHint: String?) -> HMAStatus {
        var context = current
        // Actual HMA metadata wins over the caller's last-observed country.
        if current.countryCode == nil && current.countryName == nil { context.countryCode = countryHint }
        return context
    }

    static func code(for name: String) -> String? {
        let aliases = ["Bosnia & Herzegovina": "BA", "Czech Republic": "CZ", "Macedonia": "MK",
                       "South Korea": "KR", "Russia": "RU", "Taiwan": "TW", "Vietnam": "VN",
                       "Moldova": "MD", "Tanzania": "TZ", "Venezuela": "VE", "Bolivia": "BO"]
        if let code = aliases[name] { return code }
        let english = Locale(identifier: "en_US")
        return Locale.Region.isoRegions.map(\.identifier).first {
            $0.count == 2 && english.localizedString(forRegionCode: $0)?.caseInsensitiveCompare(name) == .orderedSame
        }
    }

    static func next(in requested: [String], available: [Country], current: HMAStatus) throws -> Country {
        var countries = [Country]()
        for value in requested {
            let value = value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard let country = available.first(where: {
                $0.name.caseInsensitiveCompare(value) == .orderedSame || $0.code?.caseInsensitiveCompare(value) == .orderedSame
            }) else {
                throw BridgeError(code: "COUNTRY_UNAVAILABLE", message: "HMA's recent locations do not include \(value). Use that location in HMA once, then reload the country list in settings.")
            }
            if !countries.contains(where: { $0.name == country.name }) { countries.append(country) }
        }
        guard countries.count >= 2 else {
            throw BridgeError(code: "COUNTRY_LIST_REQUIRED", message: "Choose at least two different countries for rotation.")
        }
        if let index = countries.firstIndex(where: {
            $0.name == current.countryName || ($0.code != nil && $0.code == current.countryCode)
        }) { return countries[(index + 1) % countries.count] }
        return countries[0]
    }
}
