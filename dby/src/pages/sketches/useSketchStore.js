import { create } from "zustand";

import { processSketch } from "../ai/pipeline/RecognitionPipeline";

/*=========================================================
Default Canvas Size
=========================================================*/

const DEFAULT_CANVAS_SIZE = {
  width: 800,
  height: 600,
};

/*=========================================================
Normalize Canvas Size
=========================================================*/

function normalizeCanvasSize(canvas = {}) {
  const width = Number(canvas.width);

  const height = Number(canvas.height);

  return {
    width: width > 0 ? width : DEFAULT_CANVAS_SIZE.width,

    height: height > 0 ? height : DEFAULT_CANVAS_SIZE.height,
  };
}

/*=========================================================
Run Recognition Safely
=========================================================*/

function recognizeSketch(lines = [], canvas = {}) {
  if (!Array.isArray(lines)) {
    return {
      analyses: [],
      groups: [],
    };
  }

  try {
    return processSketch(lines, normalizeCanvasSize(canvas));
  } catch (error) {
    console.error("FashionVision recognition failed:", error);

    return {
      analyses: [],
      groups: [],
    };
  }
}

/*=========================================================
Sketch Store
=========================================================*/

export const useSketchStore = create((set, get) => ({
  /*---------------------------------------------
        Drawing State
        ---------------------------------------------*/

  lines: [],

  canvasSize: {
    ...DEFAULT_CANVAS_SIZE,
  },

  /*---------------------------------------------
        Recognition State
        ---------------------------------------------*/

  analyses: [],

  groups: [],

  /*---------------------------------------------
        Generated Garment Blueprint
        ---------------------------------------------*/

  blueprint: null,

  /*---------------------------------------------
        Add Completed Stroke
        ---------------------------------------------*/

  addLine: (line, canvas = {}) => {
    if (!line || !Array.isArray(line.points) || line.points.length < 4) {
      return;
    }

    set((state) => {
      const updatedLines = [...state.lines, line];

      const canvasSize = normalizeCanvasSize({
        ...state.canvasSize,
        ...canvas,
      });

      const result = recognizeSketch(updatedLines, canvasSize);

      return {
        lines: updatedLines,

        canvasSize,

        analyses: result.analyses,

        groups: result.groups,
        garment: result.garment,
        garmentBlueprint: result.garmentBlueprint,

      };
    });
  },

  /*---------------------------------------------
        Undo Last Stroke
        ---------------------------------------------*/

  undo: () => {
    set((state) => {
      if (state.lines.length === 0) {
        return {};
      }

      const updatedLines = state.lines.slice(0, -1);

      const result = recognizeSketch(updatedLines, state.canvasSize);

      return {
        lines: updatedLines,

        analyses: result.analyses,

        groups: result.groups,
      };
    });
  },

  /*---------------------------------------------
        Replace All Strokes
        ---------------------------------------------*/

  setLines: (lines = [], canvas = {}) => {
    const safeLines = Array.isArray(lines) ? lines : [];

    set((state) => {
      const canvasSize = normalizeCanvasSize({
        ...state.canvasSize,
        ...canvas,
      });

      const result = recognizeSketch(safeLines, canvasSize);

      return {
        lines: safeLines,

        canvasSize,

        analyses: result.analyses,

        groups: result.groups,
      };
    });
  },

  /*---------------------------------------------
        Reprocess Existing Sketch
        ---------------------------------------------*/

  processRecognition: (canvas = {}) => {
    const state = get();

    const canvasSize = normalizeCanvasSize({
      ...state.canvasSize,
      ...canvas,
    });

    const result = recognizeSketch(state.lines, canvasSize);

    set({
      canvasSize,

      analyses: result.analyses,

      groups: result.groups,
    });
  },

  /*---------------------------------------------
        Clear Canvas
        ---------------------------------------------*/

  clear: () => {
    set({
      lines: [],

      analyses: [],

      groups: [],

      garment: null,

      garmentBlueprint: null,

      blueprint: null,
    });
  },

  /*---------------------------------------------
        Store Garment Blueprint
        ---------------------------------------------*/

  setBlueprint: (data) => {
    set({
      blueprint: data ?? null,
    });
  },
}));
