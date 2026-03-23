#!/usr/bin/env python3
"""
Broker URL Audit Script - March 2026
Tests opt_out_url and domain URLs for HTTP status, redirects, and dead links.
"""

import yaml
import subprocess
import random
import json
import sys
import re
from datetime import datetime

YAML_PATH = "/workspace/Projects/broker-bane/data/brokers.yaml"
TIMEOUT = 5
CURL_TIMEOUT = 5
MAX_REDIRECTS = 10

def load_brokers():
    with open(YAML_PATH) as f:
        data = yaml.safe_load(f)
    return data["brokers"]

def curl_url(url, follow=True):
    """Curl a URL and return (final_status, final_url, redirect_chain, error)"""
    try:
        cmd = [
            "curl",
            "-s",
            "-o", "/dev/null",
            "-w", "%{http_code}|%{url_effective}|%{redirect_url}|%{num_redirects}",
            "--max-time", str(CURL_TIMEOUT),
            "--connect-timeout", "4",
            "-L",  # follow redirects
            "--max-redirs", str(MAX_REDIRECTS),
            "-A", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
            "--ssl-no-revoke",
            url
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=CURL_TIMEOUT + 2)
        out = result.stdout.strip()
        parts = out.split("|")
        if len(parts) >= 4:
            status = int(parts[0]) if parts[0].isdigit() else 0
            final_url = parts[1] if parts[1] else url
            num_redirects = int(parts[3]) if parts[3].isdigit() else 0
            return status, final_url, num_redirects, None
        return 0, url, 0, f"Unexpected output: {out}"
    except subprocess.TimeoutExpired:
        return 0, url, 0, "TIMEOUT"
    except Exception as e:
        return 0, url, 0, str(e)

def classify_status(status, url, final_url, num_redirects, error):
    """Classify a URL result into: alive, redirected, dead, timeout, error"""
    if error == "TIMEOUT":
        return "timeout"
    if error and status == 0:
        return "error"
    if status == 0:
        return "dead"
    if status in (200, 201, 202, 204):
        if num_redirects > 0:
            return "redirected_ok"  # redirected but alive
        return "alive"
    if status in (301, 302, 303, 307, 308):
        return "redirect_loop"
    if status in (400, 401, 403, 405, 406):
        return "alive_restricted"  # alive but blocking bots
    if status in (404, 410):
        return "dead"
    if status in (429, 503, 502, 504):
        return "alive_server_issue"
    if status >= 500:
        return "server_error"
    return "unknown"

def check_http_vs_https(url):
    """Detect if URL uses http:// instead of https://"""
    return url.startswith("http://")

def check_www_pattern(url, domain):
    """Check if URL has www mismatch"""
    has_www_in_url = "//www." in url
    domain_has_www = domain.startswith("www.")
    return has_www_in_url, domain_has_www

def domain_from_url(url):
    """Extract domain from URL"""
    m = re.match(r'https?://([^/]+)', url)
    return m.group(1) if m else ""

def test_broker(broker):
    """Test a broker's opt_out_url, falling back to domain."""
    bid = broker.get("id", "unknown")
    name = broker.get("name", bid)
    domain = broker.get("domain", "")
    opt_out_url = broker.get("opt_out_url", "")
    tier = broker.get("tier", None)
    removal_method = broker.get("removal_method", "")

    # Pick URL to test
    test_url = opt_out_url if opt_out_url else (f"https://{domain}" if domain else "")
    url_type = "opt_out_url" if opt_out_url else "domain"

    if not test_url:
        return {
            "id": bid, "name": name, "domain": domain, "tier": tier,
            "removal_method": removal_method,
            "test_url": None, "url_type": "none",
            "status": 0, "final_url": None, "num_redirects": 0,
            "classification": "no_url", "error": "No URL available",
            "opt_out_url": opt_out_url,
            "issues": ["no_url"]
        }

    print(f"  Testing [{bid}] {test_url[:80]}...", flush=True)
    status, final_url, num_redirects, error = curl_url(test_url)
    classification = classify_status(status, test_url, final_url, num_redirects, error)

    issues = []
    if check_http_vs_https(test_url):
        issues.append("http_not_https")
    if status == 0 and error == "TIMEOUT":
        issues.append("timeout")
    if status in (404, 410) or (status == 0 and error != "TIMEOUT"):
        issues.append("dead_link")
    if num_redirects > 0:
        # Check if redirected to a completely different domain
        orig_domain = domain_from_url(test_url)
        final_domain = domain_from_url(final_url)
        if orig_domain and final_domain and orig_domain != final_domain:
            issues.append("redirect_domain_change")
        elif num_redirects > 0:
            issues.append("redirect")
    if status >= 500:
        issues.append("server_error")

    return {
        "id": bid, "name": name, "domain": domain, "tier": tier,
        "removal_method": removal_method,
        "test_url": test_url, "url_type": url_type,
        "status": status, "final_url": final_url, "num_redirects": num_redirects,
        "classification": classification, "error": error,
        "opt_out_url": opt_out_url,
        "issues": issues
    }

def run_audit():
    brokers = load_brokers()
    print(f"Loaded {len(brokers)} brokers from YAML", flush=True)

    # Separate tier 1 from others
    tier1 = [b for b in brokers if b.get("tier") == 1]
    others = [b for b in brokers if b.get("tier") != 1]

    print(f"Tier 1 brokers: {len(tier1)}", flush=True)
    print(f"Other brokers: {len(others)}", flush=True)

    # Test all tier1 brokers first, then random sample to reach 50
    random.seed(42)  # reproducible
    remaining_needed = max(0, 50 - len(tier1))
    sampled_others = random.sample(others, min(remaining_needed, len(others)))

    to_test = tier1 + sampled_others
    print(f"\nTesting {len(to_test)} brokers ({len(tier1)} Tier 1 + {len(sampled_others)} random)...\n", flush=True)

    results = []
    for i, broker in enumerate(to_test, 1):
        print(f"[{i}/{len(to_test)}]", end=" ", flush=True)
        result = test_broker(broker)
        results.append(result)

    return results, tier1, brokers

def analyze_patterns(results, all_brokers):
    """Analyze common patterns across all brokers (not just tested ones)."""
    patterns = {
        "http_opt_out_urls": [],
        "http_domains": [],
        "no_opt_out_url": [],
        "email_only": [],
        "duplicate_domains": {},
    }

    # Full scan of all brokers for pattern analysis
    domain_count = {}
    for b in all_brokers:
        d = b.get("domain", "")
        if d:
            domain_count[d] = domain_count.get(d, []) + [b["id"]]

        opt = b.get("opt_out_url", "")
        if opt and opt.startswith("http://"):
            patterns["http_opt_out_urls"].append({"id": b["id"], "url": opt})
        if d and not opt:
            patterns["no_opt_out_url"].append({"id": b["id"], "domain": d, "method": b.get("removal_method","")})
        if b.get("removal_method") == "email" and not opt:
            patterns["email_only"].append(b["id"])

    # Find duplicate domains
    for domain, ids in domain_count.items():
        if len(ids) > 1:
            patterns["duplicate_domains"][domain] = ids

    return patterns

def generate_report(results, patterns, tier1, all_brokers):
    """Generate the markdown audit report."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M UTC")

    # Stats
    total_tested = len(results)
    alive = [r for r in results if r["classification"] in ("alive", "redirected_ok", "alive_restricted")]
    redirected = [r for r in results if r["classification"] == "redirected_ok" or "redirect" in r["issues"]]
    dead = [r for r in results if r["classification"] in ("dead",) or "dead_link" in r["issues"]]
    timeout = [r for r in results if r["classification"] == "timeout"]
    server_err = [r for r in results if r["classification"] in ("server_error", "alive_server_issue")]
    restricted = [r for r in results if r["classification"] == "alive_restricted"]
    no_url = [r for r in results if r["classification"] == "no_url"]
    problematic = [r for r in results if r["issues"]]

    tier1_results = [r for r in results if r["tier"] == 1]
    tier1_dead = [r for r in tier1_results if "dead_link" in r["issues"]]

    lines = []
    lines.append(f"# Broker Database URL Audit — March 2026\n")
    lines.append(f"**Generated:** {now}  ")
    lines.append(f"**Database version:** 1.1.0 (updated 2026-03-05)  ")
    lines.append(f"**Total brokers in database:** {len(all_brokers)}  ")
    lines.append(f"**Tier 1 brokers:** {len(tier1)}  ")
    lines.append(f"\n---\n")

    lines.append("## Executive Summary\n")
    lines.append(f"This audit tested **{total_tested} brokers** ({len(tier1)} Tier 1 + {total_tested - len(tier1)} random sample) "
                 f"using `curl` with a {CURL_TIMEOUT}s timeout. URLs tested were `opt_out_url` when available, "
                 f"falling back to the broker's `domain`.\n")

    lines.append("### Summary Statistics\n")
    lines.append("| Metric | Count | % of Tested |")
    lines.append("|--------|-------|-------------|")
    lines.append(f"| **Total Tested** | {total_tested} | 100% |")
    lines.append(f"| ✅ Alive (200 OK, no redirect issues) | {len([r for r in results if r['classification']=='alive'])} | {len([r for r in results if r['classification']=='alive'])/total_tested*100:.1f}% |")
    lines.append(f"| ↩️ Alive via Redirect | {len([r for r in results if r['classification']=='redirected_ok'])} | {len([r for r in results if r['classification']=='redirected_ok'])/total_tested*100:.1f}% |")
    lines.append(f"| 🔒 Alive (Bot-Restricted 4xx) | {len(restricted)} | {len(restricted)/total_tested*100:.1f}% |")
    lines.append(f"| ❌ Dead (404/410/Connection Failed) | {len(dead)} | {len(dead)/total_tested*100:.1f}% |")
    lines.append(f"| ⏱️ Timeout | {len(timeout)} | {len(timeout)/total_tested*100:.1f}% |")
    lines.append(f"| ⚠️ Server Error (5xx) | {len(server_err)} | {len(server_err)/total_tested*100:.1f}% |")
    lines.append(f"| 🚫 No URL Available | {len(no_url)} | {len(no_url)/total_tested*100:.1f}% |")
    lines.append(f"| 🔗 Cross-Domain Redirects | {len([r for r in results if 'redirect_domain_change' in r['issues']])} | {len([r for r in results if 'redirect_domain_change' in r['issues']])/total_tested*100:.1f}% |")
    lines.append("")

    lines.append("### Tier 1 Broker Health\n")
    lines.append(f"- **Tier 1 brokers tested:** {len(tier1_results)}")
    lines.append(f"- **Tier 1 brokers with issues:** {len([r for r in tier1_results if r['issues']])}")
    lines.append(f"- **Tier 1 dead/unreachable:** {len(tier1_dead)}")
    lines.append("")

    lines.append("---\n")
    lines.append("## Tested Brokers — Full Results\n")
    lines.append("| ID | Name | Tier | URL Tested | Status | Classification | Issues |")
    lines.append("|----|------|------|------------|--------|----------------|--------|")
    for r in sorted(results, key=lambda x: (x["tier"] or 99, x["id"])):
        tier_str = str(r["tier"]) if r["tier"] else "—"
        status_str = str(r["status"]) if r["status"] else "—"
        url_display = (r["test_url"] or "none")[:60] + ("…" if r["test_url"] and len(r["test_url"]) > 60 else "")
        issues_str = ", ".join(r["issues"]) if r["issues"] else "none"
        cls = r["classification"]
        icon = {"alive": "✅", "redirected_ok": "↩️", "alive_restricted": "🔒",
                "dead": "❌", "timeout": "⏱️", "server_error": "⚠️",
                "alive_server_issue": "⚠️", "no_url": "🚫", "redirect_loop": "🔄",
                "error": "❌", "unknown": "❓"}.get(cls, "")
        lines.append(f"| `{r['id']}` | {r['name']} | {tier_str} | `{url_display}` | {status_str} | {icon} {cls} | {issues_str} |")
    lines.append("")

    lines.append("---\n")
    lines.append("## Problematic Brokers — Detail\n")

    if dead:
        lines.append("### ❌ Dead / Unreachable URLs\n")
        lines.append("These brokers returned 404, 410, connection refused, or zero-status errors:\n")
        for r in dead:
            lines.append(f"#### `{r['id']}` — {r['name']} (Tier {r['tier'] or 'N/A'})")
            lines.append(f"- **URL tested:** `{r['test_url']}`")
            lines.append(f"- **HTTP Status:** {r['status']}")
            lines.append(f"- **Error:** {r['error'] or 'None'}")
            lines.append(f"- **Removal method:** {r['removal_method']}")
            lines.append("")

    if timeout:
        lines.append("### ⏱️ Timeouts\n")
        lines.append(f"These brokers did not respond within {CURL_TIMEOUT}s:\n")
        for r in timeout:
            lines.append(f"- `{r['id']}` ({r['name']}, Tier {r['tier'] or 'N/A'}) — `{r['test_url']}`")
        lines.append("")

    cross_domain_redirects = [r for r in results if "redirect_domain_change" in r["issues"]]
    if cross_domain_redirects:
        lines.append("### 🔀 Cross-Domain Redirects\n")
        lines.append("These brokers redirect to a completely different domain — the opt-out URL or domain entry may be outdated:\n")
        for r in cross_domain_redirects:
            lines.append(f"#### `{r['id']}` — {r['name']} (Tier {r['tier'] or 'N/A'})")
            lines.append(f"- **Original URL:** `{r['test_url']}`")
            lines.append(f"- **Redirects to:** `{r['final_url']}`")
            lines.append(f"- **Redirect count:** {r['num_redirects']}")
            lines.append("")

    if server_err:
        lines.append("### ⚠️ Server Errors (5xx)\n")
        for r in server_err:
            lines.append(f"- `{r['id']}` ({r['name']}, Tier {r['tier'] or 'N/A'}) — Status {r['status']} at `{r['test_url']}`")
        lines.append("")

    lines.append("---\n")
    lines.append("## Pattern Analysis — Full Database (1,169 Brokers)\n")

    lines.append("### 🔓 HTTP vs HTTPS\n")
    http_urls = patterns["http_opt_out_urls"]
    lines.append(f"**{len(http_urls)} brokers** have `opt_out_url` using plain `http://` (not HTTPS):\n")
    if http_urls:
        for item in http_urls[:30]:
            lines.append(f"- `{item['id']}`: `{item['url']}`")
        if len(http_urls) > 30:
            lines.append(f"- *(…and {len(http_urls)-30} more)*")
    else:
        lines.append("*None found — all opt_out_urls use HTTPS. ✅*")
    lines.append("")

    lines.append("### 📭 Missing opt_out_url\n")
    no_optout = patterns["no_opt_out_url"]
    lines.append(f"**{len(no_optout)} brokers** have no `opt_out_url` field at all. Breakdown by removal method:\n")
    method_counts = {}
    for item in no_optout:
        m = item["method"] or "unknown"
        method_counts[m] = method_counts.get(m, 0) + 1
    for method, count in sorted(method_counts.items(), key=lambda x: -x[1]):
        lines.append(f"- `{method}`: {count} brokers")
    lines.append("")
    lines.append("Top brokers missing opt_out_url (first 20):\n")
    for item in no_optout[:20]:
        lines.append(f"- `{item['id']}` (method: `{item['method']}`, domain: `{item['domain']}`)")
    if len(no_optout) > 20:
        lines.append(f"- *(…and {len(no_optout)-20} more)*")
    lines.append("")

    lines.append("### 🔁 Duplicate Domains\n")
    dups = patterns["duplicate_domains"]
    lines.append(f"**{len(dups)} domains** appear under multiple broker IDs (possible parent-company relationships or duplicates):\n")
    for domain, ids in sorted(dups.items(), key=lambda x: -len(x[1])):
        lines.append(f"- `{domain}`: {', '.join(f'`{i}`' for i in ids)}")
    lines.append("")

    # Redirect analysis from tested results
    all_redirects = [r for r in results if r["num_redirects"] > 0]
    lines.append("### ↩️ Redirect Patterns (from sample)\n")
    lines.append(f"{len(all_redirects)} of {total_tested} tested URLs involved at least one redirect:\n")
    for r in all_redirects:
        if r["final_url"] and r["final_url"] != r["test_url"]:
            lines.append(f"- `{r['id']}`: `{r['test_url']}` → `{r['final_url'][:80]}`")
    lines.append("")

    lines.append("---\n")
    lines.append("## Recommendations\n")

    rec_num = 1

    lines.append(f"### {rec_num}. Mark Dead Brokers as Inactive\n")
    rec_num += 1
    if dead:
        lines.append("The following broker entries returned hard 404/410 errors or refused all connections. "
                     "Recommend adding `active: false` or `status: inactive` to their YAML entries:\n")
        for r in dead:
            lines.append(f"- **`{r['id']}`** ({r['name']}) — Status {r['status']}, URL: `{r['test_url']}`")
    else:
        lines.append("*No definitively dead brokers found in the tested sample.*")
    lines.append("")

    lines.append(f"### {rec_num}. Investigate Timeout Brokers\n")
    rec_num += 1
    if timeout:
        lines.append("These brokers timed out and may be dead, heavily throttled, or geo-blocked. "
                     "Recommend manual verification and potential marking as `difficulty: hard`:\n")
        for r in timeout:
            lines.append(f"- **`{r['id']}`** ({r['name']}) — `{r['test_url']}`")
    else:
        lines.append("*No timeouts in the tested sample.*")
    lines.append("")

    lines.append(f"### {rec_num}. Update Cross-Domain Redirects\n")
    rec_num += 1
    if cross_domain_redirects:
        lines.append("These opt_out_url entries redirect to a different domain — update the YAML to use the final destination URL directly:\n")
        for r in cross_domain_redirects:
            lines.append(f"- **`{r['id']}`**: Update `opt_out_url` from `{r['test_url']}` → `{r['final_url']}`")
    else:
        lines.append("*No cross-domain redirects found in the tested sample.*")
    lines.append("")

    lines.append(f"### {rec_num}. Upgrade HTTP URLs to HTTPS\n")
    rec_num += 1
    if http_urls:
        lines.append(f"**{len(http_urls)} brokers** still have `http://` opt_out_urls. "
                     "Most modern sites redirect HTTP→HTTPS, but the YAML should use the canonical HTTPS URL:\n")
        for item in http_urls[:15]:
            https_ver = item['url'].replace("http://", "https://", 1)
            lines.append(f"- **`{item['id']}`**: `{item['url']}` → `{https_ver}`")
        if len(http_urls) > 15:
            lines.append(f"- *(…and {len(http_urls)-15} more)*")
    else:
        lines.append("*No HTTP-only opt_out_urls found — all use HTTPS. ✅*")
    lines.append("")

    lines.append(f"### {rec_num}. Add opt_out_url for Web-Form Brokers\n")
    rec_num += 1
    webform_no_url = [x for x in no_optout if x["method"] in ("web_form", "hybrid")]
    if webform_no_url:
        lines.append(f"**{len(webform_no_url)} brokers** use `web_form` or `hybrid` removal but have no `opt_out_url`. "
                     "These are the highest priority to fix since users need a direct link:\n")
        for item in webform_no_url[:20]:
            lines.append(f"- **`{item['id']}`** (method: `{item['method']}`, domain: `{item['domain']}`)")
        if len(webform_no_url) > 20:
            lines.append(f"- *(…and {len(webform_no_url)-20} more)*")
    else:
        lines.append("*All web_form brokers have opt_out_urls. ✅*")
    lines.append("")

    lines.append(f"### {rec_num}. Review Duplicate Domain Entries\n")
    rec_num += 1
    if dups:
        lines.append(f"**{len(dups)} domains** are listed under multiple broker IDs. "
                     "Verify these are intentional (e.g., regional subdomains vs. parent company entries) "
                     "or consolidate duplicates:\n")
        for domain, ids in sorted(dups.items(), key=lambda x: -len(x[1]))[:10]:
            lines.append(f"- `{domain}`: shared by {', '.join(f'`{i}`' for i in ids)}")
    lines.append("")

    lines.append(f"### {rec_num}. Add active: false Flag for Inactive Brokers\n")
    rec_num += 1
    lines.append("The YAML schema does not currently include an `active` boolean field. "
                 "Recommend adding this to the schema to allow graceful deprecation of dead brokers "
                 "without deleting historical data. Suggested schema addition:\n")
    lines.append("```yaml")
    lines.append("  - id: example-dead-broker")
    lines.append("    name: Example Dead Broker")
    lines.append("    active: false  # ← new field")
    lines.append("    status_note: \"Domain expired 2026-02\"")
    lines.append("    # … rest of fields")
    lines.append("```\n")

    lines.append("---\n")
    lines.append("## Appendix — Test Methodology\n")
    lines.append(f"- **Tool:** `curl` v{get_curl_version()}")
    lines.append(f"- **Timeout:** {CURL_TIMEOUT}s (`--max-time {CURL_TIMEOUT} --connect-timeout 4`)")
    lines.append(f"- **Redirects:** Followed automatically (`-L --max-redirs {MAX_REDIRECTS}`)")
    lines.append(f"- **User-Agent:** `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36`")
    lines.append(f"- **Sample seed:** 42 (reproducible random selection)")
    lines.append(f"- **Tier 1 brokers:** All {len(tier1)} tested")
    lines.append(f"- **Random sample:** 16 additional brokers (non-Tier-1) to reach 50 total")
    lines.append(f"- **Date run:** {now}")
    lines.append("")
    lines.append("> **Note:** Some URLs return 403/401 not because they're dead, but because they block")
    lines.append("> automated requests (bot detection). These are classified as `alive_restricted` and")
    lines.append("> should not be marked inactive without manual verification.")
    lines.append("")

    return "\n".join(lines)

def get_curl_version():
    try:
        r = subprocess.run(["curl", "--version"], capture_output=True, text=True)
        return r.stdout.split("\n")[0].split(" ")[1]
    except:
        return "unknown"

if __name__ == "__main__":
    print("=" * 60)
    print("BROKER URL AUDIT — March 2026")
    print("=" * 60)

    results, tier1, all_brokers = run_audit()
    patterns = analyze_patterns(results, all_brokers)

    print(f"\nGenerating report...")
    report = generate_report(results, patterns, tier1, all_brokers)

    out_path = "/workspace/Projects/broker-bane/docs/broker-audit-2026-03.md"
    with open(out_path, "w") as f:
        f.write(report)

    # Save raw results JSON for reference
    json_path = "/workspace/Projects/broker-bane/docs/broker-audit-2026-03.json"
    with open(json_path, "w") as f:
        json.dump({"results": results, "timestamp": datetime.now().isoformat()}, f, indent=2)

    print(f"\n✅ Report written to: {out_path}")
    print(f"✅ Raw data written to: {json_path}")

    # Quick summary to stdout
    dead = [r for r in results if "dead_link" in r["issues"]]
    timeout = [r for r in results if r["classification"] == "timeout"]
    print(f"\n--- QUICK SUMMARY ---")
    print(f"Tested: {len(results)}")
    print(f"Dead: {len(dead)}")
    print(f"Timeouts: {len(timeout)}")
    print(f"Issues found: {len([r for r in results if r['issues']])}")
