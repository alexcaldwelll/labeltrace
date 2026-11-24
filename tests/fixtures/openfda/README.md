# Saved openFDA label replies (T010)

These files are openFDA's drug label replies, saved exactly as openFDA sent them.
They hold public FDA label text, not patient data. `npm run db:seed`
(`scripts/seed-labels.ts`) loads them into the local database, and fast tests use
them so they never call openFDA.

Both labels were picked by brand name **and** manufacturer "Eli Lilly and Company"
(research R6). Each search matched exactly one label.

**Downloaded on:** 2026-11-23

| File            | Exact query URL                                                                                                                                  | `set_id`                               | Label effective date (`effective_time`) |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- | --------------------------------------- |
| `emgality.json` | `https://api.fda.gov/drug/label.json?search=openfda.brand_name:%22EMGALITY%22+AND+openfda.manufacturer_name:%22Eli+Lilly+and+Company%22&limit=1` | `33a147be-233a-40e8-a55e-e40936e28db0` | 2026-06-05 (`20260605`)                 |
| `reyvow.json`   | `https://api.fda.gov/drug/label.json?search=openfda.brand_name:%22REYVOW%22+AND+openfda.manufacturer_name:%22Eli+Lilly+and+Company%22&limit=1`   | `aea3358c-ff41-4490-9e6d-c7bf7b3de13f` | 2026-01-08 (`20260108`)                 |

To replace a fixture with a newer label, download it again with the same URL and
update the download date and effective date above.
