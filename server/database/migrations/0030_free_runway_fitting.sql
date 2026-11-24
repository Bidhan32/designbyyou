-- Release outstanding runway reservations through the existing refund trigger.
UPDATE public.ai_image_reservations r SET status='failed'
FROM public.creator_virtual_tryon_jobs j
WHERE j.weekly_runway AND r.tool='creator_virtual_tryon_jobs'
  AND r.image_id=j.id AND r.creator_id=j.creator_id AND r.status='reserved';

DROP TRIGGER tryon_image_credit ON public.creator_virtual_tryon_jobs;
CREATE TRIGGER tryon_image_credit AFTER INSERT OR UPDATE OF status ON public.creator_virtual_tryon_jobs
    FOR EACH ROW WHEN (NOT NEW.weekly_runway) EXECUTE FUNCTION public.track_ai_image();
CREATE TRIGGER tryon_delete_credit AFTER DELETE ON public.creator_virtual_tryon_jobs
    FOR EACH ROW WHEN (NOT OLD.weekly_runway) EXECUTE FUNCTION public.track_ai_image();