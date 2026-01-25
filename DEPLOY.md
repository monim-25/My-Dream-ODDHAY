# ODDHAY Deployment Guide

This project is now structured as a standard Node.js application with a clear separation of concerns, making it easy to deploy to platforms like Vercel, Render, Railway, or Heroku.

## Project Structure

- **root/**: Contains configuration files (`package.json`, `.env`).
- **server/**: Contains backend logic (`server.js`, `models/`, `seed.js`).
- **client/**: Contains frontend assets and views (`public/`, `views/`).

## Local Development

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Run Development Server:**
   ```bash
   npm run dev
   ```
   The server will start at `http://localhost:3005`.

## Deployment Instructions

### Option 1: Deploy to Vercel (Recommended)

1. **Install Vercel CLI** (optional, or use the website):
   ```bash
   npm i -g vercel
   ```

2. **Deploy:**
   Run the following command and follow the prompts:
   ```bash
   vercel
   ```

3. **Environment Variables:**
   Make sure to add your `MONGODB_URI` and any other secrets in the Vercel Project Settings (Environment Variables).

### Option 2: Deploy to Render / Railway / Heroku

1. **Push to GitHub:**
   - Initialize git if not already: `git init`
   - Add files: `git add .`
   - Commit: `git commit -m "Initial commit"`
   - Push to your repository.

2. **Connect to Platform:**
   - Go to Render/Railway/Heroku.
   - Create a new "Web Service" and connect your GitHub repo.

3. **Build Command:**
   - `npm install` (default for most platforms)

4. **Start Command:**
   - `npm start` (this runs `node server/server.js`)

5. **Environment Variables:**
   - Add `MONGODB_URI` to the environment variables on the dashboard.

## Management & Control

- **Frontend:** All HTML/EJS files are in `client/views/`. CSS/JS/Images are in `client/public/`. Edits here affect the UI.
- **Backend:** API routes and logic are in `server/server.js`. Database schemas are in `server/models/`.
- **Database:** controlled via MongoDB Atlas (connection string in `.env`).

## Troubleshooting

- **Routes:** If a page shows 404, check `server/server.js` to ensure the route exists.
- **Static Files:** If images/CSS are missing, ensure they are in `client/views/` and referenced correctly in HTML (e.g., `/css/style.css` maps to `client/public/css/style.css`).
