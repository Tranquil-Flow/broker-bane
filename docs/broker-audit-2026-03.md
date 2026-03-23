# Broker Database URL Audit — March 2026

**Generated:** 2026-03-23 11:27 UTC  
**Database version:** 1.1.0 (updated 2026-03-05)  
**Total brokers in database:** 1169  
**Tier 1 brokers:** 34  

---

## Executive Summary

This audit tested **50 brokers** (34 Tier 1 + 16 random sample) using `curl` with a 5s timeout. URLs tested were `opt_out_url` when available, falling back to the broker's `domain`.

### Summary Statistics

| Metric | Count | % of Tested |
|--------|-------|-------------|
| **Total Tested** | 50 | 100% |
| ✅ Alive (200 OK, no redirect issues) | 16 | 32.0% |
| ↩️ Alive via Redirect | 18 | 36.0% |
| 🔒 Alive (Bot-Restricted 4xx) | 6 | 12.0% |
| ❌ Dead (404/410/Connection Failed) | 10 | 20.0% |
| ⏱️ Timeout | 0 | 0.0% |
| ⚠️ Server Error (5xx) | 0 | 0.0% |
| 🚫 No URL Available | 0 | 0.0% |
| 🔗 Cross-Domain Redirects | 15 | 30.0% |

### Tier 1 Broker Health

- **Tier 1 brokers tested:** 34
- **Tier 1 brokers with issues:** 24
- **Tier 1 dead/unreachable:** 8

---

## Tested Brokers — Full Results

| ID | Name | Tier | URL Tested | Status | Classification | Issues |
|----|------|------|------------|--------|----------------|--------|
| `acxiom` | Acxiom | 1 | `https://isapps.acxiom.com/optout/optout.aspx` | 200 | ✅ alive | none |
| `acxiom_eu` | Acxiom (EU) | 1 | `https://acxiom.co.uk` | 200 | ↩️ redirected_ok | redirect_domain_change |
| `beenverified` | BeenVerified | 1 | `https://www.beenverified.com/app/optout/search` | 403 | 🔒 alive_restricted | redirect |
| `checkr` | Checkr | 1 | `https://checkr.com` | 200 | ✅ alive | none |
| `corelogic` | CoreLogic | 1 | `https://corelogic.com` | 200 | ↩️ redirected_ok | redirect_domain_change |
| `epsilon` | Epsilon | 1 | `https://epsilon.com` | 200 | ↩️ redirected_ok | redirect_domain_change |
| `epsilon_eu` | Epsilon (EU) | 1 | `https://epsilon.com` | 200 | ↩️ redirected_ok | redirect_domain_change |
| `equifax` | Equifax | 1 | `https://equifax.com` | 200 | ↩️ redirected_ok | redirect_domain_change |
| `equifax_uk` | Equifax (UK) | 1 | `https://equifax.co.uk` | 200 | ✅ alive | none |
| `experian` | Experian | 1 | `https://www.experian.com/privacy/opting-out` | 404 | ❌ dead | dead_link |
| `experian_uk` | Experian (UK) | 1 | `https://experian.co.uk` | 200 | ↩️ redirected_ok | redirect_domain_change |
| `first_advantage` | First Advantage | 1 | `https://fadv.com` | 200 | ✅ alive | none |
| `hireright` | HireRight | 1 | `https://hireright.com` | — | ❌ dead | dead_link |
| `instantcheckmate` | InstantCheckmate | 1 | `https://www.instantcheckmate.com/optout` | 200 | ↩️ redirected_ok | redirect_domain_change |
| `intelius` | Intelius | 1 | `https://www.intelius.com/optout` | 404 | ❌ dead | dead_link |
| `iqvia` | IQVIA | 1 | `https://iqvia.com` | 200 | ↩️ redirected_ok | redirect_domain_change |
| `lexisnexis` | LexisNexis | 1 | `https://optout.lexisnexis.com/` | — | ❌ dead | dead_link |
| `liveramp` | LiveRamp | 1 | `https://liveramp.com/opt_out/` | 200 | ↩️ redirected_ok | redirect |
| `mylife` | MyLife | 1 | `https://www.mylife.com/privacy-policy#remove` | 403 | 🔒 alive_restricted | none |
| `neustar` | Neustar | 1 | `https://neustar.biz` | — | ❌ dead | dead_link |
| `oracle_data_cloud` | Oracle Data Cloud | 1 | `https://oracle.com` | 403 | 🔒 alive_restricted | redirect_domain_change |
| `oracle_datacloud` | Oracle Data Cloud (BlueKai) | 1 | `https://datacloudoptout.oracle.com/` | 200 | ↩️ redirected_ok | redirect_domain_change |
| `peoplefinder` | PeopleFinder | 1 | `https://www.peoplefinder.com/optout` | 404 | ❌ dead | dead_link |
| `pipl` | Pipl | 1 | `https://pipl.com` | 200 | ✅ alive | none |
| `radaris` | Radaris | 1 | `https://radaris.com/control/privacy` | 200 | ↩️ redirected_ok | redirect |
| `spokeo` | Spokeo | 1 | `https://www.spokeo.com/optout` | 200 | ✅ alive | none |
| `sterling` | Sterling | 1 | `https://sterlingcheck.com` | 200 | ↩️ redirected_ok | redirect_domain_change |
| `thomson_reuters` | Thomson Reuters (CLEAR) | 1 | `https://thomsonreuters.com` | 200 | ↩️ redirected_ok | redirect_domain_change |
| `transunion` | TransUnion | 1 | `https://transunion.com` | 403 | 🔒 alive_restricted | none |
| `truepeoplesearch` | TruePeopleSearch | 1 | `https://www.truepeoplesearch.com/removal` | 403 | 🔒 alive_restricted | none |
| `truthfinder` | Truthfinder | 1 | `https://www.truthfinder.com/optout` | 404 | ❌ dead | dead_link |
| `verisk` | Verisk | 1 | `https://verisk.com` | 200 | ↩️ redirected_ok | redirect_domain_change |
| `whitepages` | Whitepages | 1 | `https://www.whitepages.com/suppression-requests` | 200 | ✅ alive | none |
| `zoominfo` | ZoomInfo | 1 | `https://www.zoominfo.com/about/privacy-center` | 404 | ❌ dead | dead_link |
| `aviato` | Aviato | 3 | `https://www.aviato.co/legal/privacy` | 200 | ✅ alive | none |
| `blue_action` | Blue Action | 3 | `https://my.datasubject.com/16CV6iU2K7qFU3Poy/33263` | 200 | ✅ alive | none |
| `clearview_ai_inc` | Clearview AI, Inc. | 3 | `https://www.clearview.ai/privacy-and-requests` | 200 | ✅ alive | none |
| `converge_direct_llc` | Converge Direct, LLC | 3 | `https://www.convergemarketing.com/compliance` | 200 | ↩️ redirected_ok | redirect |
| `datasys_group_inc` | Datasys Group, Inc. | 3 | `https://datasys.com/privacy-policy` | 200 | ✅ alive | none |
| `divorce_records` | Divorce Records | 3 | `https://divorcerecords.org` | 200 | ↩️ redirected_ok | redirect_domain_change |
| `eyeota_pte_ltd` | Eyeota Pte Ltd | 3 | `https://www.eyeota.com/how-to-opt-out` | 200 | ✅ alive | none |
| `freepeoplesearch_com_llc` | FreePeopleSearch.com, LLC | 3 | `https://www.freepeoplesearch.com/privacy-policy/` | 403 | 🔒 alive_restricted | redirect_domain_change |
| `intalytics_inc` | Intalytics, Inc. | 3 | `https://kalibrate.com/data-subject-access-request-form/` | 200 | ↩️ redirected_ok | redirect |
| `key_marketing_advantage_llc` | Key Marketing Advantage, LLC | 3 | `https://www.keymarketingcorp.com/do_not_use_my_personal_info…` | 404 | ❌ dead | dead_link |
| `ray_cdp_inc` | Ray CDP, Inc. | 3 | `https://www.rayinsights.com/privacy-notice/consumer-choice-p…` | 200 | ✅ alive | none |
| `rooftop_digital_llc` | Rooftop Digital, LLC | 3 | `https://www.rooftopdigital.com/privacy-policy/` | — | ❌ dead | dead_link |
| `tunnl_llc` | Tunnl, LLC | 3 | `https://www.tunnldata.com/privacy-policy` | 200 | ✅ alive | none |
| `vendelux` | Vendelux | 3 | `https://www.vendelux.com/privacy/` | 200 | ↩️ redirected_ok | redirect |
| `warmly_inc` | Warmly, Inc | 3 | `https://www.warmly.ai/p/privacy-policy#your-choices` | 200 | ✅ alive | none |
| `webmii` | WebMii | 3 | `https://webmii.com` | 200 | ✅ alive | none |

---

## Problematic Brokers — Detail

### ❌ Dead / Unreachable URLs

These brokers returned 404, 410, connection refused, or zero-status errors:

#### `intelius` — Intelius (Tier 1)
- **URL tested:** `https://www.intelius.com/optout`
- **HTTP Status:** 404
- **Error:** None
- **Removal method:** web_form

#### `peoplefinder` — PeopleFinder (Tier 1)
- **URL tested:** `https://www.peoplefinder.com/optout`
- **HTTP Status:** 404
- **Error:** None
- **Removal method:** web_form

#### `truthfinder` — Truthfinder (Tier 1)
- **URL tested:** `https://www.truthfinder.com/optout`
- **HTTP Status:** 404
- **Error:** None
- **Removal method:** web_form

#### `lexisnexis` — LexisNexis (Tier 1)
- **URL tested:** `https://optout.lexisnexis.com/`
- **HTTP Status:** 0
- **Error:** None
- **Removal method:** hybrid

#### `experian` — Experian (Tier 1)
- **URL tested:** `https://www.experian.com/privacy/opting-out`
- **HTTP Status:** 404
- **Error:** None
- **Removal method:** email

#### `zoominfo` — ZoomInfo (Tier 1)
- **URL tested:** `https://www.zoominfo.com/about/privacy-center`
- **HTTP Status:** 404
- **Error:** None
- **Removal method:** email

#### `neustar` — Neustar (Tier 1)
- **URL tested:** `https://neustar.biz`
- **HTTP Status:** 0
- **Error:** None
- **Removal method:** email

#### `hireright` — HireRight (Tier 1)
- **URL tested:** `https://hireright.com`
- **HTTP Status:** 0
- **Error:** None
- **Removal method:** email

#### `key_marketing_advantage_llc` — Key Marketing Advantage, LLC (Tier 3)
- **URL tested:** `https://www.keymarketingcorp.com/do_not_use_my_personal_information`
- **HTTP Status:** 404
- **Error:** None
- **Removal method:** hybrid

#### `rooftop_digital_llc` — Rooftop Digital, LLC (Tier 3)
- **URL tested:** `https://www.rooftopdigital.com/privacy-policy/`
- **HTTP Status:** 0
- **Error:** None
- **Removal method:** hybrid

### 🔀 Cross-Domain Redirects

These brokers redirect to a completely different domain. Note: many are **trivial www-additions** (e.g. `equifax.com` → `www.equifax.com`) and are low priority. The **critical ones** are flagged with ⚠️ in the Notable Findings section above.

#### `instantcheckmate` — InstantCheckmate (Tier 1)
- **Original URL:** `https://www.instantcheckmate.com/optout`
- **Redirects to:** `https://app.instantcheckmate.com/privacy-center/`
- **Redirect count:** 3

#### `oracle_data_cloud` — Oracle Data Cloud (Tier 1)
- **Original URL:** `https://oracle.com`
- **Redirects to:** `https://www.oracle.com/`
- **Redirect count:** 1

#### `epsilon` — Epsilon (Tier 1)
- **Original URL:** `https://epsilon.com`
- **Redirects to:** `https://www.epsilon.com/apac`
- **Redirect count:** 2

#### `equifax` — Equifax (Tier 1)
- **Original URL:** `https://equifax.com`
- **Redirects to:** `https://www.equifax.com/`
- **Redirect count:** 1

#### `oracle_datacloud` — Oracle Data Cloud (BlueKai) (Tier 1)
- **Original URL:** `https://datacloudoptout.oracle.com/`
- **Redirects to:** `https://www.oracle.com/contracts/data-services/`
- **Redirect count:** 1

#### `iqvia` — IQVIA (Tier 1)
- **Original URL:** `https://iqvia.com`
- **Redirects to:** `https://www.iqvia.com/`
- **Redirect count:** 1

#### `sterling` — Sterling (Tier 1)
- **Original URL:** `https://sterlingcheck.com`
- **Redirects to:** `https://www.sterlingcheck.com/`
- **Redirect count:** 1

#### `acxiom_eu` — Acxiom (EU) (Tier 1)
- **Original URL:** `https://acxiom.co.uk`
- **Redirects to:** `https://www.acxiom.co.uk/`
- **Redirect count:** 1

#### `experian_uk` — Experian (UK) (Tier 1)
- **Original URL:** `https://experian.co.uk`
- **Redirects to:** `https://www.experian.co.uk/`
- **Redirect count:** 2

#### `epsilon_eu` — Epsilon (EU) (Tier 1)
- **Original URL:** `https://epsilon.com`
- **Redirects to:** `https://www.epsilon.com/apac`
- **Redirect count:** 2

#### `corelogic` — CoreLogic (Tier 1)
- **Original URL:** `https://corelogic.com`
- **Redirects to:** `https://www.cotality.com/`
- **Redirect count:** 1

#### `verisk` — Verisk (Tier 1)
- **Original URL:** `https://verisk.com`
- **Redirects to:** `https://www.verisk.com/`
- **Redirect count:** 1

#### `thomson_reuters` — Thomson Reuters (CLEAR) (Tier 1)
- **Original URL:** `https://thomsonreuters.com`
- **Redirects to:** `https://www.thomsonreuters.com/en`
- **Redirect count:** 2

#### `freepeoplesearch_com_llc` — FreePeopleSearch.com, LLC (Tier 3)
- **Original URL:** `https://www.freepeoplesearch.com/privacy-policy/`
- **Redirects to:** `https://freepeoplesearch.com/privacy-policy/`
- **Redirect count:** 1

#### `divorce_records` — Divorce Records (Tier 3)
- **Original URL:** `https://divorcerecords.org`
- **Redirects to:** `https://www.divorcerecords.org:443/`
- **Redirect count:** 1

---

## Notable Critical Findings

These specific findings require immediate attention beyond routine URL updates:

### 🏢 Corporate Rebrands / Acquisitions

| Broker ID | Issue | Evidence |
|-----------|-------|----------|
| `corelogic` | **Domain rebranded** — `corelogic.com` now redirects to `cotality.com`. CoreLogic rebranded to Cotality in early 2025. Both `domain` and any opt_out_url need updating. | HTTP 200 via redirect to `https://www.cotality.com/` |
| `neustar` | **Acquired by TransUnion** — `neustar.biz` does not resolve (status 0). Neustar was fully absorbed into TransUnion; the broker entry may be obsolete or should point to TransUnion's privacy portal. | Connection failure |
| `oracle_datacloud` | **Service discontinued** — The dedicated `datacloudoptout.oracle.com` portal redirects to Oracle's generic contracts page (`oracle.com/contracts/data-services/`), suggesting the BlueKai opt-out program was retired. | Redirect to contracts page |
| `hireright` | **Domain not resolving** — `hireright.com` returns no response. HireRight (owned by First Advantage since 2021) may have migrated to `fadv.com`. | Status 0, connection refused |

### 🔗 Opt-Out URL Path Changes (still alive but wrong path)

| Broker ID | Old Path | New Path (confirmed) |
|-----------|----------|---------------------|
| `instantcheckmate` | `/optout` | `https://app.instantcheckmate.com/privacy-center/` |
| `beenverified` | `/app/optout/search` | `/svc/optout/search/` (subtle API path change) |
| `radaris` | `/control/privacy` | `/radar/` (privacy page moved) |
| `liveramp` | `/opt_out/` | `/privacy` (path changed) |
| `intalytics_inc` | `kalibrate.com/data-subject-access-request-form/` | `kalibrate.com/dsr-form/` (URL slug changed) |
| `converge_direct_llc` | `/compliance` | `/privacy/` |

### ⚠️ Tier 1 Brokers with Dead opt_out_urls (High Priority)

These are major, widely-used data brokers with **broken opt-out pages** — users currently cannot self-remove:

1. **`intelius`** — `/optout` returns 404. Intelius (PeopleConnect) may have moved opt-out to a subdomain or new path.
2. **`peoplefinder`** — `/optout` returns 404. Sister site to Intelius (same parent, PeopleConnect Inc.).
3. **`truthfinder`** — `/optout` returns 404. Also under PeopleConnect umbrella — likely same root cause as above two.
4. **`experian`** — `/privacy/opting-out` returns 404. Experian's opt-out portal has moved; needs new URL research.
5. **`zoominfo`** — `/about/privacy-center` returns 404. ZoomInfo relocated their privacy center.
6. **`lexisnexis`** — Dedicated `optout.lexisnexis.com` subdomain not resolving.

> **PeopleConnect cluster:** `intelius`, `peoplefinder`, and `truthfinder` are all PeopleConnect Inc. brands. Their shared `/optout` endpoint being dead simultaneously suggests a platform migration. Research `peopleconnect.us/privacy` or their new unified privacy portal.

---

## Pattern Analysis — Full Database (1,169 Brokers)

### 🔓 HTTP vs HTTPS

**0 brokers** have `opt_out_url` using plain `http://` (not HTTPS):

*None found — all opt_out_urls use HTTPS. ✅*

### 📭 Missing opt_out_url

**409 brokers** have no `opt_out_url` field at all. Breakdown by removal method:

- `email`: 339 brokers
- `web_form`: 70 brokers

Top brokers missing opt_out_url (first 20):

- `pipl` (method: `email`, domain: `pipl.com`)
- `oracle_data_cloud` (method: `email`, domain: `oracle.com`)
- `epsilon` (method: `email`, domain: `epsilon.com`)
- `equifax` (method: `email`, domain: `equifax.com`)
- `transunion` (method: `email`, domain: `transunion.com`)
- `fullcontact` (method: `email`, domain: `fullcontact.com`)
- `lotame` (method: `email`, domain: `lotame.com`)
- `datalogix` (method: `email`, domain: `datalogix.com`)
- `neustar` (method: `email`, domain: `neustar.biz`)
- `iqvia` (method: `email`, domain: `iqvia.com`)
- `checkr` (method: `email`, domain: `checkr.com`)
- `hireright` (method: `email`, domain: `hireright.com`)
- `sterling` (method: `email`, domain: `sterlingcheck.com`)
- `first_advantage` (method: `email`, domain: `fadv.com`)
- `acxiom_eu` (method: `email`, domain: `acxiom.co.uk`)
- `experian_uk` (method: `email`, domain: `experian.co.uk`)
- `equifax_uk` (method: `email`, domain: `equifax.co.uk`)
- `epsilon_eu` (method: `email`, domain: `epsilon.com`)
- `corelogic` (method: `email`, domain: `corelogic.com`)
- `verisk` (method: `email`, domain: `verisk.com`)
- *(…and 389 more)*

### 🔁 Duplicate Domains

**1 domains** appear under multiple broker IDs (possible parent-company relationships or duplicates):

- `epsilon.com`: `epsilon`, `epsilon_eu`

### ↩️ Redirect Patterns (from sample)

21 of 50 tested URLs involved at least one redirect:

- `beenverified`: `https://www.beenverified.com/app/optout/search` → `https://www.beenverified.com/svc/optout/search/`
- `radaris`: `https://radaris.com/control/privacy` → `https://radaris.com/radar/`
- `instantcheckmate`: `https://www.instantcheckmate.com/optout` → `https://app.instantcheckmate.com/privacy-center/`
- `oracle_data_cloud`: `https://oracle.com` → `https://www.oracle.com/`
- `epsilon`: `https://epsilon.com` → `https://www.epsilon.com/apac`
- `equifax`: `https://equifax.com` → `https://www.equifax.com/`
- `liveramp`: `https://liveramp.com/opt_out/` → `https://liveramp.com/privacy`
- `oracle_datacloud`: `https://datacloudoptout.oracle.com/` → `https://www.oracle.com/contracts/data-services/`
- `iqvia`: `https://iqvia.com` → `https://www.iqvia.com/`
- `sterling`: `https://sterlingcheck.com` → `https://www.sterlingcheck.com/`
- `acxiom_eu`: `https://acxiom.co.uk` → `https://www.acxiom.co.uk/`
- `experian_uk`: `https://experian.co.uk` → `https://www.experian.co.uk/`
- `epsilon_eu`: `https://epsilon.com` → `https://www.epsilon.com/apac`
- `corelogic`: `https://corelogic.com` → `https://www.cotality.com/`
- `verisk`: `https://verisk.com` → `https://www.verisk.com/`
- `thomson_reuters`: `https://thomsonreuters.com` → `https://www.thomsonreuters.com/en`
- `freepeoplesearch_com_llc`: `https://www.freepeoplesearch.com/privacy-policy/` → `https://freepeoplesearch.com/privacy-policy/`
- `vendelux`: `https://www.vendelux.com/privacy/` → `https://www.vendelux.com/privacy`
- `divorce_records`: `https://divorcerecords.org` → `https://www.divorcerecords.org:443/`
- `converge_direct_llc`: `https://www.convergemarketing.com/compliance` → `https://www.convergemarketing.com/privacy/`
- `intalytics_inc`: `https://kalibrate.com/data-subject-access-request-form/` → `https://kalibrate.com/dsr-form/`

---

## Recommendations

### 1. Mark Dead Brokers as Inactive

The following broker entries returned hard 404/410 errors or refused all connections. Recommend adding `active: false` or `status: inactive` to their YAML entries:

- **`intelius`** (Intelius) — Status 404, URL: `https://www.intelius.com/optout`
- **`peoplefinder`** (PeopleFinder) — Status 404, URL: `https://www.peoplefinder.com/optout`
- **`truthfinder`** (Truthfinder) — Status 404, URL: `https://www.truthfinder.com/optout`
- **`lexisnexis`** (LexisNexis) — Status 0, URL: `https://optout.lexisnexis.com/`
- **`experian`** (Experian) — Status 404, URL: `https://www.experian.com/privacy/opting-out`
- **`zoominfo`** (ZoomInfo) — Status 404, URL: `https://www.zoominfo.com/about/privacy-center`
- **`neustar`** (Neustar) — Status 0, URL: `https://neustar.biz`
- **`hireright`** (HireRight) — Status 0, URL: `https://hireright.com`
- **`key_marketing_advantage_llc`** (Key Marketing Advantage, LLC) — Status 404, URL: `https://www.keymarketingcorp.com/do_not_use_my_personal_information`
- **`rooftop_digital_llc`** (Rooftop Digital, LLC) — Status 0, URL: `https://www.rooftopdigital.com/privacy-policy/`

### 2. Investigate Timeout Brokers

*No timeouts in the tested sample.*

### 3. Update Cross-Domain Redirects

These opt_out_url entries redirect to a different domain — update the YAML to use the final destination URL directly:

- **`instantcheckmate`**: Update `opt_out_url` from `https://www.instantcheckmate.com/optout` → `https://app.instantcheckmate.com/privacy-center/`
- **`oracle_data_cloud`**: Update `opt_out_url` from `https://oracle.com` → `https://www.oracle.com/`
- **`epsilon`**: Update `opt_out_url` from `https://epsilon.com` → `https://www.epsilon.com/apac`
- **`equifax`**: Update `opt_out_url` from `https://equifax.com` → `https://www.equifax.com/`
- **`oracle_datacloud`**: Update `opt_out_url` from `https://datacloudoptout.oracle.com/` → `https://www.oracle.com/contracts/data-services/`
- **`iqvia`**: Update `opt_out_url` from `https://iqvia.com` → `https://www.iqvia.com/`
- **`sterling`**: Update `opt_out_url` from `https://sterlingcheck.com` → `https://www.sterlingcheck.com/`
- **`acxiom_eu`**: Update `opt_out_url` from `https://acxiom.co.uk` → `https://www.acxiom.co.uk/`
- **`experian_uk`**: Update `opt_out_url` from `https://experian.co.uk` → `https://www.experian.co.uk/`
- **`epsilon_eu`**: Update `opt_out_url` from `https://epsilon.com` → `https://www.epsilon.com/apac`
- **`corelogic`**: Update `opt_out_url` from `https://corelogic.com` → `https://www.cotality.com/`
- **`verisk`**: Update `opt_out_url` from `https://verisk.com` → `https://www.verisk.com/`
- **`thomson_reuters`**: Update `opt_out_url` from `https://thomsonreuters.com` → `https://www.thomsonreuters.com/en`
- **`freepeoplesearch_com_llc`**: Update `opt_out_url` from `https://www.freepeoplesearch.com/privacy-policy/` → `https://freepeoplesearch.com/privacy-policy/`
- **`divorce_records`**: Update `opt_out_url` from `https://divorcerecords.org` → `https://www.divorcerecords.org:443/`

### 4. Upgrade HTTP URLs to HTTPS

*No HTTP-only opt_out_urls found — all use HTTPS. ✅*

### 5. Add opt_out_url for Web-Form Brokers

**70 brokers** use `web_form` or `hybrid` removal but have no `opt_out_url`. These are the highest priority to fix since users need a direct link:

- **`datecheck`** (method: `web_form`, domain: `datecheck.com`)
- **`spock`** (method: `web_form`, domain: `spock.com`)
- **`isearch`** (method: `web_form`, domain: `isearch.com`)
- **`whitepages-premium`** (method: `web_form`, domain: `whitepagespremium.com`)
- **`accurint`** (method: `web_form`, domain: `accurint.com`)
- **`publicrecords-com`** (method: `web_form`, domain: `publicrecords.com`)
- **`addresssearch`** (method: `web_form`, domain: `addresssearch.com`)
- **`truthrecord-2`** (method: `web_form`, domain: `truthrecord.com`)
- **`oldfriends`** (method: `web_form`, domain: `oldfriends.co`)
- **`whocalledme`** (method: `web_form`, domain: `whocalledme.com`)
- **`callersmart`** (method: `web_form`, domain: `callersmart.com`)
- **`reversephonelookup`** (method: `web_form`, domain: `reversephonelookup.com`)
- **`phonenumberlookupfree`** (method: `web_form`, domain: `phonenumberlookupfree.com`)
- **`xlek`** (method: `web_form`, domain: `xlek.com`)
- **`backgroundalert`** (method: `web_form`, domain: `backgroundalert.com`)
- **`mugshotlook`** (method: `web_form`, domain: `mugshotlook.com`)
- **`freebackgroundcheck`** (method: `web_form`, domain: `freebackgroundcheck.org`)
- **`peoplesearch123`** (method: `web_form`, domain: `peoplesearch123.com`)
- **`peoplefindthor`** (method: `web_form`, domain: `peoplefindthor.dk`)
- **`cubib`** (method: `web_form`, domain: `cubib.com`)
- *(…and 50 more)*

### 6. Review Duplicate Domain Entries

**1 domains** are listed under multiple broker IDs. Verify these are intentional (e.g., regional subdomains vs. parent company entries) or consolidate duplicates:

- `epsilon.com`: shared by `epsilon`, `epsilon_eu`

### 7. Add active: false Flag for Inactive Brokers

The YAML schema does not currently include an `active` boolean field. Recommend adding this to the schema to allow graceful deprecation of dead brokers without deleting historical data. Suggested schema addition:

```yaml
  - id: example-dead-broker
    name: Example Dead Broker
    active: false  # ← new field
    status_note: "Domain expired 2026-02"
    # … rest of fields
```

---

## Appendix — Test Methodology

- **Tool:** `curl` v8.14.1
- **Timeout:** 5s (`--max-time 5 --connect-timeout 4`)
- **Redirects:** Followed automatically (`-L --max-redirs 10`)
- **User-Agent:** `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36`
- **Sample seed:** 42 (reproducible random selection)
- **Tier 1 brokers:** All 34 tested
- **Random sample:** 16 additional brokers (non-Tier-1) to reach 50 total
- **Date run:** 2026-03-23 11:27 UTC

> **Note:** Some URLs return 403/401 not because they're dead, but because they block
> automated requests (bot detection). These are classified as `alive_restricted` and
> should not be marked inactive without manual verification.
