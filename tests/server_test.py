import os
import subprocess
import sys
import unittest


class ConfigurationTests(unittest.TestCase):
    def test_catalogue_and_network_checks_use_the_configured_internal_origin(self):
        result = subprocess.run(
            [
                sys.executable,
                "-c",
                "import verification; print(verification.UPSTREAM); print(verification.API)",
            ],
            env={**os.environ, "SUBREGATOR_API_URL": "http://backend:8080/"},
            capture_output=True,
            text=True,
            check=True,
        )
        self.assertEqual(
            result.stdout.splitlines(),
            ["http://backend:8080", "http://backend:8080/api/v1/network"],
        )

    def test_invalid_upstream_configuration_fails_startup(self):
        for origin in (
            "file:///etc/passwd",
            "http://user:secret@backend",
            "http://backend/path",
            "http://backend?target=elsewhere",
        ):
            with self.subTest(origin=origin):
                result = subprocess.run(
                    [sys.executable, "-c", "import verification"],
                    env={**os.environ, "SUBREGATOR_API_URL": origin},
                    check=False,
                    capture_output=True,
                    text=True,
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("must be an HTTP(S) origin", result.stderr)


if __name__ == "__main__":
    unittest.main()
