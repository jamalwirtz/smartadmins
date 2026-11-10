# Smart Admin update — copy these over your repo (paths are relative to the repo root)

backend/   (flat, next to your existing backend files)
  models.py  exams.py  exam_export.py  exam_resources.py  exports.py  main.py
  scheduler.py  levels.py  personal_timetable.py            (levels.py is new)

frontend/src/
  api/examExtras.js  api/personalExtras.js                  (new)
  components/ExamGenerateForm.jsx  ExamSetupWizard.jsx  ExamResources.jsx   (new)
  pages/Exams.jsx  Classes.jsx  CurriculumOnboarding.jsx  Home.jsx  Login.jsx  PersonalTimetable.jsx

No changes needed to App.jsx, client.js or index.css.
Back up sstg.db (SQLite) first: main.py rebuilds exam_slots once to add the date-based unique rule.
Also delete the stray duplicate frontend/src/pages/App.jsx if it still exists.
