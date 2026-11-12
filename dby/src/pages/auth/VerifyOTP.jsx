import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import API from "../../api/axios";
import AuthLayout from "../../Layouts/AuthLayout";
import { AuthField, AuthNotice, AuthSubmit } from "./AuthFields";
import { validEmail, readSession, saveSession } from "./authFlow";
import { useAuth } from "../../context/AuthContext.helpers.js";
const EMAIL_KEY = "pending_verification_email";

export default function VerifyOTP() {
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState(() => String(location.state?.email || readSession(EMAIL_KEY)).trim().toLowerCase());
  const { login } = useAuth();
  const pendingAccess = useRef(null);
  const [loginChallenge] = useState(() => {
    try { const saved = JSON.parse(readSession("pending_verification_login") || "{}"); return saved.email === email ? saved.token : ""; }
    catch { return ""; }
  });
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(location.state?.codeRequested ? 30 : 0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(location.state?.message || "");
  const [verified, setVerified] = useState(false);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  const handleEmail = event => {
    pendingAccess.current = null; setEmail(event.target.value); setOtp(""); setError(""); setNotice("");
    saveSession(EMAIL_KEY, event.target.value.trim().toLowerCase());
    navigate(location.pathname + location.search, { replace: true, state: { ...location.state, email: event.target.value, message: "" } });
  };
  const failure = (err, fallback) => {
    setError(err.response?.data?.message || (err.response ? fallback : "Unable to connect. Check your connection and try again."));
  };
  const verify = async event => {
    event.preventDefault();
    if (loading || resending || verified) return;
    setError(""); setNotice("");
    if (!validEmail(email)) { setError("Enter the email address you registered with."); return; }
    if (!/^\d{6}$/.test(otp)) { setError("Enter the six-digit verification code."); return; }
    setLoading(true);
    try {
      if (!pendingAccess.current) {
        const { data } = await API.post("/auth/verify-otp", { email: email.trim().toLowerCase(), otp,
          ...(loginChallenge ? { login_challenge: loginChallenge } : {}) });
        if (data?.status !== "success") throw new Error("Invalid response");
        if (!data.token) {
          saveSession(EMAIL_KEY, ""); saveSession("pending_verification_login", ""); setVerified(true); return;
        }
        pendingAccess.current = data.token;
      }
      const { data: session } = await API.get("/auth/me", { headers: { Authorization: "Bearer " + pendingAccess.current } });
      if (session?.status !== "success" || !session.data?.id) throw new Error("Unable to load account");
      login(session.data, pendingAccess.current);
      saveSession(EMAIL_KEY, ""); saveSession("pending_verification_login", "");
      navigate(session.data.role === "creator" ? "/creator/showcase" : session.data.role === "designer" ? "/designer/explore" : "/unauthorized", { replace: true });
    } catch (err) { failure(err, "We couldn’t verify this code. Try again or request a new one."); }
    finally { setLoading(false); }
  };
  const resend = async () => {
    if (loading || resending || cooldown || verified) return;
    setError(""); setNotice("");
    if (!validEmail(email)) { setError("Enter your registered email address first."); return; }
    setResending(true);
    try {
      const { data } = await API.post("/auth/resend-otp", { email: email.trim().toLowerCase() });
      if (data?.status !== "success") throw new Error("Invalid response");
      saveSession(EMAIL_KEY, email.trim().toLowerCase()); setOtp(""); setCooldown(30);
      setNotice("If this email needs verification, a new code has been requested. Check your inbox and spam folder, and use the latest code.");
    } catch (err) {
      if (err.response?.status === 429) setCooldown(30);
      failure(err, "We couldn’t request a new code. Please try again.");
    } finally { setResending(false); }
  };
  if (verified) return <AuthLayout title="Email verified" subtitle="You can now sign in to your account.">
    <div className="auth-stack"><AuthNotice>Your email verification is complete.</AuthNotice>
      <Link to="/login" replace state={{ email: email.trim().toLowerCase() }} className="auth-button">Continue to sign in</Link>
    </div>
  </AuthLayout>;
  return <AuthLayout title="Verify your email" subtitle="Enter the code from your verification email." step="2 of 2 · Email verification">
    <form onSubmit={verify} className="auth-form" noValidate aria-busy={loading || resending}>
      <AuthField id="verify-email" label="Email address" name="email" type="email" value={email} onChange={handleEmail} autoComplete="email" inputMode="email" placeholder="you@example.com" required disabled={loading || resending || Boolean(loginChallenge)} />
      <AuthField id="verify-code" label="Verification code" name="otp" value={otp} onChange={event => { setOtp(event.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} onPaste={event => { event.preventDefault(); setOtp(event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)); setError(""); }} autoComplete="one-time-code" inputMode="numeric" maxLength={6} className="auth-code" hint="Enter all six digits. You can paste the code. It expires after 10 minutes." required disabled={loading || resending} />
      <AuthNotice error>{error}</AuthNotice><AuthNotice>{notice}</AuthNotice>
      <AuthSubmit busy={loading} disabled={resending} busyLabel="Verifying…">{loginChallenge ? "Verify and sign in" : "Verify email"}</AuthSubmit>
      <div className="auth-row"><span className="auth-help">Didn’t receive a code?</span><button type="button" className="auth-link" onClick={resend} disabled={loading || resending || cooldown > 0}>
        {resending ? "Requesting code…" : cooldown ? "Resend in " + cooldown + "s" : "Resend code"}
      </button></div>
      <p className="auth-help">Check your spam folder and confirm the email address above.</p>
      <p className="auth-divider"><Link to="/login" state={{ email }} className="auth-link">Back to sign in</Link></p>
    </form>
  </AuthLayout>;
}
