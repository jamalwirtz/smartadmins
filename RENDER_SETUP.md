# Render Deployment Setup

## Why sign-in doesn't work without this step

The frontend is a static site hosted on Render. It needs to know the URL of the
backend API. Without it, every API call (login, data fetch, etc.) fails silently.

## Fix — one environment variable

1. Go to your **Render dashboard**
2. Open your **frontend** service (the static site)
3. Go to **Environment** tab
4. Click **Add Environment Variable**
5. Set:
   - Key:   `VITE_API_URL`
   - Value: `https://smartadmin-sxvh.onrender.com`
     _(replace with your actual backend service URL if different)_
6. Click **Save Changes**
7. Render will automatically **redeploy** the frontend

## Verify it worked

Open the frontend URL in your browser and open **DevTools → Console**.
You should see:
```
[SSTG] API base URL: https://smartadmin-sxvh.onrender.com
```

If you still see `/api` in the console, the env var wasn't picked up — trigger
a manual redeploy from the Render dashboard.

## Demo credentials

Once deployed:
- Username: `admin`
- Password: `admin123`

Or click **"Try live demo"** on the login page — it signs in automatically.

## Local development

No env var needed locally. The Vite dev server proxies `/api` to `localhost:8000`.

```bash
# Terminal 1 — backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
# → http://localhost:8000  (demo data seeded automatically)

# Terminal 2 — frontend
cd frontend
npm install
npm run dev
# → http://localhost:5173
```
