// Shared helpers and state kept separate from the React refresh boundary.

function projectedUvToArtworkOffset(uv, artworkBox) {
  if (!uv || !artworkBox || !Number.isFinite(uv.x) || !Number.isFinite(uv.y)) return null;
  const u = Math.max(0, Math.min(1, uv.x));
  const v = Math.max(0, Math.min(1, uv.y));
  return {
    offsetX: Math.round((u - 0.5) * artworkBox.width * 10) / 10,
    offsetY: Math.round((0.5 - v) * artworkBox.height * 10) / 10,
  };
}

export { projectedUvToArtworkOffset };
