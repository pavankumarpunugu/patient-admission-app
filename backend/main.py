import math
import os
import re
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import Date, Integer, String, create_engine, or_
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

# ---------------------------------------------------------------- options
GENDERS = ["Male", "Female", "Other"]
WARDS = ["General Ward", "ICU", "Pediatric Ward", "Maternity Ward", "Emergency Ward", "Surgical Ward"]
DEPARTMENTS = ["Cardiology", "Neurology", "Orthopedics", "Pediatrics", "General Medicine", "Gynecology", "Emergency"]
DOCTORS = ["Dr. Anil Sharma", "Dr. Priya Reddy", "Dr. Rajesh Kumar", "Dr. Sunita Rao", "Dr. Vikram Singh", "Dr. Meera Nair"]
STATUSES = ["Admitted", "Discharged"]

IST = timezone(timedelta(hours=5, minutes=30))
NAME_RE = re.compile(r"^[A-Za-z]+(?: [A-Za-z]+)*$")  # letters and single spaces only


def today_ist() -> date:
    return datetime.now(IST).date()


# ---------------------------------------------------------------- database
# Set DATABASE_URL (e.g. Postgres) in production; falls back to a local SQLite file.
DB_URL = os.getenv("DATABASE_URL", "sqlite:///./patients.db")
if DB_URL.startswith("postgres://"):
    DB_URL = DB_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif DB_URL.startswith("postgresql://"):
    DB_URL = DB_URL.replace("postgresql://", "postgresql+psycopg://", 1)

engine = create_engine(
    DB_URL,
    connect_args={"check_same_thread": False} if DB_URL.startswith("sqlite") else {},
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False)


class Base(DeclarativeBase):
    pass


class Patient(Base):
    __tablename__ = "patients"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    age: Mapped[int] = mapped_column(Integer)
    gender: Mapped[str] = mapped_column(String(20))
    ward: Mapped[str] = mapped_column(String(50))
    department: Mapped[str] = mapped_column(String(50))
    doctor: Mapped[str] = mapped_column(String(50))
    admission_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="Admitted")


Base.metadata.create_all(engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------- schemas
def _choice(value, allowed, label):
    if value is None or (isinstance(value, str) and not value.strip()):
        raise ValueError(f"{label} is required")
    if value not in allowed:
        raise ValueError(f"{label} must be one of: {', '.join(allowed)}")
    return value


class PatientIn(BaseModel):
    name: str
    age: int
    gender: str
    ward: str
    department: str
    doctor: str
    admission_date: date
    status: str = "Admitted"

    @field_validator("name", mode="before")
    @classmethod
    def v_name(cls, v):
        if not isinstance(v, str) or not v.strip():
            raise ValueError("Name is required")
        v = " ".join(v.split())
        if not NAME_RE.match(v):
            raise ValueError("Name must contain letters only (no numbers or symbols)")
        if len(v) > 100:
            raise ValueError("Name must be 100 characters or fewer")
        return v

    @field_validator("age", mode="before")
    @classmethod
    def v_age(cls, v):
        if v is None or (isinstance(v, str) and not v.strip()):
            raise ValueError("Age is required")
        if isinstance(v, bool):
            raise ValueError("Age must be a number")
        if isinstance(v, str):
            try:
                v = float(v.strip())
            except ValueError:
                raise ValueError("Age must be a number")
        if isinstance(v, float):
            if not math.isfinite(v):
                raise ValueError("Age must be a number")
            if not v.is_integer():
                raise ValueError("Age must be a whole number")
            v = int(v)
        if not isinstance(v, int):
            raise ValueError("Age must be a number")
        if not 0 <= v <= 120:
            raise ValueError("Age must be between 0 and 120")
        return v

    @field_validator("gender", mode="before")
    @classmethod
    def v_gender(cls, v):
        return _choice(v, GENDERS, "Gender")

    @field_validator("ward", mode="before")
    @classmethod
    def v_ward(cls, v):
        return _choice(v, WARDS, "Ward")

    @field_validator("department", mode="before")
    @classmethod
    def v_dept(cls, v):
        return _choice(v, DEPARTMENTS, "Department")

    @field_validator("doctor", mode="before")
    @classmethod
    def v_doctor(cls, v):
        return _choice(v, DOCTORS, "Doctor")

    @field_validator("admission_date", mode="before")
    @classmethod
    def v_date(cls, v):
        if v is None or (isinstance(v, str) and not v.strip()):
            raise ValueError("Admission date is required")
        try:
            d = date.fromisoformat(v) if isinstance(v, str) else v
        except ValueError:
            raise ValueError("Admission date must be a valid date (YYYY-MM-DD)")
        if not isinstance(d, date):
            raise ValueError("Admission date must be a valid date (YYYY-MM-DD)")
        if d > today_ist():
            raise ValueError("Admission date cannot be in the future")
        return d

    @field_validator("status", mode="before")
    @classmethod
    def v_status(cls, v):
        return _choice(v, STATUSES, "Status")


def to_dict(p: Patient) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "age": p.age,
        "gender": p.gender,
        "ward": p.ward,
        "department": p.department,
        "doctor": p.doctor,
        "admission_date": p.admission_date.isoformat(),
        "status": p.status,
    }


# ---------------------------------------------------------------- app
app = FastAPI(title="Patient Admission API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    errors = {}
    for e in exc.errors():
        loc = [str(x) for x in e["loc"] if x not in ("body", "query")]
        field = loc[0] if loc else "body"
        msg = e["msg"]
        if msg.startswith("Value error, "):
            msg = msg[len("Value error, "):]
        elif e["type"] == "missing":
            msg = f"{field.replace('_', ' ').capitalize()} is required"
        elif e["type"] == "json_invalid":
            field, msg = "body", "Request body is not valid JSON"
        errors.setdefault(field, msg)
    return JSONResponse(
        status_code=422,
        content={"message": "Validation failed: " + "; ".join(errors.values()), "errors": errors},
    )


@app.exception_handler(StarletteHTTPException)
async def http_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code, content={"message": exc.detail, "errors": {}})


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/options")
def options():
    return {"genders": GENDERS, "wards": WARDS, "departments": DEPARTMENTS, "doctors": DOCTORS, "statuses": STATUSES}


@app.get("/api/stats")
def stats(db: Session = Depends(get_db)):
    total = db.query(Patient).count()
    admitted = db.query(Patient).filter(Patient.status == "Admitted").count()
    return {"total": total, "admitted": admitted, "discharged": total - admitted}


@app.get("/api/patients")
def list_patients(
    search: Optional[str] = None,
    ward: Optional[str] = None,
    department: Optional[str] = None,
    doctor: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Patient)
    if search and search.strip():
        q = q.filter(Patient.name.ilike(f"%{search.strip()}%"))
    if ward:
        q = q.filter(Patient.ward == ward)
    if department:
        q = q.filter(Patient.department == department)
    if doctor:
        q = q.filter(Patient.doctor == doctor)
    if status:
        q = q.filter(Patient.status == status)
    return [to_dict(p) for p in q.order_by(Patient.id.desc()).all()]


def _get_or_404(db: Session, pid: int) -> Patient:
    p = db.get(Patient, pid)
    if not p:
        raise HTTPException(404, "Patient not found")
    return p


@app.post("/api/patients", status_code=201)
def create_patient(data: PatientIn, db: Session = Depends(get_db)):
    p = Patient(**data.model_dump())
    db.add(p)
    db.commit()
    db.refresh(p)
    return to_dict(p)


@app.get("/api/patients/{pid}")
def get_patient(pid: int, db: Session = Depends(get_db)):
    return to_dict(_get_or_404(db, pid))


@app.put("/api/patients/{pid}")
def update_patient(pid: int, data: PatientIn, db: Session = Depends(get_db)):
    p = _get_or_404(db, pid)
    for k, v in data.model_dump().items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return to_dict(p)


@app.patch("/api/patients/{pid}/discharge")
def discharge_patient(pid: int, db: Session = Depends(get_db)):
    p = _get_or_404(db, pid)
    p.status = "Discharged"
    db.commit()
    db.refresh(p)
    return to_dict(p)


@app.delete("/api/patients/{pid}")
def delete_patient(pid: int, db: Session = Depends(get_db)):
    p = _get_or_404(db, pid)
    db.delete(p)
    db.commit()
    return {"message": "Patient deleted"}


# ---------------------------------------------------------------- serve React build
STATIC_DIR = Path(os.getenv("STATIC_DIR", Path(__file__).parent / "static"))
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(404, "Not found")
        root = STATIC_DIR.resolve()
        f = (root / full_path).resolve()
        if full_path and f.is_file() and f.is_relative_to(root):
            return FileResponse(f)
        return FileResponse(STATIC_DIR / "index.html")
