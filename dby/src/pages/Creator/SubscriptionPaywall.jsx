import { Navigate } from "react-router-dom";

export default function SubscriptionPaywall({ isOpen }) {
  return isOpen ? <Navigate to="/creator/wallet#subscription" replace /> : null;
}
