#!/usr/bin/env python3
"""SSTG Demo Seeder — run: python seed_demo.py (from backend/)"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from database import SessionLocal, Base, engine
from models import User, Teacher, Subject, TeacherSubject, ClassSection
from security import hash_password

Base.metadata.create_all(bind=engine)
db = SessionLocal()

try:
    # Admin
    if not db.query(User).filter(User.username == "admin").first():
        db.add(User(username="admin", email="admin@school.demo",
                    hashed_password=hash_password("admin123"), is_admin=True))
        print("[+] admin / admin123")

    def upsert_teacher(name, email, **kw):
        t = db.query(Teacher).filter(Teacher.email == email).first()
        if not t:
            t = Teacher(name=name, email=email, **kw)
            db.add(t); db.flush()
            print(f"[+] {name}")
        return t

    alice  = upsert_teacher("Mrs Alice Kamau",   "alice@s.demo",  max_weekly_hours=25)
    brian  = upsert_teacher("Mr Brian Otieno",   "brian@s.demo",  max_weekly_hours=20, is_part_time=True, days_off="Friday")
    carol  = upsert_teacher("Ms Carol Wanjiku",  "carol@s.demo",  max_weekly_hours=30)
    david  = upsert_teacher("Mr David Mwangi",   "david@s.demo",  max_weekly_hours=28)
    esther = upsert_teacher("Mrs Esther Achieng","esther@s.demo", max_weekly_hours=25, days_off="Wednesday")
    felix  = upsert_teacher("Mr Felix Oduya",    "felix@s.demo",  max_weekly_hours=30)

    def upsert_subject(name, grade, periods, color):
        s = db.query(Subject).filter(Subject.name == name, Subject.grade_level == grade).first()
        if not s:
            s = Subject(name=name, grade_level=grade, weekly_periods=periods, color_hex=color)
            db.add(s); db.flush()
            print(f"[+] {name} Gr{grade}")
        return s

    math7 = upsert_subject("Mathematics","7",5,"#1565c0")
    eng7  = upsert_subject("English",    "7",4,"#6a1b9a")
    sci7  = upsert_subject("Science",    "7",4,"#2e7d32")
    hist7 = upsert_subject("History",    "7",3,"#bf360c")
    math8 = upsert_subject("Mathematics","8",5,"#1565c0")
    eng8  = upsert_subject("English",    "8",4,"#6a1b9a")
    bio8  = upsert_subject("Biology",    "8",4,"#558b2f")
    phy8  = upsert_subject("Physics",    "8",3,"#0277bd")
    chem8 = upsert_subject("Chemistry",  "8",3,"#e65100")

    for name, grade in [("7A","7"),("7B","7"),("8A","8"),("8B","8")]:
        if not db.query(ClassSection).filter(ClassSection.name == name).first():
            db.add(ClassSection(name=name, grade_level=grade))
            print(f"[+] Class {name}")

    db.flush()

    def link(t, s):
        if not db.query(TeacherSubject).filter(
                TeacherSubject.teacher_id==t.id, TeacherSubject.subject_id==s.id).first():
            db.add(TeacherSubject(teacher_id=t.id, subject_id=s.id))

    link(alice,math7); link(alice,math8)
    link(brian,eng7);  link(brian,eng8)
    link(carol,sci7);  link(carol,bio8)
    link(david,hist7); link(david,phy8)
    link(esther,chem8)
    link(felix,sci7);  link(felix,phy8)

    db.commit()
    print("\nDone! Run: uvicorn app.main:app --reload")
    print("Docs:  http://127.0.0.1:8000/docs")
    print("Login: admin / admin123")

except Exception:
    db.rollback(); raise
finally:
    db.close()
