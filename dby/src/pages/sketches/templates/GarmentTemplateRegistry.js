/*
 * DesignByYou — Fashion Template Catalog, Phase 4.1
 * Metadata-only registry. ClothingTemplates.js remains the source of truth
 * for SVG artwork, region IDs, default colours and saved project IDs.
 *
 * Register NEW garment IDs here when adding new 2D templates. A 3D model
 * becomes available only when model3D is supplied and the GLB has the same
 * editable region-node names as the clothing template.
 */

export const GARMENT_CATEGORIES = Object.freeze([
  Object.freeze({ id: "tops", label: "Tops", order: 10 }),
  Object.freeze({ id: "outerwear", label: "Outerwear", order: 20 }),
  Object.freeze({ id: "bottoms", label: "Bottoms", order: 30 }),
  Object.freeze({ id: "dresses", label: "Dresses", order: 40 }),
  Object.freeze({ id: "traditional", label: "Traditional Wear", order: 50 }),
  Object.freeze({ id: "other", label: "Other", order: 90 }),
]);

const BASE_URL = "/models/garments/";

function freezeEntry(entry) {
  return Object.freeze({
    ...entry,
    tags: Object.freeze([...(entry.tags || [])]),
    model3D: entry.model3D ? Object.freeze({ ...entry.model3D }) : null,
  });
}

// Never rename existing IDs: clothingTemplateId is saved in creator projects.
export const GARMENT_CATALOG = Object.freeze({
  "kurta": freezeEntry({
    category: "traditional",
    tags: ["kurta", "long kurta", "v neck", "traditional wear", "south asian", "tunic", "shalwar kameez", "women"],
    // Derived only from the authentic toorkhan Sketchfab GLB (CC BY 4.0).
    model3D: { url: `${BASE_URL}DBY_Sketchfab_Kurta_10Regions.glb`, uvMode: "projected", format: "glb" },
  }),
  "suruwal": freezeEntry({
    category: "traditional",
    tags: ["suruwal", "churidar", "slim trousers", "women", "south asian", "traditional wear", "tapered"],
    // Derived only from the authentic toorkhan Sketchfab GLB (CC BY 4.0).
    model3D: { url: `${BASE_URL}DBY_Sketchfab_SlimSuruwal_6Regions.glb`, uvMode: "projected", format: "glb" },
  }),
  tshirt: freezeEntry({
    category: "tops", tags: ["t-shirt", "casual", "short sleeve"],
    model3D: { url: `${BASE_URL}DBY_Realistic_TShirt_8Regions.glb`, uvMode: "projected", format: "glb" },
  }),
  "oversized-tshirt": freezeEntry({
    category: "tops", tags: ["oversized", "streetwear", "boxy fit", "drop shoulder", "tee"],
    // Real Sketchfab ap-school garment (CC BY 4.0), optimized and remapped to
    // the ten existing 2D region IDs. The old procedural beta is no longer used.
    model3D: { url: `${BASE_URL}DBY_SketchfabOversizedTShirt_10Regions.glb`, uvMode: "projected", format: "glb" },
  }),
  polo: freezeEntry({
    category: "tops",
    tags: ["polo", "collared", "short sleeves", "placket", "casual", "sportswear"],
    // Adapted from a real downloadable Sketchfab polo (Ikal.Ichwan, CC BY 4.0).
    // All 13 2D region IDs are present as separate 3D mesh nodes.
    model3D: { url: `${BASE_URL}DBY_SketchfabPolo_13Regions.glb`, uvMode: "projected", format: "glb" },
  }),
  "long-sleeve-tshirt": freezeEntry({
    category: "tops",
    tags: ["long sleeve", "t-shirt", "crew neck", "rib cuffs", "basic tee"],
    // Sketchfab chokybali Long Sleeve T-Shirt, 12 editable regions, optimized
    // and region-partitioned from the actual downloaded garment (CC BY 4.0).
    model3D: { url: `${BASE_URL}DBY_SketchfabLongSleeveTShirt_12Regions.glb`, uvMode: "projected", format: "glb" },
  }),
  "crop-top": freezeEntry({
    category: "tops",
    tags: ["crop top", "cropped tee", "short sleeve", "crew neck", "fitted", "fashion"],
    // Real Sketchfab model by yurakara1212 (CC BY 4.0), converted from
    // five connected source pieces into ten independently editable 3D regions.
    model3D: { url: `${BASE_URL}DBY_SketchfabAthleticCropTop_10Regions.glb`, uvMode: "projected", format: "glb" },
  }),
  shirt: freezeEntry({
    category: "tops", tags: ["button-up", "shirt", "collar"],
    model3D: { url: `${BASE_URL}DBY_ButtonUpShirt_11Regions_BETA.glb`, uvMode: "projected", format: "glb" },
  }),
  hoodie: freezeEntry({
    category: "outerwear", tags: ["hoodie", "pullover", "sportswear"],
    model3D: { url: `${BASE_URL}DBY_Hoodie_Sketchfab_15Regions_BETA.glb`, uvMode: "projected", format: "glb" },
  }),
  dress: freezeEntry({
    category: "dresses", tags: ["dress", "puff sleeve", "maxi", "long dress", "formal"],
    // Adapted from Sketchfab Style3D Meta long white puffed-sleeve dress (CC BY 4.0).
    // Original dress ID and 12 region keys retained to preserve editor compatibility.
    model3D: { url: `${BASE_URL}DBY_PuffSleeveMaxiDress_12Regions.glb`, uvMode: "projected", format: "glb" },
  }),
  pants: freezeEntry({
    category: "bottoms", tags: ["pants", "trousers", "cargo"],
    model3D: { url: `${BASE_URL}DBY_CargoPants_10Regions_BETA.glb`, uvMode: "projected", format: "glb" },
  }),
  "womens-blazer": freezeEntry({
    category: "outerwear",
    tags: ["women", "ladies", "blazer", "tailored", "jacket", "business", "formal", "lapel", "two-button"],
    // Latitude23 real Sketchfab Women's Blazer Black (CC BY 4.0); 13 recolorable GLB regions,
    // plus non-editable real button details. Original black textures omitted for editable fabric.
    model3D: { url: `${BASE_URL}DBY_SketchfabWomensBlazer_13Regions.glb`, uvMode: "projected", format: "glb" },
  }),
  jeans: freezeEntry({
    category: "bottoms",
    tags: ["jeans", "grey denim", "straight-leg", "tapered", "pockets", "casual"],
    // Real downloadable Sketchfab asset by zulfiqarhussain555, CC BY 4.0.
    // Region groups are partitioned from the single source jeans surface.
    model3D: { url: `${BASE_URL}DBY_SketchfabGreyJeans_10Regions.glb`, uvMode: "projected", format: "glb" },
  }),
  skirt: freezeEntry({
    category: "bottoms", tags: ["skirt", "a-line", "panels"],
    model3D: { url: `${BASE_URL}DBY_Aline_Skirt_8Regions_BETA.glb`, uvMode: "projected", format: "glb" },
  }),
});

export function getGarmentCatalogEntry(templateOrId) {
  const id = typeof templateOrId === "object" && templateOrId !== null
    ? templateOrId.id : templateOrId;
  return Object.prototype.hasOwnProperty.call(GARMENT_CATALOG, String(id || ""))
    ? GARMENT_CATALOG[String(id)] : null;
}

export function getGarment3DConfig(templateOrId) {
  return getGarmentCatalogEntry(templateOrId)?.model3D || null;
}

export function getGarmentCategory(categoryId) {
  return GARMENT_CATEGORIES.find((category) => category.id === categoryId) || null;
}

export function enrichGarmentTemplate(template) {
  const entry = getGarmentCatalogEntry(template.id);
  return Object.freeze({
    ...template,
    category: entry?.category || "other",
    tags: entry?.tags || Object.freeze([]),
    has3D: Boolean(entry?.model3D?.url),
    model3D: entry?.model3D || null,
  });
}

// Search/filter API for a future garment browser. It does not mutate templates
// and deliberately treats 2D-only garments as first-class library entries.
export function filterGarmentTemplates(templates, { query = "", category = "all", mode = "all" } = {}) {
  const search = String(query || "").trim().toLowerCase();
  return (Array.isArray(templates) ? templates : []).filter((template) => {
    if (category !== "all" && template.category !== category) return false;
    if (mode === "3d" && !template.has3D) return false;
    if (mode === "2d" && !template.dualView) return false;
    if (!search) return true;
    const text = [template.label, template.description, ...(template.tags || [])]
      .filter(Boolean).join(" ").toLowerCase();
    return text.includes(search);
  });
}

// This is a structural validation, not a GLB inspection. Run the optional
// developer script to validate actual model files and GLB mesh/node names.
export function validateGarmentCatalog(templates) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(templates)) return { valid: false, errors: ["Template list must be an array."], warnings };
  const seen = new Set();
  const ids = new Set(templates.map((template) => template.id));
  const categories = new Set(GARMENT_CATEGORIES.map((category) => category.id));
  for (const template of templates) {
    const id = String(template?.id || "");
    if (!/^[a-z][a-z0-9-]*$/.test(id)) errors.push(`Invalid garment ID: ${id}`);
    if (seen.has(id)) errors.push(`Duplicate garment ID: ${id}`);
    seen.add(id);
    if (!template?.label) errors.push(`${id}: missing display label`);
    if (typeof template?.createSvg !== "function") errors.push(`${id}: missing SVG generator`);
    const regions = template?.colourRegions || [];
    const regionIds = new Set();
    for (const region of regions) {
      if (!region?.id || !["front", "back"].includes(region.view)) errors.push(`${id}: invalid region ${region?.id}`);
      if (regionIds.has(region?.id)) errors.push(`${id}: duplicate region ID ${region?.id}`);
      regionIds.add(region?.id);
      if (!Object.prototype.hasOwnProperty.call(template?.defaultColours || {}, region.id)) {
        errors.push(`${id}: missing default colour for ${region.id}`);
      }
    }
    if (!regions.length) errors.push(`${id}: no editable regions`);
    for (const colourId of Object.keys(template?.defaultColours || {})) {
      if (!regionIds.has(colourId)) errors.push(`${id}: unknown default colour ${colourId}`);
    }
    if (!categories.has(template?.category || "other")) errors.push(`${id}: invalid category`);
    if (template?.has3D !== Boolean(template?.model3D?.url)) errors.push(`${id}: mismatched 3D model metadata`);
    if (template?.model3D && !/^\/models\/garments\/[a-zA-Z0-9_.-]+\.glb$/.test(template.model3D.url)) {
      errors.push(`${id}: invalid or nonlocal 3D model URL`);
    }
    if (!getGarmentCatalogEntry(id)) warnings.push(`${id}: no catalog metadata; categorized as Other`);
  }
  for (const id of Object.keys(GARMENT_CATALOG)) {
    if (!ids.has(id)) warnings.push(`${id}: registered but no 2D clothing template exists`);
  }
  return { valid: errors.length === 0, errors, warnings };
}
