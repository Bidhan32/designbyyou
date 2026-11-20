CREATE TABLE public.booking_tool_references (
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('initial', 'booking_try_on')),
  reference jsonb NOT NULL,
  PRIMARY KEY (booking_id, kind)
);
