import os, tempfile
os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/t.db"
from datetime import date, timedelta
from fastapi.testclient import TestClient
from main import app

c = TestClient(app)
good = dict(name="Ravi Kumar", age=45, gender="Male", ward="ICU", department="Cardiology",
            doctor="Dr. Anil Sharma", admission_date=date.today().isoformat())

def test_crud_flow():
    r = c.post("/api/patients", json=good); assert r.status_code == 201
    pid = r.json()["id"]
    assert r.json()["status"] == "Admitted"
    assert len(c.get("/api/patients").json()) == 1
    assert len(c.get("/api/patients?search=ravi").json()) == 1
    assert len(c.get("/api/patients?ward=ICU&department=Cardiology&doctor=Dr. Anil Sharma").json()) == 1
    assert c.get("/api/patients?ward=General Ward").json() == []
    r = c.put(f"/api/patients/{pid}", json={**good, "age": 46}); assert r.json()["age"] == 46
    assert c.patch(f"/api/patients/{pid}/discharge").json()["status"] == "Discharged"
    assert c.delete(f"/api/patients/{pid}").status_code == 200
    assert c.get(f"/api/patients/{pid}").status_code == 404

def bad(**kw):
    r = c.post("/api/patients", json={**good, **kw}); assert r.status_code == 422, kw
    return r.json()

def test_validation():
    assert "letters only" in bad(name="Ravi123")["errors"]["name"]
    assert "required" in bad(name="")["errors"]["name"]
    assert "between 0 and 120" in bad(age=121)["errors"]["age"]
    assert "between 0 and 120" in bad(age=-1)["errors"]["age"]
    assert "number" in bad(age="abc")["errors"]["age"]
    assert "one of" in bad(gender="X")["errors"]["gender"]
    assert "one of" in bad(ward="Nope")["errors"]["ward"]
    assert "required" in bad(department="")["errors"]["department"]
    assert "one of" in bad(doctor="Dr. Fake")["errors"]["doctor"]
    assert "future" in bad(admission_date=(date.today()+timedelta(days=3)).isoformat())["errors"]["admission_date"]
    r = c.post("/api/patients", json={}); assert r.status_code == 422 and len(r.json()["errors"]) == 7
    assert c.post("/api/patients", json={**good, "age": 0}).status_code == 201


def test_edge_cases():
    for age in ["inf", "nan", "1e999", 10**400, 12.5, True, "  "]:
        r = c.post("/api/patients", json={**good, "age": age}); assert r.status_code == 422, age
    assert c.post("/api/patients", json={**good, "age": "30"}).status_code == 201
    assert c.post("/api/patients", content="not json", headers={"content-type": "application/json"}).status_code == 422
    assert c.get("/api/nope").status_code == 404
    assert c.put("/api/patients/9999", json=good).status_code == 404
    assert c.delete("/api/patients/9999").status_code == 404
    assert c.patch("/api/patients/9999/discharge").status_code == 404
    s = c.get("/api/stats").json(); assert s["total"] == s["admitted"] + s["discharged"]
    assert "letters only" in bad(name="O'Brien")["errors"]["name"]
    assert c.post("/api/patients", json={**good, "name": "  Mary   Ann "}).json()["name"] == "Mary Ann"
    import json
    for lit in ["Infinity", "-Infinity", "NaN"]:
        body = json.dumps(good).replace('"age": 45', '"age": ' + lit)
        r = c.post("/api/patients", content=body, headers={"content-type": "application/json"}); assert r.status_code == 422, lit
