#!/usr/bin/env python3
"""Serve the standalone page and its fixed, read-only API upstream."""

import argparse
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, unquote, urlsplit
from urllib.request import Request, urlopen

from verification import UPSTREAM, CheckBusy, Checks

PAGE = Path(__file__).with_name("index.html")
MAX_RESPONSE = 16 * 1024 * 1024

CHECKS = Checks(
    Path(os.environ.get("SUBREGATOR_CHECKS_DIR", PAGE.parent / "var")) / "checks.sqlite"
)


class Server(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, *args, **kwargs):
        self.slots = threading.BoundedSemaphore(64)
        super().__init__(*args, **kwargs)

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            try:
                request.settimeout(1)
                request.sendall(
                    b"HTTP/1.1 503 Service Unavailable\r\nRetry-After: 1\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                )
            except OSError:
                pass
            finally:
                self.shutdown_request(request)
            return
        request.settimeout(30)
        try:
            super().process_request(request, client_address)
        except Exception:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()


class Handler(BaseHTTPRequestHandler):
    def respond(self, status, body, content_type, retry_after=None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        if retry_after:
            self.send_header("Retry-After", retry_after)
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        path = urlsplit(self.path)
        if path.path == "/healthz":
            self.respond(200, b'{"status":"ok"}', "application/json")
        elif path.path == "/":
            self.respond(200, PAGE.read_bytes(), "text/html; charset=utf-8")
        elif path.path == "/api/v1/offer-checks":
            params = parse_qs(path.query, keep_blank_values=True)
            try:
                if (
                    set(params) != {"resource"}
                    or len(params["resource"]) != 1
                    or len(params["resource"][0]) > 64
                ):
                    raise ValueError("One resource is required")
                result = CHECKS.inspect(params["resource"][0])
                self.respond(200, json.dumps(result).encode(), "application/json")
            except ValueError:
                self.respond(
                    400, b'{"error":"invalid_public_ipv4_prefix"}', "application/json"
                )
            except CheckBusy as error:
                self.respond(
                    429,
                    b'{"error":"check_budget_reached"}',
                    "application/json",
                    str(error.seconds),
                )
        elif path.path.startswith("/offers/"):
            self.send_response(302)
            self.send_header(
                "Location", "/#offer=" + quote(unquote(path.path[8:]), safe="")
            )
            self.end_headers()
        elif path.path.startswith("/api/v1/") or path.path == "/openapi.json":
            if len(self.path) > 8192:
                self.respond(414, b'{"error":"query_too_long"}', "application/json")
                return
            target = UPSTREAM + path.path + ("?" + path.query if path.query else "")
            try:
                request = Request(
                    target,
                    headers={
                        "Accept": "application/json",
                        "User-Agent": "Subregator/0.2",
                    },
                )
                with urlopen(request, timeout=20) as response:
                    body = response.read(MAX_RESPONSE + 1)
                    if len(body) > MAX_RESPONSE:
                        raise ValueError("Response too large")
                    self.respond(
                        response.status,
                        body,
                        response.headers.get("Content-Type", "application/json"),
                    )
            except HTTPError as error:
                self.respond(
                    error.code,
                    json.dumps({"error": "upstream_error"}).encode(),
                    "application/json",
                    error.headers.get("Retry-After"),
                )
            except (URLError, TimeoutError, OSError, ValueError):
                self.respond(
                    502, b'{"error":"upstream_unavailable"}', "application/json"
                )
        else:
            self.respond(404, b"Not found", "text/plain; charset=utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5173)
    args = parser.parse_args()
    print(f"Subregator: http://{args.bind}:{args.port} (real API)", flush=True)
    Server((args.bind, args.port), Handler).serve_forever()
