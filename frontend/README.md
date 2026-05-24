# DSI CompStat Rio Frontend

React + TypeScript Vite frontend for the DSI / PUC-Rio Claude Impact Lab
CompStat Rio project.

## What is included

- Vite React TypeScript app
- Tailwind CSS v4
- shadcn/ui-style components and `components.json`
- Hash-based navigation for static hosting compatibility
- GitHub Actions workflow that builds and deploys `dist` to the event server

## Product Direction

The first MVP should help a CompStat manager:

```text
select a Forca Municipal area
-> inspect evidence and risk drivers
-> generate Claude recommendations
-> review a draft report section
```

Backend API:

```text
https://claude-impact-lab.gtec-dsi.net/api
```

Frontend URL:

```text
https://claude-impact-lab.gtec-dsi.net/
```

Deployment target:

```text
DigitalOcean server through Caddy, serving /opt/claude-impact-lab/www
```

Google Maps:

```text
VITE_GOOGLE_MAPS_API_KEY
```

This is a browser-exposed Google Maps JavaScript API key. Restrict it in Google
Cloud to the production domain and local development origins.

## Local development

```bash
npm install
VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev
```

With Google Maps locally:

```bash
cp .env.example .env
npm run dev
```

## Production build

```bash
npm run build
```

The app is configured with:

```ts
base: process.env.VITE_BASE_PATH ?? '/'
```

Routes use anchors like `#/areas`, so static hosting does not need server-side
rewrites.

## Submission README Fields To Complete

- Team name
- Team members
- Theme: public safety
- Solution summary
- Architecture and Claude usage
- Public app URL
- Demo video link if the app is not publicly accessible
