import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
// 🚀 ADDED: Edit2 imported for the Remix button
import { Search, Loader2, Sparkles, Zap, User, ShieldAlert, Crown, Flame, Star, ChevronRight, ChevronLeft, ArrowRight, Edit2 } from 'lucide-react';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';

const CATEGORIES = ['All', 'Concept Art', 'Avant-Garde', 'Minimalist', 'Streetwear', 'High-Fashion', 'Textiles'];

const HERO_SLIDES = [
  {
    subtitle: 'Welcome to DesignByYou',
    title: 'Design',
    highlight: 'Reimagined.',
    desc: 'Connect with world-class digital architects and bring your concepts to reality.',
    image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop',
  },
  {
    subtitle: 'The Inspiration Directory',
    title: 'Escrow',
    highlight: 'Secured.',
    desc: 'Explore a secure vault of exclusive design concepts ready for instant commissioning.',
    image: 'https://images.unsplash.com/photo-1600607686527-6fb886090705?q=80&w=2500&auto=format&fit=crop',
  },
  {
    subtitle: 'Elite Network',
    title: 'Scale',
    highlight: 'Boundless.',
    desc: 'Initiate zero-fee escrow contracts instantly with verified pro designers.',
    image: 'https://images.unsplash.com/photo-1634084462412-254141397efb?q=80&w=2500&auto=format&fit=crop',
  },
];

export default function CreatorShowcase() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isCreator = user?.role === 'creator';
  
  // FIX: Safely check if user exists before converting the ID to a string
  const currentUserId = user ? String(user.id || user._id) : null;

  const [items, setItems] = useState([]);
  const [topDesigners, setTopDesigners] = useState([]);
  const [topDesigns, setTopDesigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [currentSlide, setCurrentSlide] = useState(0);
  const carouselRef = useRef(null);

  const scrollCarousel = (direction) => {
    if (carouselRef.current) {
      const scrollAmount = window.innerWidth > 768 ? 680 : 300;
      carouselRef.current.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
    }
  };

  // Preserve the existing carousel timing and all data behaviour.
  useEffect(() => {
    const timer = setInterval(() => setCurrentSlide((prev) => (prev + 1) % HERO_SLIDES.length), 7000);
    return () => clearInterval(timer);
  }, [currentSlide]);

  // Preserve the existing endpoints, filtering, debounce and ranking behaviour.
  useEffect(() => {
    if (!isCreator) {
      setLoading(false);
      return;
    }

    const fetchShowcaseAndNetwork = async () => {
      try {
        setLoading(true);
        const params = {};
        if (searchQuery.trim()) params.search = searchQuery;
        if (selectedCategory !== 'All') params.style = selectedCategory;

        const [pipelineRes, usersRes] = await Promise.all([
          API.get('/creator-showcase/pipeline', { params }),
          API.get('/users'),
        ]);

        const fetchedItems = pipelineRes.data?.data || [];
        setItems(fetchedItems);
        setTopDesigns([...fetchedItems].sort((a, b) => (parseFloat(b.avg_rating) || 0) - (parseFloat(a.avg_rating) || 0)).slice(0, 5));

        const allUsers = Array.isArray(usersRes.data) ? usersRes.data : usersRes.data?.data || [];
        setTopDesigners(allUsers
          .filter((networkUser) => networkUser.role === 'designer')
          .sort((a, b) => (parseInt(b.total_completed_bookings, 10) || 0) - (parseInt(a.total_completed_bookings, 10) || 0))
          .slice(0, 5));
        setError(null);
      } catch (requestError) {
        console.error('Failed to load showcase network:', requestError);
        setError('Unable to connect to the secure showcase network.');
      } finally {
        setLoading(false);
      }
    };

    const delayDebounceFn = setTimeout(fetchShowcaseAndNetwork, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, selectedCategory, isCreator]);

  if (!isCreator) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070707] p-6 text-white">
        <div className="absolute -left-36 -top-36 h-96 w-96 rounded-full bg-rose-500/10 blur-[120px]" />
        <div className="relative w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.035] p-10 text-center shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl">
          <ShieldAlert className="mx-auto mb-6 text-rose-400" size={52} />
          <h2 className="font-serif text-3xl tracking-tight">Access restricted</h2>
          <p className="mt-3 text-sm leading-6 text-white/50">The Inspiration Directory is exclusively reserved for verified creators.</p>
          <button type="button" onClick={() => navigate('/')} className="mt-8 w-full rounded-full border border-white/15 bg-white/[0.06] py-4 text-[10px] font-black uppercase tracking-[0.24em] transition hover:bg-white hover:text-black">Return to safety</button>
        </div>
      </div>
    );
  }

  const aspectRatios = ['3/4', '4/5', '1/1', '16/9', '2/3'];

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#080808] pb-28 text-white selection:bg-[#d7b66a] selection:text-black">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-48 -top-48 h-[38rem] w-[38rem] rounded-full bg-[#d7b66a]/[0.07] blur-[150px]" />
        <div className="absolute -bottom-40 -right-32 h-[34rem] w-[34rem] rounded-full bg-indigo-500/[0.06] blur-[150px]" />
      </div>

      <main className="relative z-10 mx-auto max-w-[1800px] px-4 pt-6 sm:px-6 md:px-10 lg:px-12">
        <section className="relative min-h-[570px] overflow-hidden rounded-[2rem] border border-white/10 bg-[#101010] shadow-[0_36px_120px_rgba(0,0,0,0.68)] sm:min-h-[620px] sm:rounded-[2.75rem] lg:min-h-[700px]">
          {HERO_SLIDES.map((slide, index) => {
            const isActive = index === currentSlide;
            return (
              <div key={slide.highlight} className={`absolute inset-0 transition-opacity duration-1000 ease-out ${isActive ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}>
                <img src={slide.image} alt="" className={`absolute inset-0 h-full w-full object-cover opacity-55 transition-transform duration-[10000ms] ease-out ${isActive ? 'scale-100' : 'scale-110'}`} />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_76%_28%,rgba(229,198,125,0.18),transparent_27%)]" />
                <div className="absolute inset-0 bg-gradient-to-r from-[#080808] via-[#080808]/85 to-[#080808]/10" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/90 via-transparent to-black/20" />
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#e5c67d]/60 to-transparent" />

                <div className={`relative flex min-h-[570px] max-w-4xl flex-col justify-center px-7 py-20 transition duration-700 sm:min-h-[620px] sm:px-12 md:px-20 lg:min-h-[700px] ${isActive ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'}`}>
                  <div className="mb-7 flex items-center gap-4">
                    <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.34em] text-[#e5c67d]"><Sparkles size={14} className="animate-pulse" /> {slide.subtitle}</span>
                    <span className="h-px w-10 bg-[#e5c67d]/50" />
                    <span className="text-[10px] font-bold tracking-[0.2em] text-white/35">0{index + 1} / 0{HERO_SLIDES.length}</span>
                  </div>
                  <h1 className="max-w-3xl font-serif text-[3.3rem] leading-[0.88] tracking-[-0.045em] text-white sm:text-7xl lg:text-[6.8rem]">{slide.title}<br /><span className="italic text-[#e5c67d] drop-shadow-[0_0_28px_rgba(229,198,125,0.16)]">{slide.highlight}</span></h1>
                  <p className="mt-8 max-w-xl border-l border-[#e5c67d]/55 pl-5 text-sm leading-7 text-white/70 sm:text-lg sm:leading-8">{slide.desc}</p>
                  <button type="button" onClick={() => navigate('/creator/bookings/new')} className="mt-10 flex w-fit items-center gap-3 rounded-full bg-[#e5c67d] px-7 py-4 text-[10px] font-black uppercase tracking-[0.22em] text-[#17120a] transition hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_0_42px_rgba(229,198,125,0.44)]"><Zap size={15} fill="currentColor" /> Direct commission <ArrowRight size={14} /></button>
                </div>

                <div className={`absolute bottom-24 right-10 hidden w-[260px] border-l border-white/20 pl-6 transition duration-700 lg:block xl:right-16 ${isActive ? 'translate-x-0 opacity-100 delay-300' : 'translate-x-5 opacity-0'}`}>
                  <p className="text-[9px] font-black uppercase tracking-[0.28em] text-[#e5c67d]">Private curation</p>
                  <p className="mt-3 font-serif text-2xl leading-tight text-white/90">Built for the next remarkable idea.</p>
                  <p className="mt-4 text-xs leading-6 text-white/50">Explore a considered collection of designs from creators shaping the culture.</p>
                </div>
              </div>
            );
          })}
          <div className="absolute bottom-8 left-7 right-7 z-20 flex items-end justify-between gap-5 sm:left-12 sm:right-12 md:left-20 md:right-20">
            <div className="flex items-center gap-2.5">
              {HERO_SLIDES.map((slide, index) => <button key={slide.highlight} type="button" aria-label={`Show slide ${index + 1}`} onClick={() => setCurrentSlide(index)} className={`h-1.5 rounded-full transition-all duration-500 ${index === currentSlide ? 'w-10 bg-[#e5c67d] shadow-[0_0_16px_rgba(229,198,125,0.8)]' : 'w-3 bg-white/30 hover:bg-white/70'}`} />)}
            </div>
            <div className="hidden w-40 sm:block">
              <div className="mb-2 flex justify-between text-[8px] font-black uppercase tracking-[0.18em] text-white/35"><span>Collection</span><span>{currentSlide + 1} of {HERO_SLIDES.length}</span></div>
              <div className="h-px overflow-hidden bg-white/20"><div className="h-full bg-[#e5c67d] transition-all duration-700" style={{ width: `${((currentSlide + 1) / HERO_SLIDES.length) * 100}%` }} /></div>
            </div>
          </div>
        </section>

        {topDesigns.length > 0 && (
          <section className="relative z-20 mx-2 -mt-16 mb-14 rounded-[1.75rem] border border-white/10 bg-[#111]/90 p-5 shadow-[0_24px_75px_rgba(0,0,0,0.55)] backdrop-blur-2xl sm:mx-8 sm:-mt-20 sm:p-7 lg:mx-14">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#e5c67d]">The weekly edit</p>
                <h2 className="mt-1 flex items-center gap-2 font-serif text-2xl"><Flame size={20} className="text-rose-400" /> Trending designs</h2>
              </div>
              <div className="flex gap-2">
                <button type="button" aria-label="Previous designs" onClick={() => scrollCarousel('left')} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-white/60 transition hover:border-[#e5c67d] hover:bg-[#e5c67d] hover:text-black"><ChevronLeft size={17} /></button>
                <button type="button" aria-label="Next designs" onClick={() => scrollCarousel('right')} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-white/60 transition hover:border-[#e5c67d] hover:bg-[#e5c67d] hover:text-black"><ChevronRight size={17} /></button>
              </div>
            </div>
            <div ref={carouselRef} className="flex snap-x gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-5">
              {topDesigns.map((design, idx) => <button key={design.id || idx} type="button" onClick={() => navigate(`/creator/showcase/${design.slug}`)} className="group min-w-[235px] snap-start text-left sm:min-w-[300px]"><div className="relative h-40 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] sm:h-52">{design.watermarked_preview_url ? <img src={design.watermarked_preview_url} alt={design.title || 'Design preview'} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" /> : <Sparkles size={27} className="absolute inset-0 m-auto text-white/15" />}<div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" /><span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[9px] font-black tracking-wider text-[#f1d995] backdrop-blur-md"><Star size={10} fill="currentColor" /> {parseFloat(design.avg_rating || 5).toFixed(1)}</span><span className="absolute bottom-3 right-3 grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-white/10 text-white opacity-0 backdrop-blur-md transition group-hover:opacity-100"><ArrowRight size={14} /></span></div><p className="mt-3 truncate font-serif text-base text-white/90 transition group-hover:text-[#e5c67d]">{design.title}</p><p className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">By {design.owner_name || design.designer_name || 'Anonymous'}</p></button>)}
            </div>
          </section>
        )}

        <section className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] xl:gap-12">
          <div className="min-w-0">
            <div className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#e5c67d]">The inspiration directory</p>
                <h2 className="mt-2 font-serif text-3xl sm:text-4xl">Discover what&apos;s next.</h2>
              </div>
              <label className="relative block w-full xl:w-[360px]"><span className="sr-only">Search the inspiration directory</span><Search className="absolute left-5 top-1/2 -translate-y-1/2 text-white/35" size={16} /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search concepts or designers" className="w-full rounded-full border border-white/10 bg-white/[0.04] py-3.5 pl-12 pr-5 text-sm text-white outline-none transition placeholder:text-white/28 focus:border-[#e5c67d] focus:bg-white/[0.07]" /></label>
            </div>
            <div className="mb-8 flex flex-wrap gap-2">{CATEGORIES.map((category) => <button key={category} type="button" onClick={() => setSelectedCategory(category)} className={`rounded-full px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.14em] transition ${selectedCategory === category ? 'bg-[#e5c67d] text-black shadow-[0_0_24px_rgba(229,198,125,0.25)]' : 'border border-white/10 bg-white/[0.03] text-white/48 hover:border-white/25 hover:text-white'}`}>{category}</button>)}</div>

            {error && <div className="mb-7 flex items-center gap-3 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-5 py-4 text-sm text-rose-200"><ShieldAlert size={18} /> {error}</div>}
            {loading ? <div className="flex min-h-[380px] flex-col items-center justify-center gap-4"><div className="relative"><div className="absolute inset-0 rounded-full border-t-2 border-[#e5c67d] animate-spin" /><Loader2 className="animate-spin text-white/20" size={44} /></div><span className="text-[10px] font-black uppercase tracking-[0.28em] text-white/45">Curating the edit</span></div> : items.length === 0 ? <div className="flex min-h-[380px] flex-col items-center justify-center rounded-[2rem] border border-dashed border-white/15 bg-white/[0.02] px-6 text-center"><Sparkles className="mb-5 text-[#e5c67d]/60" size={38} /><p className="font-serif text-2xl italic">No portfolios found.</p><p className="mt-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Adjust your search parameters.</p></div> : <div className="columns-1 gap-5 space-y-5 sm:columns-2 xl:columns-3">{items.map((item, index) => {
              const dynamicRatio = aspectRatios[index % aspectRatios.length];
              const ownerId = String(item.owner_id || item.designer_id);
              const isOwnItem = ownerId === currentUserId;
              return (
                <article key={item.id || index} className="group relative mb-5 break-inside-avoid overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#111] shadow-[0_14px_35px_rgba(0,0,0,0.32)] transition duration-500 hover:-translate-y-1.5 hover:border-[#e5c67d]/55 hover:shadow-[0_24px_55px_rgba(0,0,0,0.55)]">
                  <div onClick={() => navigate(`/creator/showcase/${item.slug}`)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') navigate(`/creator/showcase/${item.slug}`); }} role="button" tabIndex={0} className="relative cursor-pointer overflow-hidden" style={{ aspectRatio: dynamicRatio }}>
                    {item.watermarked_preview_url ? <img src={item.watermarked_preview_url} alt={item.title || 'Design preview'} className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.06]" /> : <div className="flex h-full w-full items-center justify-center bg-white/[0.03]"><Sparkles size={32} className="text-white/15" /></div>}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/15 to-transparent opacity-75 transition group-hover:opacity-100" />
                    <div className="absolute inset-x-0 bottom-0 translate-y-3 p-5 opacity-0 transition duration-500 group-hover:translate-y-0 group-hover:opacity-100">
                      <h3 className="truncate font-serif text-xl text-white">{item.title}</h3>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-6 w-6 overflow-hidden rounded-full border border-white/20 bg-white/10">
                          {item.owner_avatar || item.designer_avatar ? <img src={item.owner_avatar || item.designer_avatar} alt="" className="h-full w-full object-cover" /> : <User size={12} className="m-auto mt-[5px] text-white/55" />}
                        </div>
                        <p className="truncate text-[9px] font-black uppercase tracking-[0.15em] text-white/70">{item.owner_name || item.designer_name || 'Anonymous'}</p>
                      </div>
                      
                      {/* 🚀 FIXED: Grid columns adapt based on whether Book button is present */}
                      <div className={`mt-5 grid gap-2.5 ${isOwnItem ? 'grid-cols-2' : 'grid-cols-3'}`}>
                        <span className="rounded-xl border border-white/15 bg-white/10 py-3 text-center text-[9px] font-black uppercase tracking-[0.16em] text-white backdrop-blur-md">Details</span>
                        
                        {/* 🚀 FIXED: Remix Button Navigates to Studio */}
                        <button 
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            // Ensure this URL perfectly matches your Route path for the CAD Studio
                            navigate(`/creator/sketch?remix=${item.slug}`); 
                          }} 
                          className="flex items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 py-3 text-[9px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-white/20"
                        >
                          <Edit2 size={12} /> Remix
                        </button>

                        {!isOwnItem && (
                          <Link to={`/creator/bookings/new?designer_id=${ownerId}&design_id=${item.id}&budget=${item.starting_price || item.base_price || 0}`} onClick={(event) => event.stopPropagation()} className="flex items-center justify-center gap-1.5 rounded-xl bg-[#e5c67d] py-3 text-[9px] font-black uppercase tracking-[0.16em] text-black transition hover:bg-white">
                            <Zap size={12} /> Book
                          </Link>
                        )}
                      </div>

                    </div>
                  </div>
                </article>
              );
            })}</div>}
          </div>

          <aside className="h-fit rounded-[2rem] border border-white/10 bg-[#111]/80 p-6 shadow-[0_18px_50px_rgba(0,0,0,0.32)] backdrop-blur-xl lg:sticky lg:top-8">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#e5c67d]">The network</p>
            <h2 className="mt-2 flex items-center gap-2 font-serif text-2xl"><Crown size={20} className="text-[#e5c67d]" /> Top visionaries</h2>
            <p className="mt-3 border-b border-white/10 pb-6 text-sm leading-6 text-white/45">Meet the designers earning the strongest community response.</p>
            <div className="mt-5 space-y-2">{topDesigners.length === 0 && !loading ? <p className="py-8 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">No data available</p> : topDesigners.map((designer, idx) => <button key={designer.id || idx} type="button" onClick={() => navigate(`/directory/${designer.id || designer._id}`)} className="group flex w-full items-center justify-between gap-3 rounded-2xl p-3 text-left transition hover:bg-white/[0.06]"><div className="flex min-w-0 items-center gap-3"><div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/10"><img src={designer.profile_image_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${designer.id}`} alt="" className="h-full w-full object-cover" />{idx === 0 && <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-[#e5c67d] text-[8px] font-black text-black">1</span>}</div><div className="min-w-0"><p className="truncate font-serif text-base text-white transition group-hover:text-[#e5c67d]">{designer.full_name || designer.username || 'Visionary'}</p><p className="mt-1 text-[9px] font-black uppercase tracking-[0.14em] text-white/40">{designer.total_completed_bookings || 0} bookings</p></div></div><ChevronRight size={16} className="shrink-0 text-white/35 transition group-hover:translate-x-0.5 group-hover:text-[#e5c67d]" /></button>)}</div>
          </aside>
        </section>
      </main>
    </div>
  );
}