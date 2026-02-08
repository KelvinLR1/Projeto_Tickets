import sys
import os
import traceback

sys.path.insert(0, os.getcwd())

with open("diagnose_log.txt", "w") as f:
    try:
        import server.main
        f.write("Import server.main SUCCESS\n")
    except Exception:
        traceback.print_exc(file=f)
