import importlib.util
import pathlib
import plistlib
import types
import unittest

spec = importlib.util.spec_from_file_location('service', pathlib.Path(__file__).resolve().parents[1] / 'scripts/service.py')
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)


class ServiceTest(unittest.TestCase):
    def test_persistent_boot_and_gui_services(self):
        user = types.SimpleNamespace(pw_dir='/Users/example', pw_name='example')
        home = pathlib.Path(user.pw_dir) / 'Library/Application Support/display-watch'
        daemon, agent = service.definitions(user, pathlib.Path('/opt/node'), home)
        for value in (daemon, agent):
            parsed = plistlib.loads(plistlib.dumps(value))
            self.assertTrue(parsed['RunAtLoad'])
            self.assertTrue(parsed['KeepAlive'])
            self.assertEqual(parsed['ProgramArguments'][0], '/opt/node')
            self.assertEqual(parsed['EnvironmentVariables']['DISPLAY_WATCH_HOME'], str(home))
        self.assertEqual(daemon['UserName'], 'example')
        self.assertEqual(agent['LimitLoadToSessionType'], 'Aqua')
        self.assertNotIn('UserName', agent)
        self.assertTrue(agent['ProgramArguments'][1].endswith('src/lock-agent.mjs'))


if __name__ == '__main__':
    unittest.main()
