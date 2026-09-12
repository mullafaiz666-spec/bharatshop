import StorePage from "./store/page";

// Customer-facing storefront is the public home page.
// The operator dashboard remains available at /dashboard.
export default function RootPage() {
  return <StorePage />;
}
