import Foundation
import CoreGraphics
import Darwin

// 私有系统接口：升级 macOS 后必须重新检查，不依赖熄屏/屏保密码设置。
func locked() -> Bool {
    guard let session = CGSessionCopyCurrentDictionary() as? [String: Any] else { return false }
    return session["CGSSessionScreenIsLocked"] as? Bool == true
}
let mode = CommandLine.arguments.dropFirst().first ?? "--check"
guard ["--check", "--lock", "--status", "--displays"].contains(mode) else { exit(64) }
if mode == "--displays" {
    let data = try JSONSerialization.data(withJSONObject: physicalSnapshot(), options: [.sortedKeys])
    print(String(data: data, encoding: .utf8)!)
    exit(0)
}
if mode == "--status" { print(locked() ? "locked" : "unlocked-or-unavailable"); exit(0) }
guard let handle = dlopen("/System/Library/PrivateFrameworks/login.framework/Versions/A/login", RTLD_LAZY | RTLD_LOCAL),
      let symbol = dlsym(handle, "SACLockScreenImmediate") else {
    print("lock_api_unavailable"); exit(2)
}
if mode == "--check" { print("lock_api_available"); exit(0) }
if locked() { print("locked"); exit(0) }
typealias LockFunction = @convention(c) () -> Int32
let lock = unsafeBitCast(symbol, to: LockFunction.self)
_ = lock()
let deadline = Date().addingTimeInterval(5)
while Date() < deadline {
    if locked() { print("locked"); exit(0) }
    RunLoop.current.run(until: Date().addingTimeInterval(0.1))
}
print("lock_not_confirmed"); exit(3)
