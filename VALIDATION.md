# 验证记录

日期：2026-10-30。

- 本机 `system_profiler` 实测：Apple M5，Studio Display XDR，5120 × 2880；工具正确识别同一显示器。
- `npm test`：5 项通过，覆盖接入/拔出防抖、无头基线、恢复、邮件发送状态和解析。
- `python3 -m py_compile scripts/service.py`：通过。
- 真实 DirectMail 测试邮件：服务商返回 `accepted`。
- 本机监听循环：连续两次采样后生成且只生成一条已连接基线记录，邮件返回 `accepted`。
- 同时启动第二个监听进程：正确拒绝，避免重复发送。
- 本机测试监听进程已停止；未安装本机常驻服务。

真实发信凭据、收件地址和服务商回执保存在仓库外的本地配置/状态目录，不提交到 Git。

尚未验证：用户收件箱实际收取、物理拔插 Studio Display、目标 Mac mini 的无头/远程桌面组合、LaunchDaemon 开机和 FileVault 解锁后的现场行为。插拔转换目前是合成样本测试，不冒充物理实测。
