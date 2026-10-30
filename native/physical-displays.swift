import Foundation
import IOKit

// Read hardware registry services directly. CoreGraphics/software display IDs are not evidence of a cable connection.
func properties(_ entry: io_registry_entry_t) -> [String: Any] {
    var value: Unmanaged<CFMutableDictionary>?
    guard IORegistryEntryCreateCFProperties(entry, &value, kCFAllocatorDefault, 0) == KERN_SUCCESS else { return [:] }
    return value?.takeRetainedValue() as? [String: Any] ?? [:]
}
func services(_ name: String, visit: (io_service_t, [String: Any]) -> Void) throws {
    var iterator: io_iterator_t = 0
    guard IOServiceGetMatchingServices(kIOMainPortDefault, IOServiceMatching(name), &iterator) == KERN_SUCCESS else {
        throw NSError(domain: "registry_query_failed", code: 1)
    }
    defer { IOObjectRelease(iterator) }
    while true {
        let entry = IOIteratorNext(iterator)
        if entry == 0 { break }
        visit(entry, properties(entry))
        IOObjectRelease(entry)
    }
}
func registryPath(_ entry: io_service_t) -> String {
    var buffer = [CChar](repeating: 0, count: 4096)
    guard IORegistryEntryGetPath(entry, kIOServicePlane, &buffer) == KERN_SUCCESS else { return "" }
    return String(cString: buffer)
}
func number(_ value: Any?) -> UInt64 { (value as? NSNumber)?.uint64Value ?? 0 }
func physicalSnapshot() -> [String: Any] {
    var displays: [[String: Any]] = []
    var ports = 0, proxies = 0
    var errors: [String] = []
    do {
        try services("IOMobileFramebuffer") { entry, props in
            guard props["external"] as? Bool == true else { return }
            ports += 1
            guard let attributes = props["DisplayAttributes"] as? [String: Any] else { return }
            guard let product = attributes["ProductAttributes"] as? [String: Any],
                  let transport = props["Transport"] as? [String: Any],
                  let downstream = transport["Downstream"] as? String,
                  ["DP", "HDMI", "DisplayPort"].contains(downstream),
                  number(product["ProductID"]) > 0 else {
                errors.append("unrecognized_external_display_attributes"); return
            }
            let path = registryPath(entry)
            guard !path.isEmpty else { errors.append("registry_path_unavailable"); return }
            let vendor = String(number(product["LegacyManufacturerID"]), radix: 16)
            let model = String(number(product["ProductID"]), radix: 16)
            let serial = String(number(product["SerialNumber"]), radix: 16)
            displays.append(["id": "iokit:\(path):\(vendor):\(model):\(serial)",
                "name": product["ProductName"] as? String ?? "External display",
                "vendor": vendor, "product": model, "serial": serial,
                "registryPath": path, "transport": downstream, "classification": "physical",
                "resolution": "\(number(attributes["NativeFormatHorizontalPixels"])) x \(number(attributes["NativeFormatVerticalPixels"]))"])
        }
        try services("DCPAVServiceProxy") { _, props in
            if props["Location"] as? String == "External" { proxies += 1 }
        }
    } catch { errors.append("registry_query_failed") }
    // A connected service without readable display attributes is a detector failure, not an empty baseline.
    if proxies > displays.count { errors.append("external_service_without_display_attributes") }
    if ports == 0 { errors.append("unsupported_hardware_registry") }
    return ["schemaVersion": 1, "backend": "apple-silicon-iokit", "externalPorts": ports,
            "externalServices": proxies, "displays": displays, "errors": errors]
}
