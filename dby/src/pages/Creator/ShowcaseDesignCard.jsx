import { Link } from "react-router-dom";
import { Star, User } from "lucide-react";
import "./ShowcaseDesignCard.css";

export default function ShowcaseDesignCard({ item, ownerName, ownerAvatar, designerOwned, rating, bookingUrl, onOpen, children }) {
  const title = item.title || "Untitled design";
  return (
    <article className="showcase-design-card">
      <button type="button" className="showcase-design-image" disabled={!item.slug}
        aria-label={`View ${title}`} onClick={() => onOpen(item.slug)}>
        {children}
      </button>
      <div className="showcase-design-info">
        <p className="showcase-design-category" title={item.category_name || item.style_category}>
          {item.category_name || item.style_category || "Creative work"}
        </p>
        <h3 className="showcase-design-title">
          <button type="button" onClick={() => onOpen(item.slug)} disabled={!item.slug} title={title}>{title}</button>
        </h3>
        <div className="showcase-design-owner">
          <span className="showcase-design-avatar" aria-hidden="true">
            {ownerAvatar ? <img src={ownerAvatar} alt="" loading="lazy" decoding="async" /> : <User size={14} />}
          </span>
          <div className="showcase-design-byline">
            <p title={ownerName}>{ownerName}</p>
            <span>{designerOwned ? "Designer" : "Creator"}</span>
          </div>
          {rating > 0 && <span className="showcase-design-rating" aria-label={`Rated ${rating.toFixed(1)} out of 5`}>
            <Star size={12} fill="currentColor" aria-hidden="true" />{rating.toFixed(1)}
          </span>}
        </div>
        <div className="showcase-design-actions">
          <button type="button" disabled={!item.slug} onClick={() => onOpen(item.slug)}>View design</button>
          {bookingUrl && <Link to={bookingUrl} aria-label={`Book ${ownerName}`}>Book</Link>}
        </div>
      </div>
    </article>
  );
}
