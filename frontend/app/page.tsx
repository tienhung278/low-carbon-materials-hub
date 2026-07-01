import CarbonComparisonApp from "./components/CarbonComparisonApp";
import { loadProducts } from "../lib/data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const products = await loadProducts();

  return <CarbonComparisonApp products={products} />;
}
