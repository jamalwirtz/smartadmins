"""
SSTG — Root entry-point shim
==============================
Convenience wrapper so you can run the server from the project root.

Usage (from project root):
    python app.py

Or run directly from backend/:
    cd backend
    uvicorn main:app --reload
"""
import os
import sys

# Add backend/ to path so all imports resolve correctly
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend"))

from main import app  # noqa: F401 — re-export

if __name__ == "__main__":
    try:
        import uvicorn
    except ImportError:
        print("uvicorn not installed. Run:  pip install -r backend/requirements.txt")
        sys.exit(1)

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8000)),
        reload=True,
        reload_dirs=["backend"],
        log_level="info",
    )
