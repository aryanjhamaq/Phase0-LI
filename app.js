/* ============================================================
   Employee Center — form enhancement script
   JavaScript fundamentals + async/await + Fetch API.
   Owns client-side validation, dynamic options, file display,
   reset behavior, submission summary, and the mock API call.
   ============================================================ */

(function () {
    "use strict";

    /* ---------- Configuration ---------- */
    const form = document.getElementById("document-form");
    if (!form) {
        console.warn("Employee Center: could not find #document-form.");
        return;
    }

    // Single configuration point for the mock REST endpoint.
    // Change the url only on <form data-api-url="..."> in index.html.
    const API_URL = new URL(form.dataset.apiUrl);

    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
    const ALLOWED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "doc", "docx"];

    // Dynamic document-type options (populated into the <select> by app.js).
    const DOCUMENT_TYPES = Object.freeze([
        { value: "government-id", label: "Government-Issued ID" },
        { value: "passport", label: "Passport" },
        { value: "social-security", label: "Social Security Card" },
        { value: "tax-form", label: "Tax Form (W-4)" },
        { value: "direct-deposit", label: "Direct Deposit Authorization" },
        { value: "education-cert", label: "Education Certification" },
        { value: "emergency-contact", label: "Emergency Contact Form" },
        { value: "non-compete", label: "Non-Compete Agreement" }
    ]);

    // Validation rules keyed by field id.
    const FIELD_RULES = Object.freeze({
        "employee-name": {
            required: true,
            min: 2,
            max: 80,
            message: "Enter your full name (at least 2 characters)."
        },
        "request-id": {
            required: true,
            pattern: /^REQ-\d{4}-\d+$/i,
            message: "Request ID must use the REQ-YYYY-#### format (e.g. REQ-2026-0041)."
        },
        "document-type": {
            required: true,
            message: "Select the document type you are uploading."
        },
        "submission-date": {
            required: true,
            notInFuture: true,
            message: "Pick a submission date that is today or earlier."
        },
        "additional-notes": {
            max: 500,
            message: "Additional notes must be 500 characters or fewer."
        },
        "document-file": {
            required: true,
            message: "Attach a PDF, JPG, PNG, DOC, or DOCX file (max 10 MB)."
        },
        "consent": {
            required: true,
            message: "You must accept the consent declaration to submit."
        }
    });

    // Field id -> checklist item name.
    const CHECK_MAP = Object.freeze({
        "employee-name": "name",
        "request-id": "request",
        "document-type": "document-type",
        "submission-date": "date",
        "document-file": "file",
        "consent": "consent"
    });

    /* ---------- Cached DOM references ---------- */
    const elements = {
        documentType: document.getElementById("document-type"),
        documentFile: document.getElementById("document-file"),
        consent: document.getElementById("consent"),
        fileDisplay: document.getElementById("file-name"),
        submitButton: form.querySelector('button[type="submit"]'),
        resetButton: form.querySelector('button[type="reset"]'),
        statusBox: document.getElementById("form-status"),
        summaryBox: document.getElementById("submission-summary"),
        summaryList: document.getElementById("summary-list")
    };

    let isSubmitting = false;

    /* ---------- Helpers ---------- */
    function fieldValue(id) {
        const el = document.getElementById(id);
        if (!el) return null;
        return el.type === "checkbox" ? el.checked : String(el.value).trim();
    }

    function formatBytes(bytes) {
        const units = ["B", "KB", "MB"];
        let value = Number(bytes) || 0;
        let index = 0;
        while (value >= 1024 && index < units.length - 1) {
            value /= 1024;
            index += 1;
        }
        return value.toFixed(index === 0 ? 0 : 1) + " " + units[index];
    }

    function formatTimestamp(iso) {
        const date = new Date(iso);
        return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
    }

    function getDocumentTypeLabel(value) {
        const match = DOCUMENT_TYPES.find((type) => type.value === value);
        return match ? match.label : value;
    }

    /* ---------- Validation ---------- */
    function validateField(id) {
        const rules = FIELD_RULES[id];
        const errors = [];
        if (!rules) return { valid: true, errors };

        const value = fieldValue(id);

        if (rules.required) {
            let missing = false;
            if (id === "consent") {
                missing = value !== true;
            } else if (id === "document-file") {
                missing = !elements.documentFile.files.length;
            } else {
                missing = String(value).length === 0;
            }
            if (missing) errors.push(rules.message);
        }

        if (rules.pattern && value) {
            if (!rules.pattern.test(String(value))) errors.push(rules.message);
        }

        if (rules.min && value && String(value).length < rules.min) {
            errors.push(rules.message);
        }
        if (rules.max && value && String(value).length > rules.max) {
            errors.push(rules.message);
        }

        if (id === "submission-date" && value) {
            const parsed = new Date(value);
            if (Number.isNaN(parsed.getTime())) {
                errors.push("Enter a valid date.");
            } else if (rules.notInFuture && parsed.getTime() > Date.now()) {
                errors.push(rules.message);
            }
        }

        if (id === "document-file") {
            const file = elements.documentFile.files[0];
            if (file) {
                const extension = file.name.split(".").pop().toLowerCase();
                if (!ALLOWED_EXTENSIONS.includes(extension)) {
                    errors.push("File type not accepted.");
                }
                if (file.size > MAX_FILE_SIZE) {
                    errors.push("File exceeds the 10 MB limit.");
                }
            }
        }

        return { valid: errors.length === 0, errors };
    }

    // Map every field to its valid/invalid state for the checklist.
    function getStateMap() {
        const states = {};
        Object.keys(FIELD_RULES).forEach((id) => {
            states[id] = validateField(id).valid;
        });
        return states;
    }

    function updateChecklist(states) {
        Object.keys(CHECK_MAP).forEach((fieldId) => {
            const checkName = CHECK_MAP[fieldId];
            const item = document.querySelector('.check-item[data-check="' + checkName + '"]');
            if (!item) return;
            const complete = Boolean(states[fieldId]);
            item.classList.toggle("is-complete", complete);
            const status = item.querySelector(".check-status");
            if (status) status.textContent = complete ? "Complete" : "Pending";
        });
    }

    function setFieldError(id, message) {
        const input = document.getElementById(id);
        const group = input ? input.closest(".form-group") : null;
        if (!input || !group) return;

        let errorEl = group.querySelector(".error-message");

        if (message) {
            input.setAttribute("aria-invalid", "true");
            input.classList.add("is-invalid");
            if (!errorEl) {
                errorEl = document.createElement("p");
                errorEl.className = "error-message";
                group.appendChild(errorEl);
            }
            errorEl.id = "error-" + id;
            errorEl.textContent = message;
            input.setAttribute("aria-describedby", "error-" + id);
        } else {
            input.removeAttribute("aria-invalid");
            input.classList.remove("is-invalid");
            input.removeAttribute("aria-describedby");
            if (errorEl) errorEl.remove();
        }
    }

    function clearErrors() {
        Object.keys(FIELD_RULES).forEach((id) => setFieldError(id, ""));
    }

    // Builds the submission data as a plain JavaScript object.
    function buildData() {
        const file = elements.documentFile.files[0] || null;
        const documentType = fieldValue("document-type");
        return {
            employeeName: fieldValue("employee-name"),
            requestId: fieldValue("request-id"),
            documentType: documentType,
            documentTypeLabel: getDocumentTypeLabel(documentType),
            submissionDate: fieldValue("submission-date"),
            additionalNotes: fieldValue("additional-notes"),
            fileName: file ? file.name : "",
            fileSize: file ? file.size : 0,
            consent: fieldValue("consent") === true
        };
    }

    function validateForm() {
        const errors = {};
        let valid = true;
        Object.keys(FIELD_RULES).forEach((id) => {
            const result = validateField(id);
            if (!result.valid) {
                valid = false;
                errors[id] = result.errors[0];
            }
        });
        return { valid: valid, errors: errors, data: buildData() };
    }

    /* ---------- Status & summary UI ---------- */
    function setStatus(type, message) {
        elements.statusBox.hidden = false;
        elements.statusBox.className = "form-status status-" + type;
        elements.statusBox.replaceChildren();

        const content = document.createElement("div");
        if (type === "loading") {
            const spinner = document.createElement("span");
            spinner.className = "spinner";
            spinner.setAttribute("aria-hidden", "true");
            content.appendChild(spinner);
        }
        const text = document.createElement("span");
        text.textContent = message;
        content.appendChild(text);
        elements.statusBox.appendChild(content);
    }

    function hideStatus() {
        elements.statusBox.replaceChildren();
        elements.statusBox.hidden = true;
    }

    function renderSummary(data, response) {
        const rows = [
            ["Employee name", data.employeeName],
            ["Request ID", data.requestId],
            ["Document type", data.documentTypeLabel || data.documentType || "\u2014"],
            ["Submission date", data.submissionDate],
            ["Additional notes", data.additionalNotes || "None provided"],
            ["File", data.fileName || "\u2014"],
            ["File size", formatBytes(data.fileSize)],
            ["Consent", "Accepted"],
            ["Submission ID", response.submissionId || "\u2014"],
            ["Received", formatTimestamp(response.receivedAt)]
        ];

        elements.summaryList.replaceChildren();
        rows.forEach((row) => {
            const term = document.createElement("dt");
            const detail = document.createElement("dd");
            term.textContent = row[0];
            detail.textContent = row[1];
            elements.summaryList.append(term, detail);
        });
        elements.summaryBox.hidden = false;
    }

    function hideSummary() {
        elements.summaryBox.hidden = true;
        elements.summaryList.replaceChildren();
    }

    function setLoading(isLoading) {
        isSubmitting = isLoading;
        elements.submitButton.disabled = isLoading;
        form.classList.toggle("is-loading", isLoading);
        if (isLoading) hideSummary();
    }

    /* ---------- Mock API (async/await + Fetch API) ---------- */
    async function submitToServer(data) {
        setLoading(true);
        setStatus("loading", "Submitting your documents\u2026");

        try {
            const response = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data)
            });

            // Always try to parse a JSON envelope for error reporting.
            const payload = await response.json().catch(() => null);

            if (!response.ok) {
                if (response.status === 400 && payload && payload.fieldErrors) {
                    applyServerErrors(payload.fieldErrors);
                    setStatus("validation", payload.message || "The server rejected some fields.");
                } else {
                    setStatus(
                        "error",
                        (payload && payload.message) ||
                        "Server error (" + response.status + "). Please try again."
                    );
                }
                return;
            }

            setStatus("success", payload && payload.message ? payload.message : "Submission received.");
            renderSummary(data, payload || {});
            updateChecklist(getStateMap());
        } catch (networkError) {
            setStatus("error", "Unable to reach the server. Check your connection and try again.");
        } finally {
            setLoading(false);
        }
    }

    function applyServerErrors(fieldErrors) {
        Object.keys(fieldErrors).forEach((id) => {
            if (document.getElementById(id)) setFieldError(id, String(fieldErrors[id]));
        });
        updateChecklist(getStateMap());
    }

    /* ---------- Dynamic option population ---------- */
    function populateDocumentTypes() {
        DOCUMENT_TYPES.forEach((type) => {
            const option = document.createElement("option");
            option.value = type.value;
            option.textContent = type.label;
            elements.documentType.appendChild(option);
        });
    }

    /* ---------- File name display ---------- */
    function updateFileDisplay() {
        const file = elements.documentFile.files[0] || null;
        elements.fileDisplay.textContent = file
            ? "Selected: " + file.name + " (" + formatBytes(file.size) + ")"
            : "";
    }

    /* ---------- Events ---------- */
    function onFieldChanged(event) {
        const id = event.target && event.target.id;
        if (!id || !FIELD_RULES[id]) return;
        const result = validateField(id);
        setFieldError(id, result.errors.length ? result.errors[0] : "");
        updateChecklist(getStateMap());
    }

    function onFormSubmitted(event) {
        event.preventDefault();
        if (isSubmitting) return; // blocks duplicate submissions

        const result = validateForm();
        updateChecklist(getStateMap());

        if (!result.valid) {
            Object.keys(result.errors).forEach((id) => setFieldError(id, result.errors[id]));
            setStatus("validation", "Please fix the highlighted fields before submitting.");

            const firstInvalid = Object.keys(result.errors)[0];
            if (firstInvalid) {
                const target = document.getElementById(firstInvalid);
                if (target) {
                    target.focus();
                    target.scrollIntoView({ block: "center", behavior: "smooth" });
                }
            }
            return;
        }

        hideStatus();
        console.info("Employee Center: submitting document data \u2192", result.data);
        submitToServer(result.data);
    }

    function onFormReset() {
        // Runs after the native reset has cleared the fields.
        elements.documentFile.value = "";
        elements.fileDisplay.textContent = "";
        clearErrors();
        hideStatus();
        hideSummary();
        form.classList.remove("is-loading");
        isSubmitting = false;
        elements.submitButton.disabled = false;
        updateChecklist({});
    }

    /* ---------- Init ---------- */
    populateDocumentTypes();
    updateChecklist({});

    elements.documentFile.addEventListener("change", updateFileDisplay);
    form.addEventListener("input", onFieldChanged);
    form.addEventListener("change", onFieldChanged);
    form.addEventListener("submit", onFormSubmitted);
    form.addEventListener("reset", () => setTimeout(onFormReset, 0));
})();