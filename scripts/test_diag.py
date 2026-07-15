import importlib.util
import sys
import os

libs = ["fastapi", "pg8000", "win32api"]
print(f"Python executable: {sys.executable}")
print(f"Python version: {sys.version}")
print(f"sys.path: {sys.path}")

for lib in libs:
    spec = importlib.util.find_spec(lib)
    print(f"Library '{lib}': spec={spec}")
    try:
        mod = importlib.import_module(lib)
        print(f"  Import {lib} SUCCESS: {mod.__file__ if hasattr(mod, '__file__') else 'no __file__'}")
    except Exception as e:
        print(f"  Import {lib} FAILED: {e}")

try:
    import subprocess
    res = subprocess.run([sys.executable, "-m", "PyInstaller", "--version"], capture_output=True, text=True)
    print(f"PyInstaller via -m: returncode={res.returncode}, stdout={res.stdout.strip()}, stderr={res.stderr.strip()}")
except Exception as e:
    print(f"PyInstaller check FAILED: {e}")
