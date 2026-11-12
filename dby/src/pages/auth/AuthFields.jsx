import React, { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export function AuthField({ label, hint, action, id, type = "text", className = "", ...props }) {
  const [visible, setVisible] = useState(false);
  const password = type === "password";
  return <div className="auth-field">
    <div className="auth-label-row"><label htmlFor={id}>{label}</label>{action}</div>
    <div className="auth-control-wrap">
      <input {...props} id={id} type={password && visible ? "text" : type}
        aria-describedby={hint ? `${id}-help` : undefined}
        className={`auth-control ${password ? "auth-password" : ""} ${className}`} />
      {password && <button type="button" className="auth-toggle" disabled={props.disabled}
        aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`} aria-pressed={visible}
        onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>}
    </div>
    {hint && <p className="auth-help" id={`${id}-help`}>{hint}</p>}
  </div>;
}

export function AuthNotice({ children, error = false }) {
  const ref = useRef(null);
  useEffect(() => { if (error && children) ref.current?.focus(); }, [children, error]);
  if (!children) return null;
  return <div ref={ref} tabIndex={error ? -1 : undefined} role={error ? "alert" : "status"}
    className={`auth-notice ${error ? "auth-notice-error" : ""}`}>{children}</div>;
}

export function AuthSubmit({ busy, children, busyLabel, disabled }) {
  return <button className="auth-button" type="submit" disabled={busy || disabled} aria-busy={busy}>
    {busy && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}{busy ? busyLabel : children}
  </button>;
}
