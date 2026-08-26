"use strict";

/*
=========================================================
DesignByYou
Creator Showcase Controller
Version 5.0
=========================================================

PURPOSE
---------------------------------------------------------

Creator Showcase is a creative discovery surface.

It may display public/published work owned by:

- Creators
- approved Designers

It is NOT:

- ecommerce
- a marketplace
- checkout
- a product store
- design purchasing
- licensing

=========================================================
DISCOVERY TAXONOMY
=========================================================

Showcase discovery navigation is database-driven:

showcase_discovery_terms

Groups:

- style
- garment
- occasion

Endpoint:

GET
/api/v1/creator-showcase/discovery

=========================================================
DESIGN TAXONOMY
=========================================================

Design discovery relationships are stored through:

design_showcase_terms

Example:

Design
    ↓
Streetwear   → style
Dresses      → garment
Graduation   → occasion

The Showcase pipeline can now filter relationally:

GET
/api/v1/creator-showcase/pipeline?term=streetwear

GET
/api/v1/creator-showcase/pipeline?term=dresses

GET
/api/v1/creator-showcase/pipeline?term=graduation

This is the canonical filtering method for:

- Browse by Style
- Browse by Garment
- Browse by Occasion
- Trending Styles

=========================================================
LEGACY / COMPATIBILITY FILTERS
=========================================================

The pipeline still supports:

search
style
category

These remain useful for:

- free-text search
- older designs without Showcase-term relationships
- compatibility during migration

The new `term` filter is the authoritative relational
discovery filter.

=========================================================
OWNER MODEL
=========================================================

Every Showcase design exposes generic owner fields:

owner_id
owner_role
owner_name
owner_avatar

Designer-specific information is available only when the
owner is actually a Designer.

=========================================================
SECURITY
=========================================================

Showcase endpoints never expose:

- email
- canvas_state
- raw editable source
- payment information
- price
- licensing information
=========================================================
*/

const db = require("../../config/db");

/*=========================================================
Configuration
=========================================================*/

const DEFAULT_PAGE = 1;

const DEFAULT_LIMIT = 30;

const MAX_LIMIT = 60;

const MAX_SEARCH_LENGTH = 100;

const MAX_STYLE_LENGTH = 80;

const MAX_CATEGORY_LENGTH = 120;

const MAX_TERM_LENGTH = 120;

const TOP_DESIGNERS_LIMIT = 5;

/*=========================================================
Helpers
=========================================================*/

function cleanText(value) {
  return String(value ?? "").trim();
}

function sendError(res, status, code, message) {
  return res.status(status).json({
    status: "error",

    code,

    message,
  });
}

function parsePositiveInteger(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

/*=========================================================
Discovery Slug Validation
=========================================================*/

function isValidDiscoverySlug(value) {
  if (!value) {
    return false;
  }

  /*
  Expected examples:

  minimalist
  streetwear
  dresses
  date-night
  graduation
  */

  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(value);
}

/*=========================================================
GET SHOWCASE DISCOVERY

GET
/api/v1/creator-showcase/discovery

Returns active database-managed Showcase navigation.

Response:

{
    status: "success",
    data: {
        styles: [],
        garments: [],
        occasions: [],
        trending: []
    }
}

Trending contains active STYLE terms where:

is_trending = TRUE
=========================================================*/

exports.getShowcaseDiscovery = async (req, res) => {
  try {
    const result = await db.query(
      `
            SELECT
              id,
              group_type,
              name,
              slug,
              search_term,
              emoji,
              description,
              is_trending,
              sort_order

            FROM showcase_discovery_terms

            WHERE
              is_active = TRUE

            ORDER BY
              CASE group_type

                WHEN 'style'
                  THEN 1

                WHEN 'garment'
                  THEN 2

                WHEN 'occasion'
                  THEN 3

                ELSE 4

              END,

              sort_order ASC,

              name ASC
          `,
    );

    const styles = [];

    const garments = [];

    const occasions = [];

    const trending = [];

    for (const row of result.rows) {
      const term = {
        id: row.id,

        name: row.name,

        slug: row.slug,

        search_term: row.search_term,

        emoji: row.emoji || null,

        description: row.description || null,

        sort_order: row.sort_order,
      };

      if (row.group_type === "style") {
        styles.push(term);

        if (row.is_trending === true) {
          trending.push(term);
        }

        continue;
      }

      if (row.group_type === "garment") {
        garments.push(term);

        continue;
      }

      if (row.group_type === "occasion") {
        occasions.push(term);
      }
    }

    return res.status(200).json({
      status: "success",

      data: {
        styles,

        garments,

        occasions,

        trending,
      },
    });
  } catch (error) {
    console.error("Creator Showcase discovery query error:", error);

    return sendError(
      res,
      500,
      "SHOWCASE_DISCOVERY_UNAVAILABLE",
      "Showcase discovery options are currently unavailable.",
    );
  }
};

/*=========================================================
GET SHOWCASE PIPELINE

GET
/api/v1/creator-showcase/pipeline

Supports:

?page=1
&limit=30

Free text:
&search=dress

Legacy compatibility:
&style=Streetwear
&category=dress

Canonical relational discovery:
&term=streetwear
&term=dresses
&term=graduation

=========================================================
TERM FILTER
=========================================================

The `term` parameter matches:

showcase_discovery_terms.slug

through:

design_showcase_terms

Example:

?term=graduation

means:

Return only designs with an active Graduation relationship.

No title/description/tag keyword matching is involved.

=========================================================
VISIBILITY RULE
=========================================================

A design must be:

is_public    = TRUE
is_published = TRUE

Designer-owned:

account must be approved

Creator-owned:

Creator accounts do not require admin approval
=========================================================*/

exports.getShowcase = async (req, res) => {
  try {
    /*=================================================
      Filters
      =================================================*/

    const search = cleanText(req.query.search);

    const style = cleanText(req.query.style);

    const category = cleanText(req.query.category);

    const term = cleanText(req.query.term).toLowerCase();

    const page = parsePositiveInteger(req.query.page, DEFAULT_PAGE);

    const requestedLimit = parsePositiveInteger(req.query.limit, DEFAULT_LIMIT);

    /*=================================================
      Pagination Validation
      =================================================*/

    if (page === null) {
      return sendError(
        res,
        400,
        "INVALID_PAGE",
        "Page must be a positive integer.",
      );
    }

    if (requestedLimit === null) {
      return sendError(
        res,
        400,
        "INVALID_LIMIT",
        "Limit must be a positive integer.",
      );
    }

    const limit = Math.min(requestedLimit, MAX_LIMIT);

    /*=================================================
      Filter Validation
      =================================================*/

    if (search.length > MAX_SEARCH_LENGTH) {
      return sendError(
        res,
        400,
        "SEARCH_TOO_LONG",
        `Search must not exceed ${MAX_SEARCH_LENGTH} characters.`,
      );
    }

    if (style.length > MAX_STYLE_LENGTH) {
      return sendError(
        res,
        400,
        "STYLE_TOO_LONG",
        `Style must not exceed ${MAX_STYLE_LENGTH} characters.`,
      );
    }

    if (category.length > MAX_CATEGORY_LENGTH) {
      return sendError(
        res,
        400,
        "CATEGORY_TOO_LONG",
        `Category must not exceed ${MAX_CATEGORY_LENGTH} characters.`,
      );
    }

    if (term.length > MAX_TERM_LENGTH) {
      return sendError(
        res,
        400,
        "TERM_TOO_LONG",
        `Discovery term must not exceed ${MAX_TERM_LENGTH} characters.`,
      );
    }

    if (term && !isValidDiscoverySlug(term)) {
      return sendError(
        res,
        400,
        "INVALID_DISCOVERY_TERM",
        "The selected Showcase discovery term is invalid.",
      );
    }

    /*=================================================
      Base Query
      =================================================*/

    const params = [];

    let query = `
        SELECT
          d.id AS design_id,

          d.title,

          d.slug,

          d.description,

          d.watermarked_preview_url,

          d.style_category,

          d.tags,

          d.created_at,

          dc.id AS category_id,

          dc.name AS category_name,

          dc.slug AS category_slug,

          u.id AS owner_id,

          u.role AS owner_role,

          u.full_name AS owner_name,

          u.profile_image_url AS owner_avatar,

          CASE
            WHEN u.role = 'designer'
              THEN u.id

            ELSE NULL
          END AS designer_id,

          CASE
            WHEN u.role = 'designer'
              THEN u.full_name

            ELSE NULL
          END AS designer_name,

          CASE
            WHEN u.role = 'designer'
              THEN u.profile_image_url

            ELSE NULL
          END AS designer_avatar,

          CASE
            WHEN u.role = 'designer'
              THEN TRUE

            ELSE FALSE
          END AS can_book_designer,

          CASE
            WHEN u.role = 'designer'
              THEN COALESCE(
                dp.avg_rating,
                0
              )

            ELSE 0
          END AS designer_avg_rating,

          CASE
            WHEN u.role = 'designer'
              THEN COALESCE(
                dp.total_completed_bookings,
                0
              )

            ELSE 0
          END AS total_completed_bookings

        FROM designs d

        INNER JOIN users u
          ON u.id =
             d.owner_id

        LEFT JOIN designer_profiles dp
          ON dp.user_id =
             u.id

         AND u.role =
             'designer'

        LEFT JOIN design_categories dc
          ON dc.id =
             d.category_id

        WHERE
          d.is_published =
            TRUE

          AND d.is_public =
            TRUE

          AND (
            u.role =
              'creator'

            OR (
              u.role =
                'designer'

              AND u.approval_status =
                'approved'
            )
          )
      `;

    /*=================================================
      Canonical Relational Discovery Filter

      term examples:

      streetwear
      dresses
      graduation
      date-night
      =================================================*/

    if (term) {
      params.push(term);

      const termIndex = params.length;

      query += `
          AND EXISTS (
            SELECT 1

            FROM design_showcase_terms dst

            INNER JOIN showcase_discovery_terms sdt
              ON sdt.id =
                 dst.term_id

            WHERE
              dst.design_id =
                d.id

              AND sdt.is_active =
                TRUE

              AND LOWER(
                sdt.slug
              ) = LOWER(
                $${termIndex}
              )
          )
        `;
    }

    /*=================================================
      Legacy Style Filter

      Kept for compatibility.

      New Browse-by-Style navigation should use:

      ?term=<style-slug>
      =================================================*/

    if (style) {
      params.push(style);

      query += `
          AND LOWER(
            d.style_category
          ) = LOWER(
            $${params.length}
          )
        `;
    }

    /*=================================================
      General Category Filter

      Uses:

      designs.category_id
          ↓
      design_categories.slug
      =================================================*/

    if (category) {
      params.push(category);

      query += `
          AND LOWER(
            dc.slug
          ) = LOWER(
            $${params.length}
          )
        `;
    }

    /*=================================================
      Free-Text Search

      This remains intentionally separate from relational
      discovery filtering.

      Searches:

      - title
      - description
      - owner
      - style
      - general category
      - exact normalized tag
      =================================================*/

    if (search) {
      const searchPattern = `%${search}%`;

      params.push(searchPattern);

      const patternIndex = params.length;

      params.push(search.toLowerCase());

      const exactTagIndex = params.length;

      query += `
          AND (
            d.title ILIKE
              $${patternIndex}

            OR d.description ILIKE
              $${patternIndex}

            OR u.full_name ILIKE
              $${patternIndex}

            OR d.style_category ILIKE
              $${patternIndex}

            OR dc.name ILIKE
              $${patternIndex}

            OR $${exactTagIndex}
              = ANY(
                  COALESCE(
                    d.tags,
                    ARRAY[]::text[]
                  )
                )
          )
        `;
    }

    /*=================================================
      Pagination
      =================================================*/

    const offset = (page - 1) * limit;

    /*
      Fetch one extra result to determine hasMore without
      an additional COUNT(*) query.
      */

    params.push(limit + 1);

    const limitIndex = params.length;

    params.push(offset);

    const offsetIndex = params.length;

    query += `
        ORDER BY
          d.created_at DESC,

          d.id DESC

        LIMIT
          $${limitIndex}

        OFFSET
          $${offsetIndex}
      `;

    /*=================================================
      Execute
      =================================================*/

    const result = await db.query(query, params);

    const hasMore = result.rows.length > limit;

    const designs = hasMore ? result.rows.slice(0, limit) : result.rows;

    return res.status(200).json({
      status: "success",

      results: designs.length,

      data: designs,

      filters: {
        search: search || null,

        style: style || null,

        category: category || null,

        term: term || null,
      },

      pagination: {
        page,

        limit,

        hasMore,
      },
    });
  } catch (error) {
    console.error("Creator Showcase pipeline query error:", error);

    return sendError(
      res,
      500,
      "SHOWCASE_UNAVAILABLE",
      "The Creator Showcase is currently unavailable.",
    );
  }
};

/*=========================================================
GET SINGLE SHOWCASE ITEM

GET
/api/v1/creator-showcase/item/:slug

Returns one safe public Showcase item.

Also returns active relational Showcase classifications.

canvas_state is deliberately NOT returned.
=========================================================*/

exports.getShowcaseItem = async (req, res) => {
  const slug = cleanText(req.params.slug);

  if (!slug) {
    return sendError(
      res,
      400,
      "SHOWCASE_SLUG_REQUIRED",
      "A showcase item identifier is required.",
    );
  }

  if (slug.length > 200) {
    return sendError(
      res,
      400,
      "INVALID_SHOWCASE_SLUG",
      "The showcase item identifier is invalid.",
    );
  }

  try {
    const result = await db.query(
      `
            SELECT
              d.id AS design_id,

              d.title,

              d.slug,

              d.description,

              d.watermarked_preview_url,

              d.tags,

              d.style_category,

              d.created_at,

              dc.id AS category_id,

              dc.name AS category_name,

              dc.slug AS category_slug,

              u.id AS owner_id,

              u.role AS owner_role,

              u.full_name AS owner_name,

              u.profile_image_url AS owner_avatar,

              CASE
                WHEN u.role =
                  'designer'
                THEN u.id

                ELSE NULL
              END AS designer_id,

              CASE
                WHEN u.role =
                  'designer'
                THEN u.full_name

                ELSE NULL
              END AS designer_name,

              CASE
                WHEN u.role =
                  'designer'
                THEN u.profile_image_url

                ELSE NULL
              END AS designer_avatar,

              CASE
                WHEN u.role =
                  'designer'
                THEN TRUE

                ELSE FALSE
              END AS can_book_designer,

              CASE
                WHEN u.role =
                  'designer'
                THEN dp.bio

                ELSE NULL
              END AS designer_bio,

              CASE
                WHEN u.role =
                  'designer'
                THEN dp.portfolio_url

                ELSE NULL
              END AS portfolio_url,

              CASE
                WHEN u.role =
                  'designer'
                THEN dp.city

                ELSE NULL
              END AS city,

              CASE
                WHEN u.role =
                  'designer'
                THEN COALESCE(
                  dp.avg_rating,
                  0
                )

                ELSE 0
              END AS designer_avg_rating,

              CASE
                WHEN u.role =
                  'designer'
                THEN COALESCE(
                  dp.total_completed_bookings,
                  0
                )

                ELSE 0
              END AS total_completed_bookings,

              COALESCE(
                (
                  SELECT
                    jsonb_agg(
                      jsonb_build_object(
                        'id',
                        sdt.id,

                        'group_type',
                        sdt.group_type,

                        'name',
                        sdt.name,

                        'slug',
                        sdt.slug,

                        'search_term',
                        sdt.search_term,

                        'emoji',
                        sdt.emoji,

                        'description',
                        sdt.description,

                        'sort_order',
                        sdt.sort_order
                      )

                      ORDER BY
                        CASE sdt.group_type

                          WHEN 'style'
                            THEN 1

                          WHEN 'garment'
                            THEN 2

                          WHEN 'occasion'
                            THEN 3

                          ELSE 4

                        END,

                        sdt.sort_order ASC,

                        sdt.name ASC
                    )

                  FROM design_showcase_terms dst

                  INNER JOIN showcase_discovery_terms sdt
                    ON sdt.id =
                       dst.term_id

                  WHERE
                    dst.design_id =
                      d.id

                    AND sdt.is_active =
                      TRUE
                ),

                '[]'::jsonb
              ) AS showcase_terms

            FROM designs d

            INNER JOIN users u
              ON u.id =
                 d.owner_id

            LEFT JOIN designer_profiles dp
              ON dp.user_id =
                 u.id

             AND u.role =
                 'designer'

            LEFT JOIN design_categories dc
              ON dc.id =
                 d.category_id

            WHERE
              d.slug =
                $1

              AND d.is_published =
                TRUE

              AND d.is_public =
                TRUE

              AND (
                u.role =
                  'creator'

                OR (
                  u.role =
                    'designer'

                  AND u.approval_status =
                    'approved'
                )
              )

            LIMIT 1
          `,

      [slug],
    );

    if (result.rows.length === 0) {
      return sendError(
        res,
        404,
        "SHOWCASE_ITEM_NOT_FOUND",
        "Showcase item not found.",
      );
    }

    return res.status(200).json({
      status: "success",

      data: result.rows[0],
    });
  } catch (error) {
    console.error("Creator Showcase item query error:", error);

    return sendError(
      res,
      500,
      "SHOWCASE_ITEM_UNAVAILABLE",
      "Unable to load the showcase item.",
    );
  }
};

/*=========================================================
GET TOP DESIGNERS

GET
/api/v1/creator-showcase/top-designers

This endpoint remains Designer-only because its purpose is
featured Designer discovery.
=========================================================*/

exports.getTopDesigners = async (req, res) => {
  try {
    const result = await db.query(
      `
            SELECT
              u.id AS designer_id,

              u.full_name AS designer_name,

              u.profile_image_url AS designer_avatar,

              COALESCE(
                dp.avg_rating,
                0
              ) AS avg_rating,

              COALESCE(
                dp.total_completed_bookings,
                0
              ) AS total_completed_bookings

            FROM users u

            LEFT JOIN designer_profiles dp
              ON dp.user_id =
                 u.id

            WHERE
              u.role =
                'designer'

              AND u.approval_status =
                'approved'

            ORDER BY
              COALESCE(
                dp.total_completed_bookings,
                0
              ) DESC,

              COALESCE(
                dp.avg_rating,
                0
              ) DESC,

              u.created_at ASC

            LIMIT $1
          `,

      [TOP_DESIGNERS_LIMIT],
    );

    return res.status(200).json({
      status: "success",

      results: result.rows.length,

      data: result.rows,
    });
  } catch (error) {
    console.error("Creator Showcase top designers query error:", error);

    return sendError(
      res,
      500,
      "TOP_DESIGNERS_UNAVAILABLE",
      "Unable to load featured designers.",
    );
  }
};
