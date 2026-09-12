import Foundation

let supportedCommands = ["status", "prepare", "connect", "disconnect", "reconnect", "countries", "next-country"]
let arguments = Array(CommandLine.arguments.dropFirst())
let command = arguments.first ?? "status"
var bridge: HMAAccessibility?
var commandLock: CommandLock?
var timeout: TimeInterval = 35
var requestedCountries = [String]()
var currentCountry: String?
var exitCode: Int32 = 0
var result: [String: Any]?
var failure: BridgeError?

do {
    guard supportedCommands.contains(command) else {
        throw BridgeError(code: "INVALID_ARGUMENT", message: "Expected one of: \(supportedCommands.joined(separator: ", ")).")
    }
    var index = 1
    while index < arguments.count {
        let option = arguments[index]
        guard index + 1 < arguments.count else { throw BridgeError(code: "INVALID_ARGUMENT", message: "Missing value for \(option).") }
        let value = arguments[index + 1]
        switch option {
        case "--timeout":
            guard let parsed = TimeInterval(value), parsed.isFinite, parsed >= 1, parsed <= 120 else {
                throw BridgeError(code: "INVALID_ARGUMENT", message: "Timeout must be between 1 and 120 seconds.")
            }
            timeout = parsed
        case "--countries":
            guard let data = value.data(using: .utf8), let parsed = try? JSONSerialization.jsonObject(with: data) as? [String], parsed.count <= 100 else {
                throw BridgeError(code: "INVALID_ARGUMENT", message: "Countries must be a JSON array of country codes or exact country names.")
            }
            requestedCountries = parsed
        case "--current-country":
            currentCountry = try Country.validatedCode(value)
        default:
            throw BridgeError(code: "INVALID_ARGUMENT", message: "Unknown option: \(option).")
        }
        index += 2
    }
    if command != "status" { commandLock = try CommandLock() }
    let controller = try HMAAccessibility(timeout: timeout, allowLaunch: command == "prepare")
    bridge = controller
    switch command {
    case "status":
        let status = controller.status()
        try controller.requireTimeRemaining()
        guard status.state != "unknown" else {
            throw BridgeError(code: "STATUS_UNAVAILABLE", message: "HMA's menu-bar connection status could not be read. Make sure HMA is running with its English interface.")
        }
    case "prepare": _ = try controller.prepare()
    case "connect": _ = try controller.setConnected(true)
    case "disconnect": _ = try controller.setConnected(false)
    case "reconnect": result = try controller.reconnect()
    case "countries": result = ["countries": try controller.countries().map { $0.json }, "source": "recentLocations"]
    case "next-country": result = try controller.nextCountry(requested: requestedCountries, currentCountry: currentCountry)
    default: break
    }
} catch let error as BridgeError {
    failure = error
    exitCode = error.code == "INVALID_ARGUMENT" ? 2 : 1
} catch {
    failure = BridgeError(code: "UNEXPECTED_ERROR", message: "The HMA helper could not complete this command.")
    exitCode = 1
}
if failure == nil, let expired = bridge?.readBudget.failure {
    failure = expired
    exitCode = 1
}
// Commands retain their final snapshot. Formatting a response never starts new AX reads.
let current = bridge?.responseStatus ?? HMAStatus()
var output: [String: Any] = ["ok": failure == nil, "command": command, "status": current.json,
    "capabilities": bridge?.responseCapabilities ?? HMAAccessibility.noCapabilities,
    "countries": bridge?.responseCountries.map { $0.json } ?? []]
if let result { output["result"] = result }
if let failure { output["error"] = failure.json }
if let data = try? JSONSerialization.data(withJSONObject: output, options: [.sortedKeys]), let line = String(data: data, encoding: .utf8) {
    print(line)
} else {
    print("{\"ok\":false,\"error\":{\"code\":\"ENCODING_ERROR\",\"message\":\"Unable to encode bridge result.\"}}")
    exitCode = 1
}
withExtendedLifetime(commandLock) {}
exit(exitCode)
