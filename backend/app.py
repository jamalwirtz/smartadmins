"""
SSTG — Entry-point shim
========================
Lets you run the server with just:   python app.py
Or via uvicorn directly:             uvicorn main:app --reload

Render.com start command:            uvicorn main:app --host 0.0.0.0 --port $PORT
  (NOT app.main:app — files are flat, no nested package)
"""
import os
import sys

# Make sure backend/ is on the path when run from any directory
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from main import app  # noqa: E402  — re-export for uvicorn / gunicorn

if __name__ == "__main__":
    try:
        import uvicorn
    except ImportError:
        print("uvicorn not installed. Run:  pip install -r requirements.txt")
        sys.exit(1)

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8000)),
        reload=True,
        log_level="info",
    )
