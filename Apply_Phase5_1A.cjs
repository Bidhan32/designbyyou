"use strict";

/**
 * DesignByYou Phase 5.1A - PRIVATE Fashion Editor design snapshots for P2P commission bookings
 * Run in project root: node Apply_Phase5_1A.cjs --check
 *                      node Apply_Phase5_1A.cjs --apply
 *
 * No dependencies. Verifies all expected anchors before writing. Creates OS temporary backup.
 * Requires previously migrated public.booking_design_snapshots table.
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
if (!apply && !args.includes("--check")) {
  console.error("Usage: node Apply_Phase5_1A.cjs --check  OR  --apply");
  process.exit(2);
}
const repo = process.cwd();

function chooseFile(folder, requiredName) {
  const abs = path.join(repo, folder);
  if (!fs.existsSync(abs)) throw new Error(`Missing folder: ${abs}`);
  const files = fs.readdirSync(abs);
  const match = files.find((entry) => entry.toLowerCase() === requiredName.toLowerCase());
  if (!match) throw new Error(`Missing ${requiredName} in ${abs}`);
  return path.join(abs, match);
}
function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  const last = source.lastIndexOf(needle);
  if (first === -1 || first !== last) throw new Error(`${label}: required anchor is missing or duplicated; no files changed.`);
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}
function assert(condition, text) { if (!condition) throw new Error(text); }

function patchController(original) {
  const originalUsesCrlf = original.includes("\r\n");
  original = original.replace(/\r\n/g, "\n");
  assert(!original.includes("exports.getBookingDesignSnapshot ="), "Phase 5.1A looks already applied: snapshot handler exists.");
  let s = original;

  // A) Existing booking retry must reference the exact same editor snapshot.
  const retryNeedle = 'async function returnExistingBookingResponse(res, booking, context) {\n  if (!bookingMatchesCreationRequest(booking, context)) {';
  const retryReplacement = `async function returnExistingBookingResponse(res, booking, context) {
  if (!bookingMatchesCreationRequest(booking, context)) {`;
  s = replaceOnce(s, retryNeedle, retryReplacement, "retry function");
  const retryCheckAnchor = `  if (!booking.stripe_payment_intent_id) {`;
  const retryCheck = `  // A booking retry must not silently swap a private Editor design (or version).
  // This also prevents a request without a design from reusing a design-linked booking.
  const snapshotReference = await db.query(
    \`SELECT source_editor_project_id, source_project_version
       FROM public.booking_design_snapshots
       WHERE booking_id = $1::uuid LIMIT 1\`,
    [booking.id],
  );
  const savedSnapshot = snapshotReference.rows[0] || null;
  const sameEditorAttachment = context.editorProjectId
    ? Boolean(
        savedSnapshot &&
        String(savedSnapshot.source_editor_project_id) === context.editorProjectId &&
        Number(savedSnapshot.source_project_version) === context.editorProjectVersion
      )
    : !savedSnapshot;
  if (!sameEditorAttachment) {
    return sendError(res, 409,
      "This client_request_id already belongs to a booking with a different Editor design snapshot.",
      "CLIENT_REQUEST_ID_REUSED");
  }

`;
  // Scopes insertion specifically to returnExistingBookingResponse rather than other occurrences.
  const retryStart = s.indexOf('async function returnExistingBookingResponse(');
  const retryEnd = s.indexOf('async function cancelPaymentIntentQuietly(', retryStart);
  assert(retryStart >= 0 && retryEnd > retryStart, "Unable to identify retry function bounds");
  const retryPart = s.slice(retryStart, retryEnd);
  assert(retryPart.includes(retryCheckAnchor), "Missing Stripe context guard in retry handler");
  s = s.slice(0, retryStart) + replaceOnce(retryPart, retryCheckAnchor, retryCheck + retryCheckAnchor, "retry attachment guard") + s.slice(retryEnd);

  // B) Read optional Editor reference; do not reinterpret the legacy designs UUID.
  const inputsAnchor = '  const bookingType = normalizeBookingType(req.body?.booking_type, designId);\n';
  const inputsInsert = `  // Phase 5.1A: both Editor fields must be supplied together. The ID is BIGINT,
  // NOT bookings.design_id (UUID). Require a decimal string to avoid JS precision loss.
  const body = req.body || {};
  const editorIdSupplied = Object.prototype.hasOwnProperty.call(body, "editor_project_id");
  const editorVersionSupplied = Object.prototype.hasOwnProperty.call(body, "editor_project_version");
  const editorProjectId = editorIdSupplied && typeof body.editor_project_id === "string"
    ? body.editor_project_id.trim() : null;
  const editorProjectVersion = editorVersionSupplied ? Number(body.editor_project_version) : null;
`;
  s = replaceOnce(s, inputsAnchor, inputsAnchor + '\n' + inputsInsert, "booking request input");

  const validationAnchor = '  const bookingId = clientRequestId;\n';
  const validationInsert = `  if (editorIdSupplied !== editorVersionSupplied) {
    return sendError(res, 400, "editor_project_id and editor_project_version must be provided together.",
      "EDITOR_PROJECT_REFERENCE_REQUIRED");
  }
  if (editorIdSupplied) {
    const isValidBigint = editorProjectId && /^[1-9]\\d{0,18}$/.test(editorProjectId) &&
      BigInt(editorProjectId) <= 9223372036854775807n;
    if (!isValidBigint || !Number.isInteger(editorProjectVersion) ||
        editorProjectVersion < 1 || editorProjectVersion > 2147483647) {
      return sendError(res, 400, "A valid numeric Editor project ID and version are required.",
        "INVALID_EDITOR_PROJECT_REFERENCE");
    }
    if (bookingType !== "commission" || designId) {
      return sendError(res, 400,
        "Private Editor designs can only accompany commission bookings without design_id.",
        "INVALID_EDITOR_BOOKING_TYPE");
    }
  }

`;
  s = replaceOnce(s, validationAnchor, validationInsert + validationAnchor, "booking request validation");
  const contextAnchor = '    bookingType,\n  };\n\n  let paymentIntent = null;';
  s = replaceOnce(s, contextAnchor, '    bookingType,\n    editorProjectId,\n    editorProjectVersion,\n  };\n\n  let paymentIntent = null;', "booking idempotency context");

  // C) Cheap preliminary owner/version check before any external Stripe commitment.
  const preCheckAnchor = '    const userResult = await db.query(\n';
  const preCheck = `    // Reject missing, foreign, or stale projects BEFORE creating a Stripe PaymentIntent.
    // The same reference is checked again under a database lock in the transaction.
    if (editorProjectId) {
      const projectCheck = await db.query(
        \`SELECT id, version FROM public.editor_projects
         WHERE id = $1::bigint AND owner_id = $2::uuid LIMIT 1\`,
        [editorProjectId, creatorId],
      );
      if (!projectCheck.rows.length) {
        return sendError(res, 404, "This Fashion Editor project is not available to your account.",
          "EDITOR_PROJECT_NOT_FOUND");
      }
      if (Number(projectCheck.rows[0].version) !== editorProjectVersion) {
        return sendError(res, 409, "The Fashion Editor project has changed. Save and retry the booking.",
          "EDITOR_PROJECT_VERSION_CONFLICT");
      }
    }

`;
  s = replaceOnce(s, preCheckAnchor, preCheck + preCheckAnchor, "pre-payment project ownership check");

  // D) Locked, authoritative snapshot. The source row is locked FOR SHARE so
  // a simultaneous UPDATE (which uses FOR UPDATE in creatorController) cannot change it.
  const snapshotAnchor = `        /*
          Serialize bookings for this Designer + calendar day.
        */`;
  const snapshotRead = `        let editorSnapshotSource = null;
        if (editorProjectId) {
          const projectResult = await client.query(
            \`SELECT id, owner_id, title, project_data, schema_version, version
             FROM public.editor_projects
             WHERE id = $1::bigint AND owner_id = $2::uuid
             LIMIT 1 FOR SHARE\`,
            [editorProjectId, creatorId],
          );
          editorSnapshotSource = projectResult.rows[0] || null;
          if (!editorSnapshotSource ||
              Number(editorSnapshotSource.version) !== editorProjectVersion) {
            await rollbackQuietly(client);
            await cancelPaymentIntentQuietly(paymentIntent.id);
            return sendError(res, 409,
              "The Editor project was changed or removed before booking. Save and retry.",
              "EDITOR_PROJECT_VERSION_CONFLICT");
          }
          const state = editorSnapshotSource.project_data;
          const validState = state && typeof state === "object" && !Array.isArray(state) &&
            state.document && typeof state.document === "object" &&
            Array.isArray(state.layers) &&
            (Array.isArray(state.objects) ||
              (state.objects && typeof state.objects === "object" && !Array.isArray(state.objects)));
          if (!validState) {
            await rollbackQuietly(client);
            await cancelPaymentIntentQuietly(paymentIntent.id);
            return sendError(res, 409, "The saved Editor project has invalid design data.",
              "INVALID_EDITOR_PROJECT_DATA");
          }
        }

`;
  s = replaceOnce(s, snapshotAnchor, snapshotRead + snapshotAnchor, "transactional Editor snapshot loading");

  // E) In same SQL transaction as booking, create immutable-at-application-level snapshot.
  const snapshotSaveAnchor = '        await client.query(\n          `\n              UPDATE users\n';
  const snapshotSave = `        // Create the immutable booking-specific design copy atomically with the booking.
        // No Showcase publication and no public preview are created here.
        if (editorSnapshotSource) {
          await client.query(
            \`INSERT INTO public.booking_design_snapshots
              (booking_id, creator_id, source_editor_project_id,
               source_project_version, source_schema_version,
               design_title, snapshot_data, preview_image_key)
             VALUES ($1::uuid, $2::uuid, $3::bigint, $4, $5, $6, $7::jsonb, NULL)\`,
            [bookingId, creatorId, editorProjectId,
             editorProjectVersion, Number(editorSnapshotSource.schema_version),
             editorSnapshotSource.title,
             JSON.stringify(editorSnapshotSource.project_data)],
          );
        }

`;
  s = replaceOnce(s, snapshotSaveAnchor, snapshotSave + snapshotSaveAnchor, "atomic private snapshot insert");

  // F) Read endpoint: only exactly the two booking participants, never an admin bypass.
  const endpointAnchor = 'exports.getUnifiedPeerPipeline = async (req, res) => {';
  const newEndpoint = `/**
 * GET /api/v1/p2p-bookings/:id/design-snapshot
 * Private: booking Creator or assigned Designer only; never public Showcase.
 * Source project changes/deletion do not change this booking's snapshot.
 */
exports.getBookingDesignSnapshot = async (req, res) => {
  const userId = getAuthenticatedUserId(req);
  const bookingId = String(req.params?.id || "").trim();
  res.set("Cache-Control", "private, no-store, max-age=0");
  res.set("Pragma", "no-cache");
  if (!userId || !isUuid(userId)) {
    return sendError(res, 401, "Authentication is required.");
  }
  if (!isUuid(bookingId)) {
    return sendError(res, 400, "A valid booking ID is required.");
  }
  try {
    const result = await db.query(
      \`SELECT s.id, s.booking_id, s.design_title, s.snapshot_data,
              s.source_project_version, s.source_schema_version, s.created_at
         FROM public.booking_design_snapshots s
         JOIN public.bookings b ON b.id = s.booking_id
         WHERE b.id = $1::uuid
           AND (b.creator_id = $2::uuid OR b.designer_id = $2::uuid)
         LIMIT 1\`,
      [bookingId, userId],
    );
    if (result.rows.length === 0) {
      // Do not disclose whether an unrelated booking or private snapshot exists.
      return sendError(res, 404, "The booking design snapshot was not found.",
        "BOOKING_DESIGN_NOT_FOUND");
    }
    return res.status(200).json({ status: "success", data: result.rows[0] });
  } catch (error) {
    console.error("Unable to retrieve private booking design snapshot:", error);
    return sendError(res, 500, "The booking design could not be loaded.");
  }
};

`;
  s = replaceOnce(s, endpointAnchor, newEndpoint + endpointAnchor, "private snapshot retrieval endpoint");

  return originalUsesCrlf ? s.replace(/\n/g, "\r\n") : s;
}

function patchRoutes(original) {
  assert(!original.includes("getBookingDesignSnapshot"), "Routes appear already patched.");
  const marker = /router\.get\(\s*["']\/:id\/whatsapp-contact["']/m;
  const m = marker.exec(original);
  if (!m) throw new Error("Unable to locate existing WhatsApp booking route in P2P routes. No changes applied.");
  const add = `// Phase 5.1A: private Editor snapshot; controller enforces exact booking participants.
router.get("/:id/design-snapshot", protect, p2pController.getBookingDesignSnapshot);

`;
  return original.slice(0, m.index) + add + original.slice(m.index);
}

async function main() {
  const controllerPath = chooseFile("server/controllers", "P2PBookingController.js");
  const routesPath = chooseFile("server/routes", "p2pBookingRoutes.js");
  const controllerBefore = fs.readFileSync(controllerPath, "utf8");
  const routesBefore = fs.readFileSync(routesPath, "utf8");
  const controllerAfter = patchController(controllerBefore);
  const routesAfter = patchRoutes(routesBefore);
  assert(controllerAfter !== controllerBefore && routesAfter !== routesBefore, "No changes to apply");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dby-phase5-1a-check-"));
  const testController = path.join(tmp, "P2PBookingController.js");
  const testRoutes = path.join(tmp, "p2pBookingRoutes.js");
  fs.writeFileSync(testController, controllerAfter, "utf8");
  fs.writeFileSync(testRoutes, routesAfter, "utf8");
  const childProcess = require("node:child_process");
  for (const target of [testController, testRoutes]) {
    const result = childProcess.spawnSync(process.execPath, ["--check", target], {encoding:"utf8"});
    if (result.status !== 0) throw new Error(`Syntax check FAILED (${target}):\n${result.stderr}`);
  }
  console.log("PASS: all patch anchors found. Both resulting JS files pass node --check.");
  if (!apply) {console.log("CHECK ONLY: no project files modified. Run with --apply to install."); return;}
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), "dby-phase5-1a-backup-"));
  fs.copyFileSync(controllerPath, path.join(backupDir,"P2PBookingController.js"));
  fs.copyFileSync(routesPath, path.join(backupDir,"p2pBookingRoutes.js"));
  try {
    fs.writeFileSync(controllerPath, controllerAfter, "utf8");
    fs.writeFileSync(routesPath, routesAfter, "utf8");
  } catch (writeError) {
    fs.copyFileSync(path.join(backupDir, "P2PBookingController.js"), controllerPath);
    fs.copyFileSync(path.join(backupDir, "p2pBookingRoutes.js"), routesPath);
    throw writeError;
  }
  console.log(`Applied to:\n  ${controllerPath}\n  ${routesPath}`);
  console.log(`Original backups (outside Git): ${backupDir}`);
  console.log("Now inspect git diff, then run your own backend/API tests before committing.");
}
main().catch((error) => {console.error(`ABORT: ${error.message}`); process.exitCode=1;});
