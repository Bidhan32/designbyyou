-- Existing style IDs remain available to previously saved designs.
UPDATE public.showcase_discovery_terms SET is_active=false WHERE group_type='style';

INSERT INTO public.showcase_discovery_terms (group_type,name,slug,search_term,sort_order,is_active)
VALUES
  ('style','Summer Outfit','summer-outfit','summer outfit',1,true),
  ('style','Winter Outfit','winter-outfit','winter outfit',2,true),
  ('style','Beach / Resort','beach-resort','beach / resort',3,true),
  ('style','Travel Outfit','travel-outfit','travel outfit',4,true),
  ('style','Cozy / Lounge','cozy-lounge','cozy / lounge',5,true),
  ('style','Grunge','grunge','grunge',6,true),
  ('style','Preppy','preppy','preppy',7,true),
  ('style','Vintage / Retro','vintage','vintage / retro',8,true),
  ('style','Y2K','y2k','y2k',9,true),
  ('style','Minimalist','minimalist','minimalist',10,true),
  ('style','Ethnic / Traditional','ethnic-traditional','ethnic / traditional',11,true),
  ('style','Boho / Bohemian','bohemian','boho / bohemian',12,true),
  ('style','Party / Night Out','party-night-out','party / night out',13,true),
  ('style','Business Professional','business-professional','business professional',14,true),
  ('style','Formal / Office','formal-office','formal / office',15,true),
  ('style','Athleisure','athleisure','athleisure',16,true),
  ('style','Streetwear','streetwear','streetwear',17,true),
  ('style','Casual','casual','casual',18,true)
ON CONFLICT (group_type,slug) DO UPDATE SET
  name=EXCLUDED.name, search_term=EXCLUDED.search_term, sort_order=EXCLUDED.sort_order,
  is_active=true, updated_at=now();

