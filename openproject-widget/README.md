# OpenProject Feedback Widget

A standalone, embeddable feedback widget that creates work packages in [OpenProject](https://www.openproject.org/). Built as a **Web Component** with a **React wrapper**, it can be dropped into any web project — plain HTML, React, Next.js, Vue, or anything that renders HTML.

The widget ships with its own **FastAPI backend** that handles the OpenProject API communication and optional file uploads via PocketBase.

---

## Table of Contents

- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Backend Setup](#backend-setup)
  - [Environment Variables](#backend-environment-variables)
  - [Running the Backend](#running-the-backend)
  - [API Endpoints](#api-endpoints)
- [Frontend Integration](#frontend-integration)
  - [Vanilla HTML / JavaScript](#vanilla-html--javascript)
  - [React](#react)
  - [Next.js (App Router / Turbopack)](#nextjs-app-router--turbopack)
  - [Vue / Other Frameworks](#vue--other-frameworks)
- [Widget Attributes / Props](#widget-attributes--props)
  - [General](#general)
  - [OpenProject Configuration Overrides](#openproject-configuration-overrides)
  - [React-only Callbacks](#react-only-callbacks)
- [Events](#events)
- [Backend URL Resolution](#backend-url-resolution)
- [File Uploads](#file-uploads)
- [CSS Customization](#css-customization)
- [Finding OpenProject Configuration Values](#finding-openproject-configuration-values)
- [Troubleshooting](#troubleshooting)

---

## Architecture

```
┌─────────────────────────────────┐
│  Your Web App (browser)         │
│  ┌───────────────────────────┐  │
│  │  <openproject-feedback-    │  │
│  │   widget>                  │  │  ── Web Component (Shadow DOM)
│  │  (or React wrapper)        │  │
│  └────────────┬──────────────┘  │
└───────────────┼─────────────────┘
                │  HTTP (JSON / multipart)
                ▼
┌───────────────────────────────────┐
│  Widget Backend (FastAPI :8787)   │
│  POST /api/v1/feedback            │──► OpenProject API (/api/v3/work_packages)
│  POST /api/v1/feedback/upload-file│──► PocketBase (file storage)
└───────────────────────────────────┘
```

The frontend widget collects user input and sends it to the **widget backend**. The backend creates a work package in OpenProject and optionally uploads attached files to PocketBase, keeping your OpenProject API token secure on the server side.

---

## Project Structure

```
openproject-widget/
├── backend/
│   ├── main.py              # FastAPI backend
│   ├── requirements.txt     # Python dependencies
│   └── env.example          # Example environment variables
├── src/
│   ├── widget.js            # Web Component (Shadow DOM)
│   ├── react.js             # React wrapper component
│   └── index.js             # Entry point (registers the custom element)
├── examples/
│   ├── vanilla.html         # Vanilla HTML usage example
│   └── react-usage.jsx      # React usage example
├── env.example              # Frontend env example
├── package.json
└── README.md
```

---

## Backend Setup

### Backend Environment Variables

Create a `.env` file inside `backend/` (copy from `backend/env.example`):

```env
# Server
PORT=8787
CORS_ORIGINS=http://localhost:3000,http://localhost:5500

# OpenProject (required)
OPENPROJECT_URL=http://localhost:8080
OPENPROJECT_API_TOKEN=your_api_token_here
OPENPROJECT_PROJECT_ID=3
OPENPROJECT_COLUMN_QUERY_ID=30
OPENPROJECT_PLATFORM_CUSTOM_FIELD_ID=2
OPENPROJECT_TALEP_SAHIBI_CUSTOM_FIELD_ID=3
OPENPROJECT_BIRIM_CUSTOM_FIELD_ID=4
OPENPROJECT_TYPE_ID=1
OPENPROJECT_VERIFY_SSL=false

# PocketBase file uploads (optional)
POCKETBASE_URL=http://localhost:8090
POCKETBASE_SAVE_URL=http://localhost:8090
POCKETBASE_ADMIN_EMAIL=admin@example.com
POCKETBASE_ADMIN_PASSWORD=your_password
```

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default: `8787`) |
| `CORS_ORIGINS` | No | Comma-separated allowed origins (default: `http://localhost:3000,http://localhost:5500`) |
| `OPENPROJECT_URL` | **Yes** | Your OpenProject instance URL |
| `OPENPROJECT_API_TOKEN` | **Yes** | API token (create in OpenProject → My Account → Access Tokens) |
| `OPENPROJECT_PROJECT_ID` | **Yes** | Target project ID for new work packages |
| `OPENPROJECT_COLUMN_QUERY_ID` | No | Board query ID for column ordering (optional board integration) |
| `OPENPROJECT_PLATFORM_CUSTOM_FIELD_ID` | **Yes** | Custom field ID for "Platform" |
| `OPENPROJECT_TALEP_SAHIBI_CUSTOM_FIELD_ID` | **Yes** | Custom field ID for "Talep Sahibi" (requester) |
| `OPENPROJECT_BIRIM_CUSTOM_FIELD_ID` | **Yes** | Custom field ID for "Birim" (department) |
| `OPENPROJECT_TYPE_ID` | No | Work package type ID (default: `1`) |
| `OPENPROJECT_VERIFY_SSL` | No | SSL verification for OpenProject calls (default: `false`) |
| `POCKETBASE_URL` | No | PocketBase URL (required only for file uploads) |
| `POCKETBASE_SAVE_URL` | No | Public-facing PocketBase URL for file links (defaults to `POCKETBASE_URL`) |
| `POCKETBASE_ADMIN_EMAIL` | No | PocketBase admin email (required for file uploads) |
| `POCKETBASE_ADMIN_PASSWORD` | No | PocketBase admin password (required for file uploads) |

### Running the Backend

```bash
cd openproject-widget/backend
pip install -r requirements.txt
python main.py
```

The API starts at `http://localhost:8787` (or the port you configured).

### API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check — returns `{"status": "ok"}` |
| `POST` | `/api/v1/feedback` | Submit feedback → creates an OpenProject work package |
| `POST` | `/api/v1/feedback/upload-file` | Upload a file → stores in PocketBase, returns the file URL |

#### `POST /api/v1/feedback` — Request Body

```json
{
  "subject": "Bug in dashboard",
  "platform": "MyPlatform",
  "talep_sahibi": "john.doe",
  "birim": "IT",
  "description": "Detailed description of the issue...",
  "attachments": ["https://pb.example.com/api/files/files/abc123/screenshot.png"],
  "openproject_config": {
    "openproject_url": "http://openproject.example.com",
    "openproject_api_token": "override_token",
    "openproject_project_id": 5,
    "openproject_type_id": 2
  }
}
```

- `subject`, `platform`, `talep_sahibi`, `birim`, `description` — **required**
- `attachments` — optional array of file URLs (from the upload endpoint)
- `openproject_config` — optional overrides; any field left out uses the backend's `.env` defaults

#### `POST /api/v1/feedback` — Response

```json
{
  "success": true,
  "message": "Geri bildirim başarıyla gönderildi.",
  "work_package_id": 142
}
```

#### `POST /api/v1/feedback/upload-file` — Request

Multipart form data with a single `file` field.

```bash
curl -X POST http://localhost:8787/api/v1/feedback/upload-file \
  -F "file=@screenshot.png"
```

#### `POST /api/v1/feedback/upload-file` — Response

```json
{
  "url": "http://localhost:8090/api/files/files/abc123/screenshot.png",
  "record_id": "abc123",
  "filename": "screenshot.png"
}
```

---

## Frontend Integration

### Vanilla HTML / JavaScript

The simplest way — just import the module and use the HTML tag:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Feedback Widget</title>
</head>
<body>

  <openproject-feedback-widget
    backend-base-url="http://localhost:8787"
    title="Send Feedback"
    subtitle="Report an issue or request a feature"
    platform-options="Platform A,Platform B,Platform C"
    default-platform="Platform A"
    default-owner="john.doe"
    default-birim="Engineering"
  ></openproject-feedback-widget>

  <script type="module">
    // Option 1: Import from source (if in same repo)
    import "./path-to/openproject-widget/src/index.js";

    // Option 2: Import from npm (if published)
    // import "openproject-feedback-widget";

    // Listen for events
    const widget = document.querySelector("openproject-feedback-widget");
    widget.addEventListener("opw-success", (e) => {
      console.log("Work package created:", e.detail.work_package_id);
    });
    widget.addEventListener("opw-error", (e) => {
      console.error("Submission failed:", e.detail.message);
    });
  </script>

</body>
</html>
```

You can serve this with any static file server:

```bash
# Python
python -m http.server 5500

# Node.js
npx serve -p 5500
```

### React

Import the React wrapper and use it like any React component:

```jsx
import { OpenProjectFeedbackWidgetReact } from "openproject-feedback-widget";
// Or from source: import { OpenProjectFeedbackWidgetReact } from "./path-to/openproject-widget/src/react.js";

export default function FeedbackPage() {
  return (
    <OpenProjectFeedbackWidgetReact
      backendBaseUrl="http://localhost:8787"
      title="Send Feedback"
      subtitle="Report an issue or request a feature"
      platformOptions="Platform A,Platform B,Platform C"
      defaultPlatform="Platform A"
      defaultOwner="john.doe"
      defaultBirim="Engineering"
      onSuccess={(data) => console.log("Created:", data.work_package_id)}
      onError={(err) => console.error("Failed:", err.message)}
      onClose={() => console.log("Widget closed")}
      onCancel={() => console.log("Form cancelled")}
    />
  );
}
```

### Next.js (App Router / Turbopack)

Next.js with Turbopack has known issues resolving local `file:` packages and raw ESM modules. The Web Component also uses `customElements.define()` at import time, which crashes during server-side rendering (SSR) because `customElements` doesn't exist on the server.

**The recommended approach is to copy the widget source into your project:**

**Step 1** — Copy two files into your project:

```
your-nextjs-app/
└── src/
    └── components/
        └── feedback/
            ├── openproject-widget.js      ← copy from openproject-widget/src/widget.js
            └── OpenProjectFeedbackWidgetReact.tsx   ← create new (see below)
```

**Step 2** — Create the SSR-safe React wrapper (`OpenProjectFeedbackWidgetReact.tsx`):

```tsx
"use client";

import React, { useEffect, useRef, useState } from "react";

// Dynamically import the Web Component only on the client
let WidgetClass: typeof HTMLElement | null = null;

interface OpenProjectFeedbackWidgetProps {
  submitUrl?: string;
  uploadUrl?: string;
  backendBaseUrl?: string;
  title?: string;
  subtitle?: string;
  platformOptions?: string;
  defaultPlatform?: string;
  defaultOwner?: string;
  defaultBirim?: string;
  openprojectUrl?: string;
  openprojectApiToken?: string;
  openprojectProjectId?: number;
  openprojectColumnQueryId?: number;
  openprojectPlatformCustomFieldId?: number;
  openprojectTalepSahibiCustomFieldId?: number;
  openprojectBirimCustomFieldId?: number;
  openprojectTypeId?: number;
  openprojectVerifySsl?: boolean;
  onSuccess?: (detail: any) => void;
  onError?: (detail: { message: string }) => void;
  onClose?: () => void;
  onCancel?: () => void;
}

export const OpenProjectFeedbackWidgetReact: React.FC<OpenProjectFeedbackWidgetProps> = (props) => {
  const {
    submitUrl, uploadUrl, backendBaseUrl, title, subtitle,
    platformOptions, defaultPlatform, defaultOwner, defaultBirim,
    openprojectUrl, openprojectApiToken, openprojectProjectId,
    openprojectColumnQueryId, openprojectPlatformCustomFieldId,
    openprojectTalepSahibiCustomFieldId, openprojectBirimCustomFieldId,
    openprojectTypeId, openprojectVerifySsl,
    onClose, onCancel, onSuccess, onError
  } = props;

  const ref = useRef<HTMLElement>(null);
  const [ready, setReady] = useState(false);

  // Register the custom element once, client-side only
  useEffect(() => {
    import("./openproject-widget").then(({ OpenProjectFeedbackWidget }) => {
      if (!customElements.get("openproject-feedback-widget")) {
        customElements.define("openproject-feedback-widget", OpenProjectFeedbackWidget);
      }
      WidgetClass = OpenProjectFeedbackWidget;
      setReady(true);
    });
  }, []);

  // Wire up event listeners
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const handleSuccess = (e: Event) => onSuccess?.((e as CustomEvent).detail);
    const handleError = (e: Event) => onError?.((e as CustomEvent).detail);
    const handleClose = () => onClose?.();
    const handleCancel = () => onCancel?.();
    el.addEventListener("opw-success", handleSuccess);
    el.addEventListener("opw-error", handleError);
    el.addEventListener("opw-close", handleClose);
    el.addEventListener("opw-cancel", handleCancel);
    return () => {
      el.removeEventListener("opw-success", handleSuccess);
      el.removeEventListener("opw-error", handleError);
      el.removeEventListener("opw-close", handleClose);
      el.removeEventListener("opw-cancel", handleCancel);
    };
  }, [onSuccess, onError, onClose, onCancel]);

  if (!ready) return null;

  return React.createElement("openproject-feedback-widget", {
    ref,
    "submit-url": submitUrl,
    "upload-url": uploadUrl,
    "backend-base-url": backendBaseUrl,
    title, subtitle,
    "platform-options": platformOptions,
    "default-platform": defaultPlatform,
    "default-owner": defaultOwner,
    "default-birim": defaultBirim,
    "openproject-url": openprojectUrl,
    "openproject-api-token": openprojectApiToken,
    "openproject-project-id": openprojectProjectId,
    "openproject-column-query-id": openprojectColumnQueryId,
    "openproject-platform-custom-field-id": openprojectPlatformCustomFieldId,
    "openproject-talep-sahibi-custom-field-id": openprojectTalepSahibiCustomFieldId,
    "openproject-birim-custom-field-id": openprojectBirimCustomFieldId,
    "openproject-type-id": openprojectTypeId,
    "openproject-verify-ssl": openprojectVerifySsl,
  });
};
```

**Step 3** — Use it in your page/component:

```tsx
"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { OpenProjectFeedbackWidgetReact } from "@/components/feedback/OpenProjectFeedbackWidgetReact";

export function FeedbackButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)}>Send Feedback</button>

      {open && createPortal(
        <div style={{ position: "fixed", bottom: 100, right: 48, zIndex: 9999 }}>
          <OpenProjectFeedbackWidgetReact
            backendBaseUrl={process.env.NEXT_PUBLIC_OPENPROJECT_WIDGET_BACKEND_BASE_URL}
            title="Send Feedback"
            platformOptions="Platform A,Platform B"
            onClose={() => setOpen(false)}
            onCancel={() => setOpen(false)}
            onSuccess={() => setTimeout(() => setOpen(false), 900)}
          />
        </div>,
        document.body
      )}
    </>
  );
}
```

**Step 4** — Add the backend URL to your `.env.local`:

```env
NEXT_PUBLIC_OPENPROJECT_WIDGET_BACKEND_BASE_URL=http://localhost:8787
```

> **Why copy instead of `npm install`?** Next.js Turbopack has issues resolving local `file:` symlinked packages on Windows, and the widget uses `customElements.define()` at module scope which crashes during SSR. Copying the source avoids both problems. Once the widget is published to npm as a pre-built package, a simple `npm install` will work.

### Vue / Other Frameworks

Since the widget is a standard Web Component, it works in any framework that renders HTML:

```vue
<template>
  <openproject-feedback-widget
    backend-base-url="http://localhost:8787"
    title="Send Feedback"
    platform-options="Platform A,Platform B"
    default-owner="john.doe"
    @opw-success="onSuccess"
    @opw-error="onError"
  />
</template>

<script setup>
import "openproject-feedback-widget"; // or import from local path

function onSuccess(e) {
  console.log("Created:", e.detail.work_package_id);
}
function onError(e) {
  console.error("Failed:", e.detail.message);
}
</script>
```

---

## Widget Attributes / Props

### General

| HTML Attribute | React Prop | Type | Description |
|---|---|---|---|
| `backend-base-url` | `backendBaseUrl` | `string` | Base URL of the widget backend (e.g. `http://localhost:8787`) |
| `submit-url` | `submitUrl` | `string` | Override the feedback submission endpoint (default: `{backendBaseUrl}/api/v1/feedback`) |
| `upload-url` | `uploadUrl` | `string` | Override the file upload endpoint (default: `{backendBaseUrl}/api/v1/feedback/upload-file`) |
| `title` | `title` | `string` | Header title text |
| `subtitle` | `subtitle` | `string` | Header subtitle text |
| `platform-options` | `platformOptions` | `string` | Comma-separated list of platform names for the dropdown |
| `default-platform` | `defaultPlatform` | `string` | Pre-selected platform value |
| `default-owner` | `defaultOwner` | `string` | Pre-filled requester name (hidden field) |
| `default-birim` | `defaultBirim` | `string` | Pre-filled department name (hidden field) |

### OpenProject Configuration Overrides

These attributes let you override the backend's `.env` settings per-widget instance. Useful when different widgets target different OpenProject projects.

| HTML Attribute | React Prop | Type |
|---|---|---|
| `openproject-url` | `openprojectUrl` | `string` |
| `openproject-api-token` | `openprojectApiToken` | `string` |
| `openproject-project-id` | `openprojectProjectId` | `number` |
| `openproject-column-query-id` | `openprojectColumnQueryId` | `number` |
| `openproject-platform-custom-field-id` | `openprojectPlatformCustomFieldId` | `number` |
| `openproject-talep-sahibi-custom-field-id` | `openprojectTalepSahibiCustomFieldId` | `number` |
| `openproject-birim-custom-field-id` | `openprojectBirimCustomFieldId` | `number` |
| `openproject-type-id` | `openprojectTypeId` | `number` |
| `openproject-verify-ssl` | `openprojectVerifySsl` | `boolean` |

> **Priority**: If an OpenProject attribute is provided on the widget, it overrides the backend `.env` value for that request. If not provided, the backend defaults are used.

### React-only Callbacks

| Prop | Type | Description |
|---|---|---|
| `onSuccess` | `(detail: { success: boolean, message: string, work_package_id: number }) => void` | Fired on successful submission |
| `onError` | `(detail: { message: string }) => void` | Fired on submission failure |
| `onClose` | `() => void` | Fired when the close button (×) is clicked |
| `onCancel` | `() => void` | Fired when the cancel button is clicked |

---

## Events

The Web Component dispatches these custom events (use `addEventListener` in vanilla JS or the React callbacks above):

| Event | Detail | When |
|---|---|---|
| `opw-success` | `{ success: true, message: string, work_package_id: number }` | Work package created successfully |
| `opw-error` | `{ message: string }` | Submission or upload failed |
| `opw-close` | — | Close button (×) clicked |
| `opw-cancel` | — | Cancel button clicked / form reset |

---

## Backend URL Resolution

The widget determines where to send requests using this priority chain:

| Priority | Source | Example |
|---|---|---|
| 1 | `backend-base-url` attribute / `backendBaseUrl` prop | `<widget backend-base-url="https://api.example.com">` |
| 2 | `globalThis.__OPENPROJECT_WIDGET_ENV__.OPENPROJECT_WIDGET_BACKEND_BASE_URL` | Runtime injection |
| 3 | `process.env.OPENPROJECT_WIDGET_BACKEND_BASE_URL` | Bundler env (Node/Webpack) |
| 3 | `process.env.NEXT_PUBLIC_OPENPROJECT_WIDGET_BACKEND_BASE_URL` | Next.js env |
| 3 | `process.env.VITE_OPENPROJECT_WIDGET_BACKEND_BASE_URL` | Vite env |
| 4 | `window.OPENPROJECT_WIDGET_API_BASE_URL` | Global variable |
| 5 | Same host, port `8787` | Automatic fallback (e.g. `http://localhost:8787`) |

> **Tip**: For most setups, just pass `backend-base-url` as an attribute and you're done.

---

## File Uploads

File uploads are **optional**. If users attach files in the widget, they are uploaded to **PocketBase** via the backend's `/api/v1/feedback/upload-file` endpoint. The returned URLs are then included in the `attachments` array of the feedback submission.

To enable file uploads, configure the PocketBase variables in your backend `.env`:

```env
POCKETBASE_URL=http://localhost:8090
POCKETBASE_SAVE_URL=http://localhost:8090
POCKETBASE_ADMIN_EMAIL=admin@example.com
POCKETBASE_ADMIN_PASSWORD=your_password
```

PocketBase must have a collection named `files` with a `document` file field.

If PocketBase is not configured, the upload button still appears but uploads will return a `500` error. The feedback form itself (without attachments) will still work.

---

## CSS Customization

The widget uses **Shadow DOM**, so external styles don't leak in. However, you can customize the look via **CSS custom properties** (variables) on the host element:

```css
openproject-feedback-widget {
  --opw-primary: #6b8ce6;        /* Primary accent color */
  --opw-primary-dark: #526ec7;   /* Darker primary (hover states) */
  --opw-header-start: #2b4da3;   /* Header gradient start */
  --opw-header-end: #f36f21;     /* Header gradient end */
  --opw-text: #2f3b52;           /* Main text color */
  --opw-muted: #8b95a7;          /* Muted/hint text color */
  --opw-border: #d9dee8;         /* Border color */
  --opw-bg: #ffffff;             /* Background color */
  --opw-danger: #b91c1c;         /* Error text color */
}
```

You can also control the widget's width:

```css
openproject-feedback-widget {
  max-width: 500px;   /* default is 420px */
}
```

---

## Finding OpenProject Configuration Values

| Variable | Where to Find |
|---|---|
| `OPENPROJECT_URL` | Your OpenProject instance URL (e.g. `https://openproject.yourcompany.com`) |
| `OPENPROJECT_API_TOKEN` | OpenProject → **My Account** → **Access Tokens** → Generate a new API token |
| `OPENPROJECT_PROJECT_ID` | Open your project in OpenProject → the ID is in the URL: `/projects/{id}`, or go to **Admin → Projects** |
| `OPENPROJECT_TYPE_ID` | **Admin → Types** → click on a type → ID is in the URL |
| `OPENPROJECT_COLUMN_QUERY_ID` | Open a **Board** view → the query ID is in the URL: `/boards/{id}` |
| `OPENPROJECT_PLATFORM_CUSTOM_FIELD_ID` | **Admin → Custom Fields** → click on the "Platform" field → ID is in the URL |
| `OPENPROJECT_TALEP_SAHIBI_CUSTOM_FIELD_ID` | **Admin → Custom Fields** → click on the "Talep Sahibi" field → ID is in the URL |
| `OPENPROJECT_BIRIM_CUSTOM_FIELD_ID` | **Admin → Custom Fields** → click on the "Birim" field → ID is in the URL |

You can also query the OpenProject API directly:

```bash
# List projects
curl -u apikey:YOUR_TOKEN https://your-openproject.com/api/v3/projects

# List types
curl -u apikey:YOUR_TOKEN https://your-openproject.com/api/v3/types

# List custom fields for a project
curl -u apikey:YOUR_TOKEN https://your-openproject.com/api/v3/projects/YOUR_PROJECT_ID/available_assignees
```

---

## Troubleshooting

### `Module not found` in Next.js / Turbopack

Next.js Turbopack has issues resolving local `file:` symlinked packages on Windows. **Solution**: Copy `widget.js` into your project and use the local React wrapper approach described in the [Next.js section](#nextjs-app-router--turbopack).

### `customElements is not defined` (SSR crash)

The widget registers a custom element at import time. During SSR, the `customElements` API doesn't exist. **Solution**: Use dynamic imports with a client-side guard (`typeof window !== 'undefined'`), as shown in the Next.js wrapper example.

### `CORS` errors

Make sure the widget backend's `CORS_ORIGINS` env variable includes your frontend's origin:

```env
CORS_ORIGINS=http://localhost:3000,https://your-app.com
```

### `OPENPROJECT_API_TOKEN is not configured`

The backend can't find the API token. Make sure:
1. You have a `.env` file in the `backend/` directory
2. `python-dotenv` is installed (`pip install python-dotenv`)
3. The `.env` file contains `OPENPROJECT_API_TOKEN=your_actual_token`

### File upload fails with `PocketBase upload settings are not fully configured`

All four PocketBase variables must be set: `POCKETBASE_URL`, `POCKETBASE_SAVE_URL`, `POCKETBASE_ADMIN_EMAIL`, `POCKETBASE_ADMIN_PASSWORD`.

### Widget doesn't appear / is invisible

The widget defaults to `display: block` with `max-width: 420px`. Make sure the parent container is visible and has dimensions. If using the `onClose` handler, note that the widget sets `this.style.display = "none"` — you may want to control visibility from the parent instead.
