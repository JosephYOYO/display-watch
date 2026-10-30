# Display Watch

放在异地的 Mac mini 显示器连接监控。独立运行，不依赖 Quiet 服务；邮件沿用 Quiet 的阿里云 DirectMail RPC 签名方式及简洁 HTML 排版，同时发送纯文本正文。零 npm 依赖，需要 macOS、Node.js 22 或以上；安装需要 Python 3 和 Xcode Command Line Tools（`xcode-select --install`），安装器会编译本机锁屏助手。

## 行为

- 默认每 10 秒运行一次系统显示器查询，连续两个相同样本才确认变化。通常约 10–20 秒后检测到，再发送邮件；短于检查窗口的插拔可能漏检。
- 首次启动若已接显示器，会发送“监控启动：当前显示器”提醒；无显示器时建立空基线。后续记录接入与断开。
- 状态保存在磁盘，重启后比较上一次状态。停机、休眠、FileVault 解锁前，以及机器断电时无法监测；状态相同也不能证明期间从未插拔。
- 查询失败保留上一状态，避免把命令失败误判成拔出。显示设备自身重新枚举仍可能导致提醒。
- 邮件状态：`pending` 等待发送、`accepted` 服务商接受、`failed` 明确失败、`unknown` 结果未知。服务商接受不等于收件箱送达。
- 明确失败按指数退避重试，最多 5 次。网络超时、断流及发送中进程崩溃标记未知，不自动重发，避免重复邮件；需人工核对。长时间离线超过重试次数需要人工处理。
- 默认 `lockOnConnect: true`：安装服务后，桌面助手对接入/启动时已连接的显示器执行锁屏；独立于邮件，发信超时不会阻塞锁屏。连续样本确认仍需约 10–20 秒，不能保证接入瞬间没有画面。锁屏后可正常解锁，不会因显示器持续连接而反复锁屏。
- 锁屏助手每次启动会重新检查已连接的设备，防止机器重启后跳过保护。锁屏失败最多尝试 3 次，记录在 `lock-state.json`，不会伪报成功。默认不弹监控通知、不显示菜单栏图标；系统锁屏界面和系统的后台项目管理提示不受本工具控制。
- 仅保护安装时指定的桌面账户；未登录时本身处于登录界面，助手在该账户登录后启动。其他账户/快速用户切换不在当前保护范围。

## 安装到另一台 Mac

```sh
git clone git@github.com:JosephYOYO/display-watch.git
cd display-watch
npm test
node src/cli.mjs status
mkdir -p "$HOME/Library/Application Support/display-watch"
chmod 700 "$HOME/Library/Application Support/display-watch"
cp config.example.json "$HOME/Library/Application Support/display-watch/config.json"
chmod 600 "$HOME/Library/Application Support/display-watch/config.json"
```

编辑上述 **仓库外** 的 `config.json`：`machine` 填机器名称；`mail.to` 填收件邮箱；`mail.from` 填 DirectMail 中已验证的发信地址；填写对应区域的 AK/Secret，临时凭据还需 `securityToken`。新加坡默认 `ap-southeast-1`，杭州为 `cn-hangzhou`。区域必须与发信账户匹配。凭据不得放进仓库或聊天；建议为该机器单独配置仅允许发信的凭据。示例没有任何真实凭据，克隆后必须单独安全配置。

```sh
# 发送明确标为测试的邮件，并显示服务商回执
node src/cli.mjs test-mail
# 前台仅试运行邮件监控，Ctrl-C 停止；自动锁屏需安装下面的桌面助手
node src/cli.mjs watch
# 安装开机监控和登录锁屏助手；当前接有显示器时会锁屏一次
sudo python3 scripts/service.py install "$(id -un)" "$(command -v node)"
```

安装器把代码复制到配置目录下的 `runtime/`，持久写入两个服务定义，并显式启用：

- `/Library/LaunchDaemons/com.display-watch.monitor.plist`：开机运行邮件监控，无需桌面自动登录。
- `~/Library/LaunchAgents/com.display-watch.lock.plist`：该用户桌面登录后运行锁屏助手。

两个服务都配置 `RunAtLoad=true`、`KeepAlive=true`，重启/登录后自动执行，异常退出由 launchd 重启。安装时先编译并检查锁屏接口，接口不可用就失败；有桌面会话会立即加载助手，没有则等下次登录。FileVault 启动解锁之前不能运行。Node 必须保留在安装时的绝对路径；升级或删除 nvm 的 Node 版本后需要重新安装服务。重新执行安装命令可更新代码；不要同时运行前台监听与服务。

```sh
node src/cli.mjs history
sudo python3 scripts/service.py status "$(id -un)"
tail -f "$HOME/Library/Application Support/display-watch/service.log"
# 卸载服务，保留配置、状态与历史
sudo python3 scripts/service.py uninstall "$(id -un)"
```

状态与记录在 `state.json`，发送前先原子保存状态；同目录的进程锁阻止重复监听。配置权限必须为 600。`service.log` / `service-error.log` 为运行日志。锁屏助手状态在 `lock-state.json`（最近 100 条，本次助手生命周期），错误在 `lock-error.log`。当前版本不自动清理邮件历史，请定期检查目录大小。可用 `DISPLAY_WATCH_HOME` 指定独立测试目录。

## 锁屏接口与重启验收

锁屏助手使用 macOS 私有 `SACLockScreenImmediate` 接口，并通过会话的锁定状态确认结果。该接口也被 [Hammerspoon](https://github.com/Hammerspoon/hammerspoon/blob/master/extensions/caffeinate/libcaffeinate.m) 使用，但不是 Apple 稳定公开 API；macOS 升级后应重新安装检查并实测。代码不使用模拟按键、屏保或熄屏代替锁屏。设置 `lockOnConnect: false` 后重新安装服务可关闭锁屏。

目标 mini 安装后重启，登录后执行 `sudo python3 scripts/service.py status "$(id -un)"`，确认两个任务均为 `running`，检查 `state.json` / `lock-state.json` 的 `lastScan` 为本次开机后的时间；连接显示器，确认锁屏记录 `lockStatus: locked` 并查看邮件。仅有 plist 文件不等于实际开机验证通过。

## 虚拟显示器与检测边界

`status` 列出系统识别到的设备。`hardware-reported` 只表示有厂商/产品标识，不是物理显示器真实性证明；HDMI 欺骗器、虚拟屏、扩展坞可能模拟这些属性。默认所有新增显示设备都会提醒，避免静默漏报。确认属于远程桌面的稳定设备后，可以将其 `id` 加入 `ignoreIds`；不要忽略整个厂商或所有未知设备。显示器关屏也不一定意味着断开。

新机器安装后应实际插拔一次，并分别测试 SSH、RustDesk 等远程连接是否增加设备。这些机器相关行为无法由另一台 Mac 的测试代替。

## 验证

`npm test` 以及 `python3 -m unittest discover -s test -p '*_test.py'` 使用合成数据和模拟邮件服务验证防抖、无头状态、接入/拔出、重启状态恢复、发送落盘、未知结果不重放、失败退避、邮件转义和 RPC 请求；不会访问真实邮箱或凭据。

本机现场验证见 [VALIDATION.md](VALIDATION.md)。
