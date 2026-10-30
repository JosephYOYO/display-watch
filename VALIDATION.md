# 验证记录

日期：2026-10-30。

- 本机 `system_profiler` 实测：Apple M5，Studio Display XDR，5120 × 2880；工具正确识别同一显示器。
- `npm test`：8 项通过，覆盖接入/拔出防抖、无头基线、恢复、邮件发送状态和解析，以及锁屏触发、结果验证、失败重试和启动保护。
- `python3 -m unittest discover -s test -p '*_test.py'`：通过，校验开机监控与桌面锁屏两个服务的持久定义、自动启动和保活配置。
- `python3 -m py_compile scripts/service.py`：通过。
- 真实 DirectMail 测试邮件：服务商返回 `accepted`。
- 本机监听循环：连续两次采样后生成且只生成一条已连接基线记录，邮件返回 `accepted`。
- 同时启动第二个监听进程：正确拒绝，避免重复发送。
- 本机测试监听进程已停止；未安装本机常驻服务。
- 原生锁屏助手本机编译通过，动态接口检查返回 `lock_api_available`。
- 临时 LaunchAgent 真实运行锁屏助手：从本机 Studio Display 的连续采样生成基线事件，实际调用锁屏并回读系统状态，记录 `lockStatus: locked`，一次成功。该测试不配置邮件，验证锁屏不依赖发信。
- 随后关闭临时配置的锁屏开关并终止助手进程，launchd 通过 `KeepAlive` 自动重启；读取到新 PID 和新采样记录。临时 LaunchAgent 已卸载。

真实发信凭据、收件地址和服务商回执保存在仓库外的本地配置/状态目录，不提交到 Git。

尚未验证：用户收件箱实际收取、物理拔插 Studio Display、目标 Mac mini 的无头/远程桌面组合、LaunchDaemon 开机和 FileVault 解锁后的现场行为。插拔转换目前是合成样本测试，不冒充物理实测。
