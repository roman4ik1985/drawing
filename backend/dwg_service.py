from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import tempfile
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
DEFAULT_CONFIG = ROOT / "dwg-service.json"


def load_config(config_path: Path) -> dict[str, Any]:
    if not config_path.exists():
        raise FileNotFoundError(
            f"Config file not found: {config_path}. "
            f"Create it from {DEFAULT_CONFIG.with_name('dwg-service.example.json')}"
        )
    with config_path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def make_health(config: dict[str, Any]) -> dict[str, Any]:
    converter = config.get("converter", {})
    command_template = converter.get("command_template") or []
    executable = command_template[0] if command_template else None
    command_available = bool(executable and shutil.which(executable))
    configured = bool(command_template)
    available = configured and command_available
    detail = "готов" if available else ("конвертер не найден" if configured else "нет конфигурации")
    return {
        "available": available,
        "configured": configured,
        "command_available": command_available,
        "detail": detail,
    }


def substitute_template(template: list[str], placeholders: dict[str, str]) -> list[str]:
    result: list[str] = []
    for item in template:
        value = item
        for key, replacement in placeholders.items():
            value = value.replace("{" + key + "}", replacement)
        result.append(value)
    return result


def build_command(config: dict[str, Any], source_dir: Path, target_dir: Path, input_file: Path, output_file: Path) -> list[str]:
    converter = config["converter"]
    placeholders = {
        "service_dir": str(ROOT),
        "source_dir": str(source_dir),
        "target_dir": str(target_dir),
        "input_path": str(input_file),
        "input_name": input_file.name,
        "input_filter": converter.get("input_filter", "*.dxf"),
        "output_version": converter.get("output_version", "ACAD2018"),
        "output_format": converter.get("output_format", "DWG"),
        "recursive_flag": converter.get("recursive_flag", "0"),
        "audit_flag": converter.get("audit_flag", "1"),
        "output_path": str(output_file),
        "python": shutil.which("python") or "python",
    }
    return substitute_template(converter["command_template"], placeholders)


def convert_dxf_to_dwg(config: dict[str, Any], filename: str, dxf_text: str) -> bytes:
    extension = config.get("converter", {}).get("output_extension", ".dwg")
    safe_name = "".join(char if char.isalnum() or char in ("-", "_") else "_" for char in filename).strip("_") or "drawing"

    with tempfile.TemporaryDirectory(prefix="dwg-service-") as temp_dir_str:
        temp_dir = Path(temp_dir_str)
        source_dir = temp_dir / "source"
        target_dir = temp_dir / "target"
        source_dir.mkdir(parents=True, exist_ok=True)
        target_dir.mkdir(parents=True, exist_ok=True)

        input_file = source_dir / f"{safe_name}.dxf"
        output_file = target_dir / f"{safe_name}{extension}"
        input_file.write_text(dxf_text, encoding="utf-8", newline="\r\n")

        command = build_command(config, source_dir, target_dir, input_file, output_file)
        subprocess.run(command, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

        if not output_file.exists():
            raise FileNotFoundError(f"Expected output file not found: {output_file}")
        return output_file.read_bytes()


class DwgHandler(BaseHTTPRequestHandler):
    server_version = "DWGService/1.0"

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self._cors_headers()
        self.end_headers()

    def do_GET(self) -> None:
        if self.path != "/health":
            self._json_response(HTTPStatus.NOT_FOUND, {"error": "not-found"})
            return
        self._json_response(HTTPStatus.OK, make_health(self.server.config))

    def do_POST(self) -> None:
        if self.path != "/convert/dxf-to-dwg":
            self._json_response(HTTPStatus.NOT_FOUND, {"error": "not-found"})
            return

        health = make_health(self.server.config)
        if not health["available"]:
            self._json_response(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "dwg-backend-unavailable", **health})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            content_length = 0
        raw_body = self.rfile.read(content_length)

        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except json.JSONDecodeError:
            self._json_response(HTTPStatus.BAD_REQUEST, {"error": "invalid-json"})
            return

        filename = str(payload.get("filename") or "drawing")
        dxf_text = payload.get("dxf")
        if not isinstance(dxf_text, str) or not dxf_text.strip():
            self._json_response(HTTPStatus.BAD_REQUEST, {"error": "missing-dxf"})
            return

        try:
            dwg_bytes = convert_dxf_to_dwg(self.server.config, filename, dxf_text)
        except subprocess.CalledProcessError as error:
            stderr = error.stderr.decode("utf-8", errors="replace") if error.stderr else str(error)
            self._json_response(HTTPStatus.BAD_GATEWAY, {"error": "converter-failed", "detail": stderr})
            return
        except FileNotFoundError as error:
            self._json_response(HTTPStatus.BAD_GATEWAY, {"error": "output-not-found", "detail": str(error)})
            return
        except Exception as error:
            self._json_response(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "internal-error", "detail": str(error)})
            return

        safe_name = "".join(char if char.isalnum() or char in ("-", "_") else "_" for char in filename).strip("_") or "drawing"
        self.send_response(HTTPStatus.OK)
        self._cors_headers()
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Disposition", f'attachment; filename="{safe_name}.dwg"')
        self.send_header("Content-Length", str(len(dwg_bytes)))
        self.end_headers()
        self.wfile.write(dwg_bytes)

    def _json_response(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")


class DwgServer(ThreadingHTTPServer):
    def __init__(self, server_address: tuple[str, int], handler: type[BaseHTTPRequestHandler], config: dict[str, Any]):
        super().__init__(server_address, handler)
        self.config = config


def main() -> None:
    parser = argparse.ArgumentParser(description="Local DWG conversion backend")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG), help="Path to dwg-service.json")
    args = parser.parse_args()

    try:
        config = load_config(Path(args.config))
    except FileNotFoundError as error:
        print(str(error), flush=True)
        raise SystemExit(1)
    except json.JSONDecodeError as error:
        print(f"Invalid JSON in config: {error}", flush=True)
        raise SystemExit(1)

    host = config.get("host", "127.0.0.1")
    port = int(config.get("port", 8765))
    server = DwgServer((host, port), DwgHandler, config)
    print(f"DWG service listening on http://{host}:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
