#!/usr/bin/env python3
"""开机监控服务 + 桌面登录锁屏助手；安装后自动恢复，无需手动运行。"""
import os
import pathlib
import plistlib
import pwd
import shutil
import subprocess
import sys
import tempfile

LABEL = 'com.display-watch.monitor'
LOCK_LABEL = 'com.display-watch.lock'
TARGET = pathlib.Path('/Library/LaunchDaemons/' + LABEL + '.plist')


def definitions(user, node, home):
    runtime = home / 'runtime'
    common = {'EnvironmentVariables': {'HOME': user.pw_dir, 'DISPLAY_WATCH_HOME': str(home)},
              'RunAtLoad': True, 'KeepAlive': True, 'ThrottleInterval': 30}
    monitor = {**common, 'Label': LABEL, 'UserName': user.pw_name,
               'ProgramArguments': [str(node), str(runtime / 'src/cli.mjs'), 'watch'],
               'StandardOutPath': str(home / 'service.log'), 'StandardErrorPath': str(home / 'service-error.log')}
    agent = {**common, 'Label': LOCK_LABEL, 'LimitLoadToSessionType': 'Aqua',
             'ProgramArguments': [str(node), str(runtime / 'src/lock-agent.mjs')],
             'StandardOutPath': str(home / 'lock.log'), 'StandardErrorPath': str(home / 'lock-error.log')}
    return monitor, agent


def run(*args, check=True):
    return subprocess.run(list(args), check=check)


def main():
    if len(sys.argv) < 3 or sys.argv[1] not in ('install', 'uninstall', 'status'):
        sys.exit('用法：sudo python3 scripts/service.py install 用户名 node绝对路径 | uninstall 用户名 | status 用户名')
    action, user = sys.argv[1], pwd.getpwnam(sys.argv[2])
    if user.pw_uid == 0:
        sys.exit('需要普通桌面用户')
    home = pathlib.Path(user.pw_dir) / 'Library/Application Support/display-watch'
    agent_path = pathlib.Path(user.pw_dir) / 'Library/LaunchAgents' / (LOCK_LABEL + '.plist')
    gui = 'gui/' + str(user.pw_uid)
    if action == 'status':
        print('开机服务安装：', TARGET.is_file(), '登录锁屏助手安装：', agent_path.is_file(), flush=True)
        a = run('launchctl', 'print', 'system/' + LABEL, check=False)
        b = run('launchctl', 'print', gui + '/' + LOCK_LABEL, check=False)
        sys.exit(0 if a.returncode == b.returncode == 0 else 1)
    if os.geteuid() != 0:
        sys.exit('安装/卸载需要 sudo')
    if action == 'uninstall':
        run('launchctl', 'bootout', 'system/' + LABEL, check=False)
        run('launchctl', 'bootout', gui + '/' + LOCK_LABEL, check=False)
        TARGET.unlink(missing_ok=True)
        agent_path.unlink(missing_ok=True)
        return
    if len(sys.argv) != 4:
        sys.exit('安装需要 Node 绝对路径')
    node = pathlib.Path(sys.argv[3]).resolve()
    config_path = home / 'config.json'
    if not node.is_file() or not config_path.is_file() or config_path.stat().st_mode & 0o077:
        sys.exit('检查 Node 路径、配置文件及 chmod 600 权限')
    root = pathlib.Path(__file__).resolve().parent.parent
    # 先编译和检查锁屏接口，再替换已安装服务；安装时不执行锁屏。
    with tempfile.TemporaryDirectory(prefix='display-watch-build-') as build:
        binary = pathlib.Path(build) / 'lock-screen'
        run('xcrun', 'swiftc', str(root / 'native/lock-screen.swift'), '-o', str(binary))
        run(str(binary), '--check')
        run('launchctl', 'bootout', 'system/' + LABEL, check=False)
        run('launchctl', 'bootout', gui + '/' + LOCK_LABEL, check=False)
        runtime = home / 'runtime'
        shutil.copytree(root / 'src', runtime / 'src', dirs_exist_ok=True)
        (runtime / 'bin').mkdir(exist_ok=True)
        shutil.copy2(binary, runtime / 'bin/lock-screen')
    for p in [runtime, *runtime.rglob('*')]:
        os.chown(p, user.pw_uid, user.pw_gid)
    monitor, agent = definitions(user, node, home)
    agent_path.parent.mkdir(parents=True, exist_ok=True)
    os.chown(agent_path.parent, user.pw_uid, user.pw_gid)
    for target, definition in [(TARGET, monitor), (agent_path, agent)]:
        target.write_bytes(plistlib.dumps(definition)); target.chmod(0o644)
    os.chown(agent_path, user.pw_uid, user.pw_gid)
    run('launchctl', 'enable', 'system/' + LABEL)
    run('launchctl', 'bootstrap', 'system', str(TARGET))
    available = subprocess.run(['launchctl', 'print', gui], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
    if available:
        run('launchctl', 'enable', gui + '/' + LOCK_LABEL)
        run('launchctl', 'bootstrap', gui, str(agent_path))
        run('launchctl', 'print', gui + '/' + LOCK_LABEL)
    else:
        print('桌面会话尚未登录；锁屏助手将在该用户下次桌面登录时自动启动。')
    run('launchctl', 'print', 'system/' + LABEL)


if __name__ == '__main__':
    main()
