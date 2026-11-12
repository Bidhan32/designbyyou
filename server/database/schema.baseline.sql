--
-- PostgreSQL database dump
--

\restrict Ge7d8efZGqrxi4UtK4fL99OS4frAR0cXg7mbL4lbM6dzD7oOFOaGeFX8geSpEnh

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: approval_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.approval_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'suspended'
);


--
-- Name: booking_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.booking_status AS ENUM (
    'requested',
    'quoted',
    'paid',
    'active',
    'revision',
    'completed',
    'disputed',
    'pending',
    'accepted',
    'declined',
    'progress',
    'review',
    'queued',
    'verification',
    'verifying'
);


--
-- Name: booking_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.booking_type AS ENUM (
    'commission',
    'consultation',
    'marketplace'
);


--
-- Name: designer_tier; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.designer_tier AS ENUM (
    'bronze',
    'silver',
    'gold',
    'platinum',
    'diamond'
);


--
-- Name: license_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.license_type AS ENUM (
    'standard',
    'commercial',
    'exclusive'
);


--
-- Name: product_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.product_type AS ENUM (
    'sketch',
    'tech_pack',
    'pattern',
    '3d_model'
);


--
-- Name: revision_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.revision_status AS ENUM (
    'pending',
    'in_progress',
    'resolved',
    'declined'
);


--
-- Name: trans_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.trans_type AS ENUM (
    'marketplace_sale',
    'booking_deposit',
    'payout',
    'refund',
    'escrow_release',
    'escrow_lock',
    'marketplace_purchase',
    'wallet_deposit'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'superadmin',
    'admin',
    'designer',
    'creator'
);


--
-- Name: update_creator_costume_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_creator_costume_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_modified_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_modified_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: booking_design_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_design_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    creator_id uuid NOT NULL,
    source_editor_project_id bigint,
    source_project_version integer NOT NULL,
    source_schema_version integer NOT NULL,
    design_title character varying(120) NOT NULL,
    snapshot_data jsonb NOT NULL,
    preview_image_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT booking_design_snapshots_design_title_check CHECK ((length(btrim((design_title)::text)) > 0)),
    CONSTRAINT booking_design_snapshots_preview_image_key_check CHECK (((preview_image_key IS NULL) OR (length(preview_image_key) <= 1024))),
    CONSTRAINT booking_design_snapshots_snapshot_data_check CHECK (((jsonb_typeof(snapshot_data) = 'object'::text) AND (snapshot_data ? 'document'::text) AND (snapshot_data ? 'layers'::text) AND (snapshot_data ? 'objects'::text) AND (octet_length((snapshot_data)::text) <= 26214400))),
    CONSTRAINT booking_design_snapshots_source_project_version_check CHECK ((source_project_version >= 1)),
    CONSTRAINT booking_design_snapshots_source_schema_version_check CHECK ((source_schema_version >= 1))
);


--
-- Name: TABLE booking_design_snapshots; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.booking_design_snapshots IS 'Private immutable-at-application-level Fashion Editor design snapshots attached to P2P bookings. Not part of public Showcase.';


--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id uuid,
    designer_id uuid,
    design_id uuid,
    brief_text text NOT NULL,
    agreed_price numeric(15,2) NOT NULL,
    deadline timestamp with time zone NOT NULL,
    status character varying(50) DEFAULT 'requested'::public.booking_status,
    escrow_locked boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    booking_type public.booking_type DEFAULT 'commission'::public.booking_type NOT NULL,
    scheduled_at timestamp with time zone,
    stripe_payment_intent_id character varying(255),
    updated_at timestamp without time zone DEFAULT now(),
    prototype_file_url text,
    prototype_message text,
    delivery_file_url text,
    delivery_message text,
    revision_notes text,
    cancellation_reason text,
    cancelled_at timestamp without time zone,
    client_request_id uuid,
    stripe_refund_id character varying(255),
    refund_status character varying(50),
    refund_requested_at timestamp with time zone,
    refunded_at timestamp with time zone,
    cancellation_requested_by uuid,
    payment_provider character varying(20),
    provider_payment_id character varying(255),
    provider_capture_id character varying(255),
    provider_refund_id character varying(255),
    payment_currency character varying(3),
    prototype_model_url text,
    delivery_model_url text,
    prototype_tryon_image_url text,
    delivery_tryon_image_url text,
    creator_reward_points integer DEFAULT 0 NOT NULL,
    creator_reward_awarded_at timestamp with time zone,
    CONSTRAINT bookings_agreed_price_positive CHECK ((agreed_price > (0)::numeric)),
    CONSTRAINT bookings_creator_reward_points_nonnegative CHECK ((creator_reward_points >= 0)),
    CONSTRAINT bookings_payment_currency_valid CHECK (((payment_currency IS NULL) OR ((payment_currency)::text ~ '^[a-z]{3}$'::text))),
    CONSTRAINT bookings_payment_provider_valid CHECK (((payment_provider IS NULL) OR ((payment_provider)::text = ANY ((ARRAY['stripe'::character varying, 'paypal'::character varying])::text[]))))
);


--
-- Name: cart_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cart_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    license_type character varying(50) DEFAULT 'commercial'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    user_id uuid NOT NULL,
    design_id uuid NOT NULL
);


--
-- Name: chat_rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_rooms (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    creator_id uuid,
    designer_id uuid,
    last_message_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    booking_id uuid
);


--
-- Name: collection_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.collection_items (
    id integer NOT NULL,
    collection_id integer,
    design_id uuid,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: collection_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.collection_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: collection_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.collection_items_id_seq OWNED BY public.collection_items.id;


--
-- Name: collections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.collections (
    id integer NOT NULL,
    user_id uuid,
    name character varying(255) NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: collections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.collections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: collections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.collections_id_seq OWNED BY public.collections.id;


--
-- Name: creator_cart_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_cart_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id uuid,
    design_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    quantity integer DEFAULT 1 NOT NULL
);


--
-- Name: creator_costume_extraction_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_costume_extraction_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id uuid NOT NULL,
    request_key uuid NOT NULL,
    status character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    estimated_credits integer DEFAULT 4 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT creator_costume_extraction_jobs_estimated_credits_check CHECK (((estimated_credits >= 1) AND (estimated_credits <= 4))),
    CONSTRAINT creator_costume_job_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'partially_failed'::character varying, 'failed'::character varying])::text[])))
);


--
-- Name: creator_costume_extraction_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_costume_extraction_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id uuid NOT NULL,
    view_name character varying(10) NOT NULL,
    status character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    prediction_id character varying(128),
    error_code character varying(100),
    submitted_at timestamp with time zone,
    completed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT creator_costume_view_name_check CHECK (((view_name)::text = ANY ((ARRAY['front'::character varying, 'back'::character varying, 'left'::character varying, 'right'::character varying])::text[]))),
    CONSTRAINT creator_costume_view_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'submitting'::character varying, 'submission_unknown'::character varying, 'starting'::character varying, 'in_queue'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying])::text[])))
);


--
-- Name: creator_multi_view_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_multi_view_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id uuid NOT NULL,
    view text NOT NULL,
    status text DEFAULT 'submitting'::text NOT NULL,
    prediction_id text,
    output_public_id text,
    credits_used numeric(10,2),
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT creator_multi_view_images_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'submitting'::text, 'processing'::text, 'saving'::text, 'completed'::text, 'failed'::text]))),
    CONSTRAINT creator_multi_view_images_view_check CHECK ((view = ANY (ARRAY['front'::text, 'side'::text, 'back'::text])))
);


--
-- Name: creator_multi_view_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_multi_view_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id uuid NOT NULL,
    request_key uuid NOT NULL,
    subject_type text DEFAULT 'garment'::text NOT NULL,
    generation_mode text DEFAULT 'fast'::text NOT NULL,
    keep_background boolean DEFAULT false NOT NULL,
    instruction text DEFAULT ''::text NOT NULL,
    source_public_id text,
    context_public_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT creator_multi_view_jobs_generation_mode_check CHECK ((generation_mode = ANY (ARRAY['fast'::text, 'balanced'::text, 'quality'::text]))),
    CONSTRAINT creator_multi_view_jobs_instruction_check CHECK ((char_length(instruction) <= 500)),
    CONSTRAINT creator_multi_view_jobs_subject_type_check CHECK ((subject_type = ANY (ARRAY['garment'::text, 'model'::text])))
);


--
-- Name: creator_pattern_extraction_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_pattern_extraction_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id uuid NOT NULL,
    request_key uuid NOT NULL,
    mode text NOT NULL,
    instructions text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    prediction_id text,
    error_code text,
    estimated_credits integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT creator_pattern_extraction_jobs_error_code_check CHECK (((error_code IS NULL) OR (char_length(error_code) <= 100))),
    CONSTRAINT creator_pattern_extraction_jobs_estimated_credits_check CHECK ((estimated_credits = 1)),
    CONSTRAINT creator_pattern_extraction_jobs_instructions_check CHECK ((char_length(instructions) <= 500)),
    CONSTRAINT creator_pattern_extraction_jobs_mode_check CHECK ((mode = ANY (ARRAY['faithful'::text, 'seamless'::text]))),
    CONSTRAINT creator_pattern_extraction_jobs_prediction_id_check CHECK (((prediction_id IS NULL) OR (char_length(prediction_id) <= 128))),
    CONSTRAINT creator_pattern_extraction_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'submitting'::text, 'submission_unknown'::text, 'starting'::text, 'in_queue'::text, 'processing'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: TABLE creator_pattern_extraction_jobs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.creator_pattern_extraction_jobs IS 'Private AI fabric-print jobs; generated images remain at provider temporarily and are not stored in PostgreSQL.';


--
-- Name: creator_payout_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_payout_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id uuid NOT NULL,
    provider character varying(20) NOT NULL,
    provider_account_id character varying(255),
    status character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    destination_summary character varying(255),
    details_submitted boolean DEFAULT false NOT NULL,
    payouts_enabled boolean DEFAULT false NOT NULL,
    provider_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    onboarding_completed_at timestamp without time zone,
    last_verified_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT creator_payout_account_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'onboarding'::character varying, 'active'::character varying, 'restricted'::character varying, 'disabled'::character varying])::text[]))),
    CONSTRAINT creator_payout_provider_check CHECK (((provider)::text = ANY ((ARRAY['stripe'::character varying, 'paypal'::character varying])::text[])))
);


--
-- Name: creator_payout_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_payout_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id uuid NOT NULL,
    payout_account_id uuid,
    amount numeric(12,2) NOT NULL,
    currency character varying(3) DEFAULT 'usd'::character varying NOT NULL,
    payout_method character varying(20) NOT NULL,
    provider character varying(20),
    status character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    client_request_id uuid NOT NULL,
    provider_batch_id character varying(255),
    provider_transaction_id character varying(255),
    provider_payout_id character varying(255),
    provider_status character varying(100),
    failure_reason text,
    requested_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    processing_at timestamp without time zone,
    completed_at timestamp without time zone,
    failed_at timestamp without time zone,
    cancelled_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT creator_payout_method_check CHECK (((payout_method)::text = ANY ((ARRAY['manual'::character varying, 'stripe'::character varying, 'paypal'::character varying])::text[]))),
    CONSTRAINT creator_payout_request_amount_positive CHECK ((amount > (0)::numeric)),
    CONSTRAINT creator_payout_request_provider_check CHECK (((provider IS NULL) OR ((provider)::text = ANY ((ARRAY['stripe'::character varying, 'paypal'::character varying])::text[])))),
    CONSTRAINT creator_payout_request_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: creator_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id uuid,
    title character varying(255) NOT NULL,
    description text NOT NULL,
    budget_min numeric(10,2) NOT NULL,
    budget_max numeric(10,2) NOT NULL,
    deadline timestamp with time zone,
    category character varying(100),
    status character varying(50) DEFAULT 'open'::character varying,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: creator_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_profiles (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    company_name character varying(150),
    preferred_category character varying(100),
    default_dimensions character varying(50),
    brand_guidelines_summary text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    xp_points integer DEFAULT 0 NOT NULL,
    CONSTRAINT creator_profiles_xp_points_nonnegative CHECK ((xp_points >= 0))
);


--
-- Name: creator_sketch_to_image_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_sketch_to_image_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id uuid NOT NULL,
    request_key uuid NOT NULL,
    provider text DEFAULT 'fashn'::text NOT NULL,
    model_name text DEFAULT 'edit'::text NOT NULL,
    instruction text DEFAULT ''::text NOT NULL,
    fabric text DEFAULT 'as-drawn'::text NOT NULL,
    generation_mode text DEFAULT 'fast'::text NOT NULL,
    source_url text,
    source_public_id text,
    provider_prediction_id text,
    result_urls jsonb DEFAULT '[]'::jsonb NOT NULL,
    output_public_id text,
    status text DEFAULT 'submitting'::text NOT NULL,
    credits_used numeric(10,2),
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT creator_sketch_to_image_jobs_fabric_check CHECK ((fabric = ANY (ARRAY['as-drawn'::text, 'cotton'::text, 'satin'::text, 'silk'::text, 'denim'::text, 'linen'::text, 'wool'::text, 'leather'::text, 'chiffon'::text]))),
    CONSTRAINT creator_sketch_to_image_jobs_generation_mode_check CHECK ((generation_mode = ANY (ARRAY['fast'::text, 'balanced'::text, 'quality'::text]))),
    CONSTRAINT creator_sketch_to_image_jobs_instruction_check CHECK ((char_length(instruction) <= 500)),
    CONSTRAINT creator_sketch_to_image_jobs_model_name_check CHECK ((model_name = 'edit'::text)),
    CONSTRAINT creator_sketch_to_image_jobs_provider_check CHECK ((provider = 'fashn'::text)),
    CONSTRAINT creator_sketch_to_image_jobs_result_urls_check CHECK ((jsonb_typeof(result_urls) = 'array'::text)),
    CONSTRAINT creator_sketch_to_image_jobs_status_check CHECK ((status = ANY (ARRAY['submitting'::text, 'processing'::text, 'saving'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: creator_text_to_image_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_text_to_image_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id uuid NOT NULL,
    request_key uuid NOT NULL,
    provider text DEFAULT 'fashn'::text NOT NULL,
    model_name text DEFAULT 'model-create'::text NOT NULL,
    prompt text NOT NULL,
    aspect_ratio text NOT NULL,
    generation_mode text NOT NULL,
    resolution text DEFAULT '1k'::text NOT NULL,
    num_images integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'submitting'::text NOT NULL,
    provider_prediction_id text,
    result_urls jsonb DEFAULT '[]'::jsonb NOT NULL,
    cloudinary_public_id text,
    credits_used numeric(10,2),
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT creator_text_to_image_jobs_aspect_ratio_check CHECK ((aspect_ratio = ANY (ARRAY['1:1'::text, '3:4'::text, '4:5'::text, '2:3'::text, '9:16'::text, '16:9'::text]))),
    CONSTRAINT creator_text_to_image_jobs_generation_mode_check CHECK ((generation_mode = ANY (ARRAY['fast'::text, 'balanced'::text, 'quality'::text]))),
    CONSTRAINT creator_text_to_image_jobs_model_name_check CHECK ((model_name = 'model-create'::text)),
    CONSTRAINT creator_text_to_image_jobs_num_images_check CHECK ((num_images = 1)),
    CONSTRAINT creator_text_to_image_jobs_prompt_check CHECK (((char_length(prompt) >= 12) AND (char_length(prompt) <= 1200))),
    CONSTRAINT creator_text_to_image_jobs_provider_check CHECK ((provider = 'fashn'::text)),
    CONSTRAINT creator_text_to_image_jobs_resolution_check CHECK ((resolution = '1k'::text)),
    CONSTRAINT creator_text_to_image_jobs_result_urls_check CHECK ((jsonb_typeof(result_urls) = 'array'::text)),
    CONSTRAINT creator_text_to_image_jobs_status_check CHECK ((status = ANY (ARRAY['submitting'::text, 'processing'::text, 'saving'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: creator_virtual_tryon_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_virtual_tryon_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id uuid NOT NULL,
    request_key uuid NOT NULL,
    provider text DEFAULT 'fashn'::text NOT NULL,
    model_name text DEFAULT 'tryon-v1.6'::text NOT NULL,
    category text DEFAULT 'auto'::text NOT NULL,
    mode text DEFAULT 'balanced'::text NOT NULL,
    garment_photo_type text DEFAULT 'auto'::text NOT NULL,
    status text DEFAULT 'submitting'::text NOT NULL,
    provider_prediction_id text,
    output_public_id text,
    credits_used numeric(10,2),
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT creator_virtual_tryon_jobs_category_check CHECK ((category = ANY (ARRAY['auto'::text, 'tops'::text, 'bottoms'::text, 'one-pieces'::text]))),
    CONSTRAINT creator_virtual_tryon_jobs_garment_photo_type_check CHECK ((garment_photo_type = ANY (ARRAY['auto'::text, 'flat-lay'::text, 'model'::text]))),
    CONSTRAINT creator_virtual_tryon_jobs_mode_check CHECK ((mode = ANY (ARRAY['performance'::text, 'balanced'::text, 'quality'::text]))),
    CONSTRAINT creator_virtual_tryon_jobs_model_name_check CHECK ((model_name = 'tryon-v1.6'::text)),
    CONSTRAINT creator_virtual_tryon_jobs_provider_check CHECK ((provider = 'fashn'::text)),
    CONSTRAINT creator_virtual_tryon_jobs_status_check CHECK ((status = ANY (ARRAY['submitting'::text, 'processing'::text, 'saving'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: creator_wallet_deposits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_wallet_deposits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id uuid NOT NULL,
    amount numeric(14,2) NOT NULL,
    remaining_refundable_amount numeric(14,2) DEFAULT 0.00 NOT NULL,
    payment_provider character varying(20) NOT NULL,
    provider_payment_id character varying(255),
    provider_capture_id character varying(255),
    currency character varying(3) DEFAULT 'usd'::character varying NOT NULL,
    status character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    client_request_id character varying(255) NOT NULL,
    failure_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    credited_at timestamp with time zone,
    failed_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    CONSTRAINT creator_wallet_deposit_amount_positive CHECK ((amount > (0)::numeric)),
    CONSTRAINT creator_wallet_deposit_currency_valid CHECK (((currency)::text ~ '^[a-z]{3}$'::text)),
    CONSTRAINT creator_wallet_deposit_provider_valid CHECK (((payment_provider)::text = ANY ((ARRAY['stripe'::character varying, 'paypal'::character varying])::text[]))),
    CONSTRAINT creator_wallet_deposit_refundable_nonnegative CHECK ((remaining_refundable_amount >= (0)::numeric)),
    CONSTRAINT creator_wallet_deposit_refundable_not_above_amount CHECK ((remaining_refundable_amount <= amount)),
    CONSTRAINT creator_wallet_deposit_status_valid CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'succeeded'::character varying, 'partially_used'::character varying, 'used'::character varying, 'partially_refunded'::character varying, 'refunded'::character varying, 'failed'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: TABLE creator_wallet_deposits; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.creator_wallet_deposits IS 'Provider-backed creator wallet funding records. Stores provider references only and never raw card or bank credentials.';


--
-- Name: COLUMN creator_wallet_deposits.remaining_refundable_amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.creator_wallet_deposits.remaining_refundable_amount IS 'Amount from this original wallet funding payment that remains eligible to be returned through its original payment provider.';


--
-- Name: COLUMN creator_wallet_deposits.provider_payment_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.creator_wallet_deposits.provider_payment_id IS 'Primary provider payment reference such as Stripe PaymentIntent ID or PayPal Order ID.';


--
-- Name: COLUMN creator_wallet_deposits.provider_capture_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.creator_wallet_deposits.provider_capture_id IS 'Provider settlement/capture reference, primarily PayPal Capture ID.';


--
-- Name: creator_wallet_refund_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_wallet_refund_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    refund_request_id uuid NOT NULL,
    deposit_id uuid NOT NULL,
    amount numeric(14,2) NOT NULL,
    payment_provider character varying(20) NOT NULL,
    provider_payment_id character varying(255) NOT NULL,
    provider_refund_id character varying(255),
    provider_status character varying(50),
    status character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    failure_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    processing_at timestamp with time zone,
    completed_at timestamp with time zone,
    failed_at timestamp with time zone,
    provider_idempotency_key character varying(255) NOT NULL,
    submission_attempt_count integer DEFAULT 0 NOT NULL,
    last_submission_at timestamp with time zone,
    status_unknown_at timestamp with time zone,
    last_reconciled_at timestamp with time zone,
    provider_failure_balance_transaction_id character varying(255),
    CONSTRAINT creator_wallet_refund_item_amount_positive CHECK ((amount > (0)::numeric)),
    CONSTRAINT creator_wallet_refund_item_provider_valid CHECK (((payment_provider)::text = ANY ((ARRAY['stripe'::character varying, 'paypal'::character varying])::text[]))),
    CONSTRAINT creator_wallet_refund_item_status_valid CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'submitting'::character varying, 'processing'::character varying, 'status_unknown'::character varying, 'succeeded'::character varying, 'failed'::character varying, 'cancelled'::character varying])::text[]))),
    CONSTRAINT creator_wallet_refund_item_submission_attempt_nonnegative CHECK ((submission_attempt_count >= 0))
);


--
-- Name: TABLE creator_wallet_refund_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.creator_wallet_refund_items IS 'Individual provider refunds allocated from a creator wallet refund request to original wallet deposits.';


--
-- Name: COLUMN creator_wallet_refund_items.provider_payment_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.creator_wallet_refund_items.provider_payment_id IS 'Original provider payment reference being refunded, such as a Stripe PaymentIntent ID.';


--
-- Name: COLUMN creator_wallet_refund_items.provider_refund_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.creator_wallet_refund_items.provider_refund_id IS 'Provider refund reference such as a Stripe Refund ID.';


--
-- Name: creator_wallet_refund_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_wallet_refund_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id uuid NOT NULL,
    amount numeric(14,2) NOT NULL,
    currency character varying(3) DEFAULT 'usd'::character varying NOT NULL,
    status character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    client_request_id character varying(255) NOT NULL,
    failure_reason text,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    processing_at timestamp with time zone,
    completed_at timestamp with time zone,
    failed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT creator_wallet_refund_request_amount_positive CHECK ((amount > (0)::numeric)),
    CONSTRAINT creator_wallet_refund_request_currency_valid CHECK (((currency)::text ~ '^[a-z]{3}$'::text)),
    CONSTRAINT creator_wallet_refund_request_status_valid CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'partially_completed'::character varying, 'completed'::character varying, 'failed'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: TABLE creator_wallet_refund_requests; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.creator_wallet_refund_requests IS 'Creator requests to return unused deposited wallet funds to their original payment source.';


--
-- Name: creator_wallets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_wallets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id uuid NOT NULL,
    available_balance numeric(12,2) DEFAULT 0.00 NOT NULL,
    pending_escrow_balance numeric(12,2) DEFAULT 0.00 NOT NULL,
    pending_payout_balance numeric(12,2) DEFAULT 0.00 NOT NULL,
    lifetime_deposited numeric(12,2) DEFAULT 0.00 NOT NULL,
    lifetime_spent numeric(12,2) DEFAULT 0.00 NOT NULL,
    lifetime_withdrawn numeric(12,2) DEFAULT 0.00 NOT NULL,
    lifetime_refunded numeric(12,2) DEFAULT 0.00 NOT NULL,
    currency character varying(3) DEFAULT 'usd'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    pending_refund_balance numeric(14,2) DEFAULT 0.00 NOT NULL,
    CONSTRAINT creator_wallet_available_nonnegative CHECK ((available_balance >= (0)::numeric)),
    CONSTRAINT creator_wallet_pending_escrow_nonnegative CHECK ((pending_escrow_balance >= (0)::numeric)),
    CONSTRAINT creator_wallet_pending_payout_nonnegative CHECK ((pending_payout_balance >= (0)::numeric)),
    CONSTRAINT creator_wallet_pending_refund_nonnegative CHECK ((pending_refund_balance >= (0)::numeric))
);


--
-- Name: COLUMN creator_wallets.pending_refund_balance; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.creator_wallets.pending_refund_balance IS 'Creator wallet funds reserved while an unused-balance refund is being processed.';


--
-- Name: design_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.design_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    slug character varying(120) NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: design_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.design_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    design_id uuid NOT NULL,
    image_url text NOT NULL,
    cloudinary_public_id text NOT NULL,
    display_order smallint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT design_images_display_order_check CHECK (((display_order >= 1) AND (display_order <= 6))),
    CONSTRAINT design_images_public_id_not_empty CHECK ((length(btrim(cloudinary_public_id)) > 0)),
    CONSTRAINT design_images_url_not_empty CHECK ((length(btrim(image_url)) > 0))
);


--
-- Name: design_showcase_terms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.design_showcase_terms (
    design_id uuid NOT NULL,
    term_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: designer_bank_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.designer_bank_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    designer_id uuid NOT NULL,
    country_code character varying(2) NOT NULL,
    account_holder_name character varying(160) NOT NULL,
    bank_name character varying(160) NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying NOT NULL,
    account_number_last4 character varying(4),
    iban_last4 character varying(4),
    details_ciphertext text NOT NULL,
    details_iv character varying(64) NOT NULL,
    details_auth_tag character varying(64) NOT NULL,
    encryption_version smallint DEFAULT 1 NOT NULL,
    verification_status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT designer_bank_accounts_country_valid CHECK (((country_code)::text ~ '^[A-Z]{2}$'::text)),
    CONSTRAINT designer_bank_accounts_currency_valid CHECK (((currency)::text ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT designer_bank_accounts_verification_status_valid CHECK (((verification_status)::text = ANY ((ARRAY['pending'::character varying, 'verified'::character varying, 'rejected'::character varying, 'disabled'::character varying])::text[])))
);


--
-- Name: designer_payout_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.designer_payout_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    designer_id uuid NOT NULL,
    provider character varying(20) NOT NULL,
    provider_account_id character varying(255) NOT NULL,
    status character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    destination_summary character varying(255),
    details_submitted boolean DEFAULT false NOT NULL,
    payouts_enabled boolean DEFAULT false NOT NULL,
    provider_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    onboarding_completed_at timestamp with time zone,
    last_verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT designer_payout_accounts_provider_valid CHECK (((provider)::text = ANY ((ARRAY['stripe'::character varying, 'paypal'::character varying])::text[]))),
    CONSTRAINT designer_payout_accounts_status_valid CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'onboarding'::character varying, 'active'::character varying, 'restricted'::character varying, 'disabled'::character varying])::text[])))
);


--
-- Name: designer_payout_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.designer_payout_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payout_request_id uuid NOT NULL,
    payout_account_id uuid,
    attempt_number integer NOT NULL,
    provider character varying(30) DEFAULT 'stripe'::character varying NOT NULL,
    provider_account_id character varying(255),
    provider_transfer_id character varying(255),
    provider_payout_id character varying(255),
    previous_provider_payout_id character varying(255),
    idempotency_key character varying(255) NOT NULL,
    amount_cents bigint NOT NULL,
    currency character varying(3) DEFAULT 'usd'::character varying NOT NULL,
    status character varying(50) DEFAULT 'pending_submission'::character varying NOT NULL,
    failure_code character varying(100),
    failure_reason text,
    provider_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    submitted_at timestamp with time zone,
    completed_at timestamp with time zone,
    failed_at timestamp with time zone,
    canceled_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT designer_payout_attempts_amount_max CHECK ((amount_cents <= 100000000)),
    CONSTRAINT designer_payout_attempts_amount_positive CHECK ((amount_cents > 0)),
    CONSTRAINT designer_payout_attempts_attempt_positive CHECK ((attempt_number > 0)),
    CONSTRAINT designer_payout_attempts_currency_valid CHECK (((currency)::text ~ '^[a-z]{3}$'::text)),
    CONSTRAINT designer_payout_attempts_payout_reference_valid CHECK (((provider_payout_id IS NOT NULL) OR ((status)::text = ANY ((ARRAY['pending_submission'::character varying, 'submitting'::character varying, 'create_failed'::character varying, 'status_unknown'::character varying])::text[])))),
    CONSTRAINT designer_payout_attempts_provider_valid CHECK (((provider)::text = ANY ((ARRAY['stripe'::character varying, 'paypal'::character varying])::text[]))),
    CONSTRAINT designer_payout_attempts_status_valid CHECK (((status)::text = ANY ((ARRAY['pending_submission'::character varying, 'submitting'::character varying, 'pending'::character varying, 'in_transit'::character varying, 'paid'::character varying, 'failed'::character varying, 'canceled'::character varying, 'create_failed'::character varying, 'status_unknown'::character varying])::text[])))
);


--
-- Name: designer_payout_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.designer_payout_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    designer_id uuid NOT NULL,
    amount numeric(15,2) NOT NULL,
    payout_method character varying(40) DEFAULT 'manual'::character varying NOT NULL,
    destination_summary character varying(255),
    status character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    idempotency_key uuid NOT NULL,
    provider_payout_id character varying(255),
    failure_reason text,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    processing_at timestamp with time zone,
    completed_at timestamp with time zone,
    failed_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    provider character varying(20),
    payout_account_id uuid,
    provider_batch_id character varying(255),
    provider_transaction_id character varying(255),
    provider_status character varying(100),
    currency character varying(3) DEFAULT 'usd'::character varying,
    bank_account_id uuid,
    CONSTRAINT designer_payout_amount_positive CHECK ((amount > (0)::numeric)),
    CONSTRAINT designer_payout_currency_valid CHECK (((currency)::text ~ '^[a-z]{3}$'::text)),
    CONSTRAINT designer_payout_method_valid CHECK (((payout_method)::text = ANY ((ARRAY['manual'::character varying, 'stripe'::character varying, 'paypal'::character varying])::text[]))),
    CONSTRAINT designer_payout_provider_valid CHECK (((provider IS NULL) OR ((provider)::text = ANY ((ARRAY['stripe'::character varying, 'paypal'::character varying])::text[])))),
    CONSTRAINT designer_payout_status_valid CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: designer_pitches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.designer_pitches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid,
    designer_id uuid,
    pitch_text text NOT NULL,
    bid_amount numeric(10,2) NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: designer_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.designer_profiles (
    user_id uuid NOT NULL,
    portfolio_url text NOT NULL,
    bio text,
    address_line text,
    city character varying(100),
    country character varying(100),
    tier public.designer_tier DEFAULT 'bronze'::public.designer_tier,
    xp_points integer DEFAULT 0,
    commission_rate numeric(5,2) DEFAULT 15.00,
    avg_rating numeric(3,2) DEFAULT 0.00,
    total_completed_bookings integer DEFAULT 0
);


--
-- Name: designer_stripe_connect_operations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.designer_stripe_connect_operations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    designer_id uuid NOT NULL,
    provider character varying(30) DEFAULT 'stripe'::character varying NOT NULL,
    operation_type character varying(50) DEFAULT 'account_create'::character varying NOT NULL,
    idempotency_key uuid DEFAULT gen_random_uuid() NOT NULL,
    country character varying(2) NOT NULL,
    contact_email character varying(320) NOT NULL,
    display_name character varying(100) NOT NULL,
    status character varying(40) DEFAULT 'pending'::character varying NOT NULL,
    provider_account_id character varying(255),
    attempt_count integer DEFAULT 0 NOT NULL,
    last_error_code character varying(255),
    last_error_message text,
    last_attempt_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT designer_stripe_connect_operations_attempt_check CHECK ((attempt_count >= 0)),
    CONSTRAINT designer_stripe_connect_operations_provider_check CHECK (((provider)::text = 'stripe'::text)),
    CONSTRAINT designer_stripe_connect_operations_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'submitting'::character varying, 'created'::character varying, 'rejected'::character varying, 'reconciliation_required'::character varying])::text[]))),
    CONSTRAINT designer_stripe_connect_operations_type_check CHECK (((operation_type)::text = 'account_create'::text))
);


--
-- Name: designer_wallets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.designer_wallets (
    user_id uuid NOT NULL,
    available_balance numeric(15,2) DEFAULT 0 NOT NULL,
    pending_escrow_balance numeric(15,2) DEFAULT 0 NOT NULL,
    pending_payout_balance numeric(15,2) DEFAULT 0.00 NOT NULL,
    CONSTRAINT designer_wallet_available_nonnegative CHECK ((available_balance >= (0)::numeric)),
    CONSTRAINT designer_wallet_pending_nonnegative CHECK ((pending_escrow_balance >= (0)::numeric)),
    CONSTRAINT designer_wallet_pending_payout_nonnegative CHECK ((pending_payout_balance >= (0)::numeric)),
    CONSTRAINT designer_wallet_total_balances_nonnegative CHECK (((available_balance >= (0)::numeric) AND (pending_escrow_balance >= (0)::numeric) AND (pending_payout_balance >= (0)::numeric)))
);


--
-- Name: designs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.designs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    owner_id uuid,
    sku character varying(50) NOT NULL,
    title character varying(255),
    slug character varying(255) NOT NULL,
    description text,
    canvas_state jsonb NOT NULL,
    reference_image_url text,
    watermarked_preview_url text,
    high_res_file_url text,
    base_price numeric(15,2) DEFAULT 0.00 NOT NULL,
    discount_price numeric(15,2),
    product_type public.product_type,
    license_type public.license_type DEFAULT 'standard'::public.license_type,
    tags text[],
    style_category character varying(100),
    is_public boolean DEFAULT false,
    is_published boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    tryon_model_bg_url text,
    tryon_model_prompt text,
    tryon_high_res_file_url text,
    tryon_dispatched_at timestamp with time zone,
    tryon_completed_at timestamp with time zone,
    active_texture_key character varying(64),
    active_croquis_key character varying(64),
    tech_pack_data jsonb DEFAULT '{}'::jsonb,
    bill_of_materials jsonb DEFAULT '[]'::jsonb,
    total_estimated_production_cost numeric,
    vector_layers_manifest jsonb DEFAULT '[]'::jsonb,
    source_type character varying(30) DEFAULT 'upload'::character varying NOT NULL,
    editor_project_id bigint,
    is_editable boolean DEFAULT false NOT NULL,
    allow_remix boolean DEFAULT false NOT NULL,
    original_design_id uuid,
    category_id uuid,
    CONSTRAINT valid_design_source CHECK (((((source_type)::text = 'upload'::text) AND (editor_project_id IS NULL) AND (is_editable = false) AND (allow_remix = false)) OR (((source_type)::text = 'fashion_editor'::text) AND (editor_project_id IS NOT NULL) AND (is_editable = true))))
);


--
-- Name: editor_projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.editor_projects (
    id bigint NOT NULL,
    owner_id uuid NOT NULL,
    title character varying(120) NOT NULL,
    project_data jsonb NOT NULL,
    schema_version integer DEFAULT 2 NOT NULL,
    preview_url text,
    source_project_id bigint,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source_design_id uuid,
    source_image_id uuid,
    source_image_ids uuid[],
    CONSTRAINT ck_editor_projects_source_image_ids_length CHECK (((source_image_ids IS NULL) OR (((cardinality(source_image_ids) >= 2) AND (cardinality(source_image_ids) <= 6)) AND (array_position(source_image_ids, NULL::uuid) IS NULL)))),
    CONSTRAINT editor_projects_schema_version_check CHECK ((schema_version > 0)),
    CONSTRAINT editor_projects_version_check CHECK ((version > 0))
);


--
-- Name: editor_projects_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.editor_projects_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: editor_projects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.editor_projects_id_seq OWNED BY public.editor_projects.id;


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    room_id uuid,
    sender_id uuid,
    content text,
    file_url text,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid,
    title character varying(255) NOT NULL,
    message text NOT NULL,
    link_url text,
    is_read boolean DEFAULT false,
    priority integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid,
    design_id uuid,
    purchased_price numeric NOT NULL,
    license_type character varying(50) NOT NULL
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    buyer_id uuid,
    total_amount numeric NOT NULL,
    payment_status character varying(50) DEFAULT 'pending'::character varying,
    stripe_payment_intent_id character varying(255),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: payment_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_webhook_events (
    provider character varying(20) NOT NULL,
    event_id character varying(255) NOT NULL,
    event_type character varying(255) NOT NULL,
    processing_status character varying(20) DEFAULT 'processing'::character varying NOT NULL,
    error_message text,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    CONSTRAINT payment_webhook_provider_valid CHECK (((provider)::text = ANY ((ARRAY['stripe'::character varying, 'paypal'::character varying])::text[]))),
    CONSTRAINT payment_webhook_status_valid CHECK (((processing_status)::text = ANY ((ARRAY['processing'::character varying, 'processed'::character varying, 'ignored'::character varying, 'failed'::character varying])::text[])))
);


--
-- Name: project_revisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_revisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid,
    creator_id uuid,
    feedback_text text NOT NULL,
    attachments character varying(255)[],
    status public.revision_status DEFAULT 'pending'::public.revision_status,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: showcase_discovery_terms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.showcase_discovery_terms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_type character varying(20) NOT NULL,
    name character varying(100) NOT NULL,
    slug character varying(120) NOT NULL,
    search_term character varying(120) NOT NULL,
    emoji character varying(32),
    description text,
    is_trending boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT showcase_discovery_group_valid CHECK (((group_type)::text = ANY ((ARRAY['style'::character varying, 'garment'::character varying, 'occasion'::character varying])::text[])))
);


--
-- Name: showcase_hero_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.showcase_hero_settings (
    id smallint DEFAULT 1 NOT NULL,
    mode character varying(20) DEFAULT 'slideshow'::character varying NOT NULL,
    slideshow_images jsonb DEFAULT '[]'::jsonb NOT NULL,
    video_url text,
    video_poster_url text,
    rotation_seconds integer DEFAULT 6 NOT NULL,
    is_enabled boolean DEFAULT false NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT showcase_hero_images_array CHECK ((jsonb_typeof(slideshow_images) = 'array'::text)),
    CONSTRAINT showcase_hero_mode_valid CHECK (((mode)::text = ANY ((ARRAY['slideshow'::character varying, 'video'::character varying])::text[]))),
    CONSTRAINT showcase_hero_rotation_valid CHECK (((rotation_seconds >= 3) AND (rotation_seconds <= 30))),
    CONSTRAINT showcase_hero_singleton CHECK ((id = 1))
);


--
-- Name: stripe_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stripe_webhook_events (
    event_id character varying(255) NOT NULL,
    event_type character varying(255) NOT NULL,
    object_id character varying(255),
    processing_status character varying(30) DEFAULT 'processed'::character varying NOT NULL,
    error_message text,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone
);


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    sender_id uuid,
    receiver_id uuid,
    reference_id uuid,
    gross_amount numeric(15,2) NOT NULL,
    platform_fee_deducted numeric(15,2) NOT NULL,
    net_amount numeric(15,2) NOT NULL,
    transaction_type public.trans_type NOT NULL,
    stripe_payment_intent_id text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    payment_provider character varying(20),
    provider_payment_id text,
    provider_transaction_id text,
    currency character varying(3) DEFAULT 'usd'::character varying,
    CONSTRAINT transactions_amounts_balanced CHECK ((abs(((gross_amount - platform_fee_deducted) - net_amount)) <= 0.01)),
    CONSTRAINT transactions_amounts_nonnegative CHECK (((gross_amount >= (0)::numeric) AND (platform_fee_deducted >= (0)::numeric) AND (net_amount >= (0)::numeric))),
    CONSTRAINT transactions_currency_valid CHECK (((currency)::text ~ '^[a-z]{3}$'::text)),
    CONSTRAINT transactions_payment_provider_valid CHECK (((payment_provider IS NULL) OR ((payment_provider)::text = ANY ((ARRAY['stripe'::character varying, 'paypal'::character varying])::text[]))))
);


--
-- Name: user_avatars; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_avatars (
    id bigint CONSTRAINT designer_avatars_id_not_null NOT NULL,
    user_id uuid CONSTRAINT designer_avatars_designer_id_not_null NOT NULL,
    avatar_config jsonb DEFAULT '{}'::jsonb CONSTRAINT designer_avatars_avatar_config_not_null NOT NULL,
    featured_design_id uuid,
    display_mode character varying(30) DEFAULT 'showcase'::character varying CONSTRAINT designer_avatars_display_mode_not_null NOT NULL,
    pose character varying(50) DEFAULT 'standing'::character varying CONSTRAINT designer_avatars_pose_not_null NOT NULL,
    background_theme character varying(50) DEFAULT 'studio'::character varying CONSTRAINT designer_avatars_background_theme_not_null NOT NULL,
    avatar_preview_url text,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT designer_avatars_created_at_not_null NOT NULL,
    updated_at timestamp with time zone DEFAULT now() CONSTRAINT designer_avatars_updated_at_not_null NOT NULL,
    is_public boolean DEFAULT true NOT NULL,
    avatar_version integer DEFAULT 1 NOT NULL,
    avatar_engine character varying(40) DEFAULT 'fashion_persona_2d'::character varying NOT NULL,
    avatar_source character varying(30) DEFAULT 'manual'::character varying NOT NULL,
    provider_user_id text,
    provider_avatar_id text,
    model_glb_url text,
    model_vrm_url text,
    provider_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    model_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    generation_status character varying(30) DEFAULT 'ready'::character varying NOT NULL,
    generation_error text,
    CONSTRAINT user_avatars_avatar_engine_check CHECK (((avatar_engine)::text = ANY ((ARRAY['fashion_persona_2d'::character varying, 'avaturn'::character varying, 'internal_3d'::character varying])::text[]))),
    CONSTRAINT user_avatars_avatar_source_check CHECK (((avatar_source)::text = ANY ((ARRAY['manual'::character varying, 'photo'::character varying])::text[]))),
    CONSTRAINT user_avatars_avatar_version_check CHECK ((avatar_version >= 1)),
    CONSTRAINT user_avatars_display_mode_check CHECK (((display_mode)::text = ANY ((ARRAY['wear'::character varying, 'showcase'::character varying])::text[]))),
    CONSTRAINT user_avatars_generation_status_check CHECK (((generation_status)::text = ANY ((ARRAY['ready'::character varying, 'uploading'::character varying, 'processing'::character varying, 'failed'::character varying])::text[])))
);


--
-- Name: user_avatars_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_avatars_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_avatars_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_avatars_id_seq OWNED BY public.user_avatars.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    role public.user_role NOT NULL,
    full_name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash text NOT NULL,
    profile_image_url text,
    is_email_verified boolean DEFAULT false,
    otp_code character varying(255),
    otp_expires_at timestamp without time zone,
    approval_status public.approval_status DEFAULT 'pending'::public.approval_status,
    last_login timestamp without time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    bookings_made_count integer DEFAULT 0,
    subscription_tier character varying(50) DEFAULT 'free'::character varying NOT NULL,
    subscription_active_until timestamp with time zone,
    email_verification_otp_hash text,
    email_verification_otp_expires_at timestamp with time zone,
    password_reset_otp_hash text,
    password_reset_otp_expires_at timestamp with time zone,
    token_version integer DEFAULT 0 NOT NULL,
    stripe_customer_id character varying(255),
    stripe_subscription_id character varying(255),
    stripe_subscription_price_id character varying(255),
    subscription_status character varying(50) DEFAULT 'free'::character varying NOT NULL,
    subscription_cancel_at_period_end boolean DEFAULT false NOT NULL,
    subscription_current_period_start timestamp with time zone,
    whatsapp_number character varying(20),
    whatsapp_contact_enabled boolean DEFAULT false NOT NULL,
    CONSTRAINT users_subscription_status_valid CHECK (((subscription_status)::text = ANY ((ARRAY['free'::character varying, 'incomplete'::character varying, 'incomplete_expired'::character varying, 'trialing'::character varying, 'active'::character varying, 'past_due'::character varying, 'canceled'::character varying, 'unpaid'::character varying, 'paused'::character varying])::text[]))),
    CONSTRAINT users_subscription_tier_valid CHECK (((subscription_tier)::text = ANY ((ARRAY['free'::character varying, 'monthly'::character varying, 'quarterly'::character varying, 'yearly'::character varying])::text[]))),
    CONSTRAINT users_whatsapp_number_format_check CHECK (((whatsapp_number IS NULL) OR ((whatsapp_number)::text ~ '^\+[1-9][0-9]{7,14}$'::text)))
);


--
-- Name: collection_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_items ALTER COLUMN id SET DEFAULT nextval('public.collection_items_id_seq'::regclass);


--
-- Name: collections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections ALTER COLUMN id SET DEFAULT nextval('public.collections_id_seq'::regclass);


--
-- Name: editor_projects id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.editor_projects ALTER COLUMN id SET DEFAULT nextval('public.editor_projects_id_seq'::regclass);


--
-- Name: user_avatars id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_avatars ALTER COLUMN id SET DEFAULT nextval('public.user_avatars_id_seq'::regclass);


--
-- Name: booking_design_snapshots booking_design_snapshots_booking_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_design_snapshots
    ADD CONSTRAINT booking_design_snapshots_booking_id_key UNIQUE (booking_id);


--
-- Name: booking_design_snapshots booking_design_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_design_snapshots
    ADD CONSTRAINT booking_design_snapshots_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: cart_items cart_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_pkey PRIMARY KEY (id);


--
-- Name: chat_rooms chat_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_rooms
    ADD CONSTRAINT chat_rooms_pkey PRIMARY KEY (id);


--
-- Name: collection_items collection_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_items
    ADD CONSTRAINT collection_items_pkey PRIMARY KEY (id);


--
-- Name: collections collections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_pkey PRIMARY KEY (id);


--
-- Name: creator_cart_items creator_cart_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_cart_items
    ADD CONSTRAINT creator_cart_items_pkey PRIMARY KEY (id);


--
-- Name: creator_costume_extraction_jobs creator_costume_extraction_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_costume_extraction_jobs
    ADD CONSTRAINT creator_costume_extraction_jobs_pkey PRIMARY KEY (id);


--
-- Name: creator_costume_extraction_views creator_costume_extraction_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_costume_extraction_views
    ADD CONSTRAINT creator_costume_extraction_views_pkey PRIMARY KEY (id);


--
-- Name: creator_costume_extraction_views creator_costume_job_view_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_costume_extraction_views
    ADD CONSTRAINT creator_costume_job_view_unique UNIQUE (job_id, view_name);


--
-- Name: creator_costume_extraction_views creator_costume_prediction_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_costume_extraction_views
    ADD CONSTRAINT creator_costume_prediction_unique UNIQUE (prediction_id);


--
-- Name: creator_costume_extraction_jobs creator_costume_request_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_costume_extraction_jobs
    ADD CONSTRAINT creator_costume_request_unique UNIQUE (creator_id, request_key);


--
-- Name: creator_multi_view_images creator_multi_view_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_multi_view_images
    ADD CONSTRAINT creator_multi_view_images_pkey PRIMARY KEY (id);


--
-- Name: creator_multi_view_images creator_multi_view_images_prediction_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_multi_view_images
    ADD CONSTRAINT creator_multi_view_images_prediction_id_key UNIQUE (prediction_id);


--
-- Name: creator_multi_view_images creator_multi_view_images_unique_view; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_multi_view_images
    ADD CONSTRAINT creator_multi_view_images_unique_view UNIQUE (job_id, view);


--
-- Name: creator_multi_view_jobs creator_multi_view_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_multi_view_jobs
    ADD CONSTRAINT creator_multi_view_jobs_pkey PRIMARY KEY (id);


--
-- Name: creator_multi_view_jobs creator_multi_view_unique_request; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_multi_view_jobs
    ADD CONSTRAINT creator_multi_view_unique_request UNIQUE (creator_id, request_key);


--
-- Name: creator_pattern_extraction_jobs creator_pattern_extraction_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_pattern_extraction_jobs
    ADD CONSTRAINT creator_pattern_extraction_jobs_pkey PRIMARY KEY (id);


--
-- Name: creator_pattern_extraction_jobs creator_pattern_request_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_pattern_extraction_jobs
    ADD CONSTRAINT creator_pattern_request_unique UNIQUE (creator_id, request_key);


--
-- Name: creator_payout_accounts creator_payout_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_payout_accounts
    ADD CONSTRAINT creator_payout_accounts_pkey PRIMARY KEY (id);


--
-- Name: creator_payout_requests creator_payout_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_payout_requests
    ADD CONSTRAINT creator_payout_requests_pkey PRIMARY KEY (id);


--
-- Name: creator_posts creator_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_posts
    ADD CONSTRAINT creator_posts_pkey PRIMARY KEY (id);


--
-- Name: creator_profiles creator_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_profiles
    ADD CONSTRAINT creator_profiles_pkey PRIMARY KEY (id);


--
-- Name: creator_profiles creator_profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_profiles
    ADD CONSTRAINT creator_profiles_user_id_key UNIQUE (user_id);


--
-- Name: creator_sketch_to_image_jobs creator_sketch_to_image_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_sketch_to_image_jobs
    ADD CONSTRAINT creator_sketch_to_image_jobs_pkey PRIMARY KEY (id);


--
-- Name: creator_sketch_to_image_jobs creator_sketch_to_image_jobs_provider_prediction_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_sketch_to_image_jobs
    ADD CONSTRAINT creator_sketch_to_image_jobs_provider_prediction_id_key UNIQUE (provider_prediction_id);


--
-- Name: creator_sketch_to_image_jobs creator_sketch_to_image_request_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_sketch_to_image_jobs
    ADD CONSTRAINT creator_sketch_to_image_request_unique UNIQUE (creator_id, request_key);


--
-- Name: creator_text_to_image_jobs creator_text_to_image_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_text_to_image_jobs
    ADD CONSTRAINT creator_text_to_image_jobs_pkey PRIMARY KEY (id);


--
-- Name: creator_text_to_image_jobs creator_text_to_image_jobs_provider_prediction_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_text_to_image_jobs
    ADD CONSTRAINT creator_text_to_image_jobs_provider_prediction_id_key UNIQUE (provider_prediction_id);


--
-- Name: creator_text_to_image_jobs creator_text_to_image_request_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_text_to_image_jobs
    ADD CONSTRAINT creator_text_to_image_request_unique UNIQUE (creator_id, request_key);


--
-- Name: creator_virtual_tryon_jobs creator_virtual_tryon_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_virtual_tryon_jobs
    ADD CONSTRAINT creator_virtual_tryon_jobs_pkey PRIMARY KEY (id);


--
-- Name: creator_virtual_tryon_jobs creator_virtual_tryon_jobs_provider_prediction_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_virtual_tryon_jobs
    ADD CONSTRAINT creator_virtual_tryon_jobs_provider_prediction_id_key UNIQUE (provider_prediction_id);


--
-- Name: creator_virtual_tryon_jobs creator_virtual_tryon_request_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_virtual_tryon_jobs
    ADD CONSTRAINT creator_virtual_tryon_request_unique UNIQUE (creator_id, request_key);


--
-- Name: creator_wallet_deposits creator_wallet_deposits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_wallet_deposits
    ADD CONSTRAINT creator_wallet_deposits_pkey PRIMARY KEY (id);


--
-- Name: creator_wallet_refund_items creator_wallet_refund_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_wallet_refund_items
    ADD CONSTRAINT creator_wallet_refund_items_pkey PRIMARY KEY (id);


--
-- Name: creator_wallet_refund_requests creator_wallet_refund_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_wallet_refund_requests
    ADD CONSTRAINT creator_wallet_refund_requests_pkey PRIMARY KEY (id);


--
-- Name: creator_wallets creator_wallets_creator_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_wallets
    ADD CONSTRAINT creator_wallets_creator_id_key UNIQUE (creator_id);


--
-- Name: creator_wallets creator_wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_wallets
    ADD CONSTRAINT creator_wallets_pkey PRIMARY KEY (id);


--
-- Name: design_categories design_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_categories
    ADD CONSTRAINT design_categories_pkey PRIMARY KEY (id);


--
-- Name: design_categories design_categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_categories
    ADD CONSTRAINT design_categories_slug_key UNIQUE (slug);


--
-- Name: design_images design_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_images
    ADD CONSTRAINT design_images_pkey PRIMARY KEY (id);


--
-- Name: design_images design_images_position_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_images
    ADD CONSTRAINT design_images_position_unique UNIQUE (design_id, display_order);


--
-- Name: design_showcase_terms design_showcase_terms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_showcase_terms
    ADD CONSTRAINT design_showcase_terms_pkey PRIMARY KEY (design_id, term_id);


--
-- Name: designer_bank_accounts designer_bank_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designer_bank_accounts
    ADD CONSTRAINT designer_bank_accounts_pkey PRIMARY KEY (id);


--
-- Name: designer_payout_accounts designer_payout_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designer_payout_accounts
    ADD CONSTRAINT designer_payout_accounts_pkey PRIMARY KEY (id);


--
-- Name: designer_payout_attempts designer_payout_attempts_idempotency_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designer_payout_attempts
    ADD CONSTRAINT designer_payout_attempts_idempotency_unique UNIQUE (idempotency_key);


--
-- Name: designer_payout_attempts designer_payout_attempts_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designer_payout_attempts
    ADD CONSTRAINT designer_payout_attempts_number_unique UNIQUE (payout_request_id, attempt_number);


--
-- Name: designer_payout_attempts designer_payout_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designer_payout_attempts
    ADD CONSTRAINT designer_payout_attempts_pkey PRIMARY KEY (id);


--
-- Name: designer_payout_requests designer_payout_idempotency_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designer_payout_requests
    ADD CONSTRAINT designer_payout_idempotency_unique UNIQUE (designer_id, idempotency_key);


--
-- Name: designer_payout_requests designer_payout_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designer_payout_requests
    ADD CONSTRAINT designer_payout_requests_pkey PRIMARY KEY (id);


--
-- Name: designer_pitches designer_pitches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designer_pitches
    ADD CONSTRAINT designer_pitches_pkey PRIMARY KEY (id);


--
-- Name: designer_profiles designer_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designer_profiles
    ADD CONSTRAINT designer_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: designer_stripe_connect_operations designer_stripe_connect_operations_designer_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designer_stripe_connect_operations
    ADD CONSTRAINT designer_stripe_connect_operations_designer_unique UNIQUE (designer_id, provider, operation_type);


--
-- Name: designer_stripe_connect_operations designer_stripe_connect_operations_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designer_stripe_connect_operations
    ADD CONSTRAINT designer_stripe_connect_operations_key_unique UNIQUE (idempotency_key);


--
-- Name: designer_stripe_connect_operations designer_stripe_connect_operations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designer_stripe_connect_operations
    ADD CONSTRAINT designer_stripe_connect_operations_pkey PRIMARY KEY (id);


--
-- Name: designer_wallets designer_wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designer_wallets
    ADD CONSTRAINT designer_wallets_pkey PRIMARY KEY (user_id);


--
-- Name: designs designs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designs
    ADD CONSTRAINT designs_pkey PRIMARY KEY (id);


--
-- Name: designs designs_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designs
    ADD CONSTRAINT designs_sku_key UNIQUE (sku);


--
-- Name: designs designs_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designs
    ADD CONSTRAINT designs_slug_key UNIQUE (slug);


--
-- Name: editor_projects editor_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.editor_projects
    ADD CONSTRAINT editor_projects_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: payment_webhook_events payment_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_webhook_events
    ADD CONSTRAINT payment_webhook_events_pkey PRIMARY KEY (provider, event_id);


--
-- Name: project_revisions project_revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_revisions
    ADD CONSTRAINT project_revisions_pkey PRIMARY KEY (id);


--
-- Name: showcase_discovery_terms showcase_discovery_group_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.showcase_discovery_terms
    ADD CONSTRAINT showcase_discovery_group_slug_unique UNIQUE (group_type, slug);


--
-- Name: showcase_discovery_terms showcase_discovery_terms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.showcase_discovery_terms
    ADD CONSTRAINT showcase_discovery_terms_pkey PRIMARY KEY (id);


--
-- Name: showcase_hero_settings showcase_hero_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.showcase_hero_settings
    ADD CONSTRAINT showcase_hero_settings_pkey PRIMARY KEY (id);


--
-- Name: stripe_webhook_events stripe_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stripe_webhook_events
    ADD CONSTRAINT stripe_webhook_events_pkey PRIMARY KEY (event_id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: collection_items unique_collection_design; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_items
    ADD CONSTRAINT unique_collection_design UNIQUE (collection_id, design_id);


--
-- Name: creator_cart_items unique_creator_cart_design; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_cart_items
    ADD CONSTRAINT unique_creator_cart_design UNIQUE (creator_id, design_id);


--
-- Name: designer_pitches unique_designer_pitch_per_post; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designer_pitches
    ADD CONSTRAINT unique_designer_pitch_per_post UNIQUE (post_id, designer_id);


--
-- Name: designer_pitches unique_post_designer; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designer_pitches
    ADD CONSTRAINT unique_post_designer UNIQUE (post_id, designer_id);


--
-- Name: transactions unique_stripe_intent; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT unique_stripe_intent UNIQUE (stripe_payment_intent_id);


--
-- Name: transactions unique_stripe_payment_intent; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT unique_stripe_payment_intent UNIQUE (stripe_payment_intent_id);


--
-- Name: cart_items unique_user_cart_design; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT unique_user_cart_design UNIQUE (user_id, design_id);


--
-- Name: user_avatars user_avatars_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_avatars
    ADD CONSTRAINT user_avatars_pkey PRIMARY KEY (id);


--
-- Name: user_avatars user_avatars_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_avatars
    ADD CONSTRAINT user_avatars_user_id_key UNIQUE (user_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: bookings_client_request_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX bookings_client_request_id_unique ON public.bookings USING btree (client_request_id) WHERE (client_request_id IS NOT NULL);


--
-- Name: bookings_creator_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookings_creator_created_at_index ON public.bookings USING btree (creator_id, created_at DESC);


--
-- Name: bookings_designer_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookings_designer_created_at_index ON public.bookings USING btree (designer_id, created_at DESC);


--
-- Name: bookings_designer_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookings_designer_status_index ON public.bookings USING btree (designer_id, status);


--
-- Name: bookings_scheduled_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookings_scheduled_at_index ON public.bookings USING btree (designer_id, scheduled_at);


--
-- Name: bookings_stripe_payment_intent_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX bookings_stripe_payment_intent_unique ON public.bookings USING btree (stripe_payment_intent_id) WHERE (stripe_payment_intent_id IS NOT NULL);


--
-- Name: bookings_stripe_refund_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX bookings_stripe_refund_unique ON public.bookings USING btree (stripe_refund_id) WHERE (stripe_refund_id IS NOT NULL);


--
-- Name: creator_multi_view_images_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX creator_multi_view_images_active_idx ON public.creator_multi_view_images USING btree (job_id, status) WHERE (status = ANY (ARRAY['submitting'::text, 'processing'::text, 'saving'::text]));


--
-- Name: creator_multi_view_jobs_creator_recent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX creator_multi_view_jobs_creator_recent_idx ON public.creator_multi_view_jobs USING btree (creator_id, created_at DESC);


--
-- Name: creator_pattern_jobs_creator_recent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX creator_pattern_jobs_creator_recent_idx ON public.creator_pattern_extraction_jobs USING btree (creator_id, created_at DESC);


--
-- Name: creator_sketch_to_image_creator_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX creator_sketch_to_image_creator_active_idx ON public.creator_sketch_to_image_jobs USING btree (creator_id, status) WHERE (status = ANY (ARRAY['submitting'::text, 'processing'::text, 'saving'::text]));


--
-- Name: creator_sketch_to_image_creator_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX creator_sketch_to_image_creator_created_idx ON public.creator_sketch_to_image_jobs USING btree (creator_id, created_at DESC);


--
-- Name: creator_text_to_image_creator_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX creator_text_to_image_creator_active_idx ON public.creator_text_to_image_jobs USING btree (creator_id, status) WHERE (status = ANY (ARRAY['submitting'::text, 'processing'::text, 'saving'::text]));


--
-- Name: creator_text_to_image_creator_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX creator_text_to_image_creator_created_idx ON public.creator_text_to_image_jobs USING btree (creator_id, created_at DESC);


--
-- Name: creator_virtual_tryon_creator_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX creator_virtual_tryon_creator_active_idx ON public.creator_virtual_tryon_jobs USING btree (creator_id, status) WHERE (status = ANY (ARRAY['submitting'::text, 'processing'::text, 'saving'::text]));


--
-- Name: creator_virtual_tryon_creator_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX creator_virtual_tryon_creator_created_idx ON public.creator_virtual_tryon_jobs USING btree (creator_id, created_at DESC);


--
-- Name: designer_bank_accounts_designer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX designer_bank_accounts_designer_idx ON public.designer_bank_accounts USING btree (designer_id);


--
-- Name: designer_bank_accounts_one_default_per_designer; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX designer_bank_accounts_one_default_per_designer ON public.designer_bank_accounts USING btree (designer_id) WHERE ((is_default = true) AND (is_active = true));


--
-- Name: designer_payout_attempts_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX designer_payout_attempts_account_idx ON public.designer_payout_attempts USING btree (payout_account_id);


--
-- Name: designer_payout_attempts_one_open_attempt; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX designer_payout_attempts_one_open_attempt ON public.designer_payout_attempts USING btree (payout_request_id) WHERE ((status)::text = ANY ((ARRAY['pending_submission'::character varying, 'submitting'::character varying, 'pending'::character varying, 'in_transit'::character varying, 'status_unknown'::character varying])::text[]));


--
-- Name: designer_payout_attempts_provider_payout_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX designer_payout_attempts_provider_payout_unique ON public.designer_payout_attempts USING btree (provider, provider_payout_id) WHERE (provider_payout_id IS NOT NULL);


--
-- Name: designer_payout_attempts_request_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX designer_payout_attempts_request_created_idx ON public.designer_payout_attempts USING btree (payout_request_id, created_at DESC);


--
-- Name: designer_payout_attempts_request_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX designer_payout_attempts_request_status_idx ON public.designer_payout_attempts USING btree (payout_request_id, status);


--
-- Name: designer_payout_attempts_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX designer_payout_attempts_status_idx ON public.designer_payout_attempts USING btree (status, created_at);


--
-- Name: designer_payout_provider_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX designer_payout_provider_id_unique ON public.designer_payout_requests USING btree (provider_payout_id) WHERE (provider_payout_id IS NOT NULL);


--
-- Name: designer_payout_requests_bank_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX designer_payout_requests_bank_account_idx ON public.designer_payout_requests USING btree (bank_account_id);


--
-- Name: designer_payout_requests_designer_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX designer_payout_requests_designer_created_idx ON public.designer_payout_requests USING btree (designer_id, requested_at DESC);


--
-- Name: designer_payout_requests_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX designer_payout_requests_status_idx ON public.designer_payout_requests USING btree (status, requested_at);


--
-- Name: designer_stripe_connect_operations_designer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX designer_stripe_connect_operations_designer_idx ON public.designer_stripe_connect_operations USING btree (designer_id, created_at DESC);


--
-- Name: designer_stripe_connect_operations_provider_account_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX designer_stripe_connect_operations_provider_account_uidx ON public.designer_stripe_connect_operations USING btree (provider, provider_account_id) WHERE (provider_account_id IS NOT NULL);


--
-- Name: idx_booking_design_snapshots_creator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_design_snapshots_creator ON public.booking_design_snapshots USING btree (creator_id);


--
-- Name: idx_booking_design_snapshots_source_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_design_snapshots_source_project ON public.booking_design_snapshots USING btree (source_editor_project_id);


--
-- Name: idx_bookings_creator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_creator ON public.bookings USING btree (creator_id);


--
-- Name: idx_bookings_creator_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_creator_id ON public.bookings USING btree (creator_id);


--
-- Name: idx_bookings_deadline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_deadline ON public.bookings USING btree (deadline);


--
-- Name: idx_bookings_designer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_designer ON public.bookings USING btree (designer_id);


--
-- Name: idx_bookings_designer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_designer_id ON public.bookings USING btree (designer_id);


--
-- Name: idx_bookings_payment_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_payment_provider ON public.bookings USING btree (payment_provider);


--
-- Name: idx_bookings_provider_capture; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_provider_capture ON public.bookings USING btree (provider_capture_id);


--
-- Name: idx_bookings_provider_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_provider_payment ON public.bookings USING btree (provider_payment_id);


--
-- Name: idx_bookings_provider_refund; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_provider_refund ON public.bookings USING btree (provider_refund_id);


--
-- Name: idx_bookings_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_status ON public.bookings USING btree (status);


--
-- Name: idx_bookings_stripe_intent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_stripe_intent ON public.bookings USING btree (stripe_payment_intent_id);


--
-- Name: idx_creator_costume_jobs_creator_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creator_costume_jobs_creator_created ON public.creator_costume_extraction_jobs USING btree (creator_id, created_at DESC);


--
-- Name: idx_creator_costume_jobs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creator_costume_jobs_status ON public.creator_costume_extraction_jobs USING btree (status);


--
-- Name: idx_creator_costume_views_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creator_costume_views_job ON public.creator_costume_extraction_views USING btree (job_id);


--
-- Name: idx_creator_costume_views_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creator_costume_views_status ON public.creator_costume_extraction_views USING btree (status);


--
-- Name: idx_creator_payout_accounts_creator_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creator_payout_accounts_creator_id ON public.creator_payout_accounts USING btree (creator_id);


--
-- Name: idx_creator_payout_requests_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creator_payout_requests_account ON public.creator_payout_requests USING btree (payout_account_id);


--
-- Name: idx_creator_payout_requests_creator_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creator_payout_requests_creator_id ON public.creator_payout_requests USING btree (creator_id);


--
-- Name: idx_creator_payout_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creator_payout_requests_status ON public.creator_payout_requests USING btree (status);


--
-- Name: idx_creator_profile_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creator_profile_lookup ON public.creator_profiles USING btree (user_id);


--
-- Name: idx_creator_wallet_deposits_creator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creator_wallet_deposits_creator ON public.creator_wallet_deposits USING btree (creator_id, created_at DESC);


--
-- Name: idx_creator_wallet_deposits_refundable; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creator_wallet_deposits_refundable ON public.creator_wallet_deposits USING btree (creator_id, created_at) WHERE (remaining_refundable_amount > (0)::numeric);


--
-- Name: idx_creator_wallet_deposits_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creator_wallet_deposits_status ON public.creator_wallet_deposits USING btree (creator_id, status);


--
-- Name: idx_creator_wallet_refund_items_deposit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creator_wallet_refund_items_deposit ON public.creator_wallet_refund_items USING btree (deposit_id);


--
-- Name: idx_creator_wallet_refund_items_recovery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creator_wallet_refund_items_recovery ON public.creator_wallet_refund_items USING btree (status, updated_at) WHERE ((status)::text = ANY ((ARRAY['submitting'::character varying, 'processing'::character varying, 'status_unknown'::character varying])::text[]));


--
-- Name: idx_creator_wallet_refund_items_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creator_wallet_refund_items_request ON public.creator_wallet_refund_items USING btree (refund_request_id);


--
-- Name: idx_creator_wallet_refund_items_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creator_wallet_refund_items_status ON public.creator_wallet_refund_items USING btree (refund_request_id, status);


--
-- Name: idx_creator_wallet_refund_requests_creator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creator_wallet_refund_requests_creator ON public.creator_wallet_refund_requests USING btree (creator_id, requested_at DESC);


--
-- Name: idx_creator_wallet_refund_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creator_wallet_refund_requests_status ON public.creator_wallet_refund_requests USING btree (creator_id, status);


--
-- Name: idx_creator_wallets_creator_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creator_wallets_creator_id ON public.creator_wallets USING btree (creator_id);


--
-- Name: idx_design_showcase_terms_term; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_design_showcase_terms_term ON public.design_showcase_terms USING btree (term_id, design_id);


--
-- Name: idx_designer_payout_accounts_designer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_designer_payout_accounts_designer ON public.designer_payout_accounts USING btree (designer_id);


--
-- Name: idx_designer_payout_accounts_designer_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_designer_payout_accounts_designer_provider ON public.designer_payout_accounts USING btree (designer_id, provider);


--
-- Name: idx_designer_payout_accounts_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_designer_payout_accounts_provider ON public.designer_payout_accounts USING btree (provider);


--
-- Name: idx_designer_payout_accounts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_designer_payout_accounts_status ON public.designer_payout_accounts USING btree (status);


--
-- Name: idx_designer_payout_requests_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_designer_payout_requests_account ON public.designer_payout_requests USING btree (payout_account_id);


--
-- Name: idx_designer_payout_requests_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_designer_payout_requests_provider ON public.designer_payout_requests USING btree (provider);


--
-- Name: idx_designer_payout_requests_provider_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_designer_payout_requests_provider_status ON public.designer_payout_requests USING btree (provider, provider_status);


--
-- Name: idx_designer_profile_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_designer_profile_lookup ON public.designer_profiles USING btree (user_id);


--
-- Name: idx_designs_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_designs_category ON public.designs USING btree (style_category);


--
-- Name: idx_designs_category_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_designs_category_id ON public.designs USING btree (category_id);


--
-- Name: idx_designs_editor_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_designs_editor_project_id ON public.designs USING btree (editor_project_id);


--
-- Name: idx_designs_original_design_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_designs_original_design_id ON public.designs USING btree (original_design_id);


--
-- Name: idx_designs_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_designs_search ON public.designs USING gin (to_tsvector('english'::regconfig, (((title)::text || ' '::text) || description)));


--
-- Name: idx_designs_source_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_designs_source_type ON public.designs USING btree (source_type);


--
-- Name: idx_designs_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_designs_tags ON public.designs USING gin (tags);


--
-- Name: idx_designs_tryon_dispatched; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_designs_tryon_dispatched ON public.designs USING btree (tryon_dispatched_at) WHERE (tryon_dispatched_at IS NOT NULL);


--
-- Name: idx_editor_projects_owner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_editor_projects_owner_id ON public.editor_projects USING btree (owner_id);


--
-- Name: idx_editor_projects_source_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_editor_projects_source_project_id ON public.editor_projects USING btree (source_project_id);


--
-- Name: idx_editor_projects_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_editor_projects_updated_at ON public.editor_projects USING btree (updated_at DESC);


--
-- Name: idx_notifications_user_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id) WHERE (is_read = false);


--
-- Name: idx_payment_webhook_event_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_webhook_event_type ON public.payment_webhook_events USING btree (provider, event_type);


--
-- Name: idx_payment_webhook_received_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_webhook_received_at ON public.payment_webhook_events USING btree (received_at);


--
-- Name: idx_showcase_discovery_group_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_showcase_discovery_group_active ON public.showcase_discovery_terms USING btree (group_type, is_active, sort_order);


--
-- Name: idx_showcase_discovery_trending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_showcase_discovery_trending ON public.showcase_discovery_terms USING btree (is_trending, sort_order) WHERE ((is_active = true) AND (is_trending = true));


--
-- Name: idx_transactions_payment_intent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_payment_intent ON public.transactions USING btree (stripe_payment_intent_id);


--
-- Name: idx_transactions_payment_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_payment_provider ON public.transactions USING btree (payment_provider);


--
-- Name: idx_transactions_provider_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_provider_payment ON public.transactions USING btree (provider_payment_id);


--
-- Name: idx_transactions_provider_transaction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_provider_transaction ON public.transactions USING btree (provider_transaction_id);


--
-- Name: idx_transactions_sender_receiver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_sender_receiver ON public.transactions USING btree (sender_id, receiver_id);


--
-- Name: idx_transactions_stripe_intent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_stripe_intent ON public.transactions USING btree (stripe_payment_intent_id);


--
-- Name: transactions_payout_reference_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX transactions_payout_reference_unique ON public.transactions USING btree (reference_id, transaction_type) WHERE (transaction_type = 'payout'::public.trans_type);


--
-- Name: transactions_reference_type_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactions_reference_type_index ON public.transactions USING btree (reference_id, transaction_type);


--
-- Name: transactions_stripe_payment_intent_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX transactions_stripe_payment_intent_unique ON public.transactions USING btree (stripe_payment_intent_id) WHERE (stripe_payment_intent_id IS NOT NULL);


--
-- Name: unique_booking_provider_capture; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_booking_provider_capture ON public.bookings USING btree (payment_provider, provider_capture_id) WHERE ((payment_provider IS NOT NULL) AND (provider_capture_id IS NOT NULL));


--
-- Name: unique_booking_provider_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_booking_provider_payment ON public.bookings USING btree (payment_provider, provider_payment_id) WHERE ((payment_provider IS NOT NULL) AND (provider_payment_id IS NOT NULL));


--
-- Name: unique_creator_wallet_deposit_request; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_creator_wallet_deposit_request ON public.creator_wallet_deposits USING btree (creator_id, client_request_id);


--
-- Name: unique_creator_wallet_provider_capture; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_creator_wallet_provider_capture ON public.creator_wallet_deposits USING btree (payment_provider, provider_capture_id) WHERE (provider_capture_id IS NOT NULL);


--
-- Name: unique_creator_wallet_provider_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_creator_wallet_provider_payment ON public.creator_wallet_deposits USING btree (payment_provider, provider_payment_id) WHERE (provider_payment_id IS NOT NULL);


--
-- Name: unique_creator_wallet_provider_refund; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_creator_wallet_provider_refund ON public.creator_wallet_refund_items USING btree (payment_provider, provider_refund_id) WHERE (provider_refund_id IS NOT NULL);


--
-- Name: unique_creator_wallet_refund_item_deposit; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_creator_wallet_refund_item_deposit ON public.creator_wallet_refund_items USING btree (refund_request_id, deposit_id);


--
-- Name: unique_creator_wallet_refund_item_idempotency_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_creator_wallet_refund_item_idempotency_key ON public.creator_wallet_refund_items USING btree (provider_idempotency_key);


--
-- Name: unique_creator_wallet_refund_request; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_creator_wallet_refund_request ON public.creator_wallet_refund_requests USING btree (creator_id, client_request_id);


--
-- Name: unique_default_designer_payout_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_default_designer_payout_provider ON public.designer_payout_accounts USING btree (designer_id, provider) WHERE (is_default = true);


--
-- Name: unique_designer_provider_account; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_designer_provider_account ON public.designer_payout_accounts USING btree (provider, provider_account_id);


--
-- Name: unique_designer_provider_payout; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_designer_provider_payout ON public.designer_payout_requests USING btree (provider, provider_payout_id) WHERE ((provider IS NOT NULL) AND (provider_payout_id IS NOT NULL));


--
-- Name: uq_creator_default_payout_account; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_creator_default_payout_account ON public.creator_payout_accounts USING btree (creator_id) WHERE (is_default = true);


--
-- Name: uq_creator_payout_client_request; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_creator_payout_client_request ON public.creator_payout_requests USING btree (creator_id, client_request_id);


--
-- Name: uq_creator_payout_provider_account; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_creator_payout_provider_account ON public.creator_payout_accounts USING btree (provider, provider_account_id) WHERE (provider_account_id IS NOT NULL);


--
-- Name: uq_creator_provider_payout_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_creator_provider_payout_id ON public.creator_payout_requests USING btree (provider, provider_payout_id) WHERE (provider_payout_id IS NOT NULL);


--
-- Name: users_stripe_customer_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_stripe_customer_id_unique ON public.users USING btree (stripe_customer_id) WHERE (stripe_customer_id IS NOT NULL);


--
-- Name: users_stripe_subscription_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_stripe_subscription_id_unique ON public.users USING btree (stripe_subscription_id) WHERE (stripe_subscription_id IS NOT NULL);


--
-- Name: ux_editor_projects_owner_source_design; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_editor_projects_owner_source_design ON public.editor_projects USING btree (owner_id, source_design_id) WHERE (source_design_id IS NOT NULL);


--
-- Name: ux_editor_projects_owner_source_image; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_editor_projects_owner_source_image ON public.editor_projects USING btree (owner_id, source_image_id) WHERE (source_image_id IS NOT NULL);


--
-- Name: ux_editor_projects_owner_source_images; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_editor_projects_owner_source_images ON public.editor_projects USING btree (owner_id, source_image_ids) WHERE (source_image_ids IS NOT NULL);


--
-- Name: creator_costume_extraction_jobs trg_creator_costume_jobs_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_creator_costume_jobs_updated BEFORE UPDATE ON public.creator_costume_extraction_jobs FOR EACH ROW EXECUTE FUNCTION public.update_creator_costume_timestamp();


--
-- Name: creator_costume_extraction_views trg_creator_costume_views_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_creator_costume_views_updated BEFORE UPDATE ON public.creator_costume_extraction_views FOR EACH ROW EXECUTE FUNCTION public.update_creator_costume_timestamp();


--
-- Name: designs update_designs_modtime; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_designs_modtime BEFORE UPDATE ON public.designs FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();


--
-- Name: users update_users_modtime; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_users_modtime BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();


--
-- Name: booking_design_snapshots booking_design_snapshots_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_design_snapshots
    ADD CONSTRAINT booking_design_snapshots_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: booking_design_snapshots booking_design_snapshots_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_design_snapshots
    ADD CONSTRAINT booking_design_snapshots_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id);


--
-- Name: booking_design_snapshots booking_design_snapshots_source_editor_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_design_snapshots
    ADD CONSTRAINT booking_design_snapshots_source_editor_project_id_fkey FOREIGN KEY (source_editor_project_id) REFERENCES public.editor_projects(id) ON DELETE SET NULL;


--
-- Name: bookings bookings_cancellation_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_cancellation_requested_by_fkey FOREIGN KEY (cancellation_requested_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: bookings bookings_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id);


--
-- Name: bookings bookings_design_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_design_id_fkey FOREIGN KEY (design_id) REFERENCES public.designs(id);


--
-- Name: bookings bookings_designer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_designer_id_fkey FOREIGN KEY (designer_id) REFERENCES public.users(id);


--
-- Name: cart_items cart_items_design_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_design_id_fkey FOREIGN KEY (design_id) REFERENCES public.designs(id) ON DELETE CASCADE;


--
-- Name: cart_items cart_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chat_rooms chat_rooms_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_rooms
    ADD CONSTRAINT chat_rooms_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;


--
-- Name: chat_rooms chat_rooms_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_rooms
    ADD CONSTRAINT chat_rooms_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id);


--
-- Name: chat_rooms chat_rooms_designer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_rooms
    ADD CONSTRAINT chat_rooms_designer_id_fkey FOREIGN KEY (designer_id) REFERENCES public.users(id);


--
-- Name: collection_items collection_items_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_items
    ADD CONSTRAINT collection_items_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.collections(id) ON DELETE CASCADE;


--
-- Name: collection_items collection_items_design_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_items
    ADD CONSTRAINT collection_items_design_id_fkey FOREIGN KEY (design_id) REFERENCES public.designs(id) ON DELETE CASCADE;


--
-- Name: collections collections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: creator_cart_items creator_cart_items_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_cart_items
    ADD CONSTRAINT creator_cart_items_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: creator_cart_items creator_cart_items_design_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_cart_items
    ADD CONSTRAINT creator_cart_items_design_id_fkey FOREIGN KEY (design_id) REFERENCES public.designs(id) ON DELETE CASCADE;


--
-- Name: creator_costume_extraction_views creator_costume_extraction_views_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_costume_extraction_views
    ADD CONSTRAINT creator_costume_extraction_views_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.creator_costume_extraction_jobs(id) ON DELETE CASCADE;


--
-- Name: creator_multi_view_images creator_multi_view_images_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_multi_view_images
    ADD CONSTRAINT creator_multi_view_images_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.creator_multi_view_jobs(id) ON DELETE CASCADE;


--
-- Name: creator_multi_view_jobs creator_multi_view_jobs_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_multi_view_jobs
    ADD CONSTRAINT creator_multi_view_jobs_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: creator_pattern_extraction_jobs creator_pattern_extraction_jobs_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_pattern_extraction_jobs
    ADD CONSTRAINT creator_pattern_extraction_jobs_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: creator_payout_accounts creator_payout_accounts_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_payout_accounts
    ADD CONSTRAINT creator_payout_accounts_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: creator_payout_requests creator_payout_requests_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_payout_requests
    ADD CONSTRAINT creator_payout_requests_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: creator_payout_requests creator_payout_requests_payout_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_payout_requests
    ADD CONSTRAINT creator_payout_requests_payout_account_id_fkey FOREIGN KEY (payout_account_id) REFERENCES public.creator_payout_accounts(id) ON DELETE SET NULL;


--
-- Name: creator_posts creator_posts_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_posts
    ADD CONSTRAINT creator_posts_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: creator_sketch_to_image_jobs creator_sketch_to_image_jobs_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_sketch_to_image_jobs
    ADD CONSTRAINT creator_sketch_to_image_jobs_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: creator_text_to_image_jobs creator_text_to_image_jobs_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_text_to_image_jobs
    ADD CONSTRAINT creator_text_to_image_jobs_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: creator_virtual_tryon_jobs creator_virtual_tryon_jobs_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_virtual_tryon_jobs
    ADD CONSTRAINT creator_virtual_tryon_jobs_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: creator_wallet_deposits creator_wallet_deposits_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_wallet_deposits
    ADD CONSTRAINT creator_wallet_deposits_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: creator_wallet_refund_items creator_wallet_refund_items_deposit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_wallet_refund_items
    ADD CONSTRAINT creator_wallet_refund_items_deposit_id_fkey FOREIGN KEY (deposit_id) REFERENCES public.creator_wallet_deposits(id) ON DELETE RESTRICT;


--
-- Name: creator_wallet_refund_items creator_wallet_refund_items_refund_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_wallet_refund_items
    ADD CONSTRAINT creator_wallet_refund_items_refund_request_id_fkey FOREIGN KEY (refund_request_id) REFERENCES public.creator_wallet_refund_requests(id) ON DELETE CASCADE;


--
-- Name: creator_wallet_refund_requests creator_wallet_refund_requests_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_wallet_refund_requests
    ADD CONSTRAINT creator_wallet_refund_requests_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: creator_wallets creator_wallets_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_wallets
    ADD CONSTRAINT creator_wallets_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: design_images design_images_design_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_images
    ADD CONSTRAINT design_images_design_id_fkey FOREIGN KEY (design_id) REFERENCES public.designs(id) ON DELETE CASCADE;


--
-- Name: design_showcase_terms design_showcase_terms_design_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_showcase_terms
    ADD CONSTRAINT design_showcase_terms_design_fkey FOREIGN KEY (design_id) REFERENCES public.designs(id) ON DELETE CASCADE;


--
-- Name: design_showcase_terms design_showcase_terms_term_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_showcase_terms
    ADD CONSTRAINT design_showcase_terms_term_fkey FOREIGN KEY (term_id) REFERENCES public.showcase_discovery_terms(id) ON DELETE CASCADE;


--
-- Name: designer_bank_accounts designer_bank_accounts_designer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designer_bank_accounts
    ADD CONSTRAINT designer_bank_accounts_designer_id_fkey FOREIGN KEY (designer_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: designer_payout_accounts designer_payout_accounts_designer_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designer_payout_accounts
    ADD CONSTRAINT designer_payout_accounts_designer_fkey FOREIGN KEY (designer_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: designer_payout_attempts designer_payout_attempts_account_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designer_payout_attempts
    ADD CONSTRAINT designer_payout_attempts_account_fkey FOREIGN KEY (payout_account_id) REFERENCES public.designer_payout_accounts(id) ON DELETE SET NULL;


--
-- Name: designer_payout_attempts designer_payout_attempts_request_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designer_payout_attempts
    ADD CONSTRAINT designer_payout_attempts_request_fkey FOREIGN KEY (payout_request_id) REFERENCES public.designer_payout_requests(id) ON DELETE RESTRICT;


--
-- Name: designer_payout_requests designer_payout_requests_bank_account_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designer_payout_requests
    ADD CONSTRAINT designer_payout_requests_bank_account_fkey FOREIGN KEY (bank_account_id) REFERENCES public.designer_bank_accounts(id) ON DELETE SET NULL;


--
-- Name: designer_payout_requests designer_payout_requests_designer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designer_payout_requests
    ADD CONSTRAINT designer_payout_requests_designer_id_fkey FOREIGN KEY (designer_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: designer_payout_requests designer_payout_requests_payout_account_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designer_payout_requests
    ADD CONSTRAINT designer_payout_requests_payout_account_fkey FOREIGN KEY (payout_account_id) REFERENCES public.designer_payout_accounts(id) ON DELETE SET NULL;


--
-- Name: designer_pitches designer_pitches_designer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designer_pitches
    ADD CONSTRAINT designer_pitches_designer_id_fkey FOREIGN KEY (designer_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: designer_pitches designer_pitches_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designer_pitches
    ADD CONSTRAINT designer_pitches_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.creator_posts(id) ON DELETE CASCADE;


--
-- Name: designer_profiles designer_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designer_profiles
    ADD CONSTRAINT designer_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: designer_stripe_connect_operations designer_stripe_connect_operations_designer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designer_stripe_connect_operations
    ADD CONSTRAINT designer_stripe_connect_operations_designer_id_fkey FOREIGN KEY (designer_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: designer_wallets designer_wallets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designer_wallets
    ADD CONSTRAINT designer_wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: designs designs_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designs
    ADD CONSTRAINT designs_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.design_categories(id) ON DELETE SET NULL;


--
-- Name: designs designs_editor_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designs
    ADD CONSTRAINT designs_editor_project_id_fkey FOREIGN KEY (editor_project_id) REFERENCES public.editor_projects(id) ON DELETE SET NULL;


--
-- Name: designs designs_original_design_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designs
    ADD CONSTRAINT designs_original_design_id_fkey FOREIGN KEY (original_design_id) REFERENCES public.designs(id) ON DELETE SET NULL;


--
-- Name: designs designs_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designs
    ADD CONSTRAINT designs_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: editor_projects editor_projects_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.editor_projects
    ADD CONSTRAINT editor_projects_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: editor_projects editor_projects_source_design_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.editor_projects
    ADD CONSTRAINT editor_projects_source_design_id_fkey FOREIGN KEY (source_design_id) REFERENCES public.designs(id) ON DELETE SET NULL;


--
-- Name: editor_projects editor_projects_source_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.editor_projects
    ADD CONSTRAINT editor_projects_source_project_id_fkey FOREIGN KEY (source_project_id) REFERENCES public.editor_projects(id) ON DELETE SET NULL;


--
-- Name: creator_profiles fk_creator_profile_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_profiles
    ADD CONSTRAINT fk_creator_profile_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: editor_projects fk_editor_projects_source_image; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.editor_projects
    ADD CONSTRAINT fk_editor_projects_source_image FOREIGN KEY (source_image_id) REFERENCES public.design_images(id) ON DELETE SET NULL;


--
-- Name: messages messages_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.chat_rooms(id) ON DELETE CASCADE;


--
-- Name: messages messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id);


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_design_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_design_id_fkey FOREIGN KEY (design_id) REFERENCES public.designs(id) ON DELETE RESTRICT;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: orders orders_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: project_revisions project_revisions_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_revisions
    ADD CONSTRAINT project_revisions_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: project_revisions project_revisions_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_revisions
    ADD CONSTRAINT project_revisions_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id);


--
-- Name: showcase_hero_settings showcase_hero_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.showcase_hero_settings
    ADD CONSTRAINT showcase_hero_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: transactions transactions_receiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES public.users(id);


--
-- Name: transactions transactions_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id);


--
-- Name: user_avatars user_avatars_featured_design_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_avatars
    ADD CONSTRAINT user_avatars_featured_design_id_fkey FOREIGN KEY (featured_design_id) REFERENCES public.designs(id) ON DELETE SET NULL;


--
-- Name: user_avatars user_avatars_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_avatars
    ADD CONSTRAINT user_avatars_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict Ge7d8efZGqrxi4UtK4fL99OS4frAR0cXg7mbL4lbM6dzD7oOFOaGeFX8geSpEnh

