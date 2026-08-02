import React, {
    useEffect,
    useRef,
    useState
} from "react";

import {
    useNavigate
} from "react-router-dom";

import API from "../../api/axios";

import {
    Image as ImageIcon,
    Loader2,
    CheckCircle2,
    AlertTriangle,
    X,
    Compass,
    UploadCloud,
    Sparkles
} from "lucide-react";

import {
    useSketchStore
} from "../sketches/useSketchStore";

/*=========================================================
Initial Form State
=========================================================*/

const INITIAL_FORM_STATE = {
    title: "",
    description: "",
    style_category: "Concept Art",
    tags: "",
    canvas_state: "{}"
};

/*=========================================================
Designer Upload Design
=========================================================*/

const DesignerUploadDesign = () => {

    const navigate =
        useNavigate();

    /*=====================================================
    Zustand Store
    =====================================================*/

    const pendingStudioImage =
        useSketchStore(
            state =>
                state.pendingStudioImage
        );

    const setPendingStudioImage =
        useSketchStore(
            state =>
                state.setPendingStudioImage
        );

    /*
    The drawing store uses the name "lines".
    We expose it locally as "strokes" for the upload.
    */

    const strokes =
        useSketchStore(
            state =>
                state.lines
        );

    /*=====================================================
    Local State
    =====================================================*/

    const [
        loading,
        setLoading
    ] = useState(false);

    const [
        success,
        setSuccess
    ] = useState(false);

    const [
        errorMsg,
        setErrorMsg
    ] = useState("");

    const [
        displayImage,
        setDisplayImage
    ] = useState(null);

    const [
        form,
        setForm
    ] = useState(
        INITIAL_FORM_STATE
    );

    const imageInputRef =
        useRef(null);

    /*=====================================================
    Receive Image From Studio
    =====================================================*/

    useEffect(() => {

        if (!pendingStudioImage)
            return;

        setDisplayImage(
            pendingStudioImage
        );

        /*
        Remove the temporary store image after transferring
        it into this page's local state.
        */

        setPendingStudioImage(null);

    }, [
        pendingStudioImage,
        setPendingStudioImage
    ]);

    /*=====================================================
    Update Form Field
    =====================================================*/

    const handleInputChange = (
        field,
        value
    ) => {

        setForm(previousForm => ({
            ...previousForm,
            [field]: value
        }));

    };

    /*=====================================================
    Select Image File
    =====================================================*/

    const handleFileChange =
        event => {

            const file =
                event.target.files?.[0];

            if (!file)
                return;

            try {

                setErrorMsg("");

                const maxBytes =
                    15 *
                    1024 *
                    1024;

                if (
                    file.size >
                    maxBytes
                ) {

                    throw new Error(
                        `${file.name} exceeds the maximum 15MB showcase threshold.`
                    );

                }

                if (
                    !file.type.startsWith(
                        "image/"
                    )
                ) {

                    throw new Error(
                        "Only high-resolution images such as JPG, PNG, and WEBP are accepted."
                    );

                }

                setDisplayImage(
                    file
                );

            } catch (error) {

                setErrorMsg(
                    error.message ||
                    "The selected file could not be processed."
                );

                if (
                    imageInputRef.current
                ) {

                    imageInputRef.current.value =
                        "";

                }

            }

        };

    /*=====================================================
    Remove Selected Image
    =====================================================*/

    const clearFileSlot = () => {

        setDisplayImage(null);

        if (
            imageInputRef.current
        ) {

            imageInputRef.current.value =
                "";

        }

    };

    /*=====================================================
    Format Selected File Name
    =====================================================*/

    const displayImageName = (() => {

        if (!displayImage)
            return "";

        if (
            typeof displayImage.name ===
            "string"
        ) {

            return displayImage.name;

        }

        return "Studio design preview";

    })();

    /*=====================================================
    Format Selected File Size
    =====================================================*/

    const displayImageSize = (() => {

        const size =
            Number(
                displayImage?.size
            );

        if (!Number.isFinite(size))
            return null;

        return (
            size /
            (
                1024 *
                1024
            )
        ).toFixed(2);

    })();

    /*=====================================================
    Submit Upload
    =====================================================*/

    const handleUploadSubmit =
        async event => {

            event.preventDefault();

            setErrorMsg("");
            setSuccess(false);

            if (!displayImage) {

                setErrorMsg(
                    "Missing Showcase Asset: A display image is required to publish to the exhibition."
                );

                return;

            }

            setLoading(true);

            const multipartData =
                new FormData();

            /*
            Add normal form values.
            */

            Object.keys(form).forEach(
                key => {

                    /*
                    canvas_state is added separately below so
                    the latest sketch data is always used.
                    */

                    if (
                        key ===
                        "canvas_state"
                    ) {
                        return;
                    }

                    if (
                        key ===
                        "tags"
                    ) {

                        const standardizedTags =
                            form.tags
                                .split(",")
                                .map(tag =>
                                    tag
                                        .trim()
                                        .toLowerCase()
                                        .replace(
                                            /[^a-z0-9-]/g,
                                            ""
                                        )
                                )
                                .filter(Boolean);

                        multipartData.append(
                            "tags",
                            JSON.stringify(
                                standardizedTags
                            )
                        );

                        return;

                    }

                    multipartData.append(
                        key,
                        form[key]
                    );

                }
            );

            /*
            Add the preview image.
            */

            multipartData.append(
                "preview",
                displayImage
            );

            /*
            Add the current canvas state.

            The Zustand store calls these "lines", but this
            page uses the local variable name "strokes".
            */

            const canvasState =
                Array.isArray(strokes)
                    ? strokes
                    : [];

            multipartData.append(
                "canvas_state",
                JSON.stringify(
                    canvasState
                )
            );

            try {

                await API.post(
                    "/studio/upload",
                    multipartData,
                    {
                        headers: {
                            "Content-Type":
                                "multipart/form-data"
                        }
                    }
                );

                setSuccess(true);

                setTimeout(() => {

                    navigate(
                        "/designer/explore"
                    );

                }, 1500);

            } catch (error) {

                setErrorMsg(
                    error.response
                        ?.data
                        ?.message ||
                    "Transmission interrupted. Please try again."
                );

            } finally {

                setLoading(false);

            }

        };

    /*=====================================================
    Render
    =====================================================*/

    return (
        <div
            className="
                selection:bg-[#D4AF37]
                selection:text-black
                relative
                z-10
                min-h-screen
                w-full
                bg-slate-50
                text-slate-900
                antialiased
                transition-colors
                duration-300
                animate-fade-in-up
                dark:bg-[#030303]
                dark:text-white
            "
        >

            {/* Background glow */}

            <div
                className="
                    pointer-events-none
                    fixed
                    inset-0
                    z-[-1]
                    overflow-hidden
                "
            >

                <div
                    className="
                        absolute
                        right-[-10%]
                        top-[-10%]
                        h-[50vw]
                        w-[50vw]
                        rounded-full
                        bg-[#D4AF37]/5
                        blur-[150px]
                    "
                />

            </div>

            <main
                className="
                    relative
                    z-10
                    mx-auto
                    max-w-4xl
                    px-6
                    py-16
                    md:px-12
                "
            >

                {/* Header */}

                <div
                    className="
                        mb-12
                        space-y-4
                        text-center
                    "
                >

                    <div
                        className="
                            inline-flex
                            items-center
                            justify-center
                            gap-2
                            rounded-full
                            border
                            border-slate-200
                            bg-white
                            px-4
                            py-1.5
                            text-[9px]
                            font-bold
                            uppercase
                            tracking-[0.4em]
                            text-[#D4AF37]
                            shadow-sm
                            backdrop-blur-md
                            transition-colors
                            duration-300
                            dark:border-white/10
                            dark:bg-white/5
                            dark:shadow-[0_0_20px_rgba(212,175,55,0.1)]
                        "
                    >

                        <Compass size={12} />

                        Design Portfolio Studio

                    </div>

                    <h1
                        className="
                            text-4xl
                            font-serif
                            font-light
                            tracking-tighter
                            text-slate-900
                            drop-shadow-md
                            transition-colors
                            duration-300
                            md:text-6xl
                            dark:text-white
                            dark:drop-shadow-xl
                        "
                    >

                        Publish to{" "}

                        <span
                            className="
                                font-bold
                                italic
                                text-[#D4AF37]
                            "
                        >
                            Showcase
                        </span>

                    </h1>

                </div>

                {/* Success message */}

                {success && (

                    <div
                        className="
                            mb-8
                            flex
                            items-center
                            justify-center
                            gap-3
                            rounded-2xl
                            border
                            border-emerald-500/20
                            bg-emerald-50
                            p-5
                            text-[10px]
                            font-bold
                            uppercase
                            tracking-[0.2em]
                            text-emerald-600
                            shadow-sm
                            backdrop-blur-md
                            transition-colors
                            duration-300
                            animate-in
                            fade-in
                            zoom-in
                            dark:bg-emerald-500/10
                            dark:text-emerald-400
                            dark:shadow-[0_0_30px_rgba(16,185,129,0.15)]
                        "
                    >

                        <CheckCircle2
                            size={18}
                            className="shrink-0"
                        />

                        <p>
                            Masterpiece published successfully.
                            Routing to exhibition...
                        </p>

                    </div>

                )}

                {/* Error message */}

                {errorMsg && (

                    <div
                        className="
                            mb-8
                            flex
                            items-center
                            justify-center
                            gap-3
                            rounded-2xl
                            border
                            border-rose-500/20
                            bg-rose-50
                            p-5
                            text-[10px]
                            font-bold
                            uppercase
                            tracking-[0.2em]
                            text-rose-600
                            shadow-sm
                            backdrop-blur-md
                            transition-colors
                            duration-300
                            animate-in
                            fade-in
                            zoom-in
                            dark:bg-rose-500/10
                            dark:text-rose-400
                            dark:shadow-[0_0_30px_rgba(244,63,94,0.15)]
                        "
                    >

                        <AlertTriangle
                            size={18}
                            className="shrink-0"
                        />

                        <p>
                            {errorMsg}
                        </p>

                    </div>

                )}

                <form
                    onSubmit={
                        handleUploadSubmit
                    }
                    className="
                        relative
                        space-y-10
                        overflow-hidden
                        rounded-3xl
                        border
                        border-slate-200
                        bg-white
                        p-8
                        shadow-xl
                        transition-colors
                        duration-300
                        md:p-12
                        dark:border-white/5
                        dark:bg-[#0c0c0c]
                        dark:shadow-2xl
                    "
                >

                    {/* Showcase image */}

                    <div className="space-y-5">

                        <div
                            className="
                                flex
                                items-center
                                gap-3
                                border-b
                                border-slate-200
                                pb-4
                                transition-colors
                                duration-300
                                dark:border-white/5
                            "
                        >

                            <Sparkles
                                size={16}
                                className="text-[#D4AF37]"
                            />

                            <h3
                                className="
                                    text-[10px]
                                    font-bold
                                    uppercase
                                    tracking-[0.3em]
                                    text-slate-500
                                    transition-colors
                                    duration-300
                                    dark:text-white/50
                                "
                            >
                                Showcase Visuals
                            </h3>

                        </div>

                        <div
                            className={`
                                relative
                                flex
                                min-h-[200px]
                                flex-col
                                items-center
                                justify-center
                                rounded-2xl
                                border-2
                                border-dashed
                                p-10
                                text-center
                                transition-all
                                duration-300
                                ${
                                    displayImage
                                        ? `
                                            border-[#D4AF37]/50
                                            bg-slate-50
                                            shadow-sm
                                            dark:bg-white/5
                                            dark:shadow-[0_0_20px_rgba(212,175,55,0.1)]
                                        `
                                        : `
                                            cursor-pointer
                                            border-slate-300
                                            hover:border-[#D4AF37]/30
                                            hover:bg-slate-50
                                            dark:border-white/10
                                            dark:hover:bg-white/5
                                        `
                                }
                            `}
                        >

                            {displayImage ? (

                                <div
                                    className="
                                        flex
                                        flex-col
                                        items-center
                                        justify-center
                                        space-y-3
                                        animate-in
                                        zoom-in
                                        duration-300
                                    "
                                >

                                    <div
                                        className="
                                            flex
                                            h-12
                                            w-12
                                            items-center
                                            justify-center
                                            rounded-full
                                            border
                                            border-[#D4AF37]/30
                                            bg-[#D4AF37]/20
                                        "
                                    >

                                        <CheckCircle2
                                            className="text-[#D4AF37]"
                                            size={24}
                                        />

                                    </div>

                                    <p
                                        className="
                                            max-w-xs
                                            truncate
                                            font-serif
                                            text-sm
                                            text-slate-800
                                            transition-colors
                                            duration-300
                                            dark:text-white
                                        "
                                    >
                                        {displayImageName}
                                    </p>

                                    {displayImageSize && (

                                        <p
                                            className="
                                                font-mono
                                                text-[10px]
                                                text-slate-400
                                                transition-colors
                                                duration-300
                                                dark:text-white/40
                                            "
                                        >
                                            {displayImageSize} MB
                                        </p>

                                    )}

                                    <button
                                        type="button"
                                        onClick={
                                            clearFileSlot
                                        }
                                        disabled={loading}
                                        className="
                                            mt-4
                                            flex
                                            items-center
                                            gap-1.5
                                            rounded-full
                                            border
                                            border-rose-200
                                            bg-rose-50
                                            px-4
                                            py-2
                                            text-[9px]
                                            font-bold
                                            uppercase
                                            tracking-[0.2em]
                                            text-rose-500
                                            transition-colors
                                            duration-300
                                            hover:bg-rose-100
                                            hover:text-rose-600
                                            disabled:cursor-not-allowed
                                            disabled:opacity-50
                                            dark:border-rose-500/20
                                            dark:bg-rose-500/10
                                            dark:text-rose-400
                                            dark:hover:bg-rose-500/20
                                            dark:hover:text-rose-300
                                        "
                                    >

                                        <X size={12} />

                                        Remove Asset

                                    </button>

                                </div>

                            ) : (

                                <>

                                    <div
                                        className="
                                            mb-4
                                            flex
                                            h-16
                                            w-16
                                            items-center
                                            justify-center
                                            rounded-full
                                            border
                                            border-slate-200
                                            bg-slate-100
                                            transition-transform
                                            duration-500
                                            group-hover:scale-110
                                            group-hover:border-[#D4AF37]/30
                                            dark:border-white/5
                                            dark:bg-[#030303]
                                        "
                                    >

                                        <UploadCloud
                                            size={28}
                                            className="
                                                text-slate-400
                                                transition-colors
                                                group-hover:text-[#D4AF37]
                                                dark:text-white/30
                                            "
                                        />

                                    </div>

                                    <p
                                        className="
                                            text-xs
                                            font-bold
                                            uppercase
                                            tracking-[0.2em]
                                            text-slate-800
                                            transition-colors
                                            group-hover:text-slate-900
                                            dark:text-white/80
                                            dark:group-hover:text-white
                                        "
                                    >
                                        Upload Display Image
                                    </p>

                                    <p
                                        className="
                                            mt-2
                                            text-[10px]
                                            font-light
                                            uppercase
                                            tracking-widest
                                            text-slate-400
                                            transition-colors
                                            dark:text-white/40
                                        "
                                    >
                                        High-resolution JPG, PNG or WEBP
                                        • Maximum 15 MB
                                    </p>

                                    <input
                                        type="file"
                                        ref={
                                            imageInputRef
                                        }
                                        accept="image/*"
                                        className="
                                            absolute
                                            inset-0
                                            h-full
                                            w-full
                                            cursor-pointer
                                            opacity-0
                                        "
                                        onChange={
                                            handleFileChange
                                        }
                                        disabled={
                                            loading
                                        }
                                    />

                                </>

                            )}

                        </div>

                    </div>

                    {/* Project details */}

                    <div className="space-y-6 pt-4">

                        <div
                            className="
                                mb-6
                                flex
                                items-center
                                gap-3
                                border-b
                                border-slate-200
                                pb-4
                                transition-colors
                                duration-300
                                dark:border-white/5
                            "
                        >

                            <ImageIcon
                                size={16}
                                className="text-[#D4AF37]"
                            />

                            <h3
                                className="
                                    text-[10px]
                                    font-bold
                                    uppercase
                                    tracking-[0.3em]
                                    text-slate-500
                                    transition-colors
                                    duration-300
                                    dark:text-white/50
                                "
                            >
                                Project Details
                            </h3>

                        </div>

                        {/* Title */}

                        <div className="space-y-2">

                            <label
                                className="
                                    pl-2
                                    text-[9px]
                                    font-bold
                                    uppercase
                                    tracking-[0.2em]
                                    text-slate-500
                                    transition-colors
                                    duration-300
                                    dark:text-white/40
                                "
                            >
                                Design Title
                            </label>

                            <input
                                type="text"
                                value={
                                    form.title
                                }
                                placeholder="e.g. Asymmetrical Silk Blazer"
                                onChange={
                                    event =>
                                        handleInputChange(
                                            "title",
                                            event.target.value
                                        )
                                }
                                required
                                disabled={loading}
                                className="
                                    w-full
                                    rounded-xl
                                    border
                                    border-slate-300
                                    bg-slate-50
                                    px-5
                                    py-4
                                    text-sm
                                    tracking-wide
                                    text-slate-900
                                    shadow-sm
                                    outline-none
                                    transition-colors
                                    placeholder:text-slate-400
                                    focus:border-[#D4AF37]/50
                                    dark:border-white/10
                                    dark:bg-[#030303]
                                    dark:text-white
                                    dark:shadow-none
                                    dark:placeholder:text-white/20
                                "
                            />

                        </div>

                        {/* Category */}

                        <div className="space-y-2">

                            <label
                                className="
                                    pl-2
                                    text-[9px]
                                    font-bold
                                    uppercase
                                    tracking-[0.2em]
                                    text-slate-500
                                    transition-colors
                                    duration-300
                                    dark:text-white/40
                                "
                            >
                                Style Category
                            </label>

                            <select
                                value={
                                    form.style_category
                                }
                                onChange={
                                    event =>
                                        handleInputChange(
                                            "style_category",
                                            event.target.value
                                        )
                                }
                                disabled={loading}
                                className="
                                    w-full
                                    cursor-pointer
                                    rounded-xl
                                    border
                                    border-slate-300
                                    bg-slate-50
                                    px-5
                                    py-4
                                    text-[11px]
                                    font-bold
                                    uppercase
                                    tracking-[0.2em]
                                    text-slate-800
                                    shadow-sm
                                    outline-none
                                    transition-colors
                                    focus:border-[#D4AF37]/50
                                    dark:border-white/10
                                    dark:bg-[#030303]
                                    dark:text-white/80
                                    dark:shadow-none
                                "
                            >

                                <option value="Concept Art">
                                    Concept Art
                                </option>

                                <option value="Avant-Garde">
                                    Avant-Garde
                                </option>

                                <option value="Minimalist">
                                    Minimalist
                                </option>

                                <option value="Streetwear">
                                    Streetwear
                                </option>

                                <option value="High-Fashion">
                                    High-Fashion
                                </option>

                                <option value="Textiles">
                                    Textiles
                                </option>

                            </select>

                        </div>

                        {/* Tags */}

                        <div className="space-y-2">

                            <label
                                className="
                                    pl-2
                                    text-[9px]
                                    font-bold
                                    uppercase
                                    tracking-[0.2em]
                                    text-slate-500
                                    transition-colors
                                    duration-300
                                    dark:text-white/40
                                "
                            >
                                Search Tags (Comma Separated)
                            </label>

                            <input
                                type="text"
                                value={
                                    form.tags
                                }
                                placeholder="silk, organic, winter, tailoring"
                                onChange={
                                    event =>
                                        handleInputChange(
                                            "tags",
                                            event.target.value
                                        )
                                }
                                required
                                disabled={loading}
                                className="
                                    w-full
                                    rounded-xl
                                    border
                                    border-slate-300
                                    bg-slate-50
                                    px-5
                                    py-4
                                    text-xs
                                    font-light
                                    tracking-wider
                                    text-slate-900
                                    shadow-sm
                                    outline-none
                                    transition-colors
                                    placeholder:text-slate-400
                                    focus:border-[#D4AF37]/50
                                    dark:border-white/10
                                    dark:bg-[#030303]
                                    dark:text-white
                                    dark:shadow-none
                                    dark:placeholder:text-white/20
                                "
                            />

                        </div>

                        {/* Description */}

                        <div className="space-y-2">

                            <label
                                className="
                                    pl-2
                                    text-[9px]
                                    font-bold
                                    uppercase
                                    tracking-[0.2em]
                                    text-slate-500
                                    transition-colors
                                    duration-300
                                    dark:text-white/40
                                "
                            >
                                Inspiration & Description
                            </label>

                            <textarea
                                value={
                                    form.description
                                }
                                placeholder="Share the story, mood, or technical context behind this vision..."
                                onChange={
                                    event =>
                                        handleInputChange(
                                            "description",
                                            event.target.value
                                        )
                                }
                                required
                                disabled={loading}
                                className="
                                    min-h-[120px]
                                    w-full
                                    resize-none
                                    rounded-xl
                                    border
                                    border-slate-300
                                    bg-slate-50
                                    px-5
                                    py-4
                                    text-xs
                                    font-light
                                    leading-relaxed
                                    tracking-wide
                                    text-slate-900
                                    shadow-sm
                                    outline-none
                                    transition-colors
                                    placeholder:text-slate-400
                                    focus:border-[#D4AF37]/50
                                    dark:border-white/10
                                    dark:bg-[#030303]
                                    dark:text-white
                                    dark:shadow-none
                                    dark:placeholder:text-white/20
                                "
                            />

                        </div>

                    </div>

                    {/* Submit */}

                    <div
                        className="
                            border-t
                            border-slate-200
                            pt-6
                            transition-colors
                            duration-300
                            dark:border-white/5
                        "
                    >

                        <button
                            type="submit"
                            disabled={loading}
                            className="
                                flex
                                w-full
                                items-center
                                justify-center
                                gap-3
                                rounded-xl
                                bg-[#D4AF37]
                                py-4
                                text-[10px]
                                font-bold
                                uppercase
                                tracking-[0.3em]
                                text-black
                                shadow-md
                                transition-all
                                duration-300
                                hover:bg-slate-900
                                hover:text-white
                                disabled:bg-slate-200
                                disabled:text-slate-400
                                disabled:shadow-none
                                dark:shadow-[0_0_20px_rgba(212,175,55,0.2)]
                                dark:hover:bg-white
                                dark:hover:text-black
                                dark:disabled:bg-white/5
                                dark:disabled:text-white/20
                            "
                        >

                            {loading ? (

                                <>

                                    <Loader2
                                        className="animate-spin"
                                        size={16}
                                    />

                                    Encrypting Payload...

                                </>

                            ) : (

                                "Publish to Exhibition"

                            )}

                        </button>

                    </div>

                </form>

            </main>

        </div>
    );

};

export default DesignerUploadDesign;