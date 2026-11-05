import json, os, sqlite3, tempfile, unittest
import company_link as cl

class T(unittest.TestCase):
    def test_scale_grows_with_size(self):
        small = cl.metrics_to_scale(json.load(open("examples/small.json"))["metrics"])
        large = cl.metrics_to_scale(json.load(open("examples/large.json"))["metrics"])
        for k in ("residents", "houses", "stalls", "workshops", "plots", "warehouses"): self.assertGreater(large[k], small[k], k)
        self.assertGreater(large["radius"], small["radius"])
    def test_limits(self):
        huge = cl.metrics_to_scale({k: 1e18 for k in cl.METRICS})
        for k, (lo, hi) in cl.LIMITS.items(): self.assertTrue(lo <= huge[k] <= hi, k)
        z = cl.metrics_to_scale({}); self.assertEqual(z["residents"], 0); self.assertEqual(z["plots"], 2)
    def test_deficit_shrinks(self):
        d = json.load(open("examples/deficit.json"))["metrics"]; s = cl.metrics_to_scale(d)
        ok = dict(d, operating_income=1e8, net_income=5e7, net_assets=3e8, liabilities=3e8); g = cl.metrics_to_scale(ok)
        self.assertEqual(s["health"], "crisis"); self.assertGreater(s["wasteland"], 0); self.assertGreater(s["vacant"], 0)
        self.assertLess(s["residents"], g["residents"]); self.assertEqual(g["wasteland"], 0)
    def test_step_smooth(self):
        t = cl.metrics_to_scale(json.load(open("examples/large.json"))["metrics"])
        s = cl.step_toward(None, t); self.assertLess(s["residents"], t["residents"]); self.assertFalse(s["converged"])
        for _ in range(40): s = cl.step_toward(s, t)
        self.assertTrue(s["converged"]); self.assertEqual(s["residents"], t["residents"])
        small = cl.metrics_to_scale({}); s2 = cl.step_toward(s, small)
        self.assertLess(s2["residents"], s["residents"]); self.assertGreater(s2["residents"], small["residents"])
    def test_select_only(self):
        cl.assert_select_only("SELECT a FROM t"); cl.assert_select_only("with x as (select 1) select * from x")
        cl.assert_select_only("SELECT 'drop table' AS s FROM t")
        for bad in ("DELETE FROM t", "SELECT 1; DROP TABLE t", "UPDATE t SET a=1", "SELECT * INTO x FROM t", "PRAGMA writable_schema=1",
                    "SELECT 1 -- x", "ATTACH 'x' AS y", "INSERT INTO t VALUES(1)", ""):
            with self.assertRaises(cl.ReadOnlyViolation, msg=bad): cl.assert_select_only(bad)
    def test_build_query_rejects_injection(self):
        with self.assertRaises(cl.LinkError): cl.build_query({"table": "t; drop table x", "columns": {"revenue": "a"}})
        with self.assertRaises(cl.LinkError): cl.build_query({"table": "t", "columns": {"revenue": "a) ; --"}})
        with self.assertRaises(cl.ReadOnlyViolation): cl.build_query({"query": "DELETE FROM t"})
    def test_sqlite_readonly(self):
        d = tempfile.mkdtemp(); p = os.path.join(d, "c.db"); con = sqlite3.connect(p)
        con.execute("create table fin(fy int, sales real, headcount int)"); con.executemany("insert into fin values(?,?,?)", [(2024, 1e8, 10), (2025, 2e8, 20)]); con.commit(); con.close()
        name, m = cl.SqliteConnector(p, {"table": "fin", "order_by": "fy DESC", "columns": {"revenue": "sales", "employees": "headcount"}}).fetch()
        self.assertEqual(m["revenue"], 2e8); self.assertEqual(m["employees"], 20)
        with self.assertRaises(cl.ReadOnlyViolation): cl.SqliteConnector(p, {"query": "DELETE FROM fin"}).fetch()
        con = sqlite3.connect(p); self.assertEqual(con.execute("select count(*) from fin").fetchone()[0], 2)
    def test_json_csv(self):
        _, m = cl.JsonConnector("example_company.json").fetch(); self.assertEqual(m["employees"], 85)
        d = tempfile.mkdtemp(); p = os.path.join(d, "c.csv"); open(p, "w").write("name,売上,人数\nA,100,1\nB,\"2,000\",5\n")
        n, m = cl.CsvConnector(p, {"revenue": "売上", "employees": "人数"}).fetch(); self.assertEqual((n, m["revenue"], m["employees"]), ("B", 2000.0, 5.0))
    def test_sql_missing_driver_and_mask(self):
        with self.assertRaises(cl.LinkError) as e: cl.SqlConnector("nosuchdb+x://u:SECRETPW@h/db", {"table": "t", "columns": {"revenue": "a"}}).fetch()
        self.assertNotIn("SECRETPW", str(e.exception))
        self.assertEqual(cl.mask_url("postgresql://u:pw@h/db"), "postgresql://u:***@h/db")
    def test_disabled_default_and_demo(self):
        os.environ["COMPANY_LINK_CONF"] = "/nonexistent.json"; cl.CONF_PATH = "/nonexistent.json"
        L = cl.CompanyLink(log=lambda m: None); st = L.refresh(); self.assertFalse(st["linked"]); self.assertIsNone(st["scale"])
        self.assertTrue(L.set_demo("large")); st = L.refresh(); self.assertTrue(st["linked"]); self.assertGreater(st["target"]["residents"], 40)
        self.assertFalse(L.set_demo("bogus")); L.set_demo("off"); self.assertFalse(L.refresh()["linked"])

if __name__ == "__main__": unittest.main()
