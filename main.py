"""
SSTG — Root-level entry point
================================
Run from the project root (SmartAdmin/):
    uvicorn main:app --reload

Render Start Command:
    uvicorn main:app --host 0.0.0.0 --port $PORT

Uses importlib to load backend/main.py by file path to avoid
the circular-import problem that 'from main import app' would cause
when this file is also named main.py.
"""
import sys
import os
import importlib.util

# Add backend/ to sys.path so backend/main.py's imports (config, models, etc.) resolve
_BACKEND = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

# Load backend/main.py by file path — zero circular-import risk
_spec = importlib.util.spec_from_file_location(
    "_sstg_backend", os.path.join(_BACKEND, "main.py")
)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["_sstg_backend"] = _mod
_spec.loader.exec_module(_mod)

# Re-export the FastAPI app so uvicorn finds it as main:app
app = _mod.app

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8000)),
        reload=True,
        reload_dirs=[_BACKEND],
    )
