"use strict";

/* ============================================================
   Mock REST endpoint for the Employee Center form.

   Serves:
     * static files (index.html, styles.css, app.js) from this folder
     * POST /api/submissions          — create a submission (mock API)
     * GET  /api/submissions/{id}     — retrieve a submission's status

   Successful submissions are kept in an in-memory Map so their
   status can be retrieved later by submissionId.

   To trigger the different states:
     * valid payload                      -> 201 success
     * duplicate (same requestId + documentType) -> 409 conflict
     * requestId = "REQ-9999-500"         -> 500 server-error
     * missing/invalid fields             -> 400 validation-error
     * GET of an unknown submission      -> 404 not-found
     * stored status lifecycle (mock):
         immediately        -> "received"
         after ~5 seconds   -> "in-review"
         after ~60 seconds  -> "approved"
       requestId with suffix "-0000" (e.g. REQ-2026-0000) -> "rejected"

   Run:  node server.js      (then open http://localhost:3000)
   Port / latency overrides:
     $env:PORT=3001; $env:MOCK_DELAY=2000; node server.js
   ============================================================ */

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const DELAY_MS = Number(process.env.MOCK_DELAY || 900);

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".json": "application/json; charset=utf-8",
    ".ico": "image/x-icon"
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sendJson(res, status, payload) {
    const body = JSON.stringify(payload, null, 2);
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end(body);
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let rawBody = "";
        req.on("data", (chunk) => {
            rawBody += chunk;
            if (rawBody.length > 1e6) req.destroy(new Error("Payload too large"));
        });
        req.on("end", () => {
            try {
                resolve(JSON.parse(rawBody || "{}"));
            } catch (err) {
                reject(new Error("Invalid JSON body"));
            }
        });
        req.on("error", reject);
    });
}

/* -------- Server-side mirror of the form validation -------- */
function validateSubmission(data) {
    const fieldErrors = {};

    const name = String(data.employeeName || "").trim();
    if (!name) fieldErrors["employee-name"] = "Employee name is required.";
    else if (name.length < 2) fieldErrors["employee-name"] = "Employee name must be at least 2 characters.";

    const requestId = String(data.requestId || "").trim();
    if (!requestId) fieldErrors["request-id"] = "Request ID is required.";
    else if (!/^REQ-\d{4}-\d+$/i.test(requestId)) {
        fieldErrors["request-id"] = "Request ID must use the REQ-YYYY-#### format.";
    }

    if (!String(data.documentType || "")) fieldErrors["document-type"] = "Document type is required.";

    const submissionDate = String(data.submissionDate || "");
    if (!submissionDate) fieldErrors["submission-date"] = "Submission date is required.";
    else if (Number.isNaN(Date.parse(submissionDate))) {
        fieldErrors["submission-date"] = "Submission date is not valid.";
    }

    const fileName = String(data.fileName || "");
    if (!fileName) {
        fieldErrors["document-file"] = "A document file is required.";
    } else {
        const extension = path.extname(fileName).slice(1).toLowerCase();
        const allowed = ["pdf", "jpg", "jpeg", "png", "doc", "docx"];
        if (!allowed.includes(extension)) fieldErrors["document-file"] = "File type not accepted.";
        if (Number(data.fileSize) > 10 * 1024 * 1024) fieldErrors["document-file"] = "File exceeds the 10 MB limit.";
    }

    if (data.consent !== true) fieldErrors["consent"] = "The consent declaration must be accepted.";

    return fieldErrors;
}

/* -------- In-memory submission store (mock persistence) -------- */
const submissions = new Map();

const STATUS_MESSAGES = Object.freeze({
    received: "Your documents were received and added to the review queue.",
    "in-review": "Your documents are currently under review.",
    approved: "Your documents were approved and processed.",
    rejected: "Your documents were rejected. See the review note for details."
});

// Mock lifecycle: a stored submission moves through states as time passes.
const PROGRESS_TO_IN_REVIEW_MS = 5000; // 5 seconds
const PROGRESS_TO_APPROVED_MS = 60000; // 60 seconds

function createSubmissionRecord(submissionId, requestId, documentType) {
    const rejectedDemo = /^REQ-\d{4}-0000$/i.test(requestId);
    const now = Date.now();
    return {
        submissionId: submissionId,
        requestId: requestId,
        documentType: documentType,
        status: rejectedDemo ? "rejected" : "received",
        createdAt: now,
        updatedAt: new Date(now).toISOString()
    };
}

// Derives the current status for a stored submission based on elapsed time.
// "rejected" and "approved" are terminal states and never move again.
function currentStatus(record, nowMs) {
    const age = nowMs - record.createdAt;

    if (
        record.status === "rejected" ||
        record.status === "approved" ||
        age < PROGRESS_TO_IN_REVIEW_MS
    ) {
        return { status: record.status, updatedAt: record.updatedAt };
    }

    if (age >= PROGRESS_TO_APPROVED_MS) {
        record.status = "approved";
        record.updatedAt = new Date(record.createdAt + PROGRESS_TO_APPROVED_MS).toISOString();
        return { status: record.status, updatedAt: record.updatedAt };
    }

    record.status = "in-review";
    record.updatedAt = new Date(record.createdAt + PROGRESS_TO_IN_REVIEW_MS).toISOString();
    return { status: record.status, updatedAt: record.updatedAt };
}

function handleGetStatus(req, res, submissionId) {
    if (!/^SUB-[A-Z0-9]{8}$/.test(submissionId)) {
        sendJson(res, 404, {
            status: "not-found",
            message: "No submission exists for the requested submissionId."
        });
        return;
    }

    const record = submissions.get(submissionId);
    if (!record) {
        sendJson(res, 404, {
            status: "not-found",
            message: "No submission exists for the requested submissionId."
        });
        return;
    }

    const current = currentStatus(record, Date.now());
    sendJson(res, 200, {
        submissionId: record.submissionId,
        status: current.status,
        message: STATUS_MESSAGES[current.status],
        updatedAt: current.updatedAt
    });
}

async function handleApi(req, res) {
    let data;
    try {
        data = await readJsonBody(req);
    } catch (err) {
        sendJson(res, 400, {
            status: "validation-error",
            message: "The request body is not valid JSON.",
            fieldErrors: {}
        });
        return;
    }

    await delay(DELAY_MS);

    const requestId = String(data.requestId || "").toUpperCase();
    if (requestId === "REQ-9999-500") {
        sendJson(res, 500, {
            status: "server-error",
            message: "Internal server error while processing the submission. Please try again later."
        });
        return;
    }

    const fieldErrors = validateSubmission(data);
    if (Object.keys(fieldErrors).length > 0) {
        sendJson(res, 400, {
            status: "validation-error",
            message: "The server rejected some fields.",
            fieldErrors: fieldErrors
        });
        return;
    }

    const duplicate = [...submissions.values()].some(
        (record) => record.requestId === requestId && record.documentType === String(data.documentType || "")
    );
    if (duplicate) {
        sendJson(res, 409, {
            status: "conflict",
            message: "A submission for this request ID and document type already exists."
        });
        return;
    }

    const submissionId = "SUB-" + Math.random().toString(36).slice(2, 10).toUpperCase();
    const record = createSubmissionRecord(submissionId, requestId, String(data.documentType || ""));
    submissions.set(submissionId, record);

    sendJson(res, 201, {
        status: "success",
        message: "Your documents were received and added to the review queue.",
        submissionId: submissionId,
        receivedAt: new Date().toISOString()
    });
}

function serveStatic(req, res, pathname) {
    const safePath = pathname === "/" ? "/index.html" : pathname;
    const filePath = path.normalize(path.join(ROOT, safePath));
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Forbidden");
        return;
    }
    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("Not found");
            return;
        }
        const extension = path.extname(filePath).toLowerCase();
        res.writeHead(200, { "Content-Type": MIME_TYPES[extension] || "application/octet-stream" });
        res.end(content);
    });
}

const server = http.createServer((req, res) => {
    if (req.method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
        });
        res.end();
        return;
    }

    const { pathname } = new URL(req.url, "http://localhost");

    if (pathname === "/api/submissions" && req.method === "POST") {
        handleApi(req, res);
        return;
    }

    const statusMatch = pathname.match(/^\/api\/submissions\/([^/]+)$/);
    if (req.method === "GET" && statusMatch) {
        handleGetStatus(req, res, decodeURIComponent(statusMatch[1]));
        return;
    }

    serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
    console.log("Mock API + static server running at http://localhost:" + PORT);
    console.log("  POST /api/submissions              (" + DELAY_MS + "ms latency)");
    console.log("  GET  /api/submissions/{submissionId}");
    console.log('  Use request ID "REQ-9999-500" to trigger a 500 server error.');
    console.log('  Use request ID suffix "-0000" to demo a "rejected" status.');
    console.log("  Statuses progress: received -> in-review (5s) -> approved (60s).");
});