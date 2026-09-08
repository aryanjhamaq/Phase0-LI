# HTTP Status-Code Matrix — Employee Center Document Submission API

| Status | Code | Name             | Endpoint | When it occurs                                         | Response `status` value |
|--------|------|------------------|----------|--------------------------------------------------------|-------------------------|
| ✅ 201 | 201  | Created          | POST /api/submissions | Payload is valid; submission accepted and queued. Not on GET. | `success` |
| ✅ 200 | 200  | OK               | GET /api/submissions/{submissionId} | Submission found; current status returned. Not on POST. | `received` / `in-review` / `approved` / `rejected` |
| ❌ 400 | 400  | Bad Request      | POST /api/submissions | Body is not valid JSON, missing required fields, or field validation failed. | `validation-error` |
| ❌ 401 | 401  | Unauthorized     | POST and GET | No, missing, or expired API key / bearer token. | `unauthorized` |
| ❌ 404 | 404  | Not Found        | GET /api/submissions/{submissionId} | `submissionId` does not exist or is malformed. | `not-found` |
| ❌ 409 | 409  | Conflict         | POST /api/submissions | Duplicate submission (same request ID + document type already exists). | `conflict` |
| ❌ 500 | 500  | Internal Server Error | POST and GET | Unexpected server-side failure while processing the request. | `server-error` |

## Rules

- **Success codes:** POST → `201`; GET → `200`. They are never combined (a request
  returns exactly one of them).
- **Client errors (4xx):** 400 and 409 apply to POST only; 404 applies to GET only.
  401 applies to both.
- **Server error (500):** applies to both POST and GET.
- Every error response shares the same `ErrorEnvelope` shape
  (`status`, `message`, and — for 400 — `fieldErrors`).
- `submissionId` is issued only on a successful `201`; subsequent status lookups
  use that ID against the GET endpoint.

## Implementation status (mock server, `server.js`)

All codes in the matrix are returned by the mock except `401`:

- `POST /api/submissions` — `201` (stored in memory), `400`, `409`, `500`.
- `GET /api/submissions/{submissionId}` — `200`, `404`.
- `401` is reserved by the contract (auth is not enforced by the mock).
- Status lifecycle for a stored submission: `received` at creation,
  `in-review` after ~5 seconds, `approved` after ~60 seconds
  (`rejected` for request IDs whose number segment is `0000`, e.g. `REQ-2026-0000`).

## Quick reference by endpoint

| Endpoint | 200 | 201 | 400 | 401 | 404 | 409 | 500 |
|----------|-----|-----|-----|-----|-----|-----|-----|
| POST /api/submissions              | —   | ✔   | ✔   | ✔   | —   | ✔   | ✔   |
| GET /api/submissions/{submissionId} | ✔   | —   | —   | ✔   | ✔   | —   | ✔   |
