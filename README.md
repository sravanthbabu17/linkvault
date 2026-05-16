# LinkVault — Personal Resource Dashboard

A Netflix-style dashboard to organise your links, PDFs, and videos into collections.  
Access and manage your resources from anywhere.

![Screenshot](screenshot.png)

## Features

- **Collections** — Group resources into named, color-coded collections  
- **Cards** — Each item displayed as a sleek card with type badge  
- **Quick Open** — Click any card to open the link / PDF / video in a new tab  
- **Search** — Instant search across all items  
- **CRUD** — Add, edit, move, and delete items and collections  
- **Responsive** — Works on desktop, tablet, and mobile  

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript (no frameworks)  
- **Backend:** Node.js + Express  
- **Storage:** JSON file (`data/data.json`)

## Run Locally

```bash
npm install
npm start
# → http://localhost:3000
```

## Deploy (Render — free tier)

1. Push this repo to GitHub  
2. Go to [render.com](https://render.com) → **New Web Service**  
3. Connect your GitHub repo  
4. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** Free
5. Deploy!

> **Note:** On Render's free tier the filesystem is ephemeral, so data resets on redeploy.  
> For persistent storage, upgrade to a paid instance or switch to a database (e.g. SQLite + Turso, or MongoDB Atlas free tier).

## Deploy (Railway)

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

## Deploy (Docker)

```bash
docker build -t linkvault .
docker run -p 3000:3000 linkvault
```

## License

MIT
