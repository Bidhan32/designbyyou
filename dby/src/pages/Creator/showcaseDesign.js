export function getOwnerName(design) {
  return design?.owner_name || design?.designer_name || "DesignByYou Creator";
}

export function getOwnerAvatar(design) {
  return design?.owner_avatar || design?.designer_avatar || "";
}

export function isDesignerOwned(design) {
  return (
    design?.owner_role === "designer" ||
    design?.can_book_designer === true ||
    design?.can_book_designer === "true"
  );
}

export function getDesignerRating(design) {
  if (!isDesignerOwned(design)) {
    return null;
  }

  const rating = Number.parseFloat(design?.designer_avg_rating);

  if (!Number.isFinite(rating) || rating <= 0) {
    return null;
  }

  return rating;
}

/*=========================================================
Booking URL
=========================================================*/

export function buildBookingUrl(design) {
  if (!isDesignerOwned(design)) {
    return null;
  }

  const designerId = design?.designer_id;

  const designId = design?.design_id;

  if (!designerId || !designId) {
    return null;
  }

  const params = new URLSearchParams({
    designer_id: String(designerId),

    design_id: String(designId),
    design_title: design.title || "Untitled design",
  });

  return `/creator/bookings/new?${params.toString()}`;
}

