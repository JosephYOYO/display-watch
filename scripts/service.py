#!/usr/bin/env python3
"""安装开机服务，以指定普通用户运行；不需要自动登录。"""
import os, pathlib, plistlib, pwd, shutil, subprocess, sys
label = 'com.display-watch.monitor'
target = pathlib.Path('/Library/LaunchDaemons/' + label + '.plist')
if os.geteuid() != 0:
    sys.exit('请使用 sudo python3 scripts/service.py install 用户名 node绝对路径 或 uninstall')
action = sys.argv[1] if len(sys.argv) > 1 else ''
if action == 'uninstall':
    subprocess.run(['launchctl', 'bootout', 'system/' + label], check=False)
    target.unlink(missing_ok=True)
elif action == 'install' and len(sys.argv) == 4:
    user = pwd.getpwnam(sys.argv[2])
    node = pathlib.Path(sys.argv[3]).resolve()
    if not node.is_file() or user.pw_uid == 0:
        sys.exit('需要普通用户和有效 Node 路径')
    home = pathlib.Path(user.pw_dir) / 'Library/Application Support/display-watch'
    if not (home / 'config.json').is_file():
        sys.exit('请先创建配置并 chmod 600')
    root = pathlib.Path(__file__).resolve().parent.parent
    runtime = home / 'runtime'
    shutil.copytree(root / 'src', runtime / 'src', dirs_exist_ok=True)
    for p in [runtime, *runtime.rglob('*')]:
        os.chown(p, user.pw_uid, user.pw_gid)
    config = {'Label': label, 'UserName': user.pw_name, 'ProgramArguments': [str(node), str(runtime / 'src/cli.mjs'), 'watch'],
              'EnvironmentVariables': {'HOME': user.pw_dir, 'DISPLAY_WATCH_HOME': str(home)},
              'RunAtLoad': True, 'KeepAlive': True, 'ThrottleInterval': 30,
              'StandardOutPath': str(home / 'service.log'), 'StandardErrorPath': str(home / 'service-error.log')}
    subprocess.run(['launchctl', 'bootout', 'system/' + label], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    target.write_bytes(plistlib.dumps(config)); target.chmod(0o644)
    subprocess.run(['launchctl', 'bootstrap', 'system', str(target)], check=True)
    subprocess.run(['launchctl', 'print', 'system/' + label], check=True)
else:
    sys.exit('用法：install 用户名 node绝对路径 | uninstall')
