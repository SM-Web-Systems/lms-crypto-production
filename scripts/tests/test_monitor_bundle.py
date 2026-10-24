import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[2]
FILES=['lms-health-monitor.sh','lms-deadman-check.sh','monitor_evidence.py','verify-stability.py','build-stability-evidence.py']


class BundleTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='auth13 bundle fixture ')
        self.root=Path(self.temp.name);self.source=self.root/'source';self.source.mkdir()
        (self.source/'scripts').mkdir();(self.root/'hooks').mkdir()
        for name in FILES:(self.source/'scripts'/name).write_text('# fixture '+name+'\n')
        self.git('init');self.git('config','core.hooksPath',str(self.root/'hooks'))
        self.git('add','.');self.git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','fixture')
        self.sha=self.git('rev-parse','HEAD').strip();self.output=self.root/'immutable bundle'

    def tearDown(self):self.temp.cleanup()
    def git(self,*args):return subprocess.check_output(['git',*args],cwd=self.source,text=True,stderr=subprocess.DEVNULL)
    def build(self,sha=None):
        return subprocess.run([sys.executable,str(ROOT/'scripts'/'build-monitor-bundle.py'),'--source',str(self.source),'--sha',sha or self.sha,'--output',str(self.output)],capture_output=True,text=True)
    def verify(self):
        return subprocess.run([sys.executable,str(ROOT/'scripts'/'build-monitor-bundle.py'),'--verify',str(self.output),'--sha',self.sha],capture_output=True,text=True)

    def test_bundle_uses_only_committed_scripts_and_verifies_digests(self):
        result=self.build();self.assertEqual(result.returncode,0,result.stderr)
        manifest=json.loads((self.output/'manifest.json').read_text())
        self.assertEqual(manifest['source_sha'],self.sha)
        self.assertEqual(set(manifest['files']),set(FILES))
        for name in FILES:
            self.assertEqual(manifest['files'][name],hashlib.sha256((self.output/name).read_bytes()).hexdigest())
        self.assertEqual(self.verify().returncode,0)
        self.assertEqual(self.git('status','--porcelain'),'')

    def test_wrong_sha_dirty_source_and_existing_destination_refused(self):
        self.assertNotEqual(self.build('a'*40).returncode,0);self.assertFalse(self.output.exists())
        (self.source/'scripts'/FILES[0]).write_text('dirty')
        self.assertNotEqual(self.build().returncode,0);self.assertFalse(self.output.exists())
        self.git('checkout','--','scripts/'+FILES[0])
        self.output.mkdir();(self.output/'sentinel').write_text('keep')
        self.assertNotEqual(self.build().returncode,0);self.assertEqual((self.output/'sentinel').read_text(),'keep')

    def test_modified_bundle_or_wrong_source_identity_refused(self):
        self.assertEqual(self.build().returncode,0)
        (self.output/FILES[0]).write_text('tampered')
        self.assertNotEqual(self.verify().returncode,0)

    def test_bundle_cannot_be_installed_inside_mutable_source_checkout(self):
        self.output=self.source/'bundled-monitor'
        self.assertNotEqual(self.build().returncode,0)
        self.assertFalse(self.output.exists())


if __name__=='__main__':unittest.main()
