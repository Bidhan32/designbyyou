// Shared helpers and state kept separate from the React refresh boundary.

function numberOr(value, fallback = 0) {
  const numericValue = Number(value);

  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function isFinitePoint(point) {
  return Boolean(
    point &&
    Number.isFinite(Number(point.x)) &&
    Number.isFinite(Number(point.y)),
  );
}

function screenPointToDocumentPoint(screenPoint, viewport) {
  if (!isFinitePoint(screenPoint)) {
    return null;
  }

  const zoom = Math.max(
    0.0001,

    numberOr(viewport?.zoom, 1),
  );

  const viewportX = numberOr(viewport?.x, 0);

  const viewportY = numberOr(viewport?.y, 0);

  return {
    x: (Number(screenPoint.x) - viewportX) / zoom,

    y: (Number(screenPoint.y) - viewportY) / zoom,
  };
}

export { numberOr, isFinitePoint, screenPointToDocumentPoint };
