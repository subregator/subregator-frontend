import ipaddress
import json
import tempfile
import unittest
from pathlib import Path
from urllib.error import HTTPError

from verification import (
    CheckBusy,
    Checks,
    DropFeed,
    network_checks,
    parse_drop,
    public_prefix,
    stamp,
)

NOW = 1800000000
PREFIX = ipaddress.ip_network("1.1.1.0/24")


def report(asns=(13335,), states=("valid",), **changes):
    metric = {
        "status": "ok",
        "observed_at": stamp(NOW - 10),
        "expires_at": stamp(NOW + 300),
        "source_url": "https://stat.ripe.net/",
    }
    overview = {
        **metric,
        "name": "prefix_overview",
        "data": {
            "resource": str(PREFIX),
            "announced": True,
            "is_less_specific": False,
            "asns": [{"asn": a} for a in asns],
            "num_filtered_out": 0,
            "query_time": stamp(NOW - 3600),
        },
    }
    validation = {
        **metric,
        "name": "rpki",
        "data": {
            "prefix": str(PREFIX),
            "origin_limit": 4,
            "origins": [
                {
                    "asn": asn,
                    "data": {
                        "resource": str(asn),
                        "prefix": str(PREFIX),
                        "status": state,
                    },
                }
                for asn, state in zip(asns, states)
            ],
        },
    }
    return {
        "resource": {"value": str(PREFIX)},
        "metrics": [overview, validation],
        **changes,
    }


def drop_body(prefix="8.8.8.0/24", timestamp=NOW):
    return (
        json.dumps({"cidr": prefix, "sblid": "SBL123"})
        + "\n"
        + json.dumps(
            {
                "type": "metadata",
                "timestamp": timestamp,
                "records": 1,
                "copyright": "The Spamhaus Project",
            }
        )
        + "\n"
    ).encode()


class NetworkEvidenceTests(unittest.TestCase):
    def check(self, data):
        return network_checks(data, PREFIX, NOW)

    def test_fresh_exact_observation_and_all_origins_valid(self):
        bgp, rpki = self.check(report((13335, 64501), ("valid", "valid")))
        self.assertEqual((bgp["status"], bgp["freshness"]), ("announced", "fresh"))
        self.assertEqual((rpki["status"], rpki["freshness"]), ("valid", "fresh"))
        self.assertEqual(len(rpki["origins"]), 2)
        self.assertIn("query_time", bgp)

    def test_covering_route_is_never_exact_announcement_or_rpki_valid(self):
        data = report()
        data["metrics"][0]["data"].update(resource="1.1.0.0/16", is_less_specific=True)
        bgp, rpki = self.check(data)
        self.assertEqual(bgp["status"], "covering_route")
        self.assertNotEqual(rpki["status"], "valid")

    def test_origin_limit_low_visibility_and_missing_origins_are_partial(self):
        for mutation in ["missing", "duplicate", "low_visibility", "over_limit"]:
            with self.subTest(mutation=mutation):
                data = report((13335, 64501), ("valid", "valid"))
                if mutation == "missing":
                    data["metrics"][1]["data"]["origins"].pop()
                elif mutation == "duplicate":
                    data["metrics"][1]["data"]["origins"][1] = data["metrics"][1][
                        "data"
                    ]["origins"][0]
                elif mutation == "low_visibility":
                    data["metrics"][0]["data"]["num_filtered_out"] = 1
                else:
                    data = report((1, 2, 3, 4, 5), ("valid",) * 4)
                self.assertEqual(self.check(data)[1]["status"], "partial")

    def test_no_roa_invalid_and_mixed_have_distinct_meanings(self):
        for states, expected in [
            (("unknown",), "not_found"),
            (("invalid_asn",), "invalid"),
            (("invalid_length",), "invalid"),
            (("valid", "unknown"), "mixed"),
        ]:
            asns = (13335, 64501)[: len(states)]
            self.assertEqual(self.check(report(asns, states))[1]["status"], expected)

    def test_exact_unannounced_prefix_has_no_origin_validation(self):
        data = report()
        data["metrics"][0]["data"].update(announced=False, asns=[])
        bgp, rpki = self.check(data)
        self.assertEqual(bgp["status"], "not_announced")
        self.assertEqual(rpki["status"], "not_applicable")

    def test_stale_or_failed_source_never_has_fresh_positive_evidence(self):
        for status, expires in [
            ("stale", NOW + 300),
            ("ok", NOW - 1),
            ("unavailable", NOW + 300),
        ]:
            data = report()
            data["metrics"][0].update(status=status, expires_at=stamp(expires))
            bgp, rpki = self.check(data)
            self.assertNotEqual(bgp["freshness"], "fresh")
            self.assertNotEqual(rpki["freshness"], "fresh")

    def test_origin_resource_prefix_mismatch_and_malformed_payloads_do_not_pass(self):
        for mutation in [
            "asn",
            "prefix",
            "overview_array",
            "validation_array",
            "report_resource",
        ]:
            data = report()
            if mutation == "asn":
                data["metrics"][1]["data"]["origins"][0]["data"]["resource"] = "999"
            if mutation == "prefix":
                data["metrics"][1]["data"]["prefix"] = "1.1.0.0/16"
            if mutation == "overview_array":
                data["metrics"][0]["data"] = []
            if mutation == "validation_array":
                data["metrics"][1]["data"] = []
            if mutation == "report_resource":
                data["resource"] = []
            self.assertNotEqual(self.check(data)[1]["status"], "valid")

    def test_private_invalid_and_ipv6_targets_are_rejected(self):
        for value in [
            "10.0.0.0/24",
            "127.0.0.0/8",
            "224.0.0.0/4",
            "2001:db8::/32",
            "224.0.0.0/4",
            "invalid",
        ]:
            with self.assertRaises(ValueError):
                public_prefix(value)


class DropEvidenceTests(unittest.TestCase):
    def test_complete_feed_metadata_and_every_row_are_required(self):
        for body in [
            b"",
            b"[]",
            b'{"cidr":"8.8.8.0/24"}',
            drop_body() + b'{"cidr":"invalid"}',
            drop_body().replace(b"8.8.8.0/24", b"invalid"),
        ]:
            with self.assertRaises((ValueError, KeyError)):
                parse_drop(body)

    def test_same_prefix_can_have_multiple_real_sbl_references(self):
        body = (
            json.dumps({"cidr": "1.1.1.0/24", "sblid": "SBL1"})
            + "\n"
            + json.dumps({"cidr": "1.1.1.0/24", "sblid": "SBL2"})
            + "\n"
            + json.dumps(
                {
                    "type": "metadata",
                    "timestamp": NOW,
                    "records": 2,
                    "copyright": "The Spamhaus Project",
                }
            )
        ).encode()
        networks, _ = parse_drop(body)
        self.assertEqual(len(networks), 2)
        self.assertEqual({ref for _, ref in networks}, {"SBL1", "SBL2"})

    def test_overlap_in_either_direction_or_a_single_address_is_listed(self):
        for feed_prefix, query in [
            ("1.1.0.0/16", "1.1.1.0/24"),
            ("1.1.1.0/25", "1.1.1.0/24"),
            ("1.1.1.2/32", "1.1.1.0/24"),
        ]:
            with tempfile.TemporaryDirectory() as directory:
                feed = DropFeed(
                    Path(directory) / "cache.sqlite",
                    lambda *_, feed_prefix=feed_prefix: drop_body(feed_prefix),
                )
                result = feed.check(ipaddress.ip_network(query), NOW)
                self.assertEqual(result["status"], "listed")
                self.assertEqual(result["freshness"], "fresh")
                self.assertTrue(result["matches"])

    def test_no_overlap_is_only_a_named_feed_negative_with_attribution(self):
        with tempfile.TemporaryDirectory() as directory:
            feed = DropFeed(Path(directory) / "cache.sqlite", lambda *_: drop_body())
            result = feed.check(PREFIX, NOW)
            self.assertEqual(result["status"], "not_listed")
            self.assertEqual(
                result["source_url"], "https://www.spamhaus.org/drop/drop_v4.json"
            )
            self.assertIn("The Spamhaus Project", result["copyright"])
            self.assertIn("Not SBL/XBL/PBL", result["coverage"])

    def test_download_interval_survives_restarts_and_failure_never_clears_a_feed(self):
        with tempfile.TemporaryDirectory() as directory:
            path, calls = Path(directory) / "cache.sqlite", []

            def fetch(*_):
                calls.append(True)
                if len(calls) > 1:
                    raise OSError("source unavailable")
                return drop_body()

            self.assertEqual(
                DropFeed(path, fetch).check(PREFIX, NOW)["freshness"], "fresh"
            )
            self.assertEqual(
                DropFeed(path, fetch).check(PREFIX, NOW + 3600)["freshness"], "fresh"
            )
            self.assertEqual(len(calls), 1)
            expired = DropFeed(path, fetch).check(PREFIX, NOW + 86401)
            self.assertEqual(expired["freshness"], "stale")
            self.assertIn("failed", expired["reason"])
            DropFeed(path, fetch).check(PREFIX, NOW + 86410)
            self.assertEqual(len(calls), 2)

    def test_old_source_metadata_and_failed_initial_fetch_are_not_fresh_negatives(self):
        with tempfile.TemporaryDirectory() as directory:
            result = DropFeed(
                Path(directory) / "old.sqlite",
                lambda *_: drop_body(timestamp=NOW - 86400 * 3),
            ).check(PREFIX, NOW)
            self.assertEqual(result["freshness"], "stale")
            result = DropFeed(
                Path(directory) / "bad.sqlite", lambda *_: b"invalid"
            ).check(PREFIX, NOW)
            self.assertEqual(result["status"], "unavailable")
            self.assertEqual(result["freshness"], "unknown")

    def test_network_results_are_cached_and_service_budget_is_bounded(self):
        with tempfile.TemporaryDirectory() as directory:
            calls = []

            def fetch(url, _):
                calls.append(url)
                return (
                    drop_body()
                    if "spamhaus.org" in url
                    else json.dumps(report()).encode()
                )

            service = Checks(Path(directory) / "cache.sqlite", fetch, lambda: NOW)
            self.assertEqual(service.inspect(str(PREFIX))["rpki"]["status"], "valid")
            service.inspect(str(PREFIX))
            self.assertEqual(len(calls), 2)
            service.attempts.extend([NOW] * 30)
            with self.assertRaises(CheckBusy):
                service.inspect("8.8.8.0/24")

    def test_upstream_http_limits_pause_the_batch(self):
        for status, header, expected in [
            (429, "120", 120),
            (503, "2", 2),
            (429, "bad", 60),
        ]:
            with (
                self.subTest(status=status, header=header),
                tempfile.TemporaryDirectory() as directory,
            ):
                calls = []

                def fetch(url, _, calls=calls, status=status, header=header):
                    calls.append(url)
                    raise HTTPError(url, status, "busy", {"Retry-After": header}, None)

                service = Checks(Path(directory) / "cache.sqlite", fetch, lambda: NOW)
                with self.assertRaises(CheckBusy) as raised:
                    service.inspect(str(PREFIX))
                self.assertEqual(raised.exception.seconds, expected)
                self.assertEqual(len(calls), 1)


if __name__ == "__main__":
    unittest.main()
