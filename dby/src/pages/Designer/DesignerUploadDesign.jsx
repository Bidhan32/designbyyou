import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Compass,
  FileImage,
  Image as ImageIcon,
  Layers3,
  Loader2,
  LockKeyhole,
  Package,
  Palette,
  Ruler,
  ShieldCheck,
  Shirt,
  Sparkles,
  Tag,
  UploadCloud,
  UserRound,
  X,
} from "lucide-react";

import API from "../../api/axios";

/*=========================================================
API Configuration
=========================================================*/

const SHOWCASE_UPLOAD_ENDPOINT =
  "/designer/upload";

/*=========================================================
Upload Rules
=========================================================*/

const MAX_IMAGE_BYTES =
  15 * 1024 * 1024;

const MIN_TITLE_LENGTH =
  3;

const MAX_TITLE_LENGTH =
  120;

const MIN_DESCRIPTION_LENGTH =
  20;

const MAX_DESCRIPTION_LENGTH =
  2000;

const MAX_MATERIALS =
  5;

const MAX_CUSTOM_TAGS =
  10;

const MAX_CUSTOM_TAG_LENGTH =
  40;

const ALLOWED_IMAGE_TYPES =
  new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

/*=========================================================
Backend-Compatible Options
=========================================================*/

const ITEM_TYPES = [
  "T-Shirt",
  "Shirt",
  "Polo Shirt",
  "Blouse",
  "Top",
  "Tank Top",
  "Hoodie",
  "Sweatshirt",
  "Sweater",
  "Cardigan",
  "Jacket",
  "Blazer",
  "Coat",
  "Dress",
  "Gown",
  "Skirt",
  "Jeans",
  "Trousers",
  "Joggers",
  "Shorts",
  "Jumpsuit",
  "Romper",
  "Kurta",
  "Saree",
  "Lehenga",
  "Activewear Set",
  "Loungewear Set",
  "Sleepwear",
  "Swimwear",
  "Other",
];

const FIT_TYPES = [
  "Regular Fit",
  "Slim Fit",
  "Relaxed Fit",
  "Oversized / Loose Fit",
  "Tailored Fit",
];

const SIZE_CATEGORIES = [
  "Standard Size",
  "Plus Size",
  "Petite",
  "Tall",
];

const AUDIENCE_TYPES = [
  "Women",
  "Men",
  "Unisex",
  "Kids",
];

const MATERIAL_TYPES = [
  "100% Cotton",
  "Cotton Blend",
  "Denim",
  "Linen",
  "Silk",
  "Satin",
  "Polyester",
  "Fleece",
  "Wool",
  "Leather",
  "Stretch / Lycra",
  "Organic Fabric",
  "Recycled Fabric",
  "Other",
];

const WEAR_CATEGORIES = [
  "Casual Wear",
  "Formal Wear",
  "Party Wear",
  "Workwear",
  "Activewear / Gym",
  "Loungewear",
  "Traditional Wear",
  "Occasion Wear",
];

const STYLE_AESTHETICS = [
  "Minimalist / Basics",
  "Streetwear",
  "Classic",
  "Modern",
  "Luxury",
  "Vintage",
  "Bohemian",
  "Avant-Garde",
  "Sporty",
  "Preppy",
  "Y2K",
  "Sustainable / Organic",
];

const SEASONS = [
  "All Season",
  "Summer Essentials",
  "Winter Wear",
  "Spring",
  "Autumn / Fall",
];

/*=========================================================
Initial Form State
=========================================================*/

const INITIAL_FORM_STATE = {
  title: "",
  description: "",
  item_type: "T-Shirt",
  fit_type: "Regular Fit",
  size_category: "Standard Size",
  audience: "Unisex",
  materials: [],
  wear_category: "Casual Wear",
  style_aesthetic:
    "Minimalist / Basics",
  season: "All Season",
  tags: "",
};

/*=========================================================
Helpers
=========================================================*/

function getApiError(
  error,
  fallback,
) {
  if (
    error?.code ===
      "ERR_CANCELED" ||
    error?.name ===
      "CanceledError" ||
    error?.name ===
      "AbortError"
  ) {
    return "";
  }

  return (
    error?.response?.data
      ?.message ||
    error?.response?.data
      ?.error ||
    error?.message ||
    fallback
  );
}

function formatFileSize(
  value,
) {
  const bytes =
    Number(value);

  if (
    !Number.isFinite(bytes) ||
    bytes < 0
  ) {
    return "Unknown size";
  }

  if (
    bytes <
    1024
  ) {
    return `${bytes} B`;
  }

  if (
    bytes <
    1024 * 1024
  ) {
    return `${(
      bytes / 1024
    ).toFixed(1)} KB`;
  }

  return `${(
    bytes /
    (1024 * 1024)
  ).toFixed(2)} MB`;
}

function getExtensionFromMimeType(
  mimeType,
) {
  const extensions = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };

  return (
    extensions[mimeType] ||
    "png"
  );
}

function validateImageFile(
  file,
) {
  if (
    !(file instanceof File)
  ) {
    throw new Error(
      "The selected image could not be processed.",
    );
  }

  if (
    !ALLOWED_IMAGE_TYPES.has(
      file.type,
    )
  ) {
    throw new Error(
      "Only JPG, PNG and WEBP images are accepted.",
    );
  }

  if (
    !Number.isFinite(
      file.size,
    ) ||
    file.size <= 0
  ) {
    throw new Error(
      "The selected image appears to be empty.",
    );
  }

  if (
    file.size >
    MAX_IMAGE_BYTES
  ) {
    throw new Error(
      "The showcase image must not exceed 15 MB.",
    );
  }
}

function parseCustomTags(
  value,
) {
  const uniqueTags =
    new Map();

  String(value || "")
    .split(",")
    .map(tag =>
      tag
        .replace(
          /\s+/g,
          " ",
        )
        .trim()
        .slice(
          0,
          MAX_CUSTOM_TAG_LENGTH,
        ),
    )
    .filter(Boolean)
    .forEach(tag => {
      const key =
        tag.toLowerCase();

      if (
        !uniqueTags.has(
          key,
        )
      ) {
        uniqueTags.set(
          key,
          tag,
        );
      }
    });

  return Array.from(
    uniqueTags.values(),
  );
}

function isValidChoice(
  value,
  allowedValues,
) {
  return allowedValues.includes(
    value,
  );
}

function extractPublishedSlug(
  response,
) {
  return (
    response?.data?.data
      ?.slug ||
    response?.data?.data
      ?.design?.slug ||
    response?.data?.design
      ?.slug ||
    response?.data?.slug ||
    ""
  );
}

/*=========================================================
Reusable Section Header
=========================================================*/

function SectionHeader({
  icon: Icon,
  title,
  description,
}) {
  return (
    <div className="flex items-start gap-3 border-b border-line pb-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-subtle text-action">
        <Icon
          size={16}
          aria-hidden="true"
        />
      </div>

      <div>
        <h2 className="text-[10px] font-semibold uppercase tracking-normal text-ink dark:text-muted">
          {title}
        </h2>

        {description && (
          <p className="mt-1 text-xs leading-5 text-muted">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

/*=========================================================
Reusable Select Field
=========================================================*/

function SelectField({
  id,
  label,
  icon: Icon,
  value,
  options,
  onChange,
  disabled,
}) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="block pl-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted"
      >
        {label}
      </label>

      <div className="relative">
        <Icon
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
        />

        <select
          id={id}
          value={value}
          onChange={
            onChange
          }
          disabled={
            disabled
          }
          required
          className="h-[52px] w-full appearance-none rounded-md border border-line bg-canvas py-2 pl-11 pr-11 text-sm text-ink outline-none transition focus:border-line focus:ring-4 focus:ring-action disabled:cursor-not-allowed disabled:opacity-60"
        >
          {options.map(
            option => (
              <option
                key={option}
                value={option}
              >
                {option}
              </option>
            ),
          )}
        </select>

        <ChevronDown
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted"
        />
      </div>
    </div>
  );
}

/*=========================================================
Designer Upload Design
=========================================================*/

export default function DesignerUploadDesign() {
  const navigate =
    useNavigate();

  const [
    form,
    setForm,
  ] = useState(
    INITIAL_FORM_STATE,
  );

  const [
    displayImage,
    setDisplayImage,
  ] = useState(null);

  const [
    previewUrl,
    setPreviewUrl,
  ] = useState("");

  const [
    imageDimensions,
    setImageDimensions,
  ] = useState(null);

  const [
    dragActive,
    setDragActive,
  ] = useState(false);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    uploadProgress,
    setUploadProgress,
  ] = useState(0);

  const [
    success,
    setSuccess,
  ] = useState(false);

  const [
    errorMsg,
    setErrorMsg,
  ] = useState("");

  const imageInputRef =
    useRef(null);

  const navigationTimerRef =
    useRef(null);

  const uploadControllerRef =
    useRef(null);

  const dragDepthRef =
    useRef(0);

  const isMountedRef =
    useRef(true);

  const submissionLockedRef =
    useRef(false);

  /*=======================================================
  Cleanup
  =======================================================*/

  useEffect(() => {
    isMountedRef.current =
      true;

    return () => {
      isMountedRef.current =
        false;

      if (
        navigationTimerRef.current
      ) {
        window.clearTimeout(
          navigationTimerRef.current,
        );
      }

      uploadControllerRef.current
        ?.abort();
    };
  }, []);

  /*=======================================================
  Preview URL
  =======================================================*/

  useEffect(() => {
    if (
      !displayImage
    ) {
      setPreviewUrl("");
      setImageDimensions(
        null,
      );

      return undefined;
    }

    const objectUrl =
      URL.createObjectURL(
        displayImage,
      );

    setPreviewUrl(
      objectUrl,
    );

    return () => {
      URL.revokeObjectURL(
        objectUrl,
      );
    };
  }, [displayImage]);

  /*=======================================================
  Image Dimensions
  =======================================================*/

  useEffect(() => {
    if (
      !previewUrl
    ) {
      setImageDimensions(
        null,
      );

      return undefined;
    }

    let cancelled =
      false;

    const image =
      new window.Image();

    image.onload = () => {
      if (
        cancelled
      ) {
        return;
      }

      setImageDimensions({
        width:
          image.naturalWidth,

        height:
          image.naturalHeight,
      });
    };

    image.onerror = () => {
      if (
        !cancelled
      ) {
        setImageDimensions(
          null,
        );
      }
    };

    image.src =
      previewUrl;

    return () => {
      cancelled =
        true;
    };
  }, [previewUrl]);

  /*=======================================================
  Form Actions
  =======================================================*/

  const handleInputChange = (
    field,
    value,
  ) => {
    setForm(
      previous => ({
        ...previous,

        [field]:
          value,
      }),
    );

    setErrorMsg("");
  };

  const toggleMaterial = (
    material,
  ) => {
    if (
      loading ||
      success ||
      !MATERIAL_TYPES.includes(
        material,
      )
    ) {
      return;
    }

    setForm(
      previous => {
        const alreadySelected =
          previous.materials.includes(
            material,
          );

        if (
          alreadySelected
        ) {
          return {
            ...previous,

            materials:
              previous.materials.filter(
                item =>
                  item !==
                  material,
              ),
          };
        }

        if (
          previous.materials
            .length >=
          MAX_MATERIALS
        ) {
          setErrorMsg(
            `Select no more than ${MAX_MATERIALS} materials.`,
          );

          return previous;
        }

        return {
          ...previous,

          materials: [
            ...previous.materials,
            material,
          ],
        };
      },
    );
  };

  /*=======================================================
  Image Selection
  =======================================================*/

  const applySelectedImage = (
    file,
  ) => {
    validateImageFile(
      file,
    );

    setDisplayImage(
      file,
    );

    setUploadProgress(
      0,
    );

    setSuccess(
      false,
    );

    setErrorMsg("");
  };

  const handleFileChange =
    event => {
      const file =
        event.target
          .files?.[0];

      if (
        !file
      ) {
        return;
      }

      try {
        applySelectedImage(
          file,
        );
      } catch (error) {
        setErrorMsg(
          error?.message ||
            "The selected image could not be processed.",
        );

        if (
          imageInputRef.current
        ) {
          imageInputRef.current.value =
            "";
        }
      }
    };

  const openImagePicker =
    () => {
      if (
        loading ||
        success ||
        !imageInputRef.current
      ) {
        return;
      }

      imageInputRef.current.value =
        "";

      imageInputRef.current.click();
    };

  const clearSelectedImage =
    () => {
      if (
        loading ||
        success
      ) {
        return;
      }

      setDisplayImage(
        null,
      );

      setPreviewUrl("");

      setImageDimensions(
        null,
      );

      setUploadProgress(
        0,
      );

      setErrorMsg("");

      if (
        imageInputRef.current
      ) {
        imageInputRef.current.value =
          "";
      }
    };

  /*=======================================================
  Drag and Drop
  =======================================================*/

  const handleDragEnter =
    event => {
      event.preventDefault();
      event.stopPropagation();

      if (
        loading ||
        success
      ) {
        return;
      }

      dragDepthRef.current +=
        1;

      setDragActive(
        true,
      );
    };

  const handleDragOver =
    event => {
      event.preventDefault();
      event.stopPropagation();

      if (
        event.dataTransfer
      ) {
        event.dataTransfer.dropEffect =
          "copy";
      }
    };

  const handleDragLeave =
    event => {
      event.preventDefault();
      event.stopPropagation();

      dragDepthRef.current =
        Math.max(
          0,
          dragDepthRef.current -
            1,
        );

      if (
        dragDepthRef.current ===
        0
      ) {
        setDragActive(
          false,
        );
      }
    };

  const handleDrop =
    event => {
      event.preventDefault();
      event.stopPropagation();

      dragDepthRef.current =
        0;

      setDragActive(
        false,
      );

      if (
        loading ||
        success
      ) {
        return;
      }

      const files =
        Array.from(
          event.dataTransfer
            ?.files || [],
        );

      if (
        files.length === 0
      ) {
        return;
      }

      if (
        files.length > 1
      ) {
        setErrorMsg(
          "Upload one showcase image at a time.",
        );

        return;
      }

      try {
        applySelectedImage(
          files[0],
        );
      } catch (error) {
        setErrorMsg(
          error?.message ||
            "The dropped image could not be processed.",
        );
      }
    };

  /*=======================================================
  Derived Values
  =======================================================*/

  const customTags =
    useMemo(
      () =>
        parseCustomTags(
          form.tags,
        ),
      [form.tags],
    );

  const canSubmit =
    Boolean(
      displayImage,
    ) &&
    form.title
      .trim()
      .length >=
      MIN_TITLE_LENGTH &&
    form.description
      .trim()
      .length >=
      MIN_DESCRIPTION_LENGTH &&
    form.materials
      .length <=
      MAX_MATERIALS &&
    customTags.length <=
      MAX_CUSTOM_TAGS &&
    !loading &&
    !success;

  /*=======================================================
  Validation
  =======================================================*/

  const validateForm =
    () => {
      if (
        !displayImage
      ) {
        return "A display image is required for the showcase.";
      }

      try {
        validateImageFile(
          displayImage,
        );
      } catch (error) {
        return error.message;
      }

      const title =
        form.title.trim();

      const description =
        form.description.trim();

      if (
        title.length <
        MIN_TITLE_LENGTH
      ) {
        return `The design title must contain at least ${MIN_TITLE_LENGTH} characters.`;
      }

      if (
        title.length >
        MAX_TITLE_LENGTH
      ) {
        return `The design title cannot exceed ${MAX_TITLE_LENGTH} characters.`;
      }

      if (
        description.length <
        MIN_DESCRIPTION_LENGTH
      ) {
        return `The description must contain at least ${MIN_DESCRIPTION_LENGTH} characters.`;
      }

      if (
        description.length >
        MAX_DESCRIPTION_LENGTH
      ) {
        return `The description cannot exceed ${MAX_DESCRIPTION_LENGTH.toLocaleString()} characters.`;
      }

      const choiceChecks = [
        [
          form.item_type,
          ITEM_TYPES,
          "clothing item",
        ],
        [
          form.fit_type,
          FIT_TYPES,
          "fit type",
        ],
        [
          form.size_category,
          SIZE_CATEGORIES,
          "size category",
        ],
        [
          form.audience,
          AUDIENCE_TYPES,
          "audience",
        ],
        [
          form.wear_category,
          WEAR_CATEGORIES,
          "wear category",
        ],
        [
          form.style_aesthetic,
          STYLE_AESTHETICS,
          "style aesthetic",
        ],
        [
          form.season,
          SEASONS,
          "season",
        ],
      ];

      const invalidChoice =
        choiceChecks.find(
          ([
            value,
            choices,
          ]) =>
            !isValidChoice(
              value,
              choices,
            ),
        );

      if (
        invalidChoice
      ) {
        return `Select a valid ${invalidChoice[2]}.`;
      }

      if (
        form.materials
          .length >
        MAX_MATERIALS
      ) {
        return `Select no more than ${MAX_MATERIALS} materials.`;
      }

      const invalidMaterial =
        form.materials.find(
          material =>
            !MATERIAL_TYPES.includes(
              material,
            ),
        );

      if (
        invalidMaterial
      ) {
        return `${invalidMaterial} is not a valid material.`;
      }

      if (
        customTags.length >
        MAX_CUSTOM_TAGS
      ) {
        return `Add no more than ${MAX_CUSTOM_TAGS} custom search tags.`;
      }

      return "";
    };

  /*=======================================================
  Publish Manual Upload
  =======================================================*/

  const handleUploadSubmit =
    async event => {
      event.preventDefault();

      if (
        loading ||
        success ||
        submissionLockedRef.current
      ) {
        return;
      }

      const validationError =
        validateForm();

      if (
        validationError
      ) {
        setErrorMsg(
          validationError,
        );

        window.scrollTo({
          top: 0,
          behavior:
            "smooth",
        });

        return;
      }

      submissionLockedRef.current =
        true;

      const abortController =
        new AbortController();

      uploadControllerRef.current =
        abortController;

      setLoading(
        true,
      );

      setUploadProgress(
        0,
      );

      setErrorMsg("");

      const multipartData =
        new FormData();

      const fallbackExtension =
        getExtensionFromMimeType(
          displayImage.type,
        );

      const uploadFilename =
        displayImage.name ||
        `showcase-${Date.now()}.${fallbackExtension}`;

      multipartData.append(
        "preview",
        displayImage,
        uploadFilename,
      );

      multipartData.append(
        "title",
        form.title.trim(),
      );

      multipartData.append(
        "description",
        form.description.trim(),
      );

      multipartData.append(
        "item_type",
        form.item_type,
      );

      multipartData.append(
        "fit_type",
        form.fit_type,
      );

      multipartData.append(
        "size_category",
        form.size_category,
      );

      multipartData.append(
        "audience",
        form.audience,
      );

      multipartData.append(
        "materials",
        JSON.stringify(
          form.materials,
        ),
      );

      multipartData.append(
        "wear_category",
        form.wear_category,
      );

      multipartData.append(
        "style_aesthetic",
        form.style_aesthetic,
      );

      multipartData.append(
        "season",
        form.season,
      );

      multipartData.append(
        "tags",
        JSON.stringify(
          customTags,
        ),
      );

      /*
      This route is strictly for flattened manual uploads.

      The backend must also force these values instead of
      trusting values supplied by the browser.
      */

      multipartData.append(
        "source_type",
        "upload",
      );

      multipartData.append(
        "is_editable",
        "false",
      );

      multipartData.append(
        "allow_remix",
        "false",
      );

      /*
      Do not append editor_project_id or original_design_id.

      The upload controller must save both columns as NULL.
      Sending an empty string may break a PostgreSQL BIGINT
      column.
      */

      try {
        const response =
          await API.post(
            SHOWCASE_UPLOAD_ENDPOINT,
            multipartData,
            {
              signal:
                abortController.signal,

              /*
              Do not manually set multipart Content-Type.
              Axios adds the required multipart boundary.
              */

              onUploadProgress:
                progressEvent => {
                  if (
                    !isMountedRef.current
                  ) {
                    return;
                  }

                  const loaded =
                    Number(
                      progressEvent.loaded,
                    );

                  const total =
                    Number(
                      progressEvent.total,
                    );

                  if (
                    !Number.isFinite(
                      total,
                    ) ||
                    total <= 0
                  ) {
                    return;
                  }

                  const progress =
                    Math.min(
                      99,
                      Math.max(
                        1,
                        Math.round(
                          (
                            loaded /
                            total
                          ) *
                            100,
                        ),
                      ),
                    );

                  setUploadProgress(
                    progress,
                  );
                },
            },
          );

        if (
          !isMountedRef.current
        ) {
          return;
        }

        setUploadProgress(
          100,
        );

        setSuccess(
          true,
        );

        setLoading(
          false,
        );

        const publishedSlug =
          extractPublishedSlug(
            response,
          );

        navigationTimerRef.current =
          window.setTimeout(
            () => {
              if (
                !isMountedRef.current
              ) {
                return;
              }

              if (
                publishedSlug
              ) {
                navigate(
                  `/designer/showcase/${encodeURIComponent(
                    publishedSlug,
                  )}`,
                );

                return;
              }

              navigate(
                "/designer/inventory",
              );
            },
            1200,
          );
      } catch (error) {
        if (
          !isMountedRef.current
        ) {
          return;
        }

        const message =
          getApiError(
            error,
            "The design could not be published. Please try again.",
          );

        if (
          message
        ) {
          setErrorMsg(
            message,
          );
        }

        setUploadProgress(
          0,
        );
      } finally {
        uploadControllerRef.current =
          null;

        submissionLockedRef.current =
          false;

        if (
          isMountedRef.current
        ) {
          setLoading(
            false,
          );
        }
      }
    };

  /*=======================================================
  Render
  =======================================================*/

  return (
    <section className="relative w-full overflow-hidden pb-8 text-ink">
      {/* Decorative background */}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >



      </div>

      <div className="relative z-10 mx-auto max-w-[1300px]">
        {/* Page heading */}

        <header className="mb-10 text-center">
          <div className="inline-flex items-center justify-center gap-2 rounded-md border border-line bg-subtle px-4 py-2 text-[11px] font-semibold uppercase tracking-normal text-action">
            <Compass
              size={13}
              aria-hidden="true"
            />

            Manual Showcase Upload
          </div>

          <h1 className="mt-5 font-sans text-4xl font-light tracking-tight sm:text-5xl lg:text-6xl">
            Publish a finished{" "}

            <span className="italic text-action">
              image
            </span>
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted">
            Add a completed fashion presentation to your
            public showcase with its classification,
            materials and discovery tags.
          </p>

          <div className="mx-auto mt-5 flex w-fit max-w-3xl items-start gap-3 rounded-md border border-line bg-canvas px-5 py-4 text-left text-xs leading-6 text-action dark:bg-subtle">
            <LockKeyhole
              size={17}
              aria-hidden="true"
              className="mt-0.5 shrink-0"
            />

            <span>
              A manually uploaded image is presentation-only.
              It cannot be opened in Fashion Editor, edited as
              canvas data or remixed. To publish an editable
              project, use{" "}

              <strong>
                Share to Showcase
              </strong>{" "}

              from inside Fashion Editor.
            </span>
          </div>
        </header>

        {/* Success message */}

        {success && (
          <div
            role="status"
            aria-live="polite"
            className="mb-8 flex items-start gap-3 rounded-md border border-line bg-canvas p-4 text-action dark:bg-subtle"
          >
            <CheckCircle2
              size={19}
              aria-hidden="true"
              className="mt-0.5 shrink-0"
            />

            <div>
              <p className="text-sm font-semibold">
                Design published successfully
              </p>

              <p className="mt-1 text-xs leading-5 opacity-75">
                Opening your published showcase design…
              </p>
            </div>
          </div>
        )}

        {/* Error message */}

        {errorMsg && (
          <div
            role="alert"
            aria-live="assertive"
            className="mb-8 flex items-start justify-between gap-4 rounded-md border border-line bg-canvas p-4 text-action dark:bg-subtle"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle
                size={19}
                aria-hidden="true"
                className="mt-0.5 shrink-0"
              />

              <div>
                <p className="text-sm font-semibold">
                  Unable to publish design
                </p>

                <p className="mt-1 text-xs leading-5 opacity-80">
                  {errorMsg}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setErrorMsg("")
              }
              aria-label="Dismiss error"
              className="shrink-0 opacity-60 transition hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-action"
            >
              <X size={17} />
            </button>
          </div>
        )}

        <form
          onSubmit={
            handleUploadSubmit
          }
          noValidate
          className="overflow-hidden rounded-md border border-line bg-surface"
        >
          <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
            {/* Image panel */}

            <section className="border-b border-line bg-subtle p-4 lg:border-b-0 lg:border-r">
              <SectionHeader
                icon={FileImage}
                title="Showcase Visual"
                description="Upload the finished image that visitors will see."
              />

              <div
                onDragEnter={
                  handleDragEnter
                }
                onDragOver={
                  handleDragOver
                }
                onDragLeave={
                  handleDragLeave
                }
                onDrop={
                  handleDrop
                }
                className={`group relative mt-6 overflow-hidden rounded-md border-2 border-dashed transition ${
                  dragActive
                    ? "border-line bg-subtle"
                    : displayImage
                      ? "border-line bg-surface dark:bg-canvas"
                      : "border-line bg-surface hover:border-line dark:bg-canvas"
                }`}
              >
                {displayImage &&
                previewUrl ? (
                  <div>
                    <div className="relative aspect-[4/5] overflow-hidden bg-subtle dark:bg-canvas">
                      <img
                        src={previewUrl}
                        alt={`Preview of ${
                          form.title ||
                          "selected showcase design"
                        }`}
                        className="h-full w-full object-contain"
                      />

                      <div className="absolute left-4 top-4 flex items-center gap-2 rounded-md border border-line bg-black/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-ink">
                        <CheckCircle2
                          size={12}
                          aria-hidden="true"
                          className="text-action"
                        />

                        Manual Upload
                      </div>

                      <button
                        type="button"
                        onClick={
                          clearSelectedImage
                        }
                        disabled={
                          loading ||
                          success
                        }
                        aria-label="Remove selected image"
                        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-md border border-line bg-black/60 text-ink transition hover:bg-action disabled:cursor-not-allowed disabled:opacity-50 hover:text-on-action"
                      >
                        <X
                          size={15}
                        />
                      </button>
                    </div>

                    <div className="border-t border-line p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p
                            title={
                              displayImage.name
                            }
                            className="truncate text-sm font-semibold"
                          >
                            {
                              displayImage.name
                            }
                          </p>

                          <p className="mt-1 text-xs text-muted">
                            {formatFileSize(
                              displayImage.size,
                            )}

                            {imageDimensions &&
                              ` • ${imageDimensions.width} × ${imageDimensions.height}px`}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={
                            openImagePicker
                          }
                          disabled={
                            loading ||
                            success
                          }
                          className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.15em] text-action transition hover:underline disabled:opacity-50"
                        >
                          Replace
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={
                      openImagePicker
                    }
                    disabled={
                      loading ||
                      success
                    }
                    className="flex min-h-[500px] w-full flex-col items-center justify-center p-4 text-center disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="flex h-20 w-20 items-center justify-center rounded-full border border-line bg-subtle text-muted transition duration-300 group-hover:scale-105 group-hover:border-line group-hover:text-action">
                      <UploadCloud
                        size={32}
                        aria-hidden="true"
                      />
                    </div>

                    <p className="mt-6 text-sm font-bold uppercase tracking-[0.18em]">
                      Upload showcase image
                    </p>

                    <p className="mt-3 max-w-xs text-xs leading-6 text-muted">
                      Drag and drop one image here or click to
                      browse.
                    </p>

                    <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.15em] text-muted">
                      JPG, PNG or WEBP • Maximum 15 MB
                    </p>
                  </button>
                )}

                <input
                  ref={
                    imageInputRef
                  }
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  onChange={
                    handleFileChange
                  }
                  disabled={
                    loading ||
                    success
                  }
                  aria-label="Choose showcase image"
                  className="hidden"
                />
              </div>

              {/* Source classification */}

              <div className="mt-5 rounded-md border border-line bg-surface p-4 dark:bg-subtle">
                <div className="flex items-start gap-3">
                  <ShieldCheck
                    size={18}
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 text-action"
                  />

                  <div className="w-full">
                    <p className="text-sm font-semibold">
                      Publication classification
                    </p>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-md bg-canvas px-2 py-3 dark:bg-subtle">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted">
                          Source
                        </p>

                        <p className="mt-1 text-[10px] font-bold">
                          Upload
                        </p>
                      </div>

                      <div className="rounded-md bg-canvas px-2 py-3 dark:bg-subtle">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted">
                          Editable
                        </p>

                        <p className="mt-1 text-[10px] font-bold">
                          No
                        </p>
                      </div>

                      <div className="rounded-md bg-canvas px-2 py-3 dark:bg-subtle">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted">
                          Remix
                        </p>

                        <p className="mt-1 text-[10px] font-bold">
                          Disabled
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Information panel */}

            <section className="space-y-10 p-4 lg:p-4">
              {/* Basic information */}

              <div className="space-y-6">
                <SectionHeader
                  icon={ImageIcon}
                  title="Design Information"
                  description="Give the design a clear title and description."
                />

                <div className="space-y-2">
                  <label
                    htmlFor="design-title"
                    className="block pl-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted"
                  >
                    Design title
                  </label>

                  <input
                    id="design-title"
                    type="text"
                    minLength={
                      MIN_TITLE_LENGTH
                    }
                    maxLength={
                      MAX_TITLE_LENGTH
                    }
                    value={
                      form.title
                    }
                    onChange={
                      event =>
                        handleInputChange(
                          "title",
                          event.target
                            .value,
                        )
                    }
                    placeholder="Example: Oversized Midnight Hoodie"
                    required
                    autoComplete="off"
                    disabled={
                      loading ||
                      success
                    }
                    className="h-[54px] w-full rounded-md border border-line bg-canvas px-4 text-sm text-ink outline-none transition placeholder:text-muted focus:border-line focus:ring-4 focus:ring-action disabled:opacity-60"
                  />

                  <p className="text-right text-[10px] text-muted">
                    {
                      form.title
                        .length
                    }
                    /
                    {
                      MAX_TITLE_LENGTH
                    }
                  </p>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="design-description"
                    className="block pl-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted"
                  >
                    Inspiration and description
                  </label>

                  <textarea
                    id="design-description"
                    minLength={
                      MIN_DESCRIPTION_LENGTH
                    }
                    maxLength={
                      MAX_DESCRIPTION_LENGTH
                    }
                    rows={6}
                    value={
                      form.description
                    }
                    onChange={
                      event =>
                        handleInputChange(
                          "description",
                          event.target
                            .value,
                        )
                    }
                    placeholder="Describe the concept, silhouette, inspiration, construction details or intended mood..."
                    required
                    disabled={
                      loading ||
                      success
                    }
                    className="w-full resize-y rounded-md border border-line bg-canvas px-4 py-4 text-sm leading-7 text-ink outline-none transition placeholder:text-muted focus:border-line focus:ring-4 focus:ring-action disabled:opacity-60"
                  />

                  <div className="flex items-center justify-between text-[10px] text-muted">
                    <span>
                      Minimum{" "}
                      {
                        MIN_DESCRIPTION_LENGTH
                      }{" "}
                      characters
                    </span>

                    <span>
                      {
                        form
                          .description
                          .length
                      }
                      /
                      {
                        MAX_DESCRIPTION_LENGTH
                      }
                    </span>
                  </div>
                </div>
              </div>

              {/* Clothing classification */}

              <div className="space-y-6">
                <SectionHeader
                  icon={Shirt}
                  title="Clothing Classification"
                  description="Describe the garment, audience and fitting."
                />

                <div className="grid gap-5 sm:grid-cols-2">
                  <SelectField
                    id="item-type"
                    label="Clothing item"
                    icon={Shirt}
                    value={
                      form.item_type
                    }
                    options={
                      ITEM_TYPES
                    }
                    disabled={
                      loading ||
                      success
                    }
                    onChange={
                      event =>
                        handleInputChange(
                          "item_type",
                          event.target
                            .value,
                        )
                    }
                  />

                  <SelectField
                    id="audience"
                    label="Audience"
                    icon={
                      UserRound
                    }
                    value={
                      form.audience
                    }
                    options={
                      AUDIENCE_TYPES
                    }
                    disabled={
                      loading ||
                      success
                    }
                    onChange={
                      event =>
                        handleInputChange(
                          "audience",
                          event.target
                            .value,
                        )
                    }
                  />

                  <SelectField
                    id="fit-type"
                    label="Fit type"
                    icon={Ruler}
                    value={
                      form.fit_type
                    }
                    options={
                      FIT_TYPES
                    }
                    disabled={
                      loading ||
                      success
                    }
                    onChange={
                      event =>
                        handleInputChange(
                          "fit_type",
                          event.target
                            .value,
                        )
                    }
                  />

                  <SelectField
                    id="size-category"
                    label="Size category"
                    icon={Layers3}
                    value={
                      form.size_category
                    }
                    options={
                      SIZE_CATEGORIES
                    }
                    disabled={
                      loading ||
                      success
                    }
                    onChange={
                      event =>
                        handleInputChange(
                          "size_category",
                          event.target
                            .value,
                        )
                    }
                  />
                </div>
              </div>

              {/* Style and usage */}

              <div className="space-y-6">
                <SectionHeader
                  icon={Palette}
                  title="Style and Usage"
                  description="Classify the aesthetic, occasion and season."
                />

                <div className="grid gap-5 sm:grid-cols-2">
                  <SelectField
                    id="wear-category"
                    label="Wear category"
                    icon={Package}
                    value={
                      form.wear_category
                    }
                    options={
                      WEAR_CATEGORIES
                    }
                    disabled={
                      loading ||
                      success
                    }
                    onChange={
                      event =>
                        handleInputChange(
                          "wear_category",
                          event.target
                            .value,
                        )
                    }
                  />

                  <SelectField
                    id="style-aesthetic"
                    label="Style aesthetic"
                    icon={Palette}
                    value={
                      form.style_aesthetic
                    }
                    options={
                      STYLE_AESTHETICS
                    }
                    disabled={
                      loading ||
                      success
                    }
                    onChange={
                      event =>
                        handleInputChange(
                          "style_aesthetic",
                          event.target
                            .value,
                        )
                    }
                  />

                  <div className="sm:col-span-2">
                    <SelectField
                      id="season"
                      label="Season"
                      icon={
                        CalendarDays
                      }
                      value={
                        form.season
                      }
                      options={
                        SEASONS
                      }
                      disabled={
                        loading ||
                        success
                      }
                      onChange={
                        event =>
                          handleInputChange(
                            "season",
                            event.target
                              .value,
                          )
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Materials */}

              <div className="space-y-5">
                <SectionHeader
                  icon={Layers3}
                  title="Materials"
                  description={`Select up to ${MAX_MATERIALS} materials.`}
                />

                <div className="flex items-center justify-between text-xs text-muted">
                  <span>
                    Multiple selections allowed
                  </span>

                  <span>
                    {
                      form.materials
                        .length
                    }
                    /
                    {
                      MAX_MATERIALS
                    }{" "}
                    selected
                  </span>
                </div>

                <div className="flex flex-wrap gap-2.5">
                  {MATERIAL_TYPES.map(
                    material => {
                      const selected =
                        form.materials.includes(
                          material,
                        );

                      const limitReached =
                        !selected &&
                        form.materials
                          .length >=
                          MAX_MATERIALS;

                      return (
                        <button
                          key={
                            material
                          }
                          type="button"
                          onClick={() =>
                            toggleMaterial(
                              material,
                            )
                          }
                          disabled={
                            loading ||
                            success ||
                            limitReached
                          }
                          aria-pressed={
                            selected
                          }
                          className={`rounded-md border px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] transition disabled:cursor-not-allowed disabled:opacity-40 ${
                            selected
                              ? "border-line bg-subtle text-action"
                              : "border-line bg-canvas text-muted hover:border-line hover:text-action dark:bg-subtle"
                          }`}
                        >
                          {selected && (
                            <CheckCircle2
                              size={
                                12
                              }
                              aria-hidden="true"
                              className="mr-1.5 inline"
                            />
                          )}

                          {
                            material
                          }
                        </button>
                      );
                    },
                  )}
                </div>
              </div>

              {/* Search tags */}

              <div className="space-y-5">
                <SectionHeader
                  icon={Tag}
                  title="Search Discovery"
                  description="Add optional search terms that help visitors discover the design."
                />

                <div className="space-y-2">
                  <label
                    htmlFor="design-tags"
                    className="block pl-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted"
                  >
                    Custom search tags
                  </label>

                  <div className="relative">
                    <Tag
                      size={16}
                      aria-hidden="true"
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-muted"
                    />

                    <input
                      id="design-tags"
                      type="text"
                      maxLength={
                        400
                      }
                      value={
                        form.tags
                      }
                      onChange={
                        event =>
                          handleInputChange(
                            "tags",
                            event.target
                              .value,
                          )
                      }
                      placeholder="tailoring, handmade, layered, neutral tones"
                      autoComplete="off"
                      disabled={
                        loading ||
                        success
                      }
                      className="h-[54px] w-full rounded-md border border-line bg-canvas pl-11 pr-4 text-sm text-ink outline-none transition placeholder:text-muted focus:border-line focus:ring-4 focus:ring-action disabled:opacity-60"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-muted">
                    <span>
                      Separate tags using commas
                    </span>

                    <span
                      className={
                        customTags.length >
                        MAX_CUSTOM_TAGS
                          ? "font-semibold text-action"
                          : ""
                      }
                    >
                      {
                        customTags.length
                      }
                      /
                      {
                        MAX_CUSTOM_TAGS
                      }{" "}
                      tags
                    </span>
                  </div>
                </div>

                {customTags.length >
                  0 && (
                  <div className="flex flex-wrap gap-2">
                    {customTags
                      .slice(
                        0,
                        MAX_CUSTOM_TAGS,
                      )
                      .map(tag => (
                        <span
                          key={
                            tag.toLowerCase()
                          }
                          className="max-w-full truncate rounded-md border border-line bg-canvas px-3 py-1.5 text-[10px] text-muted dark:bg-subtle"
                        >
                          #{tag}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Publish action area */}

          <div className="border-t border-line bg-subtle p-4">
            {loading && (
              <div
                className="mb-5"
                role="status"
                aria-live="polite"
              >
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>
                    Publishing showcase design
                  </span>

                  <span className="font-mono">
                    {uploadProgress >
                    0
                      ? `${uploadProgress}%`
                      : "Uploading..."}
                  </span>
                </div>

                <div className="mt-2 h-2 overflow-hidden rounded-full bg-subtle">
                  <div
                    className={`h-full rounded-full bg-action transition-all duration-300 text-on-action ${
                      uploadProgress ===
                      0
                        ? "animate-pulse"
                        : ""
                    }`}
                    style={{
                      width:
                        uploadProgress >
                        0
                          ? `${uploadProgress}%`
                          : "35%",
                    }}
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <Sparkles
                  size={17}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-action"
                />

                <div>
                  <p className="text-sm font-semibold">
                    Ready for the showcase
                  </p>

                  <p className="mt-1 text-xs leading-5 text-muted">
                    This publication will be stored as a
                    non-editable, non-remixable uploaded image.
                  </p>
                </div>
              </div>

              <button
                type="submit"
                disabled={
                  !canSubmit
                }
                className="flex h-[54px] min-w-[240px] items-center justify-center gap-3 rounded-md bg-action px-6 text-[10px] font-semibold uppercase tracking-normal text-on-action transition hover:-translate-y-0.5 hover:bg-action focus:outline-none focus:ring-4 focus:ring-action disabled:cursor-not-allowed disabled:translate-y-0 disabled:bg-subtle disabled:text-muted hover:text-on-action"
              >
                {loading ? (
                  <>
                    <Loader2
                      size={16}
                      aria-hidden="true"
                      className="animate-spin"
                    />

                    {uploadProgress >
                    0
                      ? `Publishing ${uploadProgress}%`
                      : "Publishing..."}
                  </>
                ) : success ? (
                  <>
                    <CheckCircle2
                      size={16}
                      aria-hidden="true"
                    />

                    Published
                  </>
                ) : (
                  <>
                    <UploadCloud
                      size={16}
                      aria-hidden="true"
                    />

                    Publish to Showcase
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}