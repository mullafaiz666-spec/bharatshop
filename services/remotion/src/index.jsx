import React from "react";
import { Composition, registerRoot } from "remotion";
import { ProductAd } from "./ProductAd";

const Root = () => (
  <Composition
    id="ProductAd"
    component={ProductAd}
    durationInFrames={450}
    fps={30}
    width={1080}
    height={1080}
    defaultProps={{
      title: "BharatShop",
      subtitle: "AI-picked product",
      cta: "Shop now",
      imageUrl: "",
      accent: "#f97316",
    }}
  />
);

registerRoot(Root);
