import CreatorShowcase from "../Creator/CreatorShowcase";

// Both roles browse the same published feed; actions and detail routes stay role-specific.
export default function DesignerMarketplace() {
  return <CreatorShowcase audience="designer" />;
}
