import React from "react";
import { Link } from "react-router-dom";
import "./AuthLayout.css";
export default function AuthLayout({ children, title, subtitle, step }) {
  return <main className="auth-page"><div className="auth-shell">
    <Link to="/login" className="auth-brand" aria-label="DesignByYou sign in"><span className="auth-brand-mark" aria-hidden="true">dby.</span><span>DesignByYou</span></Link>
    <section className="auth-card" aria-labelledby="auth-title"><header className="auth-heading">
      {step && <p className="auth-step">{step}</p>}<h1 id="auth-title">{title}</h1>
      {subtitle && <p className="auth-subtitle">{subtitle}</p>}</header>{children}</section>
    <p className="auth-footnote">Your space to create and collaborate.</p>
  </div></main>;
}
