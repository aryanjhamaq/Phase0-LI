# Employee Center — New Hire Document Submission

A self-contained HR onboarding portal for new-hire document submission. It combines a
responsive, accessible front end (HTML + CSS + vanilla JavaScript running the Fetch API)
with a Node.js mock REST backend and a formal OpenAPI contract.

> **No build tools, frameworks, or package dependencies.** Everything runs on the Node.js
> standard library and plain browser APIs, so the project can be cloned and launched with a
> single command.

---

## Table of Contents

- [Features](#features)
- [How It Works](#how-it-works)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Requirements](#requirements)
  - [Run the server](#run-the-server)
  - [Configuration overrides](#configuration-overrides)
- [The Document Submission Form](#the-document-submission-form)
- [Validation Rules](#validation-rules)
- [API Contract](#api-contract)
  - [POST `/api/submissions` (Submit a document)](#post-apisubmissions-submit-a-document)
  - [GET `/api/submissions/{submissionId}` (Retrieve status)](#get-apisubmissionssubmissionid-retrieve-status)
  - [Response envelopes](#response-envelopes)
  - [Status-code matrix](#status-code-matrix)
- [Testing the Mock API](#testing-the-mock-api)
  - [201 success](#201-success)
  - [400 validation error](#400-validation-error)
  - [500 server error](#500-server-error)
- [Server mock triggers](#server-mock-triggers)
- [Contributing and Extending](#contributing-and-extending)
- [Screenshots](#screenshots)

---

## Features

- **Dynamic document-type dropdown** — list of accepted document categories populated at
  runtime from a single configuration object in `app.js`.
- **Client-side validation** — per-field rules (required, min/max length, regex patterns,
  no-future-date, allowed file extensions, 10 MB size cap, consent checkbox) with inline
  error messages and `aria-invalid` / `aria-describedby` wiring.
- **Live validation checklist** — a sticky sidebar updates a `Pending` / `Complete`
  checklist in real time as fields are filled.
- **Async form submission** — `async`/`await` + `fetch()` posts a JSON payload to the mock
  API with a loading spinner, duplicate-submit guard, and disabled button while in flight.
- **Submission summary** — on success, a read-only summary of the submission (including the
  server-issued `submissionId` and `receivedAt` timestamp) is rendered in the sidebar.
- **Server-side validation mirror** — the mock server revalidates the payload so the API
  rejects anything the form lets through, and its `fieldErrors` map is rendered back onto
  the correct fields.
- **Accessibility & responsive design** — visible focus rings, ARIA live regions, semantic
  markup, and a mobile-first layout that collapses the two-column grid on small screens.
- **OpenAPI contract** — machine-readable spec plus matched sample request/response JSON and
  an HTTP status-code matrix.

---

## How It Works

```
Browser (index.html + app.js)
        │  user fills the form
        │  app.js validates client-side  (FIELD_RULES)
        ▼
        │  POST /api/submissions           JSON body
        ▼
Node.js mock server (server.js)
        │  parses body → server-side validateSubmission() mirror
        │  └─ valid            → 201 { status, message, submissionId, receivedAt }
        │  └─ invalid fields   → 400 { status: "validation-error", fieldErrors }
        │  └─ REQ-9999-500     → 500 { status: "server-error" }
        ▼
    app.js renders status banner / inline field errors / summary
```

The front end never performs the actual submission itself — it delegates to the mock REST
endpoint. The API contract for that endpoint (plus a GET status-retrieval endpoint) lives in
[`api/openapi.yaml`](api/openapi.yaml).

---

## Project Structure

| Path | Description |
| --- | --- |
| `index.html` | Single-page DOM: header, nav, form card, validation sidebar, footer. |
| `styles.css` | Modular stylesheet — design tokens, layout, components, states, responsive rules. No inline styles. |
| `app.js` | All client logic: validation, dynamic options, file display, checklist, submit/reset, and the Fetch API call. |
| `server.js` | Zero-dependency Node.js mock server (static file host + `POST /api/submissions`). |
| `SS1.png`, `SS2.png` | Screenshots of the rendered application. |
| `api/openapi.yaml` | OpenAPI 3.0.3 contract for `POST` submission and `GET` status retrieval. |
| `api/status-codes.md` | HTTP status-code matrix and per-endpoint quick reference. |
| `api/samples/` | Sample request/response JSON that match the contract schemas. |

---

## Getting Started

### Requirements

- [Node.js](https://nodejs.org/) 12+ (any recent LTS works — only `http`, `fs`, `path` are used).

### Run the server

```powershell
node server.js
```

Then open **http://localhost:3000** in your browser.

The console confirms the mock is up:

```
Mock API + static server running at http://localhost:3000
  POST /api/submissions  (mock latency: 900ms)
  Use request ID "REQ-9999-500" to trigger a 500 server error.
```

### Configuration overrides

Both knobs are environment variables read at startup:

| Variable | Default | Effect |
| --- | --- | --- |
| `PORT` | `3000` | Port the server listens on. |
| `MOCK_DELAY` | `900` | Artificial latency (ms) added to every `/api/submissions` call. |

```powershell
$env:PORT = 3001; $env:MOCK_DELAY = 2000; node server.js
```

---

## The Document Submission Form

Required fields (enforced on both client and server):

| Field | Type | Notes |
| --- | --- | --- |
| Employee Name | text | 2–80 characters. |
| Request ID | text | Must match `REQ-YYYY-####` (e.g. `REQ-2026-0041`). |
| Document Type | select | Populated at runtime; see `DOCUMENT_TYPES` in `app.js`. |
| Submission Date | date | Required; must not be in the future. |
| Additional Notes | textarea | Optional, ≤ 500 characters. |
| Document Upload | file | PDF, JPG, JPEG, PNG, DOC, DOCX — max 10 MB. |
| Consent | checkbox | Must be checked to submit. |

Accepted document types: `government-id`, `passport`, `social-security`, `tax-form`,
`direct-deposit`, `education-cert`, `emergency-contact`, `non-compete`.

---

## Validation Rules

Validation is defined once client-side in `FIELD_RULES` (app.js) and mirrored server-side in
`validateSubmission()` (server.js). Keeping both in sync is intentional — the server is the
source of truth and never trusts the client.

| Rule | Client (app.js) | Server (server.js) |
| --- | --- | --- |
| Required fields | `FIELD_RULES[].required` | `validateSubmission()` |
| Name 2–80 chars | `min` / `max` | `name.length` checks |
| Request ID regex `^REQ-\d{4}-\d+$` | `pattern` | `/^REQ-\d{4}-\d+$/i` |
| Date not in future | `notInFuture` | `Date.parse` validity only |
| File extension allow-list | `ALLOWED_EXTENSIONS` | allowed extension array |
| File ≤ 10 MB | `MAX_FILE_SIZE` | `10 * 1024 * 1024` |
| Consent must be `true` | `required` on checkbox | `data.consent !== true` |

When the server returns `400` with a `fieldErrors` object, `applyServerErrors()`
renders each message onto the matching form field and refreshes the checklist.

---

## API Contract

The formal contract is defined in [**Official OpenAPI 3.0 spec**](api/openapi.yaml).
It covers two operations:

### POST `/api/submissions` (Submit a document)

Creates a new submission in the review queue.

**Request body** (`application/json`):

```json
{
  "employeeName": "Jordan Rivera",
  "requestId": "REQ-2026-0041",
  "documentType": "tax-form",
  "submissionDate": "2026-09-08",
  "additionalNotes": "W-4 reflects new home address.",
  "fileName": "w4-2026.pdf",
  "fileSize": 245760,
  "consent": true
}
```

Required: `employeeName`, `requestId`, `documentType`, `submissionDate`, `fileName`,
`consent`. Optional: `additionalNotes`, `fileSize`.

**201 Created — success:**

```json
{
  "status": "success",
  "message": "Your documents were received and added to the review queue.",
  "submissionId": "SUB-1A2B3C4D",
  "receivedAt": "2026-09-08T14:32:05.000Z"
}
```

### GET `/api/submissions/{submissionId}` (Retrieve status)

Returns the current lifecycle state of a previously submitted document. `submissionId`
matches the one issued in the `201` response (`^SUB-[A-Z0-9]{8}$`).

**200 OK — states:** `received` · `in-review` · `approved` · `rejected`

```json
{
  "submissionId": "SUB-1A2B3C4D",
  "status": "in-review",
  "message": "Your documents are currently under review.",
  "updatedAt": "2026-09-08T15:10:00.000Z"
}
```

### Response envelopes

Every error response uses the same `ErrorEnvelope` shape:

```json
{
  "status": "validation-error | unauthorized | not-found | conflict | server-error",
  "message": "Human-readable description"
}
```

The `400` response also includes a `fieldErrors` map keyed by field id.

### Status-code matrix

| Code | Meaning | Endpoint | Applies when |
| --- | --- | --- | --- |
| `200` | OK | GET only | Submission found; current status returned. |
| `201` | Created | POST only | Payload valid; submission queued. |
| `400` | Bad Request | POST only | Invalid JSON, missing/invalid fields. |
| `401` | Unauthorized | POST + GET | Missing/expired API key or token. |
| `404` | Not Found | GET only | `submissionId` doesn't exist. |
| `409` | Conflict | POST only | Duplicate submission already exists. |
| `500` | Internal Server Error | POST + GET | Unexpected server failure. |

Full detail (with per-endpoint matrix) in [`api/status-codes.md`](api/status-codes.md).

---

## Testing the Mock API

Each response state can be triggered directly. Perform valid payload → `201`; send a body
with missing/invalid fields → `400`; use request ID `REQ-9999-500` → `500`.

### 201 success

```powershell
$body = '{"employeeName":"Test User","requestId":"REQ-2026-0001","documentType":"passport","submissionDate":"2026-09-08","fileName":"passport.pdf","fileSize":1024,"consent":true}'
Invoke-RestMethod -Uri http://localhost:3000/api/submissions -Method Post -ContentType "application/json" -Body $body
```

### 400 validation error

```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/submissions -Method Post -ContentType "application/json" -Body '{"employeeName":"A"}'
# -> status: validation-error, fieldErrors populated
```

### 500 server error

```powershell
$body = '{"employeeName":"Test User","requestId":"REQ-9999-500","documentType":"passport","submissionDate":"2026-09-08","fileName":"passport.pdf","fileSize":1024,"consent":true}'
try { Invoke-RestMethod -Uri http://localhost:3000/api/submissions -Method Post -ContentType "application/json" -Body $body }
catch { $_.Exception.Response.StatusCode }  # 500
```

> The mock implements both `POST /api/submissions` and
> `GET /api/submissions/{submissionId}`. Successful submissions are stored in memory;
> status `400`/`409`/`500` are triggered via invalid payloads, duplicate submissions, or the
> `REQ-9999-500` request ID. See [Server mock triggers](#server-mock-triggers) below.

---

## Server mock triggers

The mock keeps successful submissions in an in-memory `Map` and simulates a lifecycle:

| Trigger | Result |
| --- | --- |
| Valid payload → `POST` | `201`, `submissionId` issued (form: `SUB-XXXXXXXX`). |
| Same `requestId` + `documentType` again | `409` Conflict. |
| `requestId` = `REQ-9999-500` | `500` Internal Server Error. |
| Missing/invalid fields | `400` with `fieldErrors`. |
| `GET /api/submissions/{submissionId}` on a stored ID | `200` with current status. |
| `GET` on an unknown/malformed ID | `404` `not-found`. |
| Status lifecycle (from creation) | `received` → `in-review` (after ~5s) → `approved` (after ~60s). |
| `requestId` with number segment `0000` (e.g. `REQ-2026-0000`) | Stored as `rejected`. |

### GET — 200 status retrieval

```powershell
$created = Invoke-RestMethod -Uri http://localhost:3000/api/submissions -Method Post -ContentType "application/json" -Body $body
$created.submissionId                                # e.g. SUB-XXXXXXX
Invoke-RestMethod -Uri "http://localhost:3000/api/submissions/$($created.submissionId)"
# -> submissionId, status, message, updatedAt
```

### GET — 404 unknown submission

```powershell
try { Invoke-RestMethod -Uri http://localhost:3000/api/submissions/SUB-ZZZZZZZZ }
catch { $_.Exception.Response.StatusCode }            # 404
```

---

## Contributing and Extending

- **Real backend** — replace the mock handler with a persistence layer (DB / object store)
  and keep the response shapes identical to the contract so the front end needs no changes.
- **Auth** — the contract reserves `401`; add a bearer-token/API-key check in the handler.
- **Run the spec** — validate or drive the contract with any OpenAPI toolchain
  (e.g. Swagger UI, Redoc, or a schema linter) using `api/openapi.yaml`.

---

## Screenshots

`SS1.png` and `SS2.png` capture the rendered application (form view and validation-sidebar
states). [New commits to this file may want to embed the screenshots in this section.]