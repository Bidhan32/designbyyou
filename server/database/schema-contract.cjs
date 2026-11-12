// Minimum columns used by current critical paths. This is a readiness check,
// not a replacement for the complete PostgreSQL schema or an executable baseline.
module.exports = {
  users: ["id", "role", "full_name", "email", "password_hash", "profile_image_url", "is_email_verified", "approval_status", "subscription_tier", "subscription_active_until", "token_version"],
  editor_projects: ["id", "owner_id", "title", "project_data", "schema_version", "preview_url", "source_project_id", "version", "created_at", "updated_at"],
  bookings: ["id", "creator_id", "designer_id", "status", "agreed_price", "escrow_locked", "updated_at"],
  transactions: ["id", "sender_id", "receiver_id", "reference_id", "gross_amount", "transaction_type", "created_at"],
  creator_pattern_extraction_jobs: ["id", "creator_id", "request_key", "mode", "instructions", "status", "prediction_id", "error_code", "estimated_credits", "created_at", "updated_at", "completed_at"],
  creator_costume_extraction_jobs: ["id", "creator_id", "request_key", "status", "estimated_credits", "created_at", "updated_at", "completed_at"],
  creator_costume_extraction_views: ["job_id", "view_name", "status", "prediction_id", "error_code", "submitted_at", "completed_at", "updated_at"],
};
