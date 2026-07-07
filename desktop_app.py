from __future__ import annotations

import atexit
import importlib.util
import os
import socket
import subprocess
import sys
import threading
from contextlib import closing
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import webview


APP_TITLE = "Учебное двумерное черчение"
UI_HOST = "127.0.0.1"
BACKEND_HOST = "127.0.0.1"
BACKEND_PORT = 8765


def runtime_root() -> Path:
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS)
    return Path(__file__).resolve().parent


ROOT = runtime_root()
BACKEND_DIR = ROOT / "backend"
BACKEND_CONFIG = BACKEND_DIR / "dwg-service.json"
BACKEND_SCRIPT = BACKEND_DIR / "dwg_service.py"


def find_free_port(host: str = UI_HOST) -> int:
    with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
        sock.bind((host, 0))
        return int(sock.getsockname()[1])


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return


def start_ui_server() -> tuple[ThreadingHTTPServer, int]:
    port = find_free_port()
    handler = partial(QuietHandler, directory=str(ROOT))
    server = ThreadingHTTPServer((UI_HOST, port), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, port


def run_embedded_backend() -> None:
    spec = importlib.util.spec_from_file_location("dwg_service", BACKEND_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load backend module from {BACKEND_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    saved_argv = sys.argv[:]
    try:
        sys.argv = [str(BACKEND_SCRIPT), "--config", str(BACKEND_CONFIG)]
        module.main()
    finally:
        sys.argv = saved_argv


def start_dwg_backend() -> subprocess.Popen[str] | None:
    if not BACKEND_SCRIPT.exists() or not BACKEND_CONFIG.exists():
        return None

    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    command = [sys.executable]
    if getattr(sys, "frozen", False):
        command.append("--run-backend")
    else:
        command.extend([str(Path(__file__).resolve()), "--run-backend"])
    return subprocess.Popen(
        command,
        cwd=str(BACKEND_DIR),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        env=env,
        text=True,
    )


def stop_backend(process: subprocess.Popen[str] | None) -> None:
    if not process or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=3)
    except subprocess.TimeoutExpired:
        process.kill()


def main() -> None:
    if "--run-backend" in sys.argv:
        run_embedded_backend()
        return

    ui_server, port = start_ui_server()
    backend_process = start_dwg_backend()

    def cleanup() -> None:
        stop_backend(backend_process)
        ui_server.shutdown()
        ui_server.server_close()

    atexit.register(cleanup)

    window = webview.create_window(
        APP_TITLE,
        f"http://{UI_HOST}:{port}/index.html",
        width=1440,
        height=960,
        min_size=(1100, 720),
        text_select=True,
    )

    webview.start(debug=False)


if __name__ == "__main__":
    main()
