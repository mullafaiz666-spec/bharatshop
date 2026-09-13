import MarketplaceHome from "@/components/storefront/MarketplaceHome";
import StorefrontAgentSignal from "@/components/storefront/StorefrontAgentSignal";

export default function RootPage() {
  return (
    <>
      <StorefrontAgentSignal />
      <MarketplaceHome />
    </>
  );
}
