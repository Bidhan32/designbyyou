/*
 * DesignByYou Phase 4.5.2
 * Safe 3D region picking. The canvas gesture must be a stationary primary-pointer
 * click, start on the clicked editable region, and not rotate OrbitControls.
 * No React, Three.js or state-store dependency.
 */
export function createGarment3DClickGuard() {
  let gesture = null;

  function matchesPointer(pointerId) {
    return Boolean(gesture && Number(pointerId) === gesture.pointerId);
  }

  function movementExceeded(event) {
    if (!gesture) return false;
    const x = Number(event?.clientX);
    const y = Number(event?.clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return true;
    return Math.hypot(x - gesture.x, y - gesture.y) > gesture.threshold;
  }

  return {
    down(event) {
      gesture = null;
      // Ignore HTML controls and gizmos, secondary pointers, non-left mouse clicks.
      if (String(event?.target?.tagName || "").toUpperCase() !== "CANVAS") return;
      const pointerId = Number(event.pointerId);
      const x = Number(event.clientX);
      const y = Number(event.clientY);
      if (!Number.isFinite(pointerId) || !Number.isFinite(x) || !Number.isFinite(y)) return;
      if (event.isPrimary === false) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      gesture = {
        pointerId, x, y,
        threshold: event.pointerType === "touch" ? 7 : 3,
        moved: false, released: false,
        downRegion: null,
      };
    },
    regionDown(regionId, pointerId) {
      if (!matchesPointer(pointerId) || gesture.released || gesture.moved) return;
      if (typeof regionId !== "string" || !regionId) return;
      gesture.downRegion = regionId;
    },
    move(event) {
      if (!matchesPointer(event?.pointerId) || gesture.released) return;
      if (movementExceeded(event)) gesture.moved = true;
    },
    cameraChanged() {
      // Drei OrbitControls emits onChange only when the camera moves. Even very
      // small rotations must not be interpreted as painting/selection gestures.
      if (gesture && !gesture.released) gesture.moved = true;
    },
    up(event) {
      if (!matchesPointer(event?.pointerId)) {
        gesture = null;
        return;
      }
      if (movementExceeded(event)) gesture.moved = true;
      gesture.released = true;
    },
    leave() {
      if (gesture && !gesture.released) gesture.moved = true;
    },
    cancel() {
      gesture = null;
    },
    consumeClick(regionId) {
      // R3F onClick is emitted on pointer-up. It must be the *same* region that
      // received pointer-down. Failed gestures always consume/clear themselves.
      const accepted = Boolean(
        gesture && gesture.released && !gesture.moved &&
        gesture.downRegion && gesture.downRegion === regionId,
      );
      gesture = null;
      return accepted;
    },
  };
}
