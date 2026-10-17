DesignByYou Creative Hub — optimized visual assets v3.1

Place the eight top-level .webp images in your frontend:
  public/images/creator-tools/

Assets (all image paths remain unchanged):
  hero.webp
  fashion-editor.webp
  creator-upload.webp
  text-to-image.webp
  sketch-to-image.webp
  background-remover.webp
  virtual-tryon.webp
  image-editor.webp

Optional /mobile/ versions are a lighter 540x300 for cards and 960x540 hero.
To actually use the /mobile/ images, add an image srcSet or a <picture> element;
your current CreatorToolsPage.jsx loads the top-level files only.

Note: These are recompositions of the existing generated collages, with crisp
vector-rendered labels and much less upscaling of the artwork than the first
asset pack. They are not newly generated native high-resolution fashion photos.
They show conceptual demonstrations, not real provider API output.

Performance: WebP 88 for desktop cards and 83 for mobile cards.
All 8 source files can be cached by the web server. Do not rename them unless
updating the PHOTOS map.
