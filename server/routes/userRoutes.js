"use strict";

/*
=========================================================
DesignByYou / FashionVision
User Routes
Profile, Public Identity and Account Security
Version 4.0
=========================================================

ROUTE MODEL
---------------------------------------------------------

GET /users
    Authenticated user network/directory

PUT /users/profile
    Authenticated user's own profile update

PUT /users/security
    Authenticated user's own password update

GET /users/:id
    Public-safe individual profile

=========================================================
IMPORTANT SECURITY RULES
=========================================================

1. GET /users is NOT anonymous.

   Even though the controller now sanitizes its response,
   bulk account enumeration should still require a valid
   authenticated session.

2. PUT /profile and PUT /security always use req.user from
   protect middleware.

3. GET /:id remains public because the updated controller
   returns only explicitly public-safe fields.

4. Dynamic /:id MUST remain last so values such as:

   /profile
   /security

   are never interpreted as user IDs.

5. Fashion Persona routes are NOT handled here.

   They belong under:

   /avatar/*

=========================================================
*/

const express = require("express");

const router = express.Router();

const { protect } = require("../middlewares/authMiddleware");

const userController = require("../controllers/userController");

const {
  uploadProfile,
} = require(
  "../middlewares/upload",
);

/*=========================================================
1. Authenticated User Directory
=========================================================

GET
/api/v1/users

Returns the controller's sanitized network response.

The updated controller excludes:

- email
- password/auth data
- Stripe IDs
- payout details
- financial data

and excludes unapproved Designer accounts.

Authentication is still required to prevent unrestricted
anonymous bulk account enumeration.
=========================================================*/

router.get("/", protect, userController.getAllUsers);

/*=========================================================
2. Update Own Profile
=========================================================

PUT
/api/v1/users/profile

Authentication:
    required

Multipart field:
    profile_image

Supported shared fields:
    full_name
    profile_image

Creator fields:
    company_name
    preferred_category
    default_dimensions
    brand_guidelines_summary

Designer fields:
    bio
    location

IMPORTANT:

remote_avatar_url is no longer accepted by the updated
controller.

Fashion Persona customization belongs to /avatar/*.
=========================================================*/

router.put(
  "/profile",
  protect,
  uploadProfile.single(
    "profile_image",
  ),
  userController.updateProfile,
);

/*=========================================================
3. Update Own Password
=========================================================

PUT
/api/v1/users/security

Authentication:
    required

Body:

{
  "currentPassword": "...",
  "newPassword": "..."
}

The controller:

- validates both passwords
- enforces 8–128 characters
- verifies the current password
- rejects reuse of the existing password
- hashes with bcrypt
- increments token_version

Therefore a successful password change invalidates all
previous JWTs.

The frontend should require the user to sign in again.
=========================================================*/

router.put("/security", protect, userController.updateSecurity);

/*=========================================================
4. Public-Safe Individual Profile
=========================================================

GET
/api/v1/users/:id

This route intentionally remains public.

The controller must therefore remain the security boundary
for exactly which fields may be exposed.

The updated controller does NOT return:

- email
- approval status
- authentication information
- Stripe information
- Creator private brand guidelines
- financial information

Unapproved Designer profiles return 404.

IMPORTANT:

KEEP THIS ROUTE LAST.
=========================================================*/

router.get("/:id", userController.getUserProfileById);

/*=========================================================
Export
=========================================================*/

module.exports = router;
