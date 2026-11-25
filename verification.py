"""Source-scoped verification for published IPv4 prefixes."""

import ipaddress
import json
import math
import os
import sqlite3
import threading
import time
from collections import OrderedDict, deque
from datetime import UTC, datetime
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

UPSTREAM = os.environ.get("SUBREGATOR_API_URL", "https://api.subregator.com").rstrip(
    "/"
)
_upstream = urlsplit(UPSTREAM)
if (
    _upstream.scheme not in {"http", "https"}
    or not _upstream.hostname
    or _upstream.username
    or _upstream.password
    or _upstream.path
    or _upstream.query
    or _upstream.fragment
):
    raise ValueError("SUBREGATOR_API_URL must be an HTTP(S) origin without credentials")
API = UPSTREAM + "/api/v1/network"
DROP = "https://www.spamhaus.org/drop/drop_v4.json"
DROP_POLICY = "https://www.spamhaus.org/faqs/do-not-route-or-peer-drop/"
DAY = 86400


def stamp(value):
    return datetime.fromtimestamp(value, UTC).isoformat().replace("+00:00", "Z")


def timestamp(value):
    try:
        parsed = datetime.fromisoformat(value)
        return parsed.timestamp() if parsed.tzinfo else None
    except (AttributeError, TypeError, ValueError):
        return None


def download(url, limit):
    request = Request(
        url, headers={"Accept": "application/json", "User-Agent": "Subregator/0.2"}
    )
    with urlopen(request, timeout=15) as response:
        if response.status != 200:
            raise ValueError("Source did not return a complete response")
        body = response.read(limit + 1)
    if len(body) > limit:
        raise ValueError("Source response exceeds the size limit")
    return body


def public_prefix(value):
    network = ipaddress.ip_network(value, strict=False)
    if (
        network.version != 4
        or not network.is_global
        or not network.network_address.is_global
        or network.is_multicast
    ):
        raise ValueError("A published public IPv4 prefix is required")
    return network


def same_prefix(value, network):
    try:
        return ipaddress.ip_network(value, strict=False) == network
    except (ValueError, TypeError):
        return False


def metric_check(metric, now):
    metric = metric or {}
    observed, expires = (
        timestamp(metric.get("observed_at")),
        timestamp(metric.get("expires_at")),
    )
    fresh = (
        metric.get("status") == "ok"
        and observed is not None
        and expires is not None
        and observed <= now + 60
        and observed <= expires
        and expires > now
    )
    return {
        "status": "unavailable",
        "freshness": "fresh" if fresh else "stale" if metric.get("data") else "unknown",
        "observed_at": metric.get("observed_at"),
        "expires_at": metric.get("expires_at"),
        "source": "RIPEstat",
        "source_url": metric.get("source_url"),
        "coverage": metric.get("coverage"),
        "reason": metric.get("error") or "No valid source observation",
    }


def network_checks(report, network, now):
    metrics = {
        m.get("name"): m for m in report.get("metrics", []) if isinstance(m, dict)
    }
    overview, validation = metrics.get("prefix_overview", {}), metrics.get("rpki", {})
    bgp, rpki = metric_check(overview, now), metric_check(validation, now)
    resource = (
        report.get("resource") if isinstance(report.get("resource"), dict) else {}
    )
    if resource.get("value") != str(network):
        bgp["reason"] = rpki["reason"] = (
            "Response resource does not match the queried prefix"
        )
        return bgp, rpki
    data = overview.get("data") if isinstance(overview.get("data"), dict) else {}
    origins = data.get("asns")
    valid_origins = isinstance(origins, list) and all(
        isinstance(a, dict) and type(a.get("asn")) is int and 0 < a["asn"] <= 4294967295
        for a in origins
    )
    origin_ids = {a["asn"] for a in origins} if valid_origins else set()
    bgp.update(
        {
            "query_time": data.get("query_time"),
            "origins": sorted(origin_ids),
            "low_visibility_filtered": data.get("num_filtered_out"),
        }
    )
    exact = (
        same_prefix(data.get("resource"), network)
        and data.get("is_less_specific") is False
    )
    if not exact:
        bgp.update(
            status="covering_route" if data.get("is_less_specific") else "unavailable",
            reason="No exact-prefix observation; a covering route is not the offered route",
        )
        rpki["reason"] = "Exact observed origin ASNs are required"
        return bgp, rpki
    if data.get("announced") is False and valid_origins and not origin_ids:
        bgp.update(
            status="not_announced",
            reason="No exact announcement in this RIS observation",
        )
        rpki.update(
            status="not_applicable",
            reason="No observed exact-prefix origin to validate",
        )
        return bgp, rpki
    if data.get("announced") is not True or not valid_origins or not origin_ids:
        return bgp, rpki
    bgp.update(
        status="announced",
        reason="Exact prefix observed by RIS; not a reachability or safety guarantee",
    )
    payload = validation.get("data") if isinstance(validation.get("data"), dict) else {}
    results = payload.get("origins")
    rpki["origins"] = []
    if not same_prefix(payload.get("prefix"), network) or not isinstance(results, list):
        rpki["reason"] = "RPKI prefix or origin results are missing or do not match"
        return bgp, rpki
    checked = set()
    states = []
    for result in results:
        if not isinstance(result, dict):
            continue
        asn = result.get("asn")
        item = result.get("data") if isinstance(result.get("data"), dict) else {}
        if type(asn) is not int or asn in checked or asn not in origin_ids:
            continue
        if not same_prefix(item.get("prefix"), network) or str(
            item.get("resource", "")
        ).removeprefix("AS") != str(asn):
            continue
        state = item.get("status")
        if state not in ("valid", "invalid_asn", "invalid_length", "unknown"):
            continue
        checked.add(asn)
        states.append(state)
        rpki["origins"].append(
            {
                "asn": asn,
                "status": "not_found" if state == "unknown" else state,
                "source_url": result.get("source_url"),
            }
        )
    complete = (
        checked == origin_ids
        and len(results) == len(origin_ids)
        and data.get("num_filtered_out") == 0
    )
    rpki["missing_origins"] = sorted(origin_ids - checked)
    rpki["coverage"] = (
        "All exact-prefix origin ASNs observed by RIS; not ownership or reputation"
    )
    bgp_expiry = timestamp(bgp.get("expires_at"))
    rpki_expiry = timestamp(rpki.get("expires_at"))
    if bgp_expiry is not None and rpki_expiry is not None:
        rpki["expires_at"] = stamp(min(bgp_expiry, rpki_expiry))
    if bgp["freshness"] != "fresh":
        rpki["freshness"] = "stale" if payload else "unknown"
    if any(s.startswith("invalid_") for s in states):
        rpki.update(
            status="invalid", reason="An observed prefix/origin pair is invalid"
        )
    elif not complete:
        rpki.update(
            status="partial",
            reason="Not all observed origins were validated, or RIS filtered low-visibility routes",
        )
    elif all(s == "valid" for s in states):
        rpki.update(
            status="valid",
            reason="Every observed exact-prefix origin validated against a ROA",
        )
    elif all(s == "unknown" for s in states):
        rpki.update(status="not_found", reason="No ROA found for any observed origin")
    else:
        rpki.update(status="mixed", reason="Some observed origins have no ROA")
    return bgp, rpki


def parse_drop(body):
    records = [
        json.loads(line) for line in body.decode("utf-8").splitlines() if line.strip()
    ]
    if (
        not records
        or not all(isinstance(r, dict) for r in records)
        or records[-1].get("type") != "metadata"
    ):
        raise ValueError("DROP metadata trailer missing")
    metadata = records[-1]
    if type(metadata.get("timestamp")) not in (int, float) or not isinstance(
        metadata.get("copyright"), str
    ):
        raise TypeError("DROP timestamp or copyright missing")
    if not math.isfinite(metadata["timestamp"]) or metadata["timestamp"] < 0:
        raise ValueError("Invalid DROP timestamp")
    networks = []
    for row in records[:-1]:
        if not isinstance(row, dict) or not isinstance(row.get("sblid"), str):
            raise TypeError("Invalid DROP row")
        network = ipaddress.ip_network(row["cidr"], strict=True)
        if network.version != 4:
            raise ValueError("Unexpected address family in DROP IPv4 feed")
        networks.append((network, row["sblid"]))
    if not networks:
        raise ValueError("Empty DROP data")
    if type(metadata.get("records")) is not int or metadata["records"] != len(networks):
        raise ValueError("DROP record count does not match the metadata trailer")
    return networks, metadata


class DropFeed:
    def __init__(self, path, fetch=download):
        self.path, self.fetch, self.lock = Path(path), fetch, threading.Lock()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self.path) as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS drop_feed (id INTEGER PRIMARY KEY, payload BLOB, fetched REAL, next_attempt REAL NOT NULL, error TEXT)"
            )

    def check(self, network, now):
        with self.lock:
            with sqlite3.connect(self.path, timeout=5) as db:
                db.execute("BEGIN IMMEDIATE")
                row = db.execute(
                    "SELECT payload,fetched,next_attempt,error FROM drop_feed WHERE id=1"
                ).fetchone()
                due = not row or now >= row[2]
                if due:
                    db.execute(
                        "INSERT INTO drop_feed(id,next_attempt) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET next_attempt=excluded.next_attempt",
                        (now + DAY,),
                    )
            if due:
                try:
                    body = self.fetch(DROP, 4 * 1024 * 1024)
                    self.path.with_suffix(".download.jsonl").write_bytes(body)
                    _, metadata = parse_drop(body)
                    if metadata["timestamp"] > now + 300:
                        raise ValueError("DROP source timestamp is in the future")
                    with sqlite3.connect(self.path) as db:
                        db.execute(
                            "UPDATE drop_feed SET payload=?,fetched=?,error=NULL WHERE id=1",
                            (body, now),
                        )
                except (ValueError, KeyError, TypeError, OSError) as error:
                    with sqlite3.connect(self.path) as db:
                        db.execute(
                            "UPDATE drop_feed SET error=? WHERE id=1",
                            (
                                "Complete source refresh failed: "
                                + type(error).__name__,
                            ),
                        )
            with sqlite3.connect(self.path) as db:
                body, fetched, next_attempt, error = db.execute(
                    "SELECT payload,fetched,next_attempt,error FROM drop_feed WHERE id=1"
                ).fetchone()
        result = {
            "status": "unavailable",
            "freshness": "unknown",
            "observed_at": stamp(fetched) if fetched else None,
            "expires_at": None,
            "source": "The Spamhaus Project · DROP IPv4",
            "source_url": DROP,
            "policy_url": DROP_POLICY,
            "next_refresh_at": stamp(next_attempt),
            "coverage": "Any overlapping IPv4 address in DROP only. Not SBL/XBL/PBL or every blocklist.",
            "reason": error or "No complete cached DROP dataset",
            "matches": [],
        }
        if not body:
            return result
        try:
            networks, metadata = parse_drop(body)
        except (ValueError, KeyError, TypeError):
            return result
        expiry = min(fetched + DAY, metadata["timestamp"] + 93600)
        matches = [
            {"prefix": str(prefix), "reference": reference}
            for prefix, reference in networks
            if prefix.overlaps(network)
        ]
        result.update(
            status="listed" if matches else "not_listed",
            freshness="fresh"
            if fetched <= now + 60 and now < expiry and not error
            else "stale",
            expires_at=stamp(expiry),
            source_updated_at=stamp(metadata["timestamp"]),
            copyright=metadata["copyright"],
            matches=matches,
            reason=error
            or (
                "An overlapping range is listed in DROP"
                if matches
                else "No overlap in the complete checked DROP dataset"
            ),
        )
        return result


class CheckBusy(Exception):
    def __init__(self, seconds=60):
        self.seconds = seconds


class Checks:
    def __init__(self, cache_path, fetch=download, clock=time.time):
        self.fetch, self.clock = fetch, clock
        self.drop = DropFeed(cache_path, fetch)
        self.lock = threading.Lock()
        self.active = threading.BoundedSemaphore(2)
        self.cache, self.attempts = OrderedDict(), deque()

    def inspect(self, resource):
        network = public_prefix(resource)
        if not self.active.acquire(blocking=False):
            raise CheckBusy(2)
        try:
            with self.lock:
                now = self.clock()
                key = str(network)
                cached = self.cache.get(key)
                valid_until = min(
                    (
                        timestamp(m.get("expires_at")) or 0
                        for m in (cached or {}).get("metrics", [])
                    ),
                    default=0,
                )
                if cached is not None and valid_until > now:
                    report = cached
                    self.cache.move_to_end(key)
                else:
                    while self.attempts and now - self.attempts[0] >= 60:
                        self.attempts.popleft()
                    if len(self.attempts) >= 30:
                        raise CheckBusy(max(1, int(61 - (now - self.attempts[0]))))
                    self.attempts.append(now)
                    try:
                        report = json.loads(
                            self.fetch(
                                API
                                + "?"
                                + urlencode(
                                    {"resource": key, "checks": "prefix_overview,rpki"}
                                ),
                                2 * 1024 * 1024,
                            )
                        )
                        if (
                            not isinstance(report, dict)
                            or not isinstance(report.get("metrics"), list)
                            or not all(
                                isinstance(m, dict) for m in report.get("metrics", [])
                            )
                        ):
                            raise TypeError("Invalid report")
                    except HTTPError as error:
                        error.close()
                        if error.code in {429, 503}:
                            try:
                                seconds = int(
                                    (error.headers or {}).get("Retry-After", "60")
                                )
                            except (TypeError, ValueError):
                                seconds = 60
                            raise CheckBusy(max(1, min(DAY, seconds))) from error
                        report = cached or {"resource": {"value": key}, "metrics": []}
                    except (ValueError, OSError, TypeError):
                        report = cached or {"resource": {"value": key}, "metrics": []}
                    if report.get("metrics"):
                        self.cache[key] = report
                        self.cache.move_to_end(key)
                        while len(self.cache) > 2000:
                            self.cache.popitem(last=False)
                bgp, rpki = network_checks(report, network, now)
                if any(
                    m.get("status") == "rate_limited" for m in report.get("metrics", [])
                ):
                    retry = 60
                else:
                    retry = None
            blocklist = self.drop.check(network, self.clock())
            result = {
                "resource": key,
                "bgp": bgp,
                "rpki": rpki,
                "blocklist": blocklist,
                "semantics": "source_scoped_observations_not_safety_or_reputation",
            }
            if retry:
                result["retry_after"] = retry
            return result
        finally:
            self.active.release()
