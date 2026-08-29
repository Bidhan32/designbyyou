/*
=========================================================
FashionVision Clothing Template Tool
Built-in 2D Garment Template Placement
Version 1.0.0
=========================================================
*/

import {
  EDITOR_TOOLS,
} from "../useFashionEditorStore";

import {
  createImageTool,
} from "./ImageTool";

/*
=========================================================
Clothing Tool

Clothing templates are stored as normal IMAGE objects.

This lets them automatically reuse:
- canvas placement
- selection
- resize
- rotation
- layers
- duplicate/delete
- save/load
- PNG export

The tool does NOT open the user's file picker.
Only built-in clothing templates will be queued into it.
=========================================================
*/

export const ClothingTool = createImageTool({
  id: EDITOR_TOOLS.CLOTHING,

  previewId: "__fashion-editor-clothing-preview__",

  historyLabel: "Place clothing template",

  openFilePickerOnCanvasClick: false,

  openFilePickerOnActivate: false,

  selectCreatedImage: true,

  switchToSelectAfterCreate: true,
});

export default ClothingTool;